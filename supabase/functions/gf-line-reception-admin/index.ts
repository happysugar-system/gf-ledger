import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const ORIGIN="https://happysugar-system.github.io";
const CORS={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const respond=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const enc=(s:string)=>btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const bytes=(v:Uint8Array)=>enc(String.fromCharCode(...v));
async function googleToken(){
 const raw=Deno.env.get("GF_GOOGLE_SERVICE_ACCOUNT_JSON");
 if(!raw)throw Error("sheets_adapter_not_configured");
 const sa=JSON.parse(raw);
 if(!sa.client_email||!sa.private_key)throw Error("sheets_adapter_not_configured");
 const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const header=enc(JSON.stringify({alg:"RS256",typ:"JWT"}));
 const payload=enc(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500}));
 const input=header+"."+payload;
 const signature=bytes(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(input))));
 const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:input+"."+signature})});
 if(!res.ok)throw Error("google_auth_failed");
 const data=await res.json();return data.access_token as string;
}
async function sheetRequest(token:string,range:string,method="GET",body?:unknown){
 const sheetId=Deno.env.get("GF_LINE_RECEPTION_SHEET_ID");
 if(!sheetId)throw Error("sheets_adapter_not_configured");
 const url="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(sheetId)+"/values/"+encodeURIComponent(range)+(method==="PUT"?"?valueInputOption=RAW":"");
 const res=await fetch(url,{method,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
 if(!res.ok)throw Error("google_sheets_request_failed_"+res.status);
 return res.json();
}
const clean=(v:unknown)=>String(v??"").trim();

const accessSheetId="1Wz67IH2D5s_29336c_akdovEsDJKYcXK6Uay7qTnw2M";
const accessSheetTab="'スタッフ権限管理'";
async function accessSheetRows(token:string){
 const range=accessSheetTab+"!A1:F";
 const url="https://sheets.googleapis.com/v4/spreadsheets/"+accessSheetId+"/values/"+encodeURIComponent(range);
 const r=await fetch(url,{headers:{Authorization:"Bearer "+token}});
 if(!r.ok)throw Error("permissions_sheet_read_"+r.status);
 const data=await r.json();const rows=(data.values||[]) as unknown[][];
 if(["メールアドレス","権限","状態","対象システム","備考"].some((v,i)=>clean(rows[0]?.[i])!==v))throw Error("permissions_sheet_headers_changed");
 return rows;
}
async function writeAccessSheet(token:string,row:number,values:unknown[]){
 const range=accessSheetTab+"!A"+row+":F"+row;
 const url="https://sheets.googleapis.com/v4/spreadsheets/"+accessSheetId+"/values/"+encodeURIComponent(range)+"?valueInputOption=RAW";
 const r=await fetch(url,{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({values:[values]})});
 if(!r.ok)throw Error("permissions_sheet_write_"+r.status);
}

function table(rows:unknown[][]){const head=(rows[0]||[]).map(clean);return (rows.slice(1)||[]).map((row,i)=>({index:i+2,value:Object.fromEntries(head.map((k,j)=>[k,clean(row[j])]))}));}
function col(n:number){let s="";for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="POST")return respond(405,{error:"method_not_allowed"});
 if(req.headers.get("origin")!==ORIGIN){console.warn("gf_reception_access_denied","origin_not_allowed");return respond(403,{error:"origin_not_allowed"});}
 const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!bearer)return respond(401,{error:"authentication_required"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return respond(503,{error:"server_configuration_missing"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authErr}=await db.auth.getUser(bearer);
 if(authErr||!user)return respond(401,{error:"invalid_session"});
 const email=(user.email||"").trim().toLowerCase();
 const {data:access,error:accessErr}=await db.from("gf_reception_access").select("email,role,enabled").eq("email",email).maybeSingle();
 if(accessErr)return respond(503,{error:"authorization_unavailable"});
 if(!access?.enabled){console.warn("gf_reception_access_denied","not_authorized");return respond(403,{error:"not_authorized"});}
 let input;try{input=await req.json()}catch{return respond(400,{error:"invalid_json"})}
 if(!["document_review_list","document_review_request","loan_options","list","detail","save_checks","save_contract","save","members","set_member","provision","shift_staff_list","shift_staff_save","sync_members_from_sheet"].includes(input?.action))return respond(400,{error:"invalid_action"});
 if(input.action==="loan_options"){
  const [drivers,vehicles]=await Promise.all([
   db.from("gf_driver_match_master_prod").select("driver_id,full_name,email").order("full_name"),
   db.from("gf_vehicles").select("vehicle_id,vehicle_number,vehicle_data")
  ]);
  if(drivers.error||vehicles.error)return respond(503,{error:"loan_options_unavailable"});
  const available=(vehicles.data||[]).filter(v=>String(v.vehicle_data?.["区分/ステータス"]||"").trim()==="空車").map(v=>({id:v.vehicle_id,number:v.vehicle_number||v.vehicle_data?.["車番"]||""})).filter(v=>v.number).sort((a,b)=>a.number.localeCompare(b.number,"ja"));
  return respond(200,{drivers:(drivers.data||[]).filter(v=>v.driver_id&&v.full_name).map(v=>({id:v.driver_id,name:v.full_name,email:v.email||""})),vehicles:available});
 }
 if(input.action==="members"){
  if(access.role!=="owner")return respond(403,{error:"owner_only"});
  const {data,error}=await db.from("gf_reception_access").select("email,role,enabled,staff_name").order("email");
  return error?respond(503,{error:"members_unavailable"}):respond(200,{members:data});
 }
 if(input.action==="sync_members_from_sheet"){
  if(access.role!=="owner")return respond(403,{error:"owner_only"});
  try{
   const token=await googleToken(),rows=await accessSheetRows(token);
   const items:{email:string,role:string,enabled:boolean,staff_name:string}[]=[];
   const seen=new Set<string>();
   for(const row of rows.slice(1)){
    const e=clean(row[0]).toLowerCase();if(!e)continue;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||seen.has(e))return respond(409,{error:"invalid_or_duplicate_sheet_email"});
    seen.add(e);
    if(clean(row[3])!=="GOLD FIRST")continue;
    const role=clean(row[1])==="最高管理者"?"owner":clean(row[1]).startsWith("スタッフ")?"staff":null;
    if(!role)return respond(409,{error:"invalid_sheet_role"});
    const status=clean(row[2]);if(!["有効","停止","登録候補"].includes(status))return respond(409,{error:"invalid_sheet_status"});
    items.push({email:e,role,enabled:status==="有効"||status==="登録候補",staff_name:clean(row[5])});
   }
   if(!items.length)return respond(409,{error:"empty_permissions_sheet"});
   // Do not disable accounts absent from the sheet; keep the original domain owner intact.
   const {error}=await db.from("gf_reception_access").upsert(items,{onConflict:"email"});
   return error?respond(503,{error:"permissions_sync_failed"}):respond(200,{成功:true,count:items.length});
  }catch(e){console.error("permissions_sheet_sync",e instanceof Error?e.message:"unknown");return respond(503,{error:"permissions_sheet_unavailable"});}
 }
 if(input.action==="provision"){
  if(access.role!=="owner")return respond(403,{error:"owner_only"});
  const {data:members,error:membersError}=await db.from("gf_reception_access").select("email").eq("enabled",true);
  if(membersError)return respond(503,{error:"members_unavailable"});
  const existing=new Set<string>();let page=1;
  while(page<=20){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)return respond(503,{error:"users_unavailable"});for(const u of data.users)if(u.email)existing.add(u.email.toLowerCase());if(data.users.length<1000)break;page++;}
  const created:string[]=[];const failed:string[]=[];
  for(const member of members||[]){if(existing.has(member.email))continue;const {error}=await db.auth.admin.createUser({email:member.email,email_confirm:true});if(error)failed.push(member.email);else created.push(member.email)}
  return respond(failed.length?207:200,{created,failed});
 }
 if(input.action==="set_member"){
  if(access.role!=="owner")return respond(403,{error:"owner_only"});
  const target=clean(input.email).toLowerCase(),role=clean(input.role),enabled=input.enabled===true,staffName=clean(input.staff_name);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)||target.length>254||!["owner","staff"].includes(role))return respond(400,{error:"invalid_member"});
  if(staffName.length>100)return respond(400,{error:"staff_name_too_long"});
  if(target===email&&(!enabled||role!=="owner"))return respond(409,{error:"cannot_remove_own_owner_access"});
  if(enabled){
   const {data:users,error:listError}=await db.auth.admin.listUsers({page:1,perPage:1000});
   if(listError)return respond(503,{error:"users_unavailable"});
   if(!users.users.some(u=>u.email?.toLowerCase()===target)){
    const {error:createError}=await db.auth.admin.createUser({email:target,email_confirm:true});
    if(createError)return respond(503,{error:"user_provision_failed"});
   }
  }
  // Sheet first, then database: never report success when the source ledger was not updated.
  try{
   const token=await googleToken(),rows=await accessSheetRows(token);
   const matches=rows.slice(1).map((r,i)=>({row:i+2,email:clean(r[0]).toLowerCase(),values:r})).filter(x=>x.email===target);
   if(matches.length>1)return respond(409,{error:"duplicate_permissions_sheet_email"});
   const row=matches.length?matches[0].row:rows.length+1;
   const previous=matches[0]?.values||[];
   const values=[target,role==="owner"?"最高管理者":"スタッフ",enabled?"有効":"停止","GOLD FIRST",clean(previous[4])||"アプリから登録",staffName];
   await writeAccessSheet(token,row,values);
  }catch(e){console.error("permissions_sheet_save",e instanceof Error?e.message:"unknown");return respond(503,{error:"permissions_sheet_write_failed"});}
  const {error}=await db.from("gf_reception_access").upsert({email:target,role,enabled,staff_name:staffName},{onConflict:"email"});
  return error?respond(503,{error:"member_saved_sheet_only_retry_sync"}):respond(200,{成功:true});
 }
 if(input.action==="shift_staff_list"||input.action==="shift_staff_save"){
  if(access.role!=="owner")return respond(403,{error:"owner_only"});
  const shiftId="1R7tY4M33m6ebZdewb_0RKcaZQLvSa2fhxpE-kSRTihg";
  const sheetName="'スタッフマスター'";
  try{
   const token=await googleToken();
   const base="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(shiftId)+"/values/";
   const range=sheetName+"!A1:E";
   const result=await fetch(base+encodeURIComponent(range),{headers:{"Authorization":"Bearer "+token}});
   if(!result.ok)return respond(result.status===403||result.status===404?503:502,{error:"shift_sheet_access_unavailable",google_status:result.status});
   const data=await result.json();
   const values=(data.values||[]) as unknown[][];
   const expected=["スタッフ名","カレンダー色","登録日","メモ","時給"];
   if(expected.some((v,i)=>clean(values[0]?.[i])!==v))return respond(409,{error:"shift_headers_changed"});
   const staff=values.slice(1).map((row,i)=>({row:i+2,name:clean(row[0]),color:clean(row[1]),registered_at:clean(row[2]),memo:clean(row[3]),hourly_wage:clean(row[4])})).filter(x=>x.name||x.color||x.registered_at||x.memo||x.hourly_wage);
   if(input.action==="shift_staff_list")return respond(200,{staff});
   const row=Number(input.row),oldName=clean(input.old_name),oldColor=clean(input.old_color),oldWage=clean(input.old_wage);
   const name=clean(input.name),color=clean(input.color),wage=clean(input.hourly_wage);
   if(!Number.isInteger(row)||row<2||row>10000||name.length>100||!name||color.length>100||wage.length>30||wage&&!/^(?:0|[1-9]\\d{0,8})(?:\.\\d{1,2})?$/.test(wage))return respond(400,{error:"invalid_shift_staff"});
   const current=staff.find(x=>x.row===row);
   if(!current||current.name!==oldName||current.color!==oldColor||current.hourly_wage!==oldWage)return respond(409,{error:"shift_staff_changed_reload"});
   if(staff.some(x=>x.row!==row&&x.name===name))return respond(409,{error:"duplicate_staff_name"});
   const updates=[{range:sheetName+"!A"+row,values:[[name]]},{range:sheetName+"!B"+row,values:[[color]]},{range:sheetName+"!E"+row,values:[[wage]]}];
   const write=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(shiftId)+"/values:batchUpdate",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data:updates})});
   if(!write.ok)return respond(503,{error:"shift_staff_write_failed",google_status:write.status});
   return respond(200,{success:true,row});
  }catch(e){console.error("shift_staff_operation",e instanceof Error?e.message:"unknown");return respond(503,{error:"shift_staff_operation_unavailable"});}
 }
 if(!Deno.env.get("GF_GOOGLE_SERVICE_ACCOUNT_JSON")||!Deno.env.get("GF_LINE_RECEPTION_SHEET_ID"))return respond(503,{error:"sheets_adapter_not_configured"});
 try{
  const token=await googleToken();
  const sheet=await sheetRequest(token,"'LINE受付管理'!A1:Z");
  const rows=table(sheet.values||[]).filter(x=>x.value["受付種別"]==="車両依頼");
  if(input.action==="list")return respond(200,{一覧:rows.map(x=>x.value)});
  if(input.action==="detail"){
   const id=clean(input.receipt_id);
   if(!id||id.length>150)return respond(400,{error:"invalid_reception_id"});
   const matched=rows.filter(x=>x.value["受付ID"]===id);
   if(matched.length!==1)return respond(409,{error:"reception_id_not_unique"});
   const detail=await sheetRequest(token,"'車両依頼受付'!A1:AZ");
   const detailRows=table(detail.values||[]);
   if(!(detail.values?.[0]||[]).map(clean).includes("LINE受付ID"))return respond(503,{error:"detail_link_column_missing"});
   const found=detailRows.filter(x=>x.value["LINE受付ID"]===id);
   if(found.length!==1)return respond(409,{error:found.length?"detail_not_unique":"detail_not_found"});
   const permitted=["受付番号","氏名","フリガナ","電話番号","契約者メールアドレス","緊急連絡先氏名","緊急連絡先電話番号","緊急連絡先メールアドレス","所属会社名","稼働エリア","納車希望","稼働開始希望","既存候補判定","免許証PDF","住民票PDF","書類フォルダ","書類状態","免許証確認","住民票確認","既存ドライバー確認","確認DriverID","契約内容確認","契約状況","契約更新日時"];
   const output=Object.fromEntries(permitted.map(k=>[k,found[0].value[k]||""]));
   return respond(200,{詳細:output});
  }

  if(["document_review_list","document_review_request","document_review_approve","document_review_again"].includes(input.action)){
   if(!["owner","staff"].includes(access.role))return respond(403,{error:"not_authorized"});
   const id=clean(input.receipt_id);
   if(!id||rows.filter(x=>x.value["受付ID"]===id).length!==1)return respond(409,{error:"reception_id_not_unique"});
   const detail=await sheetRequest(token,"'車両依頼受付'!A1:AZ");
   const headers=(detail.values?.[0]||[]).map(clean);
   if(["LINE受付ID","受付番号","確認DriverID"].some(k=>headers.filter(h=>h===k).length!==1))return respond(409,{error:"detail_headers_invalid"});
   const found=table(detail.values||[]).filter(x=>x.value["LINE受付ID"]===id);
   if(found.length!==1)return respond(409,{error:"detail_not_unique"});
   const receipt=clean(found[0].value["受付番号"]),driver=clean(found[0].value["確認DriverID"]);
   if(!receipt||!driver)return respond(409,{error:"driver_not_linked"});
   const {data:app,error:appError}=await db.from("gf_mypage_applications_prod").select("receipt_id,driver_id").eq("receipt_id",receipt).eq("driver_id",driver).maybeSingle();
   if(appError||!app)return respond(409,{error:"application_not_verified"});
   if(input.action==="document_review_list"){
    const {data,error}=await db.from("gf_driver_document_review_requests").select("id,document_type,reason,status,created_at").eq("receipt_id",receipt).eq("driver_id",driver).order("created_at",{ascending:false}).limit(50);
    if(error)return respond(503,{error:"document_review_unavailable"});
    const submitted=(data||[]).filter(x=>x.status==="submitted").map(x=>x.id);
    const latest=new Map<string,string>();
    if(submitted.length){
     const {data:attempts,error:attemptError}=await db.from("gf_driver_document_attempts").select("request_id,drive_file_id,created_at,id").in("request_id",submitted).order("created_at",{ascending:false}).order("id",{ascending:false});
     if(attemptError)return respond(503,{error:"document_attempts_unavailable"});
     for(const a of attempts||[])if(!latest.has(a.request_id)&&/^[A-Za-z0-9_-]{10,200}$/.test(a.drive_file_id))latest.set(a.request_id,a.drive_file_id);
    }
    return respond(200,{approval_enabled:Deno.env.get("GF_DOCUMENT_REVIEW_WRITE_ENABLED")==="YES"&&Deno.env.get("GF_DOCUMENT_APPROVAL_BRIDGE_ENABLED")==="YES",requests:(data||[]).map(x=>({...x,review_file_url:latest.has(x.id)?"https://drive.google.com/file/d/"+latest.get(x.id)+"/view":null}))});
   }
   // Explicit server-side rollout guard; no production writes by default.
   if(Deno.env.get("GF_DOCUMENT_REVIEW_WRITE_ENABLED")!=="YES")return respond(503,{error:"document_review_write_disabled"});
   if(["document_review_approve","document_review_again"].includes(input.action)){
    const requestId=clean(input.request_id);
    if(!/^[0-9a-f-]{36}$/i.test(requestId))return respond(400,{error:"invalid_request_id"});
    const {data:review,error:reviewError}=await db.from("gf_driver_document_review_requests").select("id,document_type,status,updated_at").eq("id",requestId).eq("receipt_id",receipt).eq("driver_id",driver).eq("status","submitted").maybeSingle();
    if(reviewError||!review)return respond(409,{error:"submission_not_available"});
    if(input.action==="document_review_again"){
     const reason=clean(input.reason);
     if(!reason||reason.length>1000)return respond(400,{error:"invalid_reason"});
     const {data,error}=await db.from("gf_driver_document_review_requests").update({status:"requested",reason,updated_at:new Date().toISOString()}).eq("id",requestId).eq("status","submitted").eq("updated_at",review.updated_at).select("id,status").maybeSingle();
     return error||!data?respond(409,{error:"review_changed"}):respond(200,{request:data});
    }
    // Approval must use the serialized, identity-verified GAS writer; fail closed until connected.
    const bridgeUrl=Deno.env.get("GF_DOCUMENT_APPROVAL_BRIDGE_URL")||"";
    const secret=Deno.env.get("GF_DOCUMENT_BRIDGE_SECRET")||"";
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(bridgeUrl)||secret.length<32)return respond(503,{error:"approval_bridge_not_configured"});
    const {data:attempt,error:attemptError}=await db.from("gf_driver_document_attempts").select("id,drive_file_id").eq("request_id",requestId).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
    if(attemptError||!attempt||!/^[A-Za-z0-9_-]{10,200}$/.test(attempt.drive_file_id))return respond(409,{error:"attempt_not_verified"});
    const payload=JSON.stringify({action:"document_review_approve",issuedAt:Date.now(),nonce:crypto.randomUUID(),review:{receiptId:receipt,driverId:driver,fileId:attempt.drive_file_id,documentType:review.document_type,status:"submitted",verified:true,requestId,attemptId:attempt.id}});
    const enc=new TextEncoder();
    const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload)));
    const signature=btoa(String.fromCharCode(...mac)).split("+").join("-").split("/").join("_").replace(/=+$/,"");
    if(Deno.env.get("GF_DOCUMENT_APPROVAL_BRIDGE_ENABLED")!=="YES")return respond(503,{error:"approval_bridge_disabled"});
    const {data:claim,error:claimError}=await db.from("gf_driver_document_review_requests")
     .update({status:"approving",updated_at:new Date().toISOString()})
     .eq("id",requestId).eq("receipt_id",receipt).eq("driver_id",driver)
     .eq("status","submitted").eq("updated_at",review.updated_at)
     .select("id,updated_at").maybeSingle();
    if(claimError)return respond(503,{error:"approval_claim_unavailable"});
    if(!claim)return respond(409,{error:"review_changed"});
    // Preserve the claim whenever GAS might have written. A timeout cannot prove that it did not.
    try{
     const response=await fetch(bridgeUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload,signature}),signal:AbortSignal.timeout(45000)});
     if(!response.ok)return respond(503,{error:"approval_reconciliation_required"});
     const saved=await response.json();
     if(saved.verified!==true||saved.fileId!==attempt.drive_file_id)return respond(409,{error:"approval_reconciliation_required"});
     const {data:approved,error:approvalError}=await db.from("gf_driver_document_review_requests")
      .update({status:"approved",updated_at:new Date().toISOString()})
      .eq("id",claim.id).eq("status","approving").eq("updated_at",claim.updated_at)
      .select("id,status").maybeSingle();
     if(approvalError||!approved)return respond(503,{error:"approval_reconciliation_required"});
     return respond(200,{request:approved});
    }catch{
     return respond(503,{error:"approval_reconciliation_required"});
    }
   }
   const type=clean(input.document_type),reason=clean(input.reason);
   if(!["driver_license","residence_certificate"].includes(type)||!reason||reason.length>1000)return respond(400,{error:"invalid_document_request"});
   const check=type==="driver_license"?"免許証確認":"住民票確認";
   if(type==="residence_certificate"){
    if(["住民票PDF","書類状態"].some(k=>headers.filter(h=>h===k).length!==1))return respond(409,{error:"residence_columns_invalid"});
    const v=found[0].value,doc=clean(v["住民票PDF"]),state=clean(v["書類状態"]);
    if(/郵送/.test(doc)||/郵送/.test(state))return respond(409,{error:"postal_residence_no_upload_required"});
    if(!doc)return respond(409,{error:"residence_upload_not_confirmed"});
   }
   if(clean(found[0].value[check])==="確認OK")return respond(409,{error:"reset_existing_check_first"});
   const {data,error}=await db.from("gf_driver_document_review_requests").insert({receipt_id:receipt,driver_id:driver,document_type:type,reason,status:"requested"}).select("id,status").single();
   return error?respond(409,{error:"document_request_conflict_or_unavailable"}):respond(200,{request:data});
  }
  if(input.action==="save_checks"){
   const id=clean(input.receipt_id),checks=input.checks;
   if(!id||id.length>150||!checks||typeof checks!=="object"||Array.isArray(checks))return respond(400,{error:"invalid_checks_request"});
   if(rows.filter(x=>x.value["受付ID"]===id).length!==1)return respond(409,{error:"reception_id_not_unique"});
   const detail=await sheetRequest(token,"'車両依頼受付'!A1:AZ");
   const headers=(detail.values?.[0]||[]).map(clean);
   const allowed=["免許証確認","住民票確認"];
   if(["LINE受付ID",...allowed].some(k=>headers.filter(h=>h===k).length!==1))return respond(503,{error:"contract_columns_missing_or_duplicate"});
   if(Object.keys(checks).some(k=>!allowed.includes(k))||Object.keys(checks).length!==allowed.length)return respond(400,{error:"invalid_checks_fields"});
   const found=table(detail.values||[]).filter(x=>x.value["LINE受付ID"]===id);
   if(found.length!==1)return respond(409,{error:"detail_not_unique_or_missing"});
   const v=found[0].value,receipt=clean(v["受付番号"]);
   if(!receipt)return respond(409,{error:"application_receipt_missing"});
   if(clean(v["契約状況"])==="契約完了")return respond(409,{error:"completed_contract_checks_locked"});
   const yes=["未確認","確認OK"];
   if(!yes.includes(clean(checks["免許証確認"]))||!yes.includes(clean(checks["住民票確認"])))return respond(400,{error:"invalid_check_value"});
   const sheetId=Deno.env.get("GF_LINE_RECEPTION_SHEET_ID")!;
   const changes=allowed.filter(k=>clean(v[k])!==clean(checks[k])).map(k=>({range:"'車両依頼受付'!"+col(headers.indexOf(k))+found[0].index,values:[[clean(checks[k])]]}));
   if(!changes.length)return respond(200,{成功:true,変更なし:true,確認項目:Object.fromEntries(allowed.map(k=>[k,clean(v[k])]))});
   const write=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(sheetId)+"/values:batchUpdate",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data:changes})});
   if(!write.ok)return respond(503,{error:"checks_sheet_write_failed"});
   return respond(200,{成功:true,確認項目:Object.fromEntries(allowed.map(k=>[k,clean(checks[k])]))});
  }
  if(input.action==="save_contract"){
   const id=clean(input.receipt_id),desired=clean(input.contract_status);
   if(!id||id.length>150||!["未送信","送信済み","契約完了"].includes(desired))return respond(400,{error:"invalid_contract_request"});
   if(rows.filter(x=>x.value["受付ID"]===id).length!==1)return respond(409,{error:"reception_id_not_unique"});
   const detail=await sheetRequest(token,"'車両依頼受付'!A1:AZ");
   const headers=(detail.values?.[0]||[]).map(clean);
   const needed=["LINE受付ID","受付番号","免許証確認","住民票確認","契約状況","契約更新日時"];
   if(needed.some(k=>headers.filter(h=>h===k).length!==1))return respond(503,{error:"contract_columns_missing_or_duplicate"});
   const found=table(detail.values||[]).filter(x=>x.value["LINE受付ID"]===id);
   if(found.length!==1)return respond(409,{error:"detail_not_unique_or_missing"});
   const entry=found[0],v=entry.value,receipt=clean(v["受付番号"]);
   if(!receipt)return respond(409,{error:"application_receipt_missing"});
   if(!["未送信","送信済み","契約完了",""].includes(clean(v["契約状況"])))return respond(409,{error:"unknown_existing_contract_status"});
   const ready=v["免許証確認"]==="確認OK"&&v["住民票確認"]==="確認OK";
   if(desired!=="未送信"&&!ready)return respond(409,{error:"contract_checks_incomplete"});
   const {data:apps,error:appError}=await db.from("gf_mypage_applications_prod").select("receipt_id,driver_id,contract_status").eq("receipt_id",receipt).limit(2);
   if(appError)return respond(503,{error:"mypage_lookup_failed"});
   if(!apps||apps.length!==1)return respond(409,{error:"mypage_application_missing_or_duplicate"});
   const app=apps[0];
   if(!clean(app.driver_id))return respond(409,{error:"mypage_driver_not_linked"});
   const current=clean(v["契約状況"])||"未送信";
   if((clean(app.contract_status)||"未送信")!==current)return respond(409,{error:"contract_sync_conflict"});
   if(current===desired)return respond(200,{成功:true,変更なし:true,契約状況:desired});
   const now=new Date().toISOString();
   const sheetId=Deno.env.get("GF_LINE_RECEPTION_SHEET_ID")!;
   const changes=[{range:"'車両依頼受付'!"+col(headers.indexOf("契約状況"))+entry.index,values:[[desired]]},{range:"'車両依頼受付'!"+col(headers.indexOf("契約更新日時"))+entry.index,values:[[now]]}];
   const endpoint="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(sheetId)+"/values:batchUpdate";
   const write=await fetch(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data:changes})});
   if(!write.ok)return respond(503,{error:"contract_sheet_write_failed"});
   let updateQuery=db.from("gf_mypage_applications_prod").update({contract_status:desired,contract_updated_at:now,updated_at:now}).eq("receipt_id",receipt).eq("driver_id",app.driver_id);
   updateQuery=app.contract_status==null?updateQuery.is("contract_status",null):updateQuery.eq("contract_status",app.contract_status);
   const {data:updated,error:updateError}=await updateQuery.select("receipt_id");
   if(updateError||updated?.length!==1)return respond(503,{error:"contract_sheet_saved_mypage_sync_failed"});
   return respond(200,{成功:true,契約状況:desired,マイページ同期:true});
  }
  const record=input.record||{},id=clean(record["受付ID"]);
  if(!id||id.length>150)return respond(400,{error:"invalid_reception_id"});
  const matches=rows.filter(x=>x.value["受付ID"]===id);
  if(matches.length!==1)return respond(409,{error:"reception_id_not_unique"});
  const status=clean(record["ステータス"]);
  if(!["未対応","受付済","対応中","確認待ち","完了"].includes(status))return respond(400,{error:"invalid_status"});
  const head=(sheet.values?.[0]||[]).map(clean);
  for(const k of ["ステータス","担当者","対応メモ"])if(!head.includes(k))return respond(503,{error:"required_column_missing"});
  const updates=[["ステータス",status],["担当者",clean(record["担当者"])],["対応メモ",clean(record["対応メモ"])]];
  if(updates[1][1].length>150||updates[2][1].length>4000)return respond(400,{error:"field_too_long"});
  // Avoid cross-row writes and preserve every unrelated column.
  // Sheets API batchUpdate does not provide compare-and-swap: callers should serialize writes per ID.
  const sheetId=Deno.env.get("GF_LINE_RECEPTION_SHEET_ID")!;
  const data=updates.map(([name,value])=>({range:"'LINE受付管理'!"+col(head.indexOf(name))+matches[0].index,values:[[value]]}));
  const endpoint="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(sheetId)+"/values:batchUpdate";
  const res=await fetch(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data})});
  if(!res.ok)throw Error("google_sheets_write_failed_"+res.status);
  return respond(200,{成功:true});
 }catch(e){const message=e instanceof Error?e.message:"unknown_error";console.error("gf-line-reception-admin",message);return respond(503,{error:message.startsWith("sheets_adapter_not_configured")?"sheets_adapter_not_configured":"sheets_operation_failed"});}
});
