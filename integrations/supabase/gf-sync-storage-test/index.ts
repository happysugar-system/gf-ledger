Deno.serve(async req=>{
 const reply=(data:unknown,status=200)=>Response.json(data,{status});
 if(req.method!=="POST")return reply({error:"method"},405);
 const secret=Deno.env.get("GF_ACTUAL_TEST_TOKEN")||"", token=req.headers.get("x-gf-actual-token")||"";
 if(secret.length<32||token.length!==secret.length)return reply({error:"unauthorized"},401);
 let diff=0;for(let i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^token.charCodeAt(i);
 if(diff)return reply({error:"unauthorized"},401);
 try{
 const b=await req.json();
 if(b.action==="health")return reply({ok:true});
 if(b.action==="candidates"){
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!service)return reply({error:"configuration"},503);
 const r=await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/rpc/gf_assignment_candidates_test",{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},body:"{}"});
 if(!r.ok)return reply({error:"candidates"},502);
 return reply({ok:true,data:await r.json()});
 }
 const tables={history:"gf_line_driver_sync_history_test",queue:"gf_assignment_sync_queue_test"} as const;
 if(b.kind!=="history"&&b.kind!=="queue")return reply({error:"kind"},400);
 const table=tables[b.kind as keyof typeof tables];
 const key=b.kind==="history"?"receipt_key":"request_id";
 const id=String(b.id||"");
 if(b.kind==="history"?!/^[a-f0-9]{64}$/.test(id):!/^TEST-[A-Z0-9-]{1,64}$/.test(id))return reply({error:"id"},400);
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!service)return reply({error:"configuration"},503);
 const headers={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"return=representation"};
 let method="GET",body:unknown,filter="?"+key+"=eq."+id;
 if(b.action==="transition"&&b.kind==="queue"){
 const r=await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/rpc/gf_assignment_transition_test",{method:"POST",headers,body:JSON.stringify({p_id:id,p_expected:b.expected,p_next:b.next,p_result:b.result??null})});
 if(!r.ok)return reply({error:"transition"},502);
 return reply({ok:true,data:await r.json()});
 }else if(b.action==="insert"){
 const row=b.row||{};
 const fields=b.kind==="history"?["receipt_key","receipt_number","line_receipt_id","state","driver_id","processed_at","notes"]:["request_id","requested_at","vehicle_id","operation","driver_id","state","attempts","last_run_at","result"];
 if(Object.keys(row).some(k=>!fields.includes(k))||row[key]!==id||!/^D999[0-9]{3}$/.test(row.driver_id||""))return reply({error:"row"},400);
 if(b.kind==="history"&&!/^TEST-/.test(row.line_receipt_id||""))return reply({error:"receipt"},400);
 if(b.kind==="queue"&&!/^V9[0-9]{5}$/.test(row.vehicle_id||""))return reply({error:"vehicle"},400);
 method="POST";body=row;filter="";
 }else if(b.action!=="read")return reply({error:"action"},400);
 const r=await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/"+table+filter,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)return reply({error:r.status===409?"duplicate":"storage"},r.status===409?409:502);
 return reply({ok:true,data:await r.json()});
 }catch{return reply({error:"request"},400);}
});