/**
 * GF3 three-sheet read-only vehicle sync projection.
 * Requires the installed GF3_SyncValidationBundle (GF3_AssertBook_, GF3_Columns_).
 * Does not call production license, Driver Drive, legacy sheets or CalendarApp.
 * Never write return history during ordinary read/sync.
 */
function GF3_VehicleSyncRead_(book, vehicleId){
 GF3_AssertBook_(book);
 const id=String(vehicleId||'').trim();
 if(!/^V9\d{5}$/.test(id))throw Error('gf3_validation_vehicle_required');
 const vehicleSheet=GF3_AssertSheet_(book.getSheetByName('車両台帳'));
 const required=['VehicleID','車番','区分/ステータス','現在使用者','DriverID',
  '前使用者','前々使用者','前DriverID','前々DriverID',
  '前使用者 車両書類','前々使用者 車両書類','📄 最新車両書類',
  '車両フォルダ','📁 車両書類フォルダ','📷車両状態フォルダ','🔧整備書類フォルダ'];
 const cols=GF3_Columns_(vehicleSheet,required);
 const last=vehicleSheet.getLastRow();
 if(last<2)throw Error('gf3_vehicle_not_found');
 const ids=vehicleSheet.getRange(2,cols.VehicleID+1,last-1,1).getDisplayValues().flat().map(x=>String(x||'').trim());
 const matches=ids.map((x,i)=>x===id?i+2:0).filter(Boolean);
 if(matches.length!==1)throw Error(matches.length?'gf3_vehicle_duplicate':'gf3_vehicle_not_found');
 const vehicleRow=matches[0], vehicleKeys=vehicleSheet.getRange(1,1,1,vehicleSheet.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
 const vehicleRaw=vehicleSheet.getRange(vehicleRow,1,1,vehicleKeys.length).getValues()[0];
 const vehicle=Object.fromEntries(vehicleKeys.map((k,i)=>[k,vehicleRaw[i]]).filter(x=>x[0]));
 if(String(vehicle.VehicleID||'').trim()!==id)throw Error('gf3_vehicle_changed');
 const driverId=String(vehicle.DriverID||'').trim();
 const name=String(vehicle['現在使用者']||'').trim();
 if(Boolean(driverId)!==Boolean(name))throw Error('gf3_vehicle_driver_incomplete');
 let driver=null;
 if(driverId){
  const master=GF3_AssertSheet_(book.getSheetByName('ドライバーマスター'));
  const mc=GF3_Columns_(master,['DriverID','氏名','ステータス']);
  const n=master.getLastRow();
  if(n<2)throw Error('gf3_driver_not_found');
  const ids=master.getRange(2,mc.DriverID+1,n-1,1).getDisplayValues().flat().map(x=>String(x||'').trim());
  const rows=ids.map((x,i)=>x===driverId?i+2:0).filter(Boolean);
  if(rows.length!==1)throw Error(rows.length?'gf3_driver_duplicate':'gf3_driver_not_found');
  const keys=master.getRange(1,1,1,master.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const raw=master.getRange(rows[0],1,1,keys.length).getValues()[0];
  driver=Object.fromEntries(keys.map((k,i)=>[k,raw[i]]).filter(x=>x[0]));
  const norm=x=>String(x||'').replace(/\s+/g,'');
  if(norm(driver['氏名'])!==norm(name))throw Error('gf3_driver_name_mismatch');
 }
 // Existing historic fields are returned exactly as stored; no shifting/reassignment.
 return {VehicleID:id,vehicleRow,vehicle,driver,readOnly:true};
}
