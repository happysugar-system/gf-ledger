// Transport only. Caller must retain request ID across ambiguous failures.
export function createVehicleSaveClient({endpoint,getToken,publishableKey,fetcher=fetch}){
 async function call(action,body){
  const token=await getToken();if(!token)throw Error('login_required');
  const r=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({...body,action}),signal:AbortSignal.timeout(20000),cache:'no-store'});
  const data=await r.json();if(!r.ok){const e=Error(data.error||'save_api_error');e.status=r.status;throw e;}return data;
 }
 return {enqueue:request=>call('save',request),status:request_id=>call('status',{request_id})};
}
export function isVerifiedSave(status,request){
 return status?.request_id===request.request_id&&status?.vehicleId===request.vehicleId&&status.state==='replica_verified'&&typeof status.verified_at==='string'&&Number.isFinite(Date.parse(status.verified_at))&&Object.keys(request.changes).length>0&&Object.entries(request.changes).every(([k,v])=>Object.prototype.hasOwnProperty.call(status.verified_fields??{},k)&&status.verified_fields[k]===v);
}
