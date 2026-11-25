/** 本番割当候補: 認証済みサーバー受付と台帳の新鮮な読取値だけを使用する純粋な計画関数。
 * 保存・同期・ロックは呼出側の責務。本ファイル単独では本番書込みを行わない。
 */
function GF_ReceiptAssignmentPlan_(data, request) {
  const fail = code => { throw Error(code); };
  const one = (rows, predicate, code) => {
    const found = rows.filter(predicate);
    if (found.length !== 1) fail(code);
    return found[0];
  };
  const blank = v => v === '' || v == null;
  const {receiptId, driverId, vehicleId, action} = request;
  if (typeof receiptId !== 'string' || !receiptId || receiptId.length > 150 ||
      !/^D\d{6}$/.test(driverId) || !/^V\d{6}$/.test(vehicleId) ||
      !['assign','cancel'].includes(action)) fail('invalid_request');
  const h = one(data.history, r => r['LINE受付ID'] === receiptId, 'receipt_not_unique');
  if (h.DriverID !== driverId || h['処理状態'] !== '登録済' ||
      !/^[a-f0-9]{64}$/.test(h['受付識別子'])) fail('receipt_driver_mismatch');
  one(data.history, r => r['受付識別子'] === h['受付識別子'], 'receipt_key_not_unique');
  const w = one(data.waiting, r => r['LINE受付ID'] === receiptId ||
      r['受付識別子'] === h['受付識別子'], 'waiting_not_unique');
  if (w['LINE受付ID'] !== receiptId || w['受付識別子'] !== h['受付識別子'] ||
      w.DriverID !== driverId) fail('waiting_mismatch');
  const d = one(data.drivers, r => r.DriverID === driverId, 'driver_not_unique');
  const v = one(data.vehicles, r => r.VehicleID === vehicleId, 'vehicle_not_unique');
  if (d['ステータス'] !== '有効' || !d['氏名'] || !v['車番'] ||
      v['区分/ステータス'] !== '空車') fail('invalid_driver_or_vehicle');
  if (data.waiting.some(r => r !== w && r['割当VehicleID'] === vehicleId)) fail('vehicle_other_receipt');
  if (data.vehicles.some(r => r !== v && r.DriverID === driverId)) fail('multiple_vehicle_review');
  if (data.drivers.some(r => r !== d && r['割当VehicleID'] === vehicleId)) fail('vehicle_other_driver');
  if (!blank(v['納車可能日']) || !blank(v['納車確定日'])) fail('delivery_dates_present');
  const empty = v['管理区分'] === '通常管理' &&
      ['DriverID','現在使用者','所属会社名','稼働エリア'].every(k => blank(v[k])) &&
      w['ステータス'] === '名変待ち' &&
      [w,d].every(r => blank(r['割当VehicleID']) && blank(r['割当車番']));
  const full = v['管理区分'] === '車両準備中' && v.DriverID === driverId &&
      v['現在使用者'] === d['氏名'] &&
      v['所属会社名'] === (d['所属会社名'] || '') &&
      v['稼働エリア'] === (d['稼働エリア'] || '') &&
      w['ステータス'] === '割当済' &&
      [w,d].every(r => r['割当VehicleID'] === vehicleId && r['割当車番'] === v['車番']);
  if (!empty && !full) fail('assignment_state_conflict');
  const assign = action === 'assign';
  if ((assign && full) || (!assign && empty)) return {state:'unchanged', patches:[]};
  // 取消は元の割当を照合できた場合のみ。空車/貸出中の区分は変更しない。
  const pair = {'割当VehicleID':assign?vehicleId:'','割当車番':assign?v['車番']:''};
  return {state:'planned', patches:[
    {sheet:'車両台帳', key:'VehicleID', id:vehicleId, values:{
      '管理区分':assign?'車両準備中':'通常管理',
      DriverID:assign?driverId:'','現在使用者':assign?d['氏名']:'',
      '所属会社名':assign?(d['所属会社名']||''):'',
      '稼働エリア':assign?(d['稼働エリア']||''):''}},
    {sheet:'名変待ち管理',key:'LINE受付ID',id:receiptId,values:{...pair,'ステータス':assign?'割当済':'名変待ち'}},
    {sheet:'ドライバーマスター',key:'DriverID',id:driverId,values:pair}
  ]};
}
