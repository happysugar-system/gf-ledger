const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../integrations/gas/GF_LedgerProgress_SharedSaveCandidate.gs'),'utf8');
function fixture(formula=false){
 let row=['V900004','D999904','車両準備中','',''], writes=0, releases=0;
 const cell=v=>typeof v==='number'?{numberValue:v}:{stringValue:v};
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){releases++}})},Sheets:{Spreadsheets:{Values:{get:()=>({values:[['VehicleID','DriverID','管理区分','納車可能日','納車確定日'],row]})},get:()=>({sheets:[{properties:{sheetId:1},data:[{rowData:[{values:row.map((v,i)=>({effectiveValue:cell(v),userEnteredValue:formula&&i===2?{formulaValue:'=A1'}:cell(v)}))}]}]}]}),batchUpdate:({requests})=>{writes++;for(const {updateCells:u} of requests){assert.equal(u.fields,'userEnteredValue');const v=u.rows[0].values[0].userEnteredValue;row[u.start.columnIndex]=v?.stringValue??v?.numberValue??'';}}}}});
 vm.runInContext(source,ctx);
 const expected={vehicleId:row[0],driverId:row[1],values:row.slice(2)};
 const fields={'管理区分':'名義変更前','納車可能日':'2026-12-02','納車確定日':'2026-12-08'};
 return {ctx,expected,fields,resolve:()=>({vehicleId:expected.vehicleId,driverId:expected.driverId}),writes:()=>writes,releases:()=>releases};
}
test('requires resolver',()=>{const f=fixture();assert.throws(()=>f.ctx.GF_LedgerProdProgressSave_('test',f.expected,f.fields),/assignment_resolver_required/);assert.equal(f.writes(),0);assert.equal(f.releases(),1)});
test('rejects mismatched assignment',()=>{const f=fixture();assert.throws(()=>f.ctx.GF_LedgerProdProgressSave_('test',f.expected,f.fields,()=>({vehicleId:'V900005',driverId:'D999904'})));assert.equal(f.writes(),0)});
test('rejects stale snapshot',()=>{const f=fixture();f.expected.values=['名義変更済み','',''];assert.throws(()=>f.ctx.GF_LedgerProdProgressSave_('test',f.expected,f.fields,f.resolve),/stale_progress/);assert.equal(f.writes(),0)});
test('rejects reversed dates',()=>{const f=fixture();f.fields['納車確定日']='2026-12-01';assert.throws(()=>f.ctx.GF_LedgerProdProgressSave_('test',f.expected,f.fields,f.resolve));assert.equal(f.writes(),0)});
test('protects formula',()=>{const f=fixture(true);assert.throws(()=>f.ctx.GF_LedgerProdProgressSave_('test',f.expected,f.fields,f.resolve),/数式セル/);assert.equal(f.writes(),0)});
test('saves and reads back three fields',()=>{const f=fixture();const r=f.ctx.GF_LedgerProdProgressSave_('test',f.expected,f.fields,f.resolve);assert.equal(r.status,'saved');assert.equal(JSON.stringify(r.snapshot.values),JSON.stringify(Object.values(f.fields)));assert.equal(f.writes(),1);assert.equal(f.releases(),1)});
