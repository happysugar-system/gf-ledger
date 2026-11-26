/** Pure combined history transition; caller must lock, persist and verify atomically. */
function GF_CombinedHistoryPlan_(current,op){
 const groups=[['DriverID','現在使用者','📄 最新車両書類'],['前DriverID','前使用者','前使用者 車両書類'],['前々DriverID','前々使用者','前々使用者 車両書類']];
 const keys=groups.flat(), read=o=>Object.fromEntries(keys.map(k=>{if(typeof o?.[k]!=='string')throw Error('invalid_snapshot');return [k,o[k]];})), before=read(current), eq=(a,b)=>keys.every(k=>a[k]===b[k]);
 if(!op?.id||!/^V\d{6}$/.test(op.vehicleId))throw Error('invalid_operation');
 if(op.kind==='cancel'){
 const r=op.record;if(r?.id!==op.id||r.vehicleId!==op.vehicleId)throw Error('invalid_record');
 const old=read(r.before),applied=read(r.after);
 if(eq(before,old))return {kind:'unchanged',after:before};
 if(!eq(before,applied))throw Error('history_conflict');
 return {kind:'restore',before,after:old};
 }
 if(op.kind!=='confirmed_change'||!/^D\d{6}$/.test(op.driverId)||typeof op.name!=='string'||!op.name.trim())throw Error('invalid_operation');
 if(before.DriverID===op.driverId){if(before['現在使用者']!==op.name)throw Error('identity_conflict');return {kind:'unchanged',after:before};}
 if(!/^D\d{6}$/.test(before.DriverID)||!before['現在使用者'])throw Error('previous_identity_unresolved');
 const valid=v=>v===''||/^https:\/\/(drive|docs)\.google\.com\//.test(v);
 if(typeof op.document!=='string'||!valid(op.document)||!groups.every(g=>valid(before[g[2]])))throw Error('unverified_document');
 const after={...before};for(let i=2;i>=1;i--)for(let j=0;j<3;j++)after[groups[i][j]]=before[groups[i-1][j]];
 [after.DriverID,after['現在使用者'],after['📄 最新車両書類']]=[op.driverId,op.name,op.document];
 return {kind:'shift',before,after,record:{id:op.id,vehicleId:op.vehicleId,before,after}};
}
