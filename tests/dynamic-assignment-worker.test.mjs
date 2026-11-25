import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';

const file=new URL('../supabase/validation/gf-assignment-dynamic-queue-worker-test/index.ts',import.meta.url);
const code=stripTypeScriptTypes(readFileSync(file,'utf8').replace(/^import[^\n]*\n/,''));
const id='00000000-1111-4444-8888-222222222222';
const token='mock-worker-key-32-bytes-or-longer';

function setup(enabled=true) {
  const queue={request_id:id,vehicle_id:'V900004',driver_id:'D999904',action:'assign',state:'pending'};
  let record=null, handler;
  const db={from(table){
    const filters=[];
    let change=null;
    const q={
      select(){return q;},order(){return q;},limit(){return q;},like(){return q;},
      eq(k,v){filters.push([k,v]);return q;},
      update(v){change=v;return q;},
      upsert(v){record=v;return Promise.resolve({error:null});},
      async maybeSingle(){
        // Each UPDATE checks its filters at update time.
        const item=table==='gf_assignment_dynamic_queue_test'?queue:record;
        if(!item||filters.some(([k,v])=>item[k]!==v))return {data:null,error:null};
        if(change)Object.assign(item,change);
        return {data:{...item},error:null};
      },
    };
    return q;
  }};
  runInNewContext(code,{
    Deno:{serve:f=>{handler=f;},env:{get:k=>({
      SUPABASE_URL:'https://zwprphmfgobkektzsuti.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock',
      GF_VEHICLE_DEMO_SYNC_TOKEN:token,GF_DYNAMIC_ASSIGNMENT_CLAIMS_ENABLED_V2:String(enabled),
    })[k]}},createClient:()=>db,Response,
  });
  return {
    queue,
    async send(body,authorized=true){
      const r=await handler(new Request('https://test.invalid',{method:'POST',
        headers:authorized?{'x-gf-sync-token':token}:{},body:JSON.stringify(body)}));
      return {status:r.status,...await r.json()};
    },
  };
}

test('認証なしと停止状態では取得できない',async()=>{
  const f=setup(false);
  assert.equal((await f.send({action:'claim'},false)).status,401);
  assert.equal((await f.send({action:'health'})).write_enabled,false);
  assert.equal((await f.send({action:'claim'})).status,503);
  assert.equal(f.queue.state,'pending');
});

test('同時取得で一方だけ確保し、古い保持時刻は拒否する',async()=>{
  const f=setup();
  const two=await Promise.all([f.send({action:'claim'}),f.send({action:'claim'})]);
  assert.equal(two.filter(x=>x.request).length,1);
  assert.equal((await f.send({action:'current',request_id:id,claimed_at:'2000-01-01'})).status,409);
  assert.equal(f.queue.state,'processing');
});

test('誤ったDriverIDを複製せず、照合済み複製だけを完了する',async()=>{
  const f=setup();
  const {request}=await f.send({action:'claim'});
  const lease={request_id:id,claimed_at:request.claimed_at};
  const record={VehicleID:'V900004',DriverID:'D999904','車番':'TEST-004',
    '区分/ステータス':'空車','管理区分':'車両準備中','納車可能日':'','納車確定日':''};
  assert.equal((await f.send({action:'finish',...lease,status:'verified'})).status,409);
  assert.equal((await f.send({action:'replicate',...lease,record:{...record,DriverID:'D999901'}})).status,409);
  assert.equal((await f.send({action:'replicate',...lease,record})).verified,true);
  assert.equal((await f.send({action:'finish',...lease,status:'verified'})).state,'verified');
  assert.equal((await f.send({action:'finish',...lease,status:'verified'})).status,409);
});
