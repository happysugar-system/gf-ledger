import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(new URL('../supabase/functions/gf-line-reception-admin/index.ts',import.meta.url),'utf8');
const start=source.indexOf('   if(["document_review_approve","document_review_again"].includes(input.action)){');
const end=source.indexOf('   const type=clean(input.document_type)',start);
assert.ok(start>=0&&end>start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('input','db','receipt','driver','Deno','fetch','respond','clean','headers','found',source.slice(start,end));
const requestId='00000000-0000-4000-8000-000000000000';
const fileId='synthetic-drive-file';
function fixture(reply, {postal=false,enabled=true}={}){
 let review={id:requestId,document_type:postal?'residence_certificate':'driver_license',status:'submitted',updated_at:'initial',receipt_id:'r1',driver_id:'d1'};
 let calls=0;
 const db={from(table){
  const filters=[];let patch;
  return {
   select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return this},limit(){return this},update(value){patch=value;return this},
   async maybeSingle(){
    if(table==='gf_driver_document_attempts')return {data:{id:'attempt',drive_file_id:fileId}};
    if(!filters.every(([k,v])=>review[k]===v))return {data:null};
    if(patch)review={...review,...patch};
    return {data:{...review}};
   }
  };
 }};
 const env={GF_DOCUMENT_APPROVAL_BRIDGE_URL:'https://script.google.com/macros/s/test/exec',GF_DOCUMENT_BRIDGE_SECRET:'synthetic-secret-with-at-least-32-characters',GF_DOCUMENT_APPROVAL_BRIDGE_ENABLED:enabled?'YES':'NO'};
 const run=(action='document_review_approve')=>execute({action,request_id:requestId,reason:'retry'},db,'r1','d1',{env:{get:k=>env[k]}},async(url,options)=>{calls++;return reply(url,options)},(status,body)=>({status,body}),s=>String(s??'').trim(),['住民票PDF','書類状態'],[{value:{住民票PDF:postal?'郵送':'',書類状態:''}}]);
 return {run,status:()=>review.status,calls:()=>calls};
}
test('only one approval owns the submission and a verified GAS reply closes the request',async()=>{
 let reached,reply;
 const started=new Promise(resolve=>{reached=resolve});
 const pending=new Promise(resolve=>{reply=resolve});
 const f=fixture((url,options)=>{
  assert.match(url,/gf_document_bridge=approval_v1$/);
  const envelope=JSON.parse(options.body);
  assert.equal(JSON.parse(envelope.payload).review.fileId,fileId);
  assert.match(envelope.signature,/^[A-Za-z0-9_-]{43}$/);
  reached();return pending;
 });
 const first=f.run();
 await started;
 assert.equal(f.status(),'approving');
 assert.equal((await f.run()).status,409);
 assert.equal((await f.run('document_review_again')).status,409);
 assert.equal(f.calls(),1);
 reply({ok:true,json:async()=>({verified:true,fileId})});
 const result=await first;
 assert.equal(result.status,200);
 assert.equal(result.body.request.status,'approved');
 assert.equal(f.status(),'approved');
});
test('ambiguous GAS failure keeps the review reserved',async()=>{
 const f=fixture(async()=>{throw Error('timeout')});
 assert.equal((await f.run()).body.error,'approval_reconciliation_required');
 assert.equal(f.status(),'approving');
 assert.equal(f.calls(),1);
});
test('postal requests and disabled bridge do not reserve the review or call GAS',async()=>{
 for(const config of [{postal:true},{enabled:false}]){
  const f=fixture(async()=>assert.fail('unexpected GAS call'),config);
  assert.ok((await f.run()).status>=400);
  assert.equal(f.status(),'submitted');
  assert.equal(f.calls(),0);
 }
});
