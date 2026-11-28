const GF3_MONTHLY_SHEET_='月別納車管理';
const GF3_MONTHLY_HEADER_=['月','予定件数','納車実績件数'];
const GF3_MONTHLY_PLAN_HEADER_=['納車予定日','VehicleID','DriverID','ドライバー名','紹介元'];
const GF3_MONTHLY_ACTUAL_HEADER_=['実績日','VehicleID','DriverID','当時のドライバー名','受付ID'];

function GF3_MonthlyDeliveryRows_(ledger,actual){
 const totals=new Map();
 for(const {month,delivered} of actual)totals.set(month,[month,0,delivered]);
 for(const vehicle of ledger){
  if(!vehicle.DriverID||!vehicle['納車予定日'])continue;
  const month=GF3_ProgressDate_(vehicle['納車予定日']).slice(0,7);
  const row=totals.get(month)||[month,0,0];
  row[1]++;
  totals.set(month,row);
 }
 return Array.from(totals.values()).sort((a,b)=>a[0].localeCompare(b[0]));
}

function GF3_RefreshMonthlyDelivery_(book){
 GF3_AssertBook_(book);
 const sheet=book.getSheetByName(GF3_MONTHLY_SHEET_);
 if(!sheet||!sheet.getDeveloperMetadata().some(m=>m.getKey()==='GF3_MONTHLY_PROJECTION'))return;
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_monthly_busy');
 try{
  const ledger=GF3_AssertSheet_(book.getSheetByName('車両台帳'));
  const fields=['VehicleID','DriverID','納車予定日','現在使用者','紹介元'];
  const cols=GF3_Columns_(ledger,fields);
  const rows=ledger.getDataRange().getDisplayValues().slice(1)
   .filter(row=>/^V9\d{5}$/.test(row[cols.VehicleID])&&/^D9\d{5}$/.test(row[cols.DriverID]))
   .map(row=>Object.fromEntries(fields.map(field=>[field,row[cols[field]]])));
  const details=GF3_ActualStorage_(book,'delivery-details');
  if(!Array.isArray(details)||details.some(x=>!/^TEST-GF3-[A-Z0-9-]+$/.test(x.receiptId)||
    x.vehicleId!=='V900005'||x.driverId!=='D999902'||GF3_ProgressDate_(x.date)!==x.date||typeof x.driverName!=='string'))
   throw Error('gf3_monthly_details_invalid');
  const counts=new Map();
  details.forEach(x=>{const month=x.date.slice(0,7);counts.set(month,(counts.get(month)||0)+1);});
  const values=GF3_MonthlyDeliveryRows_(rows,Array.from(counts,([month,delivered])=>({month,delivered})));
  const plans=rows.filter(row=>row['納車予定日']).map(row=>[GF3_ProgressDate_(row['納車予定日']),
   row.VehicleID,row.DriverID,row['現在使用者'],row['紹介元']]).sort((a,b)=>a[0].localeCompare(b[0]));
  const actual=details.map(x=>[x.date,x.vehicleId,x.driverId,x.driverName,x.receiptId])
   .sort((a,b)=>a[0].localeCompare(b[0])||a[4].localeCompare(b[4]));
  if(sheet.getRange(3,1,1,3).getDisplayValues()[0].join('|')!==GF3_MONTHLY_HEADER_.join('|'))
   throw Error('gf3_monthly_header_changed');
  const data=[];
  const n=Math.max(values.length,plans.length,actual.length,sheet.getLastRow()-3);
  if(n+3>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),n+3-sheet.getMaxRows());
  for(const [column,letter,header,items] of [[1,'A',GF3_MONTHLY_HEADER_,values],
    [5,'E',GF3_MONTHLY_PLAN_HEADER_,plans],[11,'K',GF3_MONTHLY_ACTUAL_HEADER_,actual]]){
   const existing=sheet.getRange(3,column,1,header.length).getDisplayValues()[0];
   if(existing.join('|')!==header.join('|')&&existing.some(Boolean))throw Error('gf3_monthly_header_changed:'+letter);
   const output=[header,...Array.from({length:n},(_,i)=>items[i]||header.map(()=>''))];
   if(JSON.stringify(sheet.getRange(3,column,n+1,header.length).getValues())!==JSON.stringify(output))
    data.push({range:"'"+GF3_MONTHLY_SHEET_+"'!"+letter+'3',values:output});
  }
  if(data.length)Sheets.Spreadsheets.Values.batchUpdate({valueInputOption:'RAW',data},book.getId());
  return {months:values.length};
 }finally{lock.releaseLock();}
}

function GF3_InstallMonthlyDelivery(){
 const book=GF3_DocumentUiOwner_();
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_monthly_busy');
 try{
  if(!book.getSheetByName(GF3_MONTHLY_SHEET_)){
   const sheet=book.insertSheet(GF3_MONTHLY_SHEET_);
   sheet.getRange(3,1,1,3).setValues([GF3_MONTHLY_HEADER_]);
   sheet.getRange('A4:A').setNumberFormat('@');
   sheet.addDeveloperMetadata('GF3_MONTHLY_PROJECTION','1');
  }
 }finally{lock.releaseLock();}
 return GF3_RefreshMonthlyDelivery_(book);
}
