import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
const STAGES=["車両準備中","車両手配済み","名義変更前","名義変更中","名義変更済み"];
function dateValue(value:unknown):value is string{
 if(typeof value!=="string")return false;
 if(value==="")return true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return reply(405,{error:"method"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("GF_VEHICLE_DEMO_SYNC_TOKEN");
 if(url!=="https://zwprphmfgobkektzsuti.supabase.co"||!key||!secret||secret.length<32)return reply(503,{error:"configuration"});
 if(req.headers.get("x-gf-sync-token")!==secret)return reply(401,{error:"unauthorized"});
 let p;try{p=await req.json()}catch{return reply(400,{error:"json"})}
 if(p?.action==="health")return reply(200,{ok:true});
 if(p?.action!=="save")return reply(400,{error:"action"});
 const r=p.record;
 if(!r||typeof r!=="object"||Array.isArray(r))return reply(400,{error:"record"});
 const base={"VehicleID":"TEST-V01","車番":"TEST-001","区分/ステータス":"空車","車体番号":"TEST-VIN01","GPS有無":"FALSE","管轄":"テスト","更新日時":""};
 const assigned={"現在使用者":"テスト運転者A","DriverID":"D999901","所属会社名":"テスト法人","稼働エリア":"テスト地域"};
 const vacant={"現在使用者":"","DriverID":"","所属会社名":"","稼働エリア":""};
 const isAssigned=r.DriverID==="D999901";
 const stage=isAssigned?r["管理区分"]:"通常管理";
 if(isAssigned&&!STAGES.includes(stage))return reply(400,{error:"stage"});
 const a=r["納車可能日"]??"",b=r["納車確定日"]??"";
 if(!dateValue(a)||!dateValue(b)||(a&&b&&b<a)||(!isAssigned&&(a||b)))return reply(400,{error:"dates"});
 const expected={...base,...(isAssigned?assigned:vacant),"管理区分":stage,"納車可能日":a,"納車確定日":b};
 if(Object.keys(r).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>r[k]!==v))return reply(400,{error:"fixture_mismatch"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await db.from("gf_assignment_integration_replica_test")
   .update({record:expected,updated_at:new Date().toISOString()})
   .eq("vehicle_id","TEST-V01").select("vehicle_id,record").single();
 return result.error?reply(503,{error:"write_or_trigger",detail:result.error.code}):reply(200,result.data);
});