/**
 * Dedicated three-sheet validation history reader.
 * This intentionally does not call legacy GF_IsolatedValidationBook_ or
 * GF_MainReturnHistoryEnabled_, which are pinned to the seven-sheet workbook.
 * Read-only. No production fallback, no secret or receipt value logging.
 */
function GFA3_DB同期履歴照合_(book, receiptKey) {
  const expectedBook = '1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0';
  if (!book || book.getId() !== expectedBook) throw Error('three_sheet_book_required');
  if (ScriptApp.getScriptId() !== '1h5czlOaSO0WeERVDxiGajVipVL4PAVyWPdaIB0kGVZsR11GMU12JwEE-' ||\n      PropertiesService.getScriptProperties().getProperty('GF3_APPROVED_BOOK_ID') !== expectedBook ||\n      PropertiesService.getScriptProperties().getProperty('GF3_VALIDATION_ENABLED') !== 'true')\n    throw Error('three_sheet_target_denied');
  const key = String(receiptKey || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(key)) throw Error('history_key_invalid');
  const token = PropertiesService.getScriptProperties().getProperty('GF3_SYNC_TEST_TOKEN') || '';
  if (token.length < 32) throw Error('history_token_missing');
  const response = UrlFetchApp.fetch('https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf3-sync-storage-test', {
    method: 'post', contentType: 'application/json',
    headers: {'x-gf3-sync-token': token},
    payload: JSON.stringify({action:'read',kind:'history',id:key}),
    followRedirects: false, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw Error('history_http_' + response.getResponseCode());
  let payload;
  try { payload = JSON.parse(response.getContentText()); }
  catch (_) { throw Error('history_invalid_json'); }
  if (payload?.ok !== true || !Array.isArray(payload.data) || payload.data.length > 1) {
    throw Error('history_invalid_response');
  }
  if (!payload.data.length) return null;
  const row = payload.data[0];
  if (!row || String(row.receipt_key || '').toLowerCase() !== key) throw Error('history_key_mismatch');
  return {
    '処理状態': String(row.state || ''),
    'LINE受付ID': String(row.line_receipt_id || ''),
    DriverID: String(row.driver_id || '')
  };
}
