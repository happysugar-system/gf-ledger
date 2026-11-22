import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const editor=readFileSync(new URL('../vehicle-progress-admin.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../supabase/functions/gf-vehicle-progress-admin/index.ts',import.meta.url),'utf8');
const reception=readFileSync(new URL('../line-reception-admin.html',import.meta.url),'utf8');
const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('スタッフ管理ページのJSに構文エラーがない',()=>{
 for(const match of editor.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(match[1].trim())new vm.Script(match[1]);
 }
});
test('スタッフ画面はログインJWTを渡し、進捗変更を専用APIで行う',()=>{
 assert.match(editor,/session\?\.access_token/);
 assert.match(editor,/gf-vehicle-progress-admin/);
 assert.match(editor,/expected_updated_at:/);
 assert.match(editor,/progress_changed_reload/);
});
test('API側で権限・契約完了・VehicleID/DriverID一致が必須',()=>{
 assert.match(api,/db\.auth\.getUser\(bearer\)/);
 assert.match(api,/gf_reception_access/);
 assert.match(api,/if\(!staff\?\.enabled\)/);
 assert.match(api,/vehicle_driver_link_mismatch/);
 assert.match(api,/contract_not_completed/);
});
test('競合する保存を拒否し、進捗を戻した際は未来の更新日を削除',()=>{
 assert.match(api,/expected_updated_at/);
 assert.match(api,/progress_changed_reload/);
 assert.match(api,/\.eq\("updated_at",expected\)/);
 assert.match(api,/if\(STAGES\.indexOf\(k\)>stageIndex\)delete dates\[k\]/);
});
test('進捗編集と車両台帳保存は独立',()=>{
 assert.match(home,/vehicle-progress-admin\.html/);
 assert.match(reception,/vehicle-progress-admin\.html/);
 assert.doesNotMatch(editor,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
test('申込・契約ステータスを残す',()=>{
 assert.match(reception,/gfRequestContractStatus/);
 assert.match(reception,/契約完了/);
 assert.match(reception,/申込|受付/);
});

test('複数車両のDriverIDは画面とAPIの両方で保存拒否',()=>{
 assert.match(editor,/vehicles\.filter\(x=>x\.driver_id===current\.driver_id\)\.length>1/);
 assert.match(editor,/multiple_vehicles_need_review/);
 assert.match(api,/vehicle_data->>DriverID/);
 assert.match(api,/assignments\?\.length!==1/);
 assert.match(api,/multiple_vehicles_need_review/);
});
