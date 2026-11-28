const GF3_MONTHLY_SHEET_='月別納車管理';
const GF3_MONTHLY_HEADER_=['月','予定件数','納車実績件数'];

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
  const fields=['VehicleID','DriverID','納車予定日'];
  const cols=GF3_Columns_(ledger,fields);
  const rows=ledger.getDataRange().getDisplayValues().slice(1)
   .filter(row=>/^V9\d{5}$/.test(row[cols.VehicleID])&&/^D9\d{5}$/.test(row[cols.DriverID]))
   .map(row=>Object.fromEntries(fields.map(field=>[field,row[cols[field]]])));
  const values=GF3_MonthlyDeliveryRows_(rows,GF3_ActualDeliveryMonths_(book));
  if(sheet.getRange(3,1,1,3).getDisplayValues()[0].join('|')!==GF3_MONTHLY_HEADER_.join('|'))
   throw Error('gf3_monthly_header_changed');
  const n=Math.max(values.length,sheet.getLastRow()-3);
  if(!n)return {months:0};
  if(n+3>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),n+3-sheet.getMaxRows());
  const output=Array.from({length:n},(_,i)=>values[i]||['','','']);
  const range=sheet.getRange(4,1,n,3);
  if(JSON.stringify(range.getValues())!==JSON.stringify(output))range.setValues(output);
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
