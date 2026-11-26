/** Pure review candidate. Call only within the authoritative assignment transaction.
 * The caller must persist before/after with the operation ID atomically.
 * No name-only identity matching; no history shift on return or provisional assignment.
 */
function GF_UserHistoryPlan_(current, operation) {
  const keys=['DriverID','現在使用者','前使用者','前々使用者'];
  const read=o=>Object.fromEntries(keys.map(k=>{if(typeof o?.[k]!=='string')throw Error('invalid_history');return [k,o[k]];}));
  const before=read(current);
  if(operation?.kind==='cancel'){
    const old=read(operation.record?.before), applied=read(operation.record?.after);
    if(!operation.id||operation.record?.id!==operation.id||operation.record?.vehicleId!==operation.vehicleId)throw Error('invalid_operation');
    if(keys.every(k=>before[k]===old[k]))return {kind:'unchanged',before,after:before};
    if(!keys.every(k=>before[k]===applied[k]))throw Error('history_conflict');
    return {kind:'restore',before,after:old};
  }
  if(operation?.kind!=='confirmed_change')throw Error('unsupported_operation');
  if(!operation.id||!/^V\d{6}$/.test(operation.vehicleId)||!/^D\d{6}$/.test(operation.driverId)||typeof operation.name!=='string'||!operation.name.trim())throw Error('invalid_operation');
  if(before.DriverID===operation.driverId){
    if(before['現在使用者']!==operation.name)throw Error('identity_conflict');
    return {kind:'unchanged',before,after:before};
  }
  if(!/^D\d{6}$/.test(before.DriverID)||!before['現在使用者'].trim())throw Error('previous_identity_unresolved');
  const after={DriverID:operation.driverId,'現在使用者':operation.name,'前使用者':before['現在使用者'],'前々使用者':before['前使用者']};
  return {kind:'shift',before,after,record:{id:operation.id,vehicleId:operation.vehicleId,before,after}};
}
