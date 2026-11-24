// Draft only. Production activation requires reviewed deployment and explicit environment gate.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const origin="https://happysugar-system.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type","Vary":"Origin","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(auth))return reply(401,{error:"login_required"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!key)return reply(503,{error:"service_unavailable"});
 const token=auth.replace(/^Bearer\s+/i,"");
 const client=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:identity,error:ae}=await client.auth.getUser(token);
 if(ae||!identity.user?.id||!identity.user.email_confirmed_at)return reply(401,{error:"invalid_session"});
 const {data:staff,error:se}=await client.rpc("gf_staff_access_self");
 if(se)return reply(503,{error:"authorization_unavailable"});
 if((Array.isArray(staff)?staff[0]:staff)?.access_granted!==true)return reply(403,{error:"staff_access_denied"});
 let p;
 try{const raw=await req.text();if(raw.length>32768)return reply(413,{error:"request_too_large"});p=JSON.parse(raw);}catch{return reply(400,{error:"invalid_json"});}
 if(url!=="https://tgxrnrqxafytyqfwwsag.supabase.co"||Deno.env.get("GF_VEHICLE_PRODUCTION_WRITE_ENABLED")!=="true")return reply(503,{error:"writer_disabled"});
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!serviceKey)return reply(503,{error:"service_unavailable"});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const allowed=new Set(["GPS有無","代車貸出先","代車貸出エリア","代車貸出備考"]);
 const object=(v:unknown)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
 if(!object(p))return reply(400,{error:"invalid_request"});
 if(p.action==="status"){
  if(typeof p.request_id!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.request_id))return reply(400,{error:"invalid_request_id"});
  const {data,error}=await admin.from("gf_vehicle_save_queue").select("request_id,vehicle_id,state,verified_fields,verified_at").eq("actor_id",identity.user.id).eq("request_id",p.request_id).maybeSingle();
  if(error)return reply(503,{error:"status_unavailable"});
  if(!data)return reply(404,{error:"request_not_found"});
  return reply(200,{...data,vehicleId:data.vehicle_id});
 }
 if(p.action!=="save"||typeof p.request_id!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.request_id)||typeof p.vehicleId!=="string"||!/^V[0-9]{6}$/.test(p.vehicleId)||p.vehicleId==="V999999"||!object(p.changes)||!object(p.expected))return reply(400,{error:"invalid_request"});
 const keys=Object.keys(p.changes);
 if(!keys.length||keys.length!==Object.keys(p.expected).length||keys.some(k=>!allowed.has(k)||!Object.prototype.hasOwnProperty.call(p.expected,k)))return reply(400,{error:"invalid_fields"});
 for(const k of keys){
  const a=p.expected[k],b=p.changes[k];
  if(a===b)return reply(400,{error:"unchanged_field"});
  for(const v of [a,b])if(k==="GPS有無"?typeof v!=="boolean":typeof v!=="string"||v.length>1000||/^\s*[=+@-]/.test(v))return reply(400,{error:"invalid_value"});
 }
 // Never report a successful save until the canonical sheet writer is connected and verified.
 const {data,error}=await admin.rpc("gf_vehicle_save_enqueue",{p_actor:identity.user.id,p_request:p.request_id,p_vehicle:p.vehicleId,p_expected:p.expected,p_changes:p.changes});
 if(error)return reply(error.code==="P0001"||error.code==="23505"?409:503,{error:"enqueue_unconfirmed"});
 return reply(202,data);
});
