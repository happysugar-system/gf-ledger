/** Delete only a cancelled synthetic receipt folder beneath the fixed GF3 root.
 * Called after DB cancellation commits. Never uses client-supplied folder IDs.
 */
function GF3_DocumentCancelDriveCleanup_(book,receipt){
 GF3_AssertBook_(book);
 if(!GF3_DocumentWriteEnabled_(book))throw Error('gf3_document_disabled');
 if(!receipt||receipt.state!=='取消済'||receipt.kind!=='車両書類'||
    !/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(receipt.id||'')||
    !/^V9\d{5}$/.test(receipt.vehicleId||''))throw Error('gf3_cleanup_receipt');
 const match=/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/view$/.exec(receipt.newUrl||'');
 if(!match)throw Error('gf3_cleanup_url');
 const pdf=DriveApp.getFileById(match[1]);
 if(pdf.getId()!==match[1]||pdf.getName()!=='車両書類一式.pdf')throw Error('gf3_cleanup_pdf_mismatch');
 const parentOf=x=>{
  const it=x.getParents();
  if(!it.hasNext())throw Error('gf3_cleanup_parent_missing');
  const p=it.next();
  if(it.hasNext())throw Error('gf3_cleanup_multiple_parents');
  return p;
 };
 const folder=parentOf(pdf);
 const expected=[receipt.id,'車両書類',receipt.vehicleId,'01_車両','GOLD FIRST GF3 検証専用書類（ダミーのみ）'];
 let cur=folder;
 for(let i=0;i<expected.length;i++){
  if(cur.getName()!==expected[i])throw Error('gf3_cleanup_path_mismatch');
  if(i===expected.length-1){
   if(cur.getId()!=='1WMPFMkP292gilphGsqbTV8God81x7AiM'||cur.isTrashed())throw Error('gf3_cleanup_root_mismatch');
  }else cur=parentOf(cur);
 }
 if(folder.isTrashed())return {state:'already_archived',driveDeleted:true};
 folder.setTrashed(true);
 if(!folder.isTrashed())throw Error('gf3_cleanup_verify_failed');
 return {state:'archived',driveDeleted:true};
}
