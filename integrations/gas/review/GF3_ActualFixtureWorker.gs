/** GF3 actual worker: exact dummy rows, journal before mutation, atomic Sheets batch. */
function GF3_ActualRows_(book){
 const vf=['VehicleID','区分/ステータス','DriverID','現在使用者','引渡し','前使用者','前DriverID','前使用者 車両書類','前々使用者','前々DriverID','前々使用者 車両書類','📄 最新車両書類'];
 return [GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID','V900005',vf),GF3_AssignmentFixtureRow_(book,'名変待ち管理','受付ID','2',['受付ID','DriverID','ステータス','割当VehicleID','割当車番']),GF3_AssignmentFixtureRow_(book,'ドライバーマスター','DriverID','D999902',['DriverID','氏名','割当VehicleID','割当車番'])];
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
function GF3_ActualSnapshot_(rows){
 return rows.map(row=>Object.fromEntries(Object.keys(row.data).map(k=>[k,GF3_ActualCell_(row,k)])));
}
function GF3_ActualApply_(book,rows,from,to){
 const current=GF3_ActualSnapshot_(rows);
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
 if(requests.length)Sheets.Spreadsheets.batchUpdate({requests},book.getId());
 SpreadsheetApp.flush();
 if(JSON.stringify(GF3_ActualSnapshot_(GF3_ActualRows_(book)))!==JSON.stringify(to))throw Error('gf3_actual_readback');
}
function GF3_SaveActualFixture(operation,date,id){
 const book=GF3_DocumentUiOwner_(),lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_actual_busy');
 try{
 const rows=GF3_ActualRows_(book);
 let r=GF3_ActualStorage_(book,'read',id);
 if(!r){
 if(operation==='取消')throw Error('gf3_actual_missing');
 const before=GF3_ActualSnapshot_(rows);
 const plain=before.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v.url||v.value])));
 const patch=GF3_ActualPlan_(...plain,operation,date,id);
 const after=JSON.parse(JSON.stringify(before));
 [patch.vehicle,patch.waiting,patch.driver].forEach((p,i)=>Object.entries(p).forEach(([k,v])=>{
 if(!(k in after[i]))throw Error('gf3_actual_field');
 const source=k==='前使用者 車両書類'?before[0]['📄 最新車両書類']:k==='前々使用者 車両書類'?before[0]['前使用者 車両書類']:null;
 after[i][k]=source?{...source}:{value:v,url:'',date:k==='引渡し'&&!!v};
 }));
 GF3_ActualStorage_(book,'insert',id,{kind:operation,actual_date:date,before_data:{rows:before},after_data:{rows:after}});
 r=GF3_ActualStorage_(book,'read',id);
 }
 if(operation!=='取消'&&(r.kind!==operation||r.actual_date!==date))throw Error('gf3_actual_replay_mismatch');
 const cancel=operation==='取消',initial=cancel?'完了':'待機',active=cancel?'取消処理中':'処理中',done=cancel?'取消済':'完了';
 const from=(cancel?r.after_data:r.before_data).rows,to=(cancel?r.before_data:r.after_data).rows;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 // JSONB reorders object keys; reconstruct in current sheet field order.
 const order=s=>rows.map((row,i)=>Object.fromEntries(Object.keys(row.data).map(k=>[k,{value:s[i][k].value,url:s[i][k].url,date:s[i][k].date}])));
 const f=order(from),t=order(to),current=GF3_ActualSnapshot_(rows);
 if(r.state===done){if(!same(current,t))throw Error('gf3_actual_completed_conflict');return {state:done,replayed:true};}
 if(r.state===initial){if(!same(current,f))throw Error('gf3_actual_snapshot_conflict');GF3_ActualStorage_(book,'transition',id,{expected:initial,next:active});}
 else if(r.state!==active)throw Error('gf3_actual_state');
 GF3_ActualApply_(book,rows,f,t);
 GF3_ActualStorage_(book,'transition',id,{expected:active,next:done});
 return {state:done,receiptId:id};
 }finally{lock.releaseLock();}
}
