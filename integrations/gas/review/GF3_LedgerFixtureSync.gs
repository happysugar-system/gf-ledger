const GF3_LEDGER_FIXTURE_FIELDS_=['VehicleID','車番','DriverID','区分/ステータス','管理区分','納車可能日','納車確定日','納車予定日','引渡し'];

function GF3_SyncLedgerFixture_(book,range){
 GF3_AssertBook_(book);
 if(PropertiesService.getScriptProperties().getProperty('GF3_LEDGER_SYNC_TEST_ENABLED')!=='true')return;
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_ledger_sync_busy');
 try{
  const row=GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID','V900005',GF3_LEDGER_FIXTURE_FIELDS_);
  if(range&&(row.number<range.getRow()||row.number>range.getLastRow()||
   !GF3_LEDGER_FIXTURE_FIELDS_.some(field=>row.columns[field]+1>=range.getColumn()&&row.columns[field]+1<=range.getLastColumn())))return;
  const record={...row.data};
  for(const field of ['納車可能日','納車確定日','納車予定日','引渡し'])record[field]=GF3_ProgressDate_(record[field]);
  const saved=GF3_ActualStorage_(book,'ledger-sync',null,record);
  if(!saved||GF3_LEDGER_FIXTURE_FIELDS_.some(field=>saved[field]!==record[field]))
   throw Error('gf3_ledger_sync_readback');
  return {vehicleId:record.VehicleID,synced:true};
 }finally{lock.releaseLock();}
}

function GF3_OnLedgerFixtureEdit(e){
 const range=e&&e.range;
 if(!range||range.getSheet().getName()!=='車両台帳')return;
 return GF3_SyncLedgerFixture_(e.source,range);
}

/** A committed ledger operation stays committed if a derived view needs retry. */
function GF3_RefreshFixtureProjections_(book){
 const state={ledger:'disabled',monthly:'not_installed'};
 for(const [key,refresh] of [['ledger',GF3_SyncLedgerFixture_],['monthly',GF3_RefreshMonthlyDelivery_]]){
  try{if(refresh(book))state[key]='updated';}
  catch(error){state[key]='pending';console.error('gf3_'+key+'_refresh_pending:'+error.message);}
 }
 return state;
}

function GF3_RefreshLedgerFixtureSync(){
 const book=GF3_Open_();
 try{return GF3_SyncLedgerFixture_(book);}
 finally{GF3_RefreshMonthlyDelivery_(book);}
}

function GF3_InstallLedgerFixtureSync(){
 const book=GF3_DocumentUiOwner_();
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_ledger_sync_busy');
 try{
  const triggers=ScriptApp.getProjectTriggers();
  for(const [handler,matches,create] of [
   ['GF3_OnLedgerFixtureEdit',t=>t.getTriggerSourceId()===book.getId()&&t.getEventType()===ScriptApp.EventType.ON_EDIT,
    ()=>ScriptApp.newTrigger('GF3_OnLedgerFixtureEdit').forSpreadsheet(book).onEdit().create()],
   ['GF3_RefreshLedgerFixtureSync',t=>t.getEventType()===ScriptApp.EventType.CLOCK,
    ()=>ScriptApp.newTrigger('GF3_RefreshLedgerFixtureSync').timeBased().everyMinutes(5).create()]
  ]){
   const existing=triggers.filter(t=>t.getHandlerFunction()===handler&&matches(t));
   if(existing.length===0)create();
   for(const duplicate of existing.slice(1))ScriptApp.deleteTrigger(duplicate);
  }
 }finally{lock.releaseLock();}
 return GF3_RefreshLedgerFixtureSync();
}
