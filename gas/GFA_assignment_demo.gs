// Add to the existing DEMO spreadsheet-bound GAS project only.
function GFA_台帳_(){
 const ss=SpreadsheetApp.openById('16QRu2-wIRRUAgE_5iz4_TJrzQL3JBvtNDUhaefaU93Y');
 if(ss.getId()!=='16QRu2-wIRRUAgE_5iz4_TJrzQL3JBvtNDUhaefaU93Y')throw Error('demo only');
 return ss;
}
function GFA_API_(body){
 const token=PropertiesService.getScriptProperties().getProperty('GF_VEHICLE_DEMO_SYNC_TOKEN');
 if(!token||token.length<32)throw Error('認証設定なし');
 const r=UrlFetchApp.fetch('https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-assignment-demo-worker',{method:'post',contentType:'application/json',headers:{'x-gf-sync-token':token},payload:JSON.stringify(body),muteHttpExceptions:true,followRedirects:false});
 if(r.getResponseCode()!==200)throw Error('API HTTP '+r.getResponseCode());
 return JSON.parse(r.getContentText());
}
function GFA_初期設定(){
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
 const ss=GFA_台帳_();if(!GFA_API_({action:'health'}).ok)throw Error('接続失敗');
 const specs=[
 ['TEST_割当車両台帳',['VehicleID','区分/ステータス','DriverID','現在使用者','所属会社名','稼働エリア','管理区分','割当RequestID'],['DEMO-V02','空車','','','','','','']],
 ['TEST_名変待ち管理',['受付ID','DriverID','ステータス','割当VehicleID','割当RequestID'],['DEMO-R01','DEMO-D02','名変待ち','','']],
 ['TEST_割当ドライバーマスター',['DriverID','氏名','所属会社名','稼働エリア'],['DEMO-D02','テストドライバー B','サンプル物流','千葉']]
 ];
 for(const [name,head,row] of specs){
 let sh=ss.getSheetByName(name);
 if(!sh){sh=ss.insertSheet(name);sh.getRange(1,1,2,head.length).setValues([head,row]);}
 if(JSON.stringify(sh.getRange(1,1,1,head.length).getValues()[0])!==JSON.stringify(head)||sh.getLastRow()!==2)throw Error('テスト構成不一致 '+name);
 }
 const triggers=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='GFA_保存同期');
 if(!triggers.length)ScriptApp.newTrigger('GFA_保存同期').timeBased().everyMinutes(1).create();
 console.log('割当専用テスト台帳・API接続・自動同期設定完了');
 }finally{lock.releaseLock();}
}
function GFA_保存同期(){
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
 const ss=GFA_台帳_(),q=GFA_API_({action:'claim'}).request;
 if(!q){console.log('割当要求なし');return;}
 if(q.vehicle_id!=='DEMO-V02'||q.waiting_id!=='DEMO-R01'||q.driver_id!=='DEMO-D02'||!q.request_id)throw Error('不正要求');
 const v=ss.getSheetByName('TEST_割当車両台帳'),w=ss.getSheetByName('TEST_名変待ち管理'),d=ss.getSheetByName('TEST_割当ドライバーマスター');
 const vr=v.getRange(2,1,1,8),wr=w.getRange(2,1,1,5),dr=d.getRange(2,1,1,4).getValues()[0];
 const a=vr.getValues()[0],b=wr.getValues()[0];
 if(a[0]!==q.vehicle_id||a[1]!=='空車'||b[0]!==q.waiting_id||b[1]!==q.driver_id||b[2]!=='名変待ち'||dr[0]!==q.driver_id)throw Error('割当条件不一致');
 const expected=[q.vehicle_id,'空車',q.driver_id,dr[1],dr[2],dr[3],'車両準備中',q.request_id], waiting=[q.waiting_id,q.driver_id,'名変待ち',q.vehicle_id,q.request_id];
 const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
 if(!same(a,expected)&&!same(a,[q.vehicle_id,'空車','','','','','','']))throw Error('車両競合');
 if(!same(b,waiting)&&!same(b,[q.waiting_id,q.driver_id,'名変待ち','','']))throw Error('受付競合');
 if(!same(a,expected))v.getRange(2,3,1,6).setValues([expected.slice(2)]);
 if(!same(b,waiting))w.getRange(2,4,1,2).setValues([waiting.slice(3)]);
 SpreadsheetApp.flush();
 if(!same(vr.getValues()[0],expected)||!same(wr.getValues()[0],waiting))throw Error('保存照合不一致');
 const r=GFA_API_({action:'verify',request_id:q.request_id,vehicle_id:q.vehicle_id,waiting_id:q.waiting_id,driver_id:q.driver_id,management:'車両準備中',vehicle_status:'空車'});
 if(r.state!=='replica_verified'||r.request_id!==q.request_id||!r.verified_at)throw Error('Supabase確認失敗');
 console.log(JSON.stringify({結果:'スプシ保存・Supabase受付状態確認完了',VehicleID:q.vehicle_id,DriverID:q.driver_id}));
 }finally{lock.releaseLock();}
}
