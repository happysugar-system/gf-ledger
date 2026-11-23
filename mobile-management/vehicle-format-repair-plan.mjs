/** Pure repair planner: never writes to Sheets. */
export const TEXT_REPAIR_FIELDS=Object.freeze(['カラー','保険会社','備考','代車貸出先','代車貸出エリア','代車貸出備考','返却/12点検_備考','フォルダ備考']);
const loan=new Set(['代車貸出先','代車貸出エリア','代車貸出備考']);
export function planRepair(field,cell){
 if(!TEXT_REPAIR_FIELDS.includes(field))return {action:'skip',reason:'outside_scope'};
 if(!cell||cell.protected!==false||cell.merged!==false)return {action:'review',reason:'cell_safety_unknown'};
 if(cell.formula||cell.value!=='')return {action:'review',reason:'existing_content'};
 const rule=cell.validation?.condition?.type??null;
 if(rule&&!(loan.has(field)&&rule==='DATE_IS_VALID'))return {action:'review',reason:'other_validation'};
 const date=cell.numberFormat?.type==='DATE'||cell.numberFormat?.type==='DATE_TIME';
 if(!date&&!rule)return {action:'skip',reason:'no_mismatch'};
 return {action:'repair',before:{numberFormat:cell.numberFormat??null,validation:cell.validation??null},after:{numberFormat:date?{type:'TEXT',pattern:'@'}:cell.numberFormat??null,validation:rule?null:cell.validation??null}};
}
