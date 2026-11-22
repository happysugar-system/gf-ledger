// Draft only: authenticated request validation, deliberately no database or GAS writes.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const origin="https://happysugar-system.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type","Vary":"Origin","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(auth))return reply(401,{error:"login_required"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!key)return reply(503,{error:"service_unavailable"});
 const token=auth.replace(/^Bearer\s+/i,"");
 const client=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:identity,error:ae}=await client.auth.getUser(token);
 if(ae||!identity.user?.id||!identity.user.email_confirmed_at)return reply(401,{error:"invalid_session"});
 const {data:staff,error:se}=await client.rpc("gf_staff_access_self");
 if(se)return reply(503,{error:"authorization_unavailable"});
 if((Array.isArray(staff)?staff[0]:staff)?.access_granted!==true)return reply(403,{error:"staff_access_denied"});
 let p;
 try{const raw=await req.text();if(raw.length>4096)return reply(413,{error:"request_too_large"});p=JSON.parse(raw);}catch{return reply(400,{error:"invalid_json"});}
 if(!p||typeof p.vehicleId!=="string"||!/^V[0-9]{6}$/.test(p.vehicleId)||!p.changes||!p.expected||Object.keys(p.changes).length!==1||Object.keys(p.expected).length!==1||typeof p.changes["GPS有無"]!=="boolean"||typeof p.expected["GPS有無"]!=="boolean")return reply(400,{error:"invalid_request"});
 // Never report a successful save until the canonical sheet writer is connected and verified.
 return reply(503,{error:"writer_not_connected",saved:false});
});
