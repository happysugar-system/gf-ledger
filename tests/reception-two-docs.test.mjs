import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../line-reception-admin.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../supabase/functions/gf-line-reception-admin/index.ts',import.meta.url),'utf8');
test('受付画面のJavaScriptが構文エラーなく読み込める',()=>{
 const js=[...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/g)].map(x=>x[1]).filter(Boolean);
 assert.ok(js.length);
 for(const x of js)new vm.Script(x);
});
test('書類確認の入力欄は免許証・住民票のみ',()=>{
 for(const id of ['gfLicenseCheck','gfResidenceCheck'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const id of ['gfDriverCheck','gfConfirmedDriverId','gfContentCheck'])assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 assert.match(html,/const gfCheckFields=\\[\\['gfLicenseCheck','免許証確認'\\],\\['gfResidenceCheck','住民票確認'\\]\\]/);
});
test('契約ステータスの保存条件に不要な確認は含まれない',()=>{
 assert.match(html,/const ready=rawContract\\['免許証確認'\\]==='確認OK'&&rawContract\\['住民票確認'\\]==='確認OK';/);
 assert.doesNotMatch(html,/rawContract\\['既存ドライバー確認'\\]/);
 assert.match(html,/saveContractStatus/);
});
test('保存APIは2項目のみ受け付け、他の列は書き換えない',()=>{
 assert.match(api,/const allowed=\\["免許証確認","住民票確認"\\]/);
 assert.match(api,/const changes=allowed\\.filter/);
 assert.match(api,/Object\\.keys\\(checks\\)\\.length!==allowed\\.length/);
 assert.match(api,/const ready=v\\["免許証確認"\\]==="確認OK"&&v\\["住民票確認"\\]==="確認OK";/);
});
test('契約とマイページの内部整合性は維持',()=>{
 assert.match(api,/mypage_driver_not_linked/);
 assert.match(api,/contract_sync_conflict/);
 assert.match(api,/gf_mypage_applications_prod/);
 assert.match(api,/gf_reception_access/);
});
