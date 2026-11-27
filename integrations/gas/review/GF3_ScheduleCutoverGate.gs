/** Pure fail-closed calendar/schedule cutover inspection; never calls CalendarApp. */
function GF3_ScheduleCutoverGate_(plans,masterRows,routeRows){
 const norm=x=>String(x==null?'':x).trim();
 if(!Array.isArray(plans)||!Array.isArray(masterRows)||!Array.isArray(routeRows))throw Error('schedule_gate_invalid_input');
 const masters=new Map(),routes=new Map(),eventIds=new Set(),reasons=[];
 for(const m of masterRows){
  const id=norm(m.id),name=norm(m.name);
  if(!id||!name||masters.has(id))throw Error('schedule_master_ambiguous');
  masters.set(id,name);
 }
 for(const r of routeRows){
  const typeId=norm(r.typeId),calendarId=norm(r.calendarId);
  if(!typeId||!calendarId||routes.has(typeId))throw Error('schedule_route_ambiguous');
  routes.set(typeId,calendarId);
 }
 for(const p of plans){
  const d=p.source_data||{},id=norm(p.schedule_id),typeId=norm(d['予定種類ID']),typeName=norm(d['予定種類名']);
  if(!id||!typeId||!typeName){reasons.push({scheduleId:id,reason:'schedule_type_missing'});continue;}
  if(!masters.has(typeId)||masters.get(typeId)!==typeName)reasons.push({scheduleId:id,reason:'master_mismatch',typeId,typeName});
  if(!routes.has(typeId))reasons.push({scheduleId:id,reason:'calendar_route_unverified',typeId});
  const event=norm(p.calendar_event_id);
  if(event){if(eventIds.has(event))reasons.push({scheduleId:id,reason:'duplicate_event_id'});eventIds.add(event);}
 }
 return {ready:reasons.length===0,sourceRows:plans.length,eventIds:eventIds.size,problems:reasons,calendarWrites:0};
}
function GF3_予定移行ゲート自己テスト(){
 const f=(id,typeId,typeName,event)=>({schedule_id:id,calendar_event_id:event,source_data:{'予定種類ID':typeId,'予定種類名':typeName}});
 const one=f('s1','master-1','車検','event-1');
 const legacy=f('s2','legacy-expiry','車検満了','event-2');
 const good=GF3_ScheduleCutoverGate_([one],[{id:'master-1',name:'車検'}],[{typeId:'master-1',calendarId:'verified-test-calendar'}]);
 const blocked=GF3_ScheduleCutoverGate_([one,legacy],[{id:'master-1',name:'車検'}],[{typeId:'master-1',calendarId:'verified-test-calendar'}]);
 const duplicated=GF3_ScheduleCutoverGate_([one,f('s3','master-1','車検','event-1')],[{id:'master-1',name:'車検'}],[{typeId:'master-1',calendarId:'verified-test-calendar'}]);
 const wrongName=GF3_ScheduleCutoverGate_([f('s4','master-1','車検満了','event-4')],[{id:'master-1',name:'車検'}],[{typeId:'master-1',calendarId:'verified-test-calendar'}]);
 let dupRoute=false;try{GF3_ScheduleCutoverGate_([one],[{id:'master-1',name:'車検'}],[{typeId:'master-1',calendarId:'a'},{typeId:'master-1',calendarId:'b'}]);}catch(e){dupRoute=e.message==='schedule_route_ambiguous';}
 const checks=[good.ready,good.eventIds===1,!blocked.ready,blocked.problems.some(x=>x.reason==='master_mismatch'),blocked.problems.some(x=>x.reason==='calendar_route_unverified'),!duplicated.ready&&duplicated.problems.some(x=>x.reason==='duplicate_event_id'),!wrongName.ready,dupRoute];
 if(!checks.every(Boolean))throw Error('schedule_cutover_gate_fixture_failed:'+checks.map((x,i)=>x?null:i).filter(x=>x!==null).join(','));
 return {passed:checks.length,writes:0,calendarWrites:0};
}
