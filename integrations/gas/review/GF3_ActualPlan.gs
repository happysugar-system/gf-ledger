/** Pure GF3 actual-operation planner. No production or sheet writes.
 * Caller must persist immutable before/after snapshots and claim receipt before applying.
 */
function GF3_ActualPlan_(vehicle,waiting,driver,operation,date,receiptId){
 if(vehicle.VehicleID!=='V900005'||waiting['受付ID']!=='2'||driver.DriverID!=='D999902'||
 vehicle.DriverID!==driver.DriverID||waiting.DriverID!==driver.DriverID||
 waiting['割当VehicleID']!==vehicle.VehicleID||driver['割当VehicleID']!==vehicle.VehicleID||
 waiting['ステータス']!=='割当済'||!driver['氏名']||vehicle['現在使用者']!==driver['氏名'])
 throw Error('gf3_actual_identity_mismatch');
 if(!/^TEST-GF3-[A-Z0-9-]{1,70}$/.test(receiptId))throw Error('gf3_actual_receipt_invalid');
 if(!date||GF3_ProgressDate_(date)!==date)throw Error('gf3_actual_date_invalid');
 if(operation==='納車完了'){
 if(vehicle['区分/ステータス']!=='空車'||
    (vehicle['引渡し']&&GF3_ProgressDate_(vehicle['引渡し'])>date))
  throw Error('gf3_actual_delivery_conflict');
 return {vehicle:{'区分/ステータス':'貸出中','引渡し':date},waiting:{},driver:{}};
 }
 if(operation!=='返却完了'||vehicle['区分/ステータス']!=='貸出中'||!vehicle['引渡し']||
 GF3_ProgressDate_(vehicle['引渡し'])>date)throw Error('gf3_actual_return_conflict');
 const patch={'区分/ステータス':'空車','現在使用者':'',DriverID:''};
 const history=GF3_ReturnHistoryPlan_(vehicle,{...vehicle,...patch},
 {id:receiptId,operation,state:'完了',vehicleId:vehicle.VehicleID});
 return {vehicle:{...patch,...history},waiting:{'割当VehicleID':'','割当車番':''},
 driver:{'割当VehicleID':'','割当車番':''}};
}
