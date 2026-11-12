/** GOLD FIRST / 41_代車情報連動.gs
 * 車両台帳の「代車貸出先」「代車貸出エリア」「代車貸出備考」が正本。
 * 初回に GF_代車情報連動を初期設定する_41 を一度実行。
 * 台帳の直接編集はインストール型 onEdit で該当車両だけ同期。
 * 代車開始日を直接入力すると、空車→代車へ変更。専用3列だけではステータスを変更しない。
 * 既存の「貸出先」列は古いコードとの互換用に維持する（削除しない）。
 */
const GF_代車項目_41=['代車貸出先','代車貸出エリア','代車貸出備考'];
// 代車開始日を台帳で入力した時だけ、空車から代車へ切り替える。
// 返却日・取消・他の状態は勝手に変更しない。
function GF_代車開始ステータス更新_41(sh,row,h){
  const cStart=h.indexOf('代車開始日')+1, cReturn=h.indexOf('代車返却日')+1, cStatus=h.indexOf('区分/ステータス')+1;
  if(!cStart||!cStatus)throw new Error('代車開始日または区分/ステータス列がありません。');
  const start=sh.getRange(row,cStart).getValue();
  const valid=start instanceof Date ? !isNaN(start.getTime()) : /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(String(start||'').trim());
  if(!valid)return '開始日未入力';
  if(cReturn&&String(sh.getRange(row,cReturn).getDisplayValue()||'').trim())return '返却日あり';
  const status=String(sh.getRange(row,cStatus).getDisplayValue()||'').trim();
  if(status==='代車')return '代車';
  if(status!=='空車')throw new Error('現在のステータスが「'+status+'」のため自動変更しません。');
  sh.getRange(row,cStatus).setValue('代車');
  return '代車';
}

function GF_代車列を確保_41(sheet,names){
  let h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const missing=names.filter(x=>!h.includes(x));
  if(missing.length){
    const start=sheet.getLastColumn()+1;
    if(start+missing.length-1>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),start+missing.length-1-sheet.getMaxColumns());
    sheet.getRange(1,start,1,missing.length).setValues([missing]);
    h=h.concat(missing);
  }
  return h;
}
function GF_代車車両行_41(sheet,id){
  const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const c=h.indexOf('VehicleID')+1;
  if(!c)throw new Error(sheet.getName()+'にVehicleIDがありません。');
  const n=sheet.getLastRow();if(n<2)return null;
  const found=sheet.getRange(2,c,n-1,1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  if(!found)return null;
  const values=sheet.getRange(found.getRow(),1,1,h.length).getDisplayValues()[0];
  const obj={};h.forEach((x,i)=>{if(x)obj[x]=values[i];});
  return {row:found.getRow(),h:h,data:obj};
}
function GF_代車列書込_41(sheet,row,h,updates){
  for(const [key,val] of Object.entries(updates)){
    const c=h.indexOf(key)+1;
    if(c&&String(sheet.getRange(row,c).getDisplayValue()||'')!==String(val||''))sheet.getRange(row,c).setValue(val||'');
  }
}
/** ロックを外側で取得している呼出元からも使えるよう、ここではロックを取得しない。 */
function GF_代車情報を台帳から同期する_41(ss,vehicle){
  const ledger=ss.getSheetByName(シート名.車両台帳);
  const users=ss.getSheetByName(シート名.利用者管理);
  const status=ss.getSheetByName(シート名.車両状況);
  if(!ledger||!users||!status)throw new Error('車両台帳・利用者管理・車両状況を確認してください。');
  GF_代車列を確保_41(ledger,GF_代車項目_41);
  GF_代車列を確保_41(users,GF_代車項目_41);
  GF_代車列を確保_41(status,GF_代車項目_41);
  const src=GF_代車車両行_41(ledger,vehicle);
  if(!src)throw new Error('車両台帳に車両がありません: '+vehicle);
  const val={};GF_代車項目_41.forEach(k=>val[k]=String(src.data[k]||''));
  const u=GF_代車車両行_41(users,vehicle),s=GF_代車車両行_41(status,vehicle);
  if(!u||!s)throw new Error('関連シートに車両がありません。通常の車両同期後に再実行してください: '+vehicle);
  GF_代車列書込_41(users,u.row,u.h,val);
  GF_代車列書込_41(status,s.row,s.h,val);
  // 従来画面・取消処理との互換。既存列があれば値を合わせる。
  GF_代車列書込_41(users,u.row,u.h,{'貸出先':val.代車貸出先,'貸出エリア':val.代車貸出エリア,'貸出備考':val.代車貸出備考});
  GF_代車列書込_41(status,s.row,s.h,{'貸出先':[val.代車貸出先,val.代車貸出エリア].filter(Boolean).join('／')});
  const current=String(src.data['区分/ステータス']||'');
  GF_代車列書込_41(users,u.row,u.h,{'ステータス':current});
  GF_代車列書込_41(status,s.row,s.h,{'現在のステータス':current});
  return {成功:true,VehicleID:vehicle};
}
/** 代車の開始/返却時だけ、正本列を変更。通常貸出の情報は混在させない。 */
function GF_代車情報を実績から更新_41(ss,vehicle,kind,fields){
  if(!['代車開始','代車返却'].includes(kind))return;
  const ledger=ss.getSheetByName(シート名.車両台帳);
  GF_代車列を確保_41(ledger,GF_代車項目_41);
  const car=GF_代車車両行_41(ledger,vehicle);
  if(!car)throw new Error('台帳に対象車両がありません。');
  const start=kind==='代車開始',f=fields||{};
  GF_代車列書込_41(ledger,car.row,car.h,{
    '代車貸出先':start?String(f.貸出先||f.代車貸出先||''):'',
    '代車貸出エリア':start?String(f.貸出エリア||f.代車貸出エリア||''):'',
    '代車貸出備考':start?String(f.備考||f.代車貸出備考||''):''
  });
  GF_代車情報を台帳から同期する_41(ss,vehicle);
}
/** 台帳の既存「予定反映状況」列に代車情報の反映結果を記録する。 */
function GF_代車反映結果表示_41(sheet,row,message){
  const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
  const c=h.indexOf('予定反映状況')+1;
  if(!c)throw new Error('車両台帳に「予定反映状況」列がありません。');
  sheet.getRange(row,c).setValue(message);
}
function GF_代車情報台帳編集_41(e){
  if(!e||!e.range)return;
  const sh=e.range.getSheet(),ss=sh.getParent();
  if(sh.getName()!==シート名.車両台帳||e.range.getLastRow()<2)return;
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const idcol=h.indexOf('VehicleID')+1;if(!idcol)return;
  const affected=[...GF_代車項目_41,'代車開始日'].some(k=>{const c=h.indexOf(k)+1;return c>=e.range.getColumn()&&c<=e.range.getLastColumn();});
  const startCol=h.indexOf('代車開始日')+1;
  const editedStart=startCol>=e.range.getColumn()&&startCol<=e.range.getLastColumn();
  if(!affected)return;
  for(let r=Math.max(2,e.range.getRow());r<=e.range.getLastRow();r++){
    const id=String(sh.getRange(r,idcol).getDisplayValue()||'').trim();
    if(!id)continue;
    GF_代車反映結果表示_41(sh,r,'代車情報：反映待ち');
  }
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)){
    // 失敗したのに「反映済」と誤表示しない。再試行は下の手動関数で可能。
    return;
  }
  try{
    for(let r=Math.max(2,e.range.getRow());r<=e.range.getLastRow();r++){
      const id=String(sh.getRange(r,idcol).getDisplayValue()||'').trim();if(!id)continue;
      try{
        // 代車開始日の実績反映は40→25に一本化。41はステータスを変更しない。
        GF_代車情報を台帳から同期する_41(ss,id);
        GF_代車反映結果表示_41(sh,r,'代車情報：反映済 '+Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'MM/dd HH:mm'));
      }catch(err){
        GF_代車反映結果表示_41(sh,r,'代車情報：エラー '+String(err.message||err).slice(0,100));
        console.error('代車情報反映エラー / '+id+' / '+err);
      }
    }
  }finally{lock.releaseLock();}
}
/** 反映待ち・エラーの行を手動で再同期する。重い全車両同期は行わない。 */
function GF_代車情報の未反映を再実行する_41(){
  const ss=対象スプレッドシートを開く_();
  const sh=ss.getSheetByName(シート名.車両台帳);
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const statusCol=h.indexOf('予定反映状況')+1,idCol=h.indexOf('VehicleID')+1;
  if(!statusCol||!idCol)throw new Error('VehicleIDまたは予定反映状況列がありません。');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))throw new Error('ほかの更新中です。時間をおいて再実行してください。');
  let ok=0,ng=0;
  try{
    const rows=sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),Math.max(statusCol,idCol)).getDisplayValues();
    for(let i=0;i<rows.length;i++){
      const state=String(rows[i][statusCol-1]||'');
      if(!/^代車情報：(?:反映待ち|エラー)/.test(state))continue;
      const id=String(rows[i][idCol-1]||'').trim();if(!id)continue;
      try{
        // 再試行でも実績ステータスを先に変更しない。
        GF_代車情報を台帳から同期する_41(ss,id);
        GF_代車反映結果表示_41(sh,i+2,'代車情報：反映済 '+Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'MM/dd HH:mm'));
        ok++;
      }catch(err){
        GF_代車反映結果表示_41(sh,i+2,'代車情報：エラー '+String(err.message||err).slice(0,100));ng++;
      }
    }
  }finally{lock.releaseLock();}
  console.log('代車情報の再反映：成功 '+ok+'件、エラー '+ng+'件');
  return {成功:ok,エラー:ng};
}
function GF_代車情報連動を初期設定する_41(){
  const ss=対象スプレッドシートを開く_();
  const ledger=ss.getSheetByName(シート名.車両台帳),users=ss.getSheetByName(シート名.利用者管理),status=ss.getSheetByName(シート名.車両状況);
  if(!ledger||!users||!status)throw new Error('必要な管理シートがありません。');
  [ledger,users,status].forEach(sh=>GF_代車列を確保_41(sh,GF_代車項目_41));
  // 既存データは「代車」車両に限り、従来の利用者管理から新しい台帳列へ初回移行。
  const rows=ledger.getDataRange().getDisplayValues(),h=rows[0].map(x=>String(x||'').trim());
  const idcol=h.indexOf('VehicleID'),statuscol=h.indexOf('区分/ステータス');
  let migrated=0;
  for(let i=1;i<rows.length;i++){
    if(String(rows[i][statuscol]||'').trim()!=='代車')continue;
    const id=String(rows[i][idcol]||'').trim();if(!id)continue;
    const u=GF_代車車両行_41(users,id);if(!u)continue;
    const old={代車貸出先:String(u.data.貸出先||''),代車貸出エリア:String(u.data.貸出エリア||''),代車貸出備考:String(u.data.貸出備考||'')};
    const newHas=GF_代車項目_41.some(k=>String(rows[i][h.indexOf(k)]||'').trim());
    if(!newHas&&Object.values(old).some(Boolean)){
      GF_代車列書込_41(ledger,i+1,h,old);migrated++;
    }
  }
  const name='GF_代車情報台帳編集_41';
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name);
  if(!existing.length)ScriptApp.newTrigger(name).forSpreadsheet(ss).onEdit().create();
  console.log('代車列準備完了。既存データ移行 '+migrated+' 台。以降は台帳3列を編集してください。');
  return {成功:true,既存移行:migrated};
}
