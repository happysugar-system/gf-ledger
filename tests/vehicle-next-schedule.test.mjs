import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicle } from '../mobile-management/vehicle-reader.mjs';
import { VEHICLE_HEADERS, validateVehicleHeaders } from '../mobile-management/vehicle-schema.mjs';

test('追加の次回予定を読み込み、63列の契約を維持する', () => {
  const v = normalizeVehicle({
    vehicle_id: 'V000001',
    vehicle_number: '12-34',
    vehicle_data: {
      '次の予定': '車検',
      '次の予定日': '2026-12-07',
      '予定反映状況': '受付しました（反映待ち）'
    }
  });
  assert.equal(v['次の予定'], '車検');
  assert.equal(v['次の予定日'], '2026-12-07');
  assert.equal(v['予定反映状況'], '受付しました（反映待ち）');
  assert.equal(v.VehicleID, 'V000001');
  assert.equal(VEHICLE_HEADERS.length, 63);
  assert.equal(validateVehicleHeaders(VEHICLE_HEADERS).ok, true);
});

test('旧データに追加列がなくても表示を壊さない', () => {
  const v = normalizeVehicle({ vehicle_id: 'V000002', vehicle_number: '', vehicle_data: {} });
  assert.equal(v['次の予定'], '');
  assert.equal(v['次の予定日'], '');
});

test('追加予定のデータが不在でも既存予定列を保持する', () => {
  const v = normalizeVehicle({
    vehicle_id: 'V000003',
    vehicle_data: { '車検予定日': '2026-12-08', '納車予定日': '2026-12-09' }
  });
  assert.equal(v['車検予定日'], '2026-12-08');
  assert.equal(v['納車予定日'], '2026-12-09');
});
