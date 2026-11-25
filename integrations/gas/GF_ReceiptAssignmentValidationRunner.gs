/** Validation-only source reader. No writes. */
function GF_ReceiptAssignmentValidationSource_(request,expectedKey) {
  const book='12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8';
  const result=Sheets.Spreadsheets.Values.batchGet(book,{
    ranges:["'LINE受付管理'!A1:Z","'車両依頼受付'!A1:AZ"],
    valueRenderOption:'FORMATTED_VALUE'
  }).valueRanges;
  if(!result||result.length!==2)throw Error('receipt_source_read_failed');
  return GF_ReceiptAssignmentSourceCheck_(result[0].values,result[1].values,request,expectedKey);
}
/** Internal validation runner. Only a trusted queue worker may supply the claim
 * and current-operation assertion. Never expose as a public doPost.
 */
function GF_ReceiptAssignmentValidationRun_(row,assertCurrentOperation) {
  const book='1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU';
  if(typeof GF_SB_対象ID_!=='function'||GF_SB_対象ID_()!==book)
    throw Error('validation_target_mismatch');
  return GF_ReceiptAssignmentRunClaimed_(book,row,assertCurrentOperation,GF_ReceiptAssignmentValidationSource_);
}
