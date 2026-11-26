// GF_ActualStorageTest.gs
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

// GF_ActualDBWorkerTest.gs
/** Isolated DB-backed return/cancel worker. Does not access queue/history sheets. */
function GF_ActualDBSnapshotMatches_(v, snapshot, book) {
  if(!snapshot || !snapshot.gfReturnHistory) throw Error('actual_snapshot_missing');
  if(!GF_MainReturnHistoryMatches_(v,snapshot.gfReturnHistory))return false;
  return Object.keys(snapshot).filter(k=>k!=='gfReturnHistory').every(k=>{
    if(!(k in v.data))throw Error('actual_snapshot_column_missing');
    const norm=x=>String(x??'').replace(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/,(_,y,m,d)=>y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'));
    return norm(v.data[k])===norm(snapshot[k]);
  });
}
function GF_ActualDBApply_(book,v,from,to){
  if(!GF_ActualDBSnapshotMatches_(v,from,book))throw Error('actual_snapshot_conflict');
  const changes=GF_MainReturnHistoryDelta_(from.gfReturnHistory,to.gfReturnHistory);
  Object.keys(to).filter(k=>k!=='gfReturnHistory').forEach(k=>{
    if(k==='VehicleID')throw Error('actual_vehicle_id_immutable');
    if(!Object.prototype.hasOwnProperty.call(from,k))throw Error('actual_snapshot_key_mismatch');
    if(from[k]!==to[k]){
      let value=to[k];
      if((k.includes('日')||k==='返却/12点検')&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))value=Utilities.parseDate(value,book.getSpreadsheetTimeZone(),'yyyy-MM-dd');
      changes[k]=value;
    }
  });
  if(Object.keys(changes).length)GF_MainReturnHistoryWrite_(book,v.sheet,v.row,changes);
  SpreadsheetApp.flush();
  if(!GF_ActualDBSnapshotMatches_(GF_実績車両情報_(book,v.data.VehicleID),to,book))throw Error('actual_readback_failed');
}
function GF_ActualDBRun_(cancel){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw Error('actual_worker_busy');
  try{
    const book=GF_IsolatedValidationOpen_();
    const q=GF_ActualStorageTestRead_(book,'queue');
    const h=GF_ActualStorageTestRead_(book,'history');
    if(q.receipt_id!==h.receipt_id||q.kind!=='返却完了'||h.kind!==q.kind||q.actual_date!==h.actual_date)throw Error('actual_history_mismatch');
    const v=GF_実績車両情報_(book,q.vehicle_id);
    const from=cancel?h.after_data:h.before_data;
    const to=cancel?h.before_data:h.after_data;
    const done=cancel?'取消済':'完了';
    const active=cancel?'取消処理中':'処理中';
    const initial=cancel?'完了':'待機';
    if(q.state===done){
      if(h.state!==done||!GF_ActualDBSnapshotMatches_(v,to,book))throw Error('actual_completed_conflict');
      return {ok:true,already:true,state:done};
    }
    if(q.state!==initial&&q.state!==active)throw Error('actual_state_denied');
    if(h.state!==(cancel?'完了':'処理中'))throw Error('actual_history_state_denied');
    const matchesFrom=GF_ActualDBSnapshotMatches_(v,from,book);
    const matchesTo=GF_ActualDBSnapshotMatches_(v,to,book);
    if(!matchesFrom&&!matchesTo)throw Error('actual_snapshot_conflict');
    if(q.state===initial){
      if(!matchesFrom)throw Error('actual_unclaimed_change');
      GF_ActualStorageTestTransition_(book,initial,active);
    }
    if(!matchesTo)GF_ActualDBApply_(book,v,from,to);
    GF_ActualStorageTestTransition_(book,active,done);
    return {ok:true,state:done};
  }finally{lock.releaseLock();}
}
function GF_検証DB返却ワーカー(){return GF_ActualDBRun_(false);}
function GF_検証DB返却取消(){return GF_ActualDBRun_(true);}


// GF_ActualDBIntakeTest.gs
/** Test-only intake. Existing production reception routes remain untouched. */
function GF_検証DB返却受付(){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(30000))throw Error('actual_worker_busy');
 try{
 const book=GF_IsolatedValidationOpen_();
 const v=GF_実績車両情報_(book,'V900005');
 if(v.data['区分/ステータス']!=='貸出中'||v.data.DriverID!=='D999905')throw Error('actual_intake_vehicle_conflict');
 const date=Utilities.formatDate(new Date(),book.getSpreadsheetTimeZone(),'yyyy-MM-dd');
 const receipt=['TEST-RETURN-R005',date,'V900005','返却完了',date,'D999905',v.data['現在使用者']];
 const plan=GF_MainReturnHistoryPrepare_(book,receipt,v);
 if(!plan)throw Error('actual_intake_plan_missing');
 const keys=['備考','DriverID','代車貸出先','現在使用者','返却/12点検','代車貸出備考','代車貸出エリア','区分/ステータス'];
 const before=Object.fromEntries(keys.map(k=>{if(!(k in v.data))throw Error('actual_intake_column_missing');return [k,v.data[k]];}));
 before.gfReturnHistory=plan.before;
 const after=Object.assign({},before,{DriverID:'',現在使用者:'','返却/12点検':date,'区分/ステータス':'空車',gfReturnHistory:plan.after});
 const queue={receipt_id:receipt[0],received_at:new Date().toISOString(),vehicle_id:receipt[2],kind:receipt[3],actual_date:date,driver_id:receipt[5],current_user_name:receipt[6],state:'待機'};
 const history={receipt_id:receipt[0],registered_at:queue.received_at,vehicle_id:receipt[2],kind:receipt[3],actual_date:date,state:'処理中',before_data:before,after_data:after};
 if(GF_ActualStorageTest_(book,'prepare',{queue,history})!==true)throw Error('actual_prepare_failed');
 return {ok:true,receipt_id:receipt[0]};
 }finally{lock.releaseLock();}
}

// GF_ActualDBSetupTest.gs
/** Read-only connection check; token must be provisioned separately in both systems. */
function GF_検証実績DB一括確認(){
 const book=GF_IsolatedValidationOpen_();
 const p=PropertiesService.getScriptProperties();
 const expected={GF_TEST_RETURN_HISTORY_ENABLED:'true',GF_VALIDATION_RETURN_RECEIPT_ID:'TEST-RETURN-R005',GF_VALIDATION_RETURN_VEHICLE_ID:'V900005'};
 Object.keys(expected).forEach(k=>{if(p.getProperty(k)!==expected[k])throw Error('invalid_property:'+k);});
 if(typeof Sheets==='undefined')throw Error('advanced_sheets_service_required');
 const result=GF_検証実績DB接続診断();
 const q=GF_ActualStorageTestRead_(book,'queue'),h=GF_ActualStorageTestRead_(book,'history');
 const v=GF_実績車両情報_(book,q.vehicle_id);
 const report={...result,beforeMatches:GF_ActualDBSnapshotMatches_(v,h.before_data,book),afterMatches:GF_ActualDBSnapshotMatches_(v,h.after_data,book)};
 console.log(JSON.stringify(report));return report;
}