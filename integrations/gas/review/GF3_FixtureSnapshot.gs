/** Owner-only GF3 dashboard. Reads fixture rows only, with no legacy or database fallback. */
function GF3_ReadFixtureSnapshot_(){
 const book=GF3_DocumentUiOwner_();
 const specs=[
  ['車両台帳','VehicleID',/^V9[0-9]{5}$/,['VehicleID','車種','区分/ステータス','管理区分','DriverID','現在使用者','納車予定日','納車可能日','納車確定日','フォルダ備考']],
  ['名変待ち管理','受付ID',/^[1-9][0-9]{0,3}$/,['受付ID','ステータス','割当VehicleID','DriverID','LINE受付ID','受付識別子']],
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
     const restricted=field==='DriverID'?/^D9[0-9]{5}$/:field==='割当VehicleID'?/^V9[0-9]{5}$/:field==='LINE受付ID'?/^TEST-[A-Z0-9-]+$/:field==='受付識別子'?/^[a-f0-9]{64}$/:null;
     return [field,restricted&&!restricted.test(value)?'':value];
    }));
   });
 }
 return {environment:'gf3',sheets};
}
function GF3_ReadFixtureSnapshot(){return GF3_ReadFixtureSnapshot_();}

/** Round-trip a single existing fixture note through the canonical ledger. */
function GF3_SaveFixtureFolderNote(vehicleId,expected,note){
 return GF3_SaveFixtureVehicleField_(vehicleId,'フォルダ備考',expected,note);
}
function GF3_SaveFixtureModel(vehicleId,expected,model){
 return GF3_SaveFixtureVehicleField_(vehicleId,'車種',expected,model);
}
function GF3_SaveFixtureVehicleField_(vehicleId,field,expected,note){
 const book=GF3_DocumentUiOwner_();
 if(vehicleId!=='V900005')throw Error('gf3_fixture_vehicle_denied');
 if(typeof expected!=='string'||typeof note!=='string'||note.length>300||/^[\s]*[=+\-@]/.test(note))
  throw Error('gf3_invalid_note');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(2000))throw Error('gf3_fixture_busy');
 try{
  const sheet=GF3_AssertSheet_(book.getSheetByName('車両台帳'));
  const cols=GF3_Columns_(sheet,['VehicleID',field]);
  const rows=sheet.getRange(2,cols.VehicleID+1,sheet.getLastRow()-1,1).getDisplayValues();
  const matches=rows.flatMap(([id],index)=>id===vehicleId?[index+2]:[]);
  if(matches.length!==1)throw Error('gf3_fixture_not_unique');
  const cell=sheet.getRange(matches[0],cols[field]+1);
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
  return {vehicleId,field,note};
 }finally{lock.releaseLock();}
}

function GF3_MobileManagementDoGet_(){
 GF3_DocumentUiOwner_();
 return HtmlService.createHtmlOutputFromFile('GF3_MobileManagement').setTitle('GOLD FIRST｜3シート検証')
  .addMetaTag('viewport','width=device-width, initial-scale=1');
}

/** Read-only assignment preflight using the validated GF3 Supabase history adapter. */
function GF3_CheckFixtureAssignment(receiptId,vehicleId){
 const book=GF3_DocumentUiOwner_();
 if(!/^[1-9][0-9]{0,3}$/.test(String(receiptId))||!/^V9[0-9]{5}$/.test(vehicleId))
  throw Error('gf3_assignment_fixture_denied');
 const waiting=GF3_AssertSheet_(book.getSheetByName('名変待ち管理'));
 const receipt=GFA_割当照合行_(waiting,'受付ID',receiptId,
  ['ステータス','割当VehicleID','DriverID','LINE受付ID','受付識別子']);
 if(receipt['ステータス']!=='名変待ち'||receipt['割当VehicleID']||!/^D999[0-9]{3}$/.test(receipt.DriverID)||
    !/^TEST-[A-Z0-9-]+$/.test(receipt['LINE受付ID']))throw Error('gf3_assignment_receipt_not_ready');
 const driver=GFA_割当照合行_(GF3_AssertSheet_(book.getSheetByName('ドライバーマスター')),
  'DriverID',receipt.DriverID,['ステータス','割当VehicleID']);
 const vehicle=GFA_割当照合行_(GF3_AssertSheet_(book.getSheetByName('車両台帳')),
  'VehicleID',vehicleId,['区分/ステータス','DriverID','現在使用者']);
 if(driver['ステータス']!=='有効'||driver['割当VehicleID']||
    vehicle['区分/ステータス']!=='空車'||vehicle.DriverID||vehicle['現在使用者'])
  throw Error('gf3_assignment_target_not_ready');
 const history=GFA3_DB同期履歴照合_(book,receipt['受付識別子']);
 if(!history||history['処理状態']!=='登録済'||history['LINE受付ID']!==receipt['LINE受付ID']||history.DriverID!==receipt.DriverID)
  throw Error('gf3_assignment_history_mismatch');
 return {verified:true,vehicleId,receiptId};
}

/** Changes only the explicitly approved assignment fixture. */
function GF3_SaveFixtureAssignment(receiptId,vehicleId,action){
 const book=GF3_DocumentUiOwner_();
 if(String(receiptId)!=='2'||vehicleId!=='V900005'||!['assign','cancel'].includes(action))
  throw Error('gf3_assignment_fixture_denied');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_assignment_busy');
 try{
  const vehicle=GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID',vehicleId,
   ['車番','区分/ステータス','管理区分','DriverID','現在使用者','納車可能日','納車確定日']);
  const waiting=GF3_AssignmentFixtureRow_(book,'名変待ち管理','受付ID','2',
   ['DriverID','ステータス','割当VehicleID','割当車番']);
  const driver=GF3_AssignmentFixtureRow_(book,'ドライバーマスター','DriverID','D999902',
   ['氏名','割当VehicleID','割当車番']);
  if(waiting.data.DriverID!=='D999902'||!driver.data['氏名']||!vehicle.data['車番'])
   throw Error('gf3_assignment_identity_mismatch');
  const props=PropertiesService.getScriptProperties();
  const key='GF3_ASSIGNMENT_FIXTURE_2_V900005';
  const saved=JSON.parse(props.getProperty(key)||'null');
  const assigned=[
   {'管理区分':'車両準備中',DriverID:'D999902','現在使用者':driver.data['氏名']},
   {'ステータス':'割当済','割当VehicleID':vehicleId,'割当車番':vehicle.data['車番']},
   {'割当VehicleID':vehicleId,'割当車番':vehicle.data['車番']}
  ];
  const rows=[vehicle,waiting,driver];
  const current=rows.map((row,i)=>Object.fromEntries(Object.keys(assigned[i]).map(field=>[field,row.data[field]])));
  const matches=values=>JSON.stringify(current)===JSON.stringify(values);
  if(vehicle.data['区分/ステータス']!=='空車'||vehicle.data['納車可能日']||vehicle.data['納車確定日'])
   throw Error('gf3_assignment_progress_conflict');
  if(saved&&JSON.stringify(saved.assigned)!==JSON.stringify(assigned))
   throw Error('gf3_assignment_identity_changed');
  if(action==='assign'){
   if(saved&&matches(assigned))return {state:'assigned',replayed:true};
   if(saved&&!matches(saved.before))throw Error('gf3_assignment_state_conflict');
   GF3_CheckFixtureAssignment('2',vehicleId);
   for(const [row,field,value] of [[vehicle,'DriverID','D999902'],[waiting,'割当VehicleID',vehicleId],[driver,'割当VehicleID',vehicleId]]){
    const duplicates=row.sheet.getRange(2,row.columns[field]+1,row.sheet.getLastRow()-1,1)
     .getDisplayValues().some(([other],i)=>i+2!==row.number&&other.trim()===value);
    if(duplicates)throw Error('gf3_assignment_duplicate:'+field);
   }
   if(waiting.data['割当車番']||driver.data['割当車番'])throw Error('gf3_assignment_plate_conflict');
  }else{
   if(!saved)throw Error('gf3_assignment_no_restore_record');
   if(matches(saved.before))return {state:'cancelled',replayed:true};
   if(!matches(assigned))throw Error('gf3_assignment_state_conflict');
  }
  const changes=action==='assign'?assigned:saved.before;
  const requests=rows.flatMap((row,i)=>Object.entries(changes[i]).map(([field,value])=>{
   const column=row.columns[field];
   const cell=row.sheet.getRange(row.number,column+1);
   if(cell.getFormula()||cell.getValue()!==current[i][field]||
      cell.getRichTextValue()?.getRuns().some(run=>run.getLinkUrl()))
    throw Error('gf3_assignment_cell_changed:'+field);
   return {updateCells:{start:{sheetId:row.sheet.getSheetId(),rowIndex:row.number-1,columnIndex:column},
    rows:[{values:[value===''?{}:{userEnteredValue:{stringValue:value}}]}],fields:'userEnteredValue'}};
  }));
  if(action==='assign'&&!saved)props.setProperty(key,JSON.stringify({before:current,assigned}));
  Sheets.Spreadsheets.batchUpdate({requests},book.getId());
  SpreadsheetApp.flush();
  for(const [i,row] of rows.entries()){
   const actual=GF3_AssignmentFixtureRow_(book,row.sheet.getName(),row.key,row.id,Object.keys(changes[i]));
   if(Object.entries(changes[i]).some(([field,value])=>actual.data[field]!==value))
    throw Error('gf3_assignment_readback_failed');
  }
  return {state:action==='assign'?'assigned':'cancelled',replayed:false};
 }finally{lock.releaseLock();}
}

function GF3_AssignmentFixtureRow_(book,name,key,id,fields){
 const sheet=GF3_AssertSheet_(book.getSheetByName(name));
 const columns=GF3_Columns_(sheet,[key,...fields]);
 const hits=sheet.getDataRange().getDisplayValues().slice(1)
  .flatMap((row,i)=>row[columns[key]]===id?[{row,number:i+2}]:[]);
 if(hits.length!==1)throw Error('gf3_assignment_row_not_unique:'+name);
 const {row,number}=hits[0];
 return {sheet,key,id,columns,number,data:Object.fromEntries(fields.map(field=>[field,row[columns[field]]]))};
}
