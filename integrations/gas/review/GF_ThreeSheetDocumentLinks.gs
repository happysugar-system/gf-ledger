/** Read-only migration planning. Explicit source and destination; no Drive mutation. */
function GF_ThreeSheetDocumentPlan_(target,sources){
 const fields=['車両フォルダ','📷車両状態フォルダ','📁 車両書類フォルダ','📄 最新車両書類','🔧整備書類フォルダ'];
 const id=String(target.VehicleID||'').trim();
 if(!/^V\d{6}$/.test(id))throw Error('invalid_vehicle');
 const valid=u=>typeof u==='string'&&/^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|file\/d\/)[A-Za-z0-9_-]+(?:[/?#].*)?$/.test(u);
 const patch={},conflicts=[];
 for(const s of sources)if(s.VehicleID!==id)throw Error('source_vehicle_mismatch');
 for(const k of fields){
 const urls=[...new Set(sources.map(s=>s[k]).filter(valid))];
 const current=target[k];
 if(current&&!valid(current)){if(urls.length)conflicts.push(k);continue;}
 if(urls.length>1||(current&&urls.some(u=>u!==current))){conflicts.push(k);continue;}
 if(!current&&urls.length===1)patch[k]=urls[0];
 }
 return {VehicleID:id,patch,conflicts};
}
function GF_ThreeSheetDocumentRead_(sheet,row){
 const h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>x.trim());
 const range=sheet.getRange(row,1,1,h.length),v=range.getDisplayValues()[0],rich=range.getRichTextValues()[0],f=range.getFormulas()[0];
 const out={};
 h.forEach((k,i)=>{if(!k)return;if(Object.prototype.hasOwnProperty.call(out,k))throw Error('duplicate_header:'+k);out[k]=rich[i]&&rich[i].getLinkUrl()||f[i]||v[i];});
 return out;
}

/** Validation-only application of a reviewed plan. Never creates columns or folders. */
function GF_ThreeSheetDocumentApply_(book,id,sources){
 GF_IsolatedValidationBook_(book);
 if(!/^V9\d{5}$/.test(id))throw Error('validation_vehicle_required');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(1000))throw Error('document_busy');
 try{
 const v=GF_DB同期車両情報_(book,id);
 const target=GF_ThreeSheetDocumentRead_(v.sheet,v.row);
 const plan=GF_ThreeSheetDocumentPlan_(target,sources);
 if(plan.conflicts.length)return {ok:false,conflicts:plan.conflicts};
 const keys=Object.keys(plan.patch);
 const h=v.sheet.getRange(1,1,1,v.sheet.getLastColumn()).getDisplayValues()[0].map(x=>x.trim());
 const writes=keys.map(k=>{
 const matches=h.map((x,i)=>x===k?i+1:0).filter(Boolean);
 if(matches.length!==1)throw Error('destination_column_missing_or_duplicate:'+k);
 const cell=v.sheet.getRange(v.row,matches[0]);
 if(cell.getFormula()||cell.getDisplayValue())throw Error('destination_not_empty:'+k);
 return {k,cell};
 });
 for(const w of writes)w.cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(w.k+'を見る').setLinkUrl(plan.patch[w.k]).build());
 SpreadsheetApp.flush();
 const after=GF_ThreeSheetDocumentRead_(v.sheet,v.row);
 if(keys.some(k=>after[k]!==plan.patch[k]))throw Error('document_readback_failed');
 return {ok:true,updated:keys};
 }finally{lock.releaseLock();}
}
