/** Review-only boundary. No production fallback. */
function GF_IsolatedValidationBook_(book) {
  if (!book || book.getId() !== '1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU')
    throw Error('validation_book_required');
  return book;
}
function GF_IsolatedValidationOpen_() {
  return GF_IsolatedValidationBook_(SpreadsheetApp.openById('1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU'));
}
function GF_IsolatedValidationExternal_(kind) {
  throw Error('validation_external_blocked:' + kind);
}
function GF_IsolatedValidationSheet_(sheet) {
  if (!sheet) throw Error('validation_sheet_required');
  GF_IsolatedValidationBook_(sheet.getParent());
  return sheet;
}

/** Only the existing demo worker is allowed; no arbitrary URLs or redirects. */
function GF_IsolatedValidationSupabase_(book, action, body) {
  GF_IsolatedValidationBook_(book);
  if (!['health','observe'].includes(action)) throw Error('validation_action_denied');
  const token=PropertiesService.getScriptProperties().getProperty('GF_VEHICLE_DEMO_SYNC_TOKEN');
  if (!token || token.length<32) throw Error('validation_token_missing');
  if (!body || body.vehicle_id !== 'V999999') throw Error('validation_vehicle_denied');
  const response=UrlFetchApp.fetch('https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-vehicle-save-worker-v2-test',{
    method:'post',contentType:'application/json',headers:{'x-gf-sync-token':token},
    payload:JSON.stringify({...body,action}),followRedirects:false,muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200) throw Error('validation_api_failed');
  return JSON.parse(response.getContentText());
}
