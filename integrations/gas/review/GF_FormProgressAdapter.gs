/** Review only. Pure adapter: no GAS RPC, credentials or writes.
 * Caller must authenticate staff, resolve receipt server-side and use shared worker.
 * Ordinary edits remain separate; mixed requests fail closed until UI supports separation.
 */
function GF_FormProgressPlan_(headers, detail, changes, snapshot) {
  const keys=['管理区分','納車可能日','納車確定日'];
  const stages=['車両準備中','車両手配済み','名義変更前','名義変更中','名義変更済み'];
  if (!Array.isArray(headers)||!Array.isArray(detail?.fields)||!Array.isArray(changes)) throw Error('invalid_form');
  const seen=new Set(), progress=[], ordinary=[];
  for(const ch of changes){
    if(!Number.isInteger(ch.col)||ch.col<1||ch.col>headers.length||seen.has(ch.col)||typeof ch.value!=='string'||typeof ch.original!=='string') throw Error('invalid_change');
    seen.add(ch.col);
    const name=headers[ch.col-1], matches=detail.fields.filter(f=>f.col===ch.col);
    if(matches.length!==1||matches[0].rawName!==name||matches[0].readonly||matches[0].value!==ch.original) throw Error('stale_form');
    if(keys.includes(name)) progress.push({name,value:ch.value,original:ch.original});
    else ordinary.push(ch);
  }
  const stageChange=progress.find(c=>c.name===keys[0]);
  const isProgress=progress.some(c=>c.name!==keys[0])||!!(stageChange&&(stages.includes(stageChange.value)||stages.includes(stageChange.original)));
  if(!isProgress)return {kind:'ordinary',changes};
  if(ordinary.length)throw Error('mixed_save_requires_separation');
  if(!snapshot||snapshot.vehicleId!==detail.id||!/^D\d{6}$/.test(snapshot.driverId)||!Array.isArray(snapshot.values)||snapshot.values.length!==3)throw Error('assignment_required');
  const values=keys.map((key,i)=>{
    if(headers.filter(h=>h===key).length!==1)throw Error('invalid_progress_header');
    const f=detail.fields.filter(x=>x.rawName===key);
    if(f.length!==1||f[0].readonly)throw Error('invalid_progress_field');
    const normalize=v=>i===0?String(v).trim():GF_LedgerProdProgressDate_(v);
    if(normalize(f[0].value)!==snapshot.values[i])throw Error('stale_progress');
    const change=progress.find(c=>c.name===key);
    return normalize(change?change.value:f[0].value);
  });
  if(!stages.includes(values[0])||(values[1]&&values[2]&&values[2]<values[1]))throw Error('invalid_progress_values');
  return {kind:'progress',expected:snapshot,fields:Object.fromEntries(keys.map((k,i)=>[k,values[i]]))};
}
