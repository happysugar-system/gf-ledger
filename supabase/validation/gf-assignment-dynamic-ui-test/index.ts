// Review candidate: deploy only after the server-side receipt/version reader is wired.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const headers={"access-control-allow-origin":"https://happysugar-system.github.io","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store","content-type":"application/json"};
const reply=(status:number,b:unknown)=>new Response(JSON.stringify(b),{status,headers});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const table="gf_assignment_dynamic_queue_test";
const fields="request_id,receipt_id,driver_id,vehicle_id,action,expected_version,state,verified_at,error_code";
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
 let p;try{p=await req.json()}catch{return reply(400,{error:"json"})}
 if(!p||!uuid(p.request_id))return reply(400,{error:"request_id"});
 const read=()=>db.from(table).select(fields).eq("request_id",p.request_id).eq("actor_id",user.id).maybeSingle();
 const prior=await read();if(prior.error)return reply(503,{error:"read_failed"});
 if(p.action==="status")return prior.data?reply(200,prior.data):reply(404,{error:"not_found"});
 if(!["assign","cancel"].includes(p.action)||typeof p.receipt_id!=="string"||!p.receipt_id.trim()||p.receipt_id!==p.receipt_id.trim()||p.receipt_id.length>150||/[\r\n]/.test(p.receipt_id)||typeof p.driver_id!=="string"||!/^D\d{6}$/.test(p.driver_id)||typeof p.vehicle_id!=="string"||!/^V\d{6}$/.test(p.vehicle_id)||typeof p.expected_version!=="string"||!/^[0-9a-f]{64}$/.test(p.expected_version))return reply(400,{error:"invalid"});
 const same=(r:Record<string,unknown>)=>["receipt_id","driver_id","vehicle_id","action","expected_version"].every(k=>r[k]===p[k]);
 if(prior.data)return same(prior.data)?reply(200,prior.data):reply(409,{error:"request_mismatch"});
 // Fail closed until authoritative receipt/version validation and worker are connected.
 return reply(503,{error:"dynamic_assignment_not_enabled"});
});
