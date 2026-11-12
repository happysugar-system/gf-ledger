/** 29_車両台帳仕上げ.gs 新規追加。既存ファイルは変更不要。
 * GF_車両台帳の仕上げを進める を実行。
 * ステータス・実績日・現在使用者は変更しません。元写真は削除しません。
 */
function GF_仕上げ確認を記録する_29(ss,id,plate,state,detail){
  let s=ss.getSheetByName('車両台帳仕上げ確認');
  if(!s){s=ss.insertSheet('車両台帳仕上げ確認');s.appendRow(['確認日時','VehicleID','車番','結果','詳細']);s.setFrozenRows(1);}
  s.appendRow([new Date(),id,plate,state,detail]);
}
function GF_47_90の元写真を復旧する_29(ss){
  const id='V000026',ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const row=IDで行を探す_(ledger,'VehicleID',id);
  if(!row)throw new Error('V000026が台帳にありません。');
  const data=行データを取得する_(ledger,row);
  if(String(data['車番']).trim()!=='47-90')throw new Error('V000026の車番が47-90ではないため停止しました。');
  let car=GF_車両書類フォルダを探す_28(id);
  const oldPDF=GF_最新車両PDFを探す_28(car);
  if(oldPDF){GF_車両書類リンクを反映する_28(ss,id,oldPDF);return '既存PDFのリンクを反映';}
  // まず47-90自身の受付フォルダ。別の受付の写真は混ぜません。
  const candidates=['1oTEVGMUxFdbadtJbiDXeUvV3vZiEKxVe','1JMWuw-TGB_pNzK7Zo7NGlBywCiU0wQPy'];
  let source=null,photos=[];
  for(const folderID of candidates){
    try{
      const f=DriveApp.getFolderById(folderID);if(f.isTrashed())continue;
      const files=f.getFiles(),images=[];
      while(files.hasNext()){
        const x=files.next();if(!x.isTrashed()&&/^image\//.test(x.getMimeType())&&x.getSize()>0)images.push(x);
      }
      // 親フォルダ配下の他車両は探索しません。直下に3枚ある場合だけ採用。
      if(images.length===3){source=f;photos=images;break;}
    }catch(e){console.warn('47-90の候補フォルダ確認：'+String(e.message||e));}
  }
  if(!source)throw new Error('指定フォルダ直下で写真3枚を確認できません。47-90の写真3枚が直接入った子フォルダのURLが必要です。');
  photos.sort((a,b)=>a.getName().localeCompare(b.getName())||a.getId().localeCompare(b.getId()));
  // 画像本文を全て読めた後に正式保存を開始。
  const blobs=photos.map(f=>f.getBlob());
  if(blobs.some(b=>!b.getBytes().length))throw new Error('空の画像があるため保存を停止しました。');
  車両フォルダを準備して反映する_(ledger,row,data);
  GF_車両書類フォルダ一覧_28=null;car=GF_車両書類フォルダを探す_28(id);
  if(!car)throw new Error('正式な車両フォルダを確認できません。');
  const docs=子フォルダを取得または作成する_(car,'車両書類');
  const dest=子フォルダを取得または作成する_(docs,'元写真復旧_'+source.getId());
  const existing=dest.getFilesByName('車両書類_47-90_復旧.pdf'),pdfs=[];
  while(existing.hasNext()){const f=existing.next();if(!f.isTrashed()&&f.getSize()>0)pdfs.push(f);}
  if(pdfs.length>1)throw new Error('復旧PDFが複数あるため確認が必要です。');
  let pdf=pdfs[0];
  if(!pdf){
    const blob=車両書類PDFを作る_('車両書類_47-90_復旧',blobs);
    if(!blob.getBytes().length)throw new Error('PDFを作成できませんでした。');
    pdf=dest.createFile(blob.setName('車両書類_47-90_復旧.pdf'));
  }
  // コピー元の写真・フォルダには削除や移動を行いません。
  GF_車両書類リンクを反映する_28(ss,id,pdf.getUrl());
  SpreadsheetApp.flush();
  return '元写真3枚からPDF作成・リンク反映。元写真は保持。';
}
function GF_車両台帳の仕上げを進める(){
  const ss=対象スプレッドシートを開く_(),p=PropertiesService.getScriptProperties();
  if(p.getProperty('GF_DOC_MIGRATION_ACTIVE')==='1'){
    GF_仕上げ確認を記録する_29(ss,'','','統一処理中','28の統一処理終了後に、この関数を再実行してください。');return;
  }
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(3000))throw new Error('更新処理中です。少し待って再実行してください。');
  const previous=p.getProperty('GF_QUEUE_INTAKE_ONLY');let paused=false;
  try{
    if(p.getProperty('GF_DOC_MIGRATION_ACTIVE')==='1'||p.getProperty('GF_DOC_MIGRATION_RUNNING')||p.getProperty('GF_QUEUE_WORKER_RUNNING')||p.getProperty('GF_ACTUAL_WORKER_RUNNING')){
      GF_仕上げ確認を記録する_29(ss,'','','処理中','他のワーカーが実行中です。終了後に再実行してください。');return;
    }
    p.setProperty('GF_QUEUE_INTAKE_ONLY','1');paused=true;
    try{GF_仕上げ確認を記録する_29(ss,'V000026','47-90','書類修復',GF_47_90の元写真を復旧する_29(ss));}
    catch(e){GF_仕上げ確認を記録する_29(ss,'V000026','47-90','要確認',String(e.message||e));}
  }finally{
    if(paused){if(previous===null)p.deleteProperty('GF_QUEUE_INTAKE_ONLY');else p.setProperty('GF_QUEUE_INTAKE_ONLY',previous);}
    lock.releaseLock();
  }
  // 正規同期の受付関数は自身で短いロックを取ります。
  const ledger=必須シートを取得する_(ss,シート名.車両台帳),values=ledger.getDataRange().getDisplayValues();
  const heads=values[0].map(x=>String(x).trim()),col=n=>heads.indexOf(n);
  if(['VehicleID','車番','現在使用者','DriverID'].some(n=>col(n)<0))throw new Error('台帳の必須列がありません。');
  const ids={};values.slice(1).forEach(r=>{const id=String(r[col('VehicleID')]).trim();if(id)ids[id]=(ids[id]||0)+1;});
  let received=0;
  for(let i=1;i<values.length;i++){
    const r=values[i],id=String(r[col('VehicleID')]).trim();if(!id)continue;
    const plate=r[col('車番')],name=String(r[col('現在使用者')]).trim(),driver=String(r[col('DriverID')]).trim();
    if(ids[id]>1){GF_仕上げ確認を記録する_29(ss,id,plate,'要確認','VehicleIDが台帳内で重複しています。');continue;}
    if(name&&!driver){
      if(received>=5){GF_仕上げ確認を記録する_29(ss,id,plate,'DriverID空欄','今回の受付上限5台。同期後に再実行してください。');continue;}
      const data={};heads.forEach((h,j)=>{if(h)data[h]=r[j];});
      try{GF_空欄DriverIDの同期を受付する_28(ss,id,i+1,data);received++;
        GF_仕上げ確認を記録する_29(ss,id,plate,'DriverID確認待ち','登録キューまたは書類統一・修復結果を確認。受付済みの車両は二重受付しません。');}
      catch(e){GF_仕上げ確認を記録する_29(ss,id,plate,'要確認',String(e.message||e));}
    }
    if(!plate)GF_仕上げ確認を記録する_29(ss,id,plate,'要確認','車番が空欄です。');
  }
  GF_仕上げ確認を記録する_29(ss,'','','確認終了','空欄DriverIDを最大5台ずつ確認。これは全車両の完成を保証する表示ではありません。');
}

/** 92-86 / V000129 専用。保存済み書類を使って仕上げを再受付する。
 * 車両・ドライバーを新規登録し直さない。写真は移動・削除しない。
 * 実行：GF_92_86の登録続きを受付する
 */
function GF_92_86の登録続きを受付する() {
  const ss=対象スプレッドシートを開く_(),id='V000129';
  const ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const row=IDで行を探す_(ledger,'VehicleID',id);
  if(!row)throw new Error('V000129が台帳にありません。処理は変更していません。');
  const data=行データを取得する_(ledger,row);
  if(String(data['車番']||'').trim()!=='92-86')throw new Error('V000129の車番が92-86と一致しません。');
  const vehicle=DriveApp.getFolderById('1jr02Ny8cjVxuCo1KlpGCj5JiQ4qcO_lr');
  if(vehicle.isTrashed()||!vehicle.getName().startsWith(id+'_'))throw new Error('保存済みフォルダのVehicleIDを確認してください。');
  if(typeof GF_最新車両PDFを探す_28!=='function')throw new Error('28の車両書類統一コードが必要です。');
  let pdf=GF_最新車両PDFを探す_28(vehicle);
  if(!pdf) {
    // 保存済みの車両書類3枚を、同じフォルダ内の01・02・03で確認。
    const candidates=[],folders=[vehicle],seen=new Set();
    while(folders.length) {
      const folder=folders.shift();if(folder.isTrashed()||seen.has(folder.getId()))continue;
      seen.add(folder.getId());if(seen.size>100)throw new Error('フォルダが多いため写真の保存先を確定できません。');
      const images=[[],[],[]],files=folder.getFiles();
      while(files.hasNext()) {
        const file=files.next(),match=file.getName().match(/^車両書類_0([123])\./);
        if(match&&!file.isTrashed()&&file.getMimeType().startsWith('image/')&&file.getSize()>0)images[Number(match[1])-1].push(file);
      }
      if(images.every(a=>a.length===1))candidates.push(images.map(a=>a[0]));
      // 車両状態や整備書類を混ぜない。書類配下のみ探索。
      const children=folder.getFolders();while(children.hasNext()) {
        const child=children.next();
        if(folder.getId()!==vehicle.getId()||['車両書類','利用者別車両書類','基本書類','元画像'].includes(child.getName()))folders.push(child);
      }
    }
    if(candidates.length!==1)throw new Error('車両書類01・02・03の保存先を1組に確定できません（'+candidates.length+'組）。写真は変更していません。保存先URLを確認してください。');
    const blobs=candidates[0].map(f=>f.getBlob());
    const doc=子フォルダを取得または作成する_(vehicle,'車両書類');
    const created=doc.createFolder('登録復旧_'+Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyyMMdd_HHmmss')+'_'+Utilities.getUuid().slice(0,8));
    const file=created.createFile(車両書類PDFを作る_('車両書類一式_92-86',blobs).setName('車両書類一式.pdf'));
    if(file.getSize()<=0)throw new Error('PDFを保存できませんでした。元写真は保持しています。');
    pdf=file.getUrl();
  }
  console.log('保存済み書類を確認 / '+id+' / PDF='+pdf);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  let job;
  try {
    // 行番号が変わっていても受付時の最新VehicleIDから取り直す。
    const current=IDで行を探す_(ledger,'VehicleID',id);
    if(!current)throw new Error('受付直前に対象車両が見つからなくなりました。');
    const q=GF_登録キューシートを取得する_();
    const rows=q.getLastRow()>1?q.getRange(2,1,q.getLastRow()-1,14).getValues():[];
    const existing=rows.map((r,i)=>({r,row:i+2})).filter(x=>String(x.r[3])===id&&String(x.r[8])!=='完了');
    if(existing.length>1)throw new Error('未完了受付が複数あります。重複受付は追加していません。');
    if(existing.length) {
      const x=existing[0];job=String(x.r[0]);
      if(['エラー','要確認'].includes(String(x.r[8]))) {
        if(x.r[13])throw new Error('処理トークンが残っています。実行中か確認が必要です。');
        if(typeof GF_登録修復前の行を控える_97!=='function')throw new Error('97_登録修復を確認してください。');
        GF_登録修復前の行を控える_97(ss,x.r,'V000129の保存済みPDF確認後、同期から再開');
        // 既存受付と元写真フォルダIDは保持。過去の使用者へ再割当しない。
        q.getRange(x.row,5).setValue(current);q.getRange(x.row,7).setValue('');
        q.getRange(x.row,9,1,6).setValues([['同期待ち','','','','同期待ち','']]);
      }
    } else {
      job='VQ-'+Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyyMMddHHmmss')+'-'+Utilities.getUuid().slice(0,8);
      q.appendRow([job,new Date(),'車両',id,current,'92-86','','','同期待ち','保存済み書類から登録仕上げを再開','','','同期待ち','']);
    }
    PropertiesService.getScriptProperties().setProperty('GF_QUEUE_PENDING','1');
    SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
  GF_登録キューワーカーを予約する_();
  console.log('92-86の続きを受付しました / JobID='+job+' / 台帳のステータス・実績日は保持。登録キューで確認してください。');
  return {成功:true,JobID:job,PDFURL:pdf};
}
