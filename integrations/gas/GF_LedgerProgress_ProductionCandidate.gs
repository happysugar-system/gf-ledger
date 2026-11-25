/** 本番移行候補。既存スタッフ認可と契約照合を通過したサーバー処理から呼び出す。 */
const GF_LedgerProdProgressColumns_ = ['管理区分', '納車可能日', '納車確定日'];
const GF_LedgerProdProgressStages_ = [
  '車両準備中', '車両手配済み', '名義変更前', '名義変更中', '名義変更済み',
];

function GF_LedgerProdProgressDate_(input) {
  if (input === '' || input == null) return '';
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 0 || input > 2958465) throw Error('日付値が不正です');
    return new Date((input - 25569) * 86400000).toISOString().slice(0, 10);
  }
  const parts = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/.exec(String(input).trim());
  if (!parts) throw Error('日付形式が不正です');
  const iso = parts[1] + '-' + parts[3].padStart(2, '0') + '-' + parts[4].padStart(2, '0');
  const day = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== iso) {
    throw Error('実在する日付を指定してください');
  }
  return iso;
}

function GF_LedgerProdProgressRead_(bookId, vehicleId) {
  if (!/^V\d{6}$/.test(vehicleId)) throw Error('VehicleIDが不正です');
  const api = Sheets.Spreadsheets;
  const table = api.Values.get(bookId, "'車両台帳'", {
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  }).values || [];
  const headers = (table[0] || []).map(value => String(value).trim());
  const keys = ['VehicleID', 'DriverID', ...GF_LedgerProdProgressColumns_];
  const columns = Object.fromEntries(keys.map(key => {
    const index = headers.indexOf(key);
    if (index < 0 || index !== headers.lastIndexOf(key)) throw Error('台帳の見出し不正: ' + key);
    return [key, index];
  }));
  const matches = [];
  for (let index = 1; index < table.length; index++) {
    if (String(table[index][columns.VehicleID] ?? '').trim() === vehicleId) matches.push(index);
  }
  if (matches.length !== 1) throw Error('車両の件数が不正です');
  const rowIndex = matches[0];
  const row = table[rowIndex];
  const driverId = String(row[columns.DriverID] ?? '').trim();
  const values = GF_LedgerProdProgressColumns_.map((key, index) => {
    const value = row[columns[key]] ?? '';
    return index === 0 ? String(value).trim() : GF_LedgerProdProgressDate_(value);
  });
  return {rowIndex, columns, snapshot: {vehicleId, driverId, values}};
}

/** 既存取消処理と同じプロジェクトのロック取得後、取消書込直前に呼び出す。 */
function GF_LedgerProdProgressAssertCancelable_(bookId, vehicleId, driverId) {
  const {snapshot} = GF_LedgerProdProgressRead_(bookId, vehicleId);
  const [stage, available, confirmed] = snapshot.values;
  if (snapshot.driverId !== driverId || !/^D\d{6}$/.test(driverId) ||
      stage !== '車両準備中' || available || confirmed) {
    throw Error('割当、進捗または納車日を確認してください。取消できません');
  }
}

/** 同一GASプロジェクト内の割当・取消処理も ScriptLock を共有する。 */
function GF_LedgerProdProgressSave_(bookId, expected, fields, resolveAssignment) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 本番の認証済み呼び出し元は受付に基づく割当確認をこのロック内で行う。
    if (resolveAssignment) {
      const assignment = resolveAssignment();
      if (assignment.vehicleId !== expected?.vehicleId || assignment.driverId !== expected?.driverId) {
        throw Error('受付の対象車両が変わりました。再読み込みしてください');
      }
    }
    const {snapshot, columns, rowIndex} = GF_LedgerProdProgressRead_(bookId, expected?.vehicleId);
    if (!/^D\d{6}$/.test(snapshot.driverId) || snapshot.driverId !== expected.driverId) {
      throw Error('車両とドライバーの割当が変わりました。再読み込みしてください');
    }
    if (GF_LedgerProdProgressColumns_.some(key => typeof fields?.[key] !== 'string')) {
      throw Error('進捗項目をすべて指定してください');
    }
    const values = [
      fields['管理区分'].trim(),
      GF_LedgerProdProgressDate_(fields['納車可能日']),
      GF_LedgerProdProgressDate_(fields['納車確定日']),
    ];
    const [stage, available, confirmed] = values;
    if (!GF_LedgerProdProgressStages_.includes(stage)) throw Error('管理区分が不正です');
    if (available && confirmed && confirmed < available) {
      throw Error('納車確定日は納車可能日以降を指定してください');
    }
    if (JSON.stringify(snapshot.values) === JSON.stringify(values)) {
      return {status: 'unchanged', snapshot};
    }
    if (JSON.stringify(snapshot.values) !== JSON.stringify(expected.values)) {
      throw Error('台帳が変更されました。再読み込みしてください');
    }

    const api = Sheets.Spreadsheets;
    const rowNumber = rowIndex + 1;
    const range = "'車両台帳'!" + rowNumber + ':' + rowNumber;
    const rowInfo = api.get(bookId, {
      ranges: [range],
      fields: 'sheets(properties(sheetId),data(rowData(values(userEnteredValue,effectiveValue))))',
    }).sheets?.[0];
    const rowCells = rowInfo?.data?.[0]?.rowData?.[0]?.values;
    if (!rowCells || !Number.isInteger(rowInfo.properties?.sheetId)) throw Error('台帳行を確認できません');
    const raw = key => {
      const value = rowCells[columns[key]]?.effectiveValue;
      if (value?.errorValue) throw Error('台帳セルにエラーがあります');
      return value?.stringValue ?? value?.numberValue ?? value?.boolValue ?? '';
    };
    const live = [String(raw('管理区分')).trim(),
      GF_LedgerProdProgressDate_(raw('納車可能日')), GF_LedgerProdProgressDate_(raw('納車確定日'))];
    if (String(raw('VehicleID')).trim() !== snapshot.vehicleId ||
        String(raw('DriverID')).trim() !== snapshot.driverId ||
        JSON.stringify(live) !== JSON.stringify(snapshot.values)) {
      throw Error('台帳が変更されました。再読み込みしてください');
    }
    const requests = GF_LedgerProdProgressColumns_.map((key, index) => {
      const columnIndex = columns[key];
      if (rowCells[columnIndex]?.userEnteredValue?.formulaValue) throw Error('数式セル: ' + key);
      const value = values[index];
      const cell = {};
      if (value) cell.userEnteredValue = index === 0 ? {stringValue: value} :
        {numberValue: Date.parse(value + 'T00:00:00Z') / 86400000 + 25569};
      return {updateCells: {
        start: {sheetId: rowInfo.properties.sheetId, rowIndex, columnIndex},
        rows: [{values: [cell]}],
        fields: 'userEnteredValue',
      }};
    });
    api.batchUpdate({requests}, bookId);
    const saved = GF_LedgerProdProgressRead_(bookId, expected.vehicleId).snapshot;
    if (saved.driverId !== snapshot.driverId || JSON.stringify(saved.values) !== JSON.stringify(values)) {
      throw Error('台帳保存結果が一致しません。再読み込みして確認してください');
    }
    return {status: 'saved', snapshot: saved};
  } finally {
    lock.releaseLock();
  }
}

/** 既存の車両差分同期後に呼ぶ。接続先と認証情報は現行同期GASの設定を使用する。 */
function GF_LedgerProdProgressVerifyReplica_(bookId, vehicleId) {
  const {snapshot} = GF_LedgerProdProgressRead_(bookId, vehicleId);
  if (GF_SB_対象ID_() !== bookId || GF_SB_ENV.SUPABASE_TABLE !== 'gf_vehicles') {
    throw Error('既存の車両同期先と一致しません');
  }
  const query = '?select=vehicle_id,vehicle_data&vehicle_id=eq.' + encodeURIComponent(vehicleId);
  const rows = GF_SB_v4API_(GF_SB_ENV.SUPABASE_TABLE, query, 'get');
  const replica = rows?.length === 1 && rows[0].vehicle_id === vehicleId ? rows[0].vehicle_data : null;
  if (!replica || GF_LedgerProdProgressColumns_.some(key =>
    !Object.prototype.hasOwnProperty.call(replica, key)
  )) return {status: 'pending'};
  const replicaValues = GF_LedgerProdProgressColumns_.map((key, index) => {
    const value = replica[key] ?? '';
    return index === 0 ? String(value).trim() : GF_LedgerProdProgressDate_(value);
  });
  const current = GF_LedgerProdProgressRead_(bookId, vehicleId).snapshot;
  const synced = String(replica.DriverID ?? '').trim() === snapshot.driverId &&
    JSON.stringify(replicaValues) === JSON.stringify(snapshot.values) &&
    JSON.stringify(current) === JSON.stringify(snapshot);
  return {status: synced ? 'synced' : 'pending'};
}
