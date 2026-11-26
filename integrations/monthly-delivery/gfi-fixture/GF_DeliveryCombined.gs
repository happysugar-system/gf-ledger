// GF_DeliveryCompletionSave
/** Internal server-side writer. Only call from an authenticated staff handler.
 * Validation workbook only; no production write route.
 * resolveAssignment must read the verified assignment from the existing server-side source.
 */
function GF_DeliveryCompletionSave_(bookId,request,resolveAssignment){
 if(typeof GF_ReceiptAssignmentValidationBook_!=='function'||bookId!==GF_ReceiptAssignmentValidationBook_())throw Error('validation_book_only');
 if(typeof resolveAssignment!=='function')throw Error('assignment_resolver_required');
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
 const book=SpreadsheetApp.openById(bookId);
 const ledger=book.getSheetByName('車両台帳'),history=book.getSheetByName('実績履歴');
 if(!ledger||!history)throw Error('missing_sheet');
 const read=sh=>{const [headers,...rows]=sh.getDataRange().getDisplayValues();if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw Error('duplicate_header');return {headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])))};};
 const l=read(ledger),h=read(history);
 for(const k of ['VehicleID','DriverID','現在使用者','納車予定日','紹介元'])if(!l.headers.includes(k))throw Error('ledger_header_missing:'+k);
 for(const k of ['受付ID','登録日時','VehicleID','種類','実施日','状態','変更後JSON','取消日時'])if(!h.headers.includes(k))throw Error('history_header_missing:'+k);
 const vehicles=l.rows.filter(r=>r.VehicleID===request.vehicleId);
 if(vehicles.length!==1)throw Error('vehicle_not_unique');
 const assignment=resolveAssignment(request.receiptId);
 const plan=GF_DeliveryCompletionPlan_(vehicles[0],assignment,h.rows,request);
 if(plan.state==='unchanged')return {status:'verified',eventId:plan.eventId};
 const row={...plan.history,'登録日時':Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')};
 // RAW prevents spreadsheet formula interpretation of identifiers or snapshot text.
 try{Sheets.Spreadsheets.Values.append({values:[h.headers.map(k=>row[k]??'')]},bookId,"'実績履歴'!A1",{valueInputOption:'RAW',insertDataOption:'INSERT_ROWS'});}catch(e){/* Verify even if the transport response was lost. */}
 const after=read(history);
 const verified=GF_DeliveryCompletionPlan_(vehicles[0],assignment,after.rows,request);
 if(verified.state!=='unchanged')throw Error('completion_write_unconfirmed');
 return {status:'verified',eventId:plan.eventId};
 }finally{lock.releaseLock();}
}


// GF_DeliveryCompletionPlan
// Pure validation and planning; no writes, no public endpoint.
// A completion must be linked to a verified application/assignment receipt.
function GF_DeliveryCompletionPlan_(vehicle, assignment, history, request) {
 const str=v=>String(v??'').trim();
 const id=str(request.receiptId), vid=str(request.vehicleId), did=str(request.driverId), date=str(request.date);
 if(!id||!vid||!did||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('invalid_completion');
 const parsed=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('invalid_date');
 if(!assignment||str(assignment.receiptId)!==id||str(assignment.vehicleId)!==vid||str(assignment.driverId)!==did||assignment.verified!==true||assignment.cancelled===true)throw Error('assignment_not_verified');
 if(str(vehicle.VehicleID)!==vid||str(vehicle.DriverID)!==did||!str(vehicle['現在使用者']))throw Error('vehicle_driver_mismatch');
 const eventId='DELIVERY:'+id;
 const matches=history.filter(r=>str(r['受付ID'])===eventId);
 if(matches.length>1)throw Error('duplicate_history');
 if(matches.length){
 const old=matches[0];
 let snapshot;try{snapshot=JSON.parse(old['変更後JSON']);}catch{throw Error('invalid_history');}
 if(str(old['VehicleID'])!==vid||str(snapshot.DriverID)!==did||str(old['種類'])!=='納車完了'||str(old['状態'])!=='完了'||str(old['取消日時'])||str(old['実施日']).replace(/\//g,'-')!==date)throw Error('completion_conflict');
 return {state:'unchanged',eventId};
 }
 const snapshot={VehicleID:vid,DriverID:did,receiptId:id};
 for(const field of ['現在使用者','紹介元','納車予定日','管轄','車番','車種','所属会社名','稼働エリア'])snapshot[field]=str(vehicle[field]);
 return {state:'planned',eventId,history:{'受付ID':eventId,'VehicleID':vid,'種類':'納車完了','実施日':date,'状態':'完了','変更後JSON':JSON.stringify(snapshot),'取消日時':''}};
}


// GF_MonthlyDeliveryHistory
// Read-only preview; source workbook is explicit and never modified.
function GF_DELIVERY_historyPreview_(ledger,history,confirmedOnly){
 const ix=(grid,n)=>{const h=grid[0].map(x=>String(x).trim());if(h.filter(x=>x===n).length!==1)throw Error('見出し不一致: '+n);return h.indexOf(n);};
 const v=ix(ledger,'VehicleID'),p=ix(ledger,'納車予定日');
 const rid=ix(history,'受付ID'),vid=ix(history,'VehicleID'),kind=ix(history,'種類'),day=ix(history,'実施日'),state=ix(history,'状態'),cancel=ix(history,'取消日時');
 const planned=GF_DELIVERY_monthlyPlan_([['ID','予定','実績'],...ledger.slice(1).map(r=>[r[v],r[p],''])],{id:'ID',planned:'予定',actual:'実績'});
 const plannedInfo=Object.create(null),actualInfo=Object.create(null);
 const fields=['現在使用者','管轄','車番','車種','所属会社名','紹介元','稼働エリア'];
 const indexes=fields.map(n=>ix(ledger,n));
 for(const r of ledger.slice(1)){const id=String(r[v]??'').trim();if(id)plannedInfo[id]=Object.fromEntries(fields.map((n,i)=>[n,String(r[indexes[i]]??'')]));}
 const after=ix(history,'変更後JSON');
 const events=new Set(),rows=[['ID','予定','実績']],details={};
 for(const r of history.slice(1)){if(r[kind]!== (confirmedOnly===true?'納車完了':'貸出開始')||r[state]!=='完了'||r[cancel])continue;const id=String(r[rid]||'').trim(),vehicle=String(r[vid]||'').trim();if(!id||!vehicle||!r[day])throw Error('実績識別情報不足');if(events.has(id))throw Error('実績受付ID重複');events.add(id);rows.push([id,'',r[day]]);details[id]=vehicle;let snap={};try{const x=JSON.parse(r[after]);if(x&&typeof x==='object'&&!Array.isArray(x))snap=x;}catch{} actualInfo[id]=Object.fromEntries(fields.map(n=>[n,typeof snap[n]==='string'?snap[n]:'']));}
 const actual=GF_DELIVERY_monthlyPlan_(rows,{id:'ID',planned:'予定',actual:'実績'});
 return {planned,actual,details,plannedInfo,actualInfo,definition:confirmedOnly===true?'納車完了・完了・取消なし':'貸出開始・完了・取消なし（参考実績）'};
}
function GF_DELIVERY_preview(){
 const id=PropertiesService.getScriptProperties().getProperty('GF_DELIVERY_SOURCE_BOOK_ID');
 if(!id)throw Error('集計元未設定');
 const book=SpreadsheetApp.openById(id),ledger=book.getSheetByName('車両台帳'),history=book.getSheetByName('実績履歴');
 if(!ledger||!history)throw Error('集計元シート不足');
 const result=GF_DELIVERY_historyPreview_(ledger.getDataRange().getDisplayValues(),history.getDataRange().getDisplayValues());
 return {planned:result.planned.months.map(m=>({month:m.month,count:m.planned_count})),actual:result.actual.months.map(m=>({month:m.month,count:m.actual_count})),invalid:result.planned.invalid.length+result.actual.invalid.length,definition:result.definition};
}


// GF_MonthlyDeliveryPlan
// Read-only aggregation from the authoritative vehicle ledger. No triggers or sheet writes.
function GF_DELIVERY_monthlyPlan_(grid, columns){
 const heads=grid[0].map(v=>String(v).trim());
 const idx={};for(const k of ['id','planned','actual']){const n=columns[k];if(!n||heads.filter(h=>h===n).length!==1)throw Error('集計列未確定・重複: '+k);idx[k]=heads.indexOf(n);}
 if(new Set(Object.values(idx)).size!==3)throw Error('予定日と実績日は別列が必要です');
 const seen=new Set(),months=new Map(),invalid=[];
 function month(v){if(v===''||v==null)return null;const s=String(v).trim(),m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);if(!m)return false;const y=+m[1],mo=+m[2],d=+m[3],t=new Date(Date.UTC(y,mo-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d?m[1]+'-'+String(mo).padStart(2,'0'):false;}
 for(const row of grid.slice(1)){const id=String(row[idx.id]??'').trim();if(!id)continue;if(seen.has(id))throw Error('車両ID重複');seen.add(id);
 for(const type of ['planned','actual']){const raw=row[idx[type]],key=month(raw);if(key===false){invalid.push({id,type});continue;}if(!key)continue;if(!months.has(key))months.set(key,{month:key,planned:[],actual:[]});months.get(key)[type].push({id,date:String(raw)});}
 }
 return {months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({...m,planned_count:m.planned.length,actual_count:m.actual.length})),invalid};
}


// GF_MonthlyDeliveryReport
// Dedicated report workbook only. Never write to the authoritative ledger.
function GF_DELIVERY_reportRows_(result){
 const confirmed=result.definition==='納車完了・完了・取消なし';
 const map=new Map(),details=[['対象月','区分','VehicleID','日付','実績受付ID','ドライバー名','車両ナンバー','車種','所属会社名','紹介元','稼働エリア']];
 function info(x){x=x||{};return [x['現在使用者']||'未記録',[x['管轄'],x['車番']].filter(Boolean).join(' ')||'未記録',...['車種','所属会社名','紹介元','稼働エリア'].map(k=>x[k]||'未記録')];}
 function month(k){if(!map.has(k))map.set(k,[k,0,0]);return map.get(k);}
 for(const m of result.planned.months){month(m.month)[1]=m.planned_count;for(const r of m.planned)details.push([m.month,'予定',r.id,r.date,'',...info(result.plannedInfo?.[r.id])]);}
 for(const m of result.actual.months){month(m.month)[2]=m.actual_count;for(const r of m.actual)details.push([m.month,confirmed?'納車完了':'貸出開始実績（暫定）',result.details[r.id],r.date,r.id,...info(result.actualInfo?.[r.id])]);}
 if(result.planned.invalid.length+result.actual.invalid.length)throw Error('不正日付あり：集計出力を中止');
 return {summary:[['対象月','納車予定台数',confirmed?'納車完了台数':'貸出開始実績台数（暫定）'],...[...map.values()].sort((a,b)=>a[0].localeCompare(b[0]))],details:[details[0],...details.slice(1).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])||a[3].localeCompare(b[3]))]};
}
