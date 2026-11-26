import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const source=readFileSync(new URL("../supabase/functions/gf-line-reception-admin/index.ts",import.meta.url),"utf8");
const gate=source.match(/if\(!\[(.*?)\]\.includes\(input\?\.action\)\)return respond\(400,\{error:"invalid_action"\}\);/s);
assert.ok(gate,"action allowlist must exist");
const actions=JSON.parse("["+gate[1]+"]");
const start=source.indexOf("   if(!changes.length)return respond");
const end=source.indexOf("   const write=await fetch(",start);
assert.ok(start>=0&&end>start,"check-write guard must precede the Sheets write");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const checkGuard=new AsyncFunction("changes","allowed","checks","v","clean","respond","Deno","db","receipt",source.slice(start,end));

async function run({activeType="driver_license",changeType="driver_license",enabled=true,failDb=false,unchanged=false}={}){
 const allowed=["免許証確認","住民票確認"];
 const checkKey=changeType==="driver_license"?"免許証確認":"住民票確認";
 const v={"免許証確認":"未確認","住民票確認":"未確認"};
 const checks=unchanged?{...v}:{...v,[checkKey]:"確認OK"};
 const data=unchanged?[]:[{range:"test",values:[["確認OK"]]}];
 let reads=0;
 const db={from(name){
  assert.equal(name,"gf_driver_document_review_requests");
  let types=[];
  return {select(){return this},eq(){return this},
   in(key,values){if(key==="document_type")types=values;return this},
   async limit(){reads++;return {data:types.includes(activeType)?[{id:"TEST"}]:[],error:failDb?{message:"offline"}:null}}};
 }};
 const result=await checkGuard(data,allowed,checks,v,value=>String(value??"").trim(),
   (status,body)=>({status,body}),{env:{get:()=>enabled?"YES":"NO"}},db,"TEST-RECEIPT");
 return {result,reads};
}

test("all four document review routes pass the API action gate",()=>{
 for(const name of ["document_review_list","document_review_request","document_review_approve","document_review_again"])
  assert.ok(actions.includes(name),name);
});
test("normal check write cannot modify a document under active review",async()=>{
 const {result,reads}=await run();
 assert.equal(result.status,409);assert.equal(result.body.error,"document_review_active");assert.equal(reads,1);
});
test("unrelated document check update remains available",async()=>{
 const {result,reads}=await run({changeType:"residence_certificate"});
 assert.equal(result,undefined);assert.equal(reads,1);
});
test("legacy installs without document review enabled do not read the new table",async()=>{
 const {result,reads}=await run({enabled:false});
 assert.equal(result,undefined);assert.equal(reads,0);
});
test("database read error fails closed before Sheets write",async()=>{
 const {result}=await run({failDb:true});
 assert.equal(result.status,503);assert.equal(result.body.error,"document_review_guard_unavailable");
});
test("unchanged checks do not touch the review table",async()=>{
 const {result,reads}=await run({unchanged:true});
 assert.equal(result.status,200);assert.equal(reads,0);
});
