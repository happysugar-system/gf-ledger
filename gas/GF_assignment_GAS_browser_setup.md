# GOLD FIRST 名変待ち割当の検証環境への適用

2026年11月24日。GitHubの `test/vehicle-assignment-save` の差分を、ブラウザでコピーできる形にまとめました。添付のGASと過去の開発版エクスポートを基準にしています。現在のGASへの適用、実行、デプロイは未実施です。

## 1. 検証用プロジェクトの確認

1. 通常のブラウザで[検証用GAS編集画面](https://script.google.com/u/0/home/projects/1avsrC0dTZOr84olefKKGrwyqGUUC-MhME5vsqqIO4TZOlsK8BoCLFmJm/edit)を開きます。
2. エディタの検索で `GF_名変待ち車両割当` と `GF154_名変待ち同期キューを処理する` を探します。見つからないものがあれば、検証用の名変待ち管理または車両同期を担当する別プロジェクトが必要です。両方なく `GFA_保存同期` だけがある場合、この編集先は既存のデモ用です。この場合は編集せず、両担当の検証用編集URLを確認してください。
3. 更新前に対象ファイルの現行コードを控えます。左側の「トリガー」で既存の実行関数名を確認します。同じキューを処理する `GF_WAIT_同期キュー_処理` と `GF154_名変待ち同期キューを処理する` が両方設定されている場合は、適用前に実行経路を確認してください。
4. 名変待ち側の `GF_sheet_()` と車両同期側の `対象スプレッドシートを開く_()` が同じテストデータ専用ブックを指すことを確認します。カレンダー・マイページ・Supabaseの設定を確認し、実運用の接続先を参照する環境ではテスト保存や同期を実行しないでください。

## 2. 名変待ち管理側

「プロジェクトの設定 → スクリプト プロパティ」で `GFW_GF138_LINE_BOOK_ID` にテストLINE受付ブックのIDを入れます。「名変待ち管理」に `LINE受付ID`、`受付識別子`、`DriverID` の見出しを用意します。テスト受付について、車両依頼受付・LINE受付管理・GF138の同期履歴・ドライバーマスターに一貫した記録を用意してください。氏名から受付を逆引きして紐付けると同姓同名を区別できません。

### 追加するGASファイル

`GFA_assignment_driver_link` を追加し、以下を貼り付けます。

```javascript
/**
 * Resolve an assignment identity in the vehicle-management GAS project.
 * The caller supplies the waiting row's stored receipt ID, receipt key and DriverID.
 * GF138's existing trigger owns registration. Retry pending results after it runs.
 */
function GFA_割当DriverIDを照合_(lineReceiptId, waitingDriverId, books) {
  if (!books?.line || !books?.vehicle) throw Error('照合する台帳がありません');
  const receiptId = GFA_ID文字列_(lineReceiptId);
  if (!receiptId) throw new Error('LINE受付IDを確認してください');

  const { line, vehicle } = books;
  if (line.getId() === vehicle.getId()) throw new Error('台帳の接続先が不正です');

  const source = GFA_割当照合シート_(line, '車両依頼受付');
  const reception = GFA_割当照合シート_(line, 'LINE受付管理');
  const drivers = GFA_割当照合シート_(vehicle, 'ドライバーマスター');
  const sourceRow = GFA_割当照合行_(source, 'LINE受付ID', receiptId, ['書類状態', '受付識別子']);
  const receptionRow = GFA_割当照合行_(reception, '受付ID', receiptId, ['DriverID']);

  const requestKey = sourceRow['受付識別子'];
  const waitingKey = GFA_ID文字列_(books?.waitingKey);
  if (!/^[a-f0-9]{64}$/i.test(requestKey) || waitingKey !== requestKey) {
    throw new Error('名変待ちと車両依頼の受付識別子が一致しません');
  }
  if (sourceRow['書類状態'] !== '保存完了') return { state: 'reception_incomplete' };

  const linkedId = receptionRow.DriverID;
  const savedId = GFA_ID文字列_(waitingDriverId);
  if (savedId && savedId !== linkedId) {
    throw new Error('名変待ちとLINE受付のDriverIDが一致しません');
  }
  const history = vehicle.getSheetByName('GF_LINEドライバー同期履歴');
  const result = history && GFA_割当照合行_(
    history, '受付識別子', requestKey, ['処理状態', 'LINE受付ID', 'DriverID'], true
  );
  if (result && (result['LINE受付ID'] !== receiptId || (result.DriverID && result.DriverID !== linkedId))) {
    throw new Error('GF138の同期履歴がLINE受付と一致しません');
  }
  if (!linkedId || !result || result['処理状態'] !== '登録済' || result.DriverID !== linkedId) {
    return { state: result || linkedId ? 'registration_review_required' : 'registration_pending' };
  }
  const driver = GFA_割当照合行_(drivers, 'DriverID', linkedId, ['ステータス']);
  if (driver['ステータス'] !== '有効') throw new Error('ドライバーが有効ではありません');
  return { state: 'resolved', driver_id: linkedId };
}

function GFA_割当照合行_(sheet, key, id, fields, allowMissing = false) {
  const rows = sheet.getDataRange().getDisplayValues();
  const header = rows[0];
  const columns = [key, ...fields].map(field => {
    const indices = header.flatMap((value, index) => GFA_ID文字列_(value) === field ? [index] : []);
    if (indices.length !== 1) throw new Error('照合に必要な列を一意に特定できません');
    return indices[0];
  });
  const matches = rows.slice(1).filter(row => GFA_ID文字列_(row[columns[0]]) === id);
  if (allowMissing && matches.length === 0) return null;
  if (matches.length !== 1) throw new Error('照合対象を一意に特定できません');
  return Object.fromEntries(fields.map((field, index) =>
    [field, GFA_ID文字列_(matches[0][columns[index + 1]])]));
}

function GFA_ID文字列_(value) {
  return String(value ?? '').trim();
}

function GFA_割当照合シート_(book, name) {
  const sheet = book.getSheetByName(name);
  if (!sheet) throw Error('GF138との照合に必要なシートがありません: ' + name);
  return sheet;
}
```

### 既存の関数を更新

以下の7関数を、現行ファイルの同名関数と1つずつ置き換えます。現行ソースと [GitHubの差分](https://github.com/happysugar-system/gf-ledger/blob/test/vehicle-assignment-save/gas/waiting-assignment.patch) を照合し、既存の認証・権限チェックが差分の外にあることを確認してください。

#### `GFW_driverPlan_`

```javascript
function GFW_driverPlan_(person){
 const waiting=GFW_newSheet_(),h=GFW_headerMap_(waiting);
 if(h['LINE受付ID']===undefined||h['受付識別子']===undefined||h.DriverID===undefined)throw Error('LINE受付ID・受付識別子・DriverID列が必要です');
 const get=key=>waiting.getRange(person.sheetRow,h[key]+1).getDisplayValue().trim();
 const bookId=PropertiesService.getScriptProperties().getProperty('GFW_GF138_LINE_BOOK_ID');
 if(!bookId)throw Error('GF138のLINE受付ブック設定がありません');
 const identity=GFA_割当DriverIDを照合_(get('LINE受付ID'),get('DriverID'),{
  line:SpreadsheetApp.openById(bookId),vehicle:GFW_newBook_(),waitingKey:get('受付識別子')
 });
 if(identity.state!=='resolved')throw Error(identity.state==='registration_review_required'?'GF138の受付照合が要確認です':'GF138の登録完了を待っています');
 const sh=GFW_driverSheet_(),dh=GFW_headerMap_(sh);
 const ids=sh.getRange(2,dh.DriverID+1,sh.getLastRow()-1,1).getDisplayValues();
 const rows=ids.flatMap(([id],i)=>id.trim()===identity.driver_id?[i+2]:[]);
 if(rows.length!==1)throw Error('DriverIDが一意ではありません');
 return {sh,row:rows[0],id:identity.driver_id};
}
```

#### `GFW_割当本体_`

```javascript
function GFW_割当本体_(p){
 if(!p||!Number.isInteger(p.sourceRow)||typeof p.name!=='string'||typeof p.vehicleId!=='string')throw Error('割当データが不正です');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const matchesForReceipt=GFW_records_().filter(x=>x.sourceRow===p.sourceRow);
  if(matchesForReceipt.length!==1)throw Error('受付IDを一意に特定できません');
  const person=matchesForReceipt[0];
  if(!person||person.name!==p.name||['割当済み','取消','完了'].includes(person.status))throw Error('受付情報が変更済みです。再読み込みしてください');
  const s=GF_sheet_(),h=GF_headers_(s),required=['VehicleID','現在使用者','車番','区分/ステータス','DriverID','管理区分'];
  for(const name of required)if(!GF_col_(h,name))throw Error('車両台帳に必須列がありません: '+name);
  const n=s.getLastRow()-1;if(n<1)throw Error('車両台帳が空です');
  const ids=s.getRange(2,GF_col_(h,'VehicleID'),n,1).getDisplayValues().flat();
  const rows=ids.map((v,i)=>v===p.vehicleId?i+2:0).filter(Boolean);if(rows.length!==1)throw Error('VehicleIDが不明または重複しています');
  const row=rows[0],read=name=>s.getRange(row,GF_col_(h,name)).getDisplayValue().trim();
  if(read('区分/ステータス')!=='空車')throw Error('空車ではないため割当できません');
  if(read('現在使用者')||read('DriverID'))throw Error('既に使用者またはDriverIDがあります。上書きしません');
  const plate=read('車番');if(!plate)throw Error('車番が空欄です');
  const d=GFW_driverPlan_(person),dh=GFW_linkColumns_(d.sh);
  {const assigned=d.sh.getRange(d.row,dh['割当VehicleID']+1).getDisplayValue().trim();if(assigned&&assigned!==p.vehicleId)throw Error('このドライバーには別の車両が割当済みです: '+assigned);}
  const m=GFW_newSheet_(),mh=GFW_headerMap_(m),mr=person.sheetRow,log=GFW_logSheet_(),edits=[];
  const addV=(name,val)=>{const c=GF_col_(h,name);if(c)edits.push({sh:s,row,col:c,value:val});};
  const driverCol=GF_col_(h,'DriverID');
  if(s.getRange(2,driverCol,n,1).getDisplayValues().some(([id])=>id.trim()===d.id))throw Error('このドライバーは割当済みです');
  const previousManagement=read('管理区分');
  addV('現在使用者',person.name);addV('DriverID',d.id);addV('管理区分','車両準備中');
  for(const [name,val] of [['所属会社名',person.company],['稼働エリア',person.base]])if(val&&GF_col_(h,name)&&!read(name))addV(name,val);
  addV('更新日時',new Date());
  GFW_edit_(edits,d.sh,dh,d.row,'割当VehicleID',p.vehicleId);GFW_edit_(edits,d.sh,dh,d.row,'割当車番',plate);
  for(const [name,val] of [['DriverID',d.id],['ステータス','割当済み'],['割当VehicleID',p.vehicleId],['割当車番',plate],['割当日時',new Date()]])GFW_edit_(edits,m,mh,mr,name,val);
  const snap=GFW_snapshot_(edits);
  try{
   GFW_apply_(edits);
   log.appendRow([new Date(),person.sourceRow,person.name,person.company,person.base,p.vehicleId,plate,'','割当',JSON.stringify({driverId:d.id,driverCreated:false,previousManagement,memo:String(p.memo||'').slice(0,200)})]);
   SpreadsheetApp.flush();
  }catch(err){try{GFW_restore_(snap);SpreadsheetApp.flush();}catch(re){throw Error('割当処理が失敗し、復元にも失敗。手動確認が必要: '+err.message+' / '+re.message);}throw Error('割当失敗。変更を復元しました: '+err.message);}
  let queueId;
  try{queueId=GFW_queueAdd_(p.vehicleId,'割当',d.id);}
  catch(e){throw Error('割当保存済み／同期キュー登録失敗。再割当せず同期依頼を確認してください');}
  return {ok:true,name:person.name,plate,vehicleId:p.vehicleId,driverId:d.id,driverCreated:false,queueId};
 }finally{lock.releaseLock();}
}
```

#### `GFW_取消本体_`

```javascript
function GFW_取消本体_(p){
 if(!p||!Number.isInteger(p.sourceRow))throw Error('受付IDが不正です');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const matchesForReceipt=GFW_records_().filter(x=>x.sourceRow===p.sourceRow);
  if(matchesForReceipt.length!==1)throw Error('受付IDを一意に特定できません');
  const person=matchesForReceipt[0];if(!person)throw Error('受付が見つかりません');
  const latest=GFW_history_().filter(x=>x.sourceRow===p.sourceRow).slice(-1)[0];if(!latest||latest.action!=='割当')throw Error('取消可能な割当がありません');
  const s=GF_sheet_(),h=GF_headers_(s),n=s.getLastRow()-1,ids=s.getRange(2,GF_col_(h,'VehicleID'),n,1).getDisplayValues().flat();
  const rows=ids.map((x,i)=>x===latest.vehicleId?i+2:0).filter(Boolean);if(rows.length!==1)throw Error('対象車両が特定できません');
  const row=rows[0],val=name=>s.getRange(row,GF_col_(h,name)).getDisplayValue().trim();
  if(val('現在使用者')!==latest.name)throw Error('車両の現在使用者が変更されています。自動取消できません');
  const d=GFW_driverPlan_(person);
  if(val('DriverID')!==d.id||person.vehicleId!==latest.vehicleId)throw Error('割当のDriverIDまたはVehicleIDが一致しません');
  let assignment;
  try{assignment=JSON.parse(latest.memo);}catch(e){throw Error('割当履歴の確認が必要です');}
  if(!assignment||assignment.driverId!==d.id||typeof assignment.previousManagement!=='string'||val('管理区分')!=='車両準備中')
   throw Error('割当時の管理区分を確認してください');
  const dh=GFW_linkColumns_(d.sh),m=GFW_newSheet_(),mh=GFW_headerMap_(m),edits=[];
  const add=(sh,row,col,value)=>{if(col)edits.push({sh,row,col,value});};
  add(s,row,GF_col_(h,'現在使用者'),'');add(s,row,GF_col_(h,'DriverID'),'');
  add(s,row,GF_col_(h,'管理区分'),assignment.previousManagement);
  add(s,row,GF_col_(h,'更新日時'),new Date());
  if(d.sh.getRange(d.row,dh['割当VehicleID']+1).getDisplayValue().trim()===latest.vehicleId){GFW_edit_(edits,d.sh,dh,d.row,'割当VehicleID','');GFW_edit_(edits,d.sh,dh,d.row,'割当車番','');}
  for(const [name,value] of [['ステータス','名変待ち'],['割当VehicleID',''],['割当車番',''],['割当日時','']])GFW_edit_(edits,m,mh,person.sheetRow,name,value);
  const snap=GFW_snapshot_(edits);
  try{GFW_apply_(edits);GFW_logSheet_().appendRow([new Date(),person.sourceRow,person.name,person.company,person.base,latest.vehicleId,latest.plate,latest.name,'取消',String(p.memo||'').slice(0,500)]);SpreadsheetApp.flush();}
  catch(err){GFW_restore_(snap);SpreadsheetApp.flush();throw Error('取消失敗。変更を復元しました: '+err.message);}
  let queueId;
  try{queueId=GFW_queueAdd_(latest.vehicleId,'取消','');}
  catch(e){throw Error('取消保存済み／同期キュー登録失敗。再取消せず同期依頼を確認してください');}
  return {ok:true,vehicleId:latest.vehicleId,queueId};
 }finally{lock.releaseLock();}
}
```

#### `GF_WAIT_割当済み同期依頼を登録`

```javascript
function GF_WAIT_割当済み同期依頼を登録(){
 const rows=GFW_records_().filter(x=>x.status==='割当済み'&&x.vehicleId),sh=GF_sheet_(),h=GF_headers_(sh),n=sh.getLastRow()-1;
 if(n<1)return {registered:0,skipped:rows.length};
 const data=sh.getRange(2,1,n,h.length).getDisplayValues(),ix=nm=>GF_col_(h,nm)-1;
 const queued=GFW_queueSheet_(),q=queued.getLastRow()>1?queued.getRange(2,1,queued.getLastRow()-1,9).getDisplayValues():[];
 let registered=0,skipped=0;
 for(const p of rows){
  const matches=data.filter(r=>r[ix('VehicleID')]===p.vehicleId);
  if(matches.length!==1||matches[0][ix('現在使用者')]!==p.name||!matches[0][ix('DriverID')]){skipped++;Logger.log('要確認：'+p.name+' / '+p.vehicleId);continue;}
  if(q.some(r=>r[2]===p.vehicleId&&r[3]==='割当'&&['待機','実行中','完了'].includes(r[5]))){skipped++;continue;}
  const did=matches[0][ix('DriverID')]||'';
  GFW_queueAdd_(p.vehicleId,'割当',did);registered++;
  if(did){try{GFW_linkDriver_(p.vehicleId,did);}catch(e){Logger.log('リンク未設定 '+p.vehicleId+': '+e.message);}}
 }
 Logger.log('同期依頼登録='+registered+' / スキップ='+skipped);
 return {registered,skipped};
}
```

#### `GF_名変待ち一覧取得`

```javascript
function GF_名変待ち一覧取得(){const all=GFW_records_(),history=GFW_history_();const waiting=all.filter(x=>!['割当済み','取消','完了'].includes(x.status));const sh=GF_sheet_(),h=GF_headers_(sh),vinCol=GF_col_(h,'車体番号');const vinValues=vinCol&&sh.getLastRow()>1?sh.getRange(2,vinCol,sh.getLastRow()-1,1).getDisplayValues().flat():[];const freeIds=new Set(sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getDisplayValues().filter(r=>!r[GF_col_(h,'DriverID')-1]&&!r[GF_col_(h,'現在使用者')-1]).map(r=>r[GF_col_(h,'VehicleID')-1]):[]);const cars=GF_一覧取得().cars.filter(x=>String(x.status||'').trim()==='空車'&&freeIds.has(x.id)).map(x=>({id:x.id,plate:x.plate,region:x.region,group:x.group,vin:vinCol?String(vinValues[x.row-2]||'').trim():''}));return {waiting,history:history.filter(x=>x.action==='割当'||x.action==='取消').reverse().slice(0,200),cars};}
```

#### `GF_名変待ち割当取消`

```javascript
function GF_名変待ち割当取消(p){
 const result=GFW_取消本体_(p);
 return result;
}
```

#### `GF_名変待ち車両割当`

```javascript
function GF_名変待ち車両割当(p){
 // 既存の割当本体で車両台帳・ドライバーマスター・名変待ち管理を更新
 const result=GFW_割当本体_(p);
 try{GFW_linkDriver_(result.vehicleId,result.driverId);result.link='設定済み';}
 catch(e){result.link='リンク未設定: '+e.message;Logger.log(result.link);}
 return result;
}
```

## 3. 車両同期側

`30_車両同期.gs` の `車両台帳の1台を同期する` だけに [GitHubの差分](https://github.com/happysugar-system/gf-ledger/blob/test/vehicle-assignment-save/gas/assignment-sync-preserve-status.patch) の最初の4箇所を適用します。第3引数 `名変割当`、台帳の再照合、貸出中への自動変更の分岐、独自採番へのフォールバックを止める分岐です。続いて `154_名変待ち同期_車両管理側.gs` の下記関数を置き換えます。

```javascript
function GF154_名変待ち同期キューを処理する(){
  if(typeof 車両台帳の1台を同期する!=='function')throw Error('30_車両同期.gs と同じGASプロジェクトに配置してください');
  const {q,v}=GF154_シート取得_();
  const result={completed:0,skipped:0,review:0};
  if(q.getLastRow()<2)return result;
  const all=q.getRange(2,1,q.getLastRow()-1,9).getDisplayValues();
  const latest=new Map();all.forEach((r,i)=>{if(r[2]&&['割当','取消'].includes(r[3]))latest.set(String(r[2]).trim(),i);});
  let handled=0;
  for(let i=0;i<all.length&&handled<5;i++){
    const item=all[i];if(item[5]!=='待機')continue;
    handled++;
    const sheetRow=i+2,vehicleId=String(item[2]||'').trim(),action=String(item[3]||'').trim();
    // 同時起動時の二重処理防止。車両同期本体を呼ぶ前に必ず解放する。
    const lock=LockService.getScriptLock();if(!lock.tryLock(1000))break;
    let claimed=false;
    try{
      if(q.getRange(sheetRow,6).getDisplayValue().trim()!=='待機')continue;
      q.getRange(sheetRow,6).setValue('実行中');
      q.getRange(sheetRow,7).setValue(Number(item[6]||0)+1);
      q.getRange(sheetRow,8).setValue(new Date());
      SpreadsheetApp.flush();claimed=true;
    }finally{lock.releaseLock();}
    if(!claimed)continue;
    try{
      if(!vehicleId||!['割当','取消'].includes(action))throw Error('キュー内容が不正');
      // 最新の依頼のみ処理。古い割当を取消後に復活させない。
      if(latest.get(vehicleId)!==i){q.getRange(sheetRow,6).setValue('スキップ');q.getRange(sheetRow,9).setValue('同じ車両の新しい依頼あり');result.skipped++;continue;}
      let state=GF154_車両状態_(v,vehicleId);
      if(action==='割当'){
        if(!item[4]||state.driverId!==String(item[4]).trim()||!state.name)throw Error('割当後の台帳とDriverID/使用者が一致しません');
      }else if(state.driverId||state.name)throw Error('取消後の台帳にDriverIDまたは使用者が残っています');
      // この関数は自分でScriptLockを取得する。ここではロックを保持していない。
      const statusBeforeSync = state.status;
      車両台帳の1台を同期する(state.row, true, {
        vehicleId,
        driverId: action === '割当' ? String(item[4]).trim() : '',
        status: statusBeforeSync,
      });
      // 同期中にスタッフが再割当した場合は完了扱いにしない。
      state=GF154_車両状態_(v,vehicleId);
      if (state.status !== statusBeforeSync) throw Error('車両ステータスが同期中に変更されました');
      if(action==='割当'&&state.driverId!==String(item[4]).trim())throw Error('同期後に割当先が変更されました');
      if(action==='取消'&&(state.driverId||state.name))throw Error('同期後に車両が再割当されました');
      q.getRange(sheetRow,6).setValue('完了');
      q.getRange(sheetRow,9).setValue('車両管理3シートへの同期完了（Supabase反映は別途確認）');
      result.completed++;
    }catch(e){
      q.getRange(sheetRow,6).setValue('要確認');
      q.getRange(sheetRow,9).setValue(String(e.message||e).slice(0,500));
      result.review++;
    }
  }
  Logger.log(JSON.stringify(result));return result;
}
```

## 4. 通常ブラウザでの確認

1. 保存後、車両同期側で `GF154_環境確認_読取専用` を実行します。接続先がテスト台帳で、車両台帳・同期関数・キュー・キュー見出しが確認できることを確認します。
2. 検証用Webアプリが存在し、既存画面が `GF_名変待ち一覧取得`、`GF_名変待ち車両割当`、`GF_名変待ち割当取消` を呼んでいる場合は、その検証用アプリのテストデプロイを開きます。これらを呼ぶ画面が存在しない場合は、管理画面側の接続が残っています。
3. 2つのテスト受付で同じ空車を選んで割り当てます。1件だけ成功し、A列が割当前と同じ、B列が「車両準備中」、DriverIDがGF138履歴と一致することを確認します。再読み込み後に同じ割当が表示され、その車両が空車候補から外れていることを確認します。
4. テスト用キューをGF154で処理し、テスト専用Supabaseの車両行を読み戻します。A列、B列、DriverIDが台帳と一致していることを確認します。GF154の「完了」はスプレッドシート側の同期結果です。
5. 検証画面から取消し、A列維持・B列復元・DriverID解除を確認します。GF154処理後にテスト用Supabaseの値も照合します。旧履歴で割当前のB列が記録されていない場合は、取消を自動実行せず確認を求めます。

既存の割当デモは今回の更新結果の確認には使えません。最新の検証画面URL、GAS上のエラー、または検証結果を共有する場合は、個人情報・トークン・キーを除いてください。
