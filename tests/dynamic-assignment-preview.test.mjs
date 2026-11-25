import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

const secret='test-only-secret-at-least-thirty-two-bytes';
const version='a'.repeat(64);
const receipt={receipt_id:'TEST-R04',driver_id:'D999904',vehicle_id:'V900004'};
const origin='https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site';
const gas=readFileSync(new URL('../integrations/gas/GF_ReceiptAssignmentPreviewBridge.gs',import.meta.url),'utf8');
const edge=stripTypeScriptTypes(readFileSync(new URL('../supabase/validation/gf-assignment-dynamic-ui-test/index.ts',import.meta.url),'utf8').replace(/^import[^\n]*\n/m,''));

function bridge(){
 let reads=0;
 const now=Date.now();
 const ctx={Date:{now:()=>now},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},
  Utilities:{computeHmacSha256Signature:(value,key)=>createHmac('sha256',key).update(value).digest(),
   base64EncodeWebSafe:v=>v.toString('base64url')},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:str=>({setMimeType:()=>JSON.parse(str)})},
  GF_ReceiptAssignmentValidationVersion_:request=>{
   assert.equal(request.receiptId,receipt.receipt_id);
   reads++;return {state:'planned',version};
  },
 };
 const accept=runInNewContext(gas+'\nGF_動的割当検証版を受信_',ctx);
 return {now,reads:()=>reads,accept:body=>accept({postData:{contents:JSON.stringify(body)}})};
}
function sign(p){
 const {action,operation,receiptId,driverId,vehicleId,issuedAt}=p;
 return createHmac('sha256',secret).update(JSON.stringify([action,operation,receiptId,driverId,vehicleId,issuedAt])).digest('base64url');
}

test('GASの版取得は既存アクションを通過させ、改変・失効した署名を読取前に止める',()=>{
 const b=bridge();
 const p={action:'gfa_assignment_preview_v1',operation:'assign',receiptId:receipt.receipt_id,
  driverId:receipt.driver_id,vehicleId:receipt.vehicle_id,issuedAt:b.now};
 p.signature=sign(p);
 const older={...p,issuedAt:b.now-61000};
 older.signature=sign(older);
 assert.equal(b.accept({action:'gfa_waiting_register_v1'}),null);
 assert.equal(b.accept({...p,operation:'cancel'}).status,403);
 assert.equal(b.accept(older).status,403);
 assert.equal(b.reads(),0);
 assert.equal(b.accept(p).version,version);
 assert.equal(b.reads(),1);
});

function server({allowed=true,enabled=true}={}){
 const b=bridge();let handler,inserts=0;
 const db={
  auth:{getUser:async()=>({data:{user:{id:'actor',email:'staff@example.invalid',email_confirmed_at:'confirmed'}}})},
  from(table){
   const q={select(){return q;},eq(){return q;},
    async maybeSingle(){return {data:table==='gf_reception_access'?{enabled:allowed,role:'staff'}:null};},
    insert(){inserts++;return q;},async single(){return {data:{state:'pending'}};}};
   return q;
  },
 };
 runInNewContext(edge,{
  createClient:()=>db,Response,TextEncoder,btoa,AbortSignal,crypto:webcrypto,
  Deno:{serve:f=>{handler=f;},env:{get:key=>({SUPABASE_URL:'https://zwprphmfgobkektzsuti.supabase.co',
   SUPABASE_SERVICE_ROLE_KEY:'mock',GF_WAITING_GAS_URL:'https://script.google.com/macros/s/mock/exec',
   GF_WAITING_GAS_SECRET:secret,GF_DYNAMIC_ASSIGNMENT_STAFF_ENQUEUE_ENABLED:String(enabled)})[key]}},
  fetch:async(_,opt)=>Response.json(b.accept(JSON.parse(opt.body))),
 });
 return {inserts:()=>inserts,reads:b.reads,send:input=>handler(new Request('https://test.invalid',{
  method:'POST',headers:{origin,authorization:'Bearer mock'},body:JSON.stringify({...receipt,...input}),
 }))};
}

test('スタッフ権限を確認してから署名付きの読み取りを実行する',async()=>{
 const denied=server({allowed:false});
 assert.equal((await denied.send({action:'version',operation:'assign'})).status,403);
 assert.equal(denied.reads(),0);
 const ok=server({enabled:false});
 const r=await ok.send({action:'version',operation:'assign'});
 assert.equal(r.status,200);
 assert.equal((await r.json()).version,version);
 assert.equal(ok.inserts(),0);
});

test('投入時に版を再読取し、古い版を拒否する',async()=>{
 const s=server();
 const input={action:'assign',request_id:'11111111-2222-4333-8444-555555555555'};
 assert.equal((await s.send({...input,expected_version:'b'.repeat(64)})).status,409);
 assert.equal(s.inserts(),0);
 assert.equal((await s.send({...input,expected_version:version})).status,202);
 assert.equal(s.inserts(),1);
});
