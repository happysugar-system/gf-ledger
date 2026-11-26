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