import {isVerifiedSave} from './vehicle-save-client.mjs';
export function createSaveController({api,storage,userId,uuid=()=>crypto.randomUUID(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const key='gf-production-vehicle-pending:'+userId;
 let busy=false;
 const pending=()=>JSON.parse(storage.getItem(key)||'null');
 async function confirm(request,onStatus){
  for(let i=0;i<24;i++){
   let status;
   try{status=await api.status(request.request_id);}catch(e){
    if(e.status&&e.status<500&&e.status!==404)throw e;
    onStatus('保存状況を確認しています…');await sleep(5000);continue;
   }
   if(isVerifiedSave(status,request)){storage.removeItem(key);return 'verified';}
   if(['conflict','rejected','reconciliation_required'].includes(status.state)){storage.removeItem(key);return status.state;}
   if(status.state==='replica_verified')throw Error('保存内容の照合に失敗しました');
   onStatus('保存処理中…');await sleep(5000);
  }
  return 'pending';
 }
 return {pending,async save(request,onStatus=()=>{}){
  if(busy)throw Error('保存処理中です');busy=true;
  try{
   let p=pending();
   if(p){
    try{await api.status(p.request_id);}
    catch(e){if(e.status===404){try{await api.enqueue(p);}catch(err){if(err.status===400||err.status===413){storage.removeItem(key);throw err;}if(err.status===401||err.status===403)throw err;}}else if(e.status&&e.status<500)throw e;}
    return await confirm(p,onStatus);
   }
   if(!Object.keys(request.changes).length)return 'unchanged';
   p={...request,request_id:uuid()};storage.setItem(key,JSON.stringify(p));
   try{await api.enqueue(p);}catch(e){if(e.status===400||e.status===413){storage.removeItem(key);throw e;}if(e.status===401||e.status===403)throw e;}
   return await confirm(p,onStatus);
  }finally{busy=false;}
 }};
}
