import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../integrations/gas/GFA_StaffWaitingBridge.gs', import.meta.url),'utf8');
const secret='test-only-secret-with-more-than-32-characters';
const now=1795590000000;

function fixture(state='registered') {
  const calls=[];
  const props=new Map([['GFA_STAFF_BRIDGE_SECRET',secret],['GFA_STAFF_BRIDGE_ENABLED','true']]);
  const context={
    Date:{now:()=>now},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>props.get(k)??null,
      setProperty:(key,value)=>props.set(key,value),
    })},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:body=>({setMimeType:()=>JSON.parse(body)})},
    Utilities:{
      computeHmacSha256Signature:(body,key)=>createHmac('sha256',key).update(body).digest(),
      base64EncodeWebSafe:bytes=>bytes.toString('base64url'),
    },
    GFA_名変待ち受付登録_(...args){calls.push(args);return {state};},
  };
  const api=runInNewContext(source+'\n({receive:GFA_スタッフ受付受信_,prepare:GFA_スタッフ受付設定を準備})',context);
  return {send:body=>api.receive({postData:{contents:JSON.stringify(body)}}),prepare:api.prepare,calls,props};
}
function envelope(issuedAt=now) {
  const data={action:'gfa_waiting_register_v1',receiptId:'TEST-R04',receiptKey:'c'.repeat(64),driverId:'D999904',issuedAt};
  data.signature=createHmac('sha256',secret).update(JSON.stringify(Object.values(data))).digest('base64url');
  return data;
}

test('署名なし、改変、期限切れの直接アクセスを登録前に拒否する',()=>{
  const {send,calls}=fixture();
  for(const body of [{...envelope(),signature:undefined},{...envelope(),driverId:'D999905'},envelope(now-61000)]) {
    assert.equal(send(body).status,403);
  }
  assert.equal(send({action:'existing_webhook'}),null);
  assert.equal(calls.length,0);
});

test('署名済み受付は照合済みDriverIDをGFAへ渡し、重複応答を維持する',()=>{
  const first=fixture(),retry=fixture('already_registered');
  assert.equal(first.send(envelope()).state,'registered');
  assert.deepEqual(first.calls,[['TEST-R04','c'.repeat(64),'D999904']]);
  assert.equal(retry.send(envelope()).state,'already_registered');
});

test('設定準備は既存値に触れず、未作成のとき停止状態を追加する',()=>{
  const {send,calls,prepare,props}=fixture();
  props.set('existing_key','preserved');
  assert.equal(prepare().state,'existing');
  props.delete('GFA_STAFF_BRIDGE_ENABLED');
  assert.equal(prepare().state,'added_disabled');
  assert.equal(props.get('existing_key'),'preserved');
  assert.equal(send(envelope()).status,503);
  assert.equal(calls.length,0);
});
