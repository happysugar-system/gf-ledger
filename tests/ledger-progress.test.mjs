import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../integrations/gas/gf-ledger-progress-test.gs', import.meta.url), 'utf8');
const {snapshot, plan, guard} = runInNewContext(source + `
  ({snapshot: GF_LedgerProgressSnapshot_, plan: GF_LedgerProgressPlan_, guard: GF_LedgerProgressCancelGuard_})
`);
const vehicle = {VehicleID:'TEST-V01', DriverID:'D999901', '区分/ステータス':'空車',
  '管理区分':'車両準備中', '納車可能日':'', '納車確定日':''};

test('手入力の管理区分と納車日だけを保存する', () => {
  const patch = plan(vehicle, snapshot(vehicle), {
    '管理区分':'名義変更準備中', '納車可能日':'2026/12/1', '納車確定日':'2026-12-02',
    '区分/ステータス':'貸出中',
  });
  assert.deepEqual({...patch}, {
    '管理区分':'名義変更準備中', '納車可能日':'2026-12-01', '納車確定日':'2026-12-02',
  });
});

test('台帳直接編集・別ドライバー割当後は古い画面から上書きできない', () => {
  assert.throws(() => plan({...vehicle, '納車可能日':'2026/12/1'}, snapshot(vehicle), vehicle), /再読み込み/);
  assert.throws(() => plan({...vehicle, DriverID:'D999902'}, snapshot(vehicle), vehicle), /再読み込み/);
});

test('実在しない日付と納車日の前後逆転を拒否する', () => {
  assert.throws(() => plan(vehicle, snapshot(vehicle), {...vehicle, '納車可能日':'2026-02-30'}), /実在/);
  assert.throws(() => plan(vehicle, snapshot(vehicle), {...vehicle, '納車可能日':'2026-12-02',
    '納車確定日':'2026-12-01'}), /以降/);
});

test('進捗や納車日が入力された車両の取消を止める', () => {
  assert.doesNotThrow(() => guard(vehicle));
  assert.throws(() => guard({...vehicle, '管理区分':'名義変更済み'}), /取消前/);
  assert.throws(() => guard({...vehicle, '納車確定日':'2026-12-02'}), /取消前/);
});
