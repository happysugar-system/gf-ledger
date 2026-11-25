import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(status:number,b:unknown)=>Response.json(b,{status,headers:{"cache-control":"no-store"}});
const table="gf_assignment_dynamic_queue_test";
const replica="gf_assignment_integration_replica_test";
const fields="request_id,actor_id,receipt_id,driver_id,vehicle_id,action,expected_version,state,claimed_at";
const uuid=(id:unknown)=>typeof id==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const keys=["VehicleID","DriverID","車番","区分/ステータス","管理区分","納車可能日","納車確定日"];
Deno.serve(async req=>{
 if(req.method!=="POST")return reply(405,{error:"method"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!key||!secret||secret.length<32)return reply(503,{error:"configuration"});
 if(req.headers.get("x-gf-sync-token")!==secret)return reply(401,{error:"unauthorized"});
 let p;try{p=await req.json()}catch{return reply(400,{error:"json"})}
 const enabled=Deno.env.get("GF_DYNAMIC_ASSIGNMENT_CLAIMS_ENABLED_V2")==="true";
 if(p?.action==="health")return reply(200,{ok:true,write_enabled:enabled});
 if(!enabled)return reply(503,{error:"dynamic_worker_not_enabled"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(p?.action==="claim"){
  const next=await db.from(table).select("request_id").eq("state","pending").like("vehicle_id","V9%").order("created_at").order("request_id").limit(1).maybeSingle();
  if(next.error)return reply(503,{error:"read_failed"});
  if(!next.data)return reply(200,{request:null});
  const claim=await db.from(table).update({state:"processing",claimed_at:new Date().toISOString()})
   .eq("request_id",next.data.request_id).eq("state","pending").select(fields).maybeSingle();
  if(claim.error)return reply(503,{error:"claim_failed"});
  return reply(200,{request:claim.data});
 }
 if(!["current","replicate","finish"].includes(p?.action)||!uuid(p.request_id)||
    typeof p.claimed_at!=="string"||!Number.isFinite(Date.parse(p.claimed_at)))return reply(400,{error:"invalid"});
 const current=()=>db.from(table).select(fields).eq("request_id",p.request_id).eq("state","processing").eq("claimed_at",p.claimed_at);
 const claim=await current().maybeSingle();
 if(claim.error)return reply(503,{error:"read_failed"});
 if(!claim.data)return reply(409,{error:"not_current"});
 const row=claim.data;
 if(p.action==="current")return reply(200,{request:row});
 if(p.action==="replicate"){
  const r=p.record;
  if(!r||Object.keys(r).length!==keys.length||keys.some(k=>typeof r[k]!=="string")||
    !/^V9\d{5}$/.test(row.vehicle_id)||r.VehicleID!==row.vehicle_id||
    r.DriverID!==(row.action==="assign"?row.driver_id:"")||
    r["区分/ステータス"]!=="空車"||r["管理区分"]!==(row.action==="assign"?"車両準備中":"通常管理")||
    r["納車可能日"]||r["納車確定日"]||!r["車番"]||r["車番"].length>80)return reply(409,{error:"replica_mismatch"});
  const write=await db.from(replica).upsert({vehicle_id:row.vehicle_id,record:r,updated_at:new Date().toISOString()},{onConflict:"vehicle_id"});
  if(write.error)return reply(503,{error:"replica_write_failed"});
  const check=await db.from(replica).select("record").eq("vehicle_id",row.vehicle_id).maybeSingle();
  if(check.error||!check.data||keys.some(k=>check.data.record?.[k]!==r[k]))return reply(503,{error:"replica_verification_failed"});
  return reply(200,{verified:true});
 }
 const status=p.status;
 if(!["verified","reconciliation_required","rejected"].includes(status))return reply(400,{error:"invalid_result"});
 if(status==="verified"){
  const found=await db.from(replica).select("record").eq("vehicle_id",row.vehicle_id).maybeSingle();
  const r=found.data?.record;
  if(found.error||!r||r.VehicleID!==row.vehicle_id||r.DriverID!==(row.action==="assign"?row.driver_id:"")||
     r["管理区分"]!==(row.action==="assign"?"車両準備中":"通常管理"))return reply(409,{error:"replica_not_verified"});
 }
 const result=await db.from(table).update({
  state:status,verified_at:status==="verified"?new Date().toISOString():null,
  error_code:status==="verified"?null:(status==="rejected"?"validation_failed":"manual_reconciliation"),
 }).eq("request_id",p.request_id).eq("state","processing").eq("claimed_at",p.claimed_at).select("state").maybeSingle();
 if(result.error)return reply(503,{error:"finish_failed"});
 if(!result.data)return reply(409,{error:"not_current"});
 return reply(200,{state:result.data.state});
});
