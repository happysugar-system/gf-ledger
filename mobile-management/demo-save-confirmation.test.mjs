import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoSave} from './demo-save.mjs';
const initial={'GPS有無':false,'代車貸出先':'','代車貸出エリア':'','代車貸出備考':''};
const id='12345678-1234-1234-1234-123456789abc';
function setup(api){const m=new Map();const storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};return {storage,controller:new DemoSave(api,storage,'test',()=>id)};}
test('transport failure does not resend and verified result clears pending',async()=>{
let calls=0,fields={...initial};
const {controller,storage}=setup(async(action,p)=>{
if(action==='read')return {fields};
if(action==='save'){calls++;fields={...fields,...p.changes};throw new Error('timeout');}
return {state:'replica_verified',verified_at:'2026-11-24',changes:{'GPS有無':true}};
});
await controller.read();
assert.equal(await controller.submit({...initial,'GPS有無':true}),'accepted');
assert.equal(calls,1);
const restored=new DemoSave(controller.api,storage,'test');
assert.equal(await restored.check(),'verified');
assert.equal(restored.pending,null);
assert.equal(calls,1);
});
test('unverified result retains pending request',async()=>{
const {controller}=setup(async action=>action==='read'?{fields:initial}:action==='status'?{state:'processing'}:{});
await controller.read();
await controller.submit({...initial,'代車貸出先':'test'});
assert.equal(await controller.check(),'processing');
assert.equal(controller.pending.request_id,id);
});
