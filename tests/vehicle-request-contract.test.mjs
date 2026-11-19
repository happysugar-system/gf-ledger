// Read-only regression checks for existing vehicle request integration boundaries.
// Run: node --test tests/vehicle-request-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../vehicle-request.html', import.meta.url), 'utf8');
const match = (name) => {
  const re = new RegExp('\\bconst\\s+' + name + '\\s*=\\s*[\\x27\\x22]([^\\x27\\x22]+)');
  const m = html.match(re);
  assert.ok(m, 'Missing integration constant: ' + name);
  return m[1];
};
test('LIFF identity is explicitly configured', () => {
  assert.match(match('LIFF_ID'), /^\d+-[\w-]+$/);
});
test('verification and vehicle submission remain separate endpoints', () => {
  const verify = match('LINE_VERIFY_TEST_URL');
  const submit = match('GF_VEHICLE_SUBMIT_URL');
  assert.match(verify, /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/);
  assert.match(submit, /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/);
  assert.notEqual(verify, submit);
});
test('entry token validation and server check are retained', () => {
  assert.match(html, /gf_vehicle_entry_check/);
  assert.match(html, /GFVehicleEntryCheckOnOpen/);
  assert.match(html, /gfEntryVerified/);
});
test('submission action and duplicate-click guard are retained', () => {
  assert.match(html, /gf_vehicle_submit_test/);
  assert.match(html, /if\s*\(gfSubmitting\)\s*return/);
  assert.match(html, /form\.action\s*=\s*GF_VEHICLE_SUBMIT_URL/);
});
test('document and contact submission fields are retained', () => {
  for (const field of ['front:licenseFrontData', 'back:licenseBackData', 'residentMethod', 'guarantorName', 'guarantorPhone', 'guarantorEmail']) {
    assert.ok(html.includes(field), 'Missing required field: ' + field);
  }
});
test('no privileged Supabase credential is embedded in this page', () => {
  assert.doesNotMatch(html, /(?:service_role|SUPABASE_SERVICE_ROLE_KEY|LINE_CHANNEL_SECRET)\s*[:=]\s*['"][^'"]+/i);
});
