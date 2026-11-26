// Pure validation and planning; no writes, no public endpoint.
// A completion must be linked to a verified application/assignment receipt.
function GF_DeliveryCompletionPlan_(vehicle, assignment, history, request) {
 const str=v=>String(v??'').trim();
 const id=str(request.receiptId), vid=str(request.vehicleId), did=str(request.driverId), date=str(request.date);
 if(!id||!vid||!did||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('invalid_completion');
 const parsed=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('invalid_date');
 if(!assignment||str(assignment.receiptId)!==id||str(assignment.vehicleId)!==vid||str(assignment.driverId)!==did||assignment.verified!==true||assignment.cancelled===true)throw Error('assignment_not_verified');
 if(str(vehicle.VehicleID)!==vid||str(vehicle.DriverID)!==did||!str(vehicle['現在使用者']))throw Error('vehicle_driver_mismatch');
 const eventId='DELIVERY:'+id;
 const matches=history.filter(r=>str(r['受付ID'])===eventId);
 if(matches.length>1)throw Error('duplicate_history');
 if(matches.length){
 const old=matches[0];
 let snapshot;try{snapshot=JSON.parse(old['変更後JSON']);}catch{throw Error('invalid_history');}
 if(str(old['VehicleID'])!==vid||str(snapshot.DriverID)!==did||str(old['種類'])!=='納車完了'||str(old['状態'])!=='完了'||str(old['取消日時'])||str(old['実施日']).replace(/\//g,'-')!==date)throw Error('completion_conflict');
 return {state:'unchanged',eventId};
 }
 const snapshot={VehicleID:vid,DriverID:did,receiptId:id};
 for(const field of ['現在使用者','紹介元','納車予定日','管轄','車番','車種','所属会社名','稼働エリア'])snapshot[field]=str(vehicle[field]);
 return {state:'planned',eventId,history:{'受付ID':eventId,'VehicleID':vid,'種類':'納車完了','実施日':date,'状態':'完了','変更後JSON':JSON.stringify(snapshot),'取消日時':''}};
}
