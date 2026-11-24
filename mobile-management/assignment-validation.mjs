// Pure validation for assignment; no production writes.
export function prepareAssignment(vehicle, waiting, driver) {
  if (!vehicle?.VehicleID || !waiting?.受付ID || !driver?.id ||
      waiting.DriverID !== driver.id || waiting['割当VehicleID'] ||
      waiting['ステータス'] !== '名変待ち' ||
      vehicle['区分/ステータス'] !== '空車' ||
      vehicle.DriverID || vehicle['現在使用者']) {
    throw new Error('割当条件が変わりました。最新情報を確認してください。');
  }
  return {
    vehicle_id: vehicle.VehicleID,
    waiting_id: waiting.受付ID,
    driver_id: driver.id
  };
}
// The server must re-read and validate all three records under a lock.
// Never accept driver name/company or arbitrary spreadsheet columns from clients.
