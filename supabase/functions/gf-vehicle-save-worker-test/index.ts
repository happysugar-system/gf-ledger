import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async req=>{
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const url=Deno.env.get("SUPABASE_URL");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co")return reply(503,{error:"demo_only"});
 const secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN")||"";
 const token=req.headers.get("x-gf-sync-token")||"";
 if(secret.length<32||token.length!==secret.length)return reply(401,{error:"unauthorized"});
 let diff=0;for(let i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^token.charCodeAt(i);
 if(diff)return reply(401,{error:"unauthorized"});
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)return reply(503,{error:"unavailable"});
 let p;try{p=JSON.parse(await req.text());}catch{return reply(400,{error:"invalid_json"});}
 if(!p||typeof p!=="object")return reply(400,{error:"invalid_request"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(p.action==="claim"){
  const {data,error}=await db.rpc("gf_vehicle_save_claim_test");
  if(error)return reply(503,{error:"claim_failed"});
  const r=data?.[0];if(!r)return reply(200,{request:null});
  if(r.vehicle_id!=="V999999")return reply(503,{error:"invalid_test_vehicle"});
  const {request_id,vehicle_id,expected_gps,desired_gps,lease}=r;
  return reply(200,{request:{request_id,vehicle_id,expected_gps,desired_gps,lease}});
 }
 if(p.action==="ack"){
  if(!uuid(p.request_id)||!uuid(p.lease)||!["sheet_verified","conflict","rejected","reconciliation_required"].includes(p.state))return reply(400,{error:"invalid_ack"});
  const {data,error}=await db.from("gf_vehicle_save_queue_test").update({state:p.state}).eq("request_id",p.request_id).eq("vehicle_id","V999999").eq("lease",p.lease).eq("state","processing").gt("lease_until",new Date().toISOString()).select("state").maybeSingle();
  if(error)return reply(503,{error:"ack_failed"});
  if(!data)return reply(409,{error:"stale_lease"});
  return reply(200,{state:data.state});
 }
 return reply(400,{error:"invalid_action"});
});
