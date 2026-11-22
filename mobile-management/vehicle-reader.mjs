import { VEHICLE_HEADERS } from './vehicle-schema.mjs';

// Read-only frontend adapter. The API must validate Supabase JWT AND staff access
// on every request. Never connect directly to gf_vehicles from a public page.
export function normalizeVehicle(row) {
  if (!row || typeof row !== 'object') throw new TypeError('Invalid vehicle');
  const data = row.vehicle_data && typeof row.vehicle_data === 'object' && !Array.isArray(row.vehicle_data) ? row.vehicle_data : {};
  // Sheet headers for three schedule columns have leading spaces, but Supabase JSON keys do not.
  // Preserve the original 63 Sheet headers in the normalized result.
  const ledger = Object.fromEntries(VEHICLE_HEADERS.map(h => [h, data[h] ?? data[h.trimStart()] ?? '']));
  // 次回予定は既存63列とは別の追加列。APIが返す場合だけ表示する。
  ledger['次の予定'] = data['次の予定'] ?? '';
  ledger['次の予定日'] = data['次の予定日'] ?? '';
  ledger.VehicleID = row.vehicle_id ?? data.VehicleID ?? '';
  ledger['車番'] = row.vehicle_number ?? data['車番'] ?? '';
  ledger['更新日時'] = row.updated_at ?? data['更新日時'] ?? '';
  return ledger;
}
export function filterVehicles(rows, search) {
  const q = String(search ?? '').trim().toLocaleLowerCase('ja');
  if (!q) return rows;
  return rows.filter(v => [v['車番'], v.VehicleID, v['現在使用者'], v['車種']]
    .some(x => String(x ?? '').toLocaleLowerCase('ja').includes(q)));
}
export async function fetchVehicles({ apiBase, accessToken, publishableKey, fetchImpl = fetch, signal, limit = 100, cursor = null }) {
  if (!/^https:\/\//.test(apiBase)) throw new Error('HTTPS API required');
  if (!accessToken) throw new Error('Login required');
  const size = Math.min(100, Math.max(1, Number(limit) || 100));
  const url = new URL(apiBase);
  url.searchParams.set('limit', String(size));
  if (cursor) url.searchParams.set('cursor', String(cursor));
  const response = await fetchImpl(url.toString(), {
    method: 'GET', headers: { Authorization: 'Bearer ' + accessToken, ...(publishableKey ? { apikey: publishableKey } : {}), Accept: 'application/json' },
    cache: 'no-store', signal
  });
  if (!response.ok) throw new Error('Vehicle API error: ' + response.status);
  const payload = await response.json();
  if (!Array.isArray(payload.vehicles)) throw new Error('Invalid vehicle API response');
  return { vehicles: payload.vehicles.map(normalizeVehicle), nextCursor: payload.nextCursor ?? null };
}

/**
 * Retrieve all pages before making any rows available to the UI.
 * Throws on repeated cursors, duplicate IDs or unbounded pagination.
 */
export async function fetchAllVehicles(options) {
  const all = [];
  const cursors = new Set();
  const ids = new Set();
  let cursor = null;
  for (let page = 0; page < 100; page++) {
    const result = await fetchVehicles({ ...options, cursor });
    for (const vehicle of result.vehicles) {
      if (!vehicle.VehicleID || ids.has(vehicle.VehicleID)) throw new Error('Duplicate or missing VehicleID');
      ids.add(vehicle.VehicleID);
      all.push(vehicle);
    }
    if (!result.nextCursor) return all;
    if (result.nextCursor === cursor || cursors.has(result.nextCursor)) throw new Error('Repeated vehicle cursor');
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error('Vehicle pagination limit exceeded');
}
