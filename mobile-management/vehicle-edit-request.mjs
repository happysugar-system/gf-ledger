// Draft request builder. No network calls or production writes.
export const EDITABLE_FIELDS = Object.freeze(['GPS有無','代車貸出先','代車貸出エリア','代車貸出備考']);
function normalize(key,value){
  if(key==='GPS有無'){
    if(value===true||String(value).toLowerCase()==='true')return true;
    if(value===false||String(value).toLowerCase()==='false')return false;
    if(value==null||value==='')return '';
    throw new Error('GPS有無の値が不正です');
  }
  return String(value??'');
}
export function buildVehicleEditRequest(original,draft){
  const vehicleId=String(original?.VehicleID??'').trim();
  if(!/^V[0-9]{6}$/.test(vehicleId)||draft?.VehicleID!==original.VehicleID)throw new Error('対象車両が不正です');
  const changes={},expected={};
  for(const key of Object.keys(draft)){
    const before=normalize(key,original[key]),after=normalize(key,draft[key]);
    if(before===after)continue;
    if(!EDITABLE_FIELDS.includes(key))throw new Error('未対応の編集項目: '+key);
    if(key==='GPS有無'&&typeof after!=='boolean')throw new Error('GPS有無はチェックボックスで指定してください');
    if(typeof after==='string'&&(after.length>1000||/^\s*[=+\-@]/.test(after)))throw new Error('入力内容が不正です: '+key);
    changes[key]=after;expected[key]=before;
  }
  return {vehicleId,changes,expected};
}
