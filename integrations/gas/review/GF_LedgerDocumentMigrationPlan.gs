/** Read-only migration planner. Input cells must include actual link metadata.
 * No spreadsheet writes. Unmatched IDs and occupied destination cells are never overwritten.
 */
function GF_LedgerDocumentMigrationPlan_(ledger,status,users){
 const mapping=[['status','📷車両状態フォルダ'],['status','🔧整備書類フォルダ'],['status','📷前回車両状態フォルダ'],['users','最新 車両状態写真'],['users','前回 車両状態写真'],['users','前DriverID'],['users','前使用者 車両書類']];
 const index=(rows)=>{const m=new Map();for(const r of rows){if(!/^V\d{6}$/.test(r.id)||m.has(r.id))throw Error('invalid_or_duplicate_vehicle_id');m.set(r.id,r);}return m;};
 const l=index(ledger),sources={status:index(status),users:index(users)},patches=[],review=[];
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 for(const [source,key] of mapping){for(const [id,row] of sources[source]){
   const dest=l.get(id);if(!dest){review.push({id,key,reason:'missing_ledger'});continue;}
   const cell=row.cells?.[key];if(!cell||!cell.text)continue;
   if(key!=='前DriverID'&&(!Array.isArray(cell.links)||!cell.links.length||cell.links.some(x=>!/^https:\/\/(drive|docs)\.google\.com\//.test(x.url)))){review.push({id,key,reason:'link_unverified'});continue;}
   if(key==='前DriverID'&&!/^D\d{6}$/.test(cell.text)){review.push({id,key,reason:'invalid_driver_id'});continue;}
   const old=dest.cells?.[key];if(old?.text||old?.formula||old?.links?.length){if(!equal(old,cell))review.push({id,key,reason:'destination_occupied'});continue;}
   patches.push({id,key,cell});
 }}
 return {patches,review};
}
