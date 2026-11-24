/**
 * Plan the sheet updates after GF138 has resolved the authoritative LINE receipt.
 * Call inside the same critical section as the sheet read and write.
 */
export function planAssignmentSave({ request, identity, waiting, vehicle, vehicles }) {
  const id = value => typeof value === 'string' && value.trim() === value && value !== '';
  if (!request || !id(request.waiting_id) || !id(request.vehicle_id)) throw Error('INVALID_IDS');
  if (!waiting || waiting['受付ID'] !== request.waiting_id ||
      !vehicle || vehicle.VehicleID !== request.vehicle_id) throw Error('ID_NOT_UNIQUE_OR_MISSING');
  if (identity?.state !== 'resolved') return { state: identity?.state ?? 'registration_pending' };
  if (!id(identity.driver_id) ||
      (waiting.DriverID && waiting.DriverID !== identity.driver_id)) throw Error('DRIVER_ID_MISMATCH');

  const driverId = identity.driver_id;
  const vehicleId = request.vehicle_id;
  const assignedVehicle = waiting['割当VehicleID'];
  const result = { vehicle_id: vehicleId, waiting_id: request.waiting_id, driver_id: driverId };
  if (assignedVehicle || waiting['ステータス'] === '割当済み') {
    if (assignedVehicle !== vehicleId || waiting['ステータス'] !== '割当済み' ||
        waiting.DriverID !== driverId || vehicle.DriverID !== driverId) throw Error('WAITING_ALREADY_ASSIGNED');
    return { state: 'sheet_saved', ...result };
  }
  if (waiting['ステータス'] !== '名変待ち') throw Error('WAITING_NOT_AVAILABLE');
  if (vehicle['区分/ステータス'] !== '空車' || vehicle.DriverID || vehicle['現在使用者']) {
    throw Error('VEHICLE_NOT_AVAILABLE');
  }
  if (vehicles.some(row => row.DriverID === driverId)) throw Error('DRIVER_ALREADY_ASSIGNED');
  if (!id(vehicle['車番']) || !id(waiting['氏名'])) throw Error('ASSIGNMENT_FIELDS_MISSING');

  return {
    state: 'ready',
    ...result,
    vehicleEdit: {
      DriverID: driverId,
      現在使用者: waiting['氏名'],
      管理区分: '車両準備中',
    },
    waitingEdit: {
      DriverID: driverId,
      ステータス: '割当済み',
      割当VehicleID: vehicleId,
      割当車番: vehicle['車番'],
    },
  };
}
