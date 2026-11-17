// Read-only contract tests. Never contact production services or write customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../line-reception-admin.html',import.meta.url),'utf8');
test('staff page uses authenticated Supabase gateway',()=>{
 assert.match(html,/receptionAuthClient\.auth\.getSession\(\)/);
 assert.match(html,/Authorization':\s*'Bearer '\+session\.access_token/);
 assert.match(html,/gf-line-reception-admin/);
});
test('staff page exposes only limited reception fields for save',()=>{
 assert.match(html,/saveVehicleRequest\(\{受付ID:r\.受付ID,DriverID:r\.DriverID,VehicleID:r\.VehicleID,ドライバー名:r\.ドライバー名,車番:r\.車番,ステータス:r\.ステータス,担当者:r\.担当者,対応メモ:r\.対応メモ\}\)/);
});
test('sample changes never call production save',()=>{
 assert.match(html,/selectedReception\.受付ID\.startsWith\('DEMO-'\)/);
 assert.match(html,/本番データは変更していません/);
});
test('save requires explicit success confirmation',()=>{
 assert.match(html,/result\.成功!==true/);
});
test('page does not claim live connection is unavailable',()=>{
 assert.doesNotMatch(html,/本番データ未接続|実データは未接続/);
});
