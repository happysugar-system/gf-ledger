/** GOLD FIRST / 24_実績取消.gs 全文貼替え版。25の履歴対応版とセット。 */



const GF_実績履歴列_26=['受付ID','登録日時','VehicleID','種類','実施日','状態','変更前JSON','変更後JSON','取消日時','備考'];



function GF_実績履歴を準備_26(ss){



  let sh=ss.getSheetByName('実績履歴');



  if(!sh){sh=ss.insertSheet('実績履歴');sh.appendRow(GF_実績履歴列_26);sh.setFrozenRows(1);}



  return sh;



}



function GF_実績対象列_26(kind){return {'貸出開始':'引渡し','返却完了':'返却/12点検','代車開始':'代車開始日','代車返却':'代車返却日'}[kind];}



function GF_実績履歴を保存_26(ss,r,v,state){



  const sh=GF_実績履歴を準備_26(ss),id=String(r[0]);



  const vals=sh.getDataRange().getValues();if(vals.some((x,i)=>i>0&&String(x[0])===id))return;



  const kind=String(r[3]),before={};



  ['区分/ステータス','現在使用者','DriverID','備考','代車貸出先','代車貸出エリア','代車貸出備考',GF_実績対象列_26(kind)].forEach(k=>{if(k)before[k]=v.data[k]||'';});



  const after={};Object.keys(before).forEach(k=>after[k]=before[k]);



  after[GF_実績対象列_26(kind)]=String(r[4]).replace(/^'/,'');



  after['区分/ステータス']=kind==='貸出開始'?'貸出中':kind==='代車開始'?'代車':'空車';



  if(['返却完了','代車返却'].includes(kind)){after['現在使用者']='';after['DriverID']='';}



  if(kind==='代車返却') ['代車貸出先','代車貸出エリア','代車貸出備考'].forEach(k=>after[k]='');



  sh.appendRow([id,new Date(),String(r[2]),kind,String(r[4]).replace(/^'/,''),state,JSON.stringify(before),JSON.stringify(after),'','']);



}



/** 実績反映・貸出先連携が終わった時点の実際の台帳値を変更後履歴へ保存。 */

function GF_実績履歴の変更後を確定_26(ss,id,vehicle){

  const found=GF_実績履歴の対象_26(ss,id);

  if(!found)throw new Error('実績履歴がありません: '+id);

  const before=JSON.parse(String(found.data[6]||'{}'));

  const after={};

  Object.keys(before).forEach(k=>{after[k]=vehicle.data[k]||'';});

  found.sheet.getRange(found.row,8).setValue(JSON.stringify(after));

}

function GF_実績履歴を状態変更_26(ss,id,state){



  const sh=GF_実績履歴を準備_26(ss),v=sh.getDataRange().getValues();



  for(let i=v.length-1;i>=1;i--)if(String(v[i][0])===id){sh.getRange(i+1,6).setValue(state);return;}



  throw new Error('実績履歴が見つかりません: '+id);



}



function GF_実績履歴の対象_26(ss,id){



  const sh=GF_実績履歴を準備_26(ss),v=sh.getDataRange().getValues();



  for(let i=v.length-1;i>=1;i--)if(String(v[i][0])===id)return {sheet:sh,row:i+1,data:v[i]};



  return null;



}



function GF_実績取消を実行する_26(id){



  id=String(id||'').trim();if(!id)throw new Error('受付IDがありません。');



  const lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw new Error('別の更新中です。少し待ってから再実行してください。');



  let syncRow=0, syncVehicle='';



  try{



    const ss=対象スプレッドシートを開く_(),queue=GF_実績キューシート_(),q=queue.getDataRange().getValues();



    const qi=q.findIndex((r,i)=>i>0&&String(r[0])===id);



    if(qi>=1){



      const state=String(q[qi][7]);



      if(state==='待機'){



        queue.getRange(qi+1,8,1,3).setValues([['完了','利用者の操作で受付取消',new Date()]]);



        const h=GF_実績履歴の対象_26(ss,id);if(h){h.sheet.getRange(h.row,6).setValue('取消済');h.sheet.getRange(h.row,9).setValue(new Date());}



        return {成功:true,メッセージ:'受付を取り消しました。'};



      }



      if(['処理中','同期待ち','同期中'].includes(state))throw new Error('台帳への反映中です。1分ほど待ってからもう一度取り消してください。');



      if(state==='エラー')throw new Error('処理エラー中です。管理者が台帳を確認してください。');



    }



    const h=GF_実績履歴の対象_26(ss,id);



    if(!h)throw new Error('完了履歴がありません。古い実績は自動取消できません。');



    if(String(h.data[5])==='取消済')return {成功:true,メッセージ:'すでに取り消されています。'};



    if(String(h.data[5])!=='完了')throw new Error('完了していない実績です。しばらく待ってください。');



    const vehicle=String(h.data[2]),kind=String(h.data[3]),v=GF_実績車両情報_(ss,vehicle),before=JSON.parse(h.data[6]),after=JSON.parse(h.data[7]);



    const target=GF_実績対象列_26(kind),tz=ss.getSpreadsheetTimeZone();



    if(GF_実績台帳日付キー_25(v.data[target],tz)!==GF_実績台帳日付キー_25(h.data[4],tz))throw new Error('実績日が変更されています。自動取消できません。');



    // 新しい実績が続いていたら、過去の状態に巻き戻さない。



    const ledger=ss.getSheetByName(シート名.車両台帳);



    const all=GF_実績履歴を準備_26(ss).getDataRange().getValues();



    const newer=all.some((x,i)=>i>0&&String(x[2])===vehicle&&String(x[0])!==id&&String(x[5])==='完了'&&new Date(x[1]).getTime()>new Date(h.data[1]).getTime());



    if(newer)throw new Error('この実績の後に別の実績があります。管理者が順番に確認してください。');



    const changes={};



    for(const k of ['区分/ステータス','現在使用者','DriverID']){



      if(String(v.data[k]||'')!==String(after[k]||''))throw new Error(k+'が登録後に変更されています。管理者が確認してください。');



      changes[k]=before[k]||'';



    }



    changes[target]=before[target]||'';



    // 実績開始時に書いた貸出情報のみ取り消す。別の記録や手動変更は保護する。



    if(['貸出開始','代車開始'].includes(kind)) GF_取消貸出情報を検証して消す_24(ss,vehicle,kind,h.data[4],v);



    行を書き込む_(ledger,v.row,changes);



    if(kind==='代車開始')GF_代車情報を実績から更新_41(ss,vehicle,'代車返却',{});



    if(kind==='代車返却'){



      const cols=['代車貸出先','代車貸出エリア','代車貸出備考'];



      if(!cols.every(k=>Object.prototype.hasOwnProperty.call(before,k)))throw new Error('返却前の代車情報が履歴にありません。自動復元を中止しました。');



      GF_代車列を確保_41(ledger,cols);



      const current=GF_代車車両行_41(ledger,vehicle);



      GF_代車列書込_41(ledger,current.row,current.h,Object.fromEntries(cols.map(k=>[k,before[k]||''])));



      GF_代車情報を台帳から同期する_41(ss,vehicle);



    }



    h.sheet.getRange(h.row,6).setValue('取消済');h.sheet.getRange(h.row,9).setValue(new Date());



    syncRow=v.row; syncVehicle=vehicle;



    GF_取消後同期を予約_24(ss,vehicle);



  }finally{lock.releaseLock();}



  if(syncRow) return {成功:true,メッセージ:'取消を受け付けました。台帳は更新済みです。関連シートは自動同期します。'};



  return {成功:true,メッセージ:'実績を取り消しました。'};



}



function GF_スマホ実績取消_26(id){try{return GF_実績取消を実行する_26(id);}catch(e){return {成功:false,メッセージ:String(e&&e.message||e)};}}











/** 取消する実績の貸出情報だけ削除する。ScriptLockを取得済みの状態で呼ぶ。 */



function GF_取消貸出情報を検証して消す_24(ss,vehicle,kind,date,car){



  const ledger=必須シートを取得する_(ss,シート名.車両台帳);



  const users=必須シートを取得する_(ss,シート名.利用者管理);



  const status=必須シートを取得する_(ss,シート名.車両状況);



  const ur=IDで行を探す_(users,'VehicleID',vehicle);



  const sr=IDで行を探す_(status,'VehicleID',vehicle);



  if(!ur||!sr)throw new Error('貸出情報の取消先が見つかりません。');



  const u=行データを取得する_(users,ur),st=行データを取得する_(status,sr);



  const note=String(car.data.備考||'');



  const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();



  const loan=String(u.貸出先||'').trim(),area=String(u.貸出エリア||'').trim();



  const display=[loan,area].filter(Boolean).join('／');



  // 利用者管理と車両状況が違う内容なら消さない。



  if(normalize(st.貸出先)!==normalize(display))



    throw new Error('関連シートの貸出先が一致しません。自動取消を中止しました。');



  // 日付 2026-10-12 / 2026/10/12 / 2026/10/12 のいずれも照合。



  const key=GF_実績台帳日付キー_25(date,ss.getSpreadsheetTimeZone());



  const parts=String(key||'').split('-');



  if(parts.length!==3)throw new Error('実績履歴の日付を読み取れません。実績履歴の実施日を確認してください。');



  const dayPattern=parts[0]+'[\\\\/-]0?'+Number(parts[1])+'[\\\\/-]0?'+Number(parts[2]);



  const pattern=new RegExp('【\\s*'+dayPattern+'\\s*'+kind+'\\s*】');



  const match=pattern.exec(note);



  let remaining=note,found=false;



  if(match){



    const start=match.index,bodyStart=start+match[0].length;



    const rest=note.slice(bodyStart),next=rest.search(/【\s*\d{4}[\\\\/-]\d{1,2}[\\\\/-]\d{1,2}\s+[^】]+】/);



    const end=next<0?note.length:bodyStart+next;



    const block=note.slice(bodyStart,end);



    const lm=block.match(/(?:代車)?貸出先[：:]\s*([^\r\n]+)/);



    const am=block.match(/(?:代車貸出)?エリア[：:]\s*([^\r\n]+)/);



    const bl=lm?lm[1].trim():'',ba=am?am[1].trim():'';



    if(bl||ba){



      if(normalize(bl)!==normalize(loan)||normalize(ba)!==normalize(area))



        throw new Error('備考の貸出先と現在の貸出先が一致しません。取消を中止しました。');



      remaining=(note.slice(0,start)+note.slice(end)).replace(/\n{3,}/g,'\n\n').trim();



      found=true;



    }



  }



  // 古い登録や備考書式の違いで記録が見つからない場合、他の備考は一切消さない。



  // この関数は、履歴・VehicleID・日付・状態・後続実績を検証した後だけ呼ばれる。



  // 貸出情報が一致していれば関連シートだけ消し、備考は要確認として残す。



  if(!found&&note)console.warn('取消：一致する貸出備考なし。既存備考は保持 / '+vehicle+' / '+kind+' / '+date);



  const userChanges={};



  if(loan)userChanges.貸出先='';



  if(area)userChanges.貸出エリア='';



  if(String(u.貸出備考||''))userChanges.貸出備考='';



  if(Object.keys(userChanges).length)行を書き込む_(users,ur,userChanges);



  if(String(st.貸出先||''))セルを書き込む_(status,sr,'貸出先','');



  if(found&&remaining!==note)セルを書き込む_(ledger,car.row,'備考',remaining);



  return {備考削除:found,備考要確認:!found&&!!note};



}







/** 既に取消済になった履歴の貸出情報だけ修復。GASから受付IDを指定して実行する。 */



function GF_取消済貸出情報を修復_24(受付ID){



  const id=String(受付ID||'').trim();if(!id)throw new Error('受付IDを指定してください。');



  const lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw new Error('別の更新中です。');



  try{



    const ss=対象スプレッドシートを開く_(),h=GF_実績履歴の対象_26(ss,id);



    if(!h||String(h.data[5])!=='取消済')throw new Error('取消済の実績履歴がありません。');



    const vehicle=String(h.data[2]),kind=String(h.data[3]);



    if(!['貸出開始','代車開始'].includes(kind))throw new Error('開始実績のみ対象です。');



    const car=GF_実績車両情報_(ss,vehicle),before=JSON.parse(h.data[6]);



    const target=GF_実績対象列_26(kind);



    if(GF_実績台帳日付キー_25(car.data[target],ss.getSpreadsheetTimeZone()))throw new Error('開始日が再登録されています。');



    if(String(car.data['区分/ステータス']||'')!==String(before['区分/ステータス']||''))throw new Error('車両ステータスが変わっています。');



    const all=GF_実績履歴を準備_26(ss).getDataRange().getValues();



    if(all.some((x,i)=>i>0&&String(x[2])===vehicle&&String(x[0])!==id&&String(x[5])==='完了'&&new Date(x[1]).getTime()>new Date(h.data[1]).getTime()))throw new Error('新しい実績があるため修復を止めました。');



    GF_取消貸出情報を検証して消す_24(ss,vehicle,kind,h.data[4],car);



    SpreadsheetApp.flush();



    return '修復完了：'+vehicle;



  }finally{lock.releaseLock();}



}







/** 今回の38-72だけ修復するための実行用関数。 */



function GF_38_72の取消残りを修復する_24(){



  return GF_取消済貸出情報を修復_24('mv4ld92b-2-cuw3fdbz6u4-xfcf734zhbo');



}











/** 選択車両の取消可能な最新実績を返す。車両IDだけで無条件取消はしない。 */



function GF_車両の取消対象実績を取得_24(vehicleId){



  try{



    vehicleId=String(vehicleId||'').trim();



    if(!vehicleId)throw new Error('車両を選択してください。');



    const ss=対象スプレッドシートを開く_();



    const v=GF_実績車両情報_(ss,vehicleId);



    const history=GF_実績履歴を準備_26(ss).getDataRange().getValues();



    const records=history.slice(1).filter(r=>String(r[2])===vehicleId && String(r[5])==='完了');



    if(!records.length)return {成功:true,対象なし:true,メッセージ:'取消可能な完了実績がありません。'};



    // 同一車両の後続履歴があると古い実績を戻すのは危険なので、最新の完了実績のみ対象。



    const record=records[records.length-1];



    const id=String(record[0]),kind=String(record[3]),target=GF_実績対象列_26(kind);



    if(!target)throw new Error('未対応の実績種類です。');



    const after=JSON.parse(String(record[7]||'{}'));



    const tz=ss.getSpreadsheetTimeZone();



    if(GF_実績台帳日付キー_25(v.data[target],tz)!==GF_実績台帳日付キー_25(record[4],tz))



      return {成功:true,対象なし:true,メッセージ:'履歴と台帳の実績日が一致しません。管理者が確認してください。'};



    for(const k of ['区分/ステータス','現在使用者','DriverID']){



      if(String(v.data[k]||'')!==String(after[k]||''))



        return {成功:true,対象なし:true,メッセージ:'登録後に車両情報が変更されています。管理者が確認してください。'};



    }



    return {成功:true,対象なし:false,受付ID:id,種類:kind,実施日:String(record[4]),VehicleID:vehicleId};



  }catch(e){return {成功:false,メッセージ:String(e&&e.message||e)};}



}







/** 取消後の重い正規同期は1分間隔のワーカーへ渡す。受付画面では待たない。 */



function GF_取消後同期シート_24(ss){



  let sh=ss.getSheetByName('取消後同期キュー');



  if(!sh){sh=ss.insertSheet('取消後同期キュー');sh.appendRow(['VehicleID','受付日時','状態','最終エラー']);sh.hideSheet();}



  return sh;



}



function GF_取消後同期を予約_24(ss,vehicle){



  const sh=GF_取消後同期シート_24(ss);



  const rows=sh.getDataRange().getValues();



  if(!rows.some((r,i)=>i>0&&String(r[0])===vehicle&&String(r[2])!=='完了'))sh.appendRow([vehicle,new Date(),'待機','']);



  const fn='GF_取消後同期ワーカー_24';



  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===fn))



    ScriptApp.newTrigger(fn).timeBased().everyMinutes(1).create();



}



function GF_取消後同期ワーカー_24(){

  // 同期ワーカーの多重起動を抑止。重い同期中は次の1分起動をスキップ。

  const props=PropertiesService.getScriptProperties();

  const leaseKey='GF_CANCEL_SYNC_WORKER_LEASE_24';

  const lock=LockService.getScriptLock();

  if(!lock.tryLock(500))return;

  let task=null;

  try{

    const now=Date.now();

    const last=Number(props.getProperty(leaseKey)||0);

    if(last&&now-last<180000)return;

    const ss=対象スプレッドシートを開く_();

    const sh=ss.getSheetByName('取消後同期キュー');

    if(!sh||sh.getLastRow()<2)return;

    const rows=sh.getDataRange().getValues();

    for(let i=1;i<rows.length;i++){

      const state=String(rows[i][2]);

      if(state==='完了')continue;

      // 同じ行を複数の起動で重複処理しない。

      if(state==='同期中'){

        const since=rows[i][1] instanceof Date?rows[i][1].getTime():0;

        if(since&&now-since<180000)continue;

      }

      task={vehicle:String(rows[i][0]),row:i+1};

      sh.getRange(i+1,2,1,2).setValues([[new Date(),'同期中']]);

      props.setProperty(leaseKey,String(now));

      break;

    }

  }finally{lock.releaseLock();}

  if(!task)return;

  try{

    const ss=対象スプレッドシートを開く_();

    const car=GF_実績車両情報_(ss,task.vehicle);

    // 30番はロック待ちを短くしてある。混雑時はここで再試行へ戻す。

    車両台帳の1台を同期する(car.row,true);

    const sh=ss.getSheetByName('取消後同期キュー');

    if(sh&&String(sh.getRange(task.row,1).getDisplayValue())===task.vehicle)

      sh.getRange(task.row,3,1,2).setValues([['完了','']]);

  }catch(e){

    const ss=対象スプレッドシートを開く_(),sh=ss.getSheetByName('取消後同期キュー');

    if(sh&&String(sh.getRange(task.row,1).getDisplayValue())===task.vehicle)

      sh.getRange(task.row,3,1,2).setValues([['再試行',String(e&&e.message||e).slice(0,400)]]);

    console.warn('取消後同期は次回再試行: '+e);

  }finally{

    const l=LockService.getScriptLock();

    if(l.tryLock(500)){

      try{props.deleteProperty(leaseKey);}finally{l.releaseLock();}

    }

  }

}





/** 取消済の21-46など、備考が残った車両をIDで安全修復する。 */



function GF_取消済車両の貸出残りを修復_24(VehicleID){



  const id=String(VehicleID||'').trim();if(!id)throw new Error('VehicleIDが必要です。');



  const ss=対象スプレッドシートを開く_(),rows=GF_実績履歴を準備_26(ss).getDataRange().getValues();



  const found=rows.slice(1).filter(r=>String(r[2])===id&&String(r[5])==='取消済'&&['貸出開始','代車開始'].includes(String(r[3])));



  if(!found.length)throw new Error('この車両の取消済履歴がありません。');



  return GF_取消済貸出情報を修復_24(String(found[found.length-1][0]));



}

/** 2026-10-12: 履歴のない台帳直接入力「代車開始」のスマホ取消。 */
function GF_台帳直接代車取消候補_24(vehicleId){
  try{
    const ss=対象スプレッドシートを開く_();
    const v=GF_実績車両情報_(ss,String(vehicleId||'').trim());
    const tz=ss.getSpreadsheetTimeZone();
    const date=GF_実績台帳日付キー_25(v.data['代車開始日'],tz);
    if(!date||String(v.data['区分/ステータス']||'')!=='代車')return {成功:true,対象なし:true,メッセージ:'取消できる代車開始がありません。'};
    if(GF_実績台帳日付キー_25(v.data['代車返却日'],tz))return {成功:true,対象なし:true,メッセージ:'代車返却日があるため、管理者による確認が必要です。'};
    const sh=ss.getSheetByName('実績履歴');
    if(sh&&sh.getLastRow()>1){
      const rows=sh.getRange(2,1,sh.getLastRow()-1,Math.min(sh.getLastColumn(),10)).getValues();
      if(rows.some(r=>String(r[2])===String(vehicleId)&&String(r[5])==='完了'))return {成功:true,対象なし:true,メッセージ:'別の完了実績があるため、安全のため自動取消を停止しました。'};
    }
    return {成功:true,対象なし:false,台帳直接:true,VehicleID:String(vehicleId),種類:'代車開始（台帳直接入力）',実施日:date};
  }catch(e){return {成功:false,メッセージ:String(e&&e.message||e)};}
}
function GF_台帳直接代車開始を取り消す_24(vehicleId,expectedDate,restoreStatus){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))return {成功:false,メッセージ:'別の更新中です。少し待ってから再試行してください。'};
  let ss,vehicle;
  try{
    vehicle=String(vehicleId||'').trim();
    const status=String(restoreStatus||'').trim();
    if(!['空車','貸出中'].includes(status))throw new Error('取消後の状態を「空車」か「貸出中」から選択してください。');
    ss=対象スプレッドシートを開く_();
    const v=GF_実績車両情報_(ss,vehicle),tz=ss.getSpreadsheetTimeZone();
    const actual=GF_実績台帳日付キー_25(v.data['代車開始日'],tz);
    if(!actual||actual!==String(expectedDate))throw new Error('開始日が変更されています。画面を更新してください。');
    if(String(v.data['区分/ステータス']||'')!=='代車')throw new Error('車両ステータスが変更されています。');
    if(GF_実績台帳日付キー_25(v.data['代車返却日'],tz))throw new Error('代車返却日が登録されています。');
    const h=ss.getSheetByName('実績履歴');
    if(h&&h.getLastRow()>1){
      const rows=h.getRange(2,1,h.getLastRow()-1,Math.min(h.getLastColumn(),10)).getValues();
      if(rows.some(r=>String(r[2])===vehicle&&String(r[5])==='完了'))throw new Error('完了実績があるため取消を停止しました。');
    }
    const ledger=ss.getSheetByName(シート名.車両台帳);
    行を書き込む_(ledger,v.row,{'代車開始日':'','区分/ステータス':status,'代車貸出先':'','代車貸出エリア':'','代車貸出備考':''});
    GF_代車情報を台帳から同期する_41(ss,vehicle);
    GF_取消後同期を予約_24(ss,vehicle);
    return {成功:true,メッセージ:'代車開始を取り消しました。台帳・関連シートを更新し、追加同期を予約しました。'};
  }catch(e){return {成功:false,メッセージ:String(e&&e.message||e)};}
  finally{lock.releaseLock();}
}
