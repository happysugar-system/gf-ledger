import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
for (const name of ['GF3_FixtureProgress', 'GF3_CanonicalRows', 'GF3_ReturnHistoryPlan', 'GF3_ActualPlan']) {
  vm.runInContext(readFileSync(new URL('../integrations/gas/review/' + name + '.gs', import.meta.url), 'utf8'), context);
}

test('canonical row resolver rejects duplicate identities and duplicate headers', () => {
  const sheet = rows => ({ getName: () => '車両台帳', getDataRange: () => ({ getDisplayValues: () => rows }) });
  const read = rows => context.GF3_CanonicalRow_(sheet(rows), 'VehicleID', 'V000142', ['DriverID']);
  assert.equal(read([['VehicleID', 'DriverID'], ['V000142', 'D000055']]).data.DriverID, 'D000055');
  assert.throws(() => read([['VehicleID', 'DriverID'], ['V000142'], ['V000142']]), /row_not_unique/);
  assert.throws(() => read([['VehicleID', 'VehicleID', 'DriverID']]), /column_missing_or_duplicate/);
});

test('canonical return uses scoped identities, retains calendar fields and shifts the existing document links', () => {
  const vehicle = {
    VehicleID: 'V000142', DriverID: 'D000055', '現在使用者': 'Fixture',
    '区分/ステータス': '貸出中', '引渡し': '2026-11-26',
    '前使用者': 'Previous', '前DriverID': 'D000054', '前使用者 車両書類': 'https://example.test/old',
    '前々使用者': '', '前々DriverID': '', '前々使用者 車両書類': '',
    '📄 最新車両書類': 'https://example.test/current', '返却予定日': '2026-11-30',
    '車検満了日': '2027-03-01',
  };
  const waiting = { '受付ID': 'REQ-549', DriverID: vehicle.DriverID, 'ステータス': '割当済', '割当VehicleID': vehicle.VehicleID };
  const driver = { DriverID: vehicle.DriverID, '氏名': 'Fixture', '割当VehicleID': vehicle.VehicleID };
  const plan = (application = waiting) => context.GF3_CanonicalActualPlan_(vehicle, application, driver, '返却完了', '2026-11-28', 'ACT-729');
  assert.equal(plan().waiting['ステータス'], '名変待ち');
  assert.equal(plan().vehicle['前使用者 車両書類'], vehicle['📄 最新車両書類']);
  assert.equal(plan().vehicle['前々使用者 車両書類'], vehicle['前使用者 車両書類']);
  assert.equal(plan().vehicle['返却予定日'], undefined);
  assert.equal(plan().vehicle['車検満了日'], undefined);
  assert.throws(() => plan({ ...waiting, '割当VehicleID': 'V000143' }), /identity_mismatch/);
  assert.throws(() => context.GF3_ActualPlan_(vehicle, waiting, driver, '返却完了', '2026-11-28', 'ACT-729'), /identity_mismatch/);
});
