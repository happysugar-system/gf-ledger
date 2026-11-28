Deno.serve(async req=>{
 const reply=(data:unknown,status=200)=>Response.json(data,{status});
 if(req.method!=="POST")return reply({error:"method"},405);
 const secret=Deno.env.get("GF3_SYNC_TEST_TOKEN")||"",token=req.headers.get("x-gf3-sync-token")||"";
 if(secret.length<32||token.length!==secret.length)return reply({error:"unauthorized"},401);
 let diff=0;for(let i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^token.charCodeAt(i);
 if(diff)return reply({error:"unauthorized"},401);
 try{
 const b=await req.json();
 if(b.action==="health")return reply({ok:true});
 const id=String(b.id||"");
 if(!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(id))return reply({error:"id"},400);
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),base=Deno.env.get("SUPABASE_URL");
 if(!service||!base)return reply({error:"configuration"},503);
 const headers={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"return=representation"};
 let path="/rest/v1/gf3_document_receipts_test?receipt_id=eq."+id,method="GET",body:unknown;
 if(b.action==="insert"){
 const row=b.row||{},keys=["receipt_id","vehicle_id","driver_id","kind","previous_url","new_url","drive_file_id"];
 const url=/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)(?:\/view)?$/;
 if(Object.keys(row).some(k=>!keys.includes(k))||row.receipt_id!==id||!/^V9\d{5}$/.test(row.vehicle_id||"")||row.kind!=="車両書類"||(row.driver_id!=null&&!/^D9\d{5}$/.test(row.driver_id))||typeof row.previous_url!=="string"||(row.previous_url!==""&&!url.test(row.previous_url))||row.new_url!=null||row.drive_file_id!=null)return reply({error:"row"},400);
 path="/rest/v1/gf3_document_receipts_test";method="POST";body=row;
 }else if(b.action==="attach"){
 if(typeof b.fileId!=="string"||!/^[A-Za-z0-9_-]+$/.test(b.fileId))return reply({error:"file"},400);
 path="/rest/v1/rpc/gf3_document_attach_test";method="POST";body={p_id:id,p_file:b.fileId};
 }else if(b.action==="transition"){
 if(typeof b.expected!=="string"||typeof b.next!=="string")return reply({error:"state"},400);
 path="/rest/v1/rpc/gf3_document_transition_test";method="POST";body={p_id:id,p_expected:b.expected,p_next:b.next};
 }else if(b.action!=="read")return reply({error:"action"},400);
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)return reply({error:r.status===409?"conflict":"storage"},r.status===409?409:502);
 return reply({ok:true,data:await r.json()});
 }catch{return reply({error:"request"},400);}
});