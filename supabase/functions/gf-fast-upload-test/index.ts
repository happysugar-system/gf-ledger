// TEST ONLY — not deployed. Requires SQL migration, private bucket, and
// GF_FAST_INTAKE_SECRET in Supabase Secrets; matching GAS script property.
// Requires service_role server-side; never put it in browser code.
// Existing admin-only test functions remain unchanged.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { verifyGasEnvelope, requestKeyHash } from "../_shared/gf-fast-gas-auth.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const secret = Deno.env.get("GF_FAST_INTAKE_SECRET") ?? "";
const db = createClient(url,key,{auth:{persistSession:false}});
const bucket="gf-secure-intake-staging";
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
const sha=async (b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b)),v=>v.toString(16).padStart(2,"0")).join("");
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");
const allowed=["license_front","license_back","resident_pdf"] as const;
const isMagic=(bytes:Uint8Array,kind:string,mime:string)=>{
 const pdf=bytes.length>5 && new TextDecoder().decode(bytes.subarray(0,5))==="%PDF-";
 const jpg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 return kind==="resident_pdf" ? mime==="application/pdf"&&pdf :
   (mime==="image/jpeg"&&jpg)||(mime==="image/png"&&png);
};
Deno.serve(async req=>{
 if(req.method!=="POST")return json(405,{error:"method_not_allowed"});
 if(!secret||secret.length<48||!url||!key)return json(503,{error:"not_configured"});
 const action=new URL(req.url).searchParams.get("action");
 if(action==="issue"){
   // Server-to-server only. Never call from the public browser.
   let p:unknown;try{p=await req.json()}catch{return json(400,{error:"bad_json"})}
   if(!p||typeof p!=="object")return json(400,{error:"bad_request"});
   const b=p as Record<string,unknown>;
   if(!await verifyGasEnvelope(b,secret))return json(401,{error:"invalid_signature"});
   if(!["mail","upload"].includes(String(b.residentMethod)))return json(400,{error:"invalid_method"});\n   // residentMethod is included in the GAS HMAC signature, never trusted separately.
   const hash=await requestKeyHash(String(b.requestId));
   const token=randomToken();
   const tokenHash=await sha(new TextEncoder().encode(token));
   // nonce uniqueness and request id uniqueness are enforced by DB constraints.
   // On retry, refuse to issue another token: never disclose an existing session.
   const {data,error}=await db.from("gf_fast_upload_sessions_test").insert({
      request_key_hash:hash,gas_receipt:b.receipt,nonce:b.nonce,token_hash:tokenHash,
      resident_method:b.residentMethod,
      expires_at:new Date(Date.now()+10*60*1000).toISOString()
   }).select("id").single();
   if(error)return json(error.code==="23505"?409:503,{error:error.code==="23505"?"already_issued":"issue_failed"});
   return json(201,{session_id:data.id,upload_token:token,expires_in_seconds:600});
 }
 if(action==="upload"){
   const token=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
   if(!/^[0-9a-f]{64}$/.test(token))return json(401,{error:"token_required"});
   const tokenHash=await sha(new TextEncoder().encode(token));
   const {data:session,error:se}=await db.from("gf_fast_upload_sessions_test")
      .select("id,resident_method,expires_at").eq("token_hash",tokenHash).maybeSingle();
   if(se||!session)return json(401,{error:"invalid_token"});
   if(new Date(session.expires_at).getTime()<=Date.now())return json(401,{error:"expired"});
   const kind=req.headers.get("x-document-type")||"";
   if(!allowed.includes(kind as typeof allowed[number])||(kind==="resident_pdf"&&session.resident_method!=="upload"))
     return json(400,{error:"invalid_document_type"});
   const mime=(req.headers.get("content-type")||"").split(";")[0].toLowerCase();
   const max=kind==="resident_pdf"?4_000_000:2_000_000;
   if(Number(req.headers.get("content-length")||0)>max*1.4)return json(413,{error:"too_large"});
   const bytes=new Uint8Array(await req.arrayBuffer());
   if(bytes.length<100||bytes.length>max)return json(413,{error:"invalid_size"});
   if(!isMagic(bytes,kind,mime))return json(415,{error:"invalid_signature"});
   const digest=await sha(bytes);
   const path="fast-test/"+session.id+"/"+kind;
   const {data:prior,error:pe}=await db.from("gf_fast_upload_documents_test")
      .select("sha256,bytes").eq("session_id",session.id).eq("document_type",kind).maybeSingle();
   if(pe)return json(503,{error:"metadata_lookup_failed"});
   if(prior)return json(prior.sha256===digest&&prior.bytes===bytes.length?200:409,
      prior.sha256===digest&&prior.bytes===bytes.length?{ok:true,duplicate:true}:{error:"document_conflict"});
   const {error:ue}=await db.storage.from(bucket).upload(path,bytes,{contentType:mime,upsert:false});
   if(ue)return json(409,{error:"upload_conflict_or_failure"});
   const {data:download,error:de}=await db.storage.from(bucket).download(path);
   if(de||!download)return json(503,{error:"verification_failed"});
   const saved=new Uint8Array(await download.arrayBuffer());
   if(saved.length!==bytes.length||await sha(saved)!==digest)return json(503,{error:"checksum_mismatch"});
   const {error:me}=await db.from("gf_fast_upload_documents_test").insert({
      session_id:session.id,document_type:kind,object_path:path,sha256:digest,bytes:bytes.length
   });
   if(me)return json(503,{error:"metadata_failed"});
   return json(201,{ok:true,document_type:kind,verified:true});
 }
 if(action==="status"){
   const token=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
   if(!/^[0-9a-f]{64}$/.test(token))return json(401,{error:"token_required"});
   const tokenHash=await sha(new TextEncoder().encode(token));
   const {data:s,error:se}=await db.from("gf_fast_upload_sessions_test")
     .select("id,resident_method,expires_at").eq("token_hash",tokenHash).maybeSingle();
   if(se||!s||new Date(s.expires_at).getTime()<=Date.now())return json(401,{error:"invalid_or_expired"});
   const {data:docs,error:de}=await db.from("gf_fast_upload_documents_test")
     .select("document_type").eq("session_id",s.id);
   if(de)return json(503,{error:"lookup_failed"});
   const expected=s.resident_method==="upload"?["license_front","license_back","resident_pdf"]:["license_front","license_back"];
   const present=new Set((docs||[]).map(x=>x.document_type));
   return json(200,{ok:true,documents_verified:expected.every(x=>present.has(x)),
      uploaded_types:[...present]});
 }
 return json(404,{error:"unknown_action"});
});
