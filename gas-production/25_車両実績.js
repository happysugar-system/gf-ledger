/** GOLD FIRST / 25_車両実績.gs 全文貼替え版



 * 初回だけ GF_実績キュー初期設定 を手動実行してください。



 * 受付時はキューへ保存し、台帳更新・正規同期は1分トリガーで行います。



 * キューは非表示。正規同期まで完了した行は自動削除します。



 * 待機・処理中・エラーは保持。実績ログ・受付診断は追加しません。



 */



function GF_実績キューシート_(){



  const ss=対象スプレッドシートを開く_();



  const name='実績登録キュー';



  let sheet=ss.getSheetByName(name);



  if(!sheet){



    sheet=ss.insertSheet(name);



    sheet.appendRow(['受付ID','受付日時','VehicleID','種類','実施日','DriverID','現在使用者','状態','詳細','完了日時']);



    sheet.setFrozenRows(1);



  }



  if(!sheet.isSheetHidden())sheet.hideSheet();



  return sheet;



}



function GF_実績キュー初期設定(){



  const lock=LockService.getScriptLock();lock.waitLock(10000);



  try{



    const queue=GF_実績キューシート_();



    GF_実績完了行を削除する_25(queue);



    const ss=queue.getParent(),diagnostic=ss.getSheetByName('実績受付診断');



    if(diagnostic)ss.deleteSheet(diagnostic);



    const name='GF_実績キューワーカー';



    if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===name)){



      ScriptApp.newTrigger(name).timeBased().everyMinutes(1).create();



    }



  }finally{lock.releaseLock();}



  console.log('実績登録キューと1分トリガーの準備完了');



}



function GF_実績日付_(value,tz){



  const s=String(value||'').trim();



  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('実施日を選択してください。');



  const d=Utilities.parseDate(s+' 12:00:00',tz,'yyyy-MM-dd HH:mm:ss');



  if(Utilities.formatDate(d,tz,'yyyy-MM-dd')!==s)throw new Error('実施日が不正です。');



  return d;



}



function GF_実績車両情報_(ss,id){



  const sheet=必須シートを取得する_(ss,シート名.車両台帳);



  const rows=sheet.getDataRange().getDisplayValues();



  const heads=rows[0].map(x=>String(x||'').trim());



  const col=heads.indexOf('VehicleID');



  if(col<0)throw new Error('車両台帳にVehicleID列がありません。');



  const n=rows.findIndex((r,i)=>i>0&&String(r[col]).trim()===id);



  if(n<1)throw new Error('対象車両が見つかりません。');



  const data={};heads.forEach((h,i)=>{if(h)data[h]=rows[n][i];});



  return {sheet:sheet,row:n+1,data:data};



}



/** スタッフには通常の案内だけ返す。診断シートは作成しない。 */



function スマホ車両実績をキュー受付する(data){



  try{return GF_実績受付本体_25(data);}



  catch(e){



    const msg=String(e&&e.message?e.message:e);



    const guide=msg.includes('現在使用者が登録されていません')?'この車両に使用者が登録されていません。管理担当者に確認してください。':



      msg.includes('反映待ち')?'この車両は反映中です。少し待ってからお試しください。':



      msg.includes('別の受付処理中')?'別の更新中です。少し待ってからお試しください。':

        msg.includes('すでに登録されています')||msg.includes('別の日付で登録済み')?msg:'現在登録できません。管理担当者に確認してください。';



    return {成功:false,メッセージ:guide};



  }



}



/** 完了行を消した後の通信再送による二重受付を24時間防ぐ。保存するのは受付IDのハッシュと時刻だけ。 */



function GF_実績完了キー_25(id){



  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(id));



  return 'GF_ACTUAL_DONE_'+bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');



}



/** 呼出元がScriptLockを保持している間だけ実行する。下から削除して行番号を保つ。 */



function GF_実績完了行を削除する_25(sheet){



  const props=PropertiesService.getScriptProperties(),now=Date.now();



  const all=props.getProperties();



  Object.keys(all).forEach(k=>{if(k.indexOf('GF_ACTUAL_DONE_')===0&&now-Number(all[k])>=86400000)props.deleteProperty(k);});



  const rows=sheet.getDataRange().getDisplayValues();



  for(let i=rows.length-1;i>=1;i--){



    if(String(rows[i][7])!=='完了')continue;



    // 重複防止情報を先に保存。失敗した場合は完了行を残す。



    props.setProperty(GF_実績完了キー_25(rows[i][0]),String(now));



    sheet.deleteRow(i+1);



    props.deleteProperty('GF_ACTUAL_NOTE_25_'+String(rows[i][0]));



    props.deleteProperty('GF_ACTUAL_LOAN_25_'+String(rows[i][0]));



  }



}



function GF_実績受付本体_25(data){



  data=data||{};



  const id=String(data.VehicleID||'').trim();



  const kind=String(data.種類||'').trim();



  const request=String(data.RequestID||'').trim();



  const date=String(data.実施日||'').trim();



  const fields=GF_貸出情報を整える_25(data);



  const note=GF_貸出備考文を作る_25(fields);







  if(!id)throw new Error('車両を選択してください。');



  if(!['貸出開始','返却完了','代車開始','代車返却'].includes(kind))throw new Error('実績種類が不正です。');



  if(!request||request.length>150)throw new Error('受付IDが不正です。画面を開き直してください。');



  const ss=対象スプレッドシートを開く_();



  GF_実績日付_(date,ss.getSpreadsheetTimeZone());



  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='GF_実績キューワーカー')){



    console.error('管理者対応：GF_実績キュー初期設定を一度実行してください。');



    throw new Error('実績ワーカーのトリガーがありません。管理者がGF_実績キュー初期設定を実行してください。');



  }



  const lock=LockService.getScriptLock();



  if(!lock.tryLock(3000))throw new Error('別の受付処理中です。もう一度お試しください。');



  try{



    const sheet=GF_実績キューシート_();



    const rows=sheet.getDataRange().getDisplayValues();



    const completed=Number(PropertiesService.getScriptProperties().getProperty(GF_実績完了キー_25(request))||0);



    if(completed&&Date.now()-completed<86400000)return {成功:true,JobID:request,メッセージ:'✓ 受付済みです。'};



    const existing=rows.find((r,i)=>i>0&&r[0]===request);



    if(existing){



      if(existing[7]==='エラー')throw new Error('この受付はエラーです。実績登録キューの詳細をご確認ください。');



      return {成功:true,JobID:request,メッセージ:'✓ 受付済みです。反映まで少しお待ちください。'};



    }



    const v=GF_実績車両情報_(ss,id).data;



    // 同じ種類・同じ実施日が台帳に既にある場合は二重登録しない。

    // 別日への訂正は取消機能の実装後に行うため、ここでは既存日を守る。

    const targetColumn={'貸出開始':'引渡し','返却完了':'返却/12点検','代車開始':'代車開始日','代車返却':'代車返却日'}[kind];

    const recorded=GF_実績台帳日付キー_25(v[targetColumn],ss.getSpreadsheetTimeZone());

    if(recorded){

      if(recorded===date)throw new Error('この実績日はすでに登録されています。二重登録はできません。');

      throw new Error('この種類の実績は別の日付で登録済みです。先に既存の登録を確認してください。');

    }



    if(note&&!Object.prototype.hasOwnProperty.call(v,'備考'))throw new Error('車両台帳に備考列がありません。');



    const driver=String(v.DriverID||'').trim(),name=String(v.現在使用者||'').trim();



    if((kind==='貸出開始'||kind==='代車開始')&&!name){



      throw new Error('この車両に現在使用者が登録されていません。「登録済み車両を編集」で設定してください。');



    }



    // 同一車両の未完了処理は、新しい受付IDでも重複させない。

    if(rows.some((r,i)=>i>0&&r[2]===id&&['待機','処理中','同期待ち','同期中'].includes(r[7]))){



      throw new Error('この車両は反映待ちです。反映後に次の実績を登録してください。');



    }



    if(data.自動予定){



      const j=data.自動予定;



      if(j.request!==request||j.id!==id||j.date!==date||!['納車','代車'].includes(j.kind)||kind!==(j.kind==='納車'?'貸出開始':'代車開始'))throw new Error('自動実績の受付情報を確認してください。');



      PropertiesService.getScriptProperties().setProperty('GF_PLAN_ACTUAL_META_25_'+request,JSON.stringify(j));



    }



    if(['貸出開始','代車開始'].includes(kind))PropertiesService.getScriptProperties().setProperty('GF_ACTUAL_LOAN_25_'+request,JSON.stringify(fields));



    if(note)PropertiesService.getScriptProperties().setProperty('GF_ACTUAL_NOTE_25_'+request,note);



    sheet.appendRow([request,new Date(),id,kind,"'"+date,driver,name,'待機','','']);



    SpreadsheetApp.flush();



    return {成功:true,JobID:request,メッセージ:'✓ '+date.replace(/-/g,'/')+'の「'+kind+'」を受付しました。バックグラウンドで反映します。'};



  }finally{lock.releaseLock();}



}



/** 台帳日付とキュー日付を同じ yyyy-MM-dd で比較する。 */

function GF_実績台帳日付キー_25(value,tz){

  if(value instanceof Date){

    return isNaN(value.getTime())?'':Utilities.formatDate(value,tz,'yyyy-MM-dd');

  }

  const raw=String(value||'').trim().replace(/^'/,'');

  const m=raw.match(/^(\d{4})[\\/-](\d{1,2})[\\/-](\d{1,2})$/);

  if(!m)return '';

  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);

  const test=new Date(Date.UTC(y,mo-1,d));

  if(test.getUTCFullYear()!==y||test.getUTCMonth()!==mo-1||test.getUTCDate()!==d)return '';

  return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');

}



function GF_実績キューワーカー(){



  GF_貸出先連携の準備を進める_25();



  const lock=LockService.getScriptLock();



  if(!lock.tryLock(100))return;



  const props=PropertiesService.getScriptProperties();



  const key='GF_ACTUAL_WORKER_RUNNING';



  try{



    const active=Number(props.getProperty(key)||0);



    if(active&&Date.now()-active<600000)return;



    props.setProperty(key,String(Date.now()));



  }finally{lock.releaseLock();}



  try{



    const sheet=GF_実績キューシート_();



    const rows=sheet.getDataRange().getValues();



    const started=Date.now();



    for(let i=1;i<rows.length&&Date.now()-started<240000;i++){



      const r=rows[i],state=String(r[7]);



      if(!['待機','同期待ち','処理中','同期中'].includes(state))continue;



      const row=i+1;

      // 旧版で「処理中」「同期中」に止まったものは、台帳の実績日を照合する。

      // 一致する場合だけ同期から再開。未反映なら自動再登録せず要確認とする。

      if(state==='処理中'||state==='同期中'){

        const checkSS=対象スプレッドシートを開く_();

        const check=GF_実績車両情報_(checkSS,String(r[2])).data;

        const checkColumn={'貸出開始':'引渡し','返却完了':'返却/12点検','代車開始':'代車開始日','代車返却':'代車返却日'}[String(r[3])];

        const actual=GF_実績台帳日付キー_25(check[checkColumn],checkSS.getSpreadsheetTimeZone());

        const requested=GF_実績台帳日付キー_25(r[4],checkSS.getSpreadsheetTimeZone());

        if(actual&&actual===requested){

          sheet.getRange(row,8,1,2).setValues([['同期待ち','中断後、台帳反映済みを確認して同期再開']]);

          r[7]='同期待ち';

        }else{

          sheet.getRange(row,8,1,3).setValues([['エラー','処理中断の可能性があります。台帳の実績日を確認し、管理者が対応してください。',new Date()]]);

          continue;

        }

      }



      const metaKey='GF_PLAN_ACTUAL_META_25_'+String(r[0]);



      const metaRaw=props.getProperty(metaKey),auto=metaRaw?JSON.parse(metaRaw):null;



      let applied=String(r[7])==='同期待ち';



      try{



        const ss=対象スプレッドシートを開く_();



        const v=GF_実績車両情報_(ss,String(r[2]));



        if(String(r[7])==='待機'){



          if(auto&&!GF_自動予定実績の入力が一致する_40(ss,auto)){



            auto.phase='取消';props.setProperty(metaKey,JSON.stringify(auto));



            sheet.getRange(row,8,1,3).setValues([['完了','入力変更により自動実績受付を取消',new Date()]]);continue;



          }



          const kind=String(r[3]);



          const date=GF_実績日付_(String(r[4]).replace(/^'/,''),ss.getSpreadsheetTimeZone());



          if(String(v.data.DriverID||'').trim()!==String(r[5]||'').trim()||String(v.data.現在使用者||'').trim()!==String(r[6]||'').trim()){



            throw new Error('受付後に現在使用者が変更されています。内容を確認して再登録してください。');



          }



          GF_実績履歴を準備_26(ss);

          GF_実績履歴を保存_26(ss,r,v,'処理中');

          sheet.getRange(row,8).setValue('処理中');SpreadsheetApp.flush();



          const update={};



          if(kind==='貸出開始'||kind==='代車開始'){



            update['区分/ステータス']=kind==='貸出開始'?'貸出中':'代車';



            update[kind==='貸出開始'?'引渡し':'代車開始日']=date;



          }else{



            update[kind==='返却完了'?'返却/12点検':'代車返却日']=date;



            update['区分/ステータス']='空車';



            update['現在使用者']='';update['DriverID']='';



          }



          const note=String(props.getProperty('GF_ACTUAL_NOTE_25_'+String(r[0]))||'').trim();



          if(note){



            if(列番号を取得する_(v.sheet,'備考')<1)throw new Error('車両台帳に備考列がありません。');



            const entry='【'+String(r[4]).replace(/^'/,'').replace(/-/g,'/')+' '+kind+'】'+String.fromCharCode(10)+note;



            const prior=String(v.data['備考']||'');



            // 再試行時に同じ備考を重ねない。既存の備考は保持する。



            update['備考']=prior.includes(entry)?prior:(prior?prior+String.fromCharCode(10)+String.fromCharCode(10):'')+entry;



          }



          if(列番号を取得する_(v.sheet,'更新日時')>0)update['更新日時']=new Date();



          行を書き込む_(v.sheet,v.row,update);SpreadsheetApp.flush();



          applied=true;



          sheet.getRange(row,8).setValue('同期待ち');SpreadsheetApp.flush();



        }



        sheet.getRange(row,8).setValue('同期中');SpreadsheetApp.flush();



        車両台帳の1台を同期する(v.row,true);



        if(auto)GF_自動予定実績を仕上げる_40(ss,auto);



        else GF_貸出情報を実績から反映する_25(ss,{id:String(r[2]),kind:String(r[3]),date:String(r[4]).replace(/^'/,''),fields:JSON.parse(props.getProperty('GF_ACTUAL_LOAN_25_'+String(r[0]))||'{}')});



        GF_実績履歴の変更後を確定_26(ss,String(r[0]),GF_実績車両情報_(ss,String(r[2])));

        GF_実績履歴を状態変更_26(ss,String(r[0]),'完了');

        sheet.getRange(row,8,1,3).setValues([['完了','',new Date()]]);



      }catch(e){



        if(applied&&!(e&&e.GF要確認)){



          sheet.getRange(row,8,1,3).setValues([['同期待ち',String(e&&e.message||e).slice(0,45000),'']]);



          console.warn('自動実績の仕上げを再試行 / '+r[0]+': '+e);continue;



        }



        if(auto){auto.phase='要確認';props.setProperty(metaKey,JSON.stringify(auto));}



        sheet.getRange(row,8,1,3).setValues([['エラー',String(e&&e.message?e.message:e).slice(0,45000),new Date()]]);



        console.error('実績キュー '+r[0]+': '+e);



      }



    }



    // 受付との競合を避け、同期成功行だけまとめて削除する。



    if(lock.tryLock(3000)){



      try{GF_実績完了行を削除する_25(sheet);}finally{lock.releaseLock();}



    }



  }finally{props.deleteProperty(key);}



}



/** 既存の呼出しとの互換用。同期処理を待たず受付へ回します。 */



function スマホから車両実績を登録する(VehicleID,DriverID,種類,実施日){



  const ss=対象スプレッドシートを開く_();



  return スマホ車両実績をキュー受付する({VehicleID:VehicleID,種類:種類,



    実施日:実施日||Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'),RequestID:Utilities.getUuid()});



}







/** 貸出先は現在使用者とは別情報。DriverIDや現在使用者を書き換えない。 */



function GF_貸出情報を整える_25(data){



  data=data||{};



  const result={貸出先:String(data.貸出先||'').trim(),貸出エリア:String(data.貸出エリア||'').trim(),備考:String(data.備考||'').trim()};



  if(result.貸出先.length>100||result.貸出エリア.length>100||result.備考.length>1000)throw new Error('貸出先・エリアは100文字、備考は1000文字以内で入力してください。');



  return result;



}



function GF_貸出備考文を作る_25(fields){



  return [(fields.貸出先?'貸出先：'+fields.貸出先:''),(fields.貸出エリア?'エリア：'+fields.貸出エリア:''),fields.備考||''].filter(Boolean).join(String.fromCharCode(10));



}



/** 既存シートに必要な列だけ追加。利用者管理は車番のすぐ後ろ、車両状況は現在使用者の後ろ。 */



function GF_貸出連携列を準備する_25(ss){



  const specs=[[シート名.利用者管理,['貸出先','貸出エリア','貸出備考'],'車番'],[シート名.車両状況,['貸出先'],'現在使用者']];



  specs.forEach(spec=>{



    const sheet=必須シートを取得する_(ss,spec[0]),heads=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());



    const missing=spec[1].filter(name=>!heads.includes(name));if(!missing.length)return;



    const after=heads.indexOf(spec[2])+1;



    if(after){sheet.insertColumnsAfter(after,missing.length);sheet.getRange(1,after+1,1,missing.length).setValues([missing]);}



    else{const last=sheet.getLastColumn();if(last+missing.length>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),last+missing.length-sheet.getMaxColumns());sheet.getRange(1,last+1,1,missing.length).setValues([missing]);}



  });



}



/** 初回。混雑時は依頼を残し、実績の1分ワーカーで列準備を再試行する。 */



function GF_貸出先連携を設定する_25(){



  const props=PropertiesService.getScriptProperties();props.setProperty('GF_LOAN_SETUP_25','1');



  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='GF_実績キューワーカー'))ScriptApp.newTrigger('GF_実績キューワーカー').timeBased().everyMinutes(1).create();



  GF_貸出先連携の準備を進める_25();



  console.log(props.getProperty('GF_LOAN_SETUP_25')?'貸出先連携の設定を受付。更新が空いたら自動で準備します。':'貸出先連携の設定が完了しました。');



}



function GF_貸出先連携の準備を進める_25(){



  const props=PropertiesService.getScriptProperties();if(!props.getProperty('GF_LOAN_SETUP_25'))return;



  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;



  try{GF_貸出連携列を準備する_25(対象スプレッドシートを開く_());props.deleteProperty('GF_LOAN_SETUP_25');}finally{lock.releaseLock();}



}



/** スマホの日付登録で入力した貸出先を、その予定に保存する。 */



function GF_予定の貸出情報を保存する_25(ss,planId,data){



  const fields=GF_貸出情報を整える_25(data),sheet=必須シートを取得する_(ss,シート名.予定管理),row=IDで行を探す_(sheet,'予定ID',planId);



  if(!row)throw new Error('予定が見つかりません。');



  const p=行データを取得する_(sheet,row);



  PropertiesService.getScriptProperties().setProperty('GF_PLAN_LOAN_25_'+planId,JSON.stringify({fields,id:String(p.VehicleID||'').trim(),driver:String(p.DriverID||'').trim(),name:String(p.現在使用者||'').trim()}));



  if(列番号を取得する_(sheet,'備考')>0)セルを書き込む_(sheet,row,'備考',GF_貸出備考文を作る_25(fields));



  return fields;



}



function GF_予定の貸出情報を取得する_25(ss,planId){



  const empty={貸出先:'',貸出エリア:'',備考:''},raw=PropertiesService.getScriptProperties().getProperty('GF_PLAN_LOAN_25_'+planId);if(!raw)return empty;



  let saved;try{saved=JSON.parse(raw);}catch(e){return empty;}



  const sheet=必須シートを取得する_(ss,シート名.予定管理),row=IDで行を探す_(sheet,'予定ID',planId);if(!row)return empty;



  const p=行データを取得する_(sheet,row);



  if(saved.id!==String(p.VehicleID||'').trim()||saved.driver!==String(p.DriverID||'').trim()||saved.name!==String(p.現在使用者||'').trim())return empty;



  return GF_貸出情報を整える_25(saved.fields);



}



/** 正規同期後に現在の貸出情報を反映。台帳の備考には日付付き記録を残す。 */



function GF_貸出情報を実績から反映する_25(ss,job){



  const lock=LockService.getScriptLock();if(!lock.tryLock(1500))throw new Error('貸出先の連携を再試行します。');



  try{



    GF_貸出連携列を準備する_25(ss);



    const ledger=必須シートを取得する_(ss,シート名.車両台帳),users=必須シートを取得する_(ss,シート名.利用者管理),status=必須シートを取得する_(ss,シート名.車両状況);



    const lr=IDで行を探す_(ledger,'VehicleID',job.id),ur=IDで行を探す_(users,'VehicleID',job.id),sr=IDで行を探す_(status,'VehicleID',job.id);



    if(!lr||!ur||!sr)throw new Error('関連シートの車両登録を確認してください。');



    const start=['貸出開始','代車開始'].includes(job.kind),fields=start?GF_貸出情報を整える_25(job.fields):{貸出先:'',貸出エリア:'',備考:''};



    const v=行データを取得する_(ledger,lr),u=行データを取得する_(users,ur),st=行データを取得する_(status,sr);



        // 代車の専用列を台帳正本へ書く。41番が関連シートの専用列も同期する。
    if(job.kind==='代車開始'||job.kind==='代車返却'){
      GF_代車情報を実績から更新_41(ss,job.id,job.kind,fields);
    }
    const updates={貸出先:fields.貸出先,貸出エリア:fields.貸出エリア,貸出備考:fields.備考},changed={};



    Object.keys(updates).forEach(k=>{if(String(u[k]||'')!==updates[k])changed[k]=updates[k];});if(Object.keys(changed).length)行を書き込む_(users,ur,changed);



    const display=[fields.貸出先,fields.貸出エリア].filter(Boolean).join('／');if(String(st.貸出先||'')!==display)セルを書き込む_(status,sr,'貸出先',display);



    const note=GF_貸出備考文を作る_25(fields);



    if(start&&note){



      const entry='【'+job.date.replace(/-/g,'/')+' '+job.kind+'】'+String.fromCharCode(10)+note,prior=String(v.備考||'');



      if(!prior.includes(entry))セルを書き込む_(ledger,lr,'備考',(prior?prior+String.fromCharCode(10)+String.fromCharCode(10):'')+entry);



    }



    SpreadsheetApp.flush();



  }finally{lock.releaseLock();}



}



/** スマホは選択したVehicleIDの現在情報を直接読む。 */



function GF_スマホ貸出先情報を取得する_25(VehicleID){



  const id=String(VehicleID||'').trim(),ss=対象スプレッドシートを開く_();



  const ledger=必須シートを取得する_(ss,シート名.車両台帳),lr=IDで行を探す_(ledger,'VehicleID',id);if(!lr)return {成功:false};



  const car=行データを取得する_(ledger,lr),users=必須シートを取得する_(ss,シート名.利用者管理),ur=IDで行を探す_(users,'VehicleID',id),u=ur?行データを取得する_(users,ur):{};



  const kind=String(car['区分/ステータス']||'').trim(),date=kind==='代車'?car['代車開始日']:car['引渡し'];



  return {成功:true,VehicleID:id,車番:String(car.車番||''),ステータス:kind,現在使用者:String(car.現在使用者||''),貸出先:String(u.貸出先||''),貸出エリア:String(u.貸出エリア||''),備考:String(u.貸出備考||''),開始日:GF_予定表示日付_40(date,ss.getSpreadsheetTimeZone()),返却予定日:GF_予定表示日付_40(kind==='代車'?car['代車返却予定日']:car['返却予定日'],ss.getSpreadsheetTimeZone())};



}