/** Read-only inventory of the isolated script. No trigger or calendar mutations. */
function GF3_TriggerAudit_(triggers,bookId,handlers){
 const seen=new Set();
 return triggers.map(t=>{
 const key=JSON.stringify([t.handler,t.event,t.source,t.sourceId]);
 const duplicate=seen.has(key);seen.add(key);
 return {handler:t.handler,event:t.event,source:t.source,duplicate,foreignSpreadsheet:t.source==='SPREADSHEETS'&&t.sourceId!==bookId,handlerPresent:handlers.includes(t.handler)};
 });
}
function GF3_検証トリガー棚卸し(){
 const book=GF3_Open_();
 const triggers=ScriptApp.getProjectTriggers().map(t=>({handler:t.getHandlerFunction(),event:String(t.getEventType()),source:String(t.getTriggerSource()),sourceId:t.getTriggerSourceId()||null}));
 const handlers=triggers.map(t=>t.handler).filter(h=>typeof globalThis[h]==='function');
 const result={triggers:GF3_TriggerAudit_(triggers,book.getId(),handlers),scope:'current_user_current_script',calendarWrites:0};
 console.log(JSON.stringify(result));return result;
}
function GF3_トリガー自己テスト(){
 const t={handler:'worker',event:'ON_EDIT',source:'SPREADSHEETS',sourceId:'test'};
 const a=GF3_TriggerAudit_([t,t,{...t,sourceId:'other'},{...t,handler:'missing'},{handler:'clock',event:'CLOCK',source:'CLOCK',sourceId:null}],'test',['worker','clock']);
 const checks=[!a[0].duplicate,a[1].duplicate,a[2].foreignSpreadsheet,!a[3].handlerPresent,!a[4].foreignSpreadsheet];
 if(!checks.every(Boolean))throw Error('trigger_fixture_failed');
 return {passed:checks.length,writes:0};
}
