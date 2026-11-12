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
/** Read uploads with a hard byte cap even when Content-Length is absent or false. */
async function readBounded(req:Request,max:number):Promise<Uint8Array|null>{
 if(!req.body)return null;
 const reader=req.body.getReader();
 const chunks:Uint8Array[]=[];
 let total=0;
 try{
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     total+=value.byteLength;
     if(total>max){await reader.cancel("size_limit");return null;}
     chunks.push(value);
   }
 }finally{reader.releaseLock();}
 const result=new Uint8Array(total);
 let offset=0;
 for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}
 return result;
}
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
   if(!["mail","upload"].includes(String(b.residentMethod)))return json(400,{error:"invalid_method"});
   // residentMethod is included in the GAS HMAC signature, never trusted separately.
   const hash=await requestKeyHash(String(b.requestId));
   // Consume each signed nonce once, including failed/retried session issuance.
   const {error:replayError}=await db.from("gf_fast_upload_nonces_test").insert({nonce:b.nonce});
   if(replayError)return json(replayError.code==="23505"?409:503,{error:replayError.code==="23505"?"replayed_request":"nonce_store_failed"});
   const token=randomToken();
   const tokenHash=await sha(new TextEncoder().encode(token));
   // First issue: insert. On lost response: a NEW signed nonce can rotate
   // the upload token for the SAME receipt, request ID and resident method.
   const {data,error}=await db.from("gf_fast_upload_sessions_test").insert({
      request_key_hash:hash,gas_receipt:b.receipt,nonce:b.nonce,token_hash:tokenHash,
      resident_method:b.residentMethod,
      expires_at:new Date(Date.now()+10*60*1000).toISOString()
   }).select("id").single();
   if(!error)return json(201,{session_id:data.id,upload_token:token,expires_in_seconds:600});
   if(error.code!=="23505")return json(503,{error:"issue_failed"});
   const {data:existing,error:lookupError}=await db.from("gf_fast_upload_sessions_test")
     .select("id,gas_receipt,resident_method").eq("request_key_hash",hash).maybeSingle();
   if(lookupError||!existing||existing.gas_receipt!==b.receipt||existing.resident_method!==b.residentMethod)
     return json(409,{error:"session_identity_conflict"});
   const {data:renewed,error:renewError}=await db.from("gf_fast_upload_sessions_test")
     .update({nonce:b.nonce,token_hash:tokenHash,expires_at:new Date(Date.now()+10*60*1000).toISOString()})
     .eq("id",existing.id).select("id").single();
   if(renewError||!renewed)return json(503,{error:"resume_failed"});
   return json(200,{session_id:renewed.id,upload_token:token,expires_in_seconds:600,resumed:true});
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
   const bytes=await readBounded(req,max);\n   if(!bytes)return json(413,{error:"invalid_size"});
   if(bytes.length<100||bytes.length>max)return json(413,{error:"invalid_size"});
   if(!isMagic(bytes,kind,mime))return json(415,{error:"invalid_signature"});
   const digest=await sha(bytes);
   const path="fast-test/"+session.id+"/"+kind;
   const {data:prior,error:pe}=await db.from("gf_fast_upload_documents_test")
      .select("sha256,bytes").eq("session_id",session.id).eq("document_type",kind).maybeSingle();
   if(pe)return json(503,{error:"metadata_lookup_failed"});
   if(prior){
     if(prior.sha256!==digest||prior.bytes!==bytes.length)return json(409,{error:"document_conflict"});
     const {data:stored,error:storedError}=await db.storage.from(bucket).download(path);
     if(storedError||!stored)return json(503,{error:"stored_file_unavailable"});
     const content=new Uint8Array(await stored.arrayBuffer());
     if(content.length!==bytes.length||await sha(content)!==digest)return json(409,{error:"stored_file_mismatch"});
     return json(200,{ok:true,duplicate:true,verified:true,document_type:kind});
   }
   const {error:ue}=await db.storage.from(bucket).upload(path,bytes,{contentType:mime,upsert:false});
   if(ue){
     // Retry recovery: a previous attempt may have saved the file but failed
     // before writing metadata. Never overwrite or accept mismatching bytes.
     const {data:orphan,error:oe}=await db.storage.from(bucket).download(path);
     if(oe||!orphan)return json(503,{error:"upload_failed"});
     const stored=new Uint8Array(await orphan.arrayBuffer());
     if(stored.length!==bytes.length||await sha(stored)!==digest)
       return json(409,{error:"existing_file_conflict"});
   }
   const {data:download,error:de}=await db.storage.from(bucket).download(path);
   if(de||!download)return json(503,{error:"verification_failed"});
   const saved=new Uint8Array(await download.arrayBuffer());
   if(saved.length!==bytes.length||await sha(saved)!==digest)return json(503,{error:"checksum_mismatch"});
   const {error:me}=await db.from("gf_fast_upload_documents_test").insert({
      session_id:session.id,document_type:kind,object_path:path,sha256:digest,bytes:bytes.length
   });
   if(me){
     // A concurrent identical request may have inserted metadata first.
     if(me.code==="23505"){
       const {data:concurrent}=await db.from("gf_fast_upload_documents_test")
         .select("sha256,bytes").eq("session_id",session.id).eq("document_type",kind).maybeSingle();
       if(concurrent?.sha256===digest&&concurrent.bytes===bytes.length)
         return json(200,{ok:true,document_type:kind,verified:true,duplicate:true});
       return json(409,{error:"document_conflict"});
     }
     return json(503,{error:"metadata_failed"});
   }
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
