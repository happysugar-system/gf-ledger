/** Isolated vehicle document orchestration. Failed operations retain evidence for review. */
function GF3_VehicleDocumentSave_(id,blobs,requestId){
 const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
 GF3_AssertBook_(book);
 if(!GF3_WriteEnabled_(book))throw Error('gf3_document_disabled');
 if(!/^V9\d{5}$/.test(id)||!Array.isArray(blobs)||blobs.length!==3)throw Error('gf3_document_input');
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
 if(!GF3_WriteEnabled_(book))throw Error('gf3_document_disabled');
 const row=GF3_DocumentStorage_(book,'read',id)[0];
 if(row.state==='取消済')return {成功:true};
 const transition=(expected,next)=>GF3_DocumentStorage_(book,'transition',id,{expected,next});
 transition('完了','取消中');
 try{
 GF3_DocumentCancelRestore_(book,{kind:row.kind,state:row.state,id:row.receipt_id,vehicleId:row.vehicle_id,previousUrl:row.previous_url,newUrl:row.new_url});
 transition('取消中','取消済');
 return {成功:true};
 }catch(e){try{transition('取消中','要確認');}catch(ignore){}throw Error('gf3_document_cancel_review:'+id);}
}
/** Prepare a PDF and original images under the fixed isolated root only.
 * Not a public entrypoint; caller must reserve a receipt before invoking.
 */
function GF3_PrepareVehicleDocumentFiles_(book,id,receiptId,blobs){
 GF3_AssertBook_(book);
 if(!GF3_WriteEnabled_(book))throw Error('gf3_document_disabled');
 if(!/^V9\d{5}$/.test(id)||!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(receiptId)||!Array.isArray(blobs)||blobs.length!==3)throw Error('gf3_document_input');
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
