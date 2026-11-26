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
