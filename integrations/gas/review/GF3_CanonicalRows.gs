/** Read by immutable key. Environment and caller authorization belong to the entrypoint. */
function GF3_CanonicalRow_(sheet,key,id,fields){
 if(!sheet||typeof id!=='string'||!id||id!==id.trim())throw Error('gf3_canonical_identity');
 const [headers,...rows]=sheet.getDataRange().getDisplayValues();
 const columns={};
 for(const field of new Set([key,...fields])){
  const hits=headers.flatMap((header,i)=>header.trim()===field.trim()?[i]:[]);
  if(hits.length!==1)throw Error('gf3_column_missing_or_duplicate:'+field);
  columns[field]=hits[0];
 }
 const matches=rows.flatMap((row,i)=>row[columns[key]]===id?[{row,number:i+2}]:[]);
 if(matches.length!==1)throw Error('gf3_assignment_row_not_unique:'+sheet.getName());
 const {row,number}=matches[0];
 return {sheet,key,id,columns,number,data:Object.fromEntries(fields.map(field=>[field,row[columns[field]]]))};
}

function GF3_AssertCanonicalAssignment_(vehicle,waiting,driver){
 if(!/^V\d{6}$/.test(vehicle.VehicleID)||!/^D\d{6}$/.test(driver.DriverID)||
    !String(waiting['受付ID']??'').trim()||vehicle.DriverID!==driver.DriverID||
    waiting.DriverID!==driver.DriverID||waiting['割当VehicleID']!==vehicle.VehicleID||
    driver['割当VehicleID']!==vehicle.VehicleID||waiting['ステータス']!=='割当済'||
    !driver['氏名']||vehicle['現在使用者']!==driver['氏名'])
  throw Error('gf3_actual_identity_mismatch');
}

/** Resolve request identity before passing rows to the write worker. */
function GF3_CanonicalActualRows_(book,identity,read){
 const {vehicleId,applicationId,driverId}=identity;
 if(!/^V\d{6}$/.test(vehicleId)||!/^D\d{6}$/.test(driverId)||
    typeof applicationId!=='string'||!applicationId.trim()||applicationId!==applicationId.trim())
  throw Error('gf3_canonical_identity');
 const lookup=read||((target,name,key,id,fields)=>GF3_CanonicalRow_(target.getSheetByName(name),key,id,fields));
 const vehicle=['VehicleID','区分/ステータス','DriverID','現在使用者','引渡し','前使用者','前DriverID',
  '前使用者 車両書類','前々使用者','前々DriverID','前々使用者 車両書類','📄 最新車両書類','管理区分','納車可能日','納車確定日'];
 return [
  lookup(book,'車両台帳','VehicleID',vehicleId,vehicle),
  lookup(book,'名変待ち管理','受付ID',applicationId,['受付ID','DriverID','ステータス','割当VehicleID','割当車番']),
  lookup(book,'ドライバーマスター','DriverID',driverId,['DriverID','氏名','割当VehicleID','割当車番'])
 ];
}
