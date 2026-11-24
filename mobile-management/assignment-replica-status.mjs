/**
 * Called by the authenticated status endpoint with a server-owned snapshot of
 * the sheet values to replicate. queueStatus is read from GF154, not the client.
 */
export async function readAssignmentSyncStatus(db, table, expected, queueStatus) {
  if (!['gf_vehicles', 'gf_vehicles_test'].includes(table)) throw Error('INVALID_REPLICA_TABLE');
  if (queueStatus === '要確認') return 'reconciliation_required';
  if (queueStatus === 'スキップ') return 'superseded';
  if (queueStatus !== '完了') return 'sheet_saved';
  const { data, error } = await db.from(table)
    .select('vehicle_data,updated_at')
    .eq('vehicle_id', expected.vehicleId)
    .maybeSingle();
  if (error) throw Error('REPLICA_READ_FAILED');
  const row = data?.vehicle_data;
  const updated = Date.parse(data?.updated_at);
  const saved = Date.parse(expected.savedAt);
  if (!row || !Number.isFinite(updated) || !Number.isFinite(saved) || updated < saved) {
    return 'replica_pending';
  }
  const value = field => String(row[field] ?? '').trim();
  return value('DriverID') === expected.driverId &&
    value('区分/ステータス') === expected.status &&
    value('管理区分') === expected.management &&
    Boolean(value('現在使用者')) === Boolean(expected.driverId)
    ? 'replica_verified' : 'replica_pending';
}
