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
