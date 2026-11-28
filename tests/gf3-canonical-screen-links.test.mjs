import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
for (const name of ['GF3_CanonicalRows', 'GF3_CanonicalScreenLinks'])
  vm.runInContext(readFileSync(new URL('../integrations/gas/review/' + name + '.gs', import.meta.url), 'utf8'), context);

test('staff screen links resolve canonical rows by ID even when names are duplicated', () => {
  const sheet = (name, id, grid) => ({
    getName: () => name, getSheetId: () => id, getDataRange: () => ({ getDisplayValues: () => grid })
  });
  const vehicle = sheet('車両台帳', 10, [['VehicleID','車番','DriverID','現在使用者'],['V000001','55','D000002','Test']]);
  const driver = sheet('ドライバーマスター', 11, [['DriverID','氏名'],['D000001','Test'],['D000002','Test']]);
  const base = 'https://docs.google.com/spreadsheets/d/example/edit';
  const book = { getSheetByName: name => ({ 車両台帳: vehicle, ドライバーマスター: driver })[name], getUrl: () => base };
  const links = context.GF3_CanonicalVehicleScreenLinks_(book,'V000001').links;
  assert.equal(links.vehicle, base+'#gid=10&range=B2');
  assert.equal(links.driver, base+'#gid=11&range=B3');
  assert.equal(context.GF3_CanonicalCellUrl_(book,driver,12,28),base+'#gid=11&range=AB12');
});

test('a saved event ID requires the original event and calendar', () => {
  const existing = { getId: () => 'existing-id' };
  const calendar = { getEventById: id => id==='existing-id'?existing:null };
  assert.equal(context.GF3_ResolveCalendarEvent_(calendar,'existing-id'),existing);
  assert.equal(context.GF3_ResolveCalendarEvent_(calendar,''),null);
  assert.throws(() => context.GF3_ResolveCalendarEvent_(calendar,'missing-id'), /既存イベント/);
  assert.throws(() => context.GF3_ResolveCalendarEvent_(null,'existing-id'), /カレンダー/);
});
