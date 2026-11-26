/** Validation-only signed delivery route. Call before the existing doPost dispatch. */
function GF_DeliveryCompletionRoute_(e){
 if(e?.parameter?.gf_delivery_bridge!=='complete_v1')return null;
 const reply=x=>ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);
 try{
 const props=PropertiesService.getScriptProperties(),secret=props.getProperty('GF_DELIVERY_BRIDGE_SECRET')||'';
 if(secret.length<32)throw Error('disabled');
 const raw=e?.postData?.contents||'';if(raw.length>8192)throw Error('invalid');
 const envelope=JSON.parse(raw);if(typeof envelope.payload!=='string'||typeof envelope.signature!=='string')throw Error('invalid');
 const expected=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(envelope.payload,secret)).replace(/=+$/,'');
 let diff=expected.length^envelope.signature.length;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(envelope.signature.charCodeAt(i)||0);if(diff)throw Error('signature');
 const p=JSON.parse(envelope.payload),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!['read','delivery_complete'].includes(p.action)||!uuid.test(p.actor)||!uuid.test(p.nonce)||!Number.isFinite(p.issuedAt)||Math.abs(Date.now()-p.issuedAt)>60000)throw Error('invalid');
 const bookId=GF_ReceiptAssignmentValidationBook_();
 if(!bookId||props.getProperty('GF_DELIVERY_VALIDATION_BOOK_ID')!==bookId)throw Error('target');
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{const cache=JSON.parse(props.getProperty('GF_DELIVERY_NONCES')||'{}');for(const n of Object.keys(cache))if(cache[n]<Date.now())delete cache[n];if(cache[p.nonce]||Object.keys(cache).length>=100)throw Error('replay');cache[p.nonce]=Date.now()+120000;props.setProperty('GF_DELIVERY_NONCES',JSON.stringify(cache));}finally{lock.releaseLock();}
 if(p.action==='read')return reply(GF_DeliveryValidationReport_(bookId));
 if(true||props.getProperty('GF_DELIVERY_WRITE_ENABLED')!=='YES'||p.vehicleId!=='TEST-V01'||!/^D\d{6,7}$/.test(p.driverId)||typeof p.receiptId!=='string'||!p.receiptId.trim()||p.receiptId.length>150)throw Error('invalid');
 const resolve=id=>{
 const [h,w,d,v]=GF_ReceiptAssignmentReadTables_(bookId).map(t=>t.rows);
 const one=(rows,fn)=>{const a=rows.filter(fn);if(a.length!==1)throw Error('assignment_not_unique');return a[0];};
 const a=one(h,r=>r['LINE受付ID']===id),b=one(w,r=>r['LINE受付ID']===id),c=one(d,r=>r.DriverID===p.driverId),car=one(v,r=>r.VehicleID===p.vehicleId);
 if(a.DriverID!==p.driverId||a['処理状態']!=='登録済'||!a['受付識別子']||a['受付識別子']!==b['受付識別子']||b.DriverID!==p.driverId||b['ステータス']!=='割当済'||b['割当VehicleID']!==p.vehicleId||c['割当VehicleID']!==p.vehicleId||car.DriverID!==p.driverId)throw Error('assignment_mismatch');
 return {verified:true,receiptId:id,driverId:p.driverId,vehicleId:p.vehicleId,cancelled:false};
 };
 return reply(GF_DeliveryCompletionSave_(bookId,p,resolve));
 }catch(err){return reply({status:'rejected',error:'delivery_write_unconfirmed'});}
}

function GF_DeliveryValidationReport_(bookId){
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  const book=SpreadsheetApp.openById(bookId);
  const ledger=book.getSheetByName('車両台帳').getDataRange().getDisplayValues();
  const history=book.getSheetByName('実績履歴').getDataRange().getDisplayValues();
  const [intake,waiting,drivers,vehicles]=GF_ReceiptAssignmentReadTables_(bookId).map(t=>t.rows);
  const h=history[0], eventCol=h.indexOf('受付ID');
  const used=new Set(history.slice(1).map(row=>row[eventCol]));
  const result=GF_DELIVERY_historyPreview_(ledger,history,true);
  const candidates=[];
  const one=(rows,key,value)=>{
   const matches=rows.filter(row=>row[key]===value);
   return matches.length===1?matches[0]:null;
  };
  for(const month of result.planned.months){
   month.planned=month.planned.filter(plan=>{
    const vehicleId=plan.id;
    const vehicle=one(vehicles,'VehicleID',vehicleId);
    const driverId=vehicle?.DriverID;
    if(vehicleId!=='TEST-V01'||!/^D\d{6,7}$/.test(driverId)||!vehicle?.['現在使用者'])return true;
    const wait=one(waiting,'割当VehicleID',vehicleId);
    const receiptId=wait?.['LINE受付ID'];
    if(!receiptId||receiptId.length>150||wait.DriverID!==driverId||wait['ステータス']!=='割当済'||one(waiting,'LINE受付ID',receiptId)!==wait)return true;
    const driver=one(drivers,'DriverID',driverId);
    const receipt=one(intake,'LINE受付ID',receiptId);
    if(driver?.['割当VehicleID']!==vehicleId||receipt?.DriverID!==driverId||receipt['処理状態']!=='登録済'||!receipt['受付識別子']||receipt['受付識別子']!==wait['受付識別子'])return true;
    const eventId='DELIVERY:'+receiptId;
    if(result.details[eventId]===vehicleId)return false;
    if(!used.has(eventId))candidates.push({receiptId,vehicleId,driverId,plannedDate:plan.date});
    return true;
   });
   month.planned_count=month.planned.length;
  }
  return {...GF_DELIVERY_reportRows_(result),completionCandidates:candidates};
 }finally{lock.releaseLock();}
}

function doPost(e){return GF_DeliveryCompletionRoute_(e)||ContentService.createTextOutput(JSON.stringify({status:'rejected'})).setMimeType(ContentService.MimeType.JSON);}
