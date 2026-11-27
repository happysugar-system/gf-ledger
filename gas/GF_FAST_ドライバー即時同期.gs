/** Vehicle management test GAS only. Calls the existing GF138 registration path. */
function GF_FAST_driverEndpoint_(e) {
  const p = (e && e.parameter) || {};
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('GF_FAST_DRIVER_SECRET') || '';
  const vehicleBook = props.getProperty('GF_FAST_VEHICLE_TEST_BOOK_ID');
  const lineBook = props.getProperty('GF_FAST_LINE_TEST_BOOK_ID');
  const started = Date.now();
  const json = data => ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  try {
    if (secret.length < 48 || p.secret !== secret || !/^[a-f0-9]{64}$/i.test(p.request || '') ||
        !vehicleBook || !lineBook || vehicleBook === lineBook || GF138_LINE_BOOK_ID !== lineBook ||
        対象スプレッドシートを開く_().getId() !== vehicleBook) return json({ok:false});
    GF138_車両依頼を同期_本体_(p.request);
    const log = 対象スプレッドシートを開く_().getSheetByName(GF138_LOG_SHEET);
    if (!log || log.getLastRow() < 2) return json({ok:false});
    const rows = log.getRange(2,1,log.getLastRow()-1,4).getDisplayValues();
    const matches = rows.filter(row=>row[0]===p.request);
    const ok = matches.length === 1 && ['登録済','要確認'].includes(matches[0][3]);
    console.log(JSON.stringify({event:'gf_fast_driver_sync', ms:Date.now()-started, ok}));
    return json({ok});
  } catch (error) {
    return json({ok:false});
  }
}
