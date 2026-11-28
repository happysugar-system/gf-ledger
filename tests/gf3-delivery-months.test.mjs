import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

test('monthly actuals include completed deliveries and remove cancelled deliveries', async () => {
  const rows = [
    { kind: '納車完了', state: '完了', actual_date: '2026-12-01', receipt_id: 'TEST-GF3-A',
      vehicle_id: 'V900005', driver_id: 'D999902', after_data: { rows: [{ '現在使用者': { value: 'Fixture' } }] } },
    { kind: '納車完了', state: '完了', actual_date: '2027-01-03' },
    { kind: '返却完了', state: '完了', actual_date: '2026-12-04' },
    { kind: '納車完了', state: '取消済', actual_date: '2026-12-05' }
  ];
  const token = 'test-only-token'.repeat(3);
  let handle;
  const context = vm.createContext({
    Response,
    Deno: { env: { get: () => token }, serve: handler => { handle = handler; } },
    createClient: () => ({
      from(table) {
        assert.equal(table, 'gf3_actual_receipts_test');
        let result = rows;
        return {
          select(fields) { assert.match(fields, /^actual_date/); return this; },
          eq(key, value) { result = result.filter(row => row[key] === value); return this; },
          order() { return this; },
          range(start, end) { return { data: result.slice(start, end + 1) }; }
        };
      }
    })
  });
  const source = readFileSync(new URL('../integrations/edge/gf3-actual-storage-test.ts', import.meta.url), 'utf8');
  vm.runInContext(stripTypeScriptTypes(source.replace(/^import[^\n]*\n/, '')), context);
  const request = (secret, action = 'delivery-months') => new Request('https://example.test', {
    method: 'POST', headers: { 'x-gf3-sync-token': secret }, body: JSON.stringify({ action })
  });
  assert.equal((await handle(request('bad-token'))).status, 403);
  assert.deepEqual((await (await handle(request(token))).json()).data, [
    { month: '2026-12', delivered: 1 },
    { month: '2027-01', delivered: 1 }
  ]);
  assert.deepEqual((await (await handle(request(token, 'delivery-details'))).json()).data[0], {
    date: '2026-12-01', vehicleId: 'V900005', driverId: 'D999902', driverName: 'Fixture', receiptId: 'TEST-GF3-A'
  });
  rows[0].state = '取消済';
  assert.equal((await (await handle(request(token, 'delivery-details'))).json()).data.length, 1);
  assert.deepEqual((await (await handle(request(token))).json()).data, [
    { month: '2027-01', delivered: 1 }
  ]);
});
