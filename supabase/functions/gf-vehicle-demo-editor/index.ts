import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const cors={"access-control-allow-origin":"https://happysugar-system.github.io","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","content-type":"application/json","cache-control":"no-store"};
const reply=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:cors});
Deno.serve(async req=>{
if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
if(req.method!=="POST")return reply(405,{error:"method"});
const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!key)return reply(503,{error:"demo_only"});
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
if(!token)return reply(401,{error:"unauthorized"});
const {data:{user},error}=await db.auth.getUser(token);
if(error||!user?.email_confirmed_at)return reply(401,{error:"unauthorized"});
const a=await db.from("gf_vehicle_demo_editors").select("user_id").eq("user_id",user.id).maybeSingle();
if(a.error)return reply(503,{error:"access_check_failed"});
if(!a.data)return reply(403,{error:"forbidden"});
let p;try{p=await req.json()}catch{return reply(400,{error:"invalid_json"})}
if(!p||p.vehicle_id!=="V999999")return reply(400,{error:"invalid_vehicle"});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
if(p.action==="gas_health"){
const secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");
if(!secret||secret.length<32)return reply(503,{error:"gas_token_missing"});
try{
const res=await fetch("https://script.google.com/macros/s/AKfycbzTzeQKR5vMiqBR4JLCCoknooSJNRlaOq4tzaN6uq-DX3ClqQHMhF691kkiRRGh6DiakQ/exec",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"health_check",token:secret}),signal:AbortSignal.timeout(20000)});
const r=await res.json();
if(!res.ok||r.ok!==true||r.mode!=="demo"||r.vehicle_id!=="V999999")return reply(503,{error:"gas_health_failed"});
return reply(200,{ok:true,vehicle_id:"V999999"});
}catch{return reply(503,{error:"gas_connection_failed"});}
}
if(p.action==="save"){
if(!uuid(p.request_id)||typeof p.expected!=="boolean"||typeof p.desired!=="boolean")return reply(400,{error:"invalid_request"});
const r=await db.rpc("gf_vehicle_demo_enqueue",{p_actor:user.id,p_request:p.request_id,p_expected:p.expected,p_desired:p.desired});
if(r.error)return reply(r.error.code==="23505"||r.error.message==="conflict"?409:503,{error:"save_not_accepted"});
return reply(202,{request_id:r.data,state:"accepted"});
}
if(p.action==="read"||p.action==="status"){
const r=await db.from("gf_vehicle_replica_test").select("gps,observed_at").eq("vehicle_id","V999999").single();
if(r.error)return reply(503,{error:"read_failed"});
if(p.action==="read")return reply(200,r.data);
if(!uuid(p.request_id))return reply(400,{error:"invalid_request"});
const q=await db.from("gf_vehicle_save_queue_test").select("state,desired_gps,created_at").eq("request_id",p.request_id).eq("actor_id",user.id).maybeSingle();
if(q.error)return reply(503,{error:"status_failed"});
if(!q.data)return reply(404,{error:"not_found"});
return reply(200,{...q.data,...r.data});
}
return reply(400,{error:"invalid_action"});
});