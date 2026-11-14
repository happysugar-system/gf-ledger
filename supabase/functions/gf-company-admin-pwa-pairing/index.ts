// Isolated draft: NOT deployed. Requires reviewed SQL migration.
// This API handles device pairing only; existing dashboard API stays untouched.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const ORIGIN = "https://happysugar-system.github.io";
const CORS = {"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const reply = (status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:CORS});
const randomHex=(n:number)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,"0")).join("");
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,"0")).join("");
const fail=()=>reply(401,{error:"認証できませんでした"});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:CORS});
 if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
 if(req.headers.get("Origin")!==ORIGIN)return reply(403,{error:"Origin denied"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const channel=Deno.env.get("GF_DEMO_LINE_LOGIN_CHANNEL_ID");
 if(!url||!key||!channel)return reply(503,{error:"Configuration unavailable"});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try {
  const b=await req.json(),action=b?.action;
  if(action==="begin"){
   // PWA generates a 32-byte verifier and retains it locally. Never put it in a URL.
   if(typeof b.verifier!=="string"||!/^[a-f0-9]{64}$/i.test(b.verifier))return reply(400,{error:"Invalid verifier"});
   const verifier_hash=await digest(b.verifier);
   const code=Array.from(crypto.getRandomValues(new Uint8Array(12)),v=>String(v%10)).join("");
   const code_hash=await digest(code);
   const {error}=await sb.from("gf_company_admin_pairings").insert({code_hash,verifier_hash});
   if(error)return reply(503,{error:"開始できませんでした。再試行してください"});
   return reply(200,{code,expires_seconds:300});
  }
  if(action==="authorize"){
   if(typeof b.code!=="string"||!/^[0-9]{12}$/.test(b.code))return fail();
   if(typeof b.line_id_token!=="string"||b.line_id_token.length<100||b.line_id_token.length>8192)return fail();
   const verify=await fetch("https://api.line.me/oauth2/v2.1/verify",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({id_token:b.line_id_token,client_id:channel}),signal:AbortSignal.timeout(10000)
   });
   if(!verify.ok)return fail();
   const id=await verify.json();
   if(id.iss!=="https://access.line.me"||id.aud!==channel||!/^U[0-9a-f]{32}$/i.test(id.sub||"")||!Number.isFinite(id.exp)||id.exp<=Date.now()/1000)return fail();
   const {data:admin,error:adminError}=await sb.from("gf_company_admin_identities").select("role,active").eq("line_user_id",id.sub).maybeSingle();
   if(adminError||!admin?.active||!["owner","manager"].includes(admin.role))return fail();
   const code_hash=await digest(b.code);
   // Atomic update prevents reuse and multiple approvals. No response reveals whether code exists.
   const {data:updated,error}=await sb.from("gf_company_admin_pairings").update({status:"approved",line_user_id:id.sub})
    .eq("code_hash",code_hash).eq("status","pending").gt("expires_at",new Date().toISOString())
    .select("id").maybeSingle();
   if(error||!updated)return fail();
   return reply(200,{ok:true});
  }
  if(action==="poll"){
   if(typeof b.verifier!=="string"||!/^[a-f0-9]{64}$/i.test(b.verifier))return fail();
   const verifier_hash=await digest(b.verifier);
   const {data:pair,error}=await sb.from("gf_company_admin_pairings").select("id,status,line_user_id,expires_at")
    .eq("verifier_hash",verifier_hash).maybeSingle();
   if(error||!pair||new Date(pair.expires_at).getTime()<=Date.now())return fail();
   if(pair.status==="pending")return reply(200,{status:"pending"});
   if(pair.status!=="approved"||!pair.line_user_id)return fail();
   const {data:admin}=await sb.from("gf_company_admin_identities").select("role,active").eq("line_user_id",pair.line_user_id).maybeSingle();
   if(!admin?.active||!["owner","manager"].includes(admin.role))return fail();
   const {data:consumed}=await sb.from("gf_company_admin_pairings").update({status:"consumed"})
    .eq("id",pair.id).eq("status","approved").select("id").maybeSingle();
   if(!consumed)return fail();
   const session=randomHex(32);
   const {error:saveError}=await sb.from("gf_company_admin_device_sessions").insert({token_hash:await digest(session),line_user_id:pair.line_user_id});
   if(saveError)return reply(503,{error:"セッションを作成できませんでした"});
   return reply(200,{status:"approved",session_token:session,expires_seconds:604800});
  }
  if(action==="check"||action==="logout"){
   if(typeof b.session_token!=="string"||!/^[a-f0-9]{64}$/i.test(b.session_token))return fail();
   const token_hash=await digest(b.session_token);
   const {data:s,error}=await sb.from("gf_company_admin_device_sessions").select("id,line_user_id")
    .eq("token_hash",token_hash).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
   if(error||!s)return fail();
   if(action==="logout"){
    await sb.from("gf_company_admin_device_sessions").update({revoked_at:new Date().toISOString()}).eq("id",s.id);
    return reply(200,{ok:true});
   }
   const {data:admin}=await sb.from("gf_company_admin_identities").select("role,active").eq("line_user_id",s.line_user_id).maybeSingle();
   if(!admin?.active||!["owner","manager"].includes(admin.role))return fail();
   return reply(200,{ok:true,role:admin.role});
  }
  return reply(400,{error:"Unknown action"});
 }catch(e){console.error("Pairing API failed",e instanceof Error?e.name:"Unknown");return reply(503,{error:"処理できませんでした"});}
});
