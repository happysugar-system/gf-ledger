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
