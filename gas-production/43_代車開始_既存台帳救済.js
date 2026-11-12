/** GOLD FIRST / 43_代車開始_既存台帳救済.gs
 * 台帳に代車開始日を入力済みだが、空車のまま・実績履歴なしの車両を1台ずつ救済する。
 * 【重要】開始直前が本当に「空車」だったと確認できる場合のみ実行。
 * 自動的に対象車両を走査して変更することはない。
 * 既存の24/25/40/41/42は変更しない。
 */
function GF_代車開始_既存台帳を救済する_43(vehicleId, 開始前は空車と確認済み){
  if(開始前は空車と確認済み!==true)throw new Error('開始前のステータスが「空車」だったことを確認してから、第二引数に true を指定してください。');
  const id=String(vehicleId||'').trim();if(!/^V\d+$/.test(id))throw new Error('VehicleIDを指定してください。');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))throw new Error('他の処理が実行中です。時間をおいて再実行してください。');
  try{
    const ss=対象スプレッドシートを開く_(),tz=ss.getSpreadsheetTimeZone();
    const v=GF_実績車両情報_(ss,id),d=v.data;
    if(String(d['区分/ステータス']||'').trim()!=='空車')throw new Error('現在のステータスが空車ではないため停止しました。');
    const date=GF_実績台帳日付キー_25(d['代車開始日'],tz);
    if(!date)throw new Error('代車開始日が見つかりません。');
    if(GF_実績台帳日付キー_25(d['代車返却日'],tz))throw new Error('代車返却日があるため停止しました。');
    const h=GF_実績履歴を準備_26(ss),hist=h.getDataRange().getValues();
    if(hist.some((r,i)=>i>0&&String(r[2])===id&&String(r[3])==='代車開始'&&String(r[5])!=='取消済'))throw new Error('代車開始の履歴が既にあります。二重登録を防ぐため停止しました。');
    const q=GF_実績キューシート_().getDataRange().getValues();
    if(q.some((r,i)=>i>0&&String(r[2])===id&&['待機','処理中','同期待ち','同期中'].includes(String(r[7]))))throw new Error('この車両の実績キューが処理中です。停止しました。');
    const props=PropertiesService.getScriptProperties().getProperties();
    for(const key of Object.keys(props))if(key.startsWith('GF_PLAN_AUTO_40_')){
      try{const j=JSON.parse(props[key]);if(String(j.id)===id)throw new Error('40番の自動実績依頼が残っています。先に処理状況を確認してください。');}
      catch(e){if(String(e.message||e).includes('自動実績依頼'))throw e;}
    }
    const keys=['区分/ステータス','現在使用者','DriverID','備考','代車貸出先','代車貸出エリア','代車貸出備考','代車開始日'];
    const before={},after={};keys.forEach(k=>{before[k]=String(d[k]||'');after[k]=String(d[k]||'');});
    before['代車開始日']=''; // 入力直前は空欄だったと確認した場合に限る
    before['区分/ステータス']='空車';
    after['区分/ステータス']='代車';
    const request='RECOVER43-'+Utilities.getUuid();
    // 履歴を先に記録してから台帳変更。途中失敗時は処理中として残し、無条件再実行させない。
    h.appendRow([request,new Date(),id,'代車開始',date,'処理中',JSON.stringify(before),JSON.stringify(after),'','43番：台帳入力済み実績を開始前「空車」の確認に基づき救済']);
    SpreadsheetApp.flush();
    try{
      行を書き込む_(v.sheet,v.row,{'区分/ステータス':'代車'});
      SpreadsheetApp.flush();
      h.getRange(h.getLastRow(),6).setValue('完了');
      GF_取消後同期を予約_24(ss,id);
      return {成功:true,VehicleID:id,車番:String(d['車番']||''),実施日:date,メッセージ:'代車ステータスと取消用履歴を登録しました。関連シートは同期キューへ送信済みです。'};
    }catch(err){throw new Error('台帳変更中に失敗しました。実績履歴の RECOVER43- 行を確認してください。'+String(err.message||err));}
  }finally{lock.releaseLock();}
}
/** 実行用：車両の現在状態だけを確認。データは一切変更しない。 */
function GF_代車開始_救済候補を確認する_43(){
  const ss=対象スプレッドシートを開く_(),ids=['V000022','V000023'];
  return ids.map(id=>{
    const d=GF_実績車両情報_(ss,id).data;
    const result={VehicleID:id,車番:d['車番'],ステータス:d['区分/ステータス'],代車開始日:d['代車開始日'],代車貸出先:d['代車貸出先'],代車貸出エリア:d['代車貸出エリア']};
    console.log(JSON.stringify(result));return result;
  });
}

/** GOLD FIRST / 43_代車開始_既存台帳救済.gs
 * 台帳に代車開始日を入力済みだが、空車のまま・実績履歴なしの車両を1台ずつ救済する。
 * 【重要】開始直前が本当に「空車」だったと確認できる場合のみ実行。
 * 自動的に対象車両を走査して変更することはない。
 * 既存の24/25/40/41/42は変更しない。
 */
function GF_代車開始_既存台帳を救済する_43(vehicleId, 開始前は空車と確認済み){
  if(開始前は空車と確認済み!==true)throw new Error('開始前のステータスが「空車」だったことを確認してから、第二引数に true を指定してください。');
  const id=String(vehicleId||'').trim();if(!/^V\d+$/.test(id))throw new Error('VehicleIDを指定してください。');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))throw new Error('他の処理が実行中です。時間をおいて再実行してください。');
  try{
    const ss=対象スプレッドシートを開く_(),tz=ss.getSpreadsheetTimeZone();
    const v=GF_実績車両情報_(ss,id),d=v.data;
    if(String(d['区分/ステータス']||'').trim()!=='空車')throw new Error('現在のステータスが空車ではないため停止しました。');
    const date=GF_実績台帳日付キー_25(d['代車開始日'],tz);
    if(!date)throw new Error('代車開始日が見つかりません。');
    if(GF_実績台帳日付キー_25(d['代車返却日'],tz))throw new Error('代車返却日があるため停止しました。');
    const h=GF_実績履歴を準備_26(ss),hist=h.getDataRange().getValues();
    if(hist.some((r,i)=>i>0&&String(r[2])===id&&String(r[3])==='代車開始'&&String(r[5])!=='取消済'))throw new Error('代車開始の履歴が既にあります。二重登録を防ぐため停止しました。');
    const q=GF_実績キューシート_().getDataRange().getValues();
    if(q.some((r,i)=>i>0&&String(r[2])===id&&['待機','処理中','同期待ち','同期中'].includes(String(r[7]))))throw new Error('この車両の実績キューが処理中です。停止しました。');
    const props=PropertiesService.getScriptProperties().getProperties();
    for(const key of Object.keys(props))if(key.startsWith('GF_PLAN_AUTO_40_')){
      try{const j=JSON.parse(props[key]);if(String(j.id)===id)throw new Error('40番の自動実績依頼が残っています。先に処理状況を確認してください。');}
      catch(e){if(String(e.message||e).includes('自動実績依頼'))throw e;}
    }
    const keys=['区分/ステータス','現在使用者','DriverID','備考','代車貸出先','代車貸出エリア','代車貸出備考','代車開始日'];
    const before={},after={};keys.forEach(k=>{before[k]=String(d[k]||'');after[k]=String(d[k]||'');});
    before['代車開始日']=''; // 入力直前は空欄だったと確認した場合に限る
    before['区分/ステータス']='空車';
    after['区分/ステータス']='代車';
    const request='RECOVER43-'+Utilities.getUuid();
    // 履歴を先に記録してから台帳変更。途中失敗時は処理中として残し、無条件再実行させない。
    h.appendRow([request,new Date(),id,'代車開始',date,'処理中',JSON.stringify(before),JSON.stringify(after),'','43番：台帳入力済み実績を開始前「空車」の確認に基づき救済']);
    SpreadsheetApp.flush();
    try{
      行を書き込む_(v.sheet,v.row,{'区分/ステータス':'代車'});
      SpreadsheetApp.flush();
      h.getRange(h.getLastRow(),6).setValue('完了');
      GF_取消後同期を予約_24(ss,id);
      return {成功:true,VehicleID:id,車番:String(d['車番']||''),実施日:date,メッセージ:'代車ステータスと取消用履歴を登録しました。関連シートは同期キューへ送信済みです。'};
    }catch(err){throw new Error('台帳変更中に失敗しました。実績履歴の RECOVER43- 行を確認してください。'+String(err.message||err));}
  }finally{lock.releaseLock();}
}
/** 実行用：車両の現在状態だけを確認。データは一切変更しない。 */
function GF_代車開始_救済候補を確認する_43(){
  const ss=対象スプレッドシートを開く_(),ids=['V000022','V000023'];
  return ids.map(id=>{
    const d=GF_実績車両情報_(ss,id).data;
    const result={VehicleID:id,車番:d['車番'],ステータス:d['区分/ステータス'],代車開始日:d['代車開始日'],代車貸出先:d['代車貸出先'],代車貸出エリア:d['代車貸出エリア']};
    console.log(JSON.stringify(result));return result;
  });
}
/** テスト車両30-85(V000022)、38-72(V000023)を43番で順に救済。
 * 2台とも開始前が空車だったテストデータに限って実行。
 * 43番本体を先にGASへ追加してから使用する。
 */
function GF_テスト代車2台を救済する_43(){
  const ids=['V000022','V000023'];
  const results=[];
  for(const id of ids){
    try{
      const result=GF_代車開始_既存台帳を救済する_43(id,true);
      results.push(result);
      console.log('成功 '+id+' '+JSON.stringify(result));
    }catch(e){
      const message=String(e&&e.message||e);
      results.push({成功:false,VehicleID:id,メッセージ:message});
      console.error('失敗 '+id+' '+message);
    }
  }
  return results;
}

