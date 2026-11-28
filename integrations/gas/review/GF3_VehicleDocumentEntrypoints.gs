/** Isolated vehicle document orchestration. Failed operations retain evidence for review. */
/** GF3 document-only write gate; never signals 3-sheet migration completion.
 * Requires an operator-enabled isolated gate after a dummy-data preflight.
 */
function GF3_DocumentWriteEnabled_(book){
 GF3_AssertBook_(book);
 const p=PropertiesService.getScriptProperties();
 return p.getProperty('GF3_DOCUMENT_TEST_ENABLED')==='true' &&
        p.getProperty('GF3_VALIDATION_ENABLED')==='true' &&
        p.getProperty('GF3_DOCUMENT_TEST_VEHICLE_ID')==='V900005';
}
/** Validate a single synthetic fixture without modifying any sheet, DB or Drive. */
function GF3_DocumentTestPreflight_(){
 const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
 GF3_AssertBook_(book);
 const v=GF3_GF_DB同期車両情報_(book,'V900005');
 if(!v||!v.sheet||v.sheet.getName()!=='車両台帳')throw Error('gf3_document_fixture_missing');
 const cols=GF3_Columns_(v.sheet,['VehicleID','📄 最新車両書類','📁 車両書類フォルダ']);
 const id=String(v.sheet.getRange(v.row,cols.VehicleID+1).getValue()||'').trim();
 if(id!=='V900005')throw Error('gf3_document_fixture_id');
 for(const field of ['📄 最新車両書類','📁 車両書類フォルダ']){
  const cell=v.sheet.getRange(v.row,cols[field]+1);
  if(cell.getFormula())throw Error('gf3_document_fixture_formula:'+field);
  const value=cell.getValue(),rich=cell.getRichTextValue(),url=rich&&rich.getLinkUrl()||'';
  if(value!==''&&value!==null&&!url)throw Error('gf3_document_fixture_link_unverified:'+field);
  if(url&&!/^https:\/\/drive\.google\.com\//.test(url))throw Error('gf3_document_fixture_link_external:'+field);
 }
 console.log(JSON.stringify({ready:true,vehicleId:id,documentWriteEnabled:GF3_DocumentWriteEnabled_(book)}));
 return {ready:true,vehicleId:id,documentWriteEnabled:GF3_DocumentWriteEnabled_(book)};
}

function GF3_VehicleDocumentSave_(id,blobs,requestId){
 const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
 GF3_AssertBook_(book);
 if(!GF3_DocumentWriteEnabled_(book))throw Error('gf3_document_disabled');
 if(id!=='V900005'||!Array.isArray(blobs)||blobs.length!==3)throw Error('gf3_document_input');
 const v=GF3_GF_DB同期車両情報_(book,id),field='📄 最新車両書類';
 const cell=v.sheet.getRange(v.row,GF3_Columns_(v.sheet,[field])[field]+1);
 if(cell.getFormula())throw Error('formula_protected');
 const rich=cell.getRichTextValue(),previous=rich&&rich.getLinkUrl()||'';
 if(!previous&&cell.getValue()!=='')throw Error('gf3_document_existing_link_unverified');
 const receipt=requestId||'TEST-GF3-'+Utilities.getUuid().toUpperCase();
 if(!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(receipt))throw Error('gf3_document_id');
 if(requestId){
  let existing;
  try{existing=GF3_DocumentStorage_(book,'read',receipt)[0];}
  catch(e){if(e.message!=='gf3_document_receipt_missing')throw e;}
  if(existing){
   if(existing.vehicle_id!==id||existing.kind!=='車両書類')throw Error('gf3_document_receipt_conflict');
   if(existing.state!=='完了')throw Error('gf3_document_existing_'+existing.state+':'+receipt);
   if(previous!==existing.new_url)throw Error('gf3_document_superseded');
   return {成功:true,種類:'車両書類',車番:String(v.data['車番']||''),氏名:String(v.data['現在使用者']||''),PDFURL:existing.new_url,取消情報:{種類:'車両書類',受付ID:receipt,VehicleID:id}};
  }
 }
 // Reject unsupported images before creating a document receipt. Never log document bytes.
 const unsupported=blobs.findIndex(blob=>{
  if(!blob||typeof blob.getBytes!=='function')return true;
  try{return !GF_JPEG情報を読む_60(blob);}catch(e){return true;}
 });
 if(unsupported>=0)throw Error('gf3_document_jpeg_unsupported:image_'+(unsupported+1));
 const transition=(expected,next)=>GF3_DocumentStorage_(book,'transition',receipt,{expected,next});
 GF3_DocumentStorage_(book,'insert',receipt,{receipt_id:receipt,vehicle_id:id,kind:'車両書類',previous_url:previous});
 transition('待機','保存中');
 try{
 const files=GF3_PrepareVehicleDocumentFiles_(book,id,receipt,blobs);
 GF3_DocumentStorage_(book,'attach',receipt,{fileId:files.fileId});
 const url='https://drive.google.com/file/d/'+files.fileId+'/view';
 GF3_LegacyProjectionApply_(book,id,'document',{'📁 車両書類フォルダ':files.parentUrl});
 if(previous)GF3_DocumentReplacementApply_(book,id,field,previous,url);
 else GF3_LegacyProjectionApply_(book,id,'document',{[field]:url});
 transition('保存中','完了');
 return {成功:true,種類:'車両書類',車番:String(v.data['車番']||''),氏名:String(v.data['現在使用者']||''),PDFURL:url,取消情報:{種類:'車両書類',受付ID:receipt,VehicleID:id,フォルダID:files.folderId}};
 }catch(e){try{transition('保存中','要確認');}catch(ignore){}throw Error('gf3_document_review:'+receipt);}
}
function GF3_VehicleDocumentCancel_(id){
 const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
 GF3_AssertBook_(book);
 if(!GF3_DocumentWriteEnabled_(book))throw Error('gf3_document_disabled');
 const row=GF3_DocumentStorage_(book,'read',id)[0];
 const cleanup=()=>{
  try{return GF3_DocumentCancelDriveCleanup_(book,{
   id:row.receipt_id,vehicleId:row.vehicle_id,kind:row.kind,
   state:'取消済',newUrl:row.new_url
  });}
  catch(e){console.error('gf3_document_drive_cleanup_pending:'+id+':'+e.message);
   return {state:'要確認',driveDeleted:false};}
 };
 if(row.state==='取消済')return {成功:true,driveCleanup:cleanup().state};
 const transition=(expected,next)=>GF3_DocumentStorage_(book,'transition',id,{expected,next});
 transition('完了','取消中');
 try{
 GF3_DocumentCancelRestore_(book,{kind:row.kind,state:row.state,id:row.receipt_id,vehicleId:row.vehicle_id,previousUrl:row.previous_url,newUrl:row.new_url});
 transition('取消中','取消済');
 return {成功:true,driveCleanup:cleanup().state};
 }catch(e){try{transition('取消中','要確認');}catch(ignore){}throw Error('gf3_document_cancel_review:'+id);}
}
/** Prepare a PDF and original images under the fixed isolated root only.
 * Not a public entrypoint; caller must reserve a receipt before invoking.
 */
function GF3_PrepareVehicleDocumentFiles_(book,id,receiptId,blobs){
 GF3_AssertBook_(book);
 if(!GF3_DocumentWriteEnabled_(book))throw Error('gf3_document_disabled');
 if(id!=='V900005'||!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(receiptId)||!Array.isArray(blobs)||blobs.length!==3)throw Error('gf3_document_input');
 const root=DriveApp.getFolderById('1WMPFMkP292gilphGsqbTV8God81x7AiM');
 if(root.getName()!=='GOLD FIRST GF3 検証専用書類（ダミーのみ）'||root.isTrashed())throw Error('gf3_document_root');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 const child=(parent,name)=>{const it=parent.getFoldersByName(name);if(!it.hasNext())return parent.createFolder(name);const f=it.next();if(it.hasNext()||f.isTrashed())throw Error('gf3_document_folder_conflict');return f;};
 const parent=child(child(child(root,'01_車両'),id),'車両書類');
 if(parent.getFoldersByName(receiptId).hasNext())throw Error('gf3_document_receipt_folder_exists');
 const pdf=車両書類PDFを作る_('車両書類一式_'+id,blobs);
 const folder=parent.createFolder(receiptId);
 const originals=folder.createFolder('元画像');
 blobs.forEach((b,i)=>originals.createFile(b.copyBlob().setName('車両書類_'+String(i+1).padStart(2,'0')+'.'+MIMEから拡張子を取得する_(b.getContentType()))));
 const file=folder.createFile(pdf.setName('車両書類一式.pdf'));
 return {folderId:folder.getId(),fileId:file.getId(),url:file.getUrl(),parentUrl:parent.getUrl()};
 }finally{lock.releaseLock();}
}
