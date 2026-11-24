import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
const keys=["管理区分","納車可能日","納車確定日"];
Deno.serve(async req=>{
 if(req.method!=="POST")return reply(405,{error:"method"});
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!service||!secret||secret.length<32)return reply(503,{error:"configuration"});
 if(req.headers.get("x-gf-sync-token")!==secret)return reply(401,{error:"unauthorized"});
 let p;try{p=await req.json()}catch{return reply(400,{error:"json"})}
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 if(p?.action==="health")return reply(200,{ok:true});
 if(p?.action==="claim"){
   const pending=await db.from("gf_assignment_progress_ui_queue_test")
      .select("request_id,expected,fields,vehicle_id,state").eq("state","pending")
      .order("created_at",{ascending:true}).limit(1);
   if(pending.error)return reply(503,{error:"queue_read"});
   if(!pending.data.length)return reply(200,{request:null});
   const item=pending.data[0];
   const updated=await db.from("gf_assignment_progress_ui_queue_test")
     .update({state:"processing",claimed_at:new Date().toISOString()})
     .eq("request_id",item.request_id).eq("state","pending")
     .select("request_id,expected,fields,vehicle_id,state").maybeSingle();
   if(updated.error)return reply(503,{error:"claim"});
   return reply(200,{request:updated.data});
 }
 if(typeof p?.request_id!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(p.request_id))return reply(400,{error:"request_id"});
 const found=await db.from("gf_assignment_progress_ui_queue_test")
   .select("request_id,vehicle_id,state,expected,fields,verified_at")
   .eq("request_id",p.request_id).maybeSingle();
 if(found.error)return reply(503,{error:"lookup"});
 if(!found.data)return reply(404,{error:"not_found"});
 const q=found.data;
 if(q.vehicle_id!=="TEST-V01")return reply(409,{error:"vehicle"});
 if(p.action==="finish"){
   if(q.state==="verified")return reply(200,{state:"verified",verified_at:q.verified_at});
   if(q.state!=="processing")return reply(409,{error:"state"});
   const [v,progress]=await Promise.all([
      db.from("gf_assignment_integration_replica_test").select("record").eq("vehicle_id","TEST-V01").single(),
      db.from("gf_assignment_progress_test").select("driver_id,vehicle_id,stage,delivery_available_date,delivery_confirmed_date").eq("driver_id","D999901").maybeSingle()
   ]);
   if(v.error||progress.error)return reply(503,{error:"verify_read"});
   const r=v.data.record as Record<string,string>;
   const f=q.fields as Record<string,string>;
   const same=r.VehicleID==="TEST-V01"&&r.DriverID==="D999901"&&
      keys.every(k=>(r[k]||"")===f[k])&&
      progress.data?.vehicle_id==="TEST-V01"&&progress.data?.driver_id==="D999901"&&
      progress.data?.stage===f["管理区分"]&&
      (progress.data?.delivery_available_date||"")===f["納車可能日"]&&
      (progress.data?.delivery_confirmed_date||"")===f["納車確定日"];
   if(!same)return reply(409,{error:"not_reconciled"});
   const done=await db.from("gf_assignment_progress_ui_queue_test")
     .update({state:"verified",verified_at:new Date().toISOString(),error_code:null})
     .eq("request_id",q.request_id).eq("state","processing")
     .select("state,verified_at").single();
   return done.error?reply(503,{error:"finish"}):reply(200,done.data);
 }
 if(p.action==="fail"){
   if(q.state==="verified")return reply(409,{error:"already_verified"});
   const changed=await db.from("gf_assignment_progress_ui_queue_test")
      .update({state:"reconciliation_required",error_code:"STAFF_REVIEW_REQUIRED"})
      .eq("request_id",q.request_id).eq("state","processing").select("state").maybeSingle();
   return changed.error?reply(503,{error:"fail"}):reply(200,changed.data||{state:q.state});
 }
 return reply(400,{error:"action"});
});