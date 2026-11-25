/** Internal adapter for the existing authenticated staff worker.
 * Dependencies must be supplied by server-side code, never request JSON.
 * Validation only until the existing worker and synchronization are connected.
 */
function GF_DeliveryCompletionDispatch_(request,context){
 if(!context||typeof context.authorizeStaff!=='function'||context.authorizeStaff()!==true)throw Error('staff_access_denied');
 if(!request||request.action!=='delivery_complete')throw Error('invalid_action');
 if(typeof context.resolveAssignment!=='function'||typeof context.verifyExisting!=='function')throw Error('worker_not_connected');
 const payload={receiptId:String(request.receiptId??'').trim(),vehicleId:String(request.vehicleId??'').trim(),driverId:String(request.driverId??'').trim(),date:String(request.date??'').trim()};
 const result=GF_DeliveryCompletionSave_(context.bookId,payload,context.resolveAssignment);
 if(result.status!=='verified')return {status:'reconciliation_required'};
 try{
 if(typeof context.syncExisting==='function')context.syncExisting();
 if(context.verifyExisting(payload,result.eventId)!==true)return {status:'reconciliation_required',eventId:result.eventId};
 return {status:'verified',eventId:result.eventId};
 }catch(e){return {status:'reconciliation_required',eventId:result.eventId};}
}
