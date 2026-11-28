/** Validation-only source13 adapter. All Drive writes require an explicitly provisioned isolated root. */
function GF3_VehicleDocumentSave_(id,blobs){
 const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
 GF3_AssertBook_(book);
 if(!GF3_WriteEnabled_(book))throw Error('gf3_document_disabled');
 if(!/^V9\d{5}$/.test(id)||!Array.isArray(blobs)||blobs.length!==3)throw Error('gf3_document_input');
 // Do not create files until the isolated Drive root and trusted receipt reservation are connected.
 throw Error('gf3_document_drive_reservation_required');
}
function GF3_VehicleDocumentCancel_(id){
 const book=SpreadsheetApp.openById('1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0');
 GF3_AssertBook_(book);
 if(!GF3_WriteEnabled_(book))throw Error('gf3_document_disabled');
 const row=GF3_DocumentStorage_(book,'read',id)[0];
 if(row.state==='取消済')return {成功:true};
 // Latest receipt check must be atomic before changing the ledger or Drive.
 throw Error('gf3_document_latest_receipt_guard_required');
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
