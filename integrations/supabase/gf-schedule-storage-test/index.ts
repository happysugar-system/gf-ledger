import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async(req)=>{
 const reply=(data:unknown,status=200)=>Response.json(data,{status});
 const token=Deno.env.get("GF_ACTUAL_TEST_TOKEN")||"";
 if(req.method!=="POST"||token.length<32||req.headers.get("x-gf-actual-token")!==token)return reply({ok:false},403);
 try{
 const b=await req.json();
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 if(b.action==="health")return reply({ok:true});
 if(b.action==="read"){
 const {data,error}=await db.from("gf_schedule_test").select("*").order("schedule_id").limit(1000);
 if(error)throw error;
 return reply({ok:true,data});
 }
 if(b.action!=="import"||!Array.isArray(b.rows)||b.rows.length<1||b.rows.length>100)return reply({ok:false},400);
 const keys=["schedule_id","vehicle_id","schedule_type","schedule_date","state","calendar_name","calendar_event_id","source_data"];
 for(const r of b.rows){
 if(!r||Object.keys(r).some(k=>!keys.includes(k))||!/^TEST-SCHEDULE-\d+$/.test(r.schedule_id)||!(r.vehicle_id===null?r.schedule_type==="シフト":/^V9\d{5}$/.test(r.vehicle_id))||!r.source_data||typeof r.source_data!=="object"||Array.isArray(r.source_data))return reply({ok:false},400);
 }
 const {error}=await db.from("gf_schedule_test").insert(b.rows);
 if(error)return reply({ok:false,error:"insert_rejected"},409);
 return reply({ok:true,count:b.rows.length});
 }catch{return reply({ok:false,error:"request_failed"},500);}
});