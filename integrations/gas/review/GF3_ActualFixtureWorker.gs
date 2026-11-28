/** GF3 actual worker: exact dummy rows, journal before mutation, atomic Sheets batch. */
function GF3_ActualRows_(book){
 return GF3_CanonicalActualRows_(book,{vehicleId:'V900005',applicationId:'2',driverId:'D999902'},GF3_AssignmentFixtureRow_);
}
function GF3_SaveActualFixture(operation,date,id){
 const book=GF3_DocumentUiOwner_();
 const result=GF3_RunCanonicalActual_(book,operation,date,id,{
  rows:GF3_ActualRows_,plan:GF3_ActualPlan_,storage:GF3_ActualStorage_,assertWrite:GF3_AssertActualWriteEnabled_
 });
 return {...result,projections:GF3_RefreshFixtureProjections_(book)};
}

function GF3_ActualCell_(row,k){
 const c=row.sheet.getRange(row.number,row.columns[k]+1);
 if(c.getFormula())throw Error('gf3_actual_formula:'+k);
 const rich=c.getRichTextValue(),runs=rich?rich.getRuns():[];
 const links=runs.filter(r=>r.getLinkUrl());
 if(links.length&&(runs.length!==1||!k.includes('書類')))throw Error('gf3_actual_complex_link');
 const value=c.getValue();
 return {value:value instanceof Date?Utilities.formatDate(value,'Asia/Tokyo','yyyy-MM-dd'):String(value??''),url:links.length?links[0].getLinkUrl():'',date:value instanceof Date};
}
function GF3_ActualSnapshot_(rows,shape){
 return rows.map((row,i)=>Object.fromEntries(Object.keys(shape?shape[i]:row.data).map(k=>[k,GF3_ActualCell_(row,k)])));
}
function GF3_ActualApply_(book,rows,from,to,adapter){
 const current=GF3_ActualSnapshot_(rows,from);
 if(JSON.stringify(current)===JSON.stringify(to))return;
 if(JSON.stringify(current)!==JSON.stringify(from))throw Error('gf3_actual_snapshot_conflict');
 const requests=[];
 rows.forEach((row,i)=>Object.keys(from[i]).forEach(k=>{
 const a=from[i][k],b=to[i][k];
 if(JSON.stringify(a)===JSON.stringify(b))return;
 const cell=row.sheet.getRange(row.number,row.columns[k]+1);
 if(b.date&&!/y/i.test(cell.getNumberFormat()))throw Error('gf3_actual_date_format');
 const value=b.value===''?{}:{userEnteredValue:b.date?{numberValue:Date.parse(b.value+'T00:00:00Z')/86400000+25569}:{stringValue:b.value}};
 if(b.url)value.textFormatRuns=[{startIndex:0,format:{link:{uri:b.url}}}];
 requests.push({updateCells:{start:{sheetId:row.sheet.getSheetId(),rowIndex:row.number-1,columnIndex:row.columns[k]},rows:[{values:[value]}],fields:'userEnteredValue,textFormatRuns'}});
 }));
 adapter.assertWrite();
 if(requests.length)Sheets.Spreadsheets.batchUpdate({requests},book.getId());
 SpreadsheetApp.flush();
 if(JSON.stringify(GF3_ActualSnapshot_(adapter.rows(book),to))!==JSON.stringify(to))throw Error('gf3_actual_readback');
}
/** Caller supplies authorized workbook, row/receipt scope, journal and write guard. */
function GF3_RunCanonicalVehicleReceipt_(book,identity,operation,date,id,journal,assertWrite){
 const scope={...identity};
 const scopedStorage=(target,action,receiptId,args)=>{
  const fields={vehicle_id:scope.vehicleId,application_id:scope.applicationId,driver_id:scope.driverId};
  const result=journal(target,action,receiptId,action==='insert'?{...args,...fields}:args);
  if(action==='read'&&result&&(result.receipt_id!==receiptId||
    Object.keys(fields).some(field=>result[field]!==fields[field])))
   throw Error('gf3_actual_identity_mismatch');
  return result;
 };
 return GF3_RunCanonicalActual_(book,operation,date,id,{
  rows:target=>GF3_CanonicalActualRows_(target,scope),
  plan:GF3_CanonicalActualPlan_,storage:scopedStorage,assertWrite
 });
}

function GF3_RunCanonicalActual_(book,operation,date,id,adapter){
 const lock=LockService.getScriptLock();
 if(!['納車完了','返却完了','取消'].includes(operation))throw Error('gf3_actual_operation');
 if(!lock.tryLock(5000))throw Error('gf3_actual_busy');
 try{
 adapter.assertWrite();
 const rows=adapter.rows(book);
 let r=adapter.storage(book,'read',id);
 if(!r){
 if(operation==='取消')throw Error('gf3_actual_missing');
 const before=GF3_ActualSnapshot_(rows);
 const plain=before.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v.url||v.value])));
 const patch=adapter.plan(...plain,operation,date,id);
 if(patch.vehicle['引渡し']&&!/y/i.test(rows[0].sheet
  .getRange(rows[0].number,rows[0].columns['引渡し']+1).getNumberFormat()))
  throw Error('gf3_actual_date_format');
 const after=JSON.parse(JSON.stringify(before));
 [patch.vehicle,patch.waiting,patch.driver].forEach((p,i)=>Object.entries(p).forEach(([k,v])=>{
 if(!(k in after[i]))throw Error('gf3_actual_field');
 const source=k==='前使用者 車両書類'?before[0]['📄 最新車両書類']:k==='前々使用者 車両書類'?before[0]['前使用者 車両書類']:null;
 after[i][k]=source?{...source}:{value:v,url:'',date:k==='引渡し'&&!!v};
 }));
 adapter.storage(book,'insert',id,{kind:operation,actual_date:date,before_data:{rows:before},after_data:{rows:after}});
 r=adapter.storage(book,'read',id);
 }
 if(operation!=='取消'&&(r.kind!==operation||r.actual_date!==date))throw Error('gf3_actual_replay_mismatch');
 const cancel=operation==='取消',initial=cancel?'完了':'待機',active=cancel?'取消処理中':'処理中',done=cancel?'取消済':'完了';
 const from=(cancel?r.after_data:r.before_data).rows,to=(cancel?r.before_data:r.after_data).rows;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 // JSONB reorders object keys; reconstruct in current sheet field order.
 const order=s=>rows.map((row,i)=>Object.fromEntries(Object.keys(row.data).flatMap(k=>{
  const cell=s[i][k];
  if(!cell&&i===0&&['管理区分','納車可能日','納車確定日'].includes(k))return [];
  if(!cell||typeof cell.value!=='string'||typeof cell.url!=='string'||typeof cell.date!=='boolean')
   throw Error('gf3_actual_snapshot_invalid');
  return [[k,{value:cell.value,url:cell.url,date:cell.date}]];
 })));
 const f=order(from),t=order(to),current=GF3_ActualSnapshot_(rows,f);
 if(f.some((row,i)=>Object.keys(row).join('|')!==Object.keys(t[i]).join('|')))throw Error('gf3_actual_snapshot_invalid');
 if(r.state===done){if(!same(current,t))throw Error('gf3_actual_completed_conflict');return {state:done,receiptId:id,replayed:true};}
 if(r.state===initial){if(!same(current,f))throw Error('gf3_actual_snapshot_conflict');adapter.storage(book,'transition',id,{expected:initial,next:active});}
 else if(r.state!==active)throw Error('gf3_actual_state');
 GF3_ActualApply_(book,rows,f,t,adapter);
 adapter.storage(book,'transition',id,{expected:active,next:done});
 return {state:done,receiptId:id};
 }finally{lock.releaseLock();}
}
