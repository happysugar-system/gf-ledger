/**
 * 95_初期書類取込.gs
 * 初回移行専用。
 * ID直書きなし：
 *   対象スプレッドシートを開く_()
 *   Drive親フォルダを取得する_()
 *
 * 投入名：
 *   山田太郎-表.jpg / 山田太郎-裏.jpg
 *   72-53-山田太郎-車検証.jpg
 *   72-53-山田太郎-記録事項.jpg
 *   72-53-山田太郎-自賠責.jpg
 */

function 初期書類取込フォルダを準備する() {
  const root = Drive親フォルダを取得する_();
  const inbox = 初期書類_子_(root, '00_初期書類取込');
  const review = 初期書類_子_(root, '00_書類要確認');
  Logger.log('取込: ' + inbox.getUrl());
  Logger.log('要確認: ' + review.getUrl());
  return {取込: inbox.getUrl(), 要確認: review.getUrl()};
}

function 初期書類を処理する() {
  const ss = 対象スプレッドシートを開く_();
  const root = Drive親フォルダを取得する_();
  const inbox = 初期書類_子_(root, '00_初期書類取込');
  const review = 初期書類_子_(root, '00_書類要確認');
  const drivers = 初期書類_ドライバー_(ss);
  const vehicles = 初期書類_車両_(ss);

  const files = [];
  const it = inbox.getFiles();
  while (it.hasNext()) files.push(it.next());
  if (!files.length) return '処理対象なし';

  const licenses = {};
  const vehicleFiles = [];

  files.forEach(function(file) {
    const parts = 初期書類_拡張子なし_(file.getName())
      .split(/[-_]/).map(function(v){ return String(v || '').trim(); });

    if (parts.length === 2 && (parts[1] === '表' || parts[1] === '裏')) {
      const key = 初期書類_正規化_(parts[0]);
      if (!licenses[key]) licenses[key] = {name: parts[0], front: null, back: null};
      if (parts[1] === '表') licenses[key].front = file;
      if (parts[1] === '裏') licenses[key].back = file;
    } else {
      vehicleFiles.push(file);
    }
  });

  let ok = 0;
  let ng = 0;

  Object.keys(licenses).forEach(function(key) {
    const g = licenses[key];
    const originals = [g.front, g.back].filter(Boolean);

    try {
      const d = 初期書類_氏名検索_(g.name, drivers);
      if (!d || !g.front || !g.back) {
        originals.forEach(function(f){ 初期書類_要確認_(f, review); ng++; });
        return;
      }

      const driverRoot = 初期書類_子_(root, '02_ドライバー');
      const driverFolder = 初期書類_子_(driverRoot, d.id + '_' + 初期書類_名前_(d.name));
      const licenseFolder = 初期書類_子_(driverFolder, '免許証');
      const originalsFolder = 初期書類_子_(licenseFolder, '元画像');

      初期書類_PDF_([g.front, g.back], licenseFolder,
        初期書類_PDF名_(licenseFolder, '免許証.pdf'));

      g.front.makeCopy(g.front.getName(), originalsFolder);
      g.back.makeCopy(g.back.getName(), originalsFolder);
      g.front.setTrashed(true);
      g.back.setTrashed(true);

      初期書類_免許証リンク_(ss, d.id, licenseFolder.getUrl());
      ok += 2;
    } catch (e) {
      originals.forEach(function(f){
        try {
          if (!f.isTrashed()) { 初期書類_要確認_(f, review); ng++; }
        } catch (_) {}
      });
      Logger.log('免許証エラー: ' + g.name + ' / ' + e.message);
    }
  });

  vehicleFiles.forEach(function(file) {
    try {
      const parts = 初期書類_拡張子なし_(file.getName())
        .split(/[-_]/).map(function(v){ return String(v || '').trim(); });

      if (parts.length < 4) {
        初期書類_要確認_(file, review); ng++; return;
      }

      const no = parts[0] + '-' + parts[1];
      const name = parts.slice(2, -1).join('-');
      const type = parts[parts.length - 1];

      const v = 初期書類_車番検索_(no, vehicles);
      const d = 初期書類_氏名検索_(name, drivers);

      if (!v || !d || ['車検証','記録事項','自賠責'].indexOf(type) < 0) {
        初期書類_要確認_(file, review); ng++; return;
      }

      const vehicleRoot = 初期書類_子_(root, '01_車両');
      let vehicleFolder = 初期書類_接頭辞_(vehicleRoot, v.id + '_');
      const official = v.id + '_' + v.number;

      if (!vehicleFolder) vehicleFolder = vehicleRoot.createFolder(official);
      else if (vehicleFolder.getName() !== official) vehicleFolder.setName(official);

      const photoFolder = 初期書類_子_(vehicleFolder, '車両状態画像');
      const docsFolder = 初期書類_子_(vehicleFolder, '車両書類');
      const maintenanceFolder = 初期書類_子_(vehicleFolder, '整備書類');

      const userRoot = 初期書類_子_(vehicleFolder, '利用者別車両書類');
      const userFolder = 初期書類_子_(userRoot, d.id + '_' + 初期書類_名前_(d.name));
      const originalsFolder = 初期書類_子_(userFolder, '元画像');

      初期書類_PDF_([file], userFolder,
        初期書類_PDF名_(userFolder, type + '.pdf'));

      file.makeCopy(file.getName(), originalsFolder);
      file.setTrashed(true);

      初期書類_車両状況リンク_(
        ss, v.id,
        photoFolder.getUrl(),
        docsFolder.getUrl(),
        maintenanceFolder.getUrl()
      );
      初期書類_利用者リンク_(ss, v.id, d.id, userFolder.getUrl());

      ok++;
    } catch (e) {
      try {
        if (!file.isTrashed()) { 初期書類_要確認_(file, review); ng++; }
      } catch (_) {}
      Logger.log('車両書類エラー: ' + file.getName() + ' / ' + e.message);
    }
  });

  SpreadsheetApp.flush();
  return '初期書類処理完了：成功 ' + ok + '件 / 要確認 ' + ng + '件';
}

/* 初期移行中だけ1時間ごと。終了後は必ず停止する。 */
function 初期書類自動処理を開始する() {
  const handler = '初期書類を処理する';
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
  初期書類取込フォルダを準備する();
  return 初期書類を処理する();
}

function 初期書類自動処理を終了する() {
  const handler = '初期書類を処理する';
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return '初期書類トリガー削除：' + n + '件';
}

function 初期書類_ドライバー_(ss) {
  const sh = ss.getSheetByName('ドライバーマスター');
  if (!sh || sh.getLastRow() < 2) return [];
  const a = sh.getDataRange().getDisplayValues();
  const h = a[0].map(function(v){ return String(v || '').trim(); });
  const ic = h.indexOf('DriverID');
  const nc = h.indexOf('氏名');
  if (ic < 0 || nc < 0) throw new Error('DriverIDまたは氏名列がありません');

  return a.slice(1).map(function(r){
    const id = String(r[ic] || '').trim();
    const name = String(r[nc] || '').trim();
    return id && name ? {id:id, name:name} : null;
  }).filter(Boolean);
}

function 初期書類_車両_(ss) {
  const sh = ss.getSheetByName('車両台帳');
  if (!sh || sh.getLastRow() < 2) return [];
  const a = sh.getDataRange().getDisplayValues();
  const h = a[0].map(function(v){ return String(v || '').trim(); });
  const ic = h.indexOf('VehicleID');
  const nc = h.indexOf('車番');
  if (ic < 0 || nc < 0) throw new Error('VehicleIDまたは車番列がありません');

  return a.slice(1).map(function(r){
    const id = String(r[ic] || '').trim();
    const number = String(r[nc] || '').trim();
    return id && number ? {id:id, number:number} : null;
  }).filter(Boolean);
}

function 初期書類_氏名検索_(name, list) {
  const x = 初期書類_正規化_(name);
  const hits = list.filter(function(v){ return 初期書類_正規化_(v.name) === x; });
  return hits.length === 1 ? hits[0] : null;
}

function 初期書類_車番検索_(number, list) {
  const x = 初期書類_正規化_(number);
  const hits = list.filter(function(v){ return 初期書類_正規化_(v.number) === x; });
  return hits.length === 1 ? hits[0] : null;
}

function 初期書類_免許証リンク_(ss, driverId, url) {
  初期書類_行リンク_(ss, 'ドライバーマスター', 'DriverID', driverId, '🪪免許証フォルダ', url);
}

function 初期書類_利用者リンク_(ss, vehicleId, driverId, url) {
  const sh = ss.getSheetByName('利用者管理');
  if (!sh || sh.getLastRow() < 2) return;
  const a = sh.getDataRange().getDisplayValues();
  const h = a[0].map(function(v){ return String(v || '').trim(); });
  const vc = h.indexOf('VehicleID');
  const dc = h.indexOf('DriverID');
  const lc = h.indexOf('現在使用者 車両書類');
  if (vc < 0 || dc < 0 || lc < 0) return;

  for (let i = 1; i < a.length; i++) {
    if (String(a[i][vc] || '').trim() === vehicleId &&
        String(a[i][dc] || '').trim() === driverId) {
      sh.getRange(i + 1, lc + 1).setValue(url);
      return;
    }
  }
}

function 初期書類_車両状況リンク_(ss, vehicleId, photoUrl, docsUrl, maintenanceUrl) {
  const sh = ss.getSheetByName('車両状況');
  if (!sh || sh.getLastRow() < 2) return;
  const a = sh.getDataRange().getDisplayValues();
  const h = a[0].map(function(v){ return String(v || '').trim(); });
  const ic = h.indexOf('VehicleID');
  if (ic < 0) return;

  const pc = h.indexOf('📷車両状態フォルダ');
  const dc = h.indexOf('📄車両書類フォルダ');
  const mc = h.indexOf('🔧整備書類フォルダ');

  for (let i = 1; i < a.length; i++) {
    if (String(a[i][ic] || '').trim() !== vehicleId) continue;
    if (pc >= 0) sh.getRange(i + 1, pc + 1).setValue(photoUrl);
    if (dc >= 0) sh.getRange(i + 1, dc + 1).setValue(docsUrl);
    if (mc >= 0) sh.getRange(i + 1, mc + 1).setValue(maintenanceUrl);
    return;
  }
}

function 初期書類_行リンク_(ss, sheetName, idHeader, id, linkHeader, url) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  const a = sh.getDataRange().getDisplayValues();
  const h = a[0].map(function(v){ return String(v || '').trim(); });
  const ic = h.indexOf(idHeader);
  const lc = h.indexOf(linkHeader);
  if (ic < 0 || lc < 0) return;

  for (let i = 1; i < a.length; i++) {
    if (String(a[i][ic] || '').trim() === id) {
      sh.getRange(i + 1, lc + 1).setValue(url);
      return;
    }
  }
}

function 初期書類_子_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function 初期書類_接頭辞_(parent, prefix) {
  const it = parent.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (String(f.getName()).indexOf(prefix) === 0) return f;
  }
  return null;
}

function 初期書類_要確認_(file, folder) {
  if (file && !file.isTrashed()) file.moveTo(folder);
}

function 初期書類_PDF名_(folder, desired) {
  if (!folder.getFilesByName(desired).hasNext()) return desired;
  const base = String(desired).replace(/\.pdf$/i, '');
  const stamp = Utilities.formatDate(new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  return base + '_' + stamp + '.pdf';
}

/* 60_書類PDF.gsに依存せず95単体で画像→PDF化 */
function 初期書類_PDF_(files, destination, pdfName) {
  const doc = DocumentApp.create('TEMP_' + new Date().getTime() + '_' + pdfName);
  try {
    const body = doc.getBody();
    body.clear();

    files.forEach(function(file, i) {
      if (i > 0) body.appendPageBreak();
      const img = body.appendImage(file.getBlob());
      const maxW = 520;
      const w = img.getWidth();
      const h = img.getHeight();
      if (w > maxW) {
        img.setWidth(maxW);
        img.setHeight(Math.round(h * maxW / w));
      }
    });

    doc.saveAndClose();
    const blob = DriveApp.getFileById(doc.getId())
      .getAs(MimeType.PDF).setName(pdfName);
    return destination.createFile(blob);
  } finally {
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (_) {}
  }
}

function 初期書類_拡張子なし_(name) {
  return String(name || '').replace(/\.[^.]+$/, '').trim();
}

function 初期書類_正規化_(v) {
  return String(v || '').normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[‐‑‒–—―ーｰ−]/g, '-')
    .toLowerCase().trim();
}

function 初期書類_名前_(v) {
  return String(v || '').replace(/\s+/g, '').trim();
}