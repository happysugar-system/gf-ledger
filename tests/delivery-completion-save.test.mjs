import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const SOURCE=['GF_DeliveryCompletionPlan.gs','GF_DeliveryCompletionSave.gs'].map(p=>readFileSync(new URL('../integrations/monthly-delivery/'+p,import.meta.url),'utf8')).join('\n');
function GF_DeliveryCompletionMockTests_(){
 const headers=['受付ID','登録日時','VehicleID','種類','実施日','状態','変更後JSON','取消日時'];
 const rows=[headers];let writes=0,locked=false;
 const ledger=[['VehicleID','DriverID','現在使用者','納車予定日','紹介元'],['V1','D1','Test','2026/11/25','Test']];
 const sh=grid=>({getDataRange:()=>({getDisplayValues:()=>grid.map(r=>r.slice())})});
 const book={getSheetByName:n=>n==='車両台帳'?sh(ledger):n==='実績履歴'?sh(rows):null};
 const request={receiptId:'R1',vehicleId:'V1',driverId:'D1',date:'2026-11-25'};
 const resolver=()=>({receiptId:'R1',vehicleId:'V1',driverId:'D1',verified:true});
 const assert=(v)=>{if(!v)throw Error('assertion failed');};
 const fails=fn=>{try{fn();return false;}catch{return true;}};
 const save=new Function('SpreadsheetApp','LockService','Utilities','Sheets','GF_ReceiptAssignmentValidationBook_', SOURCE+';return GF_DeliveryCompletionSave_;')({openById:()=>book},{getScriptLock:()=>({waitLock:()=>{locked=true},releaseLock:()=>{locked=false}})},{formatDate:()=> '2026/11/25 12:00:00'},{Spreadsheets:{Values:{append:body=>{writes++;rows.push(body.values[0]);}}}},()=> 'test'); const GF_DeliveryCompletionSave_=save; const run=()=>GF_DeliveryCompletionSave_('test',request,resolver);
 assert(run().status==='verified'&&writes===1&&!locked);
 assert(run().status==='verified'&&writes===1&&!locked);
 assert(fails(()=>GF_DeliveryCompletionSave_('prod',request,resolver))&&writes===1);
 assert(fails(()=>GF_DeliveryCompletionSave_('test',{...request,driverId:'D2'},resolver))&&writes===1&&!locked);
 assert(fails(()=>GF_DeliveryCompletionSave_('test',{...request,date:'2026-11-26'},resolver))&&writes===1&&!locked);
 return 5;
}
test('delivery completion guarded writer',()=>assert.equal(GF_DeliveryCompletionMockTests_(),5));
