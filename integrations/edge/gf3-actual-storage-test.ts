import {createClient} from "npm:@supabase/supabase-js@2.49.4";
Deno.serve(async req=>{
 const reply=(status:number,data:unknown)=>Response.json(data,{status});
 const token=Deno.env.get("GF3_SYNC_TEST_TOKEN")||"";
 if(req.method!=="POST"||token.length<32||req.headers.get("x-gf3-sync-token")!==token)return reply(403,{ok:false});
 try{
 const p=await req.json();
 if(p.action==="health")return reply(200,{ok:true});
 if(!/^TEST-GF3-[A-Z0-9-]{1,70}$/.test(p.id||""))return reply(400,{ok:false});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const table=db.from("gf3_actual_receipts_test");
 let result;
 if(p.action==="read")result=await table.select("*").eq("receipt_id",p.id).maybeSingle();
 else if(p.action==="insert"){
 const r=p.row;
 if(!r||!["納車完了","返却完了"].includes(r.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(r.actual_date)||!r.before_data||!r.after_data)return reply(400,{ok:false});
 result=await table.insert({receipt_id:p.id,vehicle_id:"V900005",driver_id:"D999902",application_id:"2",kind:r.kind,actual_date:r.actual_date,before_data:r.before_data,after_data:r.after_data}).select("receipt_id").single();
 }else if(p.action==="transition")result=await db.rpc("gf3_actual_transition_test",{p_id:p.id,p_from:p.expected,p_to:p.next});
 else return reply(400,{ok:false});
 if(result.error)return reply(409,{ok:false});
 return reply(200,{ok:true,data:result.data});
 }catch{return reply(400,{ok:false});}
});
