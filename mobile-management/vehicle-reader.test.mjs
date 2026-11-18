import assert from 'node:assert/strict';
import { normalizeVehicle, filterVehicles, fetchVehicles } from './vehicle-reader.mjs';
const sample = normalizeVehicle({vehicle_id:'VTEST',vehicle_number:'品川 123',updated_at:'2026-11-18',vehicle_data:{'車種':'軽自動車','現在使用者':'テスト担当'}});
assert.equal(Object.keys(sample).length,63);
assert.equal(sample.VehicleID,'VTEST');
assert.equal(sample['車番'],'品川 123');
assert.equal(sample['車種'],'軽自動車');
assert.equal(filterVehicles([sample],'テスト担当').length,1);
assert.equal(filterVehicles([sample],'存在しない').length,0);
let requested;
const result=await fetchVehicles({
 apiBase:'https://example.test/api',accessToken:'synthetic-token',publishableKey:'test-publishable',
 fetchImpl:async(url,options)=>{requested={url,options};return {ok:true,json:async()=>({vehicles:[{vehicle_id:'VTEST',vehicle_number:'品川 123',vehicle_data:{}}],nextCursor:null})};}
});
assert.equal(result.vehicles.length,1);
assert.equal(requested.options.headers.Authorization,'Bearer synthetic-token');
assert.equal(requested.options.headers.apikey,'test-publishable');
assert.equal(requested.options.cache,'no-store');
await assert.rejects(fetchVehicles({apiBase:'http://unsafe.test',accessToken:'x'}),/HTTPS/);
await assert.rejects(fetchVehicles({apiBase:'https://example.test',accessToken:''}),/Login/);
await assert.rejects(fetchVehicles({apiBase:'https://example.test',accessToken:'x',fetchImpl:async()=>({ok:false,status:403})}),/403/);
console.log('Vehicle reader: 63 fields, search, auth headers, HTTPS and failure handling OK');
