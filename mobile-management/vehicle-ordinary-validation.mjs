import {FIELD_POLICY} from './vehicle-field-policy.mjs';
// Metadata must be obtained from the actual target cell by the trusted writer.
// Unsupported validation types deliberately fail closed.
export function validateOrdinaryValue(field,value,meta){
 if(FIELD_POLICY[field]!=='ordinary')throw Error('wrong_write_path');
 if(!meta||meta.formula!==false||meta.protected!==false||meta.merged!==false)throw Error('unsafe_cell');
 if(meta.kind==='checkbox'){
  if(typeof value!=='boolean'||meta.customValues)throw Error('invalid_checkbox');
  return value;
 }
 if(!['list','number','text'].includes(meta.kind))throw Error('unsupported_validation');
 if(value===''){if(meta.allowBlank!==true)throw Error('blank_not_allowed');return '';}
 if(meta.kind==='list'){
  if(typeof value!=='string'||!Array.isArray(meta.options)||!meta.options.includes(value))throw Error('invalid_option');
 }else if(meta.kind==='number'){
  if(typeof value!=='number'||!Number.isFinite(value))throw Error('invalid_number');
  if(meta.min!=null&&value<meta.min||meta.max!=null&&value>meta.max)throw Error('out_of_range');
 }else if(meta.kind==='text'){
  if(typeof value!=='string')throw Error('invalid_text');
 }else throw Error('unsupported_validation');
 if(typeof value==='string'&&(value.length>1000||/^\s*[=+@-]/.test(value)))throw Error('unsafe_text');
 return value;
}
