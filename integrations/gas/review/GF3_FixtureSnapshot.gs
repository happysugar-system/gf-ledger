/** Read-only GF3 fixture snapshot. No production fallback, no personal fields. */
function GF3_ReadFixtureSnapshot_(){
 const book=GF3_DocumentUiOwner_();
 const specs=[['車両台帳','VehicleID',['VehicleID','区分/ステータス','管理区分','納車予定日','納車可能日','納車確定日']],['名変待ち管理','受付ID',['受付ID','ステータス','割当VehicleID','DriverID']],['ドライバーマスター','DriverID',['DriverID','ステータス','割当VehicleID']]];
 const result={environment:'gf3',sheets:{}};
 for(const [name,key,fields] of specs){
  const sheet=GF3_AssertSheet_(book.getSheetByName(name));
  const cols=GF3_Columns_(sheet,fields);
  const rows=sheet.getDataRange().getDisplayValues().slice(1);
  const seen=new Set();
  result.sheets[name]=rows.filter(r=>r[cols[key]]).map(r=>{
   const id=r[cols[key]];
   if(!(key==='VehicleID'?/^(V9[0-9]+|TEST-V[0-9]+)$/:key==='DriverID'?/^D9[0-9]+$/:/^TEST-[A-Z0-9-]+$/i).test(id))throw Error('gf3_nonfixture_row');
   if(seen.has(id))throw Error('gf3_duplicate_fixture');
   seen.add(id);
   return Object.fromEntries(fields.map(k=>[k,r[cols[k]]||'']));
  });
 }
 return result;
}
function GF3_ReadFixtureSnapshot(){return GF3_ReadFixtureSnapshot_();}
