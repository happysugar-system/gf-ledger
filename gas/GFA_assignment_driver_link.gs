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
