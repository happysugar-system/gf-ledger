/** Owner-only GF3 actual receipt transport. No production fallback. */
function GF3_AssertActualWriteEnabled_(){
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('GF3_VALIDATION_ENABLED')!=='true'||props.getProperty('GF3_ACTUAL_TEST_ENABLED')!=='true')
  throw Error('gf3_actual_write_disabled');
}
function GF3_ActualStorage_(book,action,id,args){
 GF3_AssertBook_(book);
 if(book.getId()!=='1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0')throw Error('gf3_actual_book');
 if(!['health','read','insert','transition','delivery-months','ledger-sync','schedule-read'].includes(action))throw Error('gf3_actual_action');
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('GF3_VALIDATION_ENABLED')!=='true')throw Error('gf3_actual_disabled');
 if(['insert','transition'].includes(action))GF3_AssertActualWriteEnabled_();
 if(action==='ledger-sync'&&props.getProperty('GF3_LEDGER_SYNC_TEST_ENABLED')!=='true')
  throw Error('gf3_ledger_sync_disabled');
 if(['read','insert','transition'].includes(action)&&!/^TEST-GF3-[A-Z0-9-]{1,70}$/.test(id||''))throw Error('gf3_actual_id');
 const token=props.getProperty('GF3_SYNC_TEST_TOKEN')||'';
 if(token.length<32)throw Error('gf3_actual_token');
 const payload={action,id};
 if(action==='insert'||action==='ledger-sync')payload.row=args;
 if(action==='transition'){payload.expected=args.expected;payload.next=args.next;}
 const response=UrlFetchApp.fetch('https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf3-actual-storage-test',{method:'post',contentType:'application/json',headers:{'x-gf3-sync-token':token},payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:false});
 if(response.getResponseCode()!==200)throw Error('gf3_actual_http_'+response.getResponseCode());
 const result=JSON.parse(response.getContentText());
 if(result.ok!==true)throw Error('gf3_actual_response');
 if(action==='transition'&&result.data!==true)throw Error('gf3_actual_state_conflict');
 if(action==='read'&&result.data!==null&&(result.data.receipt_id!==id||result.data.vehicle_id!=='V900005'||result.data.driver_id!=='D999902'||result.data.application_id!=='2'))throw Error('gf3_actual_identity');
 return result.data;
}
function GF3_ReadFixtureSchedules(){
 const book=GF3_DocumentUiOwner_();
 const rows=GF3_ActualStorage_(book,'schedule-read');
 if(!Array.isArray(rows))throw Error('gf3_schedule_response');
 return rows;
}
function GF3_ReadActualDeliveryMonths(){
 return GF3_ActualDeliveryMonths_(GF3_DocumentUiOwner_());
}
function GF3_ActualDeliveryMonths_(book){
 const rows=GF3_ActualStorage_(book,'delivery-months');
 if(!Array.isArray(rows)||rows.some(row=>!/^\d{4}-\d{2}$/.test(row.month)||
   !Number.isSafeInteger(row.delivered)||row.delivered<1))throw Error('gf3_actual_months_response');
 return rows;
}
function GF3_ActualHealth(){
 const book=GF3_DocumentUiOwner_();
 GF3_ActualStorage_(book,'health');
 return {connected:true};
}
