/** Test-only intake. Existing production reception routes remain untouched. */
function GF_検証DB返却受付(){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(30000))throw Error('actual_worker_busy');
 try{
 const book=GF_IsolatedValidationOpen_();
 const v=GF_実績車両情報_(book,'V900005');
 if(v.data['区分/ステータス']!=='貸出中'||v.data.DriverID!=='D999905')throw Error('actual_intake_vehicle_conflict');
 const date=Utilities.formatDate(new Date(),book.getSpreadsheetTimeZone(),'yyyy-MM-dd');
 const receipt=['TEST-RETURN-R005',date,'V900005','返却完了',date,'D999905',v.data['現在使用者']];
 const plan=GF_MainReturnHistoryPrepare_(book,receipt,v);
 if(!plan)throw Error('actual_intake_plan_missing');
 const keys=['備考','DriverID','代車貸出先','現在使用者','返却/12点検','代車貸出備考','代車貸出エリア','区分/ステータス'];
 const before=Object.fromEntries(keys.map(k=>{if(!(k in v.data))throw Error('actual_intake_column_missing');return [k,v.data[k]];}));
 before.gfReturnHistory=plan.before;
 const after=Object.assign({},before,{DriverID:'',現在使用者:'','返却/12点検':date,'区分/ステータス':'空車',gfReturnHistory:plan.after});
 const queue={receipt_id:receipt[0],received_at:new Date().toISOString(),vehicle_id:receipt[2],kind:receipt[3],actual_date:date,driver_id:receipt[5],current_user_name:receipt[6],state:'待機'};
 const history={receipt_id:receipt[0],registered_at:queue.received_at,vehicle_id:receipt[2],kind:receipt[3],actual_date:date,state:'処理中',before_data:before,after_data:after};
 if(GF_ActualStorageTest_(book,'prepare',{queue,history})!==true)throw Error('actual_prepare_failed');
 return {ok:true,receipt_id:receipt[0]};
 }finally{lock.releaseLock();}
}