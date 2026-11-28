import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../line-reception-admin.html',import.meta.url),'utf8');
test('受付画面のscriptに構文エラーがない',()=>{
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[1].trim())new vm.Script(m[1])}
});
test('受付adapterの初期化後に認証を実行する',()=>{
 const adapter=html.indexOf('const gfAdapter=');
 const start=html.indexOf('queueMicrotask(initReceptionAuth)');
 assert.ok(adapter>=0&&start>=0&&start<adapter);
 // microtask defers the actual call until the script has finished defining the adapter.
 assert.doesNotMatch(html,/^initReceptionAuth\(\);/m);
});
test('認証中に未初期化adapterを呼び出さない',()=>{
 const start=html.indexOf('async function verifyReceptionSession()');
 const end=html.indexOf('function gfRetryReceptionAuth()',start);
 assert.ok(start>=0&&end>start);
 const fn=html.slice(start,end);
 assert.doesNotMatch(fn,/receptionAuthorized=false;if\(typeof activateAuthorizedBridge/);
 assert.match(fn,/gfStopAuthWatchdog\(\);receptionAuthorized=true/);
});
test('再認証ボタンはクリックで認証関数を呼び出し、例外を表示する',()=>{
 assert.match(html,/onclick="gfRetryReceptionAuth\(\)"/);
 assert.match(html,/function gfRetryReceptionAuth\(\)/);
 assert.match(html,/Promise\.resolve\(\)\.then\(verifyReceptionSession\)\.catch/);
});
test('スタッフ権限を迂回しない',()=>{
 assert.match(html,/auth\.getUser\(\)/);
 assert.match(html,/action:'list'/);
 assert.match(html,/if\(!response\.ok\)/);
});

// Regression suite is intentionally read-only.
