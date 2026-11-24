/** 名変待ち管理の列追加。既存データは変更しない。 */
function GFA_名変待ち列追加診断(){return GFA_名変待ち列準備_(false);}
function GFA_名変待ち列追加実行(){return GFA_名変待ち列準備_(true);}
function GFA_名変待ち列準備_(write){
 const id=PropertiesService.getScriptProperties().getProperty('GFA_APPROVED_BOOK_ID');
 if(!id)throw Error('承認済み対象ブックIDが未設定');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 const s=SpreadsheetApp.openById(id).getSheetByName('名変待ち管理');
 if(!s)throw Error('対象シートなし');
 const base=['受付ID','氏名','所属会社名','稼働エリア','希望日','ステータス','割当VehicleID','割当車番','受付日時','割当日時','備考','進捗','旧シート行'];
 const extra=['LINE受付ID','受付識別子','DriverID'];
 if(s.getMaxColumns()<16)throw Error('列数不足');
 const h=s.getRange(1,1,1,Math.max(16,s.getLastColumn())).getDisplayValues()[0];
 if(base.some((v,i)=>h[i]!==v))throw Error('既存列構成不一致');
 const done=extra.every((v,i)=>h[13+i]===v)&&extra.every(v=>h.filter(x=>x===v).length===1);
 if(done)return {state:'already_ready'};
 if(extra.some(v=>h.includes(v)))throw Error('既存追加列の位置を確認');
 const r=s.getRange(1,14,Math.max(1,s.getLastRow()),3);
 if(r.getValues().some(row=>row.some(v=>v!==''))||r.getFormulas().some(row=>row.some(Boolean)))throw Error('追加先に既存データあり');
 if(r.isPartOfMerge())throw Error('追加先に結合セルあり');
 if(write){s.getRange(1,14,1,3).setValues([extra]);SpreadsheetApp.flush();if(extra.some((v,i)=>s.getRange(1,14,1,3).getDisplayValues()[0][i]!==v))throw Error('書込確認失敗');}
 return {state:write?'ready':'diagnostic_ok',columns:extra};
 }finally{lock.releaseLock();}
}
