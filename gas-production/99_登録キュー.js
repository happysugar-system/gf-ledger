/******************************************************
 * GOLD FIRST 新システム
 * 99_登録キュー.gs
 *
 * STEP1.1：車両登録を「先に受付完了」にする
 *
 * スマホ側
 * ① 車両台帳へ基本登録
 * ② 軽い受付を作成
 * ③ 画像3枚を一時Driveへ保存 → 保存成功後に受付完了を表示
 *
 * GAS側
 * ④ 画像保存完了後だけ「待機」に変更
 * ⑤ 正式書類保存・PDF・同期・ドライバー紐付け
 ******************************************************/
const GF_登録キュー設定_99 = {
  シート名: '_登録キュー',
  一時フォルダ名: '_GF_登録キュー一時保存',
  ワーカー関数名: 'GF_登録キューワーカー',
  最大実行ミリ秒: 240000,
  直近24時間処理上限ミリ秒: 200 * 200 * 1000,
  一段階予約ミリ秒: 6 * 60 * 1000
};
/**
 * STEP A：まず軽い受付だけ作る。
 * 画像本体はまだ送らないので速い。
 */
function スマホ車両登録を先に受付する(data) {
  data=data||{};
  const id=String(data.VehicleID||'').trim(),row=Number(data.行番号||0);
  if(!id||row<2)throw new Error('車両の登録情報を確認してください。');
  return GF_受付行を追加する_99('車両',id,row,String(data.車番||''),String(data.DriverID||''),data.書類あり===true);
}
function スマホ車両登録キューへ書類を保存する(JobID,画像一覧) {
  return GF_画像を受付へ保存する_99(JobID,画像一覧,'車両',3,'車両書類');
}
function スマホ免許証登録を先に受付する(data) {
  data=data||{};
  const id=String(data.DriverID||'').trim(),name=String(data.氏名||'').trim();
  if(!id||!name)throw new Error('ドライバーの登録情報を確認してください。');
  return GF_受付行を追加する_99('ドライバー','',0,name,id,true);
}
function スマホ免許証登録キューへ書類を保存する(JobID,画像一覧) {
  return GF_画像を受付へ保存する_99(JobID,画像一覧,'ドライバー',2,'免許証');
}
/** 連続モードでは段階ごとの1分待ちを省く。時間枠・ロック・処理トークンは維持。 */
function GF_登録キューワーカー(){
  const start=Date.now(),props=PropertiesService.getScriptProperties();
  if(props.getProperty('GF_QUEUE_CONTINUOUS')!=='1')return GF_登録キュー一段階ワーカー_99();
  let count=0;
  // Googleの1実行上限に備え、新しい段階の開始は3分まで。残りは次の1分トリガーで続行。
  while(Date.now()-start<180000&&count<20){
    if(props.getProperty('GF_QUEUE_INTAKE_ONLY')==='1')break;
    if(props.getProperty('GF_QUEUE_CONTINUOUS')!=='1')break;
    if(!GF_登録キュー一段階ワーカー_99())break;
    count++;
  }
  if(count)console.log('登録キュー連続処理 / 段階数='+count+' / 秒='+((Date.now()-start)/1000).toFixed(2));
}
/**
 * 安全な連続処理設定。処理時間の自主制限を維持する。
 * 設定だけを変更し、この関数から既存案件を処理しない。
 */
function GF_登録キューを安全な連続処理に設定する_99(){
  GF_短いロックで実行する_99(()=>{
    const props=PropertiesService.getScriptProperties();
    props.setProperty('GF_QUEUE_CONTINUOUS','1');
    GF_登録キューワーカーを予約する_();
  });
  console.log('安全な連続処理を設定しました。処理時間の自主制限・受付一時停止設定は維持しています。');
  return {成功:true,メッセージ:'安全な連続処理を設定しました。既存案件の手動実行はしていません。'};
}
/** 旧名称からの実行も、安全な設定のみ行う。 */
function GF_登録キューを連続処理で再開する(){
  return GF_登録キューを安全な連続処理に設定する_99();
}
function GF_登録キュー一段階ワーカー_99() {
  const GF_実行開始 = Date.now();
  const props=PropertiesService.getScriptProperties(),key='GF_QUEUE_WORKER_RUNNING';
  if(props.getProperty('GF_QUEUE_PENDING')==='0')return;
  if(props.getProperty('GF_QUEUE_INTAKE_ONLY')==='1')return;
  if(Number(props.getProperty('GF_QUEUE_BUDGET_RESUME_AT')||0)>Date.now())return;
  const token=Utilities.getUuid();
  let job=null;
  GF_短いロックで実行する_99(()=>{
    const raw=props.getProperty(key);
    if(raw==='1') {
      const seen=Number(props.getProperty(key+'_LEGACY_SEEN')||0);
      if(!seen){props.setProperty(key+'_LEGACY_SEEN',String(Date.now()));return;}
      if(Date.now()-seen<600000)return;
    }else if(raw){
      try{if(JSON.parse(raw).until>Date.now())return;}catch(e){console.warn('旧ワーカーフラグを整理します。');}
    }
    if(!GF_登録キュー時間枠を確認する_99(props, Date.now()).許可)return;
    const sheet=GF_登録キューシートを取得する_();
    GF_期限切れ処理を確認待ちにする_99(sheet);
    job=GF_登録キュー次ジョブを取得する_(sheet);
    if(!job){props.deleteProperty(key);
      const n=sheet.getLastRow()-1,active=n>0?sheet.getRange(2,9,n,1).getValues().some(r=>['処理中','画像保存中'].includes(String(r[0]))):false;
      props.setProperty('GF_QUEUE_PENDING',active?'1':'0');return;}
    // 先に最大6分を予約。強制終了しても予約を残し、無制限に再実行しない。
    GF_登録キュー時間を予約する_99(props, token, Date.now());
    const phase=job.段階||GF_開始段階を決める_99(job);
    job.段階=phase;
    sheet.getRange(job.行,9,1,6).setValues([['処理中','',new Date(),'',phase,token]]);
    SpreadsheetApp.flush();
    props.setProperty(key,JSON.stringify({token:token,until:Date.now()+600000}));
    props.deleteProperty(key+'_LEGACY_SEEN');
  });
  if(!job)return;
  const started=Date.now();
  console.log('登録キュー開始 / JobID='+job.JobID+' / 段階='+job.段階);
  try {
    const next=GF_受付の一段階を処理する_99(job);
    GF_短いロックで実行する_99(()=>{
      const sheet=GF_登録キューシートを取得する_(),row=GF_登録キューJob行を探す_(sheet,job.JobID);
      if(!row||String(sheet.getRange(row,14).getValue())!==token)throw new Error('受付の処理状態を確認してください。');
      sheet.getRange(row,9,1,6).setValues([[next,'',new Date(),next==='完了'?new Date():'',next==='完了'?'完了':next,'']]);
      SpreadsheetApp.flush();
    });
    if(next==='完了')GF_登録キュー一時フォルダを削除する_(job.一時フォルダID);
    console.log('登録キュー段階完了 / JobID='+job.JobID+' / 次='+next+' / 秒='+((Date.now()-started)/1000).toFixed(2));
  }catch(e){
    console.error('登録キューエラー / JobID='+job.JobID+' / 段階='+job.段階+' / '+String(e&&e.stack||e));
    GF_短いロックで実行する_99(()=>{
      const sheet=GF_登録キューシートを取得する_(),row=GF_登録キューJob行を探す_(sheet,job.JobID);
      if(row&&String(sheet.getRange(row,14).getValue())===token){
        sheet.getRange(row,9,1,6).setValues([['エラー',String(e&&e.stack||e).slice(0,45000),new Date(),new Date(),job.段階,'']]);
        SpreadsheetApp.flush();
      }
    });
  }finally{
    GF_短いロックで実行する_99(()=>{
      GF_登録キュー時間を確定する_99(props, token, GF_実行開始, Date.now());
      const raw=props.getProperty(key);
      if(raw){try{if(JSON.parse(raw).token===token)props.deleteProperty(key);}catch(e){}}
    });
  }
  return true; // 1段階を処理した。連続モードなら同じ実行内で次へ進む。
}
function GF_車両登録キューを処理する_(job) {
  const VehicleID = String(job.VehicleID || '').trim();
  const 行番号 = Number(job.行番号 || 0);
  const DriverID = String(job.DriverID || '').trim();
  if (!VehicleID || 行番号 < 2) {
    throw new Error('車両キュー情報が不足しています。');
  }
  if (job.一時フォルダID) {
    const 画像一覧 = GF_登録キュー一時画像を読む_(job.一時フォルダID);
    if (画像一覧.length !== 3) {
      throw new Error(
        '一時保存した車両書類が3枚見つかりません。件数=' + 画像一覧.length
      );
    }
    スマホから新規車両基本書類を保存する(
      VehicleID,
      画像一覧
    );
  }
  スマホ新規車両登録後処理を実行する(行番号);
  if (DriverID) {
    既存ドライバーを空車へ割り当てる(
      VehicleID,
      DriverID
    );
  }
  if (typeof スマホ用車両一覧キャッシュを削除する_ === 'function') {
    スマホ用車両一覧キャッシュを削除する_();
  }
  if (typeof スマホ用ドライバー一覧キャッシュを削除する_ === 'function') {
    スマホ用ドライバー一覧キャッシュを削除する_();
  }
}
function GF_ドライバー登録キューを処理する_(job) {
  const DriverID = String(job.DriverID || '').trim();
  const 氏名 = String(job.車番 || '').trim(); // ドライバー種別では6列目を氏名として使用
  if (!DriverID || !氏名) throw new Error('ドライバーキュー情報が不足しています。');
  if (!job.一時フォルダID) throw new Error('免許証一時フォルダがありません。');
  const 画像一覧 = GF_登録キュー一時免許証画像を読む_(job.一時フォルダID);
  if (画像一覧.length !== 2) {
    throw new Error('一時保存した免許証が2枚見つかりません。件数=' + 画像一覧.length);
  }
  // DriverIDはすでに確定済み。氏名で再検索しない。
  スマホ新規ドライバー登録後処理を実行する(DriverID, 氏名, 0);
  スマホから免許証をまとめて登録する(DriverID, 画像一覧);
  if (typeof スマホ用ドライバー一覧キャッシュを削除する_ === 'function') {
    スマホ用ドライバー一覧キャッシュを削除する_();
  }
}
function GF_登録キュー一時免許証画像を読む_(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const arr = [];
  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    if (!/^免許証_\d{2}\./.test(name)) continue;
    const blob = f.getBlob();
    arr.push({
      _name:name,
      ファイル名:name,
      MIMEタイプ:blob.getContentType() || 'image/jpeg',
      Base64:Utilities.base64Encode(blob.getBytes())
    });
  }
  arr.sort((a,b)=>a._name.localeCompare(b._name));
  return arr.map(x=>({ファイル名:x.ファイル名,MIMEタイプ:x.MIMEタイプ,Base64:x.Base64}));
}
function GF_登録キューシートを取得する_() {
  const ss = 対象スプレッドシートを開く_();
  let sheet = ss.getSheetByName(GF_登録キュー設定_99.シート名);
  if (!sheet) {
    sheet = ss.insertSheet(GF_登録キュー設定_99.シート名);
    sheet.getRange(1, 1, 1, 12).setValues([[
      'JobID','受付日時','種別','VehicleID','行番号','車番/氏名',
      'DriverID','一時フォルダID','状態','エラー','開始日時','完了日時'
    ]]);
    sheet.setFrozenRows(1);
  }
  if(sheet.getMaxColumns()<14)sheet.insertColumnsAfter(sheet.getMaxColumns(),14-sheet.getMaxColumns());
  // 見出しは初回だけ設定。受付のたびに同じセルを書き換えない。
  // 既存シートで見出しが空の場合のみ補完する。
  const 見出し = sheet.getRange(1,13,1,2).getValues()[0];
  if (見出し[0] !== '処理段階' || 見出し[1] !== '処理トークン') {
    sheet.getRange(1,13,1,2).setValues([['処理段階','処理トークン']]);
  }
  // 管理用シートなので普段は見せない。
  // 既に作成済みでも、この関数を通った時点で非表示に戻す。
  try {
    if (!sheet.isSheetHidden()) {
      sheet.hideSheet();
    }
  } catch (e) {
    console.warn('登録キュー非表示スキップ: ' + (e && e.message ? e.message : e));
  }
  return sheet;
}
function GF_登録キューJob行を探す_(sheet, JobID) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === JobID) return i + 2;
  }
  return 0;
}
function GF_登録キュー次ジョブを取得する_(sheet) {
  const n=sheet.getLastRow()-1;if(n<1)return null;
  const rows=sheet.getRange(2,1,n,14).getValues();
  const pending=['待機','書類待ち','同期待ち','割当待ち','ドライバー準備待ち','免許証保存待ち'];
  for(let i=0;i<rows.length;i++){
    const r=rows[i];if(!r[0]||!pending.includes(String(r[8]).trim()))continue;
    return {行:i+2,JobID:String(r[0]),受付日時:r[1],種別:String(r[2]),VehicleID:String(r[3]),行番号:Number(r[4]),車番:String(r[5]),DriverID:String(r[6]),一時フォルダID:String(r[7]),状態:String(r[8]),段階:String(r[12]||'')};
  }
  return null;
}
function GF_登録キュー待機件数_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const states = sheet.getRange(2, 9, lastRow - 1, 1).getDisplayValues();
  return states.filter(r => String(r[0] || '').trim() === '待機').length;
}
function GF_登録キューステータス更新_(
  sheet, row, 状態, エラー, 開始日時, 完了日時
) {
  sheet.getRange(row, 9, 1, 4).setValues([[
    状態 || '',
    エラー || '',
    開始日時 || '',
    完了日時 || ''
  ]]);
  SpreadsheetApp.flush();
}
function GF_登録キュー一時ルートを取得する_() {
  const name = GF_登録キュー設定_99.一時フォルダ名;
  const root = DriveApp.getRootFolder();
  const folders = root.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(name);
}
function GF_登録キュー画像Blob_(画像, fallbackName) {
  画像 = 画像 || {};
  const base64 = String(画像.Base64 || '')
    .replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new Error('画像データが空です。');
  const mime = String(画像.MIMEタイプ || 'image/jpeg').trim() || 'image/jpeg';
  const name = String(画像.ファイル名 || fallbackName || 'image').trim();
  return Utilities.newBlob(
    Utilities.base64Decode(base64),
    mime,
    name
  );
}
function GF_登録キュー拡張子_(mime) {
  mime = String(mime || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('heif')) return 'heif';
  return 'jpg';
}
function GF_登録キュー一時画像を読む_(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const arr = [];
  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    if (!/^車両書類_\d{2}\./.test(name)) continue;
    const blob = f.getBlob();
    arr.push({
      _name: name,
      ファイル名: name,
      MIMEタイプ: blob.getContentType() || 'image/jpeg',
      Base64: Utilities.base64Encode(blob.getBytes())
    });
  }
  arr.sort((a, b) => a._name.localeCompare(b._name));
  return arr.map(x => ({
    ファイル名: x.ファイル名,
    MIMEタイプ: x.MIMEタイプ,
    Base64: x.Base64
  }));
}
function GF_登録キュー一時フォルダを削除する_(folderId) {
  folderId = String(folderId || '').trim();
  if (!folderId) return;
  try {
    DriveApp.getFolderById(folderId).setTrashed(true);
  } catch (e) {
    console.warn(
      '登録キュー一時フォルダ削除スキップ: ' +
      (e && e.message ? e.message : e)
    );
  }
}
function GF_登録キューワーカーを予約する_() {
  const handler = GF_登録キュー設定_99.ワーカー関数名;
  // 1回きりの after() トリガーは使わず、
  // 常設の1分おきトリガーを1本だけ使う。
  const exists = ScriptApp
    .getProjectTriggers()
    .some(t => t.getHandlerFunction() === handler);
  if (exists) return;
  ScriptApp
    .newTrigger(handler)
    .timeBased()
    .everyMinutes(1)
    .create();
}
/**
 * 初回だけ手動実行する。
 * 以前のワーカートリガーを削除し、
 * 1分おきの常設トリガーを1本だけ作り直す。
 */
function 初回設定_登録キュートリガーを作り直す() {
  PropertiesService.getScriptProperties().setProperty('GF_QUEUE_PENDING','1');
  const handler = GF_登録キュー設定_99.ワーカー関数名;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp
    .newTrigger(handler)
    .timeBased()
    .everyMinutes(1)
    .create();
  return {
    成功: true,
    メッセージ: '登録キューの自動処理トリガーを1分おきで作成しました。'
  };
}
/**
 * 一度だけ手動実行してもOK。
 * 既にある登録キューを非表示にし、過去の「完了」行だけ削除する。
 */
function 管理シートを整理する_登録キュー() {
  GF_登録キューシートを取得する_();
  return {成功:true,メッセージ:'登録キューを非表示にしました。連続受付を守るため完了履歴は残します。'};
}
function テスト_登録キューを今すぐ処理する() {
  GF_登録キューワーカー();
}
// 連続受付版：短い更新だけをロック。写真/PDF/同期中は保持しない。
function GF_短いロックで実行する_99(fn) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('ただいま更新中です。少し待ってお試しください。');
  try{return fn();}finally{lock.releaseLock();}
}
function GF_受付行を追加する_99(type,vehicle,row,name,driver,images) {
  const 計測開始 = Date.now();
  try { return GF_短いロックで実行する_99(()=>{
    GF_登録キューワーカーを予約する_();
    const sheet=GF_登録キューシートを取得する_();
    const count=sheet.getLastRow()-1;
    if(count>0){
      const existing=sheet.getRange(2,1,count,14).getValues().find(r=>String(r[2])===type&&String(type==='車両'?r[3]:r[6])===(type==='車両'?vehicle:driver)&&String(r[8])!=='完了');
      if(existing){
        if(['エラー','要確認'].includes(String(existing[8])))throw new Error('この登録は確認待ちです。管理担当者に確認してください。');
        return {成功:true,JobID:String(existing[0]),VehicleID:vehicle,DriverID:driver,氏名:type==='ドライバー'?name:'',車番:type==='車両'?name:'',書類あり:images};
      }
    }
    const id=(type==='車両'?'VQ-':'DQ-')+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMddHHmmss')+'-'+Utilities.getUuid().slice(0,8);
    PropertiesService.getScriptProperties().setProperty('GF_QUEUE_PENDING','1');
    sheet.appendRow([id,new Date(),type,vehicle,row,name,driver,'',images?'画像待ち':'待機','','','','','']);
    SpreadsheetApp.flush();
    return {成功:true,JobID:id,VehicleID:vehicle,DriverID:driver,氏名:type==='ドライバー'?name:'',車番:type==='車両'?name:'',書類あり:images};
  }); } finally {
    console.log('受付時間 / 種別='+type+' / ms='+(Date.now()-計測開始));
  }
}
/**
 * 一時Driveへの保存を実ファイルで確認する。
 * 枚数だけでなく、連番の欠落・重複・0バイトを検出。
 * 読み取りのみ。ファイル内容の画像としての妥当性は未検証。
 */
function GF_一時画像の保存結果を確認する_99(folder, count, prefix) {
  const files=folder.getFiles(), found={};
  let total=0;
  while(files.hasNext()) {
    const f=files.next();
    if(f.isTrashed()) continue;
    total++;
    const name=f.getName();
    const match=name.match(new RegExp('^'+prefix+'_([0-9]{2})\\.(jpg|jpeg|png|webp|heic|heif)$','i'));
    if(!match) throw new Error('一時保存に想定外のファイルがあります。');
    const n=Number(match[1]);
    if(n<1||n>count||found[n]) throw new Error('一時保存した画像の番号が重複または不正です。');
    if(f.getSize()<=0) throw new Error('一時保存した画像が空です。番号='+n);
    found[n]=true;
  }
  if(total!==count) throw new Error('一時保存した画像の枚数が一致しません。期待='+count+' / 実際='+total);
  for(let i=1;i<=count;i++) if(!found[i]) throw new Error('一時保存した画像が不足しています。番号='+i);
  return total;
}

function GF_画像を受付へ保存する_99(id,images,type,count,prefix) {
  id=String(id||'').trim();
  if(!id||!Array.isArray(images)||images.length!==count)throw new Error('書類画像を確認してください。');
  const 計測開始=Date.now();
  let 計測受付=0,計測フォルダ=0,計測画像=0,計測検証=0,計測確定=0;
  const token=Utilities.getUuid();let previous='',already=false;
  GF_短いロックで実行する_99(()=>{
    const sheet=GF_登録キューシートを取得する_(),row=GF_登録キューJob行を探す_(sheet,id);
    if(!row)throw new Error('受付が見つかりません。');
    const data=sheet.getRange(row,1,1,14).getValues()[0];
    if(String(data[2])!==type)throw new Error('書類の受付種別が一致しません。');
    const state=String(data[8]);
    if(data[7]&&!['画像待ち','画像保存エラー','画像保存中'].includes(state)){already=true;return;}
    if(!['画像待ち','画像保存エラー'].includes(state))throw new Error('書類は送信中、または確認待ちです。管理担当者に確認してください。');
    previous=String(data[7]||'');
    sheet.getRange(row,9,1,6).setValues([['画像保存中','',new Date(),'','画像保存',token]]);
    SpreadsheetApp.flush();
  });
  計測受付=Date.now()-計測開始;
  if(already)return {成功:true,JobID:id,処理済み:true};
  let folder=null;
  try{
    folder=GF_登録キュー一時ルートを取得する_().createFolder(id);
    計測フォルダ=Date.now()-計測開始-計測受付;
    images.forEach((x,i)=>{
      const blob=GF_登録キュー画像Blob_(x,prefix+'_'+(i+1));
      folder.createFile(blob.setName(prefix+'_'+String(i+1).padStart(2,'0')+'.'+GF_登録キュー拡張子_(blob.getContentType())));
    });
    計測画像=Date.now()-計測開始-計測受付-計測フォルダ;
    // 保存済みの実ファイルを確認できた場合だけ「待機」にする。
    GF_一時画像の保存結果を確認する_99(folder,count,prefix);
    計測検証=Date.now()-計測開始-計測受付-計測フォルダ-計測画像;
    GF_短いロックで実行する_99(()=>{
      const sheet=GF_登録キューシートを取得する_(),row=GF_登録キューJob行を探す_(sheet,id);
      if(!row||String(sheet.getRange(row,14).getValue())!==token)throw new Error('書類の保存状態を管理担当者に確認してください。');
      PropertiesService.getScriptProperties().setProperty('GF_QUEUE_PENDING','1');
      sheet.getRange(row,8,1,7).setValues([[folder.getId(),'待機','',new Date(),'','','']]);
      SpreadsheetApp.flush();
    });
    計測確定=Date.now()-計測開始-計測受付-計測フォルダ-計測画像-計測検証;
    if(previous)GF_登録キュー一時フォルダを削除する_(previous);
    console.log('書類一時保存 / 種別='+type+' / 枚数='+count+' / ms='+(Date.now()-計測開始));
    console.log('書類一時保存内訳ms='+JSON.stringify({受付確認:計測受付,フォルダ作成:計測フォルダ,画像復元と保存:計測画像,保存確認:計測検証,キュー確定:計測確定}));
    return {成功:true,JobID:id};
  }catch(e){
    // エラー時も一時画像を残す。再送/復旧前に確認できる。
    GF_短いロックで実行する_99(()=>{
      const sheet=GF_登録キューシートを取得する_(),row=GF_登録キューJob行を探す_(sheet,id);
      if(row&&String(sheet.getRange(row,14).getValue())===token){
        sheet.getRange(row,8,1,7).setValues([[folder?folder.getId():previous,'画像保存エラー',String(e&&e.message||e).slice(0,45000),new Date(),'','画像保存','']]);
        SpreadsheetApp.flush();
      }
    });
    throw e;
  }
}
function GF_開始段階を決める_99(job) {
  if(job.状態!=='待機')return job.状態;
  return job.種別==='車両'?(job.一時フォルダID?'書類待ち':'同期待ち'):'ドライバー準備待ち';
}
function GF_受付の一段階を処理する_99(job) {
  if(job.種別==='車両'){
    if(job.段階==='書類待ち'){
      const imgs=GF_登録キュー一時画像を読む_(job.一時フォルダID);
      if(imgs.length!==3)throw new Error('車両書類3枚を確認してください。');
      スマホから新規車両基本書類を保存する(job.VehicleID,imgs);
      return '同期待ち';
    }
    const ss=対象スプレッドシートを開く_(),ledger=必須シートを取得する_(ss,シート名.車両台帳);
    const row=IDで行を探す_(ledger,'VehicleID',job.VehicleID);
    if(!row)throw new Error('対象車両が見つかりません。');
    if(job.段階==='同期待ち'){
      スマホ新規車両登録後処理を実行する(row);
      if(job.DriverID)return '割当待ち';
    }else if(job.段階==='割当待ち'){
      既存ドライバーを空車へ割り当てる(job.VehicleID,job.DriverID);
    }else throw new Error('車両の処理段階を確認してください。');
  }else if(job.種別==='ドライバー'){
    if(job.段階==='ドライバー準備待ち'){
      スマホ新規ドライバー登録後処理を実行する(job.DriverID,job.車番,0);
      return '免許証保存待ち';
    }
    if(job.段階!=='免許証保存待ち')throw new Error('免許証の処理段階を確認してください。');
    const imgs=GF_登録キュー一時免許証画像を読む_(job.一時フォルダID);
    if(imgs.length!==2)throw new Error('免許証2枚を確認してください。');
    スマホから免許証をまとめて登録する(job.DriverID,imgs);
  }else throw new Error('受付種別を確認してください。');
  if(typeof スマホ用車両一覧キャッシュを削除する_==='function')スマホ用車両一覧キャッシュを削除する_();
  if(typeof スマホ用ドライバー一覧キャッシュを削除する_==='function')スマホ用ドライバー一覧キャッシュを削除する_();
  return '完了';
}
function GF_期限切れ処理を確認待ちにする_99(sheet) {
  const n=sheet.getLastRow()-1;if(n<1)return;
  const rows=sheet.getRange(2,1,n,14).getValues();
  rows.forEach((r,i)=>{
    if(!['処理中','画像保存中'].includes(String(r[8])))return;
    const stamp=r[10] instanceof Date?r[10].getTime():0;
    if(stamp&&Date.now()-stamp<600000)return;
    sheet.getRange(i+2,9,1,6).setValues([['要確認','前回の処理が終了していません。書類と処理段階を確認してください。',r[10]||'',new Date(),r[12]||'旧処理','']]);
  });
  SpreadsheetApp.flush();
}
function GF_登録キューの状態を確認する() {
  const sheet=GF_登録キューシートを取得する_(),n=sheet.getLastRow()-1;
  const rows=n>0?sheet.getRange(2,1,n,14).getValues():[],counts={};
  rows.forEach(r=>{if(!r[0])return;const state=String(r[8]||'');counts[state]=(counts[state]||0)+1;});
  console.log('登録キュー集計: '+JSON.stringify(counts));
  rows.filter(r=>r[0]&&['エラー','画像保存エラー','要確認','画像待ち','画像保存中','処理中'].includes(String(r[8]))).forEach(r=>console.log('JobID='+r[0]+' / 状態='+r[8]+' / 段階='+r[12]+' / 詳細='+r[9]));
  return counts;
}
/** 今回のファイル名判定エラーだけを、元写真3枚を確認して再開する。 */
function GF_写真枚数エラーの車両受付を再開する() {
  const sheet=GF_登録キューシートを取得する_(),n=sheet.getLastRow()-1;
  const rows=n>0?sheet.getRange(2,1,n,14).getValues():[];
  let resumed=0;
  rows.forEach(r=>{
    if(String(r[2])!=='車両'||String(r[8])!=='エラー'||String(r[12])!=='書類待ち'
       ||!String(r[9]).includes('車両書類3枚を確認してください。')||!r[7])return;
    const iterator=DriveApp.getFolderById(String(r[7])).getFiles(),names=[];
    while(iterator.hasNext()){
      const name=iterator.next().getName();
      if(/^車両書類_\d{2}\./.test(name))names.push(name);
    }
    if(names.length!==3||!['01','02','03'].every(i=>names.filter(x=>x.startsWith('車両書類_'+i+'.')).length===1)){
      console.log('写真確認が必要 / JobID='+r[0]+' / 対象写真='+names.length+'枚');return;
    }
    GF_短いロックで実行する_99(()=>{
      const row=GF_登録キューJob行を探す_(sheet,String(r[0]));
      if(!row)return;
      const latest=sheet.getRange(row,9,1,6).getValues()[0];
      if(String(latest[0])!=='エラー'||String(latest[4])!=='書類待ち'
         ||!String(latest[1]).includes('車両書類3枚を確認してください。'))return;
      sheet.getRange(row,9,1,6).setValues([['書類待ち','',new Date(),'','書類待ち','']]);
      PropertiesService.getScriptProperties().setProperty('GF_QUEUE_PENDING','1');
      SpreadsheetApp.flush();resumed++;
      console.log('写真3枚を確認して再開 / JobID='+r[0]);
    });
  });
  if(resumed)GF_登録キューワーカーを予約する_();
  console.log('今回の写真枚数エラー再開件数='+resumed);
  return {再開件数:resumed};
}
/******************************************************
 * 日分け処理：受付・写真保存は停止せず、重い後処理だけ制限。
 * ローリング24時間で計算する。日付が変わるだけでは枠をリセットしない。
 * 時間は当キュー分のみ。他のGASの使用量は取得できないため余裕を残す。
 ******************************************************/
function GF_登録キュー時間履歴を読む_99(props, now) {
  const raw = props.getProperty('GF_QUEUE_RUNTIME_LOG');
  let rows = [];
  if (raw) {
    try { rows = JSON.parse(raw); }
    catch (e) { throw new Error('登録キューの時間記録を管理担当者に確認してください。'); }
    if (!Array.isArray(rows)) throw new Error('登録キューの時間記録が不正です。');
  }
  if (rows.some(r => !Array.isArray(r) || !Number.isFinite(r[1]) || !Number.isFinite(r[2]) || r[2] < 0)) {
    throw new Error('登録キューの時間記録が不正です。');
  }
  return rows.filter(r => r[1] > now - 24 * 60 * 60 * 1000);
}
function GF_登録キュー時間枠を確認する_99(props, now) {
  // 連続処理でも24時間の自主時間枠を必ず確認する。
  const rows = GF_登録キュー時間履歴を読む_99(props, now);
  const limit = GF_登録キュー設定_99.直近24時間処理上限ミリ秒;
  const reserve = GF_登録キュー設定_99.一段階予約ミリ秒;
  let used = rows.reduce((sum, r) => sum + r[2], 0);
  if (used + reserve <= limit) {
    props.deleteProperty('GF_QUEUE_BUDGET_RESUME_AT');
    return {許可:true, 使用ミリ秒:used, 再開日時:0};
  }
  let resume = 0;
  for (const r of rows.slice().sort((a,b)=>a[1]-b[1])) {
    used -= r[2];
    if (used + reserve <= limit) { resume = r[1] + 24 * 60 * 60 * 1000; break; }
  }
  if (!resume) throw new Error('登録キューの時間上限設定を確認してください。');
  props.setProperty('GF_QUEUE_BUDGET_RESUME_AT', String(resume));
  console.log('登録キューは日分け待機 / 写真・受付は保持 / 再開目安=' + new Date(resume).toISOString());
  return {許可:false, 使用ミリ秒:rows.reduce((sum,r)=>sum+r[2],0), 再開日時:resume};
}
function GF_登録キュー時間を予約する_99(props, token, now) {
  const rows = GF_登録キュー時間履歴を読む_99(props, now);
  rows.push([token, now, GF_登録キュー設定_99.一段階予約ミリ秒]);
  props.setProperty('GF_QUEUE_RUNTIME_LOG', JSON.stringify(rows));
}
function GF_登録キュー時間を確定する_99(props, token, start, now) {
  const rows = GF_登録キュー時間履歴を読む_99(props, now);
  const row = rows.find(r => r[0] === token);
  if (!row) throw new Error('登録キューの処理時間予約が見つかりません。');
  row[1] = now;
  // 終了記録・ロック解放などの余裕を15秒加えて計上する。
  row[2] = Math.max(1000, now - start) + 15000;
  props.setProperty('GF_QUEUE_RUNTIME_LOG', JSON.stringify(rows));
  GF_登録キュー時間枠を確認する_99(props, now);
}
/** 受付を続けつつ、重い後処理を手動で止めたい場合だけ実行。 */
function GF_登録キューを受付優先で一時停止する() {
  GF_短いロックで実行する_99(() => {
    PropertiesService.getScriptProperties().setProperty('GF_QUEUE_INTAKE_ONLY', '1');
  });
  console.log('後処理を一時停止しました。写真と登録情報の受付・保存は継続します。');
  return {成功:true, メッセージ:'写真の受付を続け、後処理を一時停止しました。'};
}
/** 時間枠を守って自動処理を再開。時間記録は消さない。 */
function GF_登録キューの日分け処理を再開する() {
  GF_短いロックで実行する_99(() => {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty('GF_QUEUE_CONTINUOUS');
    props.deleteProperty('GF_QUEUE_INTAKE_ONLY');
    props.setProperty('GF_QUEUE_PENDING', '1');
    GF_登録キューワーカーを予約する_();
  });
  return GF_登録キューの日分け状態を確認する();
}
function GF_登録キューの日分け状態を確認する() {
  const props = PropertiesService.getScriptProperties();
  const result = GF_短いロックで実行する_99(() => {
    const now = Date.now();
    const state = GF_登録キュー時間枠を確認する_99(props, now);
    return {
      後処理一時停止:props.getProperty('GF_QUEUE_INTAKE_ONLY') === '1',
      直近24時間計上分:Number((state.使用ミリ秒 / 60000).toFixed(2)),
      処理上限分:GF_登録キュー設定_99.直近24時間処理上限ミリ秒 / 60000,
      処理モード:props.getProperty('GF_QUEUE_CONTINUOUS')==='1'?'安全な連続処理':'一段階処理',
      自動再開目安:state.再開日時 ? Utilities.formatDate(new Date(state.再開日時), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') : '時間枠あり'
    };
  });
  console.log(JSON.stringify(result));
  return result;
}