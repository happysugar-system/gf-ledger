/** GOLD FIRST / 39_台帳ステータス同期.gs
 * 39の全文貼替え。2026/10/11 軽量版。
 * 初回：GF_台帳ステータス連動を設定する を1回実行。
 * 台帳を正本として、ステータスのみ関連シートへ転記する。
 * 実績日の直接編集時は台帳のステータスも変更する。
 * 使用者・DriverID・書類リンク・入力した日付は保持する。
 * 入力規則の編集はonEditが発火しないため、1分ごとにも確認する。
 */
function GF_台帳ステータス連動を設定する() {
  const ss = 対象スプレッドシートを開く_();
  const handlers = ['GF_台帳ステータス編集_39','GF_台帳ステータス定期同期_39'];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const triggers = ScriptApp.getProjectTriggers();
    if (!triggers.some(t => t.getHandlerFunction() === handlers[0] && t.getTriggerSourceId() === ss.getId())) {
      ScriptApp.newTrigger(handlers[0]).forSpreadsheet(ss).onEdit().create();
    }
    if (!triggers.some(t => t.getHandlerFunction() === handlers[1])) {
      ScriptApp.newTrigger(handlers[1]).timeBased().everyMinutes(1).create();
    }
    const props=PropertiesService.getScriptProperties();
    props.setProperty('GF_STATUS_BOOK_39',ss.getId());
    Object.keys(props.getProperties()).filter(k=>k.startsWith('GF_STATUS_RULE_39_')).forEach(k=>props.deleteProperty(k));
  } finally { lock.releaseLock(); }
  GF_台帳ステータス定期同期_39();
  console.log('ステータス連動を設定しました。台帳の値と選択肢を1分ごとに確認します。');
}
function GF_台帳ステータス編集_39(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== シート名.車両台帳 || e.range.getLastRow() < 2) return;
  const id = PropertiesService.getScriptProperties().getProperty('GF_STATUS_BOOK_39');
  if (!id || sheet.getParent().getId() !== id) return;
  const header = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const col = GF_ステータス列_39(header,'区分/ステータス');
  const touches=c=>c>=e.range.getColumn()&&c<=e.range.getLastColumn();
  const manual=touches(col);
  const dateSpecs=[['引渡し','貸出中'],['返却/12点検','空車'],['代車開始日','代車'],['代車返却日','空車']];
  const edited=dateSpecs.map((x,i)=>({name:x[0],status:x[1],order:i,col:header.findIndex(v=>String(v||'').trim()===x[0])+1})).filter(x=>x.col>0&&touches(x.col));
  if(!manual&&!edited.length)return;
  const props=PropertiesService.getScriptProperties();
  const idcol=GF_ステータス列_39(header,'VehicleID');
  for(let row=Math.max(2,e.range.getRow());row<=e.range.getLastRow();row++) {
    const vehicle=String(sheet.getRange(row,idcol).getDisplayValue()||'').trim();if(!vehicle)continue;
    if(manual){props.setProperty('GF_STATUS_MANUAL_39_'+vehicle,String(Date.now()));continue;}
    const dates=edited.map(x=>({...x,value:String(sheet.getRange(row,x.col).getDisplayValue()||'').trim(),key:GF_実績日キー_39(sheet.getRange(row,x.col).getValue(),sheet.getParent().getSpreadsheetTimeZone())})).filter(x=>x.key);
    // 複数の実績日を同時に貼った場合は、今回編集した中で最新の日付を使う。
    dates.sort((a,b)=>a.key.localeCompare(b.key)||a.order-b.order);
    if(!dates.length)continue;
    const chosen=dates[dates.length-1];
    props.setProperty('GF_STATUS_DATE_39_'+Utilities.getUuid(),JSON.stringify({book:id,vehicle,time:Date.now(),status:String(sheet.getRange(row,col).getDisplayValue()||'').trim(),dates:edited.map(x=>({name:x.name,value:String(sheet.getRange(row,x.col).getDisplayValue()||'').trim()})),next:chosen.status}));
  }
  // ロック中なら受付を残し、定期実行で反映する。
  GF_ステータス反映_39(sheet.getParent(),Math.max(2,e.range.getRow()),e.range.getLastRow());
}
function GF_台帳ステータス定期同期_39() {
  return GF_ステータス反映_39(対象スプレッドシートを開く_());
}
function GF_ステータス列_39(header,name) {
  const matches = [];
  header.forEach((v,i) => { if (String(v || '').trim() === name) matches.push(i+1); });
  if (matches.length !== 1) throw new Error('「'+name+'」列が見つからないか、重複しています。');
  return matches[0];
}
function GF_ステータスID索引_39(rows,idcol,name) {
  const index = new Map();
  for (let i=1;i<rows.length;i++) {
    const id=String(rows[i][idcol-1] || '').trim();
    if (!id) continue;
    if (index.has(id)) throw new Error(name+'でVehicleIDが重複しています：'+id);
    index.set(id,i+1);
  }
  return index;
}
function GF_ステータス選択肢_39(rules,rows,statuscol) {
  const options = new Set();
  const add = v => { const s=String(v || '').trim();if(s) options.add(s); };
  for (const row of rules) {
    const rule=row[0];if (!rule) continue;
    const type=rule.getCriteriaType(),values=rule.getCriteriaValues();
    if(type===SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) values[0].forEach(add);
    else if(type===SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) values[0].getDisplayValues().flat().forEach(add);
  }
  // 追加した直後の入力値や、既存のステータスも拒否されないように含める。
  rows.slice(1).forEach(r=>add(r[statuscol-1]));
  return Array.from(options);
}
function GF_ステータス反映_39(ss,from,to) {
  const lock=LockService.getScriptLock();
  // 更新中は次の定期実行で再確認。編集値は台帳に保持される。
  if(!lock.tryLock(1000)) return {待機:true};
  try {
    const ledger=ss.getSheetByName(シート名.車両台帳);
    if(!ledger)throw new Error('車両台帳がありません。');
    const rows=ledger.getDataRange().getDisplayValues();
    const idcol=GF_ステータス列_39(rows[0],'VehicleID');
    const statuscol=GF_ステータス列_39(rows[0],'区分/ステータス');
    GF_ステータスID索引_39(rows,idcol,'車両台帳');
    const rules=ledger.getRange(2,statuscol,Math.max(ledger.getMaxRows()-1,1),1).getDataValidations();
    const options=GF_ステータス選択肢_39(rules,rows,statuscol);
    const plans=[];
    for(const spec of [[シート名.利用者管理,'ステータス'],[シート名.車両状況,'現在のステータス']]) {
      const sheet=ss.getSheetByName(spec[0]);
      if(!sheet)throw new Error('「'+spec[0]+'」シートがありません。');
      const dest=sheet.getDataRange().getDisplayValues();
      const destId=GF_ステータス列_39(dest[0],'VehicleID');
      const destStatus=GF_ステータス列_39(dest[0],spec[1]);
      plans.push({sheet,col:destStatus,index:GF_ステータスID索引_39(dest,destId,spec[0]),rows:dest});
    }
    GF_実績日編集を反映_39(ss,ledger,rows,idcol,statuscol);
    rows.slice(1).forEach(r=>{const v=String(r[statuscol-1]||'').trim();if(v&&!options.includes(v))options.push(v);});
    // すべてのID・列を確認した後に書き込みを開始する。
    let count=0,missing=0;
    for(const plan of plans) {
      const edits=[];
      for(let i=Math.max(2,from || 2);i<=Math.min(rows.length,to || rows.length);i++) {
        const id=String(rows[i-1][idcol-1] || '').trim();if(!id)continue;
        const target=plan.index.get(id);if(!target){missing++;continue;}
        const status=String(rows[i-1][statuscol-1] || '').trim();
        if(String(plan.rows[target-1][plan.col-1] || '').trim()!==status)edits.push({row:target,status});
      }
      // 選択肢を先に追加してから、新しいステータスを転記する。
      if(options.length)GF_ステータス入力規則_39(plan.sheet,plan.col,options);
      edits.sort((a,b)=>a.row-b.row);
      for(let i=0;i<edits.length;) {
        const first=i;while(i+1<edits.length&&edits[i+1].row===edits[i].row+1)i++;
        const values=edits.slice(first,i+1).map(e=>[e.status]);
        plan.sheet.getRange(edits[first].row,plan.col,values.length,1).setValues(values);
        count+=values.length;i++;
      }
    }
    if(count)SpreadsheetApp.flush();
    if(missing)console.warn('ステータス反映：関連シート未作成の延べ'+missing+'行は正規同期後に反映します。');
    if(count)console.log('台帳ステータス反映：'+count+'セル。日付・使用者・書類は保持。');
    return {更新セル:count,未作成行:missing};
  } finally {lock.releaseLock();}
}
function GF_ステータス入力規則_39(sheet,col,options) {
  const props=PropertiesService.getScriptProperties();
  const key='GF_STATUS_RULE_39_'+sheet.getParent().getId()+'_'+sheet.getSheetId()+'_'+col;
  const signature=JSON.stringify([sheet.getMaxRows(),options]);
  let saved=null;try{saved=JSON.parse(props.getProperty(key)||'null');}catch(e){}
  // 選択肢・行数が同じなら5分間、関連シートの全入力規則読込を省略。
  // 台帳側の選択肢変更は毎分取得するため、次の確認で反映できる。
  if(saved&&saved.signature===signature&&Date.now()-saved.time<300000)return;
  const range=sheet.getRange(2,col,Math.max(sheet.getMaxRows()-1,1),1);
  const rules=range.getDataValidations();
  const matches=rule=> {
    if(!rule||rule.getCriteriaType()!==SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST)return false;
    const args=rule.getCriteriaValues();
    return JSON.stringify(args[0])===JSON.stringify(options)&&args[1]!==false&&rule.getAllowInvalid();
  };
  if(rules.every(row=>matches(row[0]))){props.setProperty(key,JSON.stringify({signature,time:Date.now()}));return;}
  const rule=SpreadsheetApp.newDataValidation().requireValueInList(options,true).setAllowInvalid(true).build();
  range.setDataValidation(rule);
  props.setProperty(key,JSON.stringify({signature,time:Date.now()}));
}

/** 正しい実績日だけ対象。空欄・不正な日付は状態を変更しない。 */
function GF_実績日キー_39(value,tz) {
  if(value instanceof Date)return isNaN(value.getTime())?'':Utilities.formatDate(value,tz,'yyyy-MM-dd');
  const m=String(value||'').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(!m)return '';
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),date=new Date(Date.UTC(y,mo-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return '';
  return m[1]+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
/** ScriptLock保持中のみ呼ぶ。過去の全実績日から再判定しない。 */
function GF_実績日編集を反映_39(ss,ledger,rows,idcol,statuscol) {
  const props=PropertiesService.getScriptProperties(),all=props.getProperties();
  const index=GF_ステータスID索引_39(rows,idcol,'車両台帳');
  const requests=Object.keys(all).filter(k=>k.startsWith('GF_STATUS_DATE_39_')).map(k=>{try{return {key:k,data:JSON.parse(all[k])};}catch(e){props.deleteProperty(k);return null;}}).filter(Boolean).sort((a,b)=>b.data.time-a.data.time);
  const seen=new Set();
  for(const request of requests) {
    const r=request.data;
    if(r.book!==ss.getId())continue;
    const row=index.get(r.vehicle);
    const changed=!row||seen.has(r.vehicle)||Number(all['GF_STATUS_MANUAL_39_'+r.vehicle]||0)>=r.time||String(rows[row-1][statuscol-1]||'').trim()!==r.status||r.dates.some(x=>{const c=rows[0].findIndex(h=>String(h||'').trim()===x.name);return c<0||String(rows[row-1][c]||'').trim()!==x.value;});
    seen.add(r.vehicle);
    if(!changed){
      // 既存のチップ設定は保持し、未追加の値による入力拒否だけ避ける。
      const cell=ledger.getRange(row,statuscol),rule=cell.getDataValidation();
      if(rule&&!rule.getAllowInvalid())cell.setDataValidation(rule.copy().setAllowInvalid(true).build());
      cell.setValue(r.next);rows[row-1][statuscol-1]=r.next;
      console.log('実績日からステータス反映 / '+r.vehicle+' / '+r.next);
    }
    props.deleteProperty(request.key);
  }
}