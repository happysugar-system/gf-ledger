import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoSave,FIELDS} from './demo-save-basic.staged.mjs';
const initial=Object.fromEntries(FIELDS.map(k=>[k,k==='GPS有無'?false:'']));
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

test('all eleven basic fields are included in patch',async()=>{let patch;const {controller}=setup(async(action,p)=>{if(action==='read')return {fields:initial};patch=p;return {};});await controller.read();const next={...initial};for(const k of FIELDS.slice(4))next[k]='test '+k;assert.equal(await controller.submit(next),'accepted');assert.equal(Object.keys(patch.changes).length,11);assert.equal(Object.keys(patch.expected).length,11);});
