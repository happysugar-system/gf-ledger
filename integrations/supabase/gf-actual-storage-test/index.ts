Deno.serve(async (req) => {
 const reply=(data:unknown,status=200)=>Response.json(data,{status});
 if(req.method!=="POST")return reply({error:"method"},405);
 const secret=Deno.env.get("GF_ACTUAL_TEST_TOKEN");
 const supplied=req.headers.get("x-gf-actual-token")||"";
 if(!secret||secret.length<32||supplied.length!==secret.length)return reply({error:"unauthorized"},401);
 let diff=0;for(let i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^supplied.charCodeAt(i);
 if(diff)return reply({error:"unauthorized"},401);
 try{
 const b=await req.json();
 if(b.action==="health")return reply({ok:true});
 if(b.receipt_id!=="TEST-RETURN-R005")return reply({error:"receipt_denied"},403);
 const base=Deno.env.get("SUPABASE_URL")+"/rest/v1/";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!key)return reply({error:"configuration"},503);
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
 const filter="?receipt_id=eq.TEST-RETURN-R005";
 let path="",method="GET",body:unknown;
 if(b.action==="queue")path="gf_actual_queue_test"+filter;
 else if(b.action==="history")path="gf_actual_history_test"+filter;
 else if(b.action==="transition"){
 path="rpc/gf_actual_transition_test";method="POST";
 body={p_receipt:b.receipt_id,p_expected:b.expected,p_next:b.next,p_detail:null};
 }else return reply({error:"action_denied"},400);
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)return reply({error:"storage_failed"},502);
 return reply({ok:true,data:await r.json()});
 }catch{return reply({error:"request_failed"},400);}
});