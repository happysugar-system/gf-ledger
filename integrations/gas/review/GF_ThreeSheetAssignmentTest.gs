/** Validation only: explicit DriverID assignment; no legacy sheets or Drive writes. */
function GF_ThreeSheetAssignmentPlan_(vehicle,driver,q){
 const norm=v=>String(v==null?'':v).trim();
 if(norm(vehicle.VehicleID)!==q.vehicle_id)throw Error('vehicle_mismatch');
 const fields={'フリガナ':'フリガナ','電話番号':'電話番号','紹介元':'紹介元','所属会社名':'所属会社名','稼働エリア':'稼働エリア','契約者メールアドレス':'契約者メールアドレス','緊急連絡先氏名':'緊急連絡先氏名','緊急連絡先メールアドレス':'緊急連絡先メールアドレス','ドライバーステータス':'ステータス','ドライバー備考':'備考'};
 if(q.operation==='取消'){
 if(norm(vehicle.DriverID)||norm(vehicle['現在使用者']))throw Error('cancel_mismatch');
 return {};
 }
 if(q.operation!=='割当'||!driver||norm(driver.DriverID)!==q.driver_id||norm(vehicle.DriverID)!==q.driver_id||!norm(driver['氏名'])||norm(driver['氏名'])!==norm(vehicle['現在使用者'])||norm(driver['ステータス'])!=='有効')throw Error('driver_mismatch');
 const patch={};
 for(const [target,source] of Object.entries(fields)){
 if(Object.prototype.hasOwnProperty.call(vehicle,target)){
 if(!Object.prototype.hasOwnProperty.call(driver,source))throw Error('master_column_missing:'+source);
 patch[target]=norm(driver[source]);
 }}
 return patch;
}
function GF_ThreeSheetAssignmentSync_(book,row,q){
 GF_IsolatedValidationBook_(book);
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(1000))throw Error('assignment_busy');
 try{
 const v=GF_DB同期車両情報_(book,q.vehicle_id);
 if(v.row!==row)throw Error('row_changed');
 let driver=null;
 if(q.operation==='割当'){
 const s=GF_IsolatedValidationSheet_(book.getSheetByName('ドライバーマスター'));
 const [h,...rows]=s.getDataRange().getDisplayValues();
 const cols=GF_MainReturnHistoryColumns_(s,['DriverID','氏名','ステータス']);
 const matches=rows.filter(r=>String(r[cols.DriverID]).trim()===q.driver_id);
 if(matches.length!==1)throw Error('driver_not_unique');
 driver=Object.fromEntries(h.map((x,i)=>[x.trim(),matches[0][i]]));
 }
 const patch=GF_ThreeSheetAssignmentPlan_(v.data,driver,q);
 const keys=Object.keys(patch);
 if(keys.length){
 const cols=GF_MainReturnHistoryColumns_(v.sheet,keys);
 for(const k of keys){
 const cell=v.sheet.getRange(row,cols[k]+1);
 if(cell.getFormula())throw Error('formula_protected:'+k);
 }
 for(const k of keys){
 const cell=v.sheet.getRange(row,cols[k]+1);
 if(k==='電話番号')cell.setNumberFormat('@');
 if(k.includes('メールアドレス')&&patch[k])cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(patch[k]).setLinkUrl('mailto:'+patch[k]).build());
 else cell.setValue(patch[k]);
 }
 SpreadsheetApp.flush();
 const after=GF_DB同期車両情報_(book,q.vehicle_id);
 if(keys.some(k=>String(after.data[k]||'')!==patch[k]))throw Error('profile_readback_failed');
 }
 return {ok:true};
 }finally{lock.releaseLock();}
}
function GF_検証3シート割当同期(){return GF_DB同期ワーカー本体_(GF_IsolatedValidationOpen_(),GF_ThreeSheetAssignmentSync_);}
