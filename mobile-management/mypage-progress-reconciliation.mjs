// Pure reconciliation planner. No database writes; unknown stages require review.
export const STAGES=Object.freeze(['車両準備中','車両手配済み','名義変更前','名義変更中','名義変更済み']);
export function planProgress({driverId,vehicles,current,now}){
 if(!/^D\d{6}$/.test(driverId)||!Array.isArray(vehicles))return {state:'review'};
 const matches=vehicles.filter(v=>v.vehicle_data?.DriverID===driverId);
 if(matches.length!==1)return {state:'review',reason:'assignment_missing_or_ambiguous'};
 const v=matches[0],stage=v.vehicle_data['管理区分'];
 if(!STAGES.includes(stage))return {state:'review',reason:'unmapped_management'};
 if(current&&(current.driver_id!==driverId||current.vehicle_id!==v.vehicle_id))return {state:'review',reason:'identity_mismatch'};
 if(current?.stage===stage)return {state:'unchanged'};
 if(!current&&stage!==STAGES[0])return {state:'review',reason:'initial_stage_not_confirmed'};
 const dates={...(current?.stage_dates||{})};
 for(const k of STAGES)if(STAGES.indexOf(k)>STAGES.indexOf(stage))delete dates[k];
 dates[stage]=now;
 return {state:'candidate',expected_updated_at:current?.updated_at??null,record:{driver_id:driverId,vehicle_id:v.vehicle_id,stage,stage_dates:dates,delivery_available_date:current?.delivery_available_date??null,delivery_confirmed_date:current?.delivery_confirmed_date??null}};
}
