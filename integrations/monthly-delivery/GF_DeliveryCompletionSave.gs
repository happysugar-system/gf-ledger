/** Internal server-side writer. Only call from an authenticated staff handler.
 * Validation workbook only; no production write route.
 * resolveAssignment must read the verified assignment from the existing server-side source.
 */
function GF_DeliveryCompletionSave_(bookId,request,resolveAssignment){
 if(typeof GF_ReceiptAssignmentValidationBook_!=='function'||bookId!==GF_ReceiptAssignmentValidationBook_())throw Error('validation_book_only');
 if(typeof resolveAssignment!=='function')throw Error('assignment_resolver_required');
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
 const book=SpreadsheetApp.openById(bookId);
 const ledger=book.getSheetByName('車両台帳'),history=book.getSheetByName('実績履歴');
 if(!ledger||!history)throw Error('missing_sheet');
 const read=sh=>{const [headers,...rows]=sh.getDataRange().getDisplayValues();if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw Error('duplicate_header');return {headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])))};};
 const l=read(ledger),h=read(history);
 for(const k of ['VehicleID','DriverID','現在使用者','納車予定日','紹介元'])if(!l.headers.includes(k))throw Error('ledger_header_missing:'+k);
 for(const k of ['受付ID','登録日時','VehicleID','種類','実施日','状態','変更後JSON','取消日時'])if(!h.headers.includes(k))throw Error('history_header_missing:'+k);
 const vehicles=l.rows.filter(r=>r.VehicleID===request.vehicleId);
 if(vehicles.length!==1)throw Error('vehicle_not_unique');
 const assignment=resolveAssignment(request.receiptId);
 const plan=GF_DeliveryCompletionPlan_(vehicles[0],assignment,h.rows,request);
 if(plan.state==='unchanged')return {status:'verified',eventId:plan.eventId};
 const row={...plan.history,'登録日時':Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')};
 // RAW prevents spreadsheet formula interpretation of identifiers or snapshot text.
 try{Sheets.Spreadsheets.Values.append({values:[h.headers.map(k=>row[k]??'')]},bookId,"'実績履歴'!A1",{valueInputOption:'RAW',insertDataOption:'INSERT_ROWS'});}catch(e){/* Verify even if the transport response was lost. */}
 const after=read(history);
 const verified=GF_DeliveryCompletionPlan_(vehicles[0],assignment,after.rows,request);
 if(verified.state!=='unchanged')throw Error('completion_write_unconfirmed');
 return {status:'verified',eventId:plan.eventId};
 }finally{lock.releaseLock();}
}
