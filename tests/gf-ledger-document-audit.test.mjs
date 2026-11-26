import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../integrations/gas/review/GF_LedgerDocumentAudit.gs', import.meta.url), 'utf8');
const compare = new Function(source + '\nreturn GF_LedgerDocumentAuditCompare_;')();
const row = (id, links, occupied = true) => ({id, links, occupied});

test('matches by ID and counts links independently for each legacy sheet', () => {
  const ledger = [row('V000001', ['one']), row('V000002', [], false), row('V000003', ['three'])];
  const status = [row('V000004', ['four']), row('V000002', ['two']), row('V000001', ['old'])];
  const users = [row('V000001', ['one']), row('V000002', [])];
  assert.deepEqual(compare(ledger, status, users), {
    status: {same: 0, different: 1, ledgerBlank: 1, missingLedger: 1, unresolved: 0},
    users: {same: 1, different: 0, ledgerBlank: 0, missingLedger: 0, unresolved: 1},
    legacyOnly: 1,
    ledgerOnly: 1,
  });
});

test('rejects duplicate IDs and occupied documents without a VehicleID', () => {
  const entry = row('V000001', ['one']);
  assert.throws(() => compare([], [entry, entry], []), /invalid_or_duplicate_vehicle_id/);
  assert.throws(() => compare([], [], [row('', ['one'])]), /invalid_or_duplicate_vehicle_id/);
});
