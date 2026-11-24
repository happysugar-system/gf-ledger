/** GOLD FIRST テストGASの既存GFI_UI受付処理を置換する完全版。
 * 既存GFI_UI通信_/GFI_実行_/GFI_確認_を流用。その他は検証専用。 */
function GFI_進捗受付通信_(payload) {
  const token=PropertiesService.getScriptProperties().getProperty('GF_VEHICLE_DEMO_SYNC_TOKEN');
  if(!token)throw Error('既存の検証用トークンがありません');
  const url='https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-assignment-progress-queue-worker-test';
  const response=UrlFetchApp.fetch(url,{
    method:'post',contentType:'application/json',
    headers:{'x-gf-sync-token':token},
    payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200) {
    throw Error('進捗受付通信 HTTP '+response.getResponseCode()+' '+response.getContentText().slice(0,150));
  }
  return JSON.parse(response.getContentText());
}
function GFI_進捗受付処理_() {
  const {request:q}=GFI_進捗受付通信_({action:'claim'});
  if(!q)return {status:'no_pending'};
  try {
    if(q.vehicle_id!=='TEST-V01'||q.expected?.vehicleId!=='TEST-V01'||
       q.expected?.driverId!=='D999901')throw Error('検証受付ID不一致');
    const target=GF_LedgerProgressValues_(q.fields);
    if(!GFI_PROGRESS_ALLOWED_TEST_.includes(target[0]))throw Error('検証用管理区分不一致');
    let saved;
    try {
      saved=GFI_進捗台帳保存_(q.expected,q.fields);
    } catch(error) {
      // A crashed acknowledgement can leave the sheet saved.
      // Treat it as recovered only when all three values and both IDs match exactly.
      const {v,w,d}=GFI_確認_();
      const current=GF_LedgerProgressSnapshot_(GFI_進捗台帳読取_(v));
      const recover=current.vehicleId==='TEST-V01'&&current.driverId==='D999901'&&
        w.r['ステータス']==='割当済'&&w.r['割当VehicleID']==='TEST-V01'&&
        d.r['割当VehicleID']==='TEST-V01'&&
        JSON.stringify(current.values)===JSON.stringify(target);
      if(!recover)throw error;
      saved=current;
    }
    if(saved.vehicleId!=='TEST-V01'||JSON.stringify(saved.values)!==JSON.stringify(target)) {
      throw Error('保存結果照合失敗');
    }
    GFI_進捗管理同期_();
    const finished=GFI_進捗受付通信_({action:'finish',request_id:q.request_id});
    if(finished.state!=='verified'||!finished.verified_at)throw Error('DB確定照合失敗');
    console.log('進捗保存・台帳・Supabase・マイページ情報照合済 '+q.request_id);
    return {status:'verified'};
  } catch(e) {
    try{GFI_進捗受付通信_({action:'fail',request_id:q.request_id});}
    catch(f){console.error('進捗受付の要確認状態: '+f.message);}
    throw e;
  }
}
/** 既存のGFI_UI受付処理を置換。GASトリガーは同じ名前を再利用する。 */
function GFI_UI受付処理() {
  GFI_確認_();
  const q=GFI_UI通信_({action:'claim'}).request;
  if(q){
    try {
      if(!['assign','cancel'].includes(q.action))throw Error('受付種別不正');
      GFI_実行_(q.action==='assign');
      GFI_UI通信_({action:'finish',request_id:q.request_id});
      console.log('画面受付・保存照合完了 '+q.request_id);
    } catch(e) {
      try{GFI_UI通信_({action:'fail',request_id:q.request_id});}
      catch(f){console.error('既存受付の要確認状態: '+f.message);}
      throw e;
    }
  }
  // An existing assignment/cancel run completes before progress claims.
  GFI_進捗受付処理_();
  // Also reconcile direct manual edits to the test ledger.
  const state=GFI_進捗管理同期_();
  console.log('進捗台帳直接編集同期: '+state.status);
}
function GFI_進捗接続診断_読取のみ() {
  GFI_確認_();
  if(typeof Sheets==='undefined'||!Sheets.Spreadsheets?.batchUpdate) {
    throw Error('Apps Script 左側のサービスから Google Sheets API を追加してください');
  }
  const p=GFI_進捗受付通信_({action:'health'});
  if(!p.ok)throw Error('進捗受付接続NG');
  const remote=GFI_通信_({action:'read'});
  if(remote.vehicle_id!=='TEST-V01')throw Error('検証DB読取NG');
  console.log('進捗テスト接続OK。既存トリガーはそのまま使用できます。');
}