// Isolated queue model. No database, network or production data.
export function createTestQueue({now=()=>Date.now(),leaseMs=30000}={}){
 const rows=new Map();
 let sequence=0;
 function get(id){const r=rows.get(id);if(!r)throw Error('not_found');return r;}
 return {
  enqueue(id,actor,p){
   if(typeof id!=='string'||!id||typeof actor!=='string'||!actor||p?.vehicleId!=='V999999'||typeof p.expected?.['GPS有無']!=='boolean'||typeof p.changes?.['GPS有無']!=='boolean'||Object.keys(p.changes).length!==1||Object.keys(p.expected).length!==1)throw Error('invalid_test_request');
   const payload=JSON.stringify([actor,p.vehicleId,p.expected['GPS有無'],p.changes['GPS有無']]);
   if(rows.has(id)){const r=get(id);if(r.payload!==payload)throw Error('idempotency_conflict');return r.state;}
   rows.set(id,{id,payload,state:'queued',lease:null,expires:0});return 'queued';
  },
  claim(){
   for(const r of rows.values())if(r.state==='processing'&&r.expires<=now())r.state='reconciliation_required';
   const r=[...rows.values()].find(x=>x.state==='queued');if(!r)return null;
   r.state='processing';r.lease=String(++sequence);r.expires=now()+leaseMs;
   return {id:r.id,lease:r.lease,payload:JSON.parse(r.payload)};
  },
  acknowledge(id,lease,state){
   const r=get(id);
   if(r.state!=='processing'||r.lease!==lease)throw Error('invalid_lease');
   if(r.expires<=now()){r.state='reconciliation_required';throw Error('expired_lease');}
   if(!['sheet_verified','conflict','rejected','reconciliation_required'].includes(state))throw Error('invalid_state');
   r.state=state;return state;
  },
  verifyReplica(id,sheetValue,replicaValue){
   const r=get(id);if(r.state!=='sheet_verified')throw Error('invalid_state');
   const desired=JSON.parse(r.payload)[3];
   if(sheetValue!==desired||replicaValue!==desired)return false;
   r.state='replica_verified';return true;
  },
  status(id){return get(id).state;}
 };
}
