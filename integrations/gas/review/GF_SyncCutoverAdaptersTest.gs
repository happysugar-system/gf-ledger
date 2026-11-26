/** Validation-only adapters. Existing entrypoints remain unchanged until cutover. */
function GFA_DB同期履歴照合_(book,requestKey){
 const row=GF_SyncStorageTestRead_(book,'history',String(requestKey).trim().toLowerCase());
 if(!row)return null;
 return {'処理状態':String(row.state||''),'LINE受付ID':String(row.line_receipt_id||''),DriverID:String(row.driver_id||'')};
}
function GFW_DB同期依頼追加_(book,vehicleId,action,driverId){
 GF_IsolatedValidationBook_(book);
 if(!/^V9[0-9]{5}$/.test(vehicleId)||!/^D999[0-9]{3}$/.test(driverId)||!['割当','取消'].includes(action))throw Error('validation_assignment_denied');
 const id='TEST-'+Utilities.getUuid().toUpperCase();
 GF_SyncStorageTestInsert_(book,'queue',{request_id:id,requested_at:new Date().toISOString(),vehicle_id:vehicleId,operation:action,driver_id:driverId,state:'待機',attempts:0});
 const saved=GF_SyncStorageTestRead_(book,'queue',id);
 if(!saved||saved.vehicle_id!==vehicleId||saved.driver_id!==driverId||saved.operation!==action)throw Error('assignment_queue_readback_failed');
 return id;
}
