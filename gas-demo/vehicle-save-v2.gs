/** V2 isolated demo worker. No production writes. */
const GFV2_BOOK='16QRu2-wIRRUAgE_5iz4_TJrzQL3JBvtNDUhaefaU93Y';
const GFV2_URL='https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-vehicle-save-worker-v2-test';
const GFV2_KEYS=['GPS有無','代車貸出先','代車貸出エリア','代車貸出備考'];
function GFV2_sheet_(){
 const s=SpreadsheetApp.openById(GFV2_BOOK).getSheetByName('TEST_車両台帳_V2');
 if(!s||s.getSheetId()!==979068062||s.getLastRow()!==2||JSON.stringify(s.getRange('A1:E1').getValues()[0])!==JSON.stringify(['VehicleID',...GFV2_KEYS])||s.getRange('A2').getValue()!=='V999999')throw Error('invalid demo sheet');
 const r=s.getRange('B2:E2'),rule=s.getRange('B2').getDataValidation();
 if(!rule||rule.getCriteriaType()!==SpreadsheetApp.DataValidationCriteria.CHECKBOX||r.getFormulas()[0].some(Boolean))throw Error('invalid cell structure');
 return r;
}
function GFV2_read_(r){
 const v=r.getValues()[0];
 if(typeof v[0]!=='boolean'||v.slice(1).some(x=>typeof x!=='string'))throw Error('invalid sheet values');
 return Object.fromEntries(GFV2_KEYS.map((k,i)=>[k,v[i]]));
}
function GFV2_api_(p){
 const token=PropertiesService.getScriptProperties().getProperty('GF_VEHICLE_DEMO_SYNC_TOKEN');
 if(!token||token.length<32)throw Error('missing token');
 const res=UrlFetchApp.fetch(GFV2_URL,{method:'post',contentType:'application/json',headers:{'x-gf-sync-token':token},payload:JSON.stringify({...p,vehicle_id:'V999999'}),muteHttpExceptions:true,followRedirects:false});
 if(res.getResponseCode()!==200)throw Error('V2 API '+res.getResponseCode());
 return JSON.parse(res.getContentText());
}
function GFV2_接続確認(){
 const fields=GFV2_read_(GFV2_sheet_()),h=GFV2_api_({action:'health'});
 if(h.ok!==true||h.mode!=='demo_v2')throw Error('health failed');
 console.log(JSON.stringify({ok:true,fields}));
}
function GFV2_保存ワーカー(){
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
 const r=GFV2_sheet_(),q=GFV2_api_({action:'claim'}).request;
 if(!q)return;
 if(q.vehicle_id!=='V999999'||!q.request_id||!q.lease)throw Error('invalid request');
 let state='reconciliation_required',fields=null;
 try{
 const keys=Object.keys(q.changes||{}),expected=Object.keys(q.expected||{});
 if(!keys.length||keys.length!==expected.length||keys.some(k=>!GFV2_KEYS.includes(k)||!Object.prototype.hasOwnProperty.call(q.expected,k)))throw Error('invalid patch');
 for(const k of keys)for(const v of [q.expected[k],q.changes[k]])if(k==='GPS有無'?typeof v!=='boolean':typeof v!=='string'||v.length>1000||/^\s*[=+@-]/.test(v))throw Error('invalid value');
 const before=GFV2_read_(r);
 if(keys.some(k=>before[k]!==q.expected[k]))state='conflict';
 else{
 // Write only changed cells; preserve unrelated values and validation.
 for(const k of keys)r.getCell(1,GFV2_KEYS.indexOf(k)+1).setValue(q.changes[k]);
 SpreadsheetApp.flush();
 fields=GFV2_read_(GFV2_sheet_());
 if(keys.every(k=>fields[k]===q.changes[k]))state='replica_verified';
 }
 }catch(e){console.warn(String(e));}
 const ack=GFV2_api_({action:'finish',request_id:q.request_id,lease:q.lease,state,fields});
 if(ack.state!==state)throw Error('completion unconfirmed');
 console.log(JSON.stringify({request_id:q.request_id,state}));
 }finally{lock.releaseLock();}
}

function GFV2_初回同期(){
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{const fields=GFV2_read_(GFV2_sheet_()),r=GFV2_api_({action:'observe',fields});console.log(JSON.stringify({observed:r.observed}));return r.observed;}finally{lock.releaseLock();}
}
function GFV2_自動同期(){GFV2_保存ワーカー();GFV2_初回同期();}
function GFV2_自動同期開始(){
 GFV2_接続確認();if(!GFV2_初回同期())throw Error('pending request');
 const triggers=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='GFV2_自動同期');
 if(!triggers.length)ScriptApp.newTrigger('GFV2_自動同期').timeBased().everyMinutes(1).create();
 for(const t of triggers.slice(1))ScriptApp.deleteTrigger(t);
}

function GFV2_dispatch_(body){
 const token=PropertiesService.getScriptProperties().getProperty('GF_VEHICLE_DEMO_SYNC_TOKEN');
 if(!token||token.length<32||body.token!==token)return {ok:false,error:'unauthorized'};
 if(body.action!=='save_v2_now')return {ok:false,error:'invalid_action'};
 GFV2_自動同期();
 return {ok:true,mode:'demo_v2',vehicle_id:'V999999'};
}
function GFV2_自動同期停止(){
 for(const t of ScriptApp.getProjectTriggers())if(t.getHandlerFunction()==='GFV2_自動同期')ScriptApp.deleteTrigger(t);
}
