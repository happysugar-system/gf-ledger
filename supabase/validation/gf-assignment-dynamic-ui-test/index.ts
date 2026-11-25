// Demo-only staff endpoint. Worker revalidates the expected version against fresh server reads.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const headers={"access-control-allow-origin":"https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store","content-type":"application/json"};
const reply=(status:number,b:unknown)=>new Response(JSON.stringify(b),{status,headers});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const table="gf_assignment_dynamic_queue_test";
const fields="request_id,receipt_id,driver_id,vehicle_id,action,expected_version,state,verified_at,error_code";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply(405,{error:"method"});
 if(req.headers.get("origin")!==headers["access-control-allow-origin"])return reply(403,{error:"origin_not_allowed"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!key)return reply(503,{error:"demo_only"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(401,{error:"unauthorized"});
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.email_confirmed_at)return reply(401,{error:"unauthorized"});
 const email=(user.email||"").trim().toLowerCase();
 if(!email)return reply(403,{error:"forbidden"});
 const a=await db.from("gf_reception_access").select("role,enabled").eq("email",email).maybeSingle();
 if(a.error)return reply(503,{error:"access_check_failed"});
 if(a.data?.enabled!==true||!["owner","staff"].includes(a.data.role))return reply(403,{error:"forbidden"});
 let p;try{p=await req.json()}catch{return reply(400,{error:"json"})}
 if(!p||typeof p!=="object")return reply(400,{error:"invalid"});
 const operation=p.action==="version"?p.operation:p.action;
 const targetValid=["assign","cancel"].includes(operation)&&typeof p.receipt_id==="string"&&
   !!p.receipt_id&&p.receipt_id===p.receipt_id.trim()&&p.receipt_id.length<=150&&!/[\r\n]/.test(p.receipt_id)&&
   typeof p.driver_id==="string"&&/^D\d{6}$/.test(p.driver_id)&&typeof p.vehicle_id==="string"&&/^V9\d{5}$/.test(p.vehicle_id);
 const version=async()=>{
  const endpoint=Deno.env.get("GF_WAITING_GAS_URL")||"",secret=Deno.env.get("GF_WAITING_GAS_SECRET")||"";
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)||secret.length<32){
   return {status:503,error:"preview_not_configured"};
  }
  const action="gfa_assignment_preview_v1",issuedAt=Date.now(),encoder=new TextEncoder();
  const payload=[action,operation,p.receipt_id,p.driver_id,p.vehicle_id,issuedAt];
  try{
   const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
   const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(JSON.stringify(payload))));
   const signature=btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
   const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({action,operation,receiptId:p.receipt_id,driverId:p.driver_id,vehicleId:p.vehicle_id,issuedAt,signature}),
    signal:AbortSignal.timeout(15000)});
   if(!response.ok)return {status:503,error:"preview_unavailable"};
   const body=await response.json();
   if(body?.status===200&&typeof body.version==="string"&&/^[0-9a-f]{64}$/.test(body.version))return {status:200,version:body.version};
   if(body?.status===409)return {status:409,error:"assignment_review_required"};
  }catch(_){return {status:503,error:"preview_unavailable"};}
  return {status:503,error:"preview_unavailable"};
 };
 if(p.action==="version"){
  if(!targetValid)return reply(400,{error:"invalid"});
  const {status,...body}=await version();return reply(status,body);
 }
 if(!uuid(p.request_id))return reply(400,{error:"request_id"});
 const read=()=>db.from(table).select(fields).eq("request_id",p.request_id).eq("actor_id",user.id).maybeSingle();
 const prior=await read();if(prior.error)return reply(503,{error:"read_failed"});
 if(p.action==="status")return prior.data?reply(200,prior.data):reply(404,{error:"not_found"});
 if(!targetValid||typeof p.expected_version!=="string"||!/^[0-9a-f]{64}$/.test(p.expected_version))
  return reply(400,{error:"invalid"});
 const same=(r:Record<string,unknown>)=>["receipt_id","driver_id","vehicle_id","action","expected_version"].every(k=>r[k]===p[k]);
 if(prior.data)return same(prior.data)?reply(200,prior.data):reply(409,{error:"request_mismatch"});
 if(Deno.env.get("GF_DYNAMIC_ASSIGNMENT_STAFF_ENQUEUE_ENABLED")!=="true")return reply(503,{error:"dynamic_assignment_not_enabled"});
 const checked=await version();
 if(checked.status!==200)return reply(checked.status,{error:checked.error});
 if(checked.version!==p.expected_version)return reply(409,{error:"stale_assignment"});
 const inserted=await db.from(table).insert({
  request_id:p.request_id,actor_id:user.id,receipt_id:p.receipt_id,driver_id:p.driver_id,
  vehicle_id:p.vehicle_id,action:p.action,expected_version:p.expected_version,
 }).select(fields).single();
 if(!inserted.error)return reply(202,inserted.data);
 if(inserted.error.code!=="23505")return reply(503,{error:"enqueue_failed"});
 const raced=await read();
 if(raced.error)return reply(503,{error:"read_failed"});
 if(raced.data&&same(raced.data))return reply(200,raced.data);
 return reply(409,{error:"request_conflict"});

});
