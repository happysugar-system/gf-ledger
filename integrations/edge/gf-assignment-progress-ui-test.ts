import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const cors={"access-control-allow-origin":"https://happysugar-system.github.io","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store","content-type":"application/json"};
const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
const stages=["車両準備中","車両手配済み","名義変更前","名義変更中","名義変更済み"];
const names=["管理区分","納車可能日","納車確定日"];
function validDate(v:unknown){
 if(typeof v!=="string")return false;
 if(!v)return true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function validValues(values:unknown){
 return Array.isArray(values)&&values.length===3&&stages.includes(values[0])&&validDate(values[1])&&validDate(values[2])&&
   (!values[1]||!values[2]||values[2]>=values[1]);
}
function validFields(fields:unknown){
 if(!fields||typeof fields!=="object"||Array.isArray(fields))return false;
 const f=fields as Record<string,unknown>;
 return Object.keys(f).length===3&&names.every(k=>Object.prototype.hasOwnProperty.call(f,k))&&
   validValues(names.map(k=>f[k]));
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return respond(405,{error:"method"});
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!secret)return respond(503,{error:"demo_only"});
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return respond(401,{error:"auth"});
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user?.email_confirmed_at)return respond(401,{error:"auth"});
 const allowed=await db.from("gf_vehicle_demo_editors").select("user_id").eq("user_id",user.id).maybeSingle();
 if(allowed.error)return respond(503,{error:"access_check"});
 if(!allowed.data)return respond(403,{error:"forbidden"});
 let input;try{input=await req.json()}catch{return respond(400,{error:"json"})}
 if(input?.action==="status"){
   if(typeof input.request_id!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(input.request_id))return respond(400,{error:"request_id"});
   const state=await db.from("gf_assignment_progress_ui_queue_test")
      .select("request_id,vehicle_id,state,created_at,verified_at,error_code")
      .eq("request_id",input.request_id).eq("actor_id",user.id).maybeSingle();
   return state.error?respond(503,{error:"status"}):state.data?respond(200,state.data):respond(404,{error:"not_found"});
 }
 const v=await db.from("gf_assignment_integration_replica_test").select("vehicle_id,record,updated_at").eq("vehicle_id","TEST-V01").single();
 if(v.error)return respond(503,{error:"read"});
 const record=v.data.record as Record<string,string>;
 const active=await db.from("gf_assignment_progress_ui_queue_test").select("request_id,state")
    .eq("vehicle_id","TEST-V01").in("state",["pending","processing","reconciliation_required"]).limit(1);
 if(active.error)return respond(503,{error:"queue"});
 if(input?.action==="read"){
   return respond(200,{vehicle_id:"TEST-V01",driver_id:record.DriverID||"",
    values:[record["管理区分"]||"",record["納車可能日"]||"",record["納車確定日"]||""],
    updated_at:v.data.updated_at,blocked:active.data.length>0});
 }
 if(input?.action!=="save")return respond(400,{error:"action"});
 if(typeof input.request_id!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(input.request_id))return respond(400,{error:"request_id"});
 const expected=input.expected;
 if(!expected||expected.vehicleId!=="TEST-V01"||expected.driverId!=="D999901"||!validValues(expected.values)||!validFields(input.fields))return respond(400,{error:"fields"});
 const same=record.VehicleID==="TEST-V01"&&record.DriverID==="D999901"&&
   names.every((k,i)=>(record[k]||"")===expected.values[i]);
 if(!same)return respond(409,{error:"stale"});
 const existed=await db.from("gf_assignment_progress_ui_queue_test")
  .select("request_id,actor_id,expected,fields,state").eq("request_id",input.request_id).maybeSingle();
 if(existed.error)return respond(503,{error:"idempotency"});
 if(existed.data){
   return existed.data.actor_id===user.id&&JSON.stringify(existed.data.expected)===JSON.stringify(expected)&&
     JSON.stringify(existed.data.fields)===JSON.stringify(input.fields)?
     respond(200,{request_id:input.request_id,state:existed.data.state}):respond(409,{error:"request_conflict"});
 }
 if(active.data.length)return respond(409,{error:"busy"});
 const insert=await db.from("gf_assignment_progress_ui_queue_test").insert({
   request_id:input.request_id,actor_id:user.id,vehicle_id:"TEST-V01",
   expected:{vehicleId:"TEST-V01",driverId:"D999901",values:expected.values},
   fields:Object.fromEntries(names.map(k=>[k,input.fields[k]])),state:"pending"
 }).select("request_id,state").single();
 if(insert.error)return respond(insert.error.code==="23505"?409:503,{error:insert.error.code==="23505"?"busy":"insert"});
 return respond(200,insert.data);
});