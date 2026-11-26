import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const directory = process.argv[2];
const source = readdirSync(directory).filter(name => name.endsWith('.gs'))
  .map(name => readFileSync(join(directory,name),'utf8')).join('\n');
assert.doesNotMatch(source, /DriveApp|CalendarApp|対象スプレッドシートを開く_|GF157_|GF163_|C_TEST001/);
assert.equal([...source.matchAll(/https:\/\/[^'"]+\.supabase\.co\//g)].length,1);
const props = new Map([
  ['GF_TEST_RETURN_HISTORY_ENABLED','true'],['GF_VALIDATION_RETURN_RECEIPT_ID','receipt'],
  ['GF_VALIDATION_RETURN_VEHICLE_ID','V900001'],
]);
const queue = [['header'],['receipt','','V900001','返却完了','2026-11-26','D000001','現在','待機']];
const history = [['header']];
const columns = ['VehicleID','DriverID','現在使用者','📄 最新車両書類','前DriverID','前使用者','前使用者 車両書類',
  '前々DriverID','前々使用者','前々使用者 車両書類','返却/12点検','区分/ステータス'];
const pdf = 'https://drive.google.com/file/d/test/view';
const before = ['V900001','D000001','現在',pdf,'D000002','前','','','','','','貸出中'];
const rows = [columns,[...before]];
const sheets = new Map();
const book = {getId: ()=>'1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU',
  getSheetByName:name=>sheets.get(name), getSpreadsheetTimeZone:()=> 'UTC'};
function sheet(name,data) {
  const display = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value ?? '');
  sheets.set(name,{
    getParent:()=>book,getSheetId:()=>1,getLastColumn:()=>data[0].length,
    appendRow:row=>data.push(row),getDataRange:()=>({
      getValues:()=>data.map(r=>[...r]),getDisplayValues:()=>data.map(r=>r.map(display)),
    }),
    getRange:(row,col,height=1,width=1)=>({
      getDisplayValues:()=>data.slice(row-1,row-1+height).map(r=>r.slice(col-1,col-1+width).map(display)),
      getDisplayValue:()=>display(data[row-1][col-1]),getFormula:()=>'',getRichTextValue:()=>null,
      setValue:value=>{data[row-1][col-1]=value;},
      setValues:matrix=>matrix.forEach((r,i)=>r.forEach((value,j)=>{data[row-1+i][col-1+j]=value;})),
    }),
  });
}
sheet('車両台帳',rows);
sheet('実績登録キュー',queue);
sheet('実績履歴',history);
let writes = 0;
const context = vm.createContext({Date,console,SpreadsheetApp:{openById:()=>book,flush(){}},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  Utilities:{parseDate:s=>new Date(s.replace(' ','T')+'Z'),formatDate:(d,_tz,pattern)=>d.toISOString().slice(0,pattern==='yyyy-MM-dd'?10:23)},
  Sheets:{Spreadsheets:{batchUpdate:({requests})=>{
    writes++;
    for(const {updateCells:{start,rows:cells}} of requests) {
      const value=cells[0].values[0].userEnteredValue;
      rows[start.rowIndex][start.columnIndex]=value.stringValue ?? new Date((value.numberValue-25569)*86400000);
    }
  }}},
});
vm.runInContext(source,context);
const run = expression => vm.runInContext(expression,context);
run('GF_実績キューワーカー()');
assert.equal(queue[1][7],'完了');
assert.deepEqual(rows[1].slice(1,10),['','',pdf,'D000001','現在',pdf,'D000002','前','']);
queue[1][7]='同期中';
run('GF_実績キューワーカー()');
assert.equal(queue[1][7],'完了');
assert.equal(writes,1);
assert.equal(run('GF_検証返却取消()').成功,true);
assert.deepEqual(rows[1],before);
assert.equal(run('GF_検証返却取消()').成功,true);
assert.equal(writes,2);
console.log('Generated 24/25/30 integration: return, readback, interrupted sync retry, cancel, duplicate cancel passed.');
