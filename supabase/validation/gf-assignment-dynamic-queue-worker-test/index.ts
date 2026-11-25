import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(status:number,b:unknown)=>Response.json(b,{status,headers:{"cache-control":"no-store"}});
const table="gf_assignment_dynamic_queue_test";
const fields="request_id,actor_id,receipt_id,driver_id,vehicle_id,action,expected_version,state,claimed_at";
Deno.serve(async req=>{
 if(req.method!=="POST")return reply(405,{error:"method"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!key||!secret||secret.length<32)return reply(503,{error:"configuration"});
 if(req.headers.get("x-gf-sync-token")!==secret)return reply(401,{error:"unauthorized"});
 let p;try{p=await req.json()}catch{return reply(400,{error:"json"})}
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(p?.action==="health")return reply(200,{ok:true,write_enabled:false});
 // No claim until GAS runner and authoritative replica verification have been installed.
 if(p?.action==="claim")return reply(503,{error:"dynamic_worker_not_enabled"});
 if(p?.action!=="current"||typeof p.request_id!=="string"||!/^[0-9a-f-]{36}$/i.test(p.request_id))return reply(400,{error:"invalid"});
 const r=await db.from(table).select(fields).eq("request_id",p.request_id).eq("state","processing").maybeSingle();
 if(r.error)return reply(503,{error:"read_failed"});
 if(!r.data)return reply(404,{error:"not_current"});
 return reply(200,{request:r.data});
});
