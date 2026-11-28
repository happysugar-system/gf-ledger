import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const headers={"access-control-allow-origin":"https://happysugar-system.github.io","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","content-type":"application/json","cache-control":"no-store"};
const reply=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers});
Deno.serve(async req=>{
if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
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
if(p.action==="read"){const r=await db.from("gf_vehicle_replica_v2_test").select("fields,observed_at").eq("vehicle_id","V999999").maybeSingle();return r.error?reply(503,{error:"read_failed"}):r.data?reply(200,r.data):reply(503,{error:"initial_sync_required"});}
if(typeof p.request_id!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.request_id))return reply(400,{error:"invalid_request"});
if(p.action==="save"){const r=await db.rpc("gf_vehicle_v2_enqueue_test",{p_actor:user.id,p_request:p.request_id,p_expected:p.expected,p_changes:p.changes});if(r.error)return reply(r.error.code==="23505"||r.error.message==="conflict"?409:r.error.message.startsWith("invalid_")?400:503,{error:"save_not_accepted"});let immediate=false;const secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");if(secret&&secret.length>=32){try{const res=await fetch("https://script.google.com/macros/s/AKfycbzTzeQKR5vMiqBR4JLCCoknooSJNRlaOq4tzaN6uq-DX3ClqQHMhF691kkiRRGh6DiakQ/exec",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"save_v2_now",token:secret}),signal:AbortSignal.timeout(15000)});const g=await res.json();immediate=res.ok&&g.ok===true&&g.mode==="demo_v2"&&g.vehicle_id==="V999999";}catch{/* scheduled worker fallback */}}return reply(202,{request_id:r.data,state:"accepted",immediate});}
if(p.action==="status"){const r=await db.from("gf_vehicle_save_queue_v2_test").select("state,changes,verified_at,created_at").eq("request_id",p.request_id).eq("actor_id",user.id).maybeSingle();return r.error?reply(503,{error:"status_failed"}):r.data?reply(200,r.data):reply(404,{error:"not_found"});}
return reply(400,{error:"invalid_action"});
});