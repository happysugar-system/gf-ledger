import test from 'node:test';
import assert from 'node:assert/strict';

const BASE='https://happysugar-system.github.io/gf-ledger';
const API='https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf-vehicle-progress-admin';
const ORIGIN='https://happysugar-system.github.io';
// Read-only live health checks; never send an authorized write.

test('公開ページ：車両進捗管理が表示できる',async()=>{
  const res=await fetch(BASE+'/vehicle-progress-admin.html',{signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,200,'GitHub Pages expected 200');
  const html=await res.text();
  assert.match(html,/車両進捗|車両管理/);
  assert.match(html,/gf-vehicle-progress-admin/);
});

test('公開ページ：GOLD FIRSTトップに進捗への導線がある',async()=>{
  const res=await fetch(BASE+'/',{signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,200);
  assert.match(await res.text(),/vehicle-progress-admin\.html/);
});

test('進捗API: CORSプリフライトに応答する',async()=>{
  const res=await fetch(API,{method:'OPTIONS',headers:{origin:ORIGIN,'access-control-request-method':'POST','access-control-request-headers':'authorization,apikey,content-type'},signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,204);
  assert.equal(res.headers.get('access-control-allow-origin'),ORIGIN);
});

test('進捗API: 認証なしでの保存は拒否する（書込なし）',async()=>{
  const res=await fetch(API,{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({action:'save',driver_id:'D999999',vehicle_id:'test',stage:'名義変更済み'}),signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,401);
  assert.equal((await res.json()).error,'authentication_required');
});

test('進捗API: 許可外Originからの保存は拒否する（書込なし）',async()=>{
  const res=await fetch(API,{method:'POST',headers:{origin:'https://example.org','content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,403);
});
