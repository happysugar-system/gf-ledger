/** 45_LINE代車予定連携.gs / 車両管理GAS側に新規追加。40番は変更しない。
 * LINE受付ブックから依頼を読み、既存40番で予定を登録する。初期設定を1回実行。
 * 注意：予約は日付単位。既存の同一車両「代車」「代車返却」未完了予定があれば上書きせず停止。
 */
const GF171_LINE_BOOK='1VVgcHZcrYbwQUkJ9ZRxzJGT9na8hdd7i53MH-rW4jI4';
function GF171_車両側初期設定(){
 const sh=SpreadsheetApp.openById(GF171_LINE_BOOK).getSheetByName('LINE受付管理');if(!sh)throw Error('LINE受付管理がありません');
 const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
 ['受付ID','VehicleID','仮押さえ状態','代車開始予定日','代車返却予定日','代車予定連携状態','代車予定連携日時','代車予定連携結果'].forEach(n=>{if(!h.includes(n))throw Error('LINE側でGF171_初期設定を実行してください：'+n)});
 const name='GF171_代車予定ワーカー';const tr=ScriptApp.getProjectTriggers();
 if(!tr.some(x=>x.getHandlerFunction()===name))ScriptApp.newTrigger(name).timeBased().everyMinutes(1).create();
 return '車両側の代車予定連携を設定しました（1分ごと）';
}
function GF171_代車予定ワーカー(){
 const lock=LockService.getUserLock();if(!lock.tryLock(1000))return;
 try{
  const sh=SpreadsheetApp.openById(GF171_LINE_BOOK).getSheetByName('LINE受付管理');
  const data=sh.getDataRange().getDisplayValues(),h=data.shift().map(x=>String(x).trim()),c={};h.forEach((x,i)=>c[x]=i);
  const pending=data.findIndex(r=>String(r[c['代車予定連携状態']]||'').trim()==='反映待ち');if(pending<0)return;
  const r=data[pending],rn=pending+2,id=String(r[c['受付ID']]||'').trim(),v=String(r[c.VehicleID]||'').trim(),start=String(r[c['代車開始予定日']]||'').trim(),end=String(r[c['代車返却予定日']]||'').trim();
  const set=(name,val)=>sh.getRange(rn,c[name]+1).setValue(val);
  set('代車予定連携状態','処理中');SpreadsheetApp.flush();
  try{
   if(!id||!v||!start||!end||end<start||String(r[c['仮押さえ状態']]||'').trim()!=='仮押さえ中')throw Error('受付・車両・日付・仮押さえを確認してください');
   const ss=対象スプレッドシートを開く_(),ledger=必須シートを取得する_(ss,シート名.車両台帳),plans=必須シートを取得する_(ss,シート名.予定管理);
   const vehicleRow=IDで行を探す_(ledger,'VehicleID',v);if(!vehicleRow)throw Error('車両が見つかりません');
   const car=行データを取得する_(ledger,vehicleRow);
   if(String(car['区分/ステータス']||'').trim()!=='空車')throw Error('車両は現在空車ではありません');
   // 既存40番は同じ車両・種類の予定を上書きするため、先に必ず止める。
   for(const kind of ['代車','代車返却']){
    const type=予定種類を取得する_(kind,ss);
    if(未完了予定行を探す_(plans,v,type['予定種類ID']))throw Error('車両に既存の'+kind+'予定があります。上書き防止のため停止しました');
   }
   // 車両管理側の既存関数を利用。自動実績は明示的に無効。
   const a=車両予定を登録する_(v,'代車',start,'LINE受付',false);
   const b=車両予定を登録する_(v,'代車返却',end,'LINE受付',false);
   // カレンダーと車両状況への反映は既存の後処理で実行。
   スマホ予定登録後処理を実行する(a.予定ID);
   スマホ予定登録後処理を実行する(b.予定ID);
   set('代車予定連携状態','登録済');set('代車予定連携結果','代車予定ID：'+a.予定ID+' / 返却予定ID：'+b.予定ID);
  }catch(e){
   // 途中まで登録されている可能性があるため自動再試行しない。
   set('代車予定連携状態','要確認');set('代車予定連携結果',String(e.message||e).slice(0,500));
   console.error('代車連携 '+id+'：'+e);
  }
 }finally{lock.releaseLock()}
}