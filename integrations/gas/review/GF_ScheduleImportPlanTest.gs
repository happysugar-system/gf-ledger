/** Pure validation import mapper. Does not write to Calendar. */
function GF_ScheduleImportPlan_(headers,rows){
 const h=headers.map(x=>String(x).trim());
 if(new Set(h.filter(Boolean)).size!==h.filter(Boolean).length)throw Error('duplicate_header');
 for(const k of ['予定種別','予定日','GoogleカレンダーEventID','カレンダー','VehicleID'])if(!h.includes(k))throw Error('missing_header:'+k);
 const seen=new Set();
 return rows.flatMap((r,i)=>{
 if(r.every(x=>x===''||x==null))return [];
 const d=Object.fromEntries(h.map((k,j)=>[k,r[j]]).filter(x=>x[0]));
 const type=String(d['予定種別']||'').trim(),date=String(d['予定日']||'').trim().replace(/\//g,'-').replace(/-(\d)(?=-|$)/g,'-0$1');
 if(!type||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('invalid_schedule_row:'+(i+2));
 const vehicle=String(d.VehicleID||'').trim(),event=String(d['GoogleカレンダーEventID']||'').trim(),calendar=String(d['カレンダー']||'').trim();
 if(vehicle&&!/^V9\d{5}$/.test(vehicle))throw Error('validation_vehicle_required');
 if(!vehicle&&type!=='シフト')throw Error('vehicle_required');
 if(event&&!calendar)throw Error('calendar_required');
 const key=JSON.stringify([calendar,event]);
 if(event&&seen.has(key))throw Error('duplicate_event');
 if(event)seen.add(key);
 return [{schedule_id:'TEST-SCHEDULE-'+(i+2),vehicle_id:vehicle||null,schedule_type:type,schedule_date:date,state:String(d['状態']||'')||null,calendar_name:calendar||null,calendar_event_id:event||null,source_data:d}];
 });
}
