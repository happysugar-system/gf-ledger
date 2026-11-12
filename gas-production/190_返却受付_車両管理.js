/** 車両管理GASへ追加。既存70/80は変更しない。 */
const GF190_DIRS=['正面','右前','右側','右後','後面','左後','左側','左前'];
const GF190_TAB='LINE返却受付_DEMO';
function GF190_祝日_(y,m,d){const key=(a,b)=>('0'+a).slice(-2)+'-'+('0'+b).slice(-2),s=new Set(),add=(a,b)=>s.add(key(a,b)),mon=(a,n)=>1+(8-new Date(y,a-1,1).getDay())%7+7*(n-1);[[1,1],[2,11],[2,23],[4,29],[5,3],[5,4],[5,5],[8,11],[11,3],[11,23]].forEach(x=>add(x[0],x[1]));[[1,2],[7,3],[9,3],[10,2]].forEach(x=>add(x[0],mon(x[0],x[1])));add(3,Math.floor(20.8431+.242194*(y-1980)-Math.floor((y-1980)/4)));add(9,Math.floor(23.2488+.242194*(y-1980)-Math.floor((y-1980)/4)));for(const k of [...s]){const a=k.split('-').map(Number);if(new Date(y,a[0]-1,a[1]).getDay()===0){let t=new Date(y,a[0]-1,a[1]+1);while(s.has(key(t.getMonth()+1,t.getDate())))t.setDate(t.getDate()+1);if(t.getFullYear()===y)add(t.getMonth()+1,t.getDate());}}for(let i=2;i<365;i++){const t=new Date(y,0,i),p=new Date(y,0,i-1),n=new Date(y,0,i+1);if(t.getFullYear()!==y||n.getFullYear()!==y)continue;const k=key(t.getMonth()+1,t.getDate());if(!s.has(k)&&s.has(key(p.getMonth()+1,p.getDate()))&&s.has(key(n.getMonth()+1,n.getDate())))add(t.getMonth()+1,t.getDate());}return s.has(key(m,d));}
function GF190_日時検証_(date,time){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||time<'10:00'||time>'16:00'||Number(time.slice(3))%30!==0)throw Error('返却希望日時を確認してください');const a=date.split('-').map(Number),t=new Date(a[0],a[1]-1,a[2]);if(t.getFullYear()!==a[0]||t.getMonth()!==a[1]-1||t.getDate()!==a[2]||t.getDay()===0||t.getDay()===6||GF190_祝日_(...a))throw Error('返却希望日は土日祝日を選べません');const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');if(date<today)throw Error('過去の日付は選べません');}

function GF190_secret_(){const s=PropertiesService.getScriptProperties().getProperty('GF190_SHARED_SECRET');if(!s||s.length<32)throw Error('GF190_SHARED_SECRET未設定');return s;}
function GF190_sign_(body){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body,GF190_secret_())).replace(/=+$/,'');}
function GF190_token_(token){const a=String(token||'').split('.');if(a.length!==2||GF190_sign_(a[0])!==a[1])throw Error('受付リンクが無効です');let d;try{d=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(a[0])).getDataAsString());}catch(e){throw Error('受付リンクを読み取れません');}if(d.p!=='return'||!d.u||!d.n||!d.exp||Date.now()>d.exp)throw Error('受付リンクの有効期限が切れました');return d;}
function GF190_sheet_(){
  // 移行完了までは従来の車両管理ブックを使う。
  const switched=PropertiesService.getScriptProperties().getProperty('GF190_STORAGE_LINE')==='ON';
  const ss=switched ? GF194_LINE受付ブックを開く_() : 対象スプレッドシートを開く_();
  let sh=ss.getSheetByName(GF190_TAB);
  if(!sh){
    if(switched)throw new Error('LINE受付側に返却詳細シートがありません。移行状態を確認してください。');
    sh=ss.insertSheet(GF190_TAB);
    sh.appendRow(['受付キー','LINEユーザーID','VehicleID','車番','氏名','電話番号','返却希望日','備考','状態','保存済み方向JSON','写真フォルダURL','受付日時','更新日時','返却希望時間','損傷の有無','保険会社報告']);
  }
  if(sh.getLastColumn()<16){
    if(switched)throw new Error('LINE受付側の返却詳細シート列数が不足しています。');
    sh.getRange(1,14,1,3).setValues([['返却希望時間','損傷の有無','保険会社報告']]);
  }
  return sh;
}
function GF190_find_(sh,key){if(sh.getLastRow()<2)return 0;const values=sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues();for(let i=0;i<values.length;i++)if(values[i][0]===key)return i+2;return 0;}
/** 車番の全角・空白・ハイフン等の表記差を吸収する。 */
function GF190_車番正規化_(value) {
  return String(value == null ? '' : value).normalize('NFKC')
    .replace(/[\s\u3000\-‐‑‒–—―ー－・･.．]/g, '')
    .toUpperCase();
}

/** 台帳C列「管轄」＋D列「車番」を一体の車番として照合する。 */
function GF190_vehicle_(car) {
  const sh = 必須シートを取得する_(対象スプレッドシートを開く_(), シート名.車両台帳);
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const vid = h.indexOf('VehicleID');
  const num = h.indexOf('車番');
  const area = h.indexOf('管轄');
  if (vid < 0 || num < 0 || area < 0) throw Error('車両台帳の「VehicleID」「管轄」「車番」列を確認してください');
  const rows = sh.getDataRange().getDisplayValues();
  const input = GF190_車番正規化_(car);
  if (!input) throw Error('車番を入力してください');
  const exact = [], numberOnly = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[vid]) continue;
    const number = GF190_車番正規化_(r[num]);
    const jurisdiction = GF190_車番正規化_(r[area]);
    if (!number) continue;
    const item = {row:i+1, id:r[vid], number:r[num]};
    if (jurisdiction && jurisdiction + number === input) exact.push(item);
    if (number === input) numberOnly.push(item);
  }
  // フル車番が入力された場合は管轄＋番号の完全一致のみ許可する。
  // 番号だけの入力は、台帳内で重複がない場合に限り許可する。
  const matches = exact.length ? exact : numberOnly;
  if (matches.length !== 1) throw Error(matches.length > 1
    ? '同じ車番の車両が複数あります。管轄も含めて入力してください'
    : '車番を特定できません。管轄と車番を確認してください');
  return matches[0];
}

/** 日付・時刻セルが旧形式で保存されていても、送信時に文字列へ正規化する。 */
function GF190_日付文字列_(v){
  if(v instanceof Date)return Utilities.formatDate(v,'Asia/Tokyo','yyyy-MM-dd');
  const s=String(v==null?'':v).trim();
  if(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)){
    const a=s.split(/[-/]/).map(Number);return a[0]+'-'+('0'+a[1]).slice(-2)+'-'+('0'+a[2]).slice(-2);
  }
  return s;
}
function GF190_時間文字列_(v){
  if(v instanceof Date)return Utilities.formatDate(v,'Asia/Tokyo','HH:mm');
  const s=String(v==null?'':v).trim();
  if(/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s))return s.slice(0,5).padStart(5,'0');
  return s;
}
/** 既存の電話番号・時間の表示形式だけを修正。失われた先頭0は推測しない。 */
function GF190_既存セル表示形式を修正する(){
 const sh=GF190_sheet_(),last=sh.getLastRow();if(last<2)return '対象なし';
 sh.getRange(2,6,last-1,1).setNumberFormat('@');
 sh.getRange(2,14,last-1,1).setNumberFormat('HH:mm');
 return '表示形式修正 '+(last-1)+'件（値は変更なし）';
}

function GF190_開始(token,data){const auth=GF190_token_(token);const car=GF190_vehicle_(String(data.car||'').trim());const name=String(data.name||'').trim(),phone=String(data.phone||'').replace(/[-\s]/g,''),date=String(data.date||''),memo=String(data.memo||'').slice(0,500),time=String(data.time||''),damage=String(data.damage||''),insurance=String(data.insurance||'');GF190_日時検証_(date,time);if(!['あり','なし'].includes(damage)||(damage==='あり'&&!['済','未'].includes(insurance)))throw Error('損傷・保険会社報告を確認してください');if(!name||name.length>80||!/^0\d{9,10}$/.test(phone)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('氏名・電話番号・返却希望日を確認してください');const lock=LockService.getScriptLock();lock.waitLock(20000);try{const sh=GF190_sheet_(),key=auth.n;let row=GF190_find_(sh,key);if(row){const old=sh.getRange(row,1,1,16).getValues()[0];if(old[1]!==auth.u||old[2]!==car.id)throw Error('この受付リンクは別の車両に使用済みです');if(old[8]==='完了')return {key,done:true,saved:JSON.parse(old[9]||'{}')};return {key,done:false,saved:JSON.parse(old[9]||'{}')};}const next=sh.getLastRow()+1;
sh.getRange(next,6).setNumberFormat('@');
sh.getRange(next,7).setNumberFormat('@');
sh.getRange(next,14).setNumberFormat('@');
sh.getRange(next,1,1,16).setValues([[key,auth.u,car.id,car.number,name,phone,date,memo,'写真保存中','{}','',new Date(),new Date(),time,damage,damage==='あり'?insurance:'対象外']]);return {key,done:false,saved:{}};}finally{lock.releaseLock();}}
/**
 * 190_LINE返却受付.gs の GF190_写真保存() だけを丸ごと差し替え。
 * 既存受付は既存フォルダで続行、新規受付は契約親フォルダ下の一時保存へ。
 * 既存の保存済み写真は再送せず、同じ名前の写真があれば再利用。
 */
function GF190_写真保存(token, key, direction, b64) {
  const auth = GF190_token_(token);
  if (String(key) !== String(auth.n) || !GF190_DIRS.includes(direction)) {
    throw new Error('受付情報が一致しません');
  }
  if (typeof b64 !== 'string' || b64.length < 100 || b64.length > 9000000) {
    throw new Error('画像サイズを確認してください');
  }

  const sh = GF190_sheet_();
  const row = GF190_find_(sh, key);
  if (!row) throw new Error('受付情報がありません');
  let r = sh.getRange(row, 1, 1, 16).getValues()[0];
  if (String(r[0]) !== String(key) || String(r[1]) !== String(auth.u)) {
    throw new Error('受付情報が一致しません');
  }
  if (r[8] === '完了') throw new Error('この受付はすでに完了しています');
  let saved = JSON.parse(String(r[9] || '{}'));
  if (saved[direction]) return { saved: Object.keys(saved).length };

  let folder;
  const oldUrl = String(r[10] || '').trim();
  if (oldUrl) {
    // 旧受付は以前の保存先をそのまま使用。移動も作り直しもしない。
    const match = oldUrl.match(/\/folders\/([A-Za-z0-9_-]+)/);
    if (!match) throw new Error('保存先フォルダURLを読み取れません。管理者に確認してください');
    folder = DriveApp.getFolderById(match[1]);
  } else {
    // 新規受付だけ、契約ライセンスで管理する親フォルダ配下に作成。
    const rootId = String(Drive親フォルダIDを取得する_() || '').trim();
    if (!rootId) throw new Error('契約ライセンスのDrive親フォルダIDが未設定です');
    const root = DriveApp.getFolderById(rootId);
    const roots = root.getFoldersByName('LINE返却受付_一時保存');
    const tempRoot = roots.hasNext() ? roots.next() : root.createFolder('LINE返却受付_一時保存');
    const folderName = '返却_' + String(key);
    const folders = tempRoot.getFoldersByName(folderName);
    folder = folders.hasNext() ? folders.next() : tempRoot.createFolder(folderName);
  }

  const folderUrl = folder.getUrl();
  const filename = '返却_' + String(key) + '_' + direction + '.jpg';
  const existing = folder.getFilesByName(filename);
  let file;
  if (existing.hasNext()) {
    file = existing.next();
  } else {
    const bytes = Utilities.base64Decode(b64);
    if (bytes.length > 6500000) throw new Error('画像が大きすぎます');
    file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', filename));
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('受付の更新が混み合っています。再試行してください');
  try {
    r = sh.getRange(row, 1, 1, 16).getValues()[0];
    if (String(r[0]) !== String(key) || String(r[1]) !== String(auth.u)) {
      throw new Error('受付情報が変更されました');
    }
    if (r[8] === '完了') return { saved: 8 };
    saved = JSON.parse(String(r[9] || '{}'));
    const latestUrl = String(r[10] || '').trim();
    // 別リクエストが先にフォルダを確定した場合、混在を防ぐ。
    if (latestUrl && latestUrl !== folderUrl) {
      throw new Error('保存先が更新されました。同じ画面で再試行してください');
    }
    if (!saved[direction]) saved[direction] = file.getId();
    sh.getRange(row, 10, 1, 2).setValues([[JSON.stringify(saved), folderUrl]]);
    sh.getRange(row, 13).setValue(new Date());
    return { saved: Object.keys(saved).length };
  } finally {
    lock.releaseLock();
  }
}
function GF190_完了(token,key){const auth=GF190_token_(token);if(key!==auth.n)throw Error('受付情報が一致しません');const lock=LockService.getScriptLock();lock.waitLock(20000);let info;try{const sh=GF190_sheet_(),row=GF190_find_(sh,key);if(!row)throw Error('受付が見つかりません');const r=sh.getRange(row,1,1,16).getValues()[0];if(r[1]!==auth.u)throw Error('受付情報が一致しません');const saved=JSON.parse(r[9]||'{}');if(GF190_DIRS.some(x=>!saved[x]))throw Error('写真8方向の保存が完了していません');if(r[8]==='完了')return {ok:true,key,alreadyDone:true};sh.getRange(row,9).setValue('完了');const shown=sh.getRange(row,1,1,16).getDisplayValues()[0];
info={key,uid:String(r[1]),vehicle:String(r[2]),car:String(r[3]),name:String(r[4]),phone:String(shown[5]),date:GF190_日付文字列_(r[6]),memo:String(r[7]||''),folder:String(r[10]),time:GF190_時間文字列_(r[13]),damage:String(r[14]),insurance:String(r[15])};}finally{lock.releaseLock();}GF190_notify_(info);return {ok:true,key};}
/** 車両管理GASの GF190_notify_(d) だけ差し替え。既存の写真保存・車両照合は変更しない。 */
function GF190_notify_(d) {
  const props = PropertiesService.getScriptProperties();
  const endpoint = String(props.getProperty('GF190_LINE_RECEIPT_ENDPOINT') || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)) {
    console.error('返却受付のLINE受付管理連携：GF190_LINE_RECEIPT_ENDPOINT未設定');
  } else {
    try {
      const body = Utilities.base64EncodeWebSafe(
  Utilities.newBlob(JSON.stringify(d), 'application/json; charset=UTF-8')
    .getBytes()
).replace(/=+$/, '');
      const sig = GF190_sign_(body);
      const response = UrlFetchApp.fetch(endpoint, {
        method: 'post',
        payload: {action:'gf190_receipt', body:body, sig:sig},
        followRedirects: true,
        muteHttpExceptions: true
      });
      const text = response.getContentText();
      const code = response.getResponseCode();
      if (code !== 200 || !/^OK(?:$|:|_ALREADY(?:$|:))/.test(text.trim())) {
        throw new Error('HTTP ' + code + ' / 応答冒頭：' + text.slice(0, 200));
      }
      console.log('返却受付のLINE受付管理連携成功：' + text.trim());
    } catch (err) {
      console.error('返却受付のLINE受付管理連携失敗 / 受付キー=' + d.key + ' / ' + err);
    }
  }
  const lineToken = props.getProperty('DEMO_LINE_CHANNEL_ACCESS_TOKEN');
  if (lineToken) {
    try {
      const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method:'post', contentType:'application/json',
        headers:{Authorization:'Bearer ' + lineToken},
        payload:JSON.stringify({to:d.uid,messages:[{type:'text',text:'🚗 車両返却のお申し込みを受け付けました。\n車番：'+d.car+'\n返却希望日時：'+d.date+' '+d.time+'\n損傷：'+d.damage+'\n\nスタッフが確認後ご連絡します。※返却完了ではありません。'}]}),
        muteHttpExceptions:true
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        console.error('返却受付のLINE通知失敗：HTTP ' + response.getResponseCode());
      }
    } catch (err) { console.error('返却受付のLINE通知失敗：' + err); }
  }
}

/** 完了済みの返却受付をLINE受付管理へ再連携する。写真の再送信不要。 */
function GF190_LINE受付へ完了分を再連携() {
  const sh = GF190_sheet_();
  const rows = sh.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[8]) !== '完了') continue;
    const d = {
      key:String(r[0]), uid:String(r[1]), vehicle:String(r[2]),
      car:String(r[3]), name:String(r[4]), phone:String(r[5]),
      date:r[6] instanceof Date ? Utilities.formatDate(r[6], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[6]),
      memo:String(r[7] || ''), folder:String(r[10] || ''),
      time:String(r[13] || ''), damage:String(r[14] || ''), insurance:String(r[15] || '')
    };
    if (!d.key || !d.uid || !d.folder) { results.push('行'+(i+1)+'：必要情報不足'); continue; }
    const endpoint = String(PropertiesService.getScriptProperties().getProperty('GF190_LINE_RECEIPT_ENDPOINT') || '').trim();
    if (!endpoint) throw new Error('GF190_LINE_RECEIPT_ENDPOINT未設定');
    const body = Utilities.base64EncodeWebSafe(
  Utilities.newBlob(JSON.stringify(d), 'application/json; charset=UTF-8')
    .getBytes()
).replace(/=+$/, '');
    try {
      const response = UrlFetchApp.fetch(endpoint, {method:'post', payload:{action:'gf190_receipt',body:body,sig:GF190_sign_(body)},followRedirects:true,muteHttpExceptions:true});
      const content = response.getContentText().trim();
      const ok = response.getResponseCode() === 200 && /^OK(?:$|:|_ALREADY(?:$|:))/.test(content);
      results.push('行'+(i+1)+'：'+(ok ? content : '失敗 HTTP '+response.getResponseCode()+' '+content.slice(0,100)));
    } catch(err) {
      results.push('行'+(i+1)+'：通信失敗 '+String(err).slice(0,150));
    }
  }
  results.forEach(x=>console.log(x));
  if (!results.length) console.log('完了済みの返却受付はありません');
}
function GF190_返却画面(e){const t=String(e&&e.parameter&&e.parameter.t||'');GF190_token_(t);const page=HtmlService.createTemplateFromFile('190_返却フォーム');page.token=t;return page.evaluate().setTitle('GOLD FIRST 車両返却').addMetaTag('viewport','width=device-width,initial-scale=1');}