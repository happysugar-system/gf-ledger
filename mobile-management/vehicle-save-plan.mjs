import {validateVehiclePatch} from './vehicle-save-validation.mjs';
// Pure preflight: never write if any expected field differs.
export function planVehicleSave(request,current,options){
 const p=validateVehiclePatch(request,options);
 if(current?.VehicleID!==p.vehicleId)throw Error('invalid_vehicle');
 const conflicts=Object.keys(p.expected).filter(k=>!Object.hasOwn(current,k)||current[k]!==p.expected[k]);
 return conflicts.length?{state:'conflict',conflicts,changes:{}}:{state:'ready',changes:p.changes};
}
