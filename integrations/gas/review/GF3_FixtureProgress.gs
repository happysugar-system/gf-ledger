/** GF3 owner-only progress edit for the assigned dummy vehicle.
 * Does not call calendar, production sync or any legacy sheet.
 * Shares the script lock with GF3 assignment/cancel.
 */
const GF3_PROGRESS_KEYS_=['管理区分','納車可能日','納車確定日'];
const GF3_PROGRESS_STAGES_=['車両準備中','車両手配済み','名義変更前','名義変更中','名義変更済み'];
function GF3_ProgressDate_(value) {
 if(value===''||value==null)return '';
 const match=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(value).trim());
 if(!match)throw Error('gf3_progress_date_invalid');
 const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
 const iso=match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');
 const test=new Date(Date.UTC(y,m-1,d));
 if(y<2000||y>2100||test.toISOString().slice(0,10)!==iso)throw Error('gf3_progress_date_invalid');
 return iso;
}
function GF3_ProgressFields_(fields) {
 if(!fields||typeof fields!=='object'||Array.isArray(fields)||
    Object.keys(fields).sort().join('|')!==GF3_PROGRESS_KEYS_.slice().sort().join('|')||
    GF3_PROGRESS_KEYS_.some(k=>typeof fields[k]!=='string'))
  throw Error('gf3_progress_fields_invalid');
 const normalized={'管理区分':fields['管理区分'].trim(),
  '納車可能日':GF3_ProgressDate_(fields['納車可能日']),
  '納車確定日':GF3_ProgressDate_(fields['納車確定日'])};
 if(!GF3_PROGRESS_STAGES_.includes(normalized['管理区分']))
  throw Error('gf3_progress_stage_invalid');
 if(normalized['納車可能日']&&normalized['納車確定日']&&
    normalized['納車確定日']<normalized['納車可能日'])
  throw Error('gf3_progress_date_order');
 return normalized;
}
function GF3_ProgressFixture_(book){
 const vehicle=GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID','V900005',
  ['区分/ステータス','DriverID','現在使用者',...GF3_PROGRESS_KEYS_]);
 const waiting=GF3_AssignmentFixtureRow_(book,'名変待ち管理','受付ID','2',
  ['ステータス','DriverID','割当VehicleID']);
 const driver=GF3_AssignmentFixtureRow_(book,'ドライバーマスター','DriverID','D999902',
  ['氏名','ステータス','割当VehicleID']);
 const assigned=vehicle.data['区分/ステータス']==='空車'&&
  vehicle.data.DriverID==='D999902'&&
  vehicle.data['現在使用者']===driver.data['氏名']&&
  waiting.data['ステータス']==='割当済'&&waiting.data.DriverID==='D999902'&&
  waiting.data['割当VehicleID']==='V900005'&&
  driver.data['ステータス']==='有効'&&driver.data['割当VehicleID']==='V900005';
 const fields={'管理区分':vehicle.data['管理区分'],
  '納車可能日':GF3_ProgressDate_(vehicle.data['納車可能日']),
  '納車確定日':GF3_ProgressDate_(vehicle.data['納車確定日'])};
 return {vehicle,assigned,fields};
}
function GF3_ReadFixtureProgress(){
 const book=GF3_DocumentUiOwner_();
 const current=GF3_ProgressFixture_(book);
 return {vehicleId:'V900005',assigned:current.assigned,fields:current.fields};
}
function GF3_SaveFixtureProgress(vehicleId,expected,next){
 const book=GF3_DocumentUiOwner_();
 if(vehicleId!=='V900005')throw Error('gf3_progress_fixture_denied');
 const prior=GF3_ProgressFields_(expected);
 const proposed=GF3_ProgressFields_(next);
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_progress_busy');
 try{
  const current=GF3_ProgressFixture_(book);
  if(!current.assigned)throw Error('gf3_progress_assignment_required');
  if(JSON.stringify(current.fields)===JSON.stringify(proposed))
   return {vehicleId,status:'unchanged',fields:current.fields};
  if(JSON.stringify(current.fields)!==JSON.stringify(prior))
   throw Error('gf3_progress_changed_reload');
  const projections={'納車可能日':'納車予定日'};
  const changed=GF3_PROGRESS_KEYS_.filter(field=>current.fields[field]!==proposed[field]);
  const linked=changed.filter(field=>Object.hasOwn(projections,field));
  const row=GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID',vehicleId,
   [...GF3_PROGRESS_KEYS_,...linked.map(field=>projections[field])]);
  const edits=changed.map(field=>({field,before:current.fields[field],value:proposed[field]}));
  for(const field of linked){
   const target=projections[field],before=GF3_ProgressDate_(row.data[target]);
   if(before&&before!==current.fields[field]&&before!==proposed[field])
    throw Error('gf3_progress_link_conflict:'+target);
   if(before!==proposed[field])edits.push({field:target,before,value:proposed[field]});
  }
  const requests=[];
  for(const {field,before,value} of edits){
   const isDate=field!=='管理区分';
   const cell=row.sheet.getRange(row.number,row.columns[field]+1);
   if(cell.getFormula()||cell.getRichTextValue()?.getRuns().some(run=>run.getLinkUrl()))
    throw Error('gf3_progress_cell_protected:'+field);
   const displayed=field==='管理区分'?String(cell.getDisplayValue()).trim():
    GF3_ProgressDate_(cell.getDisplayValue());
   if(displayed!==before)throw Error('gf3_progress_cell_changed:'+field);
   if(isDate&&value&&!/y/i.test(cell.getNumberFormat()))
    throw Error('gf3_progress_date_format_missing:'+field);
   requests.push({updateCells:{
    start:{sheetId:row.sheet.getSheetId(),rowIndex:row.number-1,columnIndex:row.columns[field]},
    rows:[{values:[!value?{}:{userEnteredValue:!isDate?{stringValue:value}:
      {numberValue:Date.parse(value+'T00:00:00Z')/86400000+25569}}]}],
    fields:'userEnteredValue'
   }});
  }
  Sheets.Spreadsheets.batchUpdate({requests},book.getId());
  SpreadsheetApp.flush();
  const actual=GF3_ProgressFixture_(book);
  if(!actual.assigned||JSON.stringify(actual.fields)!==JSON.stringify(proposed))
   throw Error('gf3_progress_readback_review_required');
  if(linked.length){
   const readback=GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID',vehicleId,linked.map(field=>projections[field]));
   if(linked.some(field=>GF3_ProgressDate_(readback.data[projections[field]])!==proposed[field]))
    throw Error('gf3_progress_projection_readback_failed');
  }
  return {vehicleId,status:'saved',fields:actual.fields};
 }finally{lock.releaseLock();}
}
