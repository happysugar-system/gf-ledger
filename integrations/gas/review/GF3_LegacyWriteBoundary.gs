/** Validation-only canonical ledger projection. No legacy sheet or external service writes. */
function GF3_LegacyProjectionPlan_(vehicleId,kind,fields){
 if(!/^V9\d{5}$/.test(vehicleId))throw Error('validation_vehicle_required');
 const allowed={
  schedule:['納車予定日','返却予定日','代車予定日','代車返却予定日','12点検予定日','車検予定日','名変予定日','板金予定日','整備予定日','車検満了日','予定反映状況'],
  document:['📄 最新車両書類','📁 車両書類フォルダ','📷車両状態フォルダ','🔧整備書類フォルダ']
 };
 if(!Object.prototype.hasOwnProperty.call(allowed,kind)||!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('projection_invalid');
 const patch={};
 if(!Object.keys(fields).length)throw Error('projection_empty');
 for(const [k,v] of Object.entries(fields)){
  if(!allowed[kind].includes(k))throw Error('projection_field_unmapped:'+k);
  if(kind==='document'&&(typeof v!=='string'||!/^https:\/\/drive\.google\.com\/(?:file\/d\/|drive\/(?:u\/\d+\/)?folders\/)[A-Za-z0-9_-]+(?:[/?#].*)?$/.test(v)))throw Error('document_url_invalid');
  if(kind==='schedule'&&k!=='予定反映状況'&&v!==''&&(!(v instanceof Date)||!Number.isFinite(v.getTime())))throw Error('schedule_date_required');
  if(kind==='schedule'&&k==='予定反映状況'&&typeof v!=='string')throw Error('schedule_state_invalid');
  patch[k]=v;
 }
 return {sheet:'車両台帳',vehicleId,kind,patch};
}
function GF3_LegacyProjectionApply_(book,vehicleId,kind,fields){
 GF3_AssertBook_(book);
 if(!(kind==='document'?GF3_DocumentWriteEnabled_(book):GF3_WriteEnabled_(book)))throw Error('validation_disabled');
 if(kind==='document'&&vehicleId!=='V900005')throw Error('gf3_document_fixture_denied');
 const plan=GF3_LegacyProjectionPlan_(vehicleId,kind,fields);
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('projection_busy');
 try{
 const v=GF3_GF_DB同期車両情報_(book,vehicleId);
 if(v.sheet.getName()!==plan.sheet)throw Error('projection_sheet_denied');
 const keys=Object.keys(plan.patch),cols=GF3_Columns_(v.sheet,keys);
 const entries=keys.map(k=>{
 const cell=v.sheet.getRange(v.row,cols[k]+1);
 if(cell.getFormula())throw Error('formula_protected:'+k);
 return {k,cell,value:cell.getValue(),rich:cell.getRichTextValue(),format:cell.getNumberFormat()};
 });
 if(kind==='document')for(const e of entries){
 const existing=e.rich&&e.rich.getLinkUrl();
 if(existing!==plan.patch[e.k]&&e.value!==''&&e.value!==null)throw Error('document_existing_link_conflict:'+e.k);
 }
 const attempted=[];
 try{
 for(const e of entries){
 const value=plan.patch[e.k];
 if(kind==='document'&&e.rich&&e.rich.getLinkUrl()===value)continue;
 attempted.push(e);
 if(kind==='document')e.cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(e.k+'を見る').setLinkUrl(value).build());
 else if(value==='')e.cell.clearContent();else e.cell.setValue(value);
 }
 SpreadsheetApp.flush();
 for(const e of entries){
 const expected=plan.patch[e.k],actual=e.cell.getValue();
 if(kind==='document'){const rt=e.cell.getRichTextValue();if(!rt||rt.getLinkUrl()!==expected)throw Error('projection_readback_failed');}
 else if(expected instanceof Date?!(actual instanceof Date)||actual.getTime()!==expected.getTime():actual!==expected)throw Error('projection_readback_failed');
 }
 }catch(err){
 try{for(const e of attempted){e.cell.setNumberFormat(e.format);if(e.rich)e.cell.setRichTextValue(e.rich);else e.cell.setValue(e.value);}SpreadsheetApp.flush();}catch(restore){throw Error('projection_rollback_failed_manual_review');}
 throw err;
 }
 return {ok:true,updated:keys};
 }finally{lock.releaseLock();}
}
function GF3_旧シート書込境界自己テスト(){
 const id='V999991',date=new Date('2026-12-03T00:00:00+09:00'),url='https://drive.google.com/file/d/fixture123/view';
 const reject=f=>{try{f();return false;}catch(e){return true;}};
 const s=GF3_LegacyProjectionPlan_(id,'schedule',{'車検満了日':date,'返却予定日':''});
 const d=GF3_LegacyProjectionPlan_(id,'document',{'📄 最新車両書類':url});
 const checks=[s.sheet==='車両台帳',s.patch['車検満了日']===date,s.patch['返却予定日']==='',d.patch['📄 最新車両書類']===url,
 reject(()=>GF3_LegacyProjectionPlan_('V000001','schedule',{})),
 reject(()=>GF3_LegacyProjectionPlan_(id,'schedule',{'現在使用者':'x'})),
 reject(()=>GF3_LegacyProjectionPlan_(id,'document',{'📄 最新車両書類':'invalid'})),
 reject(()=>GF3_LegacyProjectionPlan_(id,'schedule',{'車検満了日':'2026-12-03'})),
 reject(()=>GF3_LegacyProjectionPlan_(id,'history',{})),
 reject(()=>GF3_LegacyProjectionPlan_(id,'schedule',{'予定反映状況':123}))];
 if(!checks.every(Boolean))throw Error('projection_fixture_failed');
 return {passed:checks.length,writes:0};
}

/** Explicit document replacement plan. No Drive deletion or external writes.
 * Expected URL must be captured from the original document record, not guessed.
 */
function GF3_DocumentReplacementPlan_(vehicleId,field,expectedUrl,newUrl,currentUrl){
 GF3_LegacyProjectionPlan_(vehicleId,'document',{[field]:expectedUrl});
 GF3_LegacyProjectionPlan_(vehicleId,'document',{[field]:newUrl});
 if(currentUrl===newUrl)return {state:'already_applied',field,expectedUrl,newUrl};
 if(currentUrl!==expectedUrl)throw Error('document_replacement_conflict');
 return {state:'replace',field,expectedUrl,newUrl};
}
function GF3_DocumentReplacementPlanTest_(){
 const id='V999991',field='📄 最新車両書類',a='https://drive.google.com/file/d/old123/view',b='https://drive.google.com/file/d/new123/view',c='https://drive.google.com/file/d/other123/view';
 const reject=(fn)=>{try{fn();return false;}catch(e){return true;}};
 const checks=[
 GF3_DocumentReplacementPlan_(id,field,a,b,a).state==='replace',
 GF3_DocumentReplacementPlan_(id,field,a,b,b).state==='already_applied',
 reject(()=>GF3_DocumentReplacementPlan_(id,field,a,b,c)),
 reject(()=>GF3_DocumentReplacementPlan_(id,field,a,b,'')),
 reject(()=>GF3_DocumentReplacementPlan_(id,field,'',b,a)),
 reject(()=>GF3_DocumentReplacementPlan_(id,'現在使用者',a,b,a)),
 reject(()=>GF3_DocumentReplacementPlan_('V000001',field,a,b,a))
 ];
 if(!checks.every(Boolean))throw Error('document_replacement_fixture_failed');
 return {passed:checks.length,writes:0};
}

/** Isolated ledger replacement only; no Drive mutation. */
function GF3_DocumentReplacementApply_(book,id,field,expectedUrl,newUrl){
 GF3_AssertBook_(book);
 if(!GF3_DocumentWriteEnabled_(book))throw Error('validation_disabled');
 if(id!=='V900005')throw Error('gf3_document_fixture_denied');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(1000))throw Error('projection_busy');
 try{
  GF3_LegacyProjectionPlan_(id,'document',{[field]:newUrl});
  const v=GF3_GF_DB同期車両情報_(book,id);
  GF3_AssertSheet_(v.sheet);
  if(v.sheet.getName()!=='車両台帳')throw Error('projection_sheet_denied');
  const cols=GF3_Columns_(v.sheet,[field]);
  const cell=v.sheet.getRange(v.row,cols[field]+1);
  if(cell.getFormula())throw Error('formula_protected');
  const old=cell.getRichTextValue();
  const plan=GF3_DocumentReplacementPlan_(id,field,expectedUrl,newUrl,old&&old.getLinkUrl());
  if(plan.state==='already_applied')return plan;
  const replacement=SpreadsheetApp.newRichTextValue().setText(old.getText()).setLinkUrl(newUrl).build();
  try{
   cell.setRichTextValue(replacement);
   SpreadsheetApp.flush();
   const current=cell.getRichTextValue();
   if(!current||current.getLinkUrl()!==newUrl)throw Error('replacement_readback_failed');
  }catch(e){
   const current=cell.getRichTextValue();
   if(current&&current.getLinkUrl()===newUrl){
    cell.setRichTextValue(old);SpreadsheetApp.flush();
    const restored=cell.getRichTextValue();
    if(!restored||restored.getLinkUrl()!==expectedUrl)throw Error('replacement_rollback_manual_review');
   }else if(!current||current.getLinkUrl()!==expectedUrl)throw Error('replacement_conflict_manual_review');
   throw e;
  }
  return {state:'replaced',field,expectedUrl,newUrl};
 }finally{lock.releaseLock();}
}
