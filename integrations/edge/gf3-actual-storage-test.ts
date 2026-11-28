import {createClient} from "npm:@supabase/supabase-js@2.49.4";
Deno.serve(async req=>{
 const reply=(status:number,data:unknown)=>Response.json(data,{status});
 const token=Deno.env.get("GF3_SYNC_TEST_TOKEN")||"";
 if(req.method!=="POST"||token.length<32||req.headers.get("x-gf3-sync-token")!==token)return reply(403,{ok:false});
 try{
 const p=await req.json();
 if(p.action==="health")return reply(200,{ok:true});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const table=db.from("gf3_actual_receipts_test");
 if(p.action==="latest-return"){
  const {data,error}=await table.select("kind,state,after_data").neq("state","取消済")
   .order("created_at",{ascending:false}).limit(1).maybeSingle();
  return error?reply(409,{ok:false}):reply(200,{ok:true,
   data:data?.kind==="返却完了"&&data.state==="完了"?data.after_data.rows:null});
 }
 if(p.action==="schedule-read"){
  const {data,error}=await db.from("gf3_schedule_test")
   .select("schedule_id,vehicle_id,schedule_type,schedule_date,state,calendar_event_id")
   .order("schedule_id").limit(1000);
  return error||data.length===1000?reply(409,{ok:false}):reply(200,{ok:true,data});
 }
 if(p.action==="ledger-sync"){
  const row=p.row;
  const baseFields=["VehicleID","車番","DriverID","区分/ステータス","管理区分","納車可能日","納車確定日"];
  const extraFields=["納車予定日","引渡し"];
  const fields=[...baseFields,...extraFields];
  if(!row||baseFields.some(key=>typeof row[key]!=="string")||
   Object.keys(row).some(key=>!fields.includes(key)||typeof row[key]!=="string"||row[key].length>100)||
   row.VehicleID!=="V900005"||!["","D999902"].includes(row.DriverID))return reply(400,{ok:false});
  const replica=db.from("gf_vehicles_test");
  const current=await replica.select("vehicle_data").eq("vehicle_id",row.VehicleID).maybeSingle();
  if(current.error)return reply(409,{ok:false});
  const record=Object.fromEntries(fields.map(key=>[key,row[key]??current.data?.vehicle_data?.[key]??""]));
  if(current.data&&fields.every(key=>current.data.vehicle_data[key]===record[key]))return reply(200,{ok:true,data:record});
  const {data,error}=await replica.upsert({
   vehicle_id:row.VehicleID,vehicle_number:row["車番"],vehicle_data:record,updated_at:new Date().toISOString()
  },{onConflict:"vehicle_id"}).select("vehicle_data").single();
  return error?reply(409,{ok:false}):reply(200,{ok:true,data:data.vehicle_data});
 }
 if(p.action==="delivery-months"||p.action==="delivery-details"){
  const counts=new Map<string,number>();
  const details=p.action==="delivery-details";
  const delivered=[];
  const size=500;
  for(let offset=0;;offset+=size){
   const {data,error}=await table.select(details
    ?"actual_date,vehicle_id,driver_id,receipt_id,after_data":"actual_date").eq("kind","納車完了").eq("state","完了")
    .order("receipt_id").range(offset,offset+size-1);
   if(error)return reply(409,{ok:false});
   for(const row of data){
    if(details){
     delivered.push({date:row.actual_date,vehicleId:row.vehicle_id,driverId:row.driver_id,
      driverName:row.after_data?.rows?.[0]?.["現在使用者"]?.value||"",receiptId:row.receipt_id});
     continue;
    }
    const month=row.actual_date.slice(0,7);
    counts.set(month,(counts.get(month)||0)+1);
   }
   if(data.length<size)break;
  }
  return reply(200,{ok:true,data:details?delivered:Array.from(counts,([month,delivered])=>({month,delivered}))});
 }
 if(!/^TEST-GF3-[A-Z0-9-]{1,70}$/.test(p.id||""))return reply(400,{ok:false});
 let result;
 if(p.action==="read")result=await table.select("*").eq("receipt_id",p.id).maybeSingle();
 else if(p.action==="insert"){
 const r=p.row;
 if(!r||!["納車完了","返却完了"].includes(r.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(r.actual_date)||!r.before_data||!r.after_data)return reply(400,{ok:false});
 result=await table.insert({receipt_id:p.id,vehicle_id:"V900005",driver_id:"D999902",application_id:"2",kind:r.kind,actual_date:r.actual_date,before_data:r.before_data,after_data:r.after_data}).select("receipt_id").single();
 }else if(p.action==="transition")result=await db.rpc("gf3_actual_transition_test",{p_id:p.id,p_from:p.expected,p_to:p.next});
 else return reply(400,{ok:false});
 if(result.error)return reply(409,{ok:false});
 return reply(200,{ok:true,data:result.data});
 }catch{return reply(400,{ok:false});}
});
