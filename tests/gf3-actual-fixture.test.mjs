import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../integrations/gas/review/' + name + '.gs', import.meta.url), 'utf8');

test('GF3 journals delivery and return, retries an interrupted return, and restores the links on cancellation', () => {
  const vehicle = { VehicleID: 'V900005', '区分/ステータス': '空車', DriverID: 'D999902',
    '現在使用者': 'Fixture', '引渡し': '', '前使用者': 'Previous', '前DriverID': 'D999901',
    '前使用者 車両書類': 'Old PDF', '前々使用者': '', '前々DriverID': '',
    '前々使用者 車両書類': '', '📄 最新車両書類': 'Current PDF',
    '管理区分': '車両準備中', '納車可能日': '2026-12-01', '納車確定日': '2026-12-01' };
  const waiting = { '受付ID': '2', DriverID: 'D999902', 'ステータス': '割当済', '割当VehicleID': 'V900005', '割当車番': '5' };
  const driver = { DriverID: 'D999902', '氏名': 'Fixture', '割当VehicleID': 'V900005', '割当車番': '5' };
  const rows = [vehicle, waiting, driver];
  const links = { '前使用者 車両書類': 'https://example.test/old', '📄 最新車両書類': 'https://example.test/current' };
  const book = { getId: () => 'fixture' };
  const initial = structuredClone({ rows, links });
  const journal = new Map();
  let writes = 0;
  let interrupt = true;
  let enabled = true;
  const context = vm.createContext({
    Date,
    Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
    GF3_DocumentUiOwner_: () => book,
    GF3_RefreshMonthlyDelivery_() {},
    GF3_AssertActualWriteEnabled_() {
      if (!enabled) throw Error('gf3_actual_write_disabled');
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} },
    GF3_AssignmentFixtureRow_(_book, name, _key, _id, fields) {
      const index = ['車両台帳', '名変待ち管理', 'ドライバーマスター'].indexOf(name);
      const keys = Object.keys(rows[index]);
      return {
        data: Object.fromEntries(fields.map(field => [field, rows[index][field]])),
        columns: Object.fromEntries(keys.map((field, i) => [field, i])),
        number: 2,
        sheet: {
          getSheetId: () => index,
          getRange(_row, column) {
            const field = keys[column - 1];
            return {
              getFormula: () => '',
              getRichTextValue: () => links[field] ? { getRuns: () => [{ getLinkUrl: () => links[field] }] } : null,
              getValue: () => rows[index][field],
              getNumberFormat: () => 'yyyy/mm/dd'
            };
          }
        }
      };
    },
    Sheets: { Spreadsheets: { batchUpdate({ requests }) {
      writes++;
      for (const { updateCells: { start, rows: data } } of requests) {
        const row = rows[start.sheetId];
        const field = Object.keys(row)[start.columnIndex];
        const cell = data[0].values[0];
        const value = cell.userEnteredValue;
        row[field] = value?.numberValue ? new Date((value.numberValue - 25569) * 86400000) : value?.stringValue ?? '';
        if (cell.textFormatRuns) links[field] = cell.textFormatRuns[0].format.link.uri;
        else if (field in links) delete links[field];
      }
    } } },
    GF3_ActualStorage_(_book, action, id, args) {
      if (action === 'insert') {
        assert.equal(journal.has(id), false);
        journal.set(id, { ...structuredClone(args), state: '待機' });
      } else if (action === 'read') {
        return structuredClone(journal.get(id) ?? null);
      } else {
        const receipt = journal.get(id);
        assert.equal(receipt.state, args.expected);
        if (interrupt && receipt.kind === '返却完了' && args.next === '完了') {
          interrupt = false;
          throw Error('interrupted');
        }
        receipt.state = args.next;
      }
    }
  });
  for (const name of ['GF3_FixtureProgress', 'GF3_CanonicalRows', 'GF3_ReturnHistoryPlan', 'GF3_ActualPlan', 'GF3_ActualFixtureWorker'])
    vm.runInContext(source(name), context);
  const save = context.GF3_SaveActualFixture;
  const deliveryId = 'TEST-GF3-DELIVERY';
  const returnId = 'TEST-GF3-RETURN';
  assert.equal(save('納車完了', '2026-12-01', deliveryId).state, '完了');
  assert.throws(() => save('返却完了', '2026-12-02', returnId), /interrupted/);
  enabled = false;
  assert.throws(() => save('返却完了', '2026-12-02', returnId), /gf3_actual_write_disabled/);
  assert.equal(journal.get(returnId).state, '処理中');
  enabled = true;
  assert.equal(save('返却完了', '2026-12-02', returnId).state, '完了');
  assert.equal(writes, 2);
  assert.equal(vehicle.DriverID, '');
  assert.equal(vehicle['管理区分'], '通常管理');
  assert.equal(vehicle['納車可能日'], '');
  assert.equal(vehicle['納車確定日'], '');
  assert.equal(waiting['ステータス'], '名変待ち');
  assert.equal(waiting['割当VehicleID'], '');
  assert.equal(driver['割当VehicleID'], '');
  assert.equal(vehicle['前DriverID'], 'D999902');
  assert.equal(links['前使用者 車両書類'], initial.links['📄 最新車両書類']);
  assert.equal(links['前々使用者 車両書類'], initial.links['前使用者 車両書類']);
  assert.throws(() => save('取消', '', deliveryId), /gf3_actual_snapshot_conflict/);
  assert.equal(save('取消', '', returnId).state, '取消済');
  assert.equal(save('取消', '', deliveryId).state, '取消済');
  assert.deepEqual({ rows, links }, initial);
  assert.equal(save('取消', '', deliveryId).replayed, true);
  assert.equal(writes, 4);
});
