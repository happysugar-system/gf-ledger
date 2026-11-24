/** 車両台帳を正本とする進捗処理。GASの既存認可・同期処理から呼び出す。 */
const GF_LEDGER_PROGRESS_COLUMNS = ['管理区分', '納車可能日', '納車確定日'];

function GF_LedgerProgressDate_(input) {
  if (input === '' || input == null) return '';
  if (typeof input !== 'string') throw new Error('日付形式が不正です');
  const parts = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(input.trim());
  if (!parts) throw new Error('日付形式が不正です');
  const iso = parts[1] + '-' + parts[2].padStart(2, '0') + '-' + parts[3].padStart(2, '0');
  const day = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== iso) {
    throw new Error('実在する日付を入力してください');
  }
  return iso;
}

function GF_LedgerProgressValues_(record) {
  const stage = String(record['管理区分'] ?? '').trim();
  if (stage.length > 100 || /[\r\n]/.test(stage)) throw new Error('管理区分が不正です');
  const available = GF_LedgerProgressDate_(record['納車可能日']);
  const confirmed = GF_LedgerProgressDate_(record['納車確定日']);
  if (available && confirmed && confirmed < available) {
    throw new Error('納車確定日は納車可能日以降を指定してください');
  }
  return [stage, available, confirmed];
}

function GF_LedgerProgressSnapshot_(record) {
  return {
    vehicleId: String(record.VehicleID ?? ''),
    driverId: String(record.DriverID ?? ''),
    values: GF_LedgerProgressValues_(record),
  };
}

function GF_LedgerProgressPlan_(current, expected, fields) {
  const snapshot = GF_LedgerProgressSnapshot_(current);
  if (!snapshot.vehicleId || !/^D\d{6}$/.test(snapshot.driverId)) {
    throw new Error('割当済みの車両を選択してください');
  }
  if (expected?.vehicleId !== snapshot.vehicleId || expected?.driverId !== snapshot.driverId ||
      JSON.stringify(expected?.values) !== JSON.stringify(snapshot.values)) {
    throw new Error('台帳が更新されました。再読み込みしてください');
  }
  if (!fields || GF_LEDGER_PROGRESS_COLUMNS.some(key => typeof fields[key] !== 'string')) {
    throw new Error('進捗項目をすべて指定してください');
  }
  const values = GF_LedgerProgressValues_(fields);
  return Object.fromEntries(GF_LEDGER_PROGRESS_COLUMNS.map((key, index) => [key, values[index]]));
}

function GF_LedgerProgressCancelGuard_(record) {
  const [stage, available, confirmed] = GF_LedgerProgressValues_(record);
  if (stage !== '車両準備中' || available || confirmed) {
    throw new Error('進捗または納車日が登録されています。取消前に台帳を確認してください');
  }
}

function GFI_進捗台帳読取_(vehicle) {
  const record = {...vehicle.r};
  const timezone = vehicle.s.getParent().getSpreadsheetTimeZone();
  for (const key of GF_LEDGER_PROGRESS_COLUMNS.slice(1)) {
    const index = vehicle.h.indexOf(key);
    if (index < 0) throw new Error('台帳に列がありません ' + key);
    const raw = vehicle.s.getRange(2, index + 1).getValue();
    record[key] = raw instanceof Date ? Utilities.formatDate(raw, timezone, 'yyyy-MM-dd') : raw;
  }
  return record;
}

/** スタンドアロンGASの検証用。既存のGFI確認処理と同じロックを使う。 */
function GFI_進捗台帳保存_(expected, fields) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const {v, w, d} = GFI_確認_();
    if (w.r['ステータス'] !== '割当済' || w.r['割当VehicleID'] !== v.r.VehicleID ||
        d.r['割当VehicleID'] !== v.r.VehicleID || w.r.DriverID !== v.r.DriverID ||
        d.r.DriverID !== v.r.DriverID) {
      throw new Error('割当情報が一致しません');
    }
    for (const key of GF_LEDGER_PROGRESS_COLUMNS) {
      if (!v.h.includes(key)) throw new Error('台帳に列がありません ' + key);
    }
    const patch = GF_LedgerProgressPlan_(GFI_進捗台帳読取_(v), expected, fields);
    const requests = Object.entries(patch).map(([key, value]) => {
      const index = v.h.indexOf(key);
      if (v.s.getRange(2, index + 1).getFormula()) throw new Error('数式セル ' + key);
      const cell = {};
      if (value) {
        cell.userEnteredValue = key === '管理区分'
          ? {stringValue: value}
          : {numberValue: Date.parse(value + 'T00:00:00Z') / 86400000 + 25569};
      }
      return {updateCells: {
        start: {sheetId: v.s.getSheetId(), rowIndex: 1, columnIndex: index},
        rows: [{values: [cell]}],
        fields: 'userEnteredValue',
      }};
    });
    Sheets.Spreadsheets.batchUpdate({requests}, v.s.getParent().getId());
    const saved = GF_LedgerProgressSnapshot_(GFI_進捗台帳読取_(GFI_確認_().v));
    if (saved.vehicleId !== expected.vehicleId || saved.driverId !== expected.driverId ||
        JSON.stringify(saved.values) !== JSON.stringify(GF_LedgerProgressValues_(patch))) {
      throw new Error('台帳保存結果を照合できません');
    }
    return saved;
  } finally {
    lock.releaseLock();
  }
}
