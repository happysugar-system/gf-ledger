/**
 * Three-sheet post-return history patch planner, no writes.
 * IMPORTANT: call ONLY after persisted successful return, verified unique receipt
 * and immutable before/after snapshots. Do not shift on ordinary edit/assignment.
 * The caller must additionally CAS/lock the receipt to prevent double apply.
 * Rich document URL preservation must be verified in the actual sheet adapter.
 */
function GF3_ReturnHistoryPlan_(before,after,receipt){
 const norm=x=>String(x==null?'':x).trim();
 const id=norm(receipt&&receipt.id),operation=norm(receipt&&receipt.operation);
 if(!/^TEST-(?:GF3-|RETURN-)[A-Z0-9-]{1,70}$/.test(id))throw Error('gf3_return_receipt_invalid');
 if(operation!=='返却完了'||norm(receipt.state)!=='完了')
  throw Error('gf3_return_not_confirmed');
 const keys=['VehicleID','現在使用者','DriverID','前使用者','前DriverID','前使用者 車両書類',
   '前々使用者','前々DriverID','前々使用者 車両書類','📄 最新車両書類'];
 for(const k of keys)if(!Object.prototype.hasOwnProperty.call(before||{},k))
  throw Error('gf3_return_before_missing:'+k);
 for(const k of ['VehicleID','現在使用者','DriverID','区分/ステータス'])
  if(!Object.prototype.hasOwnProperty.call(after||{},k))
   throw Error('gf3_return_after_missing:'+k);
 if(norm(before.VehicleID)!==norm(after.VehicleID)||norm(receipt.vehicleId)!==norm(before.VehicleID)||!/^V9\d{5}$/.test(norm(before.VehicleID)))
  throw Error('gf3_return_vehicle_mismatch');
 if(!norm(before['現在使用者'])||!norm(before.DriverID))
  throw Error('gf3_return_previous_driver_missing');
 if(norm(after['現在使用者'])||norm(after.DriverID)||norm(after['区分/ステータス'])!=='空車')
  throw Error('gf3_return_not_cleared');
 const allowedLink=x=>!norm(x)||/^https:\/\/[^\s]+$/.test(norm(x));
 if(!allowedLink(before['前使用者 車両書類'])||!allowedLink(before['前々使用者 車両書類'])||
    !allowedLink(before['📄 最新車両書類']))
  throw Error('gf3_return_document_link_invalid');
 return {
  '前々使用者':norm(before['前使用者']),
  '前々DriverID':norm(before['前DriverID']),
  '前々使用者 車両書類':norm(before['前使用者 車両書類']),
  '前使用者':norm(before['現在使用者']),
  '前DriverID':norm(before.DriverID),
  '前使用者 車両書類':norm(before['📄 最新車両書類'])
 };
}
