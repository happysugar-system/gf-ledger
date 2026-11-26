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
