import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const ORIGIN="https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site";
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
const VALIDATION_LINE_BOOK="12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8";
async function sheetRequest(token:string,range:string,method="GET",body?:unknown){
 const sheetId=VALIDATION_LINE_BOOK;
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
 const isValidationProject=url==='https://zwprphmfgobkektzsuti.supabase.co';
 if(!isValidationProject)return respond(503,{error:"validation_project_mismatch"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authErr}=await db.auth.getUser(bearer);
 if(authErr||!user)return respond(401,{error:"invalid_session"});
 const email=(user.email||"").trim().toLowerCase();
 const {data:access,error:accessErr}=await db.from("gf_reception_access").select("email,role,enabled").eq("email",email).maybeSingle();
 if(accessErr)return respond(503,{error:"authorization_unavailable"});
 if(!access?.enabled){console.warn("gf_reception_access_denied","not_authorized");return respond(403,{error:"not_authorized"});}
 let input;try{input=await req.json()}catch{return respond(400,{error:"invalid_json"})}
 if(!["loan_options","list","detail","waiting_registration_check","waiting_register","save_checks","save_contract","save","members","set_member","provision","shift_staff_list","shift_staff_save","sync_members_from_sheet"].includes(input?.action))return respond(400,{error:"invalid_action"});
 if(["waiting_registration_check","waiting_register"].includes(input.action) && !["owner","staff"].includes(access.role)){
  return respond(403,{error:"not_authorized"});
 }
 if(isValidationProject){
  const allowed=["list","detail","waiting_registration_check","waiting_register"];
  if(!allowed.includes(input.action))return respond(403,{error:"validation_action_disabled"});
  const configuredBook=Deno.env.get("GF_LINE_RECEPTION_SHEET_ID");
  if(configuredBook && configuredBook!==VALIDATION_LINE_BOOK){
   return respond(503,{error:"validation_target_mismatch"});
  }
 }
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
 if(!Deno.env.get("GF_GOOGLE_SERVICE_ACCOUNT_JSON"))return respond(503,{error:"sheets_adapter_not_configured"});
 try{
  const token=await googleToken();
  const sheet=await sheetRequest(token,"'LINE受付管理'!A1:Z");
  const rows=table(sheet.values||[]).filter(x=>x.value["受付種別"]==="車両依頼");
  if(input.action==="list")return respond(200,{一覧:rows.map(x=>x.value)});
  if(["waiting_registration_check","waiting_register"].includes(input.action)){
   const id=clean(input.receipt_id);
   if(!id||id.length>150)return respond(400,{error:"invalid_reception_id"});
   const lineHeaders=(sheet.values?.[0]||[]).map(clean);
   if(["受付ID","受付種別","DriverID"].some(k=>lineHeaders.filter(h=>h===k).length!==1)){
    return respond(503,{error:"waiting_line_columns_missing_or_duplicate"});
   }
   const lineRows=table(sheet.values||[]).filter(row=>row.value["受付ID"]===id);
   if(lineRows.length!==1||lineRows[0].value["受付種別"]!=="車両依頼"){
    return respond(409,{error:"reception_id_not_unique"});
   }
   const detail=await sheetRequest(token,"'車両依頼受付'!A1:AZ");
   const headers=(detail.values?.[0]||[]).map(clean);
   if(["LINE受付ID","受付識別子","確認DriverID","書類状態"].some(k=>headers.filter(h=>h===k).length!==1)){
    return respond(503,{error:"waiting_receipt_columns_missing_or_duplicate"});
   }
   const entries=table(detail.values||[]);
   const found=entries.filter(row=>row.value["LINE受付ID"]===id);
   if(found.length!==1)return respond(409,{error:"detail_not_unique_or_missing"});
   const receipt=found[0].value;
   const receiptKey=receipt["受付識別子"];
   const driverId=lineRows[0].value.DriverID;
   if(receipt["書類状態"]!=="保存完了"||!/^[a-f0-9]{64}$/i.test(receiptKey)||
      entries.filter(row=>row.value["受付識別子"]===receiptKey).length!==1||
      !/^D\d{6}$/.test(driverId)||receipt["確認DriverID"]!==driverId){
    return respond(409,{error:"waiting_receipt_not_confirmed"});
   }
   if(input.action==="waiting_registration_check")return respond(200,{受付照合:true});
   if(!isValidationProject||Deno.env.get("GF_WAITING_REGISTER_ENABLED")!=="true")return respond(503,{error:"waiting_registration_disabled"});
   const endpoint=Deno.env.get("GF_WAITING_GAS_URL")||"";
   const secret=Deno.env.get("GF_WAITING_GAS_SECRET")||"";
   if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)||secret.length<32){
    return respond(503,{error:"waiting_registration_not_configured"});
   }
   const action="gfa_waiting_register_v1",issuedAt=Date.now(),encoder=new TextEncoder();
   const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
   const signature=bytes(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(
    JSON.stringify([action,id,receiptKey,driverId,issuedAt])
   ))));
   try{
   const gas=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,receiptId:id,receiptKey,driverId,issuedAt,signature}),signal:AbortSignal.timeout(20000)});
   if(!gas.ok)return respond(503,{error:"waiting_registration_unavailable"});
   const answer=await gas.json();
   if(answer?.status===200&&["registered","already_registered"].includes(answer.state)){
    return respond(200,{登録状態:answer.state});
   }
   if(answer?.status===409)return respond(409,{error:"waiting_registration_review_required"});
   return respond(503,{error:"waiting_registration_unavailable"});
   }catch(_){return respond(503,{error:"waiting_registration_unavailable"});}
  }
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
   return respond(200,{詳細:output,名変待ち登録可能:isValidationProject&&Deno.env.get("GF_WAITING_REGISTER_ENABLED")==="true"});
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
