/**
 * GOLD FIRST / 98_安全な保存速度テスト.gs
 * 既存の20/30/99番には手を加えない独立診断。
 * 本番スプレッドシート、車両台帳、登録キュー、既存Drive書類には一切アクセスしない。
 * テスト専用のスプレッドシートとDriveフォルダを新規作成し、成功時はゴミ箱へ移動。
 * 失敗時は調査用に残し、URL/IDを実行ログへ出す。
 * ※GASからのサーバー側速度のみ。スマホの通信時間、画像加工時間、実際のキュー/全同期速度は含まない。
 */
function GF_安全テスト_1台() { return GF_安全テストを実行_98(1); }
function GF_安全テスト_5台() { return GF_安全テストを実行_98(5); }
function GF_安全テスト_10台() { return GF_安全テストを実行_98(10); }

function GF_安全テストを実行_98(台数) {
  if (![1,5,10].includes(台数)) throw new Error('台数は1、5、10のいずれかにしてください。');
  const started = Date.now();
  const id = Utilities.getUuid().slice(0,8);
  const name = '_GF_安全速度テスト_'+id;
  let ss = null, folder = null;
  const results = [], failures = [];
  let clean = false;
  console.log('=== GOLD FIRST 安全な保存速度テスト / '+台数+'台 ===');
  console.log('本番の台帳・キュー・Drive書類は変更しません。');
  try {
    const initStart = Date.now();
    ss = SpreadsheetApp.create(name);
    folder = DriveApp.createFolder(name);
    const sheet = ss.getSheets()[0];
    sheet.setName('テスト専用台帳');
    sheet.getRange(1,1,1,5).setValues([['テストID','車番','状態','写真保存枚数','保存確認']]);
    console.log('テスト環境作成: '+(Date.now()-initStart)+'ms');
    console.log('テストスプシ: '+ss.getUrl());
    console.log('テストDriveフォルダID: '+folder.getId());

    // 実物の車検証・免許証は使用しない。サイズは小さなダミー画像。
    // 大きな写真を扱う実運用とは転送時間が異なる。
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
    const pngBytes = Utilities.base64Decode(pngBase64);
    const expectedMd5 = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,pngBytes));
    for (let i=1; i<=台数; i++) {
      const record = {番号:i, 台帳ms:0, 写真ms:0, 確認ms:0, 写真枚数:0, 成功:false};
      const vehicle = 'TEST-'+id+'-'+String(i).padStart(3,'0');
      const plate = 'テスト-'+String(i).padStart(2,'0');
      try {
        let t = Date.now();
        sheet.getRange(i+1,1,1,5).setValues([[vehicle,plate,'テスト受付',0,'未確認']]);
        SpreadsheetApp.flush();
        record.台帳ms = Date.now()-t;

        t = Date.now();
        const vehicleFolder = folder.createFolder(vehicle);
        for (let p=1;p<=3;p++) {
          const fname='ダミー書類_'+String(p).padStart(2,'0')+'.png';
          vehicleFolder.createFile(Utilities.newBlob(pngBytes,'image/png',fname));
        }
        record.写真ms = Date.now()-t;

        t = Date.now();
        const files = vehicleFolder.getFiles();
        const found = {};
        while (files.hasNext()) {
          const f=files.next(), fname=f.getName();
          const bytes=f.getBlob().getBytes();
          const digest=Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,bytes));
          if (digest !== expectedMd5) throw new Error('写真の内容不一致: '+fname);
          if (found[fname]) throw new Error('写真の重複: '+fname);
          found[fname]=true;
        }
        record.写真枚数=Object.keys(found).length;
        for(let p=1;p<=3;p++) {
          const fname='ダミー書類_'+String(p).padStart(2,'0')+'.png';
          if(!found[fname])throw new Error('写真が不足: '+fname);
        }
        if(record.写真枚数!==3)throw new Error('写真枚数が3枚ではありません: '+record.写真枚数);
        sheet.getRange(i+1,4,1,2).setValues([[3,'確認済み']]);
        SpreadsheetApp.flush();
        const row=sheet.getRange(i+1,1,1,5).getValues()[0];
        if(String(row[0])!==vehicle || Number(row[3])!==3 || String(row[4])!=='確認済み') {
          throw new Error('スプレッドシートの読み戻し結果が不一致');
        }
        record.確認ms=Date.now()-t;
        record.成功=true;
        console.log('【'+i+'台目】成功 / 台帳='+record.台帳ms+'ms / 写真3枚='+record.写真ms+'ms / 読戻し確認='+record.確認ms+'ms');
      } catch(e) {
        failures.push({台:i,内容:String(e&&e.stack||e)});
        console.error('【'+i+'台目】失敗: '+String(e&&e.stack||e));
      }
      results.push(record);
    }
    const ok=results.filter(r=>r.成功).length;
    console.log('=== 集計 ===');
    console.log('成功='+ok+'/'+台数+'台 / 失敗='+failures.length+'台 / 写真確認='+results.reduce((a,r)=>a+r.写真枚数,0)+'/'+(台数*3)+'枚');
    console.log('台帳保存合計='+results.reduce((a,r)=>a+r.台帳ms,0)+'ms');
    console.log('写真保存合計='+results.reduce((a,r)=>a+r.写真ms,0)+'ms');
    console.log('読戻し確認合計='+results.reduce((a,r)=>a+r.確認ms,0)+'ms');
    console.log('全体経過='+((Date.now()-started)/1000).toFixed(2)+'秒');
    clean = ok===台数 && failures.length===0;
    return {台数:台数,成功:ok,失敗:failures,結果:results,全体秒:Number(((Date.now()-started)/1000).toFixed(2)),テストスプシURL:ss.getUrl(),テストDriveフォルダID:folder.getId(),成功時ゴミ箱へ移動:clean};
  } finally {
    if(clean) {
      // 成功時のみテストデータをゴミ箱へ。完全削除はしない。
      try { if(folder)folder.setTrashed(true); } catch(e) {console.warn('テストフォルダ片付け失敗: '+e);}
      try { if(ss)DriveApp.getFileById(ss.getId()).setTrashed(true); } catch(e) {console.warn('テストスプシ片付け失敗: '+e);}
      console.log('全件成功のためテスト用ファイルをゴミ箱へ移動しました。');
    } else {
      console.warn('未完了または異常があるため、テストファイルを残しました。');
      if(ss)console.warn('確認用スプシ: '+ss.getUrl());
      if(folder)console.warn('確認用フォルダID: '+folder.getId());
    }
  }
}

/**
 * GOLD FIRST / 97_本番処理_安全診断.gs
 * 既存の20/30/99番は変更しない。
 * 本番データは読み取り専用。登録・同期・写真保存・トリガー作成・状態変更を行わない。
 * 実際のスマホ通信や書込み・PDF生成の速度はこのテストでは測れない。
 * ※対象スプレッドシートを開く_() が読み取り専用である前提。
 */
function GF_安全診断_本番の読み取り速度() {
  const allStart = Date.now();
  const out = {成功:false,計測:{},件数:{},注意:[]};
  const measure = (name,fn) => {
    const t=Date.now();
    try {const result=fn();out.計測[name+'ms']=Date.now()-t;return result;}
    catch(e){out.計測[name+'ms']=Date.now()-t;out.注意.push(name+': '+String(e&&e.message||e));return null;}
  };
  console.log('=== GOLD FIRST 本番・読み取り専用診断 ===');
  console.log('車両登録・キュー実行・写真保存・Drive変更・シート変更はしません。');
  try {
    const ss=measure('対象スプシを開く',()=>対象スプレッドシートを開く_());
    if(!ss)throw new Error('対象スプシを開けません。');
    const ledger=measure('車両台帳を取得',()=>ss.getSheetByName(シート名.車両台帳));
    if(!ledger)throw new Error('車両台帳が見つかりません。');
    const head=measure('車両台帳ヘッダー取得',()=>ledger.getRange(1,1,1,ledger.getLastColumn()).getDisplayValues()[0]);
    if(!head)throw new Error('車両台帳ヘッダーを取得できません。');
    const col={};head.forEach((v,i)=>{if(v)col[String(v).trim()]=i+1;});
    const n=Math.max(0,ledger.getLastRow()-1);
    out.件数.車両台帳のデータ行数=n;
    if(col['VehicleID']){
      const ids=measure('VehicleID列を一括取得',()=>n?ledger.getRange(2,col['VehicleID'],n,1).getDisplayValues():[]);
      if(ids){out.件数.VehicleIDあり=ids.filter(r=>String(r[0]||'').trim()).length;
        const last=ids.slice().reverse().find(r=>/^V\d{6}$/.test(String(r[0]||'')));
        if(last)console.log('既存VehicleID形式の確認: OK（値は表示しません）');
      }
    }else out.注意.push('VehicleID列がありません。');
    if(col['車番']){
      const plates=measure('車番列を一括取得',()=>n?ledger.getRange(2,col['車番'],n,1).getDisplayValues():[]);
      if(plates)out.件数.車番あり=plates.filter(r=>String(r[0]||'').trim()).length;
    }else out.注意.push('車番列がありません。');
    const q=measure('登録キューシートを取得',()=>ss.getSheetByName('_登録キュー'));
    if(q){
      const qn=Math.max(0,q.getLastRow()-1);
      out.件数.キュー総数=qn;
      const rows=measure('登録キュー状態を一括取得',()=>qn?q.getRange(2,9,qn,1).getDisplayValues():[]);
      if(rows){const counts={};rows.forEach(r=>{const s=String(r[0]||'未設定');counts[s]=(counts[s]||0)+1;});out.件数.キュー状態別=counts;}
    }else out.注意.push('登録キューシートがありません。');
    const props=measure('キュー制御フラグ取得',()=>{
      const p=PropertiesService.getScriptProperties();
      return {連続処理:p.getProperty('GF_QUEUE_CONTINUOUS')==='1',受付のみ:p.getProperty('GF_QUEUE_INTAKE_ONLY')==='1',保留フラグ:p.getProperty('GF_QUEUE_PENDING')||'未設定',実行フラグあり:!!p.getProperty('GF_QUEUE_WORKER_RUNNING')};
    });
    if(props)out.件数.キュー制御=props;
    const triggers=measure('キュートリガーを確認',()=>ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='GF_登録キューワーカー').length);
    if(triggers!==null)out.件数.登録キュートリガー数=triggers;
    out.件数.必要関数の存在={
      車両登録:typeof スマホから新規車両を登録する==='function',
      キュー受付:typeof スマホ車両登録を先に受付する==='function',
      画像保存:typeof スマホ車両登録キューへ書類を保存する==='function',
      登録後処理:typeof スマホ新規車両登録後処理を実行する==='function',
      車両同期:typeof 車両台帳の1台を同期する==='function'
    };
    out.成功=true;
  }catch(e){out.注意.push('診断中断: '+String(e&&e.stack||e));}
  out.計測.診断全体ms=Date.now()-allStart;
  console.log('=== 診断結果（個人情報は表示しません） ===');
  console.log(JSON.stringify(out,null,2));
  console.log('※これは読み取り処理の実測です。実際の登録・同期・写真送信時間は測っていません。');
  return out;
}

/**
 * GOLD FIRST / 96_登録キュー受付速度_安全テスト.gs
 * 本番キューには一切触れない、独立した受付処理の速度テスト。
 * 99番の「既存受付検索→受付行追加→JobID検索→状態更新」に近い操作を
 * テスト専用スプレッドシートで測定します。
 * 実際の99番関数・トリガー・本番Drive・ScriptPropertiesは呼びません。
 * 画像送信、ロック競合、実際の登録・同期の速度は測定できません。
 */
function GF_安全テスト_受付キュー速度() {
  const start = Date.now();
  let ss = null;
  let succeeded = false;
  const timings = {};
  const stamp = (label, fn) => {
    const t = Date.now();
    const value = fn();
    timings[label] = Date.now() - t;
    return value;
  };
  console.log('=== GOLD FIRST 受付キュー速度・安全テスト ===');
  console.log('本番台帳・本番キュー・本番Drive・トリガー・設定値は変更しません。');
  try {
    ss = stamp('テスト用スプシ作成ms', () => SpreadsheetApp.create('_GF_安全テスト_受付速度_' + Date.now()));
    const sheet = ss.getSheets()[0];
    sheet.setName('_登録キュー_テスト');
    const headers = ['JobID','受付日時','種別','VehicleID','行番号','車番/氏名',
      'DriverID','一時フォルダID','状態','エラー','開始日時','完了日時','処理段階','処理トークン'];
    stamp('見出し作成ms', () => sheet.getRange(1, 1, 1, 14).setValues([headers]));
    const historical = Array.from({length:183}, (_, i) => [
      'DONE-TEST-' + (i+1), new Date(), '車両', 'VTEST'+i, i+2,
      'テスト車番'+i, '', '', '完了', '', '', new Date(), '完了', ''
    ]);
    stamp('完了履歴183件の準備ms', () => {
      sheet.getRange(2,1,historical.length,14).setValues(historical);
      SpreadsheetApp.flush();
    });
    const vehicleId = 'V-TEST-NEW-' + Date.now();
    const jobId = 'VQ-TEST-' + Utilities.getUuid().slice(0,8);
    stamp('既存受付の重複検索ms', () => {
      const count = sheet.getLastRow()-1;
      const existing = sheet.getRange(2,1,count,14).getValues().find(r =>
        String(r[2])==='車両' && String(r[3])===vehicleId && String(r[8])!=='完了');
      if (existing) throw new Error('テストIDが既存受付と重複しました');
    });
    stamp('受付行追加とflush_ms', () => {
      sheet.appendRow([jobId,new Date(),'車両',vehicleId,999,'テスト車番','', '',
        '画像待ち','','','','','']);
      SpreadsheetApp.flush();
    });
    const foundRow = stamp('JobID検索ms', () => {
      const last = sheet.getLastRow();
      const ids = sheet.getRange(2,1,last-1,1).getDisplayValues();
      const index = ids.findIndex(r=>String(r[0]).trim()===jobId);
      return index < 0 ? 0 : index + 2;
    });
    if (!foundRow) throw new Error('追加したJobIDが見つかりません');
    stamp('受付状態の更新とflush_ms', () => {
      sheet.getRange(foundRow,9,1,6).setValues([['待機','',new Date(),'','同期待ち','']]);
      SpreadsheetApp.flush();
    });
    stamp('保存結果の読み戻しms', () => {
      const data=sheet.getRange(foundRow,1,1,14).getValues()[0];
      if (String(data[0])!==jobId || String(data[3])!==vehicleId || String(data[8])!=='待機') {
        throw new Error('読み戻し検証に失敗しました');
      }
    });
    succeeded = true;
    console.log('結果: 成功（テスト受付1件、履歴183件）');
    console.log(JSON.stringify(timings,null,2));
    console.log('テスト全体ms='+(Date.now()-start));
    console.log('※これは独立した模擬受付テストです。本番の99番関数の実測ではありません。');
  } catch(e) {
    console.error('テスト失敗: '+String(e && e.stack || e));
    throw e;
  } finally {
    if(ss) {
      try {
        // 失敗時もテスト専用ファイルだけを残し、調査できるようにする。
        if(succeeded) {
          DriveApp.getFileById(ss.getId()).setTrashed(true);
          console.log('テスト用スプシをゴミ箱へ移動しました。');
        } else {
          console.warn('失敗したためテスト用スプシを残しました。ID='+ss.getId());
        }
      } catch(cleanupError) {
        console.warn('テスト用ファイルの片付け失敗: '+cleanupError);
      }
    }
  }
}

/**
 * GOLD FIRST / 95_写真保存_安全診断.gs
 * 読み取り専用。キュー・Drive・プロパティ・トリガーを変更しません。
 * 実行関数: GF_安全診断_写真受付の整合性
 * 車両=3枚、免許証=2枚。画像の内容・個人情報・IDはログに出しません。
 */
function GF_安全診断_写真受付の整合性() {
  const started = Date.now();
  console.log('=== GOLD FIRST 写真受付の整合性診断（読み取り専用） ===');
  const sheet = GF_登録キューシートを取得する_();
  const last = sheet.getLastRow();
  const summary = {
    受付総数: Math.max(0, last - 1),
    一時フォルダIDあり: 0,
    一時フォルダが存在: 0,
    一時フォルダが見つからない: 0,
    一時フォルダの写真枚数不一致: 0,
    空ファイルあり: 0,
    写真確認済み: 0,
    確認できない完了受付: 0,
    状態別: {},
    要確認件数: 0
  };
  if (last < 2) { console.log(JSON.stringify(summary, null, 2)); return summary; }
  const rows = sheet.getRange(2, 1, last - 1, 14).getValues();
  rows.forEach((r, index) => {
    const type = String(r[2] || '');
    const state = String(r[8] || '');
    const folderId = String(r[7] || '').trim();
    const expected = type === '車両' ? 3 : type === 'ドライバー' ? 2 : 0;
    summary.状態別[state] = (summary.状態別[state] || 0) + 1;
    if (!folderId || !expected) {
      // 完了後は一時フォルダが削除される設計の可能性があるため、未確認を異常扱いしない。
      if (state === '完了' && expected) summary.確認できない完了受付++;
      return;
    }
    summary.一時フォルダIDあり++;
    try {
      const folder = DriveApp.getFolderById(folderId);
      if (folder.isTrashed()) throw new Error('フォルダはゴミ箱内');
      summary.一時フォルダが存在++;
      const files = folder.getFiles();
      let count = 0, empty = 0;
      while (files.hasNext()) {
        const file = files.next();
        if (file.isTrashed()) continue;
        count++;
        if (file.getSize() <= 0) empty++;
      }
      if (count !== expected) {
        summary.一時フォルダの写真枚数不一致++;
        summary.要確認件数++;
        console.log('要確認: キュー行=' + (index + 2) + ' / 状態=' + state + ' / 期待=' + expected + '枚 / 実際=' + count + '枚');
      } else if (empty) {
        summary.空ファイルあり += empty;
        summary.要確認件数++;
        console.log('要確認: キュー行=' + (index + 2) + ' / 空ファイル=' + empty + '枚');
      } else {
        summary.写真確認済み++;
      }
    } catch (e) {
      summary.一時フォルダが見つからない++;
      summary.要確認件数++;
      console.log('要確認: キュー行=' + (index + 2) + ' / 状態=' + state + ' / 一時フォルダにアクセスできません');
    }
  });
  console.log('=== 集計（個人情報・IDなし） ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('経過ms=' + (Date.now() - started));
  console.log('注意: 完了済みの正式Drive保存先は検査していません。一時フォルダが削除済みの場合、過去の写真の保存成功は判定できません。');
  console.log('注意: ファイルの中身が正常な画像かどうかは検査していません。');
  return summary;
}

/**
 * GOLD FIRST / 94_正式Drive保存先_安全診断.gs
 * 読み取り専用。車両台帳の「車両フォルダ」の実リンクを取得して確認。
 * 通常URL、リッチテキストリンク、HYPERLINK式、フォルダIDに対応。
 * 車両・写真・キュー・設定・トリガーを変更しません。
 * 実行関数: GF_安全診断_正式Drive保存先
 */
function GF_安全診断_正式Drive保存先() {
  const started = Date.now();
  console.log('=== GOLD FIRST 正式Drive保存先・読み取り専用診断（リンク対応版） ===');
  const ss = 対象スプレッドシートを開く_();
  const sheet = ss.getSheetByName('車両台帳');
  if (!sheet) throw new Error('車両台帳が見つかりません。');
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('車両台帳が空です。');
  const headers = values[0].map(v => String(v || '').trim());
  const idCol = headers.indexOf('VehicleID');
  const folderCol = headers.indexOf('車両フォルダ');
  if (idCol < 0 || folderCol < 0) throw new Error('VehicleID または 車両フォルダ列が見つかりません。');

  // フォルダ列だけを取得。セル表示値だけでなくリンク先・数式も調べる。
  const n = Math.max(0, values.length - 1);
  const folderRange = n ? sheet.getRange(2, folderCol + 1, n, 1) : null;
  const richValues = folderRange ? folderRange.getRichTextValues() : [];
  const formulas = folderRange ? folderRange.getFormulas() : [];
  const summary = {
    車両IDあり:0, 車両フォルダリンクあり:0, 車両フォルダリンクなし:0,
    車両フォルダ確認成功:0, 車両フォルダ確認不可:0,
    車両書類フォルダあり:0, 車両書類フォルダなし:0,
    車両書類フォルダ内ファイルあり:0, 車両書類フォルダ内ファイルなし:0,
    車両書類内のファイル合計:0, 空ファイル:0,
    車両書類フォルダ内3件以上:0, 車両書類フォルダ内3件未満:0,
    リンク取得方法別:{表示値:0,リッチテキスト:0,数式:0,取得不可:0},
    要個別確認の台帳行:[]
  };
  const MAX_DETAILS = 25;
  function flag(row, reason) {
    if (summary.要個別確認の台帳行.length < MAX_DETAILS) {
      summary.要個別確認の台帳行.push({台帳行:row,理由:reason});
    }
  }
  function folderIdFromText(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    // URLに含まれるフォルダID、?id=、またはIDのみのセルに対応。
    let m = s.match(/(?:\/folders\/|[?&]id=)([-\w]{20,})/i);
    if (m) return m[1];
    m = s.match(/^[-\w]{20,}$/);
    return m ? m[0] : '';
  }
  function getFolderId(i) {
    const cell = values[i][folderCol];
    let id = folderIdFromText(cell);
    if (id) return {id:id,method:'表示値'};
    const rich = richValues[i-1] && richValues[i-1][0];
    if (rich) {
      const urls = [];
      if (rich.getLinkUrl()) urls.push(rich.getLinkUrl());
      // リンクがテキストの一部分だけに付いているケースにも対応。
      const runs = rich.getRuns();
      for (let j = 0; j < runs.length; j++) {
        if (runs[j].getLinkUrl()) urls.push(runs[j].getLinkUrl());
      }
      for (let j = 0; j < urls.length; j++) {
        id = folderIdFromText(urls[j]);
        if (id) return {id:id,method:'リッチテキスト'};
      }
    }
    const formula = String((formulas[i-1] && formulas[i-1][0]) || '');
    if (formula) {
      // HYPERLINK("https://drive.google.com/drive/folders/ID", "表示名")
      // などの式からフォルダURLを抽出（式は実行しない）。
      id = folderIdFromText(formula.match(/https?:\/\/[^"'\s,)]+/i)?.[0] || '');
      if (id) return {id:id,method:'数式'};
    }
    return {id:'',method:'取得不可'};
  }

  for (let i = 1; i < values.length; i++) {
    if (!String(values[i][idCol] || '').trim()) continue;
    summary.車両IDあり++;
    const raw = String(values[i][folderCol] || '').trim();
    const rich = richValues[i-1] && richValues[i-1][0];
    const formula = String((formulas[i-1] && formulas[i-1][0]) || '');
    const hasLinkCell = Boolean(raw || formula || (rich && (rich.getLinkUrl() || rich.getRuns().some(r => r.getLinkUrl()))));
    if (!hasLinkCell) {
      summary.車両フォルダリンクなし++;
      flag(i+1,'車両フォルダ欄が空です');
      continue;
    }
    summary.車両フォルダリンクあり++;
    const info = getFolderId(i);
    summary.リンク取得方法別[info.method]++;
    if (!info.id) {
      summary.車両フォルダ確認不可++;
      flag(i+1,'リンク先のフォルダIDを取得できません');
      continue;
    }
    try {
      const folder = DriveApp.getFolderById(info.id);
      if (folder.isTrashed()) throw new Error('ゴミ箱内');
      summary.車両フォルダ確認成功++;
      const dirs = folder.getFoldersByName('車両書類');
      let dirCount = 0, count = 0;
      while (dirs.hasNext()) {
        const dir = dirs.next();
        if (dir.isTrashed()) continue;
        dirCount++;
        const files = dir.getFiles();
        while (files.hasNext()) {
          const file = files.next();
          if (file.isTrashed()) continue;
          count++;
          if (file.getSize() <= 0) summary.空ファイル++;
        }
      }
      if (!dirCount) {
        summary.車両書類フォルダなし++;
        flag(i+1,'車両書類フォルダなし');
        continue;
      }
      summary.車両書類フォルダあり++;
      summary.車両書類内のファイル合計 += count;
      if (count) summary.車両書類フォルダ内ファイルあり++;
      else {
        summary.車両書類フォルダ内ファイルなし++;
        flag(i+1,'車両書類フォルダ内にファイルなし');
      }
      if (count >= 3) summary.車両書類フォルダ内3件以上++;
      else summary.車両書類フォルダ内3件未満++;
    } catch (e) {
      summary.車両フォルダ確認不可++;
      flag(i+1,'車両フォルダにアクセスできません');
    }
  }
  console.log('=== 集計（個人情報・フォルダIDは表示しません） ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('診断経過ms='+(Date.now()-started));
  console.log('注意: 「車両書類」フォルダ直下のみ確認。サブフォルダ・PDF内画像・免許証フォルダは対象外です。');
  console.log('注意: ファイル数だけでは登録時の写真がすべて正しく保存されたと証明できません。');
  console.log('注意: 全車両のDrive照会には数分かかる場合があります。');
  return summary;
}

/**
 * GOLD FIRST / 88_正式書類保存_安全テスト.gs
 * 既存車両の正式保存先を1台だけ読み取り検査する。
 * 台帳・Driveの作成、変更、削除、PDF生成、キュー操作は一切行わない。
 */
function GF_安全テスト_正式書類保存を確認する() {
  const 開始 = Date.now();
  const 結果 = { 成功: false, 確認した車両数: 0, 画像: {}, PDF: {}, 注意: [] };
  const ss = 対象スプレッドシートを開く_();
  const sheet = 必須シートを取得する_(ss, シート名.車両台帳);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('車両台帳にデータがありません。');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const idCol = headers.indexOf('VehicleID') + 1;
  const folderCol = headers.indexOf('車両フォルダ') + 1;
  if (!idCol || !folderCol) throw new Error('VehicleIDまたは車両フォルダ列が見つかりません。');
  const count = lastRow - 1;
  const ids = sheet.getRange(2, idCol, count, 1).getDisplayValues();
  const cellRange = sheet.getRange(2, folderCol, count, 1);
  const display = cellRange.getDisplayValues();
  const rich = cellRange.getRichTextValues();
  const formulas = cellRange.getFormulas();
  let target = null;
  for (let i = 0; i < count; i++) {
    if (!String(ids[i][0]).trim()) continue;
    const candidates = [display[i][0], rich[i][0] && rich[i][0].getLinkUrl(), formulas[i][0]];
    if (rich[i][0]) {
      rich[i][0].getRuns().forEach(r => candidates.push(r.getLinkUrl()));
    }
    let folderId = '';
    for (const candidate of candidates) {
      const s = String(candidate || '');
      const m = s.match(/(?:\/folders\/|[?&]id=)([-\w]{20,})/) || s.match(/^[-\w]{20,}$/) || s.match(/https?:\/\/[^"'\s,)]+/);
      if (m) {
        const raw = m[1] || m[0];
        const inner = raw.match(/(?:\/folders\/|[?&]id=)([-\w]{20,})/);
        if (inner || /^[-\w]{20,}$/.test(raw)) { folderId = inner ? inner[1] : raw; break; }
      }
    }
    if (folderId) { target = { folderId, row: i + 2 }; break; }
  }
  if (!target) throw new Error('車両フォルダへのリンクを取得できませんでした。');
  const vehicle = DriveApp.getFolderById(target.folderId);
  const docIt = vehicle.getFoldersByName('車両書類');
  if (!docIt.hasNext()) throw new Error('車両書類フォルダが見つかりません。');
  const basicIt = docIt.next().getFoldersByName('基本書類');
  if (!basicIt.hasNext()) throw new Error('基本書類フォルダが見つかりません。');
  const basic = basicIt.next();
  const files = basic.getFiles();
  const byName = {};
  let total = 0, empty = 0;
  while (files.hasNext()) {
    const f = files.next();
    if (f.isTrashed()) continue;
    total++;
    const name = f.getName();
    const size = f.getSize();
    if (size <= 0) empty++;
    (byName[name] = byName[name] || []).push({ size, type: f.getMimeType() });
  }
  const images = [1, 2, 3].map(n => {
    const prefix = '車両書類_' + String(n).padStart(2, '0') + '.';
    const matches = Object.keys(byName).filter(name => name.startsWith(prefix)).flatMap(name => byName[name]);
    return { 番号: n, 件数: matches.length, 有効: matches.some(f => f.size > 0 && f.type.startsWith('image/')) };
  });
  const pdfs = byName['車両基本書類一式.pdf'] || [];
  const pdfOK = pdfs.some(f => f.size > 0 && f.type === 'application/pdf');
  結果.確認した車両数 = 1;
  結果.画像 = { 連番ごとの確認: images, '3枚確認': images.every(x => x.有効) };
  結果.PDF = { 件数: pdfs.length, 存在して空でない: pdfOK };
  結果.ファイル合計 = total;
  結果.空ファイル数 = empty;
  結果.成功 = 結果.画像['3枚確認'] && pdfOK;
  if (images.some(x => x.件数 > 1) || pdfs.length > 1) 結果.注意.push('同名ファイルが複数あります。過去の再登録分が残っている可能性があります。');
  if (!結果.成功) 結果.注意.push('この1台は現在の命名規則で4ファイルを確認できません。旧仕様や別の保存先の可能性もあります。');
  結果.注意.push('既存の1台の現状のみ確認。新規登録時の動作やPDFの中身までは証明しません。');
  結果.処理秒 = Math.round((Date.now() - 開始) / 10) / 100;
  console.log('=== 正式書類保存・読み取り専用テスト ===');
  console.log(JSON.stringify(結果, null, 2));
  return 結果;
}

/**
 * GOLD FIRST / 87_登録キュー正式保存連携_読取専用テスト.gs
 * 既存データ、Drive、シート、プロパティ、トリガーを一切変更しない。
 * 実際の保存関数・ワーカーは実行せず、稼働中コードの構造を診断する。
 * 【注意】これは静的連携検査。実際の保存失敗や通信切断を再現する試験ではない。
 */
function GF_安全テスト_登録キューと正式保存の連携を確認する() {
  const 開始 = Date.now();
  const 結果 = [];
  function 確認(項目, 条件, 補足) {
    結果.push({項目:項目, 判定:条件 ? 'OK' : '要確認', 補足:補足 || ''});
  }
  function 本文(名前) {
    try {
      const fn = eval(名前); // この固定された関数名のみ。外部入力は評価しない。
      return typeof fn === 'function' ? Function.prototype.toString.call(fn) : '';
    } catch (e) { return ''; }
  }
  const 段階 = 本文('GF_受付の一段階を処理する_99');
  const ワーカー = 本文('GF_登録キュー一段階ワーカー_99');
  const 正式 = 本文('スマホから新規車両基本書類を保存する');
  const 一時 = 本文('GF_画像を受付へ保存する_99');
  const 削除 = 本文('GF_登録キュー一時フォルダを削除する_');
  確認('99番：書類処理関数が存在', !!段階);
  確認('89番：正式保存関数が存在', !!正式);
  確認('99番：書類待ちで正式保存関数を呼ぶ', /job\.段階\s*===\s*['"]書類待ち['"]/.test(段階) && /スマホから新規車両基本書類を保存する\s*\(/.test(段階));
  const 呼出位置 = 段階.indexOf('スマホから新規車両基本書類を保存する(');
  const 次位置 = 段階.indexOf("return '同期待ち'", 呼出位置);
  確認('99番：正式保存呼出し後に同期待ちへ進む', 呼出位置 >= 0 && 次位置 > 呼出位置);
  確認('89番：新規画像IDを記録', /新規画像ID\.push\s*\(/.test(正式));
  確認('89番：画像3枚とPDFのIDを確認', /新規画像ID\.concat\s*\(\s*\[PDF\.getId\(\)\]\s*\)/.test(正式) && /基本書類フォルダ\.getFiles\s*\(/.test(正式));
  確認('89番：空ファイル・不足時にエラー', /サイズ\s*<=\s*0/.test(正式) && /throw new Error\s*\(\s*['"]正式Drive保存の確認に失敗/.test(正式));
  確認('89番：旧ファイルを自動削除しない', !/DriveApp\.getFileById\(id\)\.setTrashed\(true\)/.test(正式));
  確認('99番：保存失敗時のエラー処理', /catch\s*\(e\)/.test(ワーカー) && /\['エラー'/.test(ワーカー));
  確認('99番：一時写真削除は完了時のみ', /if\s*\(next\s*===\s*['"]完了['"]\)\s*GF_登録キュー一時フォルダを削除する_/.test(ワーカー));
  確認('99番：一時写真の受付関数が存在', !!一時);
  確認('99番：一時フォルダ削除関数が存在', !!削除);
  const 要確認 = 結果.filter(x => x.判定 !== 'OK');
  const 出力 = {
    成功: 要確認.length === 0,
    OK件数: 結果.length - 要確認.length,
    全件数: 結果.length,
    詳細: 結果,
    注意: [
      '実行中のGAS関数を文字列で検査しただけです。画像やPDFを実際に保存していません。',
      '保存失敗時の挙動・PDF内容・通信切断・同時実行・再送の安全性は、このテストでは証明できません。',
      '99番は完了時に一時フォルダを削除するため、運用前に再送・復旧方針の確認が必要です。'
    ],
    処理秒: Math.round((Date.now() - 開始) / 10) / 100
  };
  console.log('=== 登録キュー×正式保存 連携・読み取り専用テスト ===');
  console.log(JSON.stringify(出力, null, 2));
  return 出力;
}

/**
 * GOLD FIRST 86_登録速度_無登録テスト.gs
 * 新規車両・写真・PDF・キューを作成せず、GAS側の画像受信後の
 * Base64デコードとBlob化の処理時間を測定する。
 * 本番のシート・Drive・プロパティ・トリガーにはアクセスしない。
 * 注意：スマホからの通信、スマホ内の画像変換、実際のDrive保存、
 * PDF作成、台帳反映、99番キュー処理の時間は測定できない。
 */
function GF_安全テスト_登録速度を測る_86() {
  const totalStart = Date.now();
  const MB = 1024 * 1024;
  const sizes = [0.5, 1, 2, 4]; // 写真1枚あたりの模擬容量(MB)
  const results = [];
  console.log('=== 車両登録・画像処理速度テスト（保存なし） ===');
  console.log('本番データへの書込みは一切ありません。');
  for (const size of sizes) {
    const bytesPerImage = Math.floor(size * MB);
    // 画像の内容を模したバイト配列。実際のJPEGではない。
    const bytes = new Array(bytesPerImage);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    let t = Date.now();
    const encoded = Utilities.base64Encode(bytes);
    const encodeMs = Date.now() - t;
    t = Date.now();
    let decodedBytes = 0;
    for (let n = 1; n <= 3; n++) {
      const decoded = Utilities.base64Decode(encoded);
      const blob = Utilities.newBlob(decoded, 'image/jpeg', '速度テスト_' + n + '.jpg');
      decodedBytes += blob.getBytes().length;
    }
    const decodeBlobMs = Date.now() - t;
    if (decodedBytes !== bytesPerImage * 3) throw new Error('バイト数不一致');
    const result = {
      '模擬写真1枚MB': size,
      '3枚合計MB': size * 3,
      'Base64文字数_1枚': encoded.length,
      '模擬データ生成後のBase64化ms': encodeMs,
      '3枚のデコードとBlob化ms': decodeBlobMs,
      '検証': 'OK'
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  console.log('=== 完了 / 全体 ' + ((Date.now() - totalStart) / 1000).toFixed(2) + '秒 ===');
  console.log('※これはGAS内の画像処理だけの計測。登録全体の速度とは異なります。');
  return { 成功: true, 書込なし: true, 結果: results, 全体秒: Number(((Date.now() - totalStart) / 1000).toFixed(2)) };
}

/**
 * GOLD FIRST / 85_登録キュー読取速度_安全テスト.gs
 * 本番のキューを「読み取るだけ」の速度診断。
 * 書込み・ファイル作成・トリガー起動・登録処理は一切しません。
 * 99番の GF_登録キューシートを取得する_ が存在することが前提です。
 * 実際の写真アップロード・Base64復元・Drive書込み時間は測れません。
 */
function GF_安全テスト_登録キュー読取速度を測る_85() {
  const allStart = Date.now();
  const result = { 成功:false, 計測:{}, 件数:{}, 注意:[] };
  const measure = (name, callback) => {
    const t = Date.now();
    const v = callback();
    result.計測[name+'ms'] = Date.now()-t;
    return v;
  };
  console.log('=== 99番 登録キュー読取速度・安全診断 ===');
  console.log('本番データは読み取りのみ。変更・登録・削除しません。');
  try {
    if (typeof GF_登録キューシートを取得する_ !== 'function') {
      throw new Error('99番のキュー取得関数が見つかりません。');
    }
    const sheet = measure('キューシート取得', () => GF_登録キューシートを取得する_());
    const lastRow = measure('最終行取得', () => sheet.getLastRow());
    const count = Math.max(0,lastRow-1);
    result.件数.履歴総数 = count;
    const rows = count ? measure('キュー全行14列取得', () => sheet.getRange(2,1,count,14).getValues()) : [];
    const states = {};
    measure('状態集計', () => rows.forEach(r => {
      const s = String(r[8]||'未設定');
      states[s] = (states[s]||0)+1;
    }));
    result.件数.状態別 = states;
    const pending = rows.filter(r => ['待機','画像待ち','画像保存中','処理中','エラー','画像保存エラー','要確認'].includes(String(r[8])));
    result.件数.未完了要確認 = pending.length;
    // 一時写真は実際に開かず、アクセス可能なフォルダがある場合のみメタデータを1件調査。
    const folderRow = [...rows].reverse().find(r => r[7] && ['待機','処理中','画像保存中','画像保存エラー','エラー','要確認'].includes(String(r[8])));
    if (folderRow) {
      try {
        const folder = measure('一時フォルダ参照', () => DriveApp.getFolderById(String(folderRow[7])));
        const it = measure('一時フォルダ一覧取得', () => folder.getFiles());
        let files=0,bytes=0;
        measure('一時写真メタデータ確認', () => {
          while (it.hasNext() && files<10) {
            const f=it.next();
            if (!f.isTrashed()) {files++;bytes+=f.getSize();}
          }
        });
        result.件数.調査した一時ファイル数=files;
        result.件数.調査した一時ファイル合計MB=Math.round(bytes/1048576*100)/100;
      } catch(e) {
        result.注意.push('一時フォルダの参照は不可: '+String(e&&e.message||e));
      }
    } else {
      result.注意.push('調査できる未完了の一時フォルダなし。Drive写真参照時間は未測定。');
    }
    result.成功=true;
  } catch(e) {
    result.エラー=String(e&&e.message||e);
  }
  result.計測.全体ms=Date.now()-allStart;
  result.注意.push('実際の写真送信、Base64復元、Driveへの書込み、PDF生成、同時実行は測定対象外です。');
  console.log(JSON.stringify(result,null,2));
  if (!result.成功) throw new Error(result.エラー);
  return result;
}

/**
 * GOLD FIRST / 84_写真3枚Drive保存_独立安全テスト.gs
 * 99番の画像Blob生成・Drive保存・保存結果確認を、テスト専用フォルダで実測。
 * 本番の車両台帳・登録キュー・車両書類フォルダ・スクリプトプロパティには触れません。
 * 成功時はテスト専用フォルダだけをゴミ箱へ移動します。
 * エラー時は証拠を残すためフォルダを保持し、IDをログに出します。
 * テスト画像は1x1 PNG。実際のスマホ通信、PDF作成、正式保存、登録全体の速度は測りません。
 */
function GF_安全テスト_写真3枚のDrive保存速度を測る_84() {
  const start = Date.now();
  const log = (name, t) => console.log(name + ' / ' + (Date.now() - t) + 'ms');
  const prefix = '車両書類';
  const id = 'GF_安全速度テスト_84_' + Utilities.getUuid();
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  let folder = null;
  console.log('=== 99番 写真3枚Drive保存テスト（本番登録なし） ===');
  console.log('テスト画像: 1x1 PNG × 3枚。画像サイズは本番とは異なります。');
  try {
    if (typeof GF_登録キュー画像Blob_ !== 'function' || typeof GF_一時画像の保存結果を確認する_99 !== 'function') {
      throw new Error('99番の画像処理関数が見つかりません。99_登録キュー.gsが同じGASにあるか確認してください。');
    }
    let t = Date.now();
    folder = DriveApp.getRootFolder().createFolder(id);
    log('テスト専用フォルダ作成', t);
    console.log('テスト専用フォルダID=' + folder.getId());
    t = Date.now();
    for (let i = 1; i <= 3; i++) {
      const filename = prefix + '_' + String(i).padStart(2, '0') + '.png';
      const blob = GF_登録キュー画像Blob_({Base64: pngBase64, MIMEタイプ:'image/png', ファイル名:filename}, filename);
      folder.createFile(blob.setName(filename));
    }
    log('99番方式の画像復元＋Drive3枚保存', t);
    t = Date.now();
    const verified = GF_一時画像の保存結果を確認する_99(folder, 3, prefix);
    log('99番の保存結果確認', t);
    if (verified !== 3) throw new Error('確認枚数が3枚ではありません: ' + verified);
    console.log('結果=成功 / 3枚すべて保存・名前・容量を確認');
    t = Date.now();
    folder.setTrashed(true);
    log('テスト専用フォルダのゴミ箱移動', t);
    console.log('本番データへの書込み=なし / テストフォルダ=ゴミ箱へ移動済み');
  } catch (e) {
    console.error('テスト失敗: ' + String(e && e.stack || e));
    if (folder) console.warn('確認用にテストフォルダを残しました。フォルダID=' + folder.getId());
    throw e;
  } finally {
    console.log('テスト全体=' + (Date.now() - start) + 'ms');
  }
}

/**
 * GOLD FIRST 84 / 大容量写真3枚 Drive保存テスト・修正版
 * 本番台帳・登録キュー・スクリプトプロパティは変更しません。
 * テスト専用フォルダにのみ書き込み、成功時はゴミ箱へ移動。
 * 失敗時はフォルダを残してログへIDを出します。
 * 模擬データは画像として表示できる写真ではありません。
 * 画像のバイト数・Base64処理・Drive保存・99番の保存検証を計測します。
 * 実際のJPEG画像の表示可否・スマホ通信・PDF生成・正式登録は対象外。
 */
function GF_安全テスト_本番大容量の写真保存速度を測る_84() {
  return GF84_容量別テスト_(1);
}
function GF_安全テスト_2MB写真3枚を測る_84() {
  return GF84_容量別テスト_(2);
}
function GF_安全テスト_4MB写真3枚を測る_84() {
  return GF84_容量別テスト_(4);
}
function GF84_容量別テスト_(mb) {
  if (typeof GF_登録キュー画像Blob_ !== 'function' ||
      typeof GF_一時画像の保存結果を確認する_99 !== 'function') {
    throw new Error('99番の画像処理関数が見つかりません。');
  }
  const start=Date.now(), size=mb*1024*1024;
  let folder=null, step='開始';
  console.log('=== 大容量写真3枚の独立保存テスト / 1枚'+mb+'MB・合計'+(mb*3)+'MB ===');
  console.log('台帳・キューは操作しません。実写真ではなく模擬バイト列です。');
  try {
    step='模擬データ生成';
    let t=Date.now();
    // CRC計算・PNGチャンク生成を廃止。バイト数だけ実写真相当の模擬データを用意。
    // 数値配列の大規模なpushや再コピーを避ける。
    const bytes=new Array(size);
    for(let i=0;i<size;i++) bytes[i]=(i*31+17)&255;
    const base64=Utilities.base64Encode(bytes);
    console.log('模擬データ生成＋Base64化='+ (Date.now()-t)+'ms / 文字数='+base64.length);
    step='専用フォルダ作成';
    t=Date.now();
    folder=DriveApp.getRootFolder().createFolder('GF84_大容量保存テスト_'+mb+'MB_'+Utilities.getUuid());
    console.log('フォルダ作成='+ (Date.now()-t)+'ms / ID='+folder.getId());
    const records=[];
    for(let i=1;i<=3;i++) {
      const name='車両書類_'+String(i).padStart(2,'0')+'.jpg';
      step='写真'+i+' Base64復元';
      t=Date.now();
      const blob=GF_登録キュー画像Blob_({Base64:base64,MIMEタイプ:'image/jpeg',ファイル名:name},name);
      const decodeMs=Date.now()-t;
      step='写真'+i+' Drive保存';
      t=Date.now();
      const file=folder.createFile(blob.setName(name));
      const saveMs=Date.now()-t;
      records.push({写真:i,復元ms:decodeMs,Drive保存ms:saveMs,保存ファイルID:file.getId()});
      console.log('写真'+i+' / 復元='+decodeMs+'ms / Drive保存='+saveMs+'ms');
    }
    step='99番の保存確認';
    t=Date.now();
    const verified=GF_一時画像の保存結果を確認する_99(folder,3,'車両書類');
    console.log('99番保存確認='+ (Date.now()-t)+'ms / '+verified+'枚');
    if(verified!==3)throw new Error('保存枚数が3枚ではありません。');
    console.log('結果=成功 / 保存確認まで合計='+ (Date.now()-start)+'ms');
    step='テストフォルダのゴミ箱移動';
    folder.setTrashed(true);
    console.log('専用フォルダをゴミ箱に移動済み。全体='+ (Date.now()-start)+'ms');
    return {成功:true,写真1枚MB:mb,写真別:records};
  }catch(e){
    console.error('失敗箇所='+step+' / '+String(e&&e.stack||e));
    if(folder)console.warn('調査用フォルダを残しました / ID='+folder.getId());
    throw e;
  }
}