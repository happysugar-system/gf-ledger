/** Read-only source mapper; never writes Sheets or Calendar. */
function GF_ScheduleSourcePlan_(headers,rows){
 const h=headers.map(x=>String(x).trim());
 const required=['予定ID','VehicleID','予定種類名','予定日','状態','CalendarEventID','シフト担当者','シフト開始時間','シフト終了時間','シフトメモ'];
 if(new Set(h.filter(Boolean)).size!==h.filter(Boolean).length)throw Error('duplicate_header');
 for(const k of required)if(!h.includes(k))throw Error('missing_header:'+k);
 const ids=new Set(),events=new Set();
 return rows.flatMap((r,i)=>{
  if(r.every(x=>x===''||x==null))return [];
  const d=Object.fromEntries(h.map((k,j)=>[k,r[j]??'']).filter(x=>x[0]));
  const id=String(d['予定ID']).trim(),type=String(d['予定種類名']).trim(),vehicle=String(d.VehicleID).trim(),event=String(d.CalendarEventID).trim();
  const date=String(d['予定日']).trim().replace(/\//g,'-').replace(/-(\d)(?=-|$)/g,'-0$1');
  if(!id||ids.has(id)||!type||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('invalid_row:'+(i+2));
  if(event&&events.has(event))throw Error('duplicate_event:'+id);
  ids.add(id);if(event)events.add(event);
  return [{schedule_id:id,vehicle_id:vehicle||null,schedule_type:type,schedule_date:date,state:String(d['状態'])||null,calendar_event_id:event||null,calendar_name:null,source_data:d}];
 });
}
