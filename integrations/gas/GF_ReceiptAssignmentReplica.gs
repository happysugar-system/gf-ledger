/** 既存の車両差分同期を待ち、現在の車両台帳と複製を照合する内部入口。 */
function GF_ReceiptAssignmentSaveAndCheck_(bookId, request, expectedVersion) {
  if (typeof GF_SB_1台同期事前確認_読取専用 !== 'function' ||
      typeof GF_SB_ENV === 'undefined' || GF_SB_ENV.VEHICLE_SHEET !== '車両台帳' ||
      GF_SB_ENV.SUPABASE_TABLE !== 'gf_vehicles') throw Error('existing_replica_not_connected');

  // 既存定期同期が処理する。受付操作から他車両・ドライバー・受付の一括同期を起動しない。
  return GF_ReceiptAssignmentSave_(bookId, request,
    null,
    current => GF_ReceiptAssignmentReplicaMatches_(GF_SB_1台同期事前確認_読取専用(current.vehicleId), current),
    expectedVersion
  );
}

/** 既存プレビューの差分判定が無視する欠損キーも、明示的に照合する。 */
function GF_ReceiptAssignmentReplicaMatches_(preview, request) {
  const {result,payload,old} = preview || {};
  if (result?.action !== 'UNCHANGED' || result.vehicleId !== request.vehicleId ||
      payload?.vehicle_id !== request.vehicleId || old?.vehicle_id !== request.vehicleId ||
      payload.vehicle_number !== old.vehicle_number) return false;
  const source=payload.vehicle_data, replica=old.vehicle_data;
  const driverFields=['DriverID','区分/ステータス','管理区分','現在使用者','所属会社名','稼働エリア','納車可能日','納車確定日'];
  if (!source || !replica || driverFields.some(key =>
    !Object.prototype.hasOwnProperty.call(source,key) ||
    !Object.prototype.hasOwnProperty.call(replica,key) || source[key] !== replica[key])) return false;
  const assigned=request.action==='assign';
  return source.DriverID===(assigned?request.driverId:'') &&
    source['区分/ステータス']==='空車' && source['管理区分']===(assigned?'車両準備中':'通常管理');
}
