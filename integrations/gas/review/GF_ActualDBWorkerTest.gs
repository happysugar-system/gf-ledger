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
      if(k.includes('日')&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))value=Utilities.parseDate(value,book.getSpreadsheetTimeZone(),'yyyy-MM-dd');
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
