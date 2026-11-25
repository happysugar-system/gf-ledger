import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const origin="https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site";
const headers={"access-control-allow-origin":origin,"access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers});
const queue="gf_assignment_dynamic_progress_queue_test";
const replica="gf_assignment_dynamic_replica_test";
const progress="gf_assignment_dynamic_progress_test";
const keys=["管理区分","納車可能日","納車確定日"];
const stages=["車両準備中","車両手配済み","名義変更前","名義変更中","名義変更済み"];
const uuid=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const vehicleId=(v:unknown)=>typeof v==="string"&&/^V9\d{5}$/.test(v);
const driverId=(v:unknown)=>typeof v==="string"&&/^D\d{6}$/.test(v);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function validDate(v:unknown){
 if(v==="")return true;
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const valid=(v:unknown)=>Array.isArray(v)&&v.length===3&&stages.includes(v[0])&&
 validDate(v[1])&&validDate(v[2])&&(!v[1]||!v[2]||v[1]<=v[2]);

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply(405,{error:"method"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!key)return reply(503,{error:"demo_only"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let p;try{p=await req.json()}catch{return reply(400,{error:"invalid_json"});}
 if(!p||typeof p!=="object")return reply(400,{error:"invalid_request"});
 const enabled=Deno.env.get("GF_DYNAMIC_PROGRESS_WRITE_ENABLED")==="true";
 const confirmed=async (id:string,d:string,values:string[])=>{
  const row=await db.from(progress).select("driver_id,stage,delivery_available_date,delivery_confirmed_date").eq("vehicle_id",id).maybeSingle();
  const v=row.data;
  return !row.error&&v?.driver_id===d&&same([v.stage,v.delivery_available_date??"",v.delivery_confirmed_date??""],values);
 };
 if(["claim","replicate","finish"].includes(p.action)){
  const secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");
  if(!secret||secret.length<32||req.headers.get("x-gf-sync-token")!==secret)return reply(401,{error:"unauthorized"});
  if(!enabled)return reply(503,{error:"disabled"});
  if(p.action==="claim"){
   const next=await db.from(queue).select("request_id").eq("state","pending").order("created_at").order("request_id").limit(1).maybeSingle();
   if(next.error)return reply(503,{error:"queue_read_failed"});
   if(!next.data)return reply(200,{request:null});
   const r=await db.from(queue).update({state:"processing",claimed_at:new Date().toISOString()})
    .eq("request_id",next.data.request_id).eq("state","pending").select("request_id,claimed_at,vehicle_id,driver_id,receipt_id,expected,fields").maybeSingle();
   return r.error?reply(503,{error:"claim_failed"}):reply(200,{request:r.data});
  }
  if(!uuid(p.request_id)||typeof p.claimed_at!=="string"||!Number.isFinite(Date.parse(p.claimed_at)))return reply(400,{error:"invalid_lease"});
  const r=await db.from(queue).select("vehicle_id,driver_id,expected,fields").eq("request_id",p.request_id)
   .eq("state","processing").eq("claimed_at",p.claimed_at).maybeSingle();
  if(r.error)return reply(503,{error:"queue_read_failed"});
  const job=r.data;
  if(!job||!vehicleId(job.vehicle_id)||!driverId(job.driver_id))return reply(409,{error:"not_current"});
  const values=keys.map(k=>job.fields?.[k]);
  if(!valid(values))return reply(409,{error:"invalid_fields"});
  if(p.action==="replicate"){
   const s=p.snapshot;
   if(s?.vehicleId!==job.vehicle_id||s?.driverId!==job.driver_id||!same(s?.values,values))return reply(409,{error:"snapshot_mismatch"});
   const current=await db.from(replica).select("record,updated_at").eq("vehicle_id",job.vehicle_id).maybeSingle();
   if(current.error)return reply(503,{error:"replica_read_failed"});
   const old=current.data;
   if(old?.record?.DriverID!==job.driver_id||old.record.VehicleID!==job.vehicle_id)return reply(409,{error:"replica_identity"});
   const oldValues=keys.map(k=>old.record[k]??"");
   if(!same(oldValues,values)){
    if(!same(oldValues,job.expected?.values))return reply(409,{error:"replica_changed"});
    const record={...old.record,...Object.fromEntries(keys.map((k,i)=>[k,values[i]]))};
    const saved=await db.from(replica).update({record,updated_at:new Date().toISOString()})
     .eq("vehicle_id",job.vehicle_id).eq("updated_at",old.updated_at).select("vehicle_id").maybeSingle();
    if(saved.error||!saved.data)return reply(503,{error:"replica_write_failed"});
   }
   return await confirmed(job.vehicle_id,job.driver_id,values)?reply(200,{verified:true}):reply(503,{error:"progress_not_verified"});
  }
  if(!["verified","reconciliation_required"].includes(p.status))return reply(400,{error:"invalid_status"});
  if(p.status==="verified"&&!await confirmed(job.vehicle_id,job.driver_id,values))return reply(409,{error:"progress_not_verified"});
  const result=await db.from(queue).update({
   state:p.status,verified_at:p.status==="verified"?new Date().toISOString():null,
   error_code:p.status==="verified"?null:"manual_reconciliation",
  }).eq("request_id",p.request_id).eq("state","processing").eq("claimed_at",p.claimed_at).select("state").maybeSingle();
  return result.error?reply(503,{error:"finish_failed"}):result.data?reply(200,result.data):reply(409,{error:"not_current"});
 }

 if(req.headers.get("origin")!==origin)return reply(403,{error:"origin_not_allowed"});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(401,{error:"unauthorized"});
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.email_confirmed_at||!user.email)return reply(401,{error:"unauthorized"});
 const access=await db.from("gf_reception_access").select("role,enabled").eq("email",user.email.trim().toLowerCase()).maybeSingle();
 if(access.error)return reply(503,{error:"access_check_failed"});
 if(access.data?.enabled!==true||!["owner","staff"].includes(access.data.role))return reply(403,{error:"forbidden"});
 if(p.action==="read"){
  if(!vehicleId(p.vehicle_id)||!driverId(p.driver_id))return reply(400,{error:"invalid_request"});
  const r=await db.from(progress).select("driver_id,stage,delivery_available_date,delivery_confirmed_date")
   .eq("vehicle_id",p.vehicle_id).eq("driver_id",p.driver_id).maybeSingle();
  if(r.error)return reply(503,{error:"progress_read_failed"});
  if(!r.data)return reply(404,{error:"not_found"});
  const v=r.data;
  return reply(200,{expected:{vehicleId:p.vehicle_id,driverId:p.driver_id,
   values:[v.stage,v.delivery_available_date??"",v.delivery_confirmed_date??""]},write_enabled:enabled});
 }
 if(p.action==="status"){
  if(!uuid(p.request_id))return reply(400,{error:"request_id"});
  const r=await db.from(queue).select("request_id,state,verified_at,error_code").eq("request_id",p.request_id).eq("actor_id",user.id).maybeSingle();
  return r.error?reply(503,{error:"queue_read_failed"}):r.data?reply(200,r.data):reply(404,{error:"not_found"});
 }
 if(p.action!=="save"||!uuid(p.request_id)||!vehicleId(p.vehicle_id)||!driverId(p.driver_id)||
  typeof p.receipt_id!=="string"||!p.receipt_id||p.receipt_id!==p.receipt_id.trim()||
  p.receipt_id.length>150||/[\r\n]/.test(p.receipt_id)||p.expected?.vehicleId!==p.vehicle_id||
  p.expected?.driverId!==p.driver_id||!valid(p.expected?.values)||!p.fields||
  Object.keys(p.fields).length!==keys.length||!valid(keys.map(k=>p.fields[k])))return reply(400,{error:"invalid_request"});
 const expected={vehicleId:p.vehicle_id,driverId:p.driver_id,values:p.expected.values};
 const fields=Object.fromEntries(keys.map(k=>[k,p.fields[k]]));
 const target={vehicle_id:p.vehicle_id,driver_id:p.driver_id,receipt_id:p.receipt_id};
 const prior=async()=>db.from(queue).select("request_id,state,expected,fields,vehicle_id,driver_id,receipt_id")
  .eq("request_id",p.request_id).eq("actor_id",user.id).maybeSingle();
 const reused=(d:Record<string,unknown>)=>Object.entries(target).every(([k,v])=>d[k]===v)&&
  same((d.expected as {values:unknown}).values,expected.values)&&same(keys.map(k=>(d.fields as Record<string,unknown>)[k]),keys.map(k=>fields[k]));
 const old=await prior();
 if(old.error)return reply(503,{error:"queue_read_failed"});
 if(old.data)return reused(old.data)?reply(200,{request_id:p.request_id,state:old.data.state}):reply(409,{error:"request_conflict"});
 if(!enabled)return reply(503,{error:"disabled"});
 if(!await confirmed(p.vehicle_id,p.driver_id,expected.values))return reply(409,{error:"stale_progress"});
 const inserted=await db.from(queue).insert({...target,request_id:p.request_id,actor_id:user.id,expected,fields}).select("request_id,state").single();
 if(!inserted.error)return reply(202,inserted.data);
 if(inserted.error.code==="23505"||inserted.error.code==="P0001"){
  const raced=await prior();
  if(raced.error)return reply(503,{error:"queue_read_failed"});
  if(raced.data&&reused(raced.data))return reply(200,{request_id:p.request_id,state:raced.data.state});
  return reply(409,{error:"operation_conflict"});
 }
 return reply(503,{error:"enqueue_failed"});
});
