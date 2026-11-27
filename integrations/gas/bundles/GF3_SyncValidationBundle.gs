/** Dedicated three-sheet validation namespace. No production or old workbook fallback. */
function GF3_AssertBook_(book){
 const p=PropertiesService.getScriptProperties();
 const id='1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0';
 const script='1h5czlOaSO0WeERVDxiGajVipVL4PAVyWPdaIB0kGVZsR11GMU12JwEE-';
 if(!book||book.getId()!==id||ScriptApp.getScriptId()!==script||p.getProperty('GF3_EXPECTED_SCRIPT_ID')!==script||p.getProperty('GF3_APPROVED_BOOK_ID')!==id||p.getProperty('GF3_VALIDATION_ENABLED')!=='true')throw Error('gf3_configuration_denied');
 return book;
}
function GF3_Open_(){return GF3_AssertBook_(SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0'));}
function GF3_AssertSheet_(s){if(!s||!['車両台帳','名変待ち管理','ドライバーマスター'].includes(s.getName()))throw Error('gf3_sheet_denied');GF3_AssertBook_(s.getParent());return s;}
function GF3_WriteEnabled_(book){GF3_AssertBook_(book);return PropertiesService.getScriptProperties().getProperty('GF3_MIGRATION_VERIFIED')==='true'&&PropertiesService.getScriptProperties().getProperty('GF3_SYNC_ENABLED')==='true';}
function GF3_Columns_(s,keys){GF3_AssertSheet_(s);const h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].map(x=>x.trim());return Object.fromEntries(keys.map(k=>{const a=h.map((v,i)=>v===k?i:-1).filter(i=>i>=0);if(a.length!==1)throw Error('gf3_column_missing_or_duplicate:'+k);return [k,a[0]];}));}
/** Isolated sync storage client. Uses existing test token; no production fallback. */
function GF3_GF_SyncStorageTest_(book,action,kind,id,args){
 GF3_AssertBook_(book);
 if(action!=='health'&&!GF3_WriteEnabled_(book))throw Error('validation_disabled');
 const token=PropertiesService.getScriptProperties().getProperty('GF3_SYNC_TEST_TOKEN');
 if(!token||token.length<32)throw Error('sync_storage_token_missing');
 if(!['health','read','insert','transition','candidates'].includes(action))throw Error('sync_storage_action_denied');
 if(!['health','candidates'].includes(action)){
 if(!['history','queue'].includes(kind))throw Error('sync_storage_kind_denied');
 if(!(kind==='history'?/^[a-f0-9]{64}$/:/^TEST-[A-Z0-9-]{1,64}$/).test(id))throw Error('sync_storage_id_denied');
 }
 const payload=Object.assign({},args||{},{action,kind,id});
 const response=UrlFetchApp.fetch('https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf3-sync-storage-test',{method:'post',contentType:'application/json',headers:{'x-gf3-sync-token':token},payload:JSON.stringify(payload),followRedirects:false,muteHttpExceptions:true});
 if(response.getResponseCode()!==200)throw Error('sync_storage_http_'+response.getResponseCode());
 const result=JSON.parse(response.getContentText());
 if(result.ok!==true)throw Error('sync_storage_failed');
 return result.data;
}
function GF3_GF_SyncStorageTestRead_(book,kind,id){
 const rows=GF3_GF_SyncStorageTest_(book,'read',kind,id);
 if(!Array.isArray(rows)||rows.length>1)throw Error('sync_storage_invalid_rows');
 return rows[0]||null;
}
function GF3_GF_SyncStorageTestInsert_(book,kind,row){
 const id=kind==='history'?row.receipt_key:row.request_id;
 return GF3_GF_SyncStorageTest_(book,'insert',kind,id,{row});
}
function GF3_GF_SyncStorageTestTransition_(book,id,expected,next,result){
 if(GF3_GF_SyncStorageTest_(book,'transition','queue',id,{expected,next,result})!==true)throw Error('sync_storage_state_conflict');
}
function GF3_GF_検証同期DB接続診断(){
 const book=GF3_Open_();
 GF3_GF_SyncStorageTest_(book,'health');
 GF3_GF_ScheduleStorageTest_(book,'health');
 const result={connected:true,sync:true,schedule:true};
 console.log(JSON.stringify(result));return result;
}

/** Validation-only adapters. Existing entrypoints remain unchanged until cutover. */
function GF3_GFA_DB同期履歴照合_(book,requestKey){
 const row=GF3_GF_SyncStorageTestRead_(book,'history',String(requestKey).trim().toLowerCase());
 if(!row)return null;
 return {'処理状態':String(row.state||''),'LINE受付ID':String(row.line_receipt_id||''),DriverID:String(row.driver_id||'')};
}
function GF3_GFW_DB同期依頼追加_(book,vehicleId,action,driverId){
 GF3_AssertBook_(book);
 driverId=String(driverId||'').trim();
 if(!/^V9[0-9]{5}$/.test(vehicleId)||!(/^D999[0-9]{3}$/.test(driverId)||(action==='取消'&&!driverId))||!['割当','取消'].includes(action))throw Error('validation_assignment_denied');
 const id='TEST-GF3-'+Utilities.getUuid().toUpperCase();
 GF3_GF_SyncStorageTestInsert_(book,'queue',{request_id:id,requested_at:new Date().toISOString(),vehicle_id:vehicleId,operation:action,driver_id:driverId,state:'待機',attempts:0});
 const saved=GF3_GF_SyncStorageTestRead_(book,'queue',id);
 if(!saved||saved.vehicle_id!==vehicleId||saved.driver_id!==driverId||saved.operation!==action)throw Error('assignment_queue_readback_failed');
 return id;
}


/** Read-only inventory before cutover. Never creates or deletes triggers. */
function GF3_GF_検証トリガー棚卸し(){
 const book=GF3_Open_();
 GF3_AssertBook_(book);
 const triggers=ScriptApp.getProjectTriggers().map(t=>({
 handler:t.getHandlerFunction(),event:String(t.getEventType()),source:String(t.getTriggerSource()),sourceId:t.getTriggerSourceId()||null
 }));
 const result={spreadsheetId:book.getId(),triggers,sheets:book.getSheets().map(s=>s.getName()),required:['車両台帳','名変待ち管理','ドライバーマスター']};
 console.log(JSON.stringify(result));return result;
}

function GF3_GF_DB同期候補取得_(book){
 const rows=GF3_GF_SyncStorageTest_(book,'candidates');
 if(!Array.isArray(rows)||rows.length>5||rows.some(r=>r.state!=='待機'||!/^TEST-[A-Z0-9-]{1,64}$/.test(r.request_id)||!/^V9[0-9]{5}$/.test(r.vehicle_id)))throw Error('invalid_candidates');
 return rows.filter(r=>r.request_id.startsWith('TEST-GF3-'));
}


/** Isolated worker: caller must provide a verified test-only synchronization callback. */
function GF3_GF_DB同期ワーカー本体_(book,sync){
 GF3_AssertBook_(book);
 if(typeof sync!=='function')throw Error('isolated_sync_callback_missing');
 const result={completed:0,review:0,deferred:0};
 const matches=(v,q)=>{const d=String(v.data.DriverID||'').trim(),n=String(v.data['現在使用者']||'').trim();return q.operation==='割当'?d===q.driver_id&&!!n:q.operation==='取消'&&!d&&!n;};
 for(const q of GF3_GF_DB同期候補取得_(book)){
  const id=q.request_id;
  const claimed=GF3_GF_SyncStorageTest_(book,'transition','queue',id,{expected:'待機',next:'処理中'});
  if(claimed!==true){result.deferred++;continue;}
  try{
   const before=GF3_GF_DB同期車両情報_(book,q.vehicle_id);
   if(!matches(before,q))throw Error('ledger_mismatch');
   sync(book,before.row,q);
   SpreadsheetApp.flush();
   const after=GF3_GF_DB同期車両情報_(book,q.vehicle_id);
   if(!matches(after,q))throw Error('ledger_changed');
   const done=GF3_GF_SyncStorageTest_(book,'transition','queue',id,{expected:'処理中',next:'完了',result:'同期後台帳照合済み'});
   if(done!==true)throw Error('completion_conflict');
   result.completed++;
  }catch(e){
   GF3_GF_SyncStorageTestTransition_(book,id,'処理中','要確認',String(e.message||e).slice(0,500));
   result.review++;
  }
 }
 return result;
}

function GF3_GF_DB同期車両情報_(book,id){
 GF3_AssertBook_(book);
 if(!/^V9\d{5}$/.test(id))throw Error('validation_vehicle_denied');
 const sheet=GF3_AssertSheet_(book.getSheetByName('車両台帳'));
 const [headers,...rows]=sheet.getDataRange().getDisplayValues();
 const cols=GF3_Columns_(sheet,['VehicleID','DriverID','現在使用者']);
 const matches=rows.map((row,i)=>({row,i})).filter(e=>String(e.row[cols.VehicleID]).trim()===id);
 if(matches.length!==1)throw Error('validation_vehicle_not_unique');
 return {sheet,row:matches[0].i+2,data:Object.fromEntries(headers.map((h,i)=>[h.trim(),matches[0].row[i]]))};
}

/** Validation only: explicit DriverID assignment; no legacy sheets or Drive writes. */
function GF3_GF_ThreeSheetAssignmentPlan_(vehicle,driver,q){
 const norm=v=>String(v==null?'':v).trim();
 if(norm(vehicle.VehicleID)!==q.vehicle_id)throw Error('vehicle_mismatch');
 const fields={'フリガナ':'フリガナ','電話番号':'電話番号','紹介元':'紹介元','所属会社名':'所属会社名','稼働エリア':'稼働エリア','契約者メールアドレス':'契約者メールアドレス','緊急連絡先氏名':'緊急連絡先氏名','緊急連絡先メールアドレス':'緊急連絡先メールアドレス','ドライバーステータス':'ステータス','ドライバー備考':'備考'};
 if(q.operation==='取消'){
 if(norm(vehicle.DriverID)||norm(vehicle['現在使用者']))throw Error('cancel_mismatch');
 return Object.fromEntries(Object.keys(fields).filter(k=>Object.prototype.hasOwnProperty.call(vehicle,k)).map(k=>[k,'']));
 }
 if(q.operation!=='割当'||!driver||norm(driver.DriverID)!==q.driver_id||norm(vehicle.DriverID)!==q.driver_id||!norm(driver['氏名'])||norm(driver['氏名'])!==norm(vehicle['現在使用者'])||norm(driver['ステータス'])!=='有効')throw Error('driver_mismatch');
 const patch={};
 for(const [target,source] of Object.entries(fields)){
 if(Object.prototype.hasOwnProperty.call(vehicle,target)){
 if(!Object.prototype.hasOwnProperty.call(driver,source))throw Error('master_column_missing:'+source);
 patch[target]=norm(driver[source]);
 }}
 return patch;
}
function GF3_GF_ThreeSheetAssignmentSync_(book,row,q){
 GF3_AssertBook_(book);
 if(!GF3_WriteEnabled_(book))throw Error('validation_disabled');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(1000))throw Error('assignment_busy');
 try{
 const v=GF3_GF_DB同期車両情報_(book,q.vehicle_id);
 if(v.row!==row)throw Error('row_changed');
 let driver=null;
 if(q.operation==='割当'){
 const s=GF3_AssertSheet_(book.getSheetByName('ドライバーマスター'));
 const [h,...rows]=s.getDataRange().getDisplayValues();
 const cols=GF3_Columns_(s,['DriverID','氏名','ステータス']);
 const matches=rows.filter(r=>String(r[cols.DriverID]).trim()===q.driver_id);
 if(matches.length!==1)throw Error('driver_not_unique');
 driver=Object.fromEntries(h.map((x,i)=>[x.trim(),matches[0][i]]));
 }
 const patch=GF3_GF_ThreeSheetAssignmentPlan_(v.data,driver,q);
 const keys=Object.keys(patch);
 if(keys.length){
 const cols=GF3_Columns_(v.sheet,keys);
 for(const k of keys){
 const cell=v.sheet.getRange(row,cols[k]+1);
 if(cell.getFormula())throw Error('formula_protected:'+k);
 }
 const snapshots=keys.map(k=>{const cell=v.sheet.getRange(row,cols[k]+1);return {cell,value:cell.getValue(),rich:cell.getRichTextValue(),format:cell.getNumberFormat()};});
 try{
 for(const k of keys){
 const cell=v.sheet.getRange(row,cols[k]+1);
 if(k==='電話番号')cell.setNumberFormat('@');
 if(k.includes('メールアドレス')&&patch[k])cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(patch[k]).setLinkUrl('mailto:'+patch[k]).build());
 else if(patch[k])cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(patch[k]).build());
 else cell.clearContent();
 }
 SpreadsheetApp.flush();
 const after=GF3_GF_DB同期車両情報_(book,q.vehicle_id);
 if(keys.some(k=>String(after.data[k]||'')!==patch[k]))throw Error('profile_readback_failed');
 }catch(e){
 try{
 for(const snap of snapshots){snap.cell.setNumberFormat(snap.format);if(snap.rich)snap.cell.setRichTextValue(snap.rich);else snap.cell.setValue(snap.value);}
 SpreadsheetApp.flush();
 }catch(restore){throw Error('profile_rollback_failed_manual_review');}
 throw e;
 }
 }
 return {ok:true};
 }finally{lock.releaseLock();}
}
function GF3_GF_検証3シート割当同期(){return GF3_GF_DB同期ワーカー本体_(GF3_Open_(),GF3_GF_ThreeSheetAssignmentSync_);}

/** Read-only migration planning. Explicit source and destination; no Drive mutation. */
function GF3_GF_ThreeSheetDocumentPlan_(target,sources){
 const fields=['車両フォルダ','📷車両状態フォルダ','📁 車両書類フォルダ','📄 最新車両書類','🔧整備書類フォルダ'];
 const id=String(target.VehicleID||'').trim();
 if(!/^V\d{6}$/.test(id))throw Error('invalid_vehicle');
 const valid=u=>typeof u==='string'&&/^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|file\/d\/)[A-Za-z0-9_-]+(?:[/?#].*)?$/.test(u);
 const patch={},conflicts=[];
 for(const s of sources)if(s.VehicleID!==id)throw Error('source_vehicle_mismatch');
 for(const k of fields){
 const urls=[...new Set(sources.map(s=>s[k]).filter(valid))];
 const current=target[k];
 if(current&&!valid(current)){if(urls.length)conflicts.push(k);continue;}
 if(urls.length>1||(current&&urls.some(u=>u!==current))){conflicts.push(k);continue;}
 if(!current&&urls.length===1)patch[k]=urls[0];
 }
 return {VehicleID:id,patch,conflicts};
}
function GF3_GF_ThreeSheetDocumentRead_(sheet,row){
 const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>x.trim());
 const range=sheet.getRange(row,1,1,h.length),v=range.getDisplayValues()[0],rich=range.getRichTextValues()[0],f=range.getFormulas()[0];
 const out={};
 h.forEach((k,i)=>{if(!k)return;if(Object.prototype.hasOwnProperty.call(out,k))throw Error('duplicate_header:'+k);out[k]=rich[i]&&rich[i].getLinkUrl()||f[i]||v[i];});
 return out;
}

/** Validation-only application of a reviewed plan. Never creates columns or folders. */
function GF3_GF_ThreeSheetDocumentApply_(book,id,sources){
 GF3_AssertBook_(book);
 if(!/^V9\d{5}$/.test(id))throw Error('validation_vehicle_required');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(1000))throw Error('document_busy');
 try{
 const v=GF3_GF_DB同期車両情報_(book,id);
 const target=GF3_GF_ThreeSheetDocumentRead_(v.sheet,v.row);
 const plan=GF3_GF_ThreeSheetDocumentPlan_(target,sources);
 if(plan.conflicts.length)return {ok:false,conflicts:plan.conflicts};
 const keys=Object.keys(plan.patch);
 const h=v.sheet.getRange(1,1,1,v.sheet.getLastColumn()).getDisplayValues()[0].map(x=>x.trim());
 const writes=keys.map(k=>{
 const matches=h.map((x,i)=>x===k?i+1:0).filter(Boolean);
 if(matches.length!==1)throw Error('destination_column_missing_or_duplicate:'+k);
 const cell=v.sheet.getRange(v.row,matches[0]);
 if(cell.getFormula()||cell.getDisplayValue())throw Error('destination_not_empty:'+k);
 return {k,cell};
 });
 for(const w of writes)w.cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(w.k+'を見る').setLinkUrl(plan.patch[w.k]).build());
 SpreadsheetApp.flush();
 const after=GF3_GF_ThreeSheetDocumentRead_(v.sheet,v.row);
 if(keys.some(k=>after[k]!==plan.patch[k]))throw Error('document_readback_failed');
 return {ok:true,updated:keys};
 }finally{lock.releaseLock();}
}

/** Pure validation import mapper. Does not write to Calendar. */
function GF3_GF_ScheduleImportPlan_(headers,rows){
 const h=headers.map(x=>String(x).trim());
 if(new Set(h.filter(Boolean)).size!==h.filter(Boolean).length)throw Error('duplicate_header');
 for(const k of ['予定種別','予定日','GoogleカレンダーEventID','カレンダー','VehicleID'])if(!h.includes(k))throw Error('missing_header:'+k);
 const seen=new Set();
 return rows.flatMap((r,i)=>{
 if(r.every(x=>x===''||x==null))return [];
 const d=Object.fromEntries(h.map((k,j)=>[k,r[j]]).filter(x=>x[0]));
 const type=String(d['予定種別']||'').trim(),date=String(d['予定日']||'').trim().replace(/\//g,'-').replace(/-(\d)(?=-|$)/g,'-0$1');
 if(!type||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('invalid_schedule_row:'+(i+2));
 const vehicle=String(d.VehicleID||'').trim(),event=String(d['GoogleカレンダーEventID']||'').trim(),calendar=String(d['カレンダー']||'').trim();
 if(vehicle&&!/^V9\d{5}$/.test(vehicle))throw Error('validation_vehicle_required');
 if(!vehicle&&type!=='シフト')throw Error('vehicle_required');
 if(event&&!calendar)throw Error('calendar_required');
 const key=JSON.stringify([calendar,event]);
 if(event&&seen.has(key))throw Error('duplicate_event');
 if(event)seen.add(key);
 return [{schedule_id:'TEST-SCHEDULE-'+(i+2),vehicle_id:vehicle||null,schedule_type:type,schedule_date:date,state:String(d['状態']||'')||null,calendar_name:calendar||null,calendar_event_id:event||null,source_data:d}];
 });
}


function GF3_GF_ScheduleStorageTest_(book,action,rows){
 GF3_AssertBook_(book);
 if(action!=='health'&&!GF3_WriteEnabled_(book))throw Error('validation_disabled');
 if(!['health','read','import'].includes(action))throw Error('invalid_action');
 const token=PropertiesService.getScriptProperties().getProperty('GF3_SYNC_TEST_TOKEN')||'';
 if(token.length<32)throw Error('token_missing');
 const body={action};
 if(action==='import'){
 if(!Array.isArray(rows)||rows.length<1||rows.length>100)throw Error('invalid_batch');
 body.rows=rows;
 }
 const res=UrlFetchApp.fetch('https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf3-schedule-storage-test',{method:'post',contentType:'application/json',headers:{'x-gf3-sync-token':token},payload:JSON.stringify(body),muteHttpExceptions:true,followRedirects:false});
 if(res.getResponseCode()!==200)throw Error('schedule_http_'+res.getResponseCode());
 const result=JSON.parse(res.getContentText());
 if(result.ok!==true)throw Error('schedule_request_failed');
 return result;
}
function GF3_GF_ScheduleImportValidation_(book,headers,rows){
 const plan=headers.map(x=>String(x).trim()).includes('予定ID')?GF3_GF_ScheduleActualHeaderTestPlan_(headers,rows):GF3_GF_ScheduleImportPlan_(headers,rows);
 if(plan.length>=1000)throw Error('validation_read_limit');
 const before=GF3_GF_ScheduleStorageTest_(book,'read').data;
 if(!Array.isArray(before)||before.length>=1000)throw Error('read_limit');
 const canonical=x=>JSON.stringify(x,Object.keys(x).sort());
 const pending=[];
 for(const p of plan){
 const old=before.find(x=>x.schedule_id===p.schedule_id);
 if(!old){pending.push(p);continue;}
 for(const k of Object.keys(p)){
 if(k==='source_data'?canonical(old[k])!==canonical(p[k]):old[k]!==p[k])throw Error('schedule_conflict:'+p.schedule_id);
 }
 }
 if(before.length+pending.length>=1000)throw Error('validation_read_limit');
 for(let start=0;start<pending.length;start+=100){
  GF3_GF_ScheduleStorageTest_(book,'import',pending.slice(start,start+100));
 }
 const after=GF3_GF_ScheduleStorageTest_(book,'read').data;
 if(!Array.isArray(after)||after.length>=1000)throw Error('read_limit');
 for(const p of plan){
 const saved=after.find(x=>x.schedule_id===p.schedule_id);
 if(!saved||Object.keys(p).some(k=>k==='source_data'?canonical(saved[k])!==canonical(p[k]):saved[k]!==p[k]))throw Error('schedule_readback_failed');
 }
 return {ok:true,total:plan.length,inserted:pending.length};
}

/** Read-only source mapper; never writes Sheets or Calendar. */
function GF3_GF_ScheduleSourcePlan_(headers,rows){
 const h=headers.map(x=>String(x).trim());
 const required=['予定ID','VehicleID','予定種類名','予定日','状態','CalendarEventID','シフト担当者','シフト開始時間','シフト終了時間','シフトメモ'];
 if(new Set(h.filter(Boolean)).size!==h.filter(Boolean).length)throw Error('duplicate_header');
 for(const k of required)if(!h.includes(k))throw Error('missing_header:'+k);
 const ids=new Set(),events=new Set();
 return rows.flatMap((r,i)=>{
  if(r.every(x=>x===''||x==null))return [];
  const d=Object.fromEntries(h.map((k,j)=>[k,r[j]??'']).filter(x=>x[0]));
  const id=String(d['予定ID']).trim(),type=String(d['予定種類名']).trim(),vehicle=String(d.VehicleID).trim(),event=String(d.CalendarEventID).trim();
  const date=String(d['予定日']).trim().replace(/\//g,'-').replace(/-(\d)(?=-|$)/g,'-0$1');
  if(!id||ids.has(id)||!type||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('invalid_row:'+(i+2));
  if(event&&events.has(event))throw Error('duplicate_event:'+id);
  ids.add(id);if(event)events.add(event);
  return [{schedule_id:id,vehicle_id:vehicle||null,schedule_type:type,schedule_date:date,state:String(d['状態'])||null,calendar_event_id:event||null,calendar_name:null,source_data:d}];
 });
}

function GF3_GF_ScheduleActualHeaderTestPlan_(headers,rows){
 return GF3_GF_ScheduleSourcePlan_(headers,rows).map(p=>{
 if(!/^TEST-[A-Z0-9-]+$/.test(p.schedule_id))throw Error('test_schedule_required');
 if(p.vehicle_id&&!/^V9[0-9]{5}$/.test(p.vehicle_id))throw Error('test_vehicle_required');
 if(!p.vehicle_id&&!['シフト','スタッフシフト'].includes(p.schedule_type))throw Error('vehicle_required');
 if(p.calendar_event_id)throw Error('existing_event_requires_review');
 return p;
 });
}
