// Server-side validation only. No database writes.
export function validateProductionAssignment({request, vehicles, waitingRows, drivers}) {
  const id = x => typeof x === 'string' && x.trim() !== '' && x === x.trim();
  if (!request || !['vehicle_id','waiting_id','driver_id'].every(k=>id(request[k]))) throw Error('INVALID_IDS');
  const one = (rows,key,value) => {
    const found=rows.filter(r=>r[key]===value);
    if(found.length!==1) throw Error('ID_NOT_UNIQUE_OR_MISSING');
    return found[0];
  };
  const v=one(vehicles,'vehicle_id',request.vehicle_id).vehicle_data;
  const w=one(waitingRows,'reception_id',request.waiting_id).record;
  const d=one(drivers,'driver_id',request.driver_id);
  if(!v || !w || w['受付ID']!==request.waiting_id) throw Error('INVALID_RECORD');
  if(w.DriverID!==request.driver_id) throw Error('WAITING_DRIVER_ID_UNVERIFIED');
  if(w['ステータス']!=='名変待ち'||String(w['割当VehicleID']??'').trim()) throw Error('WAITING_NOT_AVAILABLE');
  if(v['区分/ステータス']!=='空車'||String(v.DriverID??'').trim()||String(v['現在使用者']??'').trim()) throw Error('VEHICLE_NOT_AVAILABLE');
  if(d.driver_status!=='有効') throw Error('DRIVER_NOT_ACTIVE');
  if(vehicles.some(r=>String(r.vehicle_data?.DriverID??'').trim()===request.driver_id)) throw Error('DRIVER_ALREADY_ASSIGNED');
  return {vehicle_id:request.vehicle_id,waiting_id:request.waiting_id,driver_id:request.driver_id};
}
