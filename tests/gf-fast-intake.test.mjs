import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../gas/GF_FAST_車両依頼.gs',import.meta.url),'utf8');
function stage(method, fail) {
  const events=[];
  const blob={getContentType:()=> 'image/jpeg',getBytes:()=>[1,2,3]};
  const context={
    p:{residentMethod:method},user:'U'+'1'.repeat(32),request:'a'.repeat(64),
    GF146_画像_:()=>({blob}), GF146_PDF_:()=>{events.push('pdf');return blob;},
    GF145_フォーム受付保存_:()=>({receipt:'TEST145-20261127123456-01234567',match:'候補なし'}),
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 's'.repeat(64)})},
    Utilities:{getUuid:()=> '0'.repeat(36),computeHmacSha256Signature:()=>Array(32).fill(0)},
    UrlFetchApp:{
      fetch:()=>({getResponseCode:()=>201,getContentText:()=>JSON.stringify({upload_token:'a'.repeat(64)})}),
      fetchAll:requests=>requests.map(({headers},i)=>{
        events.push(headers['x-document-type']);
        return {getResponseCode:()=>fail&&i===1?503:201,getContentText:()=>JSON.stringify({
          verified:true,document_type:headers['x-document-type']
        })};
      }),
    },
    console:{log:()=>{}},
  };
  return {events,run:()=>runInNewContext(source+'\nGF_FAST_stage_(p,user,request)',context)};
}
test('postal submissions stage exactly two licence images',()=>{
  const {events,run}=stage('mail');
  assert.equal(run().documentStatus,'一時保存完了・Drive転送待ち');
  assert.deepEqual(events,['license_front','license_back']);
});
test('uploaded resident PDF is required for successful receipt',()=>{
  const {events,run}=stage('upload');
  assert.equal(run().ok,true);
  assert.deepEqual(events,['pdf','license_front','license_back','resident_pdf']);
});
test('failed staged document never yields a completed receipt',()=>{
  assert.throws(stage('upload',true).run,/FAST_UPLOAD/);
});
test('Drive conversion pending does not read or delete staging objects',()=>{
  const result=runInNewContext(source+'\nGF_FAST_transfer_({},null,null,null,sh,2)',{
    sh:{getRange:()=>({getDisplayValue:()=> 'PDF変換待ち'})},
    UrlFetchApp:{fetch:()=>{throw Error('Storage must not be accessed');}},
    console:{log:()=>{}}
  });
  assert.equal(result.pending,true);
});
