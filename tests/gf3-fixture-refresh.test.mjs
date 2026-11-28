import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('projection failure schedules a retry without promoting a saved ledger operation to a failure', () => {
  const errors = [];
  const context = vm.createContext({ console: { error: error => errors.push(error) } });
  vm.runInContext(readFileSync(new URL('../integrations/gas/review/GF3_LedgerFixtureSync.gs', import.meta.url), 'utf8'), context);
  const book = { test: true };
  context.GF3_SyncLedgerFixture_ = target => {
    assert.equal(target, book);
    throw Error('temporary transport failure');
  };
  context.GF3_RefreshMonthlyDelivery_ = target => {
    assert.equal(target, book);
    return { months: 0 };
  };
  const result = context.GF3_RefreshFixtureProjections_(book);
  assert.equal(result.ledger, 'pending');
  assert.equal(result.monthly, 'updated');
  assert.equal(errors.length, 1);
});
