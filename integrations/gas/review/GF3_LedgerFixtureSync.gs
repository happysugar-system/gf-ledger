const GF3_LEDGER_FIXTURE_FIELDS_=['VehicleID','車番','DriverID','区分/ステータス','管理区分','納車可能日','納車確定日'];

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
  for(const field of ['納車可能日','納車確定日'])record[field]=GF3_ProgressDate_(record[field]);
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

function GF3_RefreshLedgerFixtureSync(){
 return GF3_SyncLedgerFixture_(GF3_Open_());
}

function GF3_InstallLedgerFixtureSync(){
 const book=GF3_DocumentUiOwner_();
 const triggers=ScriptApp.getProjectTriggers();
 if(!triggers.some(t=>t.getHandlerFunction()==='GF3_OnLedgerFixtureEdit'&&t.getTriggerSourceId()===book.getId()))
  ScriptApp.newTrigger('GF3_OnLedgerFixtureEdit').forSpreadsheet(book).onEdit().create();
 if(!triggers.some(t=>t.getHandlerFunction()==='GF3_RefreshLedgerFixtureSync'&&t.getEventType()===ScriptApp.EventType.CLOCK))
  ScriptApp.newTrigger('GF3_RefreshLedgerFixtureSync').timeBased().everyMinutes(5).create();
 return GF3_RefreshLedgerFixtureSync();
}
