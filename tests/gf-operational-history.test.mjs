import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = name => readFileSync(new URL('../integrations/gas/review/' + name + '.gs', import.meta.url), 'utf8');
const plan = new Function(source('GF_CombinedHistoryPlan') + source('GF_OperationalHistoryPlan') +
  '\nreturn GF_OperationalHistoryPlan_;')();

const snapshot = {
  DriverID: '', 現在使用者: '', '📄 最新車両書類': '',
  前DriverID: 'D000002', 前使用者: '前', '前使用者 車両書類': 'https://drive.google.com/file/d/previous/view',
  前々DriverID: 'D000003', 前々使用者: '前々', '前々使用者 車両書類': 'https://drive.google.com/file/d/older/view',
};
const base = {vehicleId: 'V000001', driverId: 'D000001', name: '現在'};

test('assignment, loan, return and cancellation preserve all three groups', () => {
  const assignment = plan(snapshot, {...base, id: 'assign', kind: 'assignment'});
  assert.equal(assignment.after.前DriverID, snapshot.前DriverID);
  assert.deepEqual(plan(assignment.after, {...base, id: 'assign', kind: 'cancel', record: assignment.record}).after, snapshot);
  const loan = plan(assignment.after, {...base, id: 'loan', kind: 'loan'});
  assert.equal(loan.kind, 'unchanged');
  const current = {...loan.after, '📄 最新車両書類': 'https://drive.google.com/file/d/current/view'};
  const returned = plan(current, {...base, id: 'return', kind: 'return'});
  assert.equal(returned.after.DriverID, '');
  assert.equal(returned.after.前DriverID, base.driverId);
  assert.equal(returned.after.前使用者, base.name);
  assert.equal(returned.after['前使用者 車両書類'], current['📄 最新車両書類']);
  assert.equal(returned.after.前々DriverID, snapshot.前DriverID);
  assert.equal(returned.after['前々使用者 車両書類'], snapshot['前使用者 車両書類']);
  const cancel = {...base, id: 'return', kind: 'cancel', record: returned.record};
  assert.deepEqual(plan(returned.after, cancel).after, current);
  assert.equal(plan(current, cancel).kind, 'unchanged');
  assert.throws(() => plan({...returned.after, '前使用者 車両書類': ''}, cancel), /history_conflict/);
});

test('does not overwrite another driver, unresolved history or unverified links', () => {
  const current = {...snapshot, DriverID: base.driverId, 現在使用者: base.name};
  const op = {...base, id: 'check', driverId: 'D000099'};
  assert.throws(() => plan(current, {...op, kind: 'assignment'}), /identity_conflict/);
  assert.throws(() => plan(current, {...op, kind: 'return'}), /return_driver_mismatch/);
  assert.throws(() => plan({...current, 前DriverID: ''}, {...op, kind: 'return'}), /history_identity_unresolved/);
  assert.throws(() => plan({...current, '📄 最新車両書類': '書類を見る'}, {...op, kind: 'return'}), /unverified_document/);
});

test('the return adapter keeps BJ and checks the full history on worker restart', () => {
  const adapter = new Function('PropertiesService', 'GF_実績履歴の対象_26',
    source('GF_CombinedHistoryPlan') + source('GF_OperationalHistoryPlan') + source('GF_MainReturnHistory') +
    '\nreturn {prepare:GF_MainReturnHistoryPrepare_,resume:GF_MainReturnHistoryResume_};');
  const properties = {getScriptProperties: () => ({getProperty: () => 'true'})};
  let saved;
  const {prepare, resume} = adapter(properties, () => saved);
  const current = {...snapshot, DriverID:base.driverId, 現在使用者:base.name,
    '📄 最新車両書類':'https://drive.google.com/file/d/current/view'};
  let values = current;
  const keys = Object.keys(current);
  const sheet = {
    getLastColumn: () => keys.length,
    getRange: (row, col) => row === 1 ? {getDisplayValues: () => [keys]} : {
      getFormula: () => '', getRichTextValue: () => null, getDisplayValue: () => values[keys[col-1]],
    },
  };
  const book = {getId: () => '1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU'};
  const receipt = ['r', '', base.vehicleId, '返却完了', '', base.driverId];
  const vehicle = {sheet, row:2};
  const record = prepare(book, receipt, vehicle);
  assert.equal(record.after['📄 最新車両書類'], current['📄 最新車両書類']);
  assert.equal(record.after['前使用者 車両書類'], current['📄 最新車両書類']);
  saved = {data:['r','',base.vehicleId,'','','',JSON.stringify({gfReturnHistory:record.before}),JSON.stringify({gfReturnHistory:record.after})]};
  assert.equal(resume(book, receipt, vehicle), false);
  values = record.after;
  assert.equal(resume(book, receipt, vehicle), true);
  assert.throws(() => prepare({getId: () => 'wrong'}, receipt, vehicle), /return_history_validation_book_required/);
});
