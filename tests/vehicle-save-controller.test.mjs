import test from 'node:test';
import assert from 'node:assert/strict';
import {createSaveController} from '../mobile-management/vehicle-save-controller.mjs';
const request={vehicleId:'V000001',expected:{'GPS有無':false},changes:{'GPS有無':true}};
function setup(api){const m=new Map();return createSaveController({api,storage:{getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},userId:'test',uuid:()=> 'test-id',sleep:async()=>{}});}
const verified={request_id:'test-id',vehicleId:'V000001',state:'replica_verified',verified_at:'2026-11-24T00:00:00Z',verified_fields:{'GPS有無':true}};
test('verified clears pending',async()=>{const c=setup({enqueue:async()=>{},status:async()=>verified});assert.equal(await c.save(request),'verified');assert.equal(c.pending(),null);});
test('timeout does not resend accepted request',async()=>{let n=0;const c=setup({enqueue:async()=>{n++;throw Error('timeout');},status:async()=>verified});assert.equal(await c.save(request),'verified');assert.equal(n,1);});
test('unreceived request retries same ID',async()=>{let n=0;const c=setup({enqueue:async p=>{assert.equal(p.request_id,'test-id');n++;},status:async()=>{if(n<2)throw Object.assign(Error('missing'),{status:404});return verified;}});assert.equal(await c.save(request),'pending');assert.equal(await c.save(request),'verified');assert.equal(n,2);});
