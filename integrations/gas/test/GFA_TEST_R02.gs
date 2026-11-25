/** 検証用GAS専用。本番GASには追加しない。 */
function GFA_TEST_R02_実地確認() {
  const props = PropertiesService.getScriptProperties();
  const vehicleId = props.getProperty('GFA_APPROVED_BOOK_ID');
  const lineId = props.getProperty('GFA_APPROVED_LINE_BOOK_ID');
  if (!vehicleId || !lineId || vehicleId === lineId ||
      props.getProperty('GFA_WAITING_LINK_ENABLED') !== 'true') throw Error('検証用設定を確認してください');
  const vehicle = SpreadsheetApp.openById(vehicleId);
  const line = SpreadsheetApp.openById(lineId);
  if (vehicle.getName() !== 'GOLD FIRST 割当統合検証専用（ダミーデータ）' ||
      line.getName() !== 'GOLD FIRST LINE受付統合検証専用（ダミーデータ）') {
    throw Error('検証専用の2冊を確認してください');
  }
  const sheet = vehicle.getSheetByName('名変待ち管理');
  const read = () => sheet.getDataRange().getDisplayValues();
  const before = read();
  const head = before[0];
  const col = name => {
    const i = head.indexOf(name);
    if (i < 0 || head.lastIndexOf(name) !== i) throw Error('見出し不正: ' + name);
    return i;
  };
  const receipt = col('LINE受付ID');
  const driver = col('DriverID');
  const row = before.findIndex(r => r[receipt] === 'TEST-R02');
  if (row < 1 || before.filter(r => r[receipt] === 'TEST-R02').length !== 1 ||
      before[row][col('ステータス')] !== '名変待ち' ||
      before[row][col('割当VehicleID')] || before[row][driver] ||
      before[row][col('受付識別子')] !== 'b'.repeat(64)) throw Error('TEST-R02の初回条件を確認してください');
  const diagnostic = GFA_名変待ちDriverID診断();
  if (diagnostic.ready !== 1 || diagnostic.review || diagnostic.pending) throw Error('診断結果を確認してください');
  const first = GFA_GF138後続同期_();
  const retry = GFA_GF138後続同期_();
  const duplicate = GFA_名変待ち受付登録_('TEST-R02', 'b'.repeat(64));
  const expected = before.map(r => r.slice());
  expected[row][driver] = 'D999902';
  if (first.updated !== 1 || retry.updated !== 0 || duplicate.state !== 'already_registered' ||
      JSON.stringify(read()) !== JSON.stringify(expected)) throw Error('実地結果の照合に失敗しました');
  const result = {diagnostic, first, retry, duplicate};
  console.log(JSON.stringify(result));
  return result;
}
