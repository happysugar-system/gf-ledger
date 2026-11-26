/** Test-only actual storage client. No production fallback. */
function GF_ActualStorageTest_(book, action, args) {
  GF_IsolatedValidationBook_(book);
  if (!GF_MainReturnHistoryEnabled_(book)) throw Error('validation_return_disabled');
  const props=PropertiesService.getScriptProperties();
  const token=props.getProperty('GF_ACTUAL_TEST_TOKEN');
  if (!token || token.length<32) throw Error('actual_storage_token_missing');
  if (!['health','queue','history','transition','prepare'].includes(action)) throw Error('actual_storage_action_denied');
  const receipt=props.getProperty('GF_VALIDATION_RETURN_RECEIPT_ID');
  GF_IsolatedValidationReceipt_(receipt);
  if(receipt!=='TEST-RETURN-R005')throw Error('actual_storage_receipt_denied');
  const payload=Object.assign({},args||{},{action,receipt_id:receipt});
  const response=UrlFetchApp.fetch('https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf-actual-storage-test',{
    method:'post',contentType:'application/json',headers:{'x-gf-actual-token':token},
    payload:JSON.stringify(payload),followRedirects:false,muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw Error('actual_storage_http_'+response.getResponseCode());
  const result=JSON.parse(response.getContentText());
  if(result.ok!==true)throw Error('actual_storage_failed');
  return result.data;
}
function GF_ActualStorageTestRead_(book,action){
  const rows=GF_ActualStorageTest_(book,action);
  if(!Array.isArray(rows)||rows.length!==1||rows[0].vehicle_id!=='V900005')throw Error('actual_storage_row_invalid');
  GF_IsolatedValidationVehicle_(rows[0].vehicle_id);
  return rows[0];
}
function GF_ActualStorageTestTransition_(book,expected,next){
  if(GF_ActualStorageTest_(book,'transition',{expected,next})!==true)throw Error('actual_storage_state_conflict');
}
function GF_検証実績DB接続診断(){
  const book=GF_IsolatedValidationOpen_();
  GF_ActualStorageTest_(book,'health');
  const q=GF_ActualStorageTestRead_(book,'queue');
  const h=GF_ActualStorageTestRead_(book,'history');
  return {connected:true,queueState:q.state,historyState:h.state};
}