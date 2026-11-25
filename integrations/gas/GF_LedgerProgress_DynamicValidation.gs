/** 既存検証GAS専用。動的割当の読み取り・接続先ガードを再利用する。 */
function GF_LedgerDynamicProgressResolve_(tables, job, sourceCheck) {
  const [history,waiting,drivers,vehicles]=tables.map(t=>t.rows);
  const exactly=(data,match)=>{
    const found=data.filter(match);
    if(found.length!==1)throw Error('assignment_not_unique');
    return found[0];
  };
  const entry=exactly(history,row=>row['LINE受付ID']===job.receipt_id);
  const key=entry['受付識別子'];
  if(entry.DriverID!==job.driver_id||entry['処理状態']!=='登録済'||!/^[a-f0-9]{64}$/.test(key))
    throw Error('receipt_assignment_mismatch');
  exactly(history,row=>row['受付識別子']===key);
  const receipt=exactly(waiting,row=>row['LINE受付ID']===job.receipt_id||row['受付識別子']===key);
  const driver=exactly(drivers,row=>row.DriverID===job.driver_id);
  const vehicle=exactly(vehicles,row=>row.VehicleID===job.vehicle_id);
  if(receipt['LINE受付ID']!==job.receipt_id||receipt['受付識別子']!==key||
     receipt.DriverID!==job.driver_id||!['割当済','割当済み'].includes(receipt['ステータス'])||
     receipt['割当VehicleID']!==job.vehicle_id||receipt['割当車番']!==vehicle['車番']||
     driver['ステータス']!=='有効'||driver['割当VehicleID']!==job.vehicle_id||
     driver['割当車番']!==vehicle['車番']||vehicle.DriverID!==job.driver_id||
     waiting.some(row=>row!==receipt&&row['割当VehicleID']===job.vehicle_id)||
     drivers.some(row=>row!==driver&&row['割当VehicleID']===job.vehicle_id))throw Error('receipt_assignment_mismatch');
  if(sourceCheck({receiptId:job.receipt_id,driverId:job.driver_id,vehicleId:job.vehicle_id},key)!==true)
    throw Error('receipt_source_mismatch');
  return {vehicleId:job.vehicle_id,driverId:job.driver_id};
}

function GF_動的進捗検証キューを1件処理() {
  // Check local prerequisites before acquiring a lease that blocks assignment.
  if(typeof GF_ReceiptAssignmentValidationBook_!=='function'||
     typeof GF_ReceiptAssignmentReadTables_!=='function'||
     typeof GF_ReceiptAssignmentValidationSource_!=='function'||
     typeof GF_LedgerProdProgressSave_!=='function'||
     typeof GF_LedgerProdProgressRead_!=='function'||
     typeof Sheets==='undefined'||typeof Sheets.Spreadsheets?.Values?.get!=='function'||
     typeof Sheets.Spreadsheets?.get!=='function'||typeof Sheets.Spreadsheets?.batchUpdate!=='function')
    throw Error('validation_progress_dependencies_missing');
  const book=GF_ReceiptAssignmentValidationBook_();
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('GF_DYNAMIC_PROGRESS_GAS_ENABLED')!=='true')throw Error('validation_progress_disabled');
  const token=props.getProperty('GF_VEHICLE_DEMO_SYNC_TOKEN');
  if(!token||token.length<32)throw Error('worker_token_missing');
  const call=body=>{
    const r=UrlFetchApp.fetch('https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-assignment-dynamic-progress-test',{
      method:'post',contentType:'application/json',headers:{'x-gf-sync-token':token},
      payload:JSON.stringify(body),muteHttpExceptions:true,followRedirects:false,
    });
    if(r.getResponseCode()!==200)throw Error('progress_worker_http_'+r.getResponseCode());
    return JSON.parse(r.getContentText());
  };
  const job=call({action:'claim'}).request;
  if(!job)return {status:'empty'};
  const lease={request_id:job.request_id,claimed_at:job.claimed_at};
  let status='reconciliation_required';
  try{
    if(!/^V9\d{5}$/.test(job.vehicle_id)||!/^D\d{6}$/.test(job.driver_id)||
       job.expected?.vehicleId!==job.vehicle_id||job.expected?.driverId!==job.driver_id)throw Error('invalid_job');
    const resolve=()=>GF_LedgerDynamicProgressResolve_(GF_ReceiptAssignmentReadTables_(book),job,GF_ReceiptAssignmentValidationSource_);
    const saved=GF_LedgerProdProgressSave_(book,job.expected,job.fields,resolve).snapshot;
    // The progress queue prevents overlapping assignment operations until verification completes.
    if(call({action:'replicate',...lease,snapshot:saved}).verified===true&&
       JSON.stringify(GF_LedgerProdProgressRead_(book,job.vehicle_id).snapshot)===JSON.stringify(saved))status='verified';
  }catch(_){
    // No auto-replay after an uncertain write.
  }
  return {status:call({action:'finish',...lease,status}).state};
}
