import assert from 'node:assert/strict';
import { normalizeVehicle, filterVehicles, fetchVehicles, fetchAllVehicles } from './vehicle-reader.mjs';
const sample = normalizeVehicle({vehicle_id:'VTEST',vehicle_number:'品川 123',updated_at:'2026-11-18',vehicle_data:{'車種':'軽自動車','現在使用者':'テスト担当'}});
assert.equal(Object.keys(sample).length,63);
assert.equal(sample.VehicleID,'VTEST');
assert.equal(sample['車番'],'品川 123');
assert.equal(sample['車種'],'軽自動車');
const spaced = normalizeVehicle({vehicle_id:'V000001',vehicle_number:'123',vehicle_data:{'12点検予定日':'2026-12-01','板金予定日':'2026-12-02','整備予定日':'2026-12-03'}});
assert.equal(spaced[' 12点検予定日'],'2026-12-01');
assert.equal(spaced[' 板金予定日'],'2026-12-02');
assert.equal(spaced[' 整備予定日'],'2026-12-03');
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

const mk=(n)=>({vehicle_id:'V'+String(n).padStart(6,'0'),vehicle_number:'TEST-'+n,vehicle_data:{}});
const mockPages=[Array.from({length:100},(_,i)=>mk(i+1)),Array.from({length:100},(_,i)=>mk(i+101)),Array.from({length:8},(_,i)=>mk(i+201))];
let calls=0;
const all=await fetchAllVehicles({apiBase:'https://example.test/functions/v1/test',accessToken:'fake',
 fetchImpl:async(url)=>{const idx=calls++;const expected=idx===0?null:'V'+String(idx*100).padStart(6,'0');assert.equal(new URL(url).searchParams.get('cursor'),expected);return {ok:true,json:async()=>({vehicles:mockPages[idx],nextCursor:idx<2?'V'+String((idx+1)*100).padStart(6,'0'):null})};}
});
assert.equal(calls,3);
assert.equal(all.length,208);
assert.equal(new Set(all.map(v=>v.VehicleID)).size,208);
await assert.rejects(fetchAllVehicles({apiBase:'https://example.test',accessToken:'fake',fetchImpl:async()=>({ok:true,json:async()=>({vehicles:[mk(1)],nextCursor:'V000001'})})}),/Repeated vehicle cursor|Duplicate/);
let duplicateCall=0;
await assert.rejects(fetchAllVehicles({apiBase:'https://example.test',accessToken:'fake',fetchImpl:async()=>({ok:true,json:async()=>({vehicles:[mk(1)],nextCursor:duplicateCall++===0?'V000001':null})})}),/Duplicate/);
console.log('Pagination: 100 + 100 + 8; no duplicates; repeated cursors rejected');
