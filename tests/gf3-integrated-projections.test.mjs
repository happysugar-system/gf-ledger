import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('reassignment accepts a completed return snapshot only when all three rows match', () => {
  const context = vm.createContext({});
  vm.runInContext(read('integrations/gas/review/GF3_FixtureSnapshot.gs'), context);
  const current = [{ DriverID: '', '管理区分': '通常管理' }, { 'ステータス': '名変待ち' }, { '割当VehicleID': '' }];
  const snapshot = current.map(row => Object.fromEntries(Object.entries(row)
    .map(([key, value]) => [key, { value, url: '', date: false }])));
  assert.equal(context.GF3_MatchesReturnedAssignment_(current, snapshot), true);
  assert.equal(context.GF3_MatchesReturnedAssignment_(current, null), false);
  snapshot[2]['割当VehicleID'].value = 'V900005';
  assert.equal(context.GF3_MatchesReturnedAssignment_(current, snapshot), false);
});

test('monthly report drops a cancelled month and retains planned deliveries from the ledger', () => {
  const context = vm.createContext({});
  for (const path of ['GF3_FixtureProgress', 'GF3_MonthlyDelivery'])
    vm.runInContext(read('integrations/gas/review/' + path + '.gs'), context);
  const ledger = [{ DriverID: 'D999902', '納車予定日': '2026/12/3' }, { DriverID: '', '納車予定日': '2026/12/4' }];
  const totals = actual => JSON.parse(JSON.stringify(context.GF3_MonthlyDeliveryRows_(ledger, actual)));
  assert.deepEqual(totals([{ month: '2026-11', delivered: 1 }]), [['2026-11', 0, 1], ['2026-12', 1, 0]]);
  assert.deepEqual(totals([]), [['2026-12', 1, 0]]);
});

test('schedule projection preserves existing calendar IDs and keeps canonical ledger dates', () => {
  const html = read('mobile-management/index.html');
  const schedules = [
    { vehicle_id: 'V900005', schedule_type: '車検', schedule_date: '2026-12-05',
      state: '予定', schedule_id: 'existing-inspection', calendar_event_id: 'existing-calendar-event' },
    { vehicle_id: 'V900005', schedule_type: '返却予定', schedule_date: '2026-12-09', state: '取消済' },
  ];
  const cars = [{ VehicleID: 'V900005', '車検予定日': '2026/12/5', ' 12点検予定日': '2026/12/6',
    '納車予定日': '2026/12/7', '返却予定日': '2026/12/8' }];
  const context = vm.createContext({ cars, fixtureSchedules: schedules });
  const projection = html.slice(html.indexOf('function scheduleItems('), html.indexOf('const scheduleRows='));
  const declarations = html.split(/\r?\n/).filter(line => /^const (toDate|planTypes)=/.test(line));
  vm.runInContext(declarations.join('\n') + '\n' + projection, context);
  const original = structuredClone(schedules);
  const items = context.scheduleItems('V900005');
  assert.deepEqual(Array.from(items, item => item.type), ['車検', '12点検', '納車予定', '返却予定']);
  assert.equal(items[0].scheduleId, 'existing-inspection');
  assert.equal(items[0].eventId, 'existing-calendar-event');
  assert.deepEqual(schedules, original);
});
