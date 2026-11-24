/** 検証用。現行GFIと同じスタンドアロンGASでのみ使用。データ正本は車両台帳。 */
const GFI_PROGRESS_ALLOWED_TEST_=['車両準備中','車両手配済み','名義変更前','名義変更中','名義変更済み'];
const GFI_PROGRESS_KEYS_TEST_=['管理区分','納車可能日','納車確定日'];
function GFI_進捗管理正規化_(record) {
  const values=GF_LedgerProgressValues_(record);
  const assigned=record.DriverID==='D999901';
  if(record.VehicleID!=='TEST-V01'||record['区分/ステータス']!=='空車')throw Error('検証車両不一致');
  if(assigned) {
    if(!GFI_PROGRESS_ALLOWED_TEST_.includes(values[0]))throw Error('未対応の管理区分: '+values[0]);
    if(record['現在使用者']!=='テスト運転者A')throw Error('使用者不一致');
  } else if(record.DriverID===''&&record['現在使用者']===''&&
            values[0]==='通常管理'&&!values[1]&&!values[2]){
    // Cancellation is safe only while both delivery dates are empty.
  } else throw Error('割当状態不一致');
  return {...record,'管理区分':values[0],'納車可能日':values[1],'納車確定日':values[2]};
}
function GFI_進捗管理同期_() {
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const {v,w,d}=GFI_確認_();
    if(v.r.DriverID==='D999901'&&
       (w.r['ステータス']!=='割当済'||w.r['割当VehicleID']!=='TEST-V01'||
        d.r['割当VehicleID']!=='TEST-V01'))throw Error('3シートの割当が一致しません');
    if(v.r.DriverID===''&&
       (w.r['ステータス']!=='名変待ち'||w.r['割当VehicleID']!==''||
        d.r['割当VehicleID']!==''))throw Error('3シートの取消が一致しません');
    const snapshot=GFI_進捗台帳読取_(v);
    const record=GFI_進捗管理正規化_(snapshot);
    const remote=GFI_通信_({action:'read'});
    if(remote.vehicle_id!=='TEST-V01'||!remote.record)throw Error('Supabase車両不一致');
    const same=Object.keys(record).length===Object.keys(remote.record).length&&
       Object.entries(record).every(([key,val])=>remote.record[key]===val);
    if(same)return {status:'unchanged'};
    GFI_反映_(record);
    const current=GFI_進捗管理正規化_(GFI_進捗台帳読取_(GFI_確認_().v));
    if(GFI_PROGRESS_KEYS_TEST_.some(k=>current[k]!==record[k])||
       current.DriverID!==record.DriverID)throw Error('台帳が同期中に変更されました。次回再確認してください');
    return {status:'synced',stage:record['管理区分']};
  } finally {lock.releaseLock();}
}
/** 稼働中の GFI_UI受付処理 をこの完全版に置換。重複定義にしないこと。 */
function GFI_UI受付処理(){
  GFI_確認_();
  const claimed=GFI_UI通信_({action:'claim'});
  const q=claimed.request;
  if(q){
    try {
      if(!['assign','cancel'].includes(q.action))throw Error('受付種別不正');
      GFI_実行_(q.action==='assign');
      GFI_UI通信_({action:'finish',request_id:q.request_id});
      console.log('画面受付・保存照合完了 '+q.request_id);
    }catch(e){
      try{GFI_UI通信_({action:'fail',request_id:q.request_id});}
      catch(f){console.error('受付状態要確認: '+f.message);}
      throw e;
    }
  }
  const state=GFI_進捗管理同期_();
  console.log('車両台帳→Supabase進捗 '+state.status);
}