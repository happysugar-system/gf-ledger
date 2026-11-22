import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const origin="https://happysugar-system.github.io";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const send=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
const clean=(v:unknown)=>String(v??"").trim();
const STAGES=["車両準備中","車両手配済み","名義変更前","名義変更中","名義変更済み"];
const validDate=(v:unknown)=>v===null || v==="" || (typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+"T00:00:00Z")) && new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v);
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return send(405,{error:"method_not_allowed"});
 if(req.headers.get("origin")!==origin)return send(403,{error:"origin_not_allowed"});
 const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!bearer)return send(401,{error:"authentication_required"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return send(503,{error:"server_not_configured"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await db.auth.getUser(bearer);
 if(userError||!user?.email)return send(401,{error:"invalid_session"});
 const {data:staff,error:staffError}=await db.from("gf_reception_access").select("role,enabled").eq("email",user.email.toLowerCase()).maybeSingle();
 if(staffError)return send(503,{error:"staff_lookup_failed"});
 if(!staff?.enabled)return send(403,{error:"not_authorized"});
 let body:any;try{body=await req.json()}catch{return send(400,{error:"invalid_json"})}
 if(!["list","save"].includes(body?.action))return send(400,{error:"invalid_action"});
 if(body.action==="list"){
   const {data:vehicles,error:ve}=await db.from("gf_vehicles").select("vehicle_id,vehicle_number,vehicle_data").order("vehicle_number").limit(500);
   const {data:progress,error:pe}=await db.from("gf_driver_vehicle_progress").select("*").limit(500);
   if(ve||pe)return send(503,{error:"progress_list_failed"});
   return send(200,{vehicles:(vehicles||[]).map(v=>({vehicle_id:v.vehicle_id,vehicle_number:v.vehicle_number,driver_id:clean(v.vehicle_data?.DriverID)})).filter(v=>/^D\d{6}$/.test(v.driver_id)),progress:progress||[]});
 }
 const driverId=clean(body.driver_id),vehicleId=clean(body.vehicle_id),stage=clean(body.stage);
 if(!/^D\d{6}$/.test(driverId)||!vehicleId||vehicleId.length>100||!STAGES.includes(stage)||!validDate(body.delivery_available_date)||!validDate(body.delivery_confirmed_date))return send(400,{error:"invalid_progress"});
 const [{data:vehicles,error:ve},{data:apps,error:ae}]=await Promise.all([
 db.from("gf_vehicles").select("vehicle_id,vehicle_data").eq("vehicle_id",vehicleId).limit(2),
 db.from("gf_mypage_applications_prod").select("contract_status,updated_at").eq("driver_id",driverId).order("updated_at",{ascending:false}).limit(1)
 ]);
 if(ve||ae)return send(503,{error:"progress_validation_unavailable"});
 if(vehicles?.length!==1||clean(vehicles[0].vehicle_data?.DriverID)!==driverId)return send(409,{error:"vehicle_driver_link_mismatch"});
 if(!apps?.length||!["契約完了","契約締結済","契約締結済み"].includes(clean(apps[0].contract_status)))return send(409,{error:"contract_not_completed"});
 const {data:current,error:ce}=await db.from("gf_driver_vehicle_progress").select("*").eq("driver_id",driverId).maybeSingle();
 if(ce)return send(503,{error:"progress_read_failed"});
 if(current?.vehicle_id && current.vehicle_id!==vehicleId)return send(409,{error:"vehicle_reassignment_needs_review"});
 const available=body.delivery_available_date||null,confirmed=body.delivery_confirmed_date||null;
 if(available&&confirmed&&confirmed<available)return send(400,{error:"confirmed_before_available"});
 // Prevent two staff sessions from silently overwriting each other.
 const expected=clean(body.expected_updated_at);
 if((current?.updated_at||"")!==expected)return send(409,{error:"progress_changed_reload"});
 const dates={...(current?.stage_dates||{})};
 if(!current||current.stage!==stage){
   const stageIndex=STAGES.indexOf(stage);
   // A rollback cancels timestamps for stages no longer reached.
   for(const k of Object.keys(dates))if(STAGES.indexOf(k)>stageIndex)delete dates[k];
   dates[stage]=new Date().toISOString();
 }
 const update={vehicle_id:vehicleId,stage,stage_dates:dates,delivery_available_date:available,delivery_confirmed_date:confirmed,updated_at:new Date().toISOString()};
 let saved:any=null,saveError:any=null;
 if(current){
   const result=await db.from("gf_driver_vehicle_progress").update(update)
     .eq("driver_id",driverId).eq("updated_at",expected).select("*").maybeSingle();
   saved=result.data;saveError=result.error;
 }else{
   const result=await db.from("gf_driver_vehicle_progress").insert({driver_id:driverId,...update}).select("*").maybeSingle();
   saved=result.data;saveError=result.error;
 }
 if(saveError?.code==="23505"||!saveError&&!saved)return send(409,{error:"progress_changed_reload"});
 if(saveError)return send(503,{error:"progress_save_failed"});
 return send(200,{success:true,progress:saved});
});