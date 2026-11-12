/** GOLD FIRST / 42_台帳実績日付取消.gs
 * 車両台帳の実績日付の「削除→取消」「変更→履歴の日付変更」。
 * 24番の既存取消処理を利用。25/44/41番は変更しない。
 * 新規入力は既存25/44番が担当。既存履歴がない場合は変更・削除を保留する。
 * 注意：単一セルの手入力のみ。複数セル貼付には対応しない。
 */
const GF_実績日付取消対応_42={
  '引渡し':'貸出開始',
  '返却/12点検':'返却完了',
  '代車開始日':'代車開始',
  '代車返却日':'代車返却'
};
function GF_台帳実績日付取消を初期設定する_42(){
  const ss=対象スプレッドシートを開く_();
  const name='GF_台帳実績日付削除を受付する_42';
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name);
  if(!existing.length)ScriptApp.newTrigger(name).forSpreadsheet(ss).onEdit().create();
  existing.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
  console.log('42番：日付削除は取消、日付上書きは変更として監視します。');
}
function GF_台帳実績日付削除を受付する_42(e){
  if(!e||!e.range)return;
  const cell=e.range,sh=cell.getSheet();
  if(sh.getName()!==シート名.車両台帳||cell.getRow()<2||cell.getNumRows()!==1||cell.getNumColumns()!==1)return;
  const heads=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const col=heads[cell.getColumn()-1],kind=GF_実績日付取消対応_42[col];
  if(!kind)return;
  const rawOld=e.oldValue;
  if(rawOld===undefined||rawOld===null||String(rawOld).trim()==='')return; // 新規入力は44/25番
  const ss=sh.getParent(),tz=ss.getSpreadsheetTimeZone();
  const oldDate=GF_実績台帳日付キー_25(rawOld,tz);
  if(!oldDate){console.error('42番：変更前の日付を読めません。行='+cell.getRow());return;}
  const rawNew=cell.getValue();
  const deleting=rawNew===''||rawNew===null;
  const newDate=deleting?'':GF_実績台帳日付キー_25(rawNew,tz);
  if(!deleting&&!newDate){
    console.error('42番：変更後の日付が不正です。変更前の日付に戻します。');
    cell.setValue(GF_実績日付_(oldDate,tz));return;
  }
  if(newDate===oldDate)return;
  // 24番の取消は元の日付が台帳にあることを確認するので、先に復元する。
  cell.setValue(GF_実績日付_(oldDate,tz));
  const idCol=heads.indexOf('VehicleID')+1;
  if(!idCol)throw new Error('42番：VehicleID列がありません。');
  const vehicle=String(sh.getRange(cell.getRow(),idCol).getDisplayValue()||'').trim();
  if(!vehicle)throw new Error('42番：VehicleIDがありません。');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(3000)){
    console.error('42番：別処理中のため保留。日付は元に戻しました。'+vehicle);return;
  }
  let cancelId="";
  try{
    const hist=GF_実績履歴を準備_26(ss),rows=hist.getDataRange().getValues();
    const matches=[];
    for(let i=1;i<rows.length;i++){
      const r=rows[i];
      if(String(r[2])===vehicle&&String(r[3])===kind&&String(r[5])==='完了'&&GF_実績台帳日付キー_25(r[4],tz)===oldDate)
        matches.push({row:i+1,data:r});
    }
    if(matches.length!==1)throw new Error('完了履歴が'+matches.length+'件のため、変更・取消できません。');
    const item=matches[0],record=item.data,requestId=String(record[0]);
    // 同じ車両に未完了受付があれば、上書きしない。
    const q=ss.getSheetByName('実績登録キュー');
    if(q&&q.getLastRow()>1){
      const pending=q.getDataRange().getDisplayValues().slice(1).some(r=>String(r[2])===vehicle&&['待機','処理中','同期待ち','同期中'].includes(String(r[7])));
      if(pending)throw new Error('スマホからの実績処理が進行中です。');
    }
    const q44=ss.getSheetByName('代車開始受付キュー');
    if(q44&&q44.getLastRow()>1){
      const pending=q44.getDataRange().getDisplayValues().slice(1).some(r=>String(r[2])===vehicle&&['待機','処理中','同期待ち'].includes(String(r[5])));
      if(pending)throw new Error('台帳からの実績処理が進行中です。');
    }
    const later=rows.slice(item.row).some(r=>String(r[2])===vehicle&&String(r[5])==='完了');
    if(later)throw new Error('後続の完了実績があるため、管理者による確認が必要です。');
    const current=GF_実績車両情報_(ss,vehicle);
    const after=JSON.parse(String(record[7]||'{}'));
    for(const key of ['区分/ステータス','現在使用者','DriverID']){
      if(String(current.data[key]||'')!==String(after[key]||''))throw new Error(key+'が登録後に変更されています。');
    }
    if(deleting){
      // ロックを保持したまま24番を呼ぶとデッドロックするため、取消は後段で実行。
      console.log('42番：取消対象を確認 '+requestId);
    }else{
      // 履歴の「実施日」と変更後JSONの対象日付だけを変更。変更前JSONは保存する。
      after[col]=newDate;
      const note=String(record[9]||'');
      hist.getRange(item.row,5).setValue(newDate);
      hist.getRange(item.row,8).setValue(JSON.stringify(after));
      hist.getRange(item.row,10).setValue((note?note+' / ':'')+'日付変更 '+oldDate+' → '+newDate);
      cell.setValue(GF_実績日付_(newDate,tz));
      GF_44関連同期を保留する_(vehicle);
      console.log('42番：日付変更完了 '+vehicle+' / '+kind+' / '+oldDate+' → '+newDate);
    }
    // 削除はロック解放後に24番を呼ぶ。
    if(deleting)cancelId=requestId;
  }catch(err){
    console.error('42番：日付は元に戻しました / '+vehicle+' / '+String(err&&err.message||err));
  }finally{lock.releaseLock();}
  // 24番側でロックを取得するため、ここで取消を呼ぶ。
  if(deleting&&cancelId){
    const requestId=cancelId;
    try{
      const result=GF_実績取消を実行する_26(requestId);
      console.log('42番：日付削除→取消 '+JSON.stringify(result));
    }catch(err){console.error('42番：取消保留、日付は復元済み / '+vehicle+' / '+String(err&&err.message||err));}
  }
}