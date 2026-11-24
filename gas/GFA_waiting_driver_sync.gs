/** GF138登録済みの受付を、明示的な受付キーを持つ名変待ち行に引き継ぐ。
 * GFA_assignment_driver_link.gs が必要。既存の未紐付け行は変更しない。
 */
function GFA_名変待ちDriverID診断(){return GFA_名変待ちDriverID同期_(false);}
function GFA_名変待ちDriverID同期(){return GFA_名変待ちDriverID同期_(true);}
function GFA_名変待ちDriverID同期_(write){
 const props=PropertiesService.getScriptProperties();
 const id=props.getProperty('GFA_APPROVED_BOOK_ID');
 const lineId=props.getProperty('GFA_APPROVED_LINE_BOOK_ID');
 if(!id||!lineId||id===lineId)throw Error('接続先未承認');
 if(write&&props.getProperty('GFA_WAITING_LINK_ENABLED')!=='true')throw Error('書込未承認');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 const vehicle=SpreadsheetApp.openById(id),line=SpreadsheetApp.openById(lineId);
 const s=vehicle.getSheetByName('名変待ち管理');if(!s)throw Error('名変待ち管理なし');
 const rows=s.getDataRange().getDisplayValues(),h=rows[0];
 const col=n=>{const a=h.flatMap((v,i)=>v.trim()===n?[i]:[]);if(a.length!==1)throw Error('列不一致: '+n);return a[0];};
 const c=['受付ID','LINE受付ID','受付識別子','DriverID','割当VehicleID','ステータス'].map(col);
 const count={legacy:0,pending:0,linked:0,ready:0,updated:0,review:0};
 const seen=new Set(),dup=new Set();
 for(const r of rows.slice(1)){const k=r[c[2]];if(k){if(seen.has(k))dup.add(k);seen.add(k);}}
 for(let i=1;i<rows.length;i++){
 const r=rows[i];if(!r[c[0]])continue;
 const receipt=r[c[1]],key=r[c[2]],old=r[c[3]];
 if(!receipt&&!key&&!old){count.legacy++;continue;}
 if(!receipt||!key||dup.has(key)){count.review++;continue;}
 try{
 const result=GFA_割当DriverIDを照合_(receipt,old,{line,vehicle,waitingKey:key});
 if(result.state!=='resolved'){count.pending++;continue;}
 if(old){count.linked++;continue;}
 if(r[c[4]]||r[c[5]]!=='名変待ち'){count.review++;continue;}
 count.ready++;
 if(write){
 const live=s.getRange(i+1,1,1,h.length).getDisplayValues()[0];
 if(c.some(j=>live[j]!==r[j])){count.review++;continue;}
 const cell=s.getRange(i+1,c[3]+1);if(cell.getFormula()||cell.getValue()!==''){count.review++;continue;}
 cell.setValue(result.driver_id);SpreadsheetApp.flush();
 if(cell.getDisplayValue()!==result.driver_id)throw Error('書込確認失敗');
 count.updated++;
 }
 }catch(e){count.review++;console.warn('GFA waiting review row='+ (i+1));}
 }
 console.log(JSON.stringify(count));return count;
 }finally{lock.releaseLock();}
}
