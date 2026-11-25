/** 既存の検証 doPost に追加する読み取り専用分岐。登録処理から独立。 */
function GF_動的割当検証版を受信_(e) {
  const raw=e?.postData?.contents;
  if(typeof raw!=='string'||raw.length>2048)return null;
  let p;
  try {p=JSON.parse(raw);} catch (_) {return null;}
  if(p?.action!=='gfa_assignment_preview_v1')return null;
  const reply=(status,body)=>ContentService.createTextOutput(JSON.stringify({status,...body}))
    .setMimeType(ContentService.MimeType.JSON);
  const {operation,receiptId,driverId,vehicleId,issuedAt,signature}=p;
  if(!['assign','cancel'].includes(operation)||typeof receiptId!=='string'||!receiptId||
     receiptId!==receiptId.trim()||receiptId.length>150||/[\r\n]/.test(receiptId)||
     typeof driverId!=='string'||!/^D\d{6}$/.test(driverId)||
     typeof vehicleId!=='string'||!/^V9\d{5}$/.test(vehicleId)||
     !Number.isSafeInteger(issuedAt)||Math.abs(Date.now()-issuedAt)>60000||
     typeof signature!=='string'||!/^[-_a-zA-Z0-9]{43}$/.test(signature))return reply(403,{error:'denied'});
  const secret=PropertiesService.getScriptProperties().getProperty('GFA_STAFF_BRIDGE_SECRET');
  if(!secret||secret.length<32)return reply(403,{error:'denied'});
  const body=JSON.stringify([p.action,operation,receiptId,driverId,vehicleId,issuedAt]);
  const expected=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body,secret)).replace(/=+$/,'');
  let mismatch=0;
  for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);
  if(mismatch)return reply(403,{error:'denied'});
  try {
    const found=GF_ReceiptAssignmentValidationVersion_({receiptId,driverId,vehicleId,action:operation});
    return found.state==='planned'?reply(200,{version:found.version}):reply(409,{error:'assignment_not_planned'});
  } catch(err) {
    const expected=new Set(['invalid_request','receipt_not_unique','receipt_driver_mismatch','receipt_key_not_unique',
      'waiting_not_unique','waiting_mismatch','driver_not_unique','vehicle_not_unique','invalid_driver_or_vehicle',
      'vehicle_other_receipt','multiple_vehicle_review','vehicle_other_driver','delivery_dates_present',
      'assignment_state_conflict','receipt_source_mismatch']);
    return expected.has(err.message)?reply(409,{error:'assignment_review_required'}):
      reply(503,{error:'assignment_preview_unavailable'});
  }
}
