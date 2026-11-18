import assert from 'node:assert/strict';
import { VEHICLE_HEADERS, FIELD_GROUPS, validateVehicleHeaders } from './vehicle-schema.mjs';

assert.equal(VEHICLE_HEADERS.length, 63, 'Expected exactly 63 sheet headers');
assert.equal(new Set(VEHICLE_HEADERS).size, 63, 'Duplicate headers');
const mapping = Object.values(FIELD_GROUPS).flat();
assert.equal(mapping.length, 63, 'Every column must be mapped exactly once');
assert.equal(new Set(mapping).size, 63, 'Duplicate field assignment');
assert.deepEqual(validateVehicleHeaders(VEHICLE_HEADERS), {
  ok: true, missing: [], extra: [], duplicates: [], duplicateAssignments: [], unassigned: []
});
const changed = [...VEHICLE_HEADERS]; changed[4] = '車番（変更）';
assert.equal(validateVehicleHeaders(changed).ok, false, 'Header changes must fail validation');
console.log('Vehicle schema: 63/63 mapped; no duplicates; drift detection OK');
