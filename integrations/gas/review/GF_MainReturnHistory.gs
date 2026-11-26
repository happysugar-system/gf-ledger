/** Verification switch scoped to the existing ledger test workbook. */
function GF_MainReturnHistoryEnabled_(book) {
  if (PropertiesService.getScriptProperties().getProperty('GF_TEST_RETURN_HISTORY_ENABLED') !== 'true') return false;
  if (book.getId() !== '1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU') throw Error('return_history_validation_book_required');
  return true;
}

function GF_MainReturnHistoryKeys_() {
  return ['DriverID','現在使用者','📄 最新車両書類',
    '前DriverID','前使用者','前使用者 車両書類','前々DriverID','前々使用者','前々使用者 車両書類'];
}

function GF_MainReturnHistoryColumns_(sheet, keys) {
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(s => s.trim());
  return Object.fromEntries(keys.map(key => {
    const col = headers.indexOf(key);
    if (col < 0 || col !== headers.lastIndexOf(key)) throw Error('return_history_header_invalid: ' + key);
    return [key, col];
  }));
}

function GF_MainReturnHistoryRead_(sheet, row) {
  const keys = GF_MainReturnHistoryKeys_();
  const cols = GF_MainReturnHistoryColumns_(sheet, keys);
  return Object.fromEntries(keys.map(key => {
    const cell = sheet.getRange(row, cols[key] + 1);
    const formula = cell.getFormula();
    if (!key.includes('書類')) {
      if (formula) throw Error('return_history_formula');
      return [key, cell.getDisplayValue()];
    }
    const rich = cell.getRichTextValue();
    const href = rich?.getLinkUrl() || formula.match(/^=HYPERLINK\(\s*"(https:\/\/[^"]+)"/i)?.[1];
    const value = href || cell.getDisplayValue();
    if ((formula && !href) || (value && !/^https:\/\/(drive|docs)\.google\.com\/[^\s]+$/.test(value))) {
      throw Error('return_history_link_unresolved');
    }
    return [key, value];
  }));
}

function GF_MainReturnHistoryMatches_(v, expected) {
  const current = GF_MainReturnHistoryRead_(v.sheet, v.row);
  return GF_MainReturnHistoryKeys_().every(key => current[key] === expected[key]);
}

/** Writes only the changed cells, with an atomic Sheets batch. */
function GF_MainReturnHistoryWrite_(book, sheet, row, update) {
  const cols = GF_MainReturnHistoryColumns_(sheet, Object.keys(update));
  const requests = Object.entries(update).map(([key,value]) => {
    const range = sheet.getRange(row, cols[key] + 1);
    const document = key.includes('書類');
    if (range.getFormula() && !document) throw Error('return_history_formula');
    const cell = {userEnteredValue: {stringValue: String(value ?? '')}};
    if (value instanceof Date) {
      const local = Utilities.formatDate(value, book.getSpreadsheetTimeZone(), "yyyy-MM-dd'T'HH:mm:ss.SSS");
      cell.userEnteredValue = {numberValue: Date.parse(local + 'Z') / 86400000 + 25569};
    }
    if (document) {
      cell.textFormatRuns = value ? [{startIndex:0,format:{link:{uri:value}}}] : [];
    }
    return {updateCells:{
      start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:cols[key]},
      rows:[{values:[cell]}],
      fields:document ? 'userEnteredValue,textFormatRuns' : 'userEnteredValue',
    }};
  });
  SpreadsheetApp.flush();
  Sheets.Spreadsheets.batchUpdate({requests}, book.getId());
}

function GF_MainReturnHistoryDelta_(before, after) {
  return Object.fromEntries(GF_MainReturnHistoryKeys_().filter(key => before[key] !== after[key])
    .map(key => [key, after[key]]));
}

function GF_MainReturnHistoryPrepare_(book, receipt, vehicle) {
  if (String(receipt[3]) !== '返却完了' || !GF_MainReturnHistoryEnabled_(book)) return null;
  const plan = GF_OperationalHistoryPlan_(GF_MainReturnHistoryRead_(vehicle.sheet,vehicle.row),{
    id:String(receipt[0]), vehicleId:String(receipt[2]), driverId:String(receipt[5]).trim(), kind:'return',
  });
  // BJ is the vehicle's shared current PDF, also projected into R and M.
  // Preserve it while archiving the outgoing driver's document in the previous slot.
  plan.record.after['📄 最新車両書類'] = plan.before['📄 最新車両書類'];
  return plan.record;
}

function GF_MainReturnHistoryRecorded_(book, receipt) {
  const operation = GF_実績履歴の対象_26(book,String(receipt[0]));
  if (!operation) return null;
  const before = JSON.parse(String(operation.data[6] || '{}')).gfReturnHistory;
  if (!before) return null;
  const after = JSON.parse(String(operation.data[7] || '{}')).gfReturnHistory;
  if (!after || String(operation.data[2]) !== String(receipt[2]) || !GF_MainReturnHistoryEnabled_(book)) {
    throw Error('return_history_record_invalid');
  }
  return {before,after};
}

function GF_MainReturnHistoryResume_(book, receipt, vehicle) {
  const history = GF_MainReturnHistoryRecorded_(book,receipt);
  return !history || GF_MainReturnHistoryMatches_(vehicle,history.after);
}
