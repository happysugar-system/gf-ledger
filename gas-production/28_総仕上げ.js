/** GOLD FIRST / 28_車両書類統一と登録仕上げ.gs
 * 最初に GF_車両書類統一と登録仕上げを開始する を手動実行。
 * 旧フォルダの中身はIDを変えず車両書類へ移動。空になった旧フォルダだけゴミ箱へ。
 * 台帳のステータス・実績日・現在使用者はこの修復で変更しない。
 */
function GF_書類列定義を統一する_28(){
  if(typeof 利用者管理の列!=='undefined'){
    const i=利用者管理の列.indexOf('現在使用者 車両書類');if(i>=0)利用者管理の列[i]='車両書類を見る';
  }
  if(typeof 車両状況の列!=='undefined'){
    const i=車両状況の列.indexOf('📄車両書類フォルダ');if(i>=0)車両状況の列[i]='車両書類';
    const j=車両状況の列.indexOf('📄現在使用者車両書類');if(j>=0)車両状況の列.splice(j,1);
  }
}
function GF_書類列を探す_28(sheet,names){
  const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  for(const n of names){const i=h.indexOf(n);if(i>=0)return i+1;}return 0;
}
let GF_車両書類フォルダ一覧_28=null;
function GF_車両書類フォルダを探す_28(id){
  function load(){
    const map={},roots=Drive親フォルダを取得する_().getFoldersByName('01_車両');
    while(roots.hasNext()){
      const root=roots.next();if(root.isTrashed())continue;
      const it=root.getFolders();while(it.hasNext()){
        const f=it.next();if(f.isTrashed())continue;
        const key=f.getName().split('_')[0];(map[key]||(map[key]=[])).push(f);
      }
    }
    GF_車両書類フォルダ一覧_28=map;
  }
  if(!GF_車両書類フォルダ一覧_28)load();
  if(!GF_車両書類フォルダ一覧_28[id])load(); // この実行中に新規作成されたフォルダも反映。
  const found=GF_車両書類フォルダ一覧_28[id]||[];
  if(found.length>1)throw new Error('同じVehicleIDの車両フォルダが複数あります：'+id);
  return found[0]||null;
}
function GF_最新車両PDFを探す_28(vehicle){
  if(!vehicle)return '';
  const queue=[],seen={},files=[];
  ['車両書類','利用者別車両書類'].forEach(n=>{const it=vehicle.getFoldersByName(n);while(it.hasNext())queue.push(it.next());});
  let count=0;
  while(queue.length){
    const f=queue.shift();if(seen[f.getId()])continue;seen[f.getId()]=true;
    if(++count>200)throw new Error('書類フォルダが多いため最新PDFを確定できません。');
    if(f.isTrashed())continue;
    const it=f.getFiles();while(it.hasNext()){
      const file=it.next();if(!file.isTrashed()&&file.getMimeType()==='application/pdf'&&file.getSize()>0)files.push(file);
    }
    const sub=f.getFolders();while(sub.hasNext())queue.push(sub.next());
  }
  files.sort((a,b)=>b.getDateCreated().getTime()-a.getDateCreated().getTime()||a.getId().localeCompare(b.getId()));
  return files.length?files[0].getUrl():'';
}
/** 車両台帳には最新PDFと履歴フォルダの2リンクだけを追加する。 */
function GF_車両台帳書類リンクを反映する_28(ss,id,url){
  const ledger=ss.getSheetByName(シート名.車両台帳);
  if(!ledger)return;
  const row=IDで行を探す_(ledger,'VehicleID',id);
  if(!row)return;
  const folder=GF_車両書類フォルダを探す_28(id);
  let docs=null;
  if(folder){
    const it=folder.getFoldersByName('車両書類');
    while(it.hasNext()){
      const candidate=it.next();
      if(!candidate.isTrashed()){docs=candidate;break;}
    }
  }
  const columns=[
    ['📄 最新車両書類',url,'📄 最新の3点セットを見る','書類未提出'],
    ['📁 車両書類フォルダ',docs?docs.getUrl():'','📁 過去の書類を見る','フォルダ未作成']
  ];
  columns.forEach(([header,link,label,empty])=>{
    let col=GF_書類列を探す_28(ledger,[header]);
    if(!col){col=ledger.getLastColumn()+1;ledger.getRange(1,col).setValue(header);}
    const cell=ledger.getRange(row,col);
    if(link)cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(label).setLinkUrl(link).build());
    else cell.setValue(empty);
  });
}

function GF_車両書類リンクを反映する_28(ss,id,url){
  GF_書類列定義を統一する_28();
  [[シート名.利用者管理,['車両書類を見る','現在使用者 車両書類']],[シート名.車両状況,['車両書類','📄車両書類フォルダ']]].forEach(([name,headers])=>{
    const s=ss.getSheetByName(name);if(!s)return;
    const row=IDで行を探す_(s,'VehicleID',id),col=GF_書類列を探す_28(s,headers);if(!row||!col)return;
    const cell=s.getRange(row,col);
    if(url)cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText('📄 車両書類を見る').setLinkUrl(url).build());
    else cell.setValue('書類未提出');
  });
}
function GF_車両書類を同期する_28(ss,id){
  const url=GF_最新車両PDFを探す_28(GF_車両書類フォルダを探す_28(id));
  GF_車両書類リンクを反映する_28(ss,id,url);
  GF_車両台帳書類リンクを反映する_28(ss,id,url);
  return url;
}
function GF_書類統一結果を記録する_28(ss,id,plate,state,detail){
  let s=ss.getSheetByName('書類統一・修復結果');
  if(!s){s=ss.insertSheet('書類統一・修復結果');s.appendRow(['日時','VehicleID','車番','結果','詳細']);s.setFrozenRows(1);}
  s.appendRow([new Date(),id,plate,state,detail]);
}
function GF_書類統一の列を移行する_28(ss){
  [[シート名.利用者管理,'現在使用者 車両書類','車両書類を見る'],[シート名.車両状況,'📄車両書類フォルダ','車両書類']].forEach(([name,old,now])=>{
    const s=必須シートを取得する_(ss,name),a=GF_書類列を探す_28(s,[old]),b=GF_書類列を探す_28(s,[now]);
    if(a&&b)throw new Error(name+'に旧列と新列が両方あります。確認してください。');
    if(a)s.getRange(1,a).setValue(now);
    else if(!b)s.getRange(1,s.getLastColumn()+1).setValue(now);
  });
  const status=必須シートを取得する_(ss,シート名.車両状況),col=GF_書類列を探す_28(status,['📄現在使用者車両書類']);
  if(col)status.deleteColumn(col);
  GF_書類列定義を統一する_28();
}
function GF_利用者別フォルダを移行する_28(vehicle){
  const target=子フォルダを取得または作成する_(vehicle,'車両書類');
  const it=vehicle.getFoldersByName('利用者別車両書類'),old=[];
  while(it.hasNext()){const f=it.next();if(!f.isTrashed())old.push(f);}
  old.forEach(f=>{
    const files=f.getFiles(),children=f.getFolders(),items=[],sub=[];
    while(files.hasNext())items.push(files.next());while(children.hasNext())sub.push(children.next());
    // 中身があれば、車両書類内へ丸ごと保管。元ファイルのIDとリンクは維持。
    if(items.length||sub.length){
      const archive=子フォルダを取得または作成する_(target,'移行済み書類_'+f.getId());
      items.forEach(x=>x.moveTo(archive));sub.forEach(x=>x.moveTo(archive));
    }
    if(f.getFiles().hasNext()||f.getFolders().hasNext())throw new Error('移動未完了のため旧フォルダを残しました。');
    f.setTrashed(true);
  });
}
function GF_登録修復段階を決める_28(phase,pdf,photoCount,validThree){
  if(['割当待ち','同期待ち'].includes(phase))return '同期待ち';
  if(!['書類待ち','画像保存',''].includes(phase))return '';
  if(pdf)return '同期待ち';
  if(validThree)return '書類待ち';
  if(photoCount===0)return '後日';
  return '';
}
function GF_登録エラーを整理する_28(ss){
  const q=GF_登録キューシートを取得する_(),rows=q.getLastRow()>1?q.getRange(2,1,q.getLastRow()-1,14).getValues():[];
  const ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const started=Date.now();
  for(let i=Number(PropertiesService.getScriptProperties().getProperty('GF_DOC_REPAIR_CURSOR')||0);i<rows.length;i++){
    const r=rows[i];PropertiesService.getScriptProperties().setProperty('GF_DOC_REPAIR_CURSOR',String(i));if(!r[0]||r[2]!=='車両'||!['エラー','要確認','画像待ち','画像保存エラー'].includes(String(r[8])))continue;
    if(Date.now()-started>90000)return false;
    if(String(r[8])==='画像待ち'&&r[1] instanceof Date&&Date.now()-r[1].getTime()<900000){GF_書類統一結果を記録する_28(ss,r[3],r[5],'要確認','直近の写真受付は変更しません。送信の完了後に確認してください。');continue;}
    try{
      const id=String(r[3]),row=IDで行を探す_(ledger,'VehicleID',id);if(!row)throw new Error('台帳にVehicleIDがありません。');
      const pdf=GF_最新車両PDFを探す_28(GF_車両書類フォルダを探す_28(id));
      let count=0,valid=false;
      if(r[7]&&!pdf){
        const folder=DriveApp.getFolderById(String(r[7])),it=folder.getFiles(),seen={},counts=[0,0,0];
        while(it.hasNext()){
          const f=it.next();if(!/^image\//.test(f.getMimeType()))continue;count++;
          const m=f.getName().match(/^車両書類_(01|02|03)\./);
          if(!folder.isTrashed()&&!f.isTrashed()&&f.getSize()>0&&m)counts[Number(m[1])-1]++;
          seen[f.getId()]=true;
        }
        // ゴミ箱内の写真を無視して「0枚」と判定しない。
        const trash=DriveApp.searchFiles("'"+folder.getId()+"' in parents and trashed = true");
        while(trash.hasNext()){const f=trash.next();if(!seen[f.getId()]&&/^image\//.test(f.getMimeType()))count++;}
        valid=count===3&&counts.every(n=>n===1);
      }
      const next=GF_登録修復段階を決める_28(String(r[12]||''),pdf,count,valid);
      if(!next)throw new Error('写真の一部または処理段階に確認が必要です。元の写真・受付を保持しています。');
      let later=!pdf&&(next==='後日'||next==='同期待ち');
      if(later){
        let s=ss.getSheetByName('後日書類管理');if(!s){s=ss.insertSheet('後日書類管理');s.appendRow(['元JobID','VehicleID','車番','後日扱い日時','書類状態','再送JobID','再送受付日時','備考']);}
        const ids=s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,1).getValues():[];
        if(!ids.some(x=>String(x[0])===String(r[0])))s.appendRow([r[0],id,r[5],new Date(),'未提出','','','書類は後日3枚再送。台帳・フォルダ同期を先に完了。']);
      }
      GF_登録修復前の行を控える_97(ss,r,'書類統一と登録仕上げ：古いDriverIDの再割当を解除');
      const phase=next==='後日'?'同期待ち':next;
      q.getRange(i+2,5,1,10).setValues([[row,r[5],'',phase==='書類待ち'?r[7]:'',phase,later?'書類未提出：後日書類管理に記録済み':'',new Date(),'',phase,'']]);
      GF_書類統一結果を記録する_28(ss,id,r[5],'再処理待ち',later?'書類後日。台帳の最新情報で同期。':phase+'から再開。古いDriverIDは再割当しません。');
    }catch(e){GF_書類統一結果を記録する_28(ss,r[3],r[5],'要確認',String(e.message||e));}
    PropertiesService.getScriptProperties().setProperty('GF_DOC_REPAIR_CURSOR',String(i+1));
  }
  return true;
}
/** 台帳で現在使用者があるのにDriverIDだけ空欄の車両は、正規同期へ送る。 */
function GF_空欄DriverIDの同期を受付する_28(ss,id,row,data){
  const name=String(data['現在使用者']||'').trim();
  if(!name||String(data['DriverID']||'').trim())return;
  const master=必須シートを取得する_(ss,シート名.ドライバーマスター),values=master.getDataRange().getDisplayValues(),h=values[0].map(x=>String(x).trim()),n=h.indexOf('氏名');
  const matches=values.slice(1).filter(r=>GF_使用者名比較キーを作る_20(r[n])===GF_使用者名比較キーを作る_20(name));
  if(matches.length>1){GF_書類統一結果を記録する_28(ss,id,data['車番'],'DriverID要確認','同名のドライバーが複数。使用するDriverIDを台帳で選んでから同期してください。');return;}
  GF_短いロックで実行する_99(()=>{
    const q=GF_登録キューシートを取得する_(),r=q.getLastRow()>1?q.getRange(2,1,q.getLastRow()-1,14).getValues():[];
    if(r.some(x=>String(x[3])===id&&String(x[8])!=='完了'))return;
    const job='VQ-'+Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyyMMddHHmmss')+'-'+Utilities.getUuid().slice(0,8);
    q.appendRow([job,new Date(),'車両',id,row,data['車番'],'','','同期待ち','DriverID空欄を台帳の現在使用者から正規同期','','','同期待ち','']);
    GF_書類統一結果を記録する_28(ss,id,data['車番'],'DriverID同期待ち','ステータス・実績日は保持。正規同期でDriverIDを補完。');
  });
}
function GF_車両書類統一と登録仕上げを開始する(){
  if(typeof GF_登録修復前の行を控える_97!=='function')throw new Error('先に97_登録修復.gsを追加してください。');
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('GF_DOC_MIGRATION_ACTIVE')==='1')throw new Error('書類統一は実行中です。書類統一・修復結果を確認してください。');
  props.setProperty('GF_DOC_PREVIOUS_PAUSE',props.getProperty('GF_QUEUE_INTAKE_ONLY')||'');
  props.setProperty('GF_QUEUE_INTAKE_ONLY','1');
  props.setProperty('GF_DOC_MIGRATION_ACTIVE','1');props.setProperty('GF_DOC_MIGRATION_CURSOR','0');props.deleteProperty('GF_DOC_REPAIR_CURSOR');props.deleteProperty('GF_DOC_MIGRATION_BACKUP');
  const fn='GF_車両書類統一ワーカー_28';
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===fn))ScriptApp.newTrigger(fn).timeBased().everyMinutes(1).create();
  GF_車両書類統一ワーカー_28();
}
function GF_車両書類統一ワーカー_28(){
  const props=PropertiesService.getScriptProperties();if(props.getProperty('GF_DOC_MIGRATION_ACTIVE')!=='1')return;
  const lock=LockService.getScriptLock();if(!lock.tryLock(100))return;
  try{
    const running=props.getProperty('GF_DOC_MIGRATION_RUNNING');if(Number(running||0)>Date.now()-600000)return;
    const actual=Number(props.getProperty('GF_ACTUAL_WORKER_RUNNING')||0);if(actual&&Date.now()-actual<600000)return;
    const raw=props.getProperty('GF_QUEUE_WORKER_RUNNING');
    if(raw){if(raw==='1')return;try{if(JSON.parse(raw).until>Date.now())return;}catch(e){return;}}
    props.setProperty('GF_DOC_MIGRATION_RUNNING',String(Date.now()));
  }finally{lock.releaseLock();}
  try{
    const ss=対象スプレッドシートを開く_();
    if(!props.getProperty('GF_DOC_MIGRATION_BACKUP')){
      const suffix=Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyyMMdd_HHmmss');
      [シート名.利用者管理,シート名.車両状況,'_登録キュー'].forEach(n=>{const s=ss.getSheetByName(n);if(s)s.copyTo(ss).setName('_書類統一控え_'+n+'_'+suffix);});
      props.setProperty('GF_DOC_MIGRATION_BACKUP',suffix);
    }
    const schemaLock=LockService.getScriptLock();if(!schemaLock.tryLock(3000))return;
    try{
      const actual=Number(props.getProperty('GF_ACTUAL_WORKER_RUNNING')||0);if(actual&&Date.now()-actual<600000)return;
      GF_書類統一の列を移行する_28(ss);
    }finally{schemaLock.releaseLock();}
    const ledger=必須シートを取得する_(ss,シート名.車両台帳),values=ledger.getDataRange().getDisplayValues(),heads=values[0].map(x=>String(x).trim());
    const idCol=heads.indexOf('VehicleID'),plateCol=heads.indexOf('車番');if(idCol<0||plateCol<0)throw new Error('車両台帳のID・車番列がありません。');
    const cars=values.slice(1).filter(r=>r[idCol]),unique={};cars.forEach(r=>{const id=String(r[idCol]).trim();if(unique[id])throw new Error('車両台帳でVehicleIDが重複：'+id);unique[id]=true;});let cursor=Number(props.getProperty('GF_DOC_MIGRATION_CURSOR')||0),start=Date.now();
    while(cursor<cars.length&&Date.now()-start<90000){
      const r=cars[cursor],id=String(r[idCol]);
      try{
        const row=IDで行を探す_(ledger,'VehicleID',id),data=行データを取得する_(ledger,row);
        車両フォルダを準備して反映する_(ledger,row,data);
        const vehicle=GF_車両書類フォルダを探す_28(id);if(!vehicle)throw new Error('車両フォルダを確認できません。');
        GF_利用者別フォルダを移行する_28(vehicle);
        GF_空欄DriverIDの同期を受付する_28(ss,id,row,data);
        const url=GF_最新車両PDFを探す_28(vehicle);GF_車両書類リンクを反映する_28(ss,id,url);GF_車両台帳書類リンクを反映する_28(ss,id,url);
        GF_書類統一結果を記録する_28(ss,id,r[plateCol],url?'リンク完了':'書類未提出',url?'利用者管理・車両状況を同じPDFへ統一':'車両書類フォルダは準備済み。写真・書類から後日送信。');
      }catch(e){GF_書類統一結果を記録する_28(ss,id,r[plateCol],'要確認',String(e.message||e));}
      cursor++;props.setProperty('GF_DOC_MIGRATION_CURSOR',String(cursor));
    }
    if(cursor<cars.length)return;
    if(!GF_登録エラーを整理する_28(ss))return;
    props.deleteProperty('GF_DOC_MIGRATION_ACTIVE');
    
    // 今回の仕上げ後は登録キューを再開。元が停止でも、この開始操作は修復の再開を含む。
    props.deleteProperty('GF_QUEUE_INTAKE_ONLY');props.setProperty('GF_QUEUE_PENDING','1');
    GF_登録キューワーカーを予約する_();
    ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='GF_車両書類統一ワーカー_28').forEach(t=>ScriptApp.deleteTrigger(t));
    GF_書類統一結果を記録する_28(ss,'','','統一処理終了','修復対象は登録キューで順次同期。要確認と書類未提出は残します。');
  }catch(e){console.error('書類統一の停止：'+String(e.message||e));throw e;}
  finally{props.deleteProperty('GF_DOC_MIGRATION_RUNNING');}
}