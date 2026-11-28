import {validateOrdinaryValue} from './vehicle-ordinary-validation.mjs';
import {FIELD_POLICY} from './vehicle-field-policy.mjs';
// Mixed date/text fields require separate migration review.
const excluded=new Set(['仕入れ日/会場','免責']);
export function buildBasicPatch(vehicleId,original,draft,metadata){
 if(!/^V[0-9]{6}$/.test(vehicleId))throw Error('invalid_vehicle');
 const expected={},changes={};
 for(const [field,value] of Object.entries(draft)){
  if(!Object.prototype.hasOwnProperty.call(original,field))throw Error('missing_original');
  if(Object.is(value,original[field]))continue;
  if(FIELD_POLICY[field]!=='ordinary'||excluded.has(field))throw Error('wrong_write_path');
  const meta=metadata[field];
  changes[field]=validateOrdinaryValue(field,value,meta);
  expected[field]=validateOrdinaryValue(field,original[field],meta);
 }
 return {vehicleId,expected,changes};
}
export function editableBasicFields(metadata){
 return Object.keys(metadata).filter(field=>{
  const m=metadata[field];
  return FIELD_POLICY[field]==='ordinary'&&!excluded.has(field)&&m&&m.formula===false&&m.protected===false&&m.merged===false&&['text','number','list','checkbox'].includes(m.kind)&&!m.customValues;
 });
}
