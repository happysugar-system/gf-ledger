import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req)=>{
 if(req.method!=="POST")return reply(405,{error:"method"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("GF_VEHICLE_PRODUCTION_SYNC_TOKEN");
 if(url!=="https://tgxrnrqxafytyqfwwsag.supabase.co"||!key||!secret||secret.length<32||Deno.env.get("GF_VEHICLE_PRODUCTION_WRITE_ENABLED")!=="true")return reply(503,{error:"disabled"});
 const token=req.headers.get("x-gf-sync-token")||"";
 if(token.length!==secret.length)return reply(401,{error:"unauthorized"});
 let diff=0;for(let i=0;i<secret.length;i++)diff|=token.charCodeAt(i)^secret.charCodeAt(i);
 if(diff)return reply(401,{error:"unauthorized"});
 let p;try{const raw=await req.text();if(raw.length>32768)return reply(413,{error:"size"});p=JSON.parse(raw);}catch{return reply(400,{error:"json"});}
 if(!p||typeof p!=="object")return reply(400,{error:"request"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(p.action==="health")return reply(200,{ok:true,mode:"production"});
 if(p.action==="claim"){
  const {data,error}=await db.rpc("gf_vehicle_save_claim");
  return error?reply(503,{error:"claim_unconfirmed"}):reply(200,{request:data});
 }
 if(p.action==="finish"){
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(p.request_id)||!uuid.test(p.lease)||!["replica_verified","conflict","reconciliation_required"].includes(p.state))return reply(400,{error:"invalid_finish"});
  const {data,error}=await db.rpc("gf_vehicle_save_finish",{p_request:p.request_id,p_lease:p.lease,p_state:p.state,p_fields:p.fields??null});
  return error?reply(503,{error:"finish_unconfirmed"}):reply(200,data);
 }
 return reply(400,{error:"action"});
});