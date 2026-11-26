/** Isolated sync storage client. Uses existing test token; no production fallback. */
function GF_SyncStorageTest_(book,action,kind,id,args){
 GF_IsolatedValidationBook_(book);
 if(!GF_MainReturnHistoryEnabled_(book))throw Error('validation_disabled');
 const token=PropertiesService.getScriptProperties().getProperty('GF_ACTUAL_TEST_TOKEN');
 if(!token||token.length<32)throw Error('sync_storage_token_missing');
 if(!['health','read','insert','transition'].includes(action))throw Error('sync_storage_action_denied');
 if(action!=='health'){
 if(!['history','queue'].includes(kind))throw Error('sync_storage_kind_denied');
 if(!(kind==='history'?/^[a-f0-9]{64}$/:/^TEST-[A-Z0-9-]{1,64}$/).test(id))throw Error('sync_storage_id_denied');
 }
 const payload=Object.assign({},args||{},{action,kind,id});
 const response=UrlFetchApp.fetch('https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf-sync-storage-test',{method:'post',contentType:'application/json',headers:{'x-gf-actual-token':token},payload:JSON.stringify(payload),followRedirects:false,muteHttpExceptions:true});
 if(response.getResponseCode()!==200)throw Error('sync_storage_http_'+response.getResponseCode());
 const result=JSON.parse(response.getContentText());
 if(result.ok!==true)throw Error('sync_storage_failed');
 return result.data;
}
function GF_SyncStorageTestRead_(book,kind,id){
 const rows=GF_SyncStorageTest_(book,'read',kind,id);
 if(!Array.isArray(rows)||rows.length>1)throw Error('sync_storage_invalid_rows');
 return rows[0]||null;
}
function GF_SyncStorageTestInsert_(book,kind,row){
 const id=kind==='history'?row.receipt_key:row.request_id;
 return GF_SyncStorageTest_(book,'insert',kind,id,{row});
}
function GF_SyncStorageTestTransition_(book,id,expected,next,result){
 if(GF_SyncStorageTest_(book,'transition','queue',id,{expected,next,result})!==true)throw Error('sync_storage_state_conflict');
}
function GF_検証同期DB接続診断(){
 const book=GF_IsolatedValidationOpen_();
 GF_SyncStorageTest_(book,'health');
 const a=GF_SyncStorageTestRead_(book,'history','a'.repeat(64));
 const b=GF_SyncStorageTestRead_(book,'history','b'.repeat(64));
 if(!a||!b||a.driver_id!=='D999901'||b.driver_id!=='D999902')throw Error('sync_history_mismatch');
 const result={connected:true,historyMatches:true};
 console.log(JSON.stringify(result));return result;
}

/** Validation-only adapters. Existing entrypoints remain unchanged until cutover. */
function GFA_DB同期履歴照合_(book,requestKey){
 const row=GF_SyncStorageTestRead_(book,'history',String(requestKey).trim().toLowerCase());
 if(!row)return null;
 return {'処理状態':String(row.state||''),'LINE受付ID':String(row.line_receipt_id||''),DriverID:String(row.driver_id||'')};
}
function GFW_DB同期依頼追加_(book,vehicleId,action,driverId){
 GF_IsolatedValidationBook_(book);
 if(!/^V9[0-9]{5}$/.test(vehicleId)||!/^D999[0-9]{3}$/.test(driverId)||!['割当','取消'].includes(action))throw Error('validation_assignment_denied');
 const id='TEST-'+Utilities.getUuid().toUpperCase();
 GF_SyncStorageTestInsert_(book,'queue',{request_id:id,requested_at:new Date().toISOString(),vehicle_id:vehicleId,operation:action,driver_id:driverId,state:'待機',attempts:0});
 const saved=GF_SyncStorageTestRead_(book,'queue',id);
 if(!saved||saved.vehicle_id!==vehicleId||saved.driver_id!==driverId||saved.operation!==action)throw Error('assignment_queue_readback_failed');
 return id;
}


/** Read-only inventory before cutover. Never creates or deletes triggers. */
function GF_検証トリガー棚卸し(){
 const book=GF_IsolatedValidationOpen_();
 GF_IsolatedValidationBook_(book);
 const triggers=ScriptApp.getProjectTriggers().map(t=>({
 handler:t.getHandlerFunction(),event:String(t.getEventType()),source:String(t.getTriggerSource()),sourceId:t.getTriggerSourceId()||null
 }));
 const result={spreadsheetId:book.getId(),triggers,sheets:book.getSheets().map(s=>s.getName()),required:['車両台帳','名変待ち管理','ドライバーマスター']};
 console.log(JSON.stringify(result));return result;
}
