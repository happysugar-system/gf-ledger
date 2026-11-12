// Local unit tests for HMAC signing contract; run: deno test
import { verifyGasEnvelope, requestKeyHash } from "../functions/_shared/gf-fast-gas-auth.ts";
const secret="unit-test-secret-should-be-at-least-forty-eight-characters-long";
const lineUserId="U"+"a".repeat(32);
const requestId="b".repeat(64);
const receipt="TEST145-20261113002000-abcdef12";
async function signed(timestamp:number,nonce="123e4567-e89b-42d3-a456-426614174000"){
 const msg=[timestamp,nonce,requestId,receipt,lineUserId].join("\n");
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(msg))),b=>b.toString(16).padStart(2,"0")).join("");
 return {timestamp,nonce,requestId,receipt,lineUserId,signature};
}
const assert=(value:boolean,msg:string)=>{if(!value)throw Error(msg)};
Deno.test("valid GAS signature accepted",async()=>{
 const t=1_800_000_000;
 assert(await verifyGasEnvelope(await signed(t),secret,t),"valid signature rejected");
});
Deno.test("tampered receipt rejected",async()=>{
 const t=1_800_000_000;
 const p=await signed(t);
 assert(!await verifyGasEnvelope({...p,receipt:"TEST145-20261113002000-abcdef13"},secret,t),"tamper accepted");
});
Deno.test("expired signature rejected",async()=>{
 const t=1_800_000_000;
 assert(!await verifyGasEnvelope(await signed(t-121),secret,t),"expired accepted");
});
Deno.test("short secret rejected",async()=>{
 const t=1_800_000_000;
 assert(!await verifyGasEnvelope(await signed(t),"short",t),"short secret accepted");
});
Deno.test("request hash deterministic and hides raw request ID",async()=>{
 const a=await requestKeyHash(requestId);
 assert(a===await requestKeyHash(requestId)&&a!==requestId&&/^[0-9a-f]{64}$/.test(a),"bad request hash");
});
