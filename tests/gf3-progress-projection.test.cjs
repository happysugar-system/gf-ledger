/** Node-only mocks for the isolated GF3 progress write path.
 * Run: node --test tests/gf3-progress-projection.test.cjs
 * Does not contact Sheets, GAS, Supabase or any production resource.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../integrations/gas/review/GF3_FixtureProgress.gs'),'utf8');
function setup(){
 const vehicle={'区分/ステータス':'空車',DriverID:'D999902','現在使用者':'ダミー',
  '管理区分':'車両準備中','納車可能日':'','納車確定日':'','納車予定日':''};
 const waiting={'ステータス':'割当済',DriverID:'D999902','割当VehicleID':'V900005'};
 const driver={'氏名':'ダミー','ステータス':'有効','割当VehicleID':'V900005'};
 const cols={'管理区分':2,'納車予定日':37,'納車可能日':63,'納車確定日':64};
 const writes=[];
 const sheet={getSheetId:()=>839763648,getRange:(row,column)=>{
  const name=Object.keys(cols).find(k=>cols[k]+1===column);
  assert.ok(name);
  return {
   getFormula:()=>'',getRichTextValue:()=>null,
   getDisplayValue:()=>vehicle[name],
   getNumberFormat:()=>name==='管理区分'?'@':'yyyy-mm-dd'
  };
 }};
 const gf3Row=(_book,name,_key,_id)=>({
  sheet,number:4,columns:cols,
  data:{...({車両台帳:vehicle,名変待ち管理:waiting,ドライバーマスター:driver}[name])}
 });
 const context={
  GF3_DocumentUiOwner_:()=>({getId:()=> 'TEST_BOOK'}),
  GF3_AssignmentFixtureRow_:gf3Row,
  GF3_RefreshFixtureProjections_:()=>({ledger:'updated',monthly:'updated'}),
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  SpreadsheetApp:{flush:()=>{}},
  Sheets:{Spreadsheets:{batchUpdate:({requests},book)=>{
   assert.equal(book,'TEST_BOOK');
   writes.push(requests);
   for(const request of requests){
    const idx=request.updateCells.start.columnIndex;
    const name=Object.keys(cols).find(k=>cols[k]===idx);
    assert.ok(name);
    const entered=request.updateCells.rows[0].values[0].userEnteredValue;
    vehicle[name]=entered?.stringValue??(entered?.numberValue?
     new Date((entered.numberValue-25569)*86400000).toISOString().slice(0,10):'');
   }
  }}}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {vehicle,waiting,driver,writes,api:context};
}
const initial={管理区分:'車両準備中',納車可能日:'',納車確定日:''};
const next={管理区分:'車両手配済み',納車可能日:'2026-12-02',納車確定日:'2026-12-03'};
test('GF3 progress writes dates and linked delivery schedule',()=>{
 const x=setup(),result=x.api.GF3_SaveFixtureProgress('V900005',initial,next);
 assert.equal(result.status,'saved');
 assert.equal(x.vehicle['納車予定日'],'2026-12-02');
 assert.equal(x.vehicle['納車確定日'],'2026-12-03');
 assert.equal(x.writes.length,1);
});
test('replay is idempotent, projection missing is repaired',()=>{
 const x=setup();
 x.api.GF3_SaveFixtureProgress('V900005',initial,next);
 assert.equal(x.api.GF3_SaveFixtureProgress('V900005',next,next).status,'unchanged');
 assert.equal(x.writes.length,1);
 x.vehicle['納車予定日']='';
 assert.equal(x.api.GF3_SaveFixtureProgress('V900005',next,next).status,'saved');
 assert.equal(x.vehicle['納車予定日'],'2026-12-02');
 assert.equal(x.writes.length,2);
});
test('conflicting independent schedule is never overwritten',()=>{
 const x=setup();
 x.api.GF3_SaveFixtureProgress('V900005',initial,next);
 x.vehicle['納車予定日']='2026-12-01';
 assert.throws(()=>x.api.GF3_SaveFixtureProgress('V900005',next,next),/gf3_progress_link_conflict/);
 assert.equal(x.writes.length,1);
});
test('stale progress edit, unassigned receipt and wrong vehicle are denied',()=>{
 const x=setup();x.api.GF3_SaveFixtureProgress('V900005',initial,next);
 assert.throws(()=>x.api.GF3_SaveFixtureProgress('V900005',initial,{...next,管理区分:'名義変更前'}),/gf3_progress_changed_reload/);
 assert.throws(()=>x.api.GF3_SaveFixtureProgress('V900004',next,next),/gf3_progress_fixture_denied/);
 x.waiting['ステータス']='名変待ち';
 assert.throws(()=>x.api.GF3_SaveFixtureProgress('V900005',next,next),/gf3_progress_assignment_required/);
});
test('invalid dates, stage, and reversed delivery order are denied',()=>{
 const x=setup();
 assert.throws(()=>x.api.GF3_ProgressDate_('2026-02-30'),/gf3_progress_date_invalid/);
 assert.throws(()=>x.api.GF3_ProgressFields_({...initial,管理区分:'完了'}),/gf3_progress_stage_invalid/);
 assert.throws(()=>x.api.GF3_ProgressFields_({...initial,納車可能日:'2026-12-03',納車確定日:'2026-12-02'}),/gf3_progress_date_order/);
});
