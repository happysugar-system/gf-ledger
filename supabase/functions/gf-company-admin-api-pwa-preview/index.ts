import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const origin="https://happysugar-system.github.io";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"content-type,apikey,authorization","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const out=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const clean=(v:unknown,max=100)=>typeof v==="string"?v.trim().slice(0,max):"";
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return out(405,{error:"Method not allowed"});
 if(req.headers.get("Origin")!==origin)return out(403,{error:"Origin denied"});
 try{
 const body=await req.json(),action=body.action;
 const channel=Deno.env.get("GF_DEMO_LINE_LOGIN_CHANNEL_ID");
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!channel||!url||!key)return out(503,{error:"Server configuration missing"});
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let lineUserId="";
 if(typeof body.device_session_token==="string"){
  if(!/^[a-f0-9]{64}$/i.test(body.device_session_token))return out(401,{error:"Invalid session"});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body.device_session_token))),v=>v.toString(16).padStart(2,"0")).join("");
  const {data:session,error:sessionError}=await sb.from("gf_company_admin_device_sessions")
   .select("line_user_id").eq("token_hash",hash).is("revoked_at",null)
   .gt("expires_at",new Date().toISOString()).maybeSingle();
  if(sessionError)return out(503,{error:"Session validation unavailable"});
  if(!session)return out(401,{error:"Session expired"});
  lineUserId=session.line_user_id;
 }else{
  const token=body.line_id_token;
  if(typeof token!=="string"||token.length<100||token.length>8192)return out(401,{error:"LINE login required"});
  const verify=await fetch("https://api.line.me/oauth2/v2.1/verify",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({id_token:token,client_id:channel}),signal:AbortSignal.timeout(10000)
  });
  if(!verify.ok)return out(401,{error:"LINE verification failed"});
  const identity=await verify.json();
  if(identity.iss!=="https://access.line.me"||identity.aud!==channel||!/^U[0-9a-f]{32}$/i.test(identity.sub||"")||!Number.isFinite(identity.exp)||identity.exp<=Date.now()/1000)return out(401,{error:"Invalid LINE identity"});
  lineUserId=identity.sub;
 }
 const {data:admin,error:authError}=await sb.from("gf_company_admin_identities").select("role,active").eq("line_user_id",lineUserId).maybeSingle();
 if(authError)return out(503,{error:"Admin authorization unavailable"});
 if(!admin?.active)return out(403,{error:"管理者権限がありません"});
 const manager=admin.role==="owner"||admin.role==="manager";
 if(!manager)return out(403,{error:"Access denied"});
 const query=async(table:string,columns:string,limit=300)=>{const {data,error}=await sb.from(table).select(columns).limit(limit);if(error)throw error;return data;};
 if(action==="dashboard"){
 const [companies,requests,members,vehicles]=await Promise.all([
 query("gf_company_portal_companies","id,company_name"),
 query("gf_company_line_member_requests","id,company_id,requested_company_name,representative_name,phone,status,created_at",300),
 query("gf_company_line_members","company_id,representative_name,phone,active,created_at",300),
 query("gf_company_portal_vehicles","company_id,vehicle_id,vehicle_number,status",500)
 ]);
 return out(200,{role:admin.role,companies,requests,members,vehicleCounts:Object.entries(vehicles.reduce((a:Record<string,number>,v:any)=>(a[v.company_id]=(a[v.company_id]||0)+1,a),{})).map(([company_id,count])=>({company_id,count}))});
 }
 if(action==="create_invite"){
 if(!uuid(body.company_id))return out(400,{error:"法人が正しくありません"});
 const {data:company,error:companyError}=await sb.from("gf_company_portal_companies").select("id,company_name").eq("id",body.company_id).maybeSingle();
 if(companyError)throw companyError;if(!company)return out(404,{error:"法人が見つかりません"});
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 const secret=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 const {error}=await sb.from("gf_company_line_invites").insert({company_id:company.id,token_hash:hash,expires_at:new Date(Date.now()+24*3600*1000).toISOString(),max_uses:1,created_by:lineUserId});
 if(error)throw error;
 return out(200,{company_name:company.company_name,invite_url:"https://happysugar-system.github.io/gf-ledger/company-admin/member-apply.html?invite="+secret,expires_hours:24});
 }
 if(action==="create_company"){
 const company_name=clean(body.company_name,120);
 if(company_name.length<2)return out(400,{error:"会社名を入力してください"});
 const {data:exists,error:readError}=await sb.from("gf_company_portal_companies").select("id").eq("company_name",company_name).limit(1);
 if(readError)throw readError;
 if(exists?.length)return out(409,{error:"同名の法人が登録済みです"});
 const {data,error}=await sb.from("gf_company_portal_companies").insert({company_name}).select("id,company_name").single();
 if(error)throw error;
 return out(200,{company:data});
 }
 if(action==="review_request"){
 if(!uuid(body.request_id)||!["approved","rejected"].includes(body.decision))return out(400,{error:"Invalid request"});
 const {data:request,error:readError}=await sb.from("gf_company_line_member_requests").select("*").eq("id",body.request_id).eq("status","pending").maybeSingle();
 if(readError)throw readError;
 if(!request)return out(409,{error:"申請はすでに処理済みです"});
 if(body.decision==="approved"){
 if(!uuid(body.approved_company_id))return out(400,{error:"承認先の法人を選択してください"});
 const {data:target,error:targetError}=await sb.from("gf_company_portal_companies").select("id").eq("id",body.approved_company_id).maybeSingle();
 if(targetError)throw targetError;
 if(!target)return out(400,{error:"承認先法人が存在しません"});

 const {data:member,error:memberError}=await sb.from("gf_company_line_members").select("company_id").eq("line_user_id",request.line_user_id).maybeSingle();
 if(memberError)throw memberError;
 if(member&&member.company_id!==body.approved_company_id)return out(409,{error:"このLINEアカウントは別法人に登録されています"});
 const {error:saveError}=await sb.from("gf_company_line_members").upsert({line_user_id:request.line_user_id,company_id:body.approved_company_id,representative_name:request.representative_name,phone:request.phone,active:true},{onConflict:"line_user_id"});
 if(saveError)throw saveError;
 }
 const {error:updateError}=await sb.from("gf_company_line_member_requests").update({company_id:body.decision==="approved"?body.approved_company_id:request.company_id,status:body.decision,reviewed_at:new Date().toISOString(),reviewed_by:lineUserId}).eq("id",body.request_id).eq("status","pending");
 if(updateError)throw updateError;
 return out(200,{ok:true});
 }
 if(action==="set_member_active"){
 if(!["owner","manager"].includes(admin.role)||typeof body.active!=="boolean"||!/^U[0-9a-f]{32}$/i.test(body.member_line_id||""))return out(400,{error:"Invalid member"});
 const {error}=await sb.from("gf_company_line_members").update({active:body.active}).eq("line_user_id",body.member_line_id);
 if(error)throw error;
 return out(200,{ok:true});
 }
 return out(400,{error:"Unknown action"});
 }catch(e){console.error("company admin action error",e instanceof Error?e.message:String(e));return out(503,{error:"処理に失敗しました。管理者に連絡してください"});}
});