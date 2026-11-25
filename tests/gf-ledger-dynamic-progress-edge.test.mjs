import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';

const path=new URL('../supabase/validation/gf-assignment-dynamic-progress-test/index.ts',import.meta.url);
const code=stripTypeScriptTypes(readFileSync(path,'utf8').replace(/^import[^\n]*\n/,''));
const origin='https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site';
const workerToken='test-worker-token-only-at-least-32-bytes';
function fixture({enabled=false,authorized=true}={}){
 let handler, writes=0;
 runInNewContext(code,{
  Deno:{serve:f=>{handler=f;},env:{get:key=>({
   SUPABASE_URL:'https://zwprphmfgobkektzsuti.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',
   GF_DYNAMIC_PROGRESS_WRITE_ENABLED:String(enabled),GF_VEHICLE_DEMO_SYNC_TOKEN:workerToken,
  })[key]}},Response,
  createClient:()=>({
   auth:{getUser:async()=>({data:{user:{id:'actor',email:'staff@example.invalid',email_confirmed_at:'confirmed'}}})},
   from(name){
    const chain={select:()=>chain,eq:()=>chain,insert(){writes++;return chain;},
     maybeSingle:async()=>({data:name==='gf_reception_access'?{enabled:authorized,role:'staff'}:null})};
    return chain;
   },
  }),
 });
 return {writes:()=>writes,call:(body,extra={})=>handler(new Request('https://fixture.invalid',{
  method:'POST',headers:{origin,...extra},body:JSON.stringify(body),
 }))};
}
const valid={action:'save',request_id:'11111111-2222-4333-8444-555555555555',
 receipt_id:'TEST-R04',driver_id:'D999904',vehicle_id:'V900004',
 expected:{vehicleId:'V900004',driverId:'D999904',values:['車両準備中','','']},
 fields:{管理区分:'名義変更前',納車可能日:'2026-12-02',納車確定日:'2026-12-08'}};
const auth={authorization:'Bearer fixture'};
test('検証APIは未認証のスタッフ操作とワーカー操作を拒否する',async()=>{
 const f=fixture();
 assert.equal((await f.call(valid)).status,401);
 assert.equal((await f.call({action:'claim'},auth)).status,401);
 assert.equal((await f.call({action:'claim'},{'x-gf-sync-token':workerToken})).status,503);
 assert.equal((await fixture({authorized:false}).call(valid,auth)).status,403);
 assert.equal(f.writes(),0);
});
test('古い複製と納車日の逆転、検証対象外はキューへ入れない',async()=>{
 const f=fixture({enabled:true});
 assert.equal((await f.call(valid,auth)).status,409);
 assert.equal((await f.call({...valid,vehicle_id:'V000001'},auth)).status,400);
 assert.equal((await f.call({...valid,fields:{...valid.fields,納車確定日:'2026-12-01'}},auth)).status,400);
 assert.equal(f.writes(),0);
});
