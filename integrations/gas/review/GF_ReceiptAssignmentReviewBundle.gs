/** Review bundle only. Not ready for live installation. Dynamic queue claims disabled; validation replica adapter still required. Do not install alongside individual source files. */

// ---- Plan ----
/** 本番割当候補: 認証済みサーバー受付と台帳の新鮮な読取値だけを使用する純粋な計画関数。
 * 保存・同期・ロックは呼出側の責務。本ファイル単独では本番書込みを行わない。
 */
function GF_ReceiptAssignmentPlan_(data, request) {
  const fail = code => { throw Error(code); };
  const one = (rows, predicate, code) => {
    const found = rows.filter(predicate);
    if (found.length !== 1) fail(code);
    return found[0];
  };
  const blank = v => v === '' || v == null;
  const {receiptId, driverId, vehicleId, action} = request;
  if (typeof receiptId !== 'string' || !receiptId || receiptId.length > 150 ||
      !/^D\d{6}$/.test(driverId) || !/^V\d{6}$/.test(vehicleId) ||
      !['assign','cancel'].includes(action)) fail('invalid_request');
  const h = one(data.history, r => r['LINE受付ID'] === receiptId, 'receipt_not_unique');
  if (h.DriverID !== driverId || h['処理状態'] !== '登録済' ||
      !/^[a-f0-9]{64}$/.test(h['受付識別子'])) fail('receipt_driver_mismatch');
  one(data.history, r => r['受付識別子'] === h['受付識別子'], 'receipt_key_not_unique');
  const w = one(data.waiting, r => r['LINE受付ID'] === receiptId ||
      r['受付識別子'] === h['受付識別子'], 'waiting_not_unique');
  if (w['LINE受付ID'] !== receiptId || w['受付識別子'] !== h['受付識別子'] ||
      w.DriverID !== driverId) fail('waiting_mismatch');
  const d = one(data.drivers, r => r.DriverID === driverId, 'driver_not_unique');
  const v = one(data.vehicles, r => r.VehicleID === vehicleId, 'vehicle_not_unique');
  if (d['ステータス'] !== '有効' || !d['氏名'] || !v['車番'] ||
      v['区分/ステータス'] !== '空車') fail('invalid_driver_or_vehicle');
  if (data.waiting.some(r => r !== w && r['割当VehicleID'] === vehicleId)) fail('vehicle_other_receipt');
  if (data.vehicles.some(r => r !== v && r.DriverID === driverId)) fail('multiple_vehicle_review');
  if (data.drivers.some(r => r !== d && r['割当VehicleID'] === vehicleId)) fail('vehicle_other_driver');
  if (!blank(v['納車可能日']) || !blank(v['納車確定日'])) fail('delivery_dates_present');
  const empty = v['管理区分'] === '通常管理' &&
      ['DriverID','現在使用者','所属会社名','稼働エリア'].every(k => blank(v[k])) &&
      w['ステータス'] === '名変待ち' &&
      [w,d].every(r => blank(r['割当VehicleID']) && blank(r['割当車番']));
  const full = v['管理区分'] === '車両準備中' && v.DriverID === driverId &&
      v['現在使用者'] === d['氏名'] &&
      v['所属会社名'] === (d['所属会社名'] || '') &&
      v['稼働エリア'] === (d['稼働エリア'] || '') &&
      w['ステータス'] === '割当済' &&
      [w,d].every(r => r['割当VehicleID'] === vehicleId && r['割当車番'] === v['車番']);
  if (!empty && !full) fail('assignment_state_conflict');
  const assign = action === 'assign';
  if ((assign && full) || (!assign && empty)) return {state:'unchanged', patches:[]};
  // 取消は元の割当を照合できた場合のみ。空車/貸出中の区分は変更しない。
  const pair = {'割当VehicleID':assign?vehicleId:'','割当車番':assign?v['車番']:''};
  return {state:'planned', patches:[
    {sheet:'車両台帳', key:'VehicleID', id:vehicleId, values:{
      '管理区分':assign?'車両準備中':'通常管理',
      DriverID:assign?driverId:'','現在使用者':assign?d['氏名']:'',
      '所属会社名':assign?(d['所属会社名']||''):'',
      '稼働エリア':assign?(d['稼働エリア']||''):''}},
    {sheet:'名変待ち管理',key:'LINE受付ID',id:receiptId,values:{...pair,'ステータス':assign?'割当済':'名変待ち'}},
    {sheet:'ドライバーマスター',key:'DriverID',id:driverId,values:pair}
  ]};
}


// ---- Version ----
/** Read-only snapshot version for the dynamic assignment candidate.
 * Call with fresh server-read tables; never accept tables from the browser.
 * Same input schema as GF_ReceiptAssignmentPlan_. The full snapshot is hashed
 * conservatively: unrelated edits also invalidate the version.
 */
function GF_ReceiptAssignmentVersion_(data,request) {
  const plan=GF_ReceiptAssignmentPlan_(data,request);
  const canonical=value=>{
    if(Array.isArray(value))return value.map(canonical);
    if(value!==null && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value;
  };
  const payload=JSON.stringify(canonical({schema:1,request,data}));
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,payload,Utilities.Charset.UTF_8);
  return {version:digest.map(b=>(b&255).toString(16).padStart(2,'0')).join(''),state:plan.state};
}
function GF_ReceiptAssignmentAssertVersion_(data,request,expected) {
  if(typeof expected!=='string'||!/^[0-9a-f]{64}$/.test(expected))throw Error('invalid_expected_version');
  const current=GF_ReceiptAssignmentVersion_(data,request);
  if(current.version!==expected)throw Error('stale_assignment');
  if(current.state!=='planned')throw Error('assignment_not_planned');
  return true;
}


// ---- SourceCheck ----
/** Read the original LINE receipt again before a dynamic assignment.
 * The caller must supply server-read sheet values, never browser data.
 */
function GF_ReceiptAssignmentSourceCheck_(lineValues,detailValues,request,expectedKey) {
  const rows=(values,required)=>{
    const [header,...body]=values||[];
    if(!Array.isArray(header)||required.some(k=>header.filter(h=>h===k).length!==1))throw Error('receipt_columns_invalid');
    return body.map(row=>Object.fromEntries(required.map(k=>[k,String(row[header.indexOf(k)]??'')])));
  };
  const line=rows(lineValues,['受付ID','受付種別','DriverID']).filter(r=>r['受付ID']===request.receiptId);
  const details=rows(detailValues,['LINE受付ID','受付識別子','確認DriverID','書類状態']);
  const found=details.filter(r=>r['LINE受付ID']===request.receiptId);
  if(line.length!==1||found.length!==1)throw Error('receipt_not_unique');
  const d=found[0],key=d['受付識別子'];
  if(line[0]['受付種別']!=='車両依頼'||line[0].DriverID!==request.driverId||
     d['確認DriverID']!==request.driverId||d['書類状態']!=='保存完了'||
     !/^[a-f0-9]{64}$/.test(key)||key!==expectedKey||
     details.filter(r=>r['受付識別子']===key).length!==1)throw Error('receipt_source_mismatch');
  return true;
}


// ---- Save ----
/** 既存の認可済み受付ワーカーからのみ呼ぶ。公開 doPost ではない。
 * syncExisting: 現行同期を実行するサーバー側関数。nullなら定期同期に委ねる。
 * verifyExisting: 現行DBを読み、対象3シートの反映を確認するサーバー側関数。
 * 本番設定・既存トリガーは変更しない。
 */
function GF_ReceiptAssignmentSave_(bookId, request, syncExisting, verifyExisting, expectedVersion, verifySource) {
  if ((syncExisting !== null && typeof syncExisting !== 'function') || typeof verifyExisting !== 'function')
    throw Error('existing_sync_not_connected');
  if (typeof GF_SB_対象ID_ !== 'function' || GF_SB_対象ID_() !== bookId)
    throw Error('ledger_target_mismatch');
  const api = Sheets.Spreadsheets;
  const names = ['GF_LINEドライバー同期履歴','名変待ち管理','ドライバーマスター','車両台帳'];
  const keys = [
    ['LINE受付ID','受付識別子','DriverID','処理状態'],
    ['LINE受付ID','受付識別子','DriverID','ステータス','割当VehicleID','割当車番'],
    ['DriverID','氏名','ステータス','所属会社名','稼働エリア','割当VehicleID','割当車番'],
    ['VehicleID','DriverID','車番','区分/ステータス','管理区分','現在使用者','所属会社名','稼働エリア','納車可能日','納車確定日']
  ];
  const read = () => {
    const result = api.Values.batchGet(bookId,{ranges:names.map(n=>"'"+n+"'"),valueRenderOption:'UNFORMATTED_VALUE'}).valueRanges;
    if (!result || result.length !== names.length) throw Error('ledger_read_failed');
    return result.map((item,i)=>{
      const [header,...rows] = item.values || [];
      if (!header) throw Error('missing_header');
      const columns = Object.fromEntries(keys[i].map(k=>{
        const c=header.indexOf(k);
        if(c<0 || c!==header.lastIndexOf(k)) throw Error('invalid_header:'+k);
        return [k,c];
      }));
      return {columns,rows:rows.map(row=>Object.fromEntries(keys[i].map(k=>[k,row[columns[k]]??''])))};
    });
  };
  const snapshot = tables => ({history:tables[0].rows,waiting:tables[1].rows,drivers:tables[2].rows,vehicles:tables[3].rows});
  const plan = tables => GF_ReceiptAssignmentPlan_(snapshot(tables),request);
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const tables=read(), p=plan(tables);
    if(expectedVersion !== undefined) {
      GF_ReceiptAssignmentAssertVersion_(snapshot(tables),request,expectedVersion);
      const h=tables[0].rows.find(r=>r['LINE受付ID']===request.receiptId);
      if(typeof verifySource!=='function'||verifySource(request,h['受付識別子'])!==true) throw Error('receipt_source_not_verified');
    }
    if(p.patches.length){
      const meta=api.get(bookId,{fields:'sheets(properties(sheetId,title))'}).sheets;
      const requests=[];
      for(const patch of p.patches){
        const t=tables[names.indexOf(patch.sheet)];
        const matches=t.rows.map((r,i)=>r[patch.key]===patch.id?i+1:-1).filter(i=>i>=0);
        if(matches.length!==1) throw Error('row_not_unique');
        const rowIndex=matches[0];
        const sheetId=meta.find(s=>s.properties.title===patch.sheet)?.properties.sheetId;
        if(!Number.isInteger(sheetId)) throw Error('sheet_missing');
        const range="'"+patch.sheet+"'!"+(rowIndex+1)+":"+(rowIndex+1);
        const cells=api.get(bookId,{ranges:[range],fields:'sheets(data(rowData(values(userEnteredValue,effectiveValue))))'}).sheets?.[0]?.data?.[0]?.rowData?.[0]?.values;
        if(!cells) throw Error('row_read_failed');
        for(const [k,c] of Object.entries(t.columns)){
          const val=cells[c]?.effectiveValue;
          if(val?.errorValue || (val?.stringValue??val?.numberValue??val?.boolValue??'')!==t.rows[rowIndex-1][k]) throw Error('row_changed');
        }
        for(const [k,value] of Object.entries(patch.values)){
          const columnIndex=t.columns[k];
          if(!Number.isInteger(columnIndex)||cells[columnIndex]?.userEnteredValue?.formulaValue) throw Error('protected_cell');
          requests.push({updateCells:{start:{sheetId,rowIndex,columnIndex},rows:[{values:[value===''?{}:{userEnteredValue:{stringValue:String(value)}}]}],fields:'userEnteredValue'}});
        }
      }
      if(JSON.stringify(read())!==JSON.stringify(tables)) throw Error('ledger_changed');
      try {
        api.batchUpdate({requests},bookId);
      } catch (_) {
        // A transport failure can arrive after Sheets has committed the atomic batch.
        // Verify once and leave a nonmatching or unreadable state for review.
        if (plan(read()).state !== 'unchanged') throw Error('ledger_write_unconfirmed');
      }
    }
    if(plan(read()).state!=='unchanged') throw Error('ledger_verification_failed');
  } finally {lock.releaseLock();}
  // Existing synchronization can acquire its own lock. Never call it while holding ours.
  try {
    if (syncExisting) syncExisting();
    if(verifyExisting(request)!==true || plan(read()).state!=='unchanged')
      return {status:'reconciliation_required'};
    return {status:'verified'};
  } catch(e) {return {status:'reconciliation_required'};}
}


// ---- Replica ----
/** 既存の車両差分同期を待ち、現在の車両台帳と複製を照合する内部入口。 */
function GF_ReceiptAssignmentSaveAndCheck_(bookId, request, expectedVersion, verifySource) {
  if (typeof GF_SB_1台同期事前確認_読取専用 !== 'function' ||
      typeof GF_SB_ENV === 'undefined' || GF_SB_ENV.VEHICLE_SHEET !== '車両台帳' ||
      GF_SB_ENV.SUPABASE_TABLE !== 'gf_vehicles') throw Error('existing_replica_not_connected');

  // 既存定期同期が処理する。受付操作から他車両・ドライバー・受付の一括同期を起動しない。
  return GF_ReceiptAssignmentSave_(bookId, request,
    null,
    current => GF_ReceiptAssignmentReplicaMatches_(GF_SB_1台同期事前確認_読取専用(current.vehicleId), current),
    expectedVersion, verifySource
  );
}

/** 既存プレビューの差分判定が無視する欠損キーも、明示的に照合する。 */
function GF_ReceiptAssignmentReplicaMatches_(preview, request) {
  const {result,payload,old} = preview || {};
  if (result?.action !== 'UNCHANGED' || result.vehicleId !== request.vehicleId ||
      payload?.vehicle_id !== request.vehicleId || old?.vehicle_id !== request.vehicleId ||
      payload.vehicle_number !== old.vehicle_number) return false;
  const source=payload.vehicle_data, replica=old.vehicle_data;
  const driverFields=['DriverID','区分/ステータス','管理区分','現在使用者','所属会社名','稼働エリア','納車可能日','納車確定日'];
  if (!source || !replica || driverFields.some(key =>
    !Object.prototype.hasOwnProperty.call(source,key) ||
    !Object.prototype.hasOwnProperty.call(replica,key) || source[key] !== replica[key])) return false;
  const assigned=request.action==='assign';
  return source.DriverID===(assigned?request.driverId:'') &&
    source['区分/ステータス']==='空車' && source['管理区分']===(assigned?'車両準備中':'通常管理');
}


// ---- QueueAdapter ----
/** Queue adapter for the authenticated staff worker. Not a public GAS endpoint.
 * The caller must obtain the row from the server-owned queue, not the browser.
 * No deployment or trigger changes are performed by this file.
 */
function GF_ReceiptAssignmentQueueRequest_(row) {
  if (!row || row.state !== 'processing' ||
      typeof row.request_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.request_id) ||
      typeof row.actor_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.actor_id) ||
      typeof row.receipt_id !== 'string' || !row.receipt_id.trim() ||
      row.receipt_id !== row.receipt_id.trim() || row.receipt_id.length > 150 ||
      /[\r\n]/.test(row.receipt_id) ||
      typeof row.driver_id !== 'string' || !/^D\d{6}$/.test(row.driver_id) ||
      typeof row.vehicle_id !== 'string' || !/^V\d{6}$/.test(row.vehicle_id) ||
      typeof row.expected_version !== 'string' || !/^[0-9a-f]{64}$/.test(row.expected_version) ||
      !['assign','cancel'].includes(row.action)) throw Error('invalid_claimed_assignment');
  return {receiptId:row.receipt_id,driverId:row.driver_id,vehicleId:row.vehicle_id,action:row.action};
}
/** Candidate adapter only. Caller must enforce authorization, operation version
 * and replay protection before invoking. Do not attach to legacy fixed-ID queue.
 */
function GF_ReceiptAssignmentRunClaimed_(bookId,row,assertCurrentOperation,verifySource) {
  const request=GF_ReceiptAssignmentQueueRequest_(row);
  if(typeof assertCurrentOperation!=='function' ||
     assertCurrentOperation(row)!==true) throw Error('operation_not_current');
  if(typeof GF_ReceiptAssignmentSaveAndCheck_!=='function') throw Error('assignment_save_missing');
  const result=GF_ReceiptAssignmentSaveAndCheck_(bookId,request,row.expected_version,verifySource);
  if(!result || !['verified','reconciliation_required'].includes(result.status))
    throw Error('unexpected_assignment_result');
  return {request_id:row.request_id,status:result.status};
}


// ---- ValidationRunner ----
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


// ---- WorkerHealth ----
/** Read-only connectivity diagnostic; never claims or saves an assignment.
 * Reuses the existing demo sync token via an explicit caller argument.
 * Do not log the token or raw HTTP response.
 */
function GF_ReceiptAssignmentWorkerHealth_(token) {
  if(typeof token!=='string'||token.length<32)throw Error('worker_token_missing');
  const url='https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-assignment-dynamic-queue-worker-test';
  const r=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',
    headers:{'x-gf-sync-token':token},payload:JSON.stringify({action:'health'}),
    muteHttpExceptions:true,followRedirects:false});
  if(r.getResponseCode()!==200)throw Error('worker_health_http_'+r.getResponseCode());
  const b=JSON.parse(r.getContentText());
  if(b.ok!==true||b.write_enabled!==false)throw Error('unexpected_worker_health');
  return {connected:true,write_enabled:false};
}
