/**
 * GOLD FIRST / 44_台帳代車開始実績.gs
 * 今後の台帳「引渡し」「代車開始日」または「区分/ステータス」直接入力専用。過去の履歴は一切修復しない。
 * 既存 24(取消) / 25(スマホ実績) / 41(代車情報) / 42(日付削除) と併用。
 * 代車予定日ではなく「代車開始日」と「区分/ステータス」の1セル手入力を扱う。
 */
function GF_台帳代車開始を初期設定する_44() {
  const ss=対象スプレッドシートを開く_();
  const edit='GF_台帳代車開始を受付する_44';
  const worker='GF_台帳代車開始の保留を再実行する_44';
  const ts=ScriptApp.getProjectTriggers();
  const edits=ts.filter(t=>t.getHandlerFunction()===edit);
  if(!edits.length)ScriptApp.newTrigger(edit).forSpreadsheet(ss).onEdit().create();
  edits.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
  const workers=ts.filter(t=>t.getHandlerFunction()===worker);
  if(!workers.length)ScriptApp.newTrigger(worker).timeBased().everyMinutes(1).create();
  workers.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
  // 41番の編集トリガーは44番と競合するため停止（41番の同期関数は残す）。
  ts.filter(t=>t.getHandlerFunction()==='GF_代車情報台帳編集_41').forEach(t=>ScriptApp.deleteTrigger(t));
  GF_44キュー_(ss);
  GF_全ステータス同期を設定する_44();
  console.log('44番：今後の代車開始日・ステータス変更を監視開始。既存行は処理しません。');
}
function GF_44キュー_(ss){
  let sh=ss.getSheetByName('代車開始受付キュー');
  if(!sh){sh=ss.insertSheet('代車開始受付キュー');sh.appendRow(['受付ID','受付日時','VehicleID','実施日','直前状態','状態','エラー']);sh.setFrozenRows(1);}
  if(!sh.isSheetHidden())sh.hideSheet();
  return sh;
}
function GF_台帳代車開始を受付する_44(e){
  if(!e||!e.range)return;
  const range=e.range,sh=range.getSheet();
  if(sh.getName()!==シート名.車両台帳||range.getRow()<2||range.getNumRows()!==1||range.getNumColumns()!==1)return;
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
  const edited=headers[range.getColumn()-1];
  if(!['代車開始日','引渡し','区分/ステータス',
       '代車貸出先','代車貸出エリア','代車貸出備考'].includes(edited))return;
  // 代車専用3項目の変更は実績を作らず、同じVehicleIDの関連行だけ同期。
  if(['代車貸出先','代車貸出エリア','代車貸出備考'].includes(edited)){
    const idCol=headers.indexOf('VehicleID')+1;
    if(!idCol)throw new Error('44番：VehicleID列がありません。');
    const vehicle=String(sh.getRange(range.getRow(),idCol).getDisplayValue()||'').trim();
    if(vehicle)GF_44関連同期を保留する_(vehicle);
    return;
  }
  let 変更前ステータス_44='';
  // 日付を入れた時は台帳の状態を先に更新する。
  // スクリプトからのsetValueではonEditは再発火しないので、同期も明示する。
  if(['代車開始日','引渡し'].includes(edited) && range.getValue()){
    const c=headers.indexOf('区分/ステータス')+1;
    const idCol=headers.indexOf('VehicleID')+1;
    if(!c||!idCol)throw new Error('44番：ステータスまたはVehicleID列がありません。');
    const current=String(sh.getRange(range.getRow(),c).getDisplayValue()||'').trim();
    変更前ステータス_44=current;
    // 日付入力は先に状態を切り替える。旧状態は受付時に別途記録する。
    // 既に代車ならそのままにし、その他の状態は勝手に変更しない。
    if(current==='空車'){
      sh.getRange(range.getRow(),c).setValue(edited==='引渡し'?'貸出中':'代車');
    }
    const vehicle=String(sh.getRange(range.getRow(),idCol).getDisplayValue()||'').trim();
    if(vehicle)GF_44関連同期を保留する_(vehicle);
  }
  // すべてのステータス変更を、日付の有無に関係なく関連シートへ反映する。
  if(edited==='区分/ステータス'){
    GF_全ステータス反映受付_44(sh,range.getRow(),headers);
  }
  // 削除は42番が担当。過去の日付変更も安全のため自動実績化しない。
  if(['代車開始日','引渡し'].includes(edited)&&!range.getValue())return;
  // 日付の上書きは新たな開始実績を作らない。
  if(['代車開始日','引渡し'].includes(edited)&&e.oldValue)return;
  const nextStatus=String(range.getDisplayValue()).trim();
  const prevStatus=String(e.oldValue||'').trim();
  const ending=edited==='区分/ステータス'&&prevStatus==='代車'&&nextStatus==='空車';
  // ステータスのみの変更は関連同期のみ。日付のない実績履歴は作らない。
  if(edited==='区分/ステータス')return;
  const idCol=headers.indexOf('VehicleID')+1,statusCol=headers.indexOf('区分/ステータス')+1;
  if(!idCol||!statusCol)throw new Error('44番：VehicleID/区分・ステータス列がありません。');
  const id=String(sh.getRange(range.getRow(),idCol).getDisplayValue()||'').trim();
  const status=String(sh.getRange(range.getRow(),statusCol).getDisplayValue()||'').trim();
  if(!id)return;
  const ss=sh.getParent();
  const date=['代車開始日','引渡し'].includes(edited)?GF_実績台帳日付キー_25(range.getValue(),ss.getSpreadsheetTimeZone()):'';
  const previous=edited==='区分/ステータス'?String(e.oldValue||'').trim():変更前ステータス_44;
  if((['代車開始日','引渡し'].includes(edited)&&!date)||(edited==='代車開始日'&&status!=='代車')||(edited==='引渡し'&&status!=='貸出中')||(edited==='区分/ステータス'&&previous==='代車'&&!ending)){
    console.warn('44番：受付対象外 '+id+' / 状態='+status+' / 日付='+date);
    return;
  }
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)){
    console.warn('44番：受付ロック取得失敗 '+id+'。台帳日付を消さずに管理者へ確認してください。');
    return;
  }
  try{
    const queue=GF_44キュー_(ss),rows=queue.getDataRange().getDisplayValues();
    const token=ending?'END44':(edited==='引渡し'?'DELIVERY44|'+date:date);
    if(rows.some((r,i)=>i>0&&r[2]===id&&r[3]===token&&['待機','処理中','同期待ち'].includes(r[5]))){
      if(['代車開始日','引渡し'].includes(edited) && previous==='空車'){
        sh.getRange(range.getRow(),statusCol).setValue(edited==='引渡し'?'貸出中':'代車');
        GF_44関連同期を保留する_(id);
      }
      return;
    }
    queue.appendRow(['LEDGER44-'+Utilities.getUuid(),new Date(),id,token,previous,'待機','']);
    // 開始日の入力は受付が確定してから、台帳を即時「代車」に変更する。
    if(['代車開始日','引渡し'].includes(edited) && previous==='空車'){
      sh.getRange(range.getRow(),statusCol).setValue(edited==='引渡し'?'貸出中':'代車');
      GF_44関連同期を保留する_(id);
    }
  }finally{lock.releaseLock();}
}
function GF_台帳代車開始の保留を再実行する_44(){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return;
  let task=null;
  try{
    const ss=対象スプレッドシートを開く_(),queue=GF_44キュー_(ss);
    const rows=queue.getDataRange().getValues();
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][5])!=='待機')continue;
      task={row:i+1,id:String(rows[i][0]),vehicle:String(rows[i][2]),date:String(rows[i][3]),previous:String(rows[i][4])};
      queue.getRange(i+1,6).setValue('処理中');
      break;
    }
    if(!task)return;
    const v=GF_実績車両情報_(ss,task.vehicle),d=v.data,tz=ss.getSpreadsheetTimeZone();
    const delivery=task.date.startsWith('DELIVERY44|');
    const actualDate=delivery?task.date.slice('DELIVERY44|'.length):task.date;
    const startKind=delivery?'貸出開始':'代車開始';
    const targetColumn=delivery?'引渡し':'代車開始日';
    const targetStatus=delivery?'貸出中':'代車';
    if(task.date==='END44'){
      if(String(d['区分/ステータス']||'').trim()!=='空車')throw new Error('代車終了後にステータスが再変更されています。');
    }else if(task.date){
      if(GF_実績台帳日付キー_25(d[targetColumn],tz)!==actualDate)throw new Error('受付後に代車開始日が変更されました。');
      if(![task.previous,targetStatus].includes(String(d['区分/ステータス']||'').trim()))throw new Error('受付後にステータスが変更されました。');
      if(!['空車',targetStatus].includes(task.previous))throw new Error('開始前の状態が不明なため履歴を作成しません。');
    }else if(String(d['区分/ステータス']||'').trim()!=='代車')throw new Error('ステータスが代車から変更されました。');
    const hist=GF_実績履歴を準備_26(ss),h=hist.getDataRange().getValues();
    if(h.some((r,i)=>i>0&&String(r[0])===task.id)){
      queue.getRange(task.row,6).setValue('完了');return;
    }
    if(task.date!=='END44'&&h.some((r,i)=>i>0&&String(r[2])===task.vehicle&&String(r[3])===startKind&&String(r[5])==='完了'&&GF_実績台帳日付キー_25(r[4],tz)===actualDate)){
      queue.getRange(task.row,6,1,2).setValues([['完了','同日実績が既にあるため重複登録なし']]);
      return;
    }
    if(task.date!=='END44'&&h.some((r,i)=>i>0&&String(r[2])===task.vehicle&&String(r[3])===startKind&&String(r[5])==='完了'&&!h.some((x,j)=>j>i&&String(x[2])===task.vehicle&&String(x[3])===(delivery?'返却完了':'代車返却')&&String(x[5])==='完了')))throw new Error('この車両に未終了の代車開始履歴があります。');
    if(task.date==='END44'&&!h.some((r,i)=>i>0&&String(r[2])===task.vehicle&&String(r[3])==='代車開始'&&String(r[5])==='完了')){
      console.warn('44番：開始履歴がない代車を空車に変更。終了のみ記録します。');
    }
    const q=GF_実績キューシート_().getDataRange().getValues();
    if(q.some((r,i)=>i>0&&String(r[2])===task.vehicle&&['待機','処理中','同期待ち','同期中'].includes(String(r[7])))){
      queue.getRange(task.row,6).setValue('待機');return;
    }
    const keys=['区分/ステータス','現在使用者','DriverID','備考','代車貸出先','代車貸出エリア','代車貸出備考','代車開始日','引渡し'];
    const before={},after={};
    keys.forEach(k=>{const value=d[k];before[k]=value instanceof Date?GF_実績台帳日付キー_25(value,tz):String(value||'');after[k]=before[k];});
    // 編集トリガーは入力後に起動するため、入力前の日付だけ空欄に戻して履歴化。
    if(task.date==='END44'){
      before['区分/ステータス']='代車';
      after['区分/ステータス']='空車';
    }else{
      if(task.date)before[targetColumn]='';
      else before['区分/ステータス']=task.previous;
      after['区分/ステータス']=targetStatus;
    }
    hist.appendRow([task.id,new Date(),task.vehicle,task.date==='END44'?'代車返却':startKind,task.date==='END44'?'':actualDate,'処理中',JSON.stringify(before),JSON.stringify(after),'','44番：台帳ステータス直接変更']);
    SpreadsheetApp.flush();
    if(task.date&&task.date!=='END44')行を書き込む_(v.sheet,v.row,{'区分/ステータス':targetStatus});
    SpreadsheetApp.flush();
    const historyRow=hist.getLastRow();
    hist.getRange(historyRow,6).setValue('完了');
    queue.getRange(task.row,6).setValue('同期待ち');
  }catch(err){
    if(task){const ss=対象スプレッドシートを開く_(),q=GF_44キュー_(ss);q.getRange(task.row,6,1,2).setValues([['エラー',String(err&&err.message||err)]]);}
    console.error('44番：'+String(err&&err.stack||err));
  }finally{lock.releaseLock();}
  // 重い1台同期はロックを解放した後に行う。失敗しても実績を二重作成しない。
  if(task){
    try{
      const ss=対象スプレッドシートを開く_(),q=GF_44キュー_(ss);
      if(String(q.getRange(task.row,6).getValue())!=='同期待ち')return;
      GF_代車情報を台帳から同期する_41(ss,task.vehicle);
      // 41番の同期は1回だけ。
      q.getRange(task.row,6,1,2).setValues([['完了','']]);
    }catch(err){console.warn('44番：実績登録済み・関連同期は要再試行 '+String(err));}
  }
}

/**
 * 台帳の「区分/ステータス」は正本。日付・実績履歴に依存せず関連シートへ反映。
 * 既存の代車実績キューは変更しない。新しいシートは作成しない。
 * 混雑時の再試行情報は ScriptProperties に保存する。
 */
function GF_全ステータス反映受付_44(台帳,行,ヘッダー){
  const id列=ヘッダー.indexOf('VehicleID')+1;
  if(!id列)throw new Error('VehicleID列がありません。');
  const id=String(台帳.getRange(行,id列).getDisplayValue()||'').trim();
  if(id)GF_44関連同期を保留する_(id);
}
function GF_全ステータス1台反映_44(id) {
  const ss=対象スプレッドシートを開く_();
  // 41番は正しいステータス列名と代車3項目、従来の貸出先列も同期する。
  GF_代車情報を台帳から同期する_41(ss,id);
  SpreadsheetApp.flush();
  console.log('44番：ステータス・代車情報同期 '+id);
}

/** ステータス・代車情報の編集を再試行対象にする。 */
function GF_44関連同期を保留する_(id){
  const props=PropertiesService.getScriptProperties();
  const key='GF_STATUS_SYNC_44_'+id;
  const value=JSON.stringify({id:id,time:Date.now()});
  props.setProperty(key,value);
  // 41番の編集トリガーを止めても、従来の反映状況表示は維持する。
  GF_44反映状況を記録する_(id,'代車情報：反映待ち');
  // 編集トリガーでは重い同期を実行しない。1分ワーカーで反映する。
}

/** 既存の44番ワーカーと併用。ステータス反映保留のみ軽量に再試行。 */
function GF_全ステータス再試行_44(){
  const props=PropertiesService.getScriptProperties();
  const tasks=props.getProperties();
  const keys=Object.keys(tasks).filter(k=>k.startsWith('GF_STATUS_SYNC_44_')).slice(0,10);
  keys.forEach(key=>{
    try{
      const item=JSON.parse(tasks[key]);
      GF_全ステータス1台反映_44(item.id);
      // 新しい編集が届いていたら古い処理で「反映済」にしない。
      if(props.getProperty(key)===tasks[key]){
        props.deleteProperty(key);
        GF_44反映状況を記録する_(item.id,'代車情報：反映済 '+Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'Asia/Tokyo','MM/dd HH:mm'));
      }
    }catch(e){
      console.warn('44番ステータス再試行失敗 '+key+': '+e.message);
      try{
        const item=JSON.parse(tasks[key]);
        if(props.getProperty(key)===tasks[key])GF_44反映状況を記録する_(item.id,'代車情報：エラー '+String(e.message||e).slice(0,90));
      }catch(ignore){}
    }
  });
}
/** 既存「予定反映状況」列のみ更新。新しい列・シートは作らない。 */
function GF_44反映状況を記録する_(id,表示){
  try{
    const ss=対象スプレッドシートを開く_();
    const sh=ss.getSheetByName(シート名.車両台帳);
    if(!sh)return;
    const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
    const idCol=h.indexOf('VehicleID')+1, resultCol=h.indexOf('予定反映状況')+1;
    if(!idCol||!resultCol||sh.getLastRow()<2)return;
    const found=sh.getRange(2,idCol,sh.getLastRow()-1,1).createTextFinder(String(id)).matchEntireCell(true).findNext();
    if(found)sh.getRange(found.getRow(),resultCol).setValue(表示);
  }catch(err){console.warn('44番：予定反映状況の表示失敗 '+id+' / '+err);}
}

/** 初回1回。既存トリガーを重複作成しない。 */
function GF_全ステータス同期を設定する_44(){
  const name='GF_全ステータス再試行_44';
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===name))
    ScriptApp.newTrigger(name).timeBased().everyMinutes(1).create();
  console.log('全ステータス同期の再試行設定完了。44番の編集トリガーは既存を使用。');
}

/** 44番が実際に動いているか確認する。データは変更しない。 */
function GF_44設定診断を実行する(){
  const ss=対象スプレッドシートを開く_();
  const triggers=ScriptApp.getProjectTriggers();
  const edit=triggers.filter(t=>t.getHandlerFunction()==='GF_台帳代車開始を受付する_44');
  const worker=triggers.filter(t=>t.getHandlerFunction()==='GF_台帳代車開始の保留を再実行する_44');
  const sh=ss.getSheetByName(シート名.車両台帳);
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const result={編集トリガー:edit.length,ワーカー:worker.length,開始日列:h.indexOf('代車開始日')+1,状態列:h.indexOf('区分/ステータス')+1,キュー:!!ss.getSheetByName('代車開始受付キュー')};
  console.log(JSON.stringify(result));
  return result;
}