/** Validation-only source reader. No writes. */
function GF_ReceiptAssignmentValidationSource_(request,expectedKey) {
  const book='12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8';
  const result=Sheets.Spreadsheets.Values.batchGet(book,{
    ranges:["'LINE受付管理'!A1:Z","'車両依頼受付'!A1:AZ"],
    valueRenderOption:'FORMATTED_VALUE'
  }).valueRanges;
  if(!result||result.length!==2)throw Error('receipt_source_read_failed');
  return GF_ReceiptAssignmentSourceCheck_(result[0].values,result[1].values,request,expectedKey);
}
/** Internal validation runner. Only a trusted queue worker may supply the claim
 * and current-operation assertion. Never expose as a public doPost.
 */
function GF_ReceiptAssignmentValidationRun_(row,assertCurrentOperation) {
  const book='1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU';
  if(typeof GF_SB_対象ID_!=='function'||GF_SB_対象ID_()!==book)
    throw Error('validation_target_mismatch');
  return GF_ReceiptAssignmentRunClaimed_(book,row,assertCurrentOperation,GF_ReceiptAssignmentValidationSource_);
}

function GF_ReceiptAssignmentValidationBook_() {
  const props=PropertiesService.getScriptProperties();
  const book='1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU';
  if(ScriptApp.getScriptId()!=='1rRpYdmZsCocUtldRJrpKokpX_Km_NPw0F8h3SOaiykHiR3y4kTgBdSt5'||
     props.getProperty('GFA_APPROVED_BOOK_ID')!==book||
     props.getProperty('GFA_APPROVED_LINE_BOOK_ID')!=='12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8')
    throw Error('validation_target_mismatch');
  return book;
}

function GF_ReceiptAssignmentValidationVersion_(request) {
  const book=GF_ReceiptAssignmentValidationBook_();
  if(!/^V9\d{5}$/.test(request?.vehicleId))throw Error('validation_vehicle_required');
  const [history,waiting,drivers,vehicles]=GF_ReceiptAssignmentReadTables_(book).map(t=>t.rows);
  const result=GF_ReceiptAssignmentVersion_({history,waiting,drivers,vehicles},request);
  const h=history.find(r=>r['LINE受付ID']===request.receiptId);
  GF_ReceiptAssignmentValidationSource_(request,h['受付識別子']);
  return result;
}

/** Operates on one server-claimed job only. No trigger registration. */
function GF_動的割当検証キューを1件処理() {
  const book=GF_ReceiptAssignmentValidationBook_();
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('GF_DYNAMIC_ASSIGNMENT_GAS_ENABLED')!=='true')throw Error('validation_worker_disabled');
  const token=props.getProperty('GF_VEHICLE_DEMO_SYNC_TOKEN');
  if(!token||token.length<32)throw Error('worker_token_missing');
  const call=body=>{
    const r=UrlFetchApp.fetch('https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-assignment-dynamic-queue-worker-test',{
      method:'post',contentType:'application/json',headers:{'x-gf-sync-token':token},
      payload:JSON.stringify(body),muteHttpExceptions:true,followRedirects:false,
    });
    if(r.getResponseCode()!==200)throw Error('worker_http_'+r.getResponseCode());
    return JSON.parse(r.getContentText());
  };
  const row=call({action:'claim'}).request;
  if(!row)return {status:'empty'};
  const lease={request_id:row.request_id,claimed_at:row.claimed_at};
  let status='reconciliation_required', saveStarted=false;
  try {
    const request=GF_ReceiptAssignmentQueueRequest_(row);
    if(!/^V9\d{5}$/.test(request.vehicleId))throw Error('validation_vehicle_required');
    const current=call({action:'current',...lease}).request;
    if(Object.keys(row).some(k=>current?.[k]!==row[k]))throw Error('operation_not_current');
    const readRecord=()=>{
      const vehicle=GF_ReceiptAssignmentReadTables_(book)[3].rows.filter(r=>r.VehicleID===request.vehicleId);
      if(vehicle.length!==1)throw Error('vehicle_not_unique');
      const keys=['VehicleID','DriverID','車番','区分/ステータス','管理区分','納車可能日','納車確定日'];
      return Object.fromEntries(keys.map(k=>[k,String(vehicle[0][k]??'')]));
    };
    const fresh=GF_ReceiptAssignmentValidationVersion_(request);
    if(fresh.version!==row.expected_version||fresh.state!=='planned')throw Error('stale_assignment');
    saveStarted=true;
    const result=GF_ReceiptAssignmentSave_(book,request,null,()=>{
      const record=readRecord();
      return call({action:'replicate',...lease,record}).verified===true&&
        JSON.stringify(readRecord())===JSON.stringify(record);
    },row.expected_version,GF_ReceiptAssignmentValidationSource_,true);
    status=result.status;
  }catch(e){
    if(!saveStarted&&['stale_assignment','receipt_source_mismatch','receipt_source_not_verified','validation_vehicle_required',
        'receipt_driver_mismatch','waiting_mismatch','assignment_not_planned'].includes(e.message))status='rejected';
  }
  // A failed completion call leaves the claim locked for an operator to reconcile.
  return {status:call({action:'finish',...lease,status}).state};
}
