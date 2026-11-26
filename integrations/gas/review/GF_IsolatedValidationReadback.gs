/** Validation substitute for the 30-series synchronization. No external writes. */

function GF_IsolatedValidationReceipt_(id) {
  if (!id || id !== PropertiesService.getScriptProperties().getProperty('GF_VALIDATION_RETURN_RECEIPT_ID')) {
    throw Error('validation_receipt_denied');
  }
}

function GF_IsolatedValidationVehicle_(id) {
  if (!/^V9\d{5}$/.test(id) || id !== PropertiesService.getScriptProperties().getProperty('GF_VALIDATION_RETURN_VEHICLE_ID')) {
    throw Error('validation_vehicle_denied');
  }
}

function GF_IsolatedValidationQueue_(book) {
  GF_IsolatedValidationBook_(book);
  if (!GF_MainReturnHistoryEnabled_(book)) throw Error('validation_return_disabled');
  const sheet = GF_IsolatedValidationSheet_(book.getSheetByName('実績登録キュー'));
  const id = PropertiesService.getScriptProperties().getProperty('GF_VALIDATION_RETURN_RECEIPT_ID');
  GF_IsolatedValidationReceipt_(id);
  if (sheet.getDataRange().getValues().slice(1).filter(r => String(r[0]) === id).length !== 1) {
    throw Error('validation_receipt_not_unique');
  }
  return sheet;
}

function GF_実績車両情報_(book,id) {
  GF_IsolatedValidationBook_(book);
  GF_IsolatedValidationVehicle_(id);
  const sheet = GF_IsolatedValidationSheet_(book.getSheetByName('車両台帳'));
  const [headers,...rows] = sheet.getDataRange().getDisplayValues();
  const cols = GF_MainReturnHistoryColumns_(sheet,['VehicleID']);
  const matches = rows.map((row,i) => ({row,i})).filter(entry => entry.row[cols.VehicleID] === id);
  if (matches.length !== 1) throw Error('validation_vehicle_not_unique');
  const [match] = matches;
  return {sheet,row:match.i+2,data:Object.fromEntries(headers.map((header,i) => [header.trim(),match.row[i]]))};
}

function GF_IsolatedValidationColumn_(sheet,key) {
  GF_IsolatedValidationSheet_(sheet);
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].indexOf(key)+1;
}

function GF_IsolatedValidationReread_(book,row,id,expected) {
  SpreadsheetApp.flush();
  const current = GF_実績車両情報_(book,id);
  if (current.row !== row || !expected || !GF_MainReturnHistoryMatches_(current,expected)) {
    throw Error('validation_readback_mismatch');
  }
}

function GF_検証Supabase接続診断() {
  const response = GF_IsolatedValidationSupabase_(GF_IsolatedValidationOpen_(),'health',{vehicle_id:'V999999'});
  return {connected:response?.ok === true};
}

function GF_検証返却取消() {
  const id = PropertiesService.getScriptProperties().getProperty('GF_VALIDATION_RETURN_RECEIPT_ID');
  return GF_実績取消を実行する_26(id);
}
