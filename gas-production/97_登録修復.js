/******************************************************
 * GOLD FIRST 97_登録修復.gs（新規追加）
 * 既存VehicleIDへ登録時の書類3枚を再送する。
 * 車両・ドライバーの新規登録、実績日・ステータスの変更はしない。
 * 変更前のキュー行は「_登録修復控え」に保存する。
 ******************************************************/
function GF_スマホから登録時の車両書類を再送する_97(VehicleID, images) {
  VehicleID = String(VehicleID || '').trim();
  if (!VehicleID || !Array.isArray(images) || images.length !== 3) throw new Error('車両と書類3枚を確認してください。');
  images.forEach((x,i) => {
    const blob = GF_登録キュー画像Blob_(x, '車両書類_' + (i+1));
    if (!blob.getBytes().length) throw new Error('写真を読み込めませんでした。選択し直してください。');
  });
  let jobID = '', already = false;
  GF_短いロックで実行する_99(() => {
    const props = PropertiesService.getScriptProperties();
    const running = props.getProperty('GF_QUEUE_WORKER_RUNNING');
    // 別の実行が残っている間は、確認待ちの受付を変更しない。
    const ss = 対象スプレッドシートを開く_();
    const ledger = 必須シートを取得する_(ss, シート名.車両台帳);
    const row = IDで行を探す_(ledger, 'VehicleID', VehicleID);
    if (!row) throw new Error('登録済み車両を選び直してください。');
    const car = 行データを取得する_(ledger, row);
    const sheet = GF_登録キューシートを取得する_();
    const rows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,14).getValues() : [];
    const active = [];
    rows.forEach((r,i) => { if (r[0] && String(r[2]) === '車両' && String(r[3]) === VehicleID && String(r[8]) !== '完了') active.push({r:r,row:i+2}); });
    if (active.length > 1) throw new Error('この車両の受付が複数あります。管理担当者に確認してください。');
    if (active.length) {
      const item = active[0], r = item.r, state = String(r[8]);
      jobID = String(r[0]);
      if (['待機','書類待ち','同期待ち','割当待ち'].includes(state)) {
        if (!r[7] || !GF_再送写真3枚を確認する_97(String(r[7]))) throw new Error('受付中の写真を確認できません。管理担当者に確認してください。');
        // 保存済みの受付が進行中。新しい写真で上書きしない。
        already = true;return;
      }
      if (!['エラー','画像保存エラー','画像待ち','要確認'].includes(state)) throw new Error('この車両は処理中です。少し待ってから送信してください。');
      if (state === '要確認') {
        let busy = running === '1';
        if (running && running !== '1') {
          try { busy = JSON.parse(running).until > Date.now(); } catch (e) { busy = true; }
        }
        if (busy) throw new Error('前の処理が残っています。管理担当者に確認してください。');
      }
      GF_登録修復前の行を控える_97(ss, r, '既存車両への書類再送');
      // 今回は写真だけの再送。後から古いDriverIDを再割当しない。
      // 古い一時フォルダは控えに残し、削除しない。
      sheet.getRange(item.row,5,1,10).setValues([[row,String(car['車番'] || ''),'','','画像待ち','','','','','']]);
      SpreadsheetApp.flush();
    } else {
      jobID = 'VQ-' + Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0,8);
      sheet.appendRow([jobID,new Date(),'車両',VehicleID,row,String(car['車番'] || ''),'','','画像待ち','','','','','']);
      SpreadsheetApp.flush();
    }
    props.setProperty('GF_QUEUE_PENDING','1');
    GF_登録キューワーカーを予約する_();
  });
  if (already) return {成功:true,受付済み:true,JobID:jobID,VehicleID:VehicleID,メッセージ:'この車両の書類はすでに受付中です。写真は追加保存していません。'};
  // 99番の写真保存を再利用。3枚の保存が終わってから成功を返す。
  const result = GF_画像を受付へ保存する_99(jobID, images, '車両', 3, '車両書類');
  if (result.成功 === true) GF_後日書類の再送受付を記録する_97(VehicleID, jobID);
  return {成功:result.成功 === true, JobID:jobID, VehicleID:VehicleID, メッセージ:'書類3枚の再送を受け付けました。'};
}

function GF_再送写真3枚を確認する_97(folderID) {
  const folder = DriveApp.getFolderById(folderID);
  if (folder.isTrashed()) return false;
  const iterator = folder.getFiles(), counts = [0,0,0];
  let total = 0;
  while (iterator.hasNext()) {
    const f = iterator.next(), m = f.getName().match(/^車両書類_(01|02|03)\./);
    if (!m) continue;
    total++;
    if (!f.isTrashed() && f.getSize() > 0) counts[Number(m[1])-1]++;
  }
  return total === 3 && counts.every(n => n === 1);
}

function GF_登録修復前の行を控える_97(ss, values, reason) {
  let backup = ss.getSheetByName('_登録修復控え');
  if (!backup) {
    backup = ss.insertSheet('_登録修復控え');
    backup.appendRow(['控え日時','理由','JobID','受付日時','種別','VehicleID','行番号','車番/氏名','DriverID','一時フォルダID','状態','エラー','開始日時','完了日時','処理段階','処理トークン']);
  }
  backup.appendRow([new Date(),reason].concat(values));
  SpreadsheetApp.flush();
}

/** 管理者が手動実行。割当段階のエラーだけを、現在の人物と一致した場合に再開する。 */
function GF_割当エラーを安全に再開する_97() {
  let resumed = 0, skipped = 0;
  GF_短いロックで実行する_99(() => {
    if (PropertiesService.getScriptProperties().getProperty('GF_QUEUE_INTAKE_ONLY') !== '1') throw new Error('先に登録キューの後処理を一時停止してください。');
    const ss = 対象スプレッドシートを開く_();
    const sheet = GF_登録キューシートを取得する_();
    const ledger = 必須シートを取得する_(ss, シート名.車両台帳);
    const master = 必須シートを取得する_(ss, シート名.ドライバーマスター);
    const rows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,14).getValues() : [];
    rows.forEach((r,i) => {
      if (String(r[2]) !== '車両' || String(r[8]) !== 'エラー' || String(r[12]) !== '割当待ち') return;
      const driverID = String(r[6] || '').trim();
      const carRow = IDで行を探す_(ledger,'VehicleID',String(r[3]));
      const driverRow = driverID ? IDで行を探す_(master,'DriverID',driverID) : 0;
      if (!carRow || !driverRow) { skipped++;console.log('再開せず確認が必要 / JobID=' + r[0] + ' / 車両またはドライバーが見つかりません。');return; }
      const car = 行データを取得する_(ledger,carRow), person = 行データを取得する_(master,driverRow);
      const currentID = String(car['DriverID'] || '').trim();
      const currentName = String(car['現在使用者'] || '').trim();
      if (!currentName || GF_使用者名比較キーを作る_20(currentName) !== GF_使用者名比較キーを作る_20(person['氏名']) || (currentID && currentID !== driverID)) {
        skipped++;console.log('再開せず確認が必要 / JobID=' + r[0] + ' / 現在使用者が受付時と一致しません。');return;
      }
      GF_登録修復前の行を控える_97(ss,r,'本人一致を確認して割当エラー再開');
      sheet.getRange(i+2,9,1,6).setValues([['割当待ち','',new Date(),'','割当待ち','']]);
      SpreadsheetApp.flush();
      resumed++;console.log('割当段階の再開受付 / JobID=' + r[0]);
    });
    if (resumed) { PropertiesService.getScriptProperties().setProperty('GF_QUEUE_PENDING','1');GF_登録キューワーカーを予約する_(); }
  });
  console.log('割当エラー再開 / 再開件数=' + resumed + ' / 確認が必要=' + skipped + ' / 一時停止設定は変更していません。');
  return {再開件数:resumed,確認が必要:skipped};
}

/** 管理者が手動実行。氏名が一意に一致する空DriverIDだけ最大5台復旧する。 */
function GF_空DriverIDを安全に復旧する_97() {
  let repaired = 0, review = 0, remaining = 0;
  GF_短いロックで実行する_99(() => {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('GF_QUEUE_INTAKE_ONLY') !== '1') throw new Error('先に登録キューの後処理を一時停止してください。');
    const raw = props.getProperty('GF_QUEUE_WORKER_RUNNING');
    if (raw) {
      let busy = true;
      if (raw !== '1') { try { busy = JSON.parse(raw).until > Date.now(); } catch (e) {} }
      if (busy) throw new Error('実行中の後処理が終わってから、もう一度実行してください。');
    }
    const ss = 対象スプレッドシートを開く_();
    const ledger = 必須シートを取得する_(ss, シート名.車両台帳);
    const master = 必須シートを取得する_(ss, シート名.ドライバーマスター);
    const queue = GF_登録キューシートを取得する_();
    const cars = ledger.getDataRange().getDisplayValues(), people = master.getDataRange().getDisplayValues();
    const h = cars[0].map(String), p = people[0].map(String);
    const vi = h.indexOf('VehicleID'), di = h.indexOf('DriverID'), ni = h.indexOf('現在使用者'), pi = p.indexOf('DriverID'), pn = p.indexOf('氏名');
    if ([vi,di,ni,pi,pn].some(i => i < 0)) throw new Error('車両・ドライバーの列を確認してください。');
    const queued = queue.getLastRow() > 1 ? queue.getRange(2,1,queue.getLastRow()-1,14).getValues() : [];
    const index = {};
    people.slice(1).forEach(r => {
      const name = String(r[pn] || '').trim(), id = String(r[pi] || '').trim();
      if (!name || !id) return;
      const key = GF_使用者名比較キーを作る_20(name);
      (index[key] || (index[key] = [])).push({id:id,name:name});
    });
    let backup = null;
    cars.slice(1).forEach((r,i) => {
      const vehicleID = String(r[vi] || '').trim(), name = String(r[ni] || '').trim();
      if (!vehicleID || !name || String(r[di] || '').trim()) return;
      const match = index[GF_使用者名比較キーを作る_20(name)] || [];
      if (match.length !== 1) { review++;console.log('紐付けは変更せず確認が必要 / VehicleID=' + vehicleID + ' / 同名候補=' + match.length);return; }
      const existing = queued.filter(q => String(q[2]) === '車両' && String(q[3]) === vehicleID && String(q[8]) !== '完了');
      if (existing.length > 1 || existing.some(q => ['処理中','画像保存中'].includes(String(q[8])))) {
        review++;console.log('紐付けは変更せず確認が必要 / VehicleID=' + vehicleID + ' / 受付が処理中または重複');return;
      }
      if (repaired >= 5) { remaining++;return; }
      const chosen = match[0], normalized = GF_会社名を正規化する_20(chosen.name) || chosen.name;
      if (!backup) {
        backup = ss.getSheetByName('_紐付け修復控え');
        if (!backup) { backup = ss.insertSheet('_紐付け修復控え');backup.appendRow(['控え日時','VehicleID','台帳行','変更前DriverID','変更前現在使用者','変更後DriverID','変更後現在使用者']); }
      }
      backup.appendRow([new Date(),vehicleID,i+2,r[di],r[ni],chosen.id,normalized]);
      SpreadsheetApp.flush();
      ledger.getRange(i+2,di+1).setValue(chosen.id);
      ledger.getRange(i+2,ni+1).setValue(normalized);
      // 処理済み車両は同期だけを追加受付。既存エラー行の状態は変えない。
      if (!existing.length) {
        const jobID = 'VQ-' + Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0,8);
        queue.appendRow([jobID,new Date(),'車両',vehicleID,i+2,'紐付け復旧','','','待機','','','','','']);
      }
      SpreadsheetApp.flush();
      repaired++;
      console.log('台帳のDriverID復旧 / VehicleID=' + vehicleID + ' / DriverID=' + chosen.id + ' / 各シートの同期は後処理再開後');
    });
    if (repaired) { props.setProperty('GF_QUEUE_PENDING','1');GF_登録キューワーカーを予約する_(); }
  });
  console.log('紐付け復旧終了 / 復旧=' + repaired + ' / 次回に残った対象=' + remaining + ' / 手動確認が必要=' + review);
  return {復旧件数:repaired,次回対象:remaining,確認が必要:review};
}

/** 写真0枚の書類エラーを「書類は後日」として同期段階へ進める。管理者が手動実行。 */
function GF_写真なし受付を書類後日で進める_97() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('GF_QUEUE_INTAKE_ONLY') !== '1') throw new Error('先に登録キューの後処理を一時停止してください。');
  const raw = props.getProperty('GF_QUEUE_WORKER_RUNNING');
  if (raw) {
    let busy = true;
    if (raw !== '1') { try { busy = JSON.parse(raw).until > Date.now(); } catch (e) {} }
    if (busy) throw new Error('実行中の後処理が終わってから、もう一度実行してください。');
  }
  const ss = 対象スプレッドシートを開く_();
  const sheet = GF_登録キューシートを取得する_();
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,14).getValues() : [];
  const candidates = [];
  rows.forEach(r => {
    if (String(r[2]) !== '車両' || String(r[8]) !== 'エラー' || String(r[12]) !== '書類待ち' || !String(r[9]).includes('車両書類3枚を確認してください。')) return;
    if (!r[7]) { candidates.push(r);return; }
    try {
      const folder = DriveApp.getFolderById(String(r[7]));
      // 名前が違う写真やゴミ箱の写真も含め、画像があれば保留する。
      const seen = {}, images = [];
      function collect(it) {
        while (it.hasNext()) {
          const file = it.next();
          if (seen[file.getId()]) continue;
          seen[file.getId()] = true;
          if (/^image\//i.test(file.getMimeType())) images.push(file.getId());
        }
      }
      collect(folder.getFiles());
      const queryID = String(r[7]).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      collect(DriveApp.searchFiles("'" + queryID + "' in parents and trashed = false"));
      collect(DriveApp.searchFiles("'" + queryID + "' in parents and trashed = true"));
      if (images.length) { console.log('後日扱いへ変更せず写真確認 / JobID=' + r[0] + ' / 写真=' + images.length + '枚');return; }
      candidates.push(r);
    } catch (e) { console.log('後日扱いへ変更せず確認が必要 / JobID=' + r[0] + ' / フォルダ確認失敗'); }
  });
  let changed = 0;
  GF_短いロックで実行する_99(() => {
    if (props.getProperty('GF_QUEUE_INTAKE_ONLY') !== '1') throw new Error('後処理が再開されています。先に停止してください。');
    const ledger = 必須シートを取得する_(ss, シート名.車両台帳);
    let later = ss.getSheetByName('後日書類管理');
    if (!later && candidates.length) {
      later = ss.insertSheet('後日書類管理');
      later.appendRow(['元JobID','VehicleID','車番','後日扱い日時','書類状態','再送JobID','再送受付日時','備考']);
    }
    for (const before of candidates) {
      const qrow = GF_登録キューJob行を探す_(sheet,String(before[0]));
      if (!qrow) continue;
      const current = sheet.getRange(qrow,1,1,14).getValues()[0];
      if (String(current[8]) !== 'エラー' || String(current[12]) !== '書類待ち' || String(current[7]) !== String(before[7]) || String(current[13] || '') !== String(before[13] || '')) {
        console.log('受付が変わったため変更しません / JobID=' + before[0]);continue;
      }
      const ledgerRow = IDで行を探す_(ledger,'VehicleID',String(current[3]));
      if (!ledgerRow) { console.log('車両が見つからず変更しません / JobID=' + current[0]);continue; }
      GF_登録修復前の行を控える_97(ss,current,'写真0枚のため書類は後日提出。同期・フォルダ作成へ進める');
      const history = later.getLastRow() > 1 ? later.getRange(2,1,later.getLastRow()-1,1).getValues() : [];
      if (!history.some(r => String(r[0]) === String(current[0]))) {
        const nr = later.getLastRow() + 1;
        const formula = '=IF(F' + nr + '="","未提出",IFERROR(IF(VLOOKUP(F' + nr + ',\'_登録キュー\'!A:I,9,FALSE)="完了","書類登録完了","再送："&VLOOKUP(F' + nr + ',\'_登録キュー\'!A:I,9,FALSE)),"受付確認"))';
        later.appendRow([current[0],current[3],current[5],new Date(),formula,'','','元写真が見つからないため、既存車両へ後日3枚再送']);
        SpreadsheetApp.flush();
      }
      // 車両台帳の最新の現在使用者で同期する。旧IDの再割当は行わない。
      // 一時フォルダIDの旧値は控えに保持。完了時にも削除対象にしない。
      sheet.getRange(qrow,7,1,8).setValues([['','','同期待ち','書類は後日提出。後日書類管理に記録済み。',new Date(),'','同期待ち','']]);
      SpreadsheetApp.flush();
      changed++;
      console.log('書類後日で同期へ進めます / VehicleID=' + current[3] + ' / JobID=' + current[0]);
    }
    if (changed) { props.setProperty('GF_QUEUE_PENDING','1');GF_登録キューワーカーを予約する_(); }
  });
  console.log('書類後日への変更件数=' + changed + ' / 写真は未提出のまま記録 / 後処理の一時停止は維持');
  return {変更件数:changed};
}

// 既存車両への写真再送が受け付けられたら、未提出一覧と新しいJobIDを結び付ける。
function GF_後日書類の再送受付を記録する_97(VehicleID, jobID) {
  GF_短いロックで実行する_99(() => {
    const ss = 対象スプレッドシートを開く_();
    const sheet = ss.getSheetByName('後日書類管理');
    if (!sheet || sheet.getLastRow() < 2) return;
    const rows = sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues();
    rows.forEach((r,i) => {
      if (String(r[1]) === VehicleID) sheet.getRange(i+2,6,1,2).setValues([[jobID,new Date()]]);
    });
    SpreadsheetApp.flush();
  });
}