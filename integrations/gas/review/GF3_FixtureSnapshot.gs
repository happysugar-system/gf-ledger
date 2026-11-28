/** Owner-only GF3 dashboard. Reads fixture rows only, with no legacy or database fallback. */
function GF3_ReadFixtureSnapshot_(){
 const book=GF3_DocumentUiOwner_();
 const specs=[
  ['車両台帳','VehicleID',/^V9[0-9]{5}$/,['VehicleID','車種','区分/ステータス','管理区分','納車予定日','フォルダ備考']],
  ['名変待ち管理','受付ID',/^TEST-[A-Z0-9-]+$/i,['受付ID','ステータス','割当VehicleID','DriverID']],
  ['ドライバーマスター','DriverID',/^D9[0-9]{5}$/,['DriverID','ステータス','割当VehicleID']]
 ];
 const sheets={};
 for(const [name,key,pattern,fields] of specs){
  const sheet=GF3_AssertSheet_(book.getSheetByName(name));
  const cols=GF3_Columns_(sheet,fields);
  const seen=new Set();
  sheets[name]=sheet.getDataRange().getDisplayValues().slice(1)
   .filter(row=>pattern.test(row[cols[key]]))
   .map(row=>{
    const id=row[cols[key]];
    if(seen.has(id))throw Error('gf3_duplicate_fixture');
    seen.add(id);
    return Object.fromEntries(fields.map(field=>{
     const value=row[cols[field]]||'';
     const restricted=field==='DriverID'?/^D9[0-9]{5}$/:field==='割当VehicleID'?/^V9[0-9]{5}$/:null;
     return [field,restricted&&!restricted.test(value)?'':value];
    }));
   });
 }
 return {environment:'gf3',sheets};
}
function GF3_ReadFixtureSnapshot(){return GF3_ReadFixtureSnapshot_();}

/** Round-trip a single existing fixture note through the canonical ledger. */
function GF3_SaveFixtureFolderNote(vehicleId,expected,note){
 const book=GF3_DocumentUiOwner_();
 if(vehicleId!=='V900005')throw Error('gf3_fixture_vehicle_denied');
 if(typeof expected!=='string'||typeof note!=='string'||note.length>300||/^[\s]*[=+\-@]/.test(note))
  throw Error('gf3_invalid_note');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(2000))throw Error('gf3_fixture_busy');
 try{
  const sheet=GF3_AssertSheet_(book.getSheetByName('車両台帳'));
  const cols=GF3_Columns_(sheet,['VehicleID','フォルダ備考']);
  const rows=sheet.getRange(2,cols.VehicleID+1,sheet.getLastRow()-1,1).getDisplayValues();
  const matches=rows.flatMap(([id],index)=>id===vehicleId?[index+2]:[]);
  if(matches.length!==1)throw Error('gf3_fixture_not_unique');
  const cell=sheet.getRange(matches[0],cols['フォルダ備考']+1);
  if(cell.getFormula()||cell.getDataValidation()||cell.getRichTextValue()?.getRuns().some(run=>run.getLinkUrl()))
   throw Error('gf3_note_protected');
  const current=cell.getValue();
  if(typeof current!=='string')throw Error('gf3_note_protected');
  if(current!==note){
   if(current!==expected)throw Error('gf3_note_changed');
   if(note==='')cell.clearContent();
   else cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(note).build());
   SpreadsheetApp.flush();
  }
  if(cell.getValue()!==note)throw Error('gf3_note_readback_failed');
  return {vehicleId,note};
 }finally{lock.releaseLock();}
}

function GF3_MobileManagementDoGet_(){
 GF3_DocumentUiOwner_();
 return HtmlService.createHtmlOutputFromFile('GF3_MobileManagement').setTitle('GOLD FIRST｜3シート検証')
  .addMetaTag('viewport','width=device-width, initial-scale=1');
}
