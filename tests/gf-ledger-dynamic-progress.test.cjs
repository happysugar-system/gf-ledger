const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {runInNewContext}=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');

const source=readFileSync(join(__dirname,'../integrations/gas/GF_LedgerProgress_DynamicValidation.gs'),'utf8');
const resolve=runInNewContext(source+'\nGF_LedgerDynamicProgressResolve_');
const job={receipt_id:'TEST-R04',driver_id:'D999904',vehicle_id:'V900004'};
const receipt={'LINE受付ID':job.receipt_id,DriverID:job.driver_id,'受付識別子':'a'.repeat(64)};
function fixture(){
 return [
  [{...receipt,'処理状態':'登録済'}],
  [{...receipt,'ステータス':'割当済','割当VehicleID':job.vehicle_id,'割当車番':'TEST-004'}],
  [{DriverID:job.driver_id,'ステータス':'有効','割当VehicleID':job.vehicle_id,'割当車番':'TEST-004'}],
  [{VehicleID:job.vehicle_id,DriverID:job.driver_id,'車番':'TEST-004'},{VehicleID:'V900005',DriverID:job.driver_id}],
 ].map(rows=>({rows}));
}
test('同一利用者の別車両があっても受付に紐付くVehicleIDだけを解決する',()=>{
 const result=resolve(fixture(),job,(request,key)=>{
  assert.equal(request.vehicleId,job.vehicle_id);
  assert.equal(key,receipt['受付識別子']);
  return true;
 });
 assert.equal(result.vehicleId,job.vehicle_id);
 assert.throws(()=>resolve(fixture(),{...job,vehicle_id:'V900005'},()=>true),/receipt_assignment_mismatch/);
});
test('旧受付・重複・割当取消は保存前に止める',()=>{
 assert.throws(()=>resolve(fixture(),job,()=>false),/receipt_source_mismatch/);
 const duplicate=fixture();
 duplicate[1].rows.push({...duplicate[1].rows[0]});
 assert.throws(()=>resolve(duplicate,job,()=>true),/assignment_not_unique/);
 const canceled=fixture();
 canceled[1].rows[0]['ステータス']='名変待ち';
 assert.throws(()=>resolve(canceled,job,()=>true),/receipt_assignment_mismatch/);
});

test('統合先の関数や Sheets API が未設定なら依頼を取得しない',()=>{
 const deps={
  GF_ReceiptAssignmentValidationBook_:()=>({}),
  GF_ReceiptAssignmentReadTables_:()=>fixture(),
  GF_ReceiptAssignmentValidationSource_:()=>true,
  GF_LedgerProdProgressSave_:()=>({}),
  GF_LedgerProdProgressRead_:()=>({}),
  Sheets:{Spreadsheets:{Values:{get(){}},get(){},batchUpdate(){}}},
 };
 for(const name of Object.keys(deps)){
  const globals={...deps,UrlFetchApp:{fetch(){assert.fail('lease requested');}}};
  delete globals[name];
  const run=runInNewContext(source+'\nGF_動的進捗検証キューを1件処理',globals);
  assert.throws(run,/validation_progress_dependencies_missing/,name);
 }
});
