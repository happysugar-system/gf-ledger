/** 既存の認証済み入口と契約照合から渡された受付を、台帳の割当に照合する。 */
function GF_LedgerProdProgressResolveReceipt_(bookId, application) {
  const trim = value => String(value ?? '').trim();
  const receiptId = trim(application?.receipt_id);
  const driverId = trim(application?.driver_id);
  const contracted = ['契約完了', '契約締結済', '契約締結済み'];
  if (!receiptId || !/^D\d{6}$/.test(driverId) ||
      !contracted.includes(trim(application?.contract_status))) {
    throw Error('確定DriverIDと契約済みの受付が必要です');
  }

  const ranges = ["'GF_LINEドライバー同期履歴'", "'名変待ち管理'", "'ドライバーマスター'"];
  const data = Sheets.Spreadsheets.Values.batchGet(bookId, {
    ranges, valueRenderOption: 'FORMATTED_VALUE',
  }).valueRanges;
  if (data?.length !== ranges.length) throw Error('割当の照合資料を取得できません');
  const history = GF_LedgerProdProgressRecords_(data[0].values,
    ['受付番号', '受付識別子', 'LINE受付ID', 'DriverID', '処理状態']);
  const matches = history.filter(row => row['受付番号'] === receiptId);
  if (matches.length !== 1) throw Error('受付とドライバーの照合を確定できません');
  const entry = matches[0];
  if (entry.DriverID !== driverId || entry['処理状態'] !== '登録済' ||
      !entry['受付識別子'] || !entry['LINE受付ID']) {
    throw Error('受付とドライバーの照合を確定できません');
  }

  const receiptKeys = ['受付識別子', 'LINE受付ID'];
  if (history.some(row => row !== entry && receiptKeys.some(key => row[key] === entry[key]))) {
    throw Error('別受付と照合キーが重複しています');
  }
  const assignments = GF_LedgerProdProgressRecords_(data[1].values,
    ['ステータス', '割当VehicleID'], [...receiptKeys, 'DriverID']);
  if (!receiptKeys.some(key => assignments.some(row => row[key]))) {
    throw Error('名変待ち管理に受付を照合できる情報がありません');
  }
  const assigned = assignments.filter(row => receiptKeys.some(key => row[key] === entry[key]));
  if (assigned.length !== 1) throw Error('受付の割当車両を一意に確認できません');
  const assignment = assigned[0];
  if (receiptKeys.some(key => assignment[key] && assignment[key] !== entry[key]) ||
      (assignment.DriverID && assignment.DriverID !== driverId) ||
      assignment['ステータス'] !== '割当済' || !/^V\d{6}$/.test(assignment['割当VehicleID'])) {
    throw Error('受付の割当情報が一致しません');
  }

  const vehicleId = assignment['割当VehicleID'];
  const drivers = GF_LedgerProdProgressRecords_(data[2].values, ['DriverID', '割当VehicleID'])
    .filter(row => row.DriverID === driverId);
  const current = GF_LedgerProdProgressRead_(bookId, vehicleId).snapshot;
  if (drivers.length !== 1 || drivers[0]['割当VehicleID'] !== vehicleId || current.driverId !== driverId) {
    throw Error('車両台帳とドライバーマスターの割当が一致しません');
  }
  return current;
}

function GF_LedgerProdProgressRecords_(values, required, optional = []) {
  const [header, ...rows] = values || [];
  const names = (header || []).map(value => String(value).trim());
  const columns = [...required, ...optional].map(key => {
    const index = names.indexOf(key);
    if (index !== names.lastIndexOf(key) || (index < 0 && required.includes(key))) {
      throw Error('割当照合の見出し不正: ' + key);
    }
    return [key, index];
  });
  return rows.map(row => Object.fromEntries(columns.map(([key, index]) =>
    [key, String(row[index] ?? '').trim()])));
}

/** 既存のスタッフ認可を通過した入口専用。application はサーバー取得の契約付き受付。 */
function GF_LedgerProdProgressSaveForReceipt_(bookId, application, expected, fields) {
  return GF_LedgerProdProgressSave_(bookId, expected, fields,
    () => GF_LedgerProdProgressResolveReceipt_(bookId, application));
}
