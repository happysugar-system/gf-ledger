/** Extend confirmed user history plan with immutable document references.
 * References must be resolved and verified by server before calling.
 * Do not call after replacing the current document with the new driver's document.
 */
function GF_UserDocumentHistoryPlan_(historyPlan, current, newDocument) {
 const keys=['現在車両書類','前使用者 車両書類','前々使用者 車両書類'];
 const valid=v=>typeof v==='string'&&(v===''||/^https:\/\/(drive|docs)\.google\.com\//.test(v));
 if(!keys.every(k=>valid(current?.[k])))throw Error('unverified_document_reference');
 if(historyPlan?.kind==='unchanged')return {kind:'unchanged',after:{...current}};
 if(historyPlan?.kind!=='shift'||!historyPlan.record?.id)throw Error('confirmed_history_shift_required');
 if(!valid(newDocument))throw Error('unverified_new_document');
 const before=Object.fromEntries(keys.map(k=>[k,current[k]]));
 const after={'現在車両書類':newDocument,'前使用者 車両書類':before['現在車両書類'],'前々使用者 車両書類':before['前使用者 車両書類']};
 return {kind:'shift',before,after,record:{id:historyPlan.record.id,vehicleId:historyPlan.record.vehicleId,before,after}};
}
