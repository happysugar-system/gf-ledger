/** Queue adapter for the authenticated staff worker. Not a public GAS endpoint.
 * The caller must obtain the row from the server-owned queue, not the browser.
 * No deployment or trigger changes are performed by this file.
 */
function GF_ReceiptAssignmentQueueRequest_(row) {
  if (!row || row.state !== 'processing' ||
      typeof row.request_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.request_id) ||
      typeof row.actor_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.actor_id) ||
      typeof row.receipt_id !== 'string' || !row.receipt_id.trim() ||
      row.receipt_id !== row.receipt_id.trim() || row.receipt_id.length > 150 ||
      /[\r\n]/.test(row.receipt_id) ||
      typeof row.driver_id !== 'string' || !/^D\d{6}$/.test(row.driver_id) ||
      typeof row.vehicle_id !== 'string' || !/^V\d{6}$/.test(row.vehicle_id) ||
      !['assign','cancel'].includes(row.action)) throw Error('invalid_claimed_assignment');
  return {receiptId:row.receipt_id,driverId:row.driver_id,vehicleId:row.vehicle_id,action:row.action};
}
/** Candidate adapter only. Caller must enforce authorization, operation version
 * and replay protection before invoking. Do not attach to legacy fixed-ID queue.
 */
function GF_ReceiptAssignmentRunClaimed_(bookId,row,assertCurrentOperation) {
  const request=GF_ReceiptAssignmentQueueRequest_(row);
  if(typeof assertCurrentOperation!=='function' ||
     assertCurrentOperation(row)!==true) throw Error('operation_not_current');
  if(typeof GF_ReceiptAssignmentSaveAndCheck_!=='function') throw Error('assignment_save_missing');
  const result=GF_ReceiptAssignmentSaveAndCheck_(bookId,request);
  if(!result || !['verified','reconciliation_required'].includes(result.status))
    throw Error('unexpected_assignment_result');
  return {request_id:row.request_id,status:result.status};
}
