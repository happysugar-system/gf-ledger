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
if(!p||typeof p.request_id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.request_id))return reply(400,{error:"invalid_request"});
const read=()=>db.from("gf_assignment_queue_test").select("request_id,state,verified_at,vehicle_id,waiting_id,driver_id").eq("request_id",p.request_id).eq("actor_id",user.id).maybeSingle();
if(p.action==="status"){const r=await read();return r.error?reply(503,{error:"read_failed"}):r.data?reply(200,r.data):reply(404,{error:"not_found"});}
if(p.action!=="save"||p.vehicle_id!=="DEMO-V02"||p.waiting_id!=="DEMO-R01"||p.driver_id!=="DEMO-D02")return reply(400,{error:"invalid_assignment"});
const prior=await read();
if(prior.error)return reply(503,{error:"read_failed"});
if(prior.data)return reply(200,prior.data);
const r=await db.from("gf_assignment_queue_test").insert({request_id:p.request_id,actor_id:user.id,vehicle_id:p.vehicle_id,waiting_id:p.waiting_id,driver_id:p.driver_id}).select("request_id,state").single();
if(r.error){if(r.error.code==="23505"){const again=await read();return again.data?reply(200,again.data):reply(409,{error:"already_reserved"});}return reply(503,{error:"save_failed"});}
return reply(202,r.data);
});