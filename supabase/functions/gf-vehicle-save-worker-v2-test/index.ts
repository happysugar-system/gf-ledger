import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async req=>{
if(req.method!=="POST")return reply(405,{error:"method"});
const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");
if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!key||!secret||secret.length<32)return reply(503,{error:"demo_only"});
const token=req.headers.get("x-gf-sync-token")||"";
let diff=token.length^secret.length;for(let i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^(token.charCodeAt(i)||0);
if(diff)return reply(401,{error:"unauthorized"});
let p;try{p=await req.json()}catch{return reply(400,{error:"invalid_json"})}
if(!p||p.vehicle_id!=="V999999")return reply(400,{error:"invalid_vehicle"});
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
if(p.action==="health")return reply(200,{ok:true,mode:"demo_v2"});
if(p.action==="claim"){const r=await db.rpc("gf_vehicle_v2_claim_test");return r.error?reply(503,{error:"claim_failed"}):reply(200,{request:r.data?.[0]??null});}
if(p.action==="finish"){const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);if(!uuid(p.request_id)||!uuid(p.lease)||!["replica_verified","conflict","reconciliation_required"].includes(p.state))return reply(400,{error:"invalid_request"});const r=await db.rpc("gf_vehicle_v2_finish_test",{p_request:p.request_id,p_lease:p.lease,p_fields:p.fields??null,p_state:p.state});return r.error?reply(409,{error:"finish_failed"}):reply(200,{state:r.data});}
return reply(400,{error:"invalid_action"});
});