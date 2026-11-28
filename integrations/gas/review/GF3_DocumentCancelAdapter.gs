/** Isolated vehicle document cancellation. Receipt must be loaded from trusted server storage, never client fields. */
function GF3_DocumentCancelRestore_(book,receipt){
 GF3_AssertBook_(book);
 if(!GF3_DocumentWriteEnabled_(book))throw Error('validation_disabled');
 if(!receipt||receipt.kind!=='車両書類'||receipt.state!=='完了'||!/^TEST-GF3-[A-Z0-9-]+$/.test(receipt.id||''))throw Error('document_receipt_invalid');
 const field='📄 最新車両書類',id=receipt.vehicleId,old=receipt.previousUrl,newUrl=receipt.newUrl;
 GF3_LegacyProjectionPlan_(id,'document',{[field]:newUrl});
 if(old) {
  const result=GF3_DocumentReplacementApply_(book,id,field,newUrl,old);
  return {restored:true,state:result.state,driveDeleted:false};
 }
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(1000))throw Error('projection_busy');
 try{
  const v=GF3_GF_DB同期車両情報_(book,id);
  const col=GF3_Columns_(v.sheet,[field])[field]+1;
  const cell=v.sheet.getRange(v.row,col);
  if(cell.getFormula())throw Error('formula_protected');
  const rich=cell.getRichTextValue();
  if(cell.getValue()==='')return {restored:true,state:'already_applied',driveDeleted:false};
  if(!rich||rich.getLinkUrl()!==newUrl)throw Error('document_cancel_conflict');
  try{
   cell.clearContent();SpreadsheetApp.flush();
   if(cell.getValue()!=='')throw Error('document_cancel_readback_failed');
  }catch(e){
   if(cell.getValue()===''){cell.setRichTextValue(rich);SpreadsheetApp.flush();}
   else if(!cell.getRichTextValue()||cell.getRichTextValue().getLinkUrl()!==newUrl)throw Error('document_cancel_manual_review');
   throw e;
  }
  return {restored:true,state:'restored_blank',driveDeleted:false};
 }finally{lock.releaseLock();}
}
