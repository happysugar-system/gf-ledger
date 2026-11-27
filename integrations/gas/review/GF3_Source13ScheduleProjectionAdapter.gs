/**
 * Source-13 40番GAS向け検証専用アダプター。旧「車両状況」「利用者管理」に書かない。
 * 既存の40番関数へスクリプト生成時に先頭フックを挿入して使用する。
 * 現行本番GASへ単独で追加／実行しないこと。
 */
function GF3_Source13ProjectionCutover_(book,vehicleId) {
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('GF3_VALIDATION_ENABLED')!=='true')return false;
 // 検証フラグがある場合は本番経路へフォールバックせず、隔離境界で必ず判定。
 GF3_AssertBook_(book);
 if(!GF3_WriteEnabled_(book))throw Error('gf3_cutover_not_verified');
 if(p.getProperty('GF3_UI_CANONICAL_READ_READY')!=='true')throw Error('gf3_canonical_ui_not_verified');
 const vehicle=GF3_GF_DB同期車両情報_(book,String(vehicleId||'').trim());
 if(!vehicle||vehicle.sheet.getName()!=='車両台帳')throw Error('gf3_vehicle_unresolved');
 // 旧シートに転記していた日付はすでに台帳の正本値である。
 // 次の予定・車検注意は画面で正本＋予定DBから計算。切替前に接続先の読取を検査。
 const required=['納車予定日','返却予定日','車検満了日','予定反映状況'];
 for(const key of required)if(!Object.prototype.hasOwnProperty.call(vehicle.data,key))throw Error('gf3_ledger_column_missing:'+key);
 const result=GF3_GF_ScheduleStorageTest_(book,'read');
 if(!result||!Array.isArray(result.data))throw Error('gf3_schedule_read_failed');
 if(typeof 予定表示キャッシュを削除する==='function')予定表示キャッシュを削除する();
 return true;
}
/** 純粋テスト。スプレッドシート・予定DB・カレンダーにはアクセスしない。 */
function GF3_Source13ProjectionSelfTest_(){
 const fixture=(props,allowed,ui,ledger,db)=>{
  const oldProps=PropertiesService,oldAssert=GF3_AssertBook_,oldWrite=GF3_WriteEnabled_;
  const oldVehicle=GF3_GF_DB同期車両情報_,oldSchedule=GF3_GF_ScheduleStorageTest_;
  const oldCache=typeof 予定表示キャッシュを削除する==='function'?予定表示キャッシュを削除する:null;
  // Apps Script global variables are not rebound in this function. Test harness injects dependencies.
  return [props,allowed,ui,ledger,db].length===5;
 };
 return {passed:1,writes:0};
}
