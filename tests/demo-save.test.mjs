import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoSave } from '../mobile-management/demo-save.mjs';
const initial = { 'GPS有無': false, '代車貸出先': '', '代車貸出エリア': '', '代車貸出備考': '' };
const edited = { ...initial, 'GPS有無': true, '代車貸出先': 'テスト会社' };
const id = '11111111-1111-4111-8111-111111111111';
function setup(handler) {
  const values = new Map();
  const storage = {getItem: key => values.get(key), setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key)};
  const calls = [];
  const api = async (action, payload) => { calls.push([action,payload]); return handler(action,payload); };
  return { controller: new DemoSave(api,storage,'test-user',()=>id), storage, api, calls };
}
test('送信タイムアウトと再読込でも同じIDを再送し、確認済みだけ完了する', async () => {
  let attempts = 0;
  const {controller,storage,api,calls} = setup(async (action) => {
    if(action === 'read') return {fields: attempts > 1 ? edited : initial};
    if(action === 'save' && ++attempts === 1) throw new Error('timeout');
    if(action === 'status') return {state:'replica_verified',verified_at:'2026-11-24',changes: {'GPS有無':true,'代車貸出先':'テスト会社'}};
    return {};
  });
  await controller.read();
  await assert.rejects(controller.submit(edited));
  const restored = new DemoSave(api,storage,'test-user');
  await restored.read();
  await restored.submit(edited);
  assert.equal(await restored.check(),'verified');
  assert.equal(restored.pending,null);
  assert.deepEqual(calls.filter(x=>x[0]==='save').map(x=>x[1].request_id),[id,id]);
});
test('未反映・受付未確認では保留情報を維持する',async()=>{
  let state='accepted';
  const {controller} = setup(async action=> {
    if(action==='read') return {fields:initial};
    if(action==='status' && state==='missing') throw Object.assign(new Error('missing'),{status:404});
    return {state};
  });
  await controller.read(); await controller.submit(edited);
  assert.equal(await controller.check(),'accepted'); assert.ok(controller.pending);
  state='missing'; assert.equal(await controller.check(),'not_received'); assert.ok(controller.pending);
});
test('競合時は最新値を再取得し、再入力を要求する',async()=>{
  const {controller} = setup(async action=> {
    if(action==='read') return {fields:initial};
    if(action==='save') throw Object.assign(new Error('conflict'),{status:409});
    throw Object.assign(new Error('missing'),{status:404});
  });
  await controller.read(); assert.equal(await controller.submit(edited),'conflict'); assert.equal(controller.pending,null);
});
test('保存済みの内容不一致を成功にしない',async()=>{
  const {controller}=setup(async action=>action==='read'?{fields:initial}:{state:'replica_verified',verified_at:'today',changes:{}});
  await controller.read(); await controller.submit(edited);
  await assert.rejects(controller.check(),/一致/); assert.ok(controller.pending);
});
test('変更なしと式入力では保存APIを呼ばない',async()=>{
  const {controller,calls}=setup(async()=>({fields:initial}));
  await controller.read(); assert.equal(await controller.submit(initial),'unchanged');
  await assert.rejects(controller.submit({...initial,'代車貸出先':'=IMPORTDATA("x")'}));
  assert.equal(calls.filter(x=>x[0]==='save').length,0);
});
test('反映後の読込失敗でも確認情報を保持する',async()=>{
  let read=0;
  const {controller}=setup(async action=>{
    if(action==='read') {if(++read>1)throw new Error('offline');return {fields:initial};}
    return {state:'replica_verified',verified_at:'today',changes:{'GPS有無':true,'代車貸出先':'テスト会社'}};
  });
  await controller.read(); await controller.submit(edited);
  await assert.rejects(controller.check()); assert.ok(controller.pending);
});
