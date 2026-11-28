// Shared validation for vehicle edits. No I/O.
export const FIELD_TYPES=Object.freeze({'GPS有無':'boolean','代車貸出先':'text','代車貸出エリア':'text','代車貸出備考':'text'});
export function validateVehiclePatch(p,{demoOnly=true}={}){
 if(!p||typeof p.vehicleId!=='string'||!/^V[0-9]{6,}$/.test(p.vehicleId)||(demoOnly&&p.vehicleId!=='V999999'))throw Error('invalid_vehicle');
 const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 if(!plain(p.expected)||!plain(p.changes))throw Error('invalid_patch');
 const keys=Object.keys(p.changes);
 if(!keys.length||keys.length!==Object.keys(p.expected).length)throw Error('invalid_fields');
 const expected={},changes={};
 for(const k of keys){
  if(!Object.hasOwn(FIELD_TYPES,k)||!Object.hasOwn(p.expected,k))throw Error('invalid_field');
  for(const v of [p.expected[k],p.changes[k]]){
   if(FIELD_TYPES[k]==='boolean'?typeof v!=='boolean':typeof v!=='string'||v.length>1000||/^\s*[=+\-@]/.test(v))throw Error('invalid_value');
  }
  if(p.expected[k]===p.changes[k])throw Error('unchanged_field');
  expected[k]=p.expected[k];changes[k]=p.changes[k];
 }
 return {vehicleId:p.vehicleId,expected,changes};
}
