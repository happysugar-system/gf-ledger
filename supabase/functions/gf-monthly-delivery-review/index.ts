import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const ORIGIN="https://happysugar-system.github.io";
const CORS={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const respond=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const enc=(s:string)=>btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const bytes=(v:Uint8Array)=>enc(String.fromCharCode(...v));
async function googleToken(){
 const raw=Deno.env.get("GF_GOOGLE_SERVICE_ACCOUNT_JSON");
 if(!raw)throw Error("sheets_adapter_not_configured");
 const sa=JSON.parse(raw);
 if(!sa.client_email||!sa.private_key)throw Error("sheets_adapter_not_configured");
 const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const header=enc(JSON.stringify({alg:"RS256",typ:"JWT"}));
 const payload=enc(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500}));
 const input=header+"."+payload;
 const signature=bytes(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(input))));
 const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:input+"."+signature})});
 if(!res.ok)throw Error("google_auth_failed");
 const data=await res.json();return data.access_token as string;
}
async function completeDelivery(body:Record<string,unknown>,actor:string){
 const secret=Deno.env.get("GF_DELIVERY_BRIDGE_SECRET")||"";
 const target=Deno.env.get("GF_DELIVERY_BRIDGE_URL")||"";
 if(Deno.env.get("GF_DELIVERY_WRITE_ENABLED")!=="YES"||secret.length<32||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(target))return respond(503,{error:"delivery_write_not_configured"});
 const {receiptId,vehicleId,driverId,date}=body;
 if(typeof receiptId!=="string"||!receiptId.trim()||receiptId.length>160||typeof vehicleId!=="string"||!/^V\d+$/.test(vehicleId)||typeof driverId!=="string"||!/^D\d+$/.test(driverId)||typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return respond(400,{error:"invalid_delivery_request"});
 const payload=JSON.stringify({action:"delivery_complete",receiptId,vehicleId,driverId,date,actor,issuedAt:Date.now(),nonce:crypto.randomUUID()});
 const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=bytes(new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(payload))));
 let res=await fetch(target+"?gf_delivery_bridge=complete_v1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload,signature}),redirect:"manual",signal:AbortSignal.timeout(30000)});
 if([302,303].includes(res.status)){const next=new URL(res.headers.get("location")||"");if(next.protocol!=="https:"||next.hostname!=="script.googleusercontent.com")throw Error("invalid_bridge_redirect");res=await fetch(next,{redirect:"error",signal:AbortSignal.timeout(30000)});}
 const result=await res.json();
 if(!res.ok||result.status!=="verified")return respond(409,{error:"delivery_write_unconfirmed"});
 return respond(200,{status:"verified"});
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="POST")return respond(405,{error:"method_not_allowed"});
 if(req.headers.get("origin")!==ORIGIN){console.warn("gf_reception_access_denied","origin_not_allowed");return respond(403,{error:"origin_not_allowed"});}
 const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!bearer)return respond(401,{error:"authentication_required"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return respond(503,{error:"server_configuration_missing"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authErr}=await db.auth.getUser(bearer);
 if(authErr||!user)return respond(401,{error:"invalid_session"});
 const email=(user.email||"").trim().toLowerCase();
 const {data:access,error:accessErr}=await db.from("gf_reception_access").select("email,role,enabled").eq("email",email).maybeSingle();
 if(accessErr)return respond(503,{error:"authorization_unavailable"});
 if(!access?.enabled){console.warn("gf_reception_access_denied","not_authorized");return respond(403,{error:"not_authorized"});}
 if(!["owner","staff"].includes(access.role))return respond(403,{error:"not_authorized"});
 try{
 const raw=await req.text();
 if(raw.length>8192)return respond(413,{error:"request_too_large"});
 const body=raw.trim()?JSON.parse(raw):{};
 if(body.action==="delivery_complete")return await completeDelivery(body,user.id);
 if(body.action!==undefined&&body.action!=="read")return respond(400,{error:"invalid_action"});
 const token=await googleToken();
 const range="'月別納車管理'!A3:O3000";
 const res=await fetch("https://sheets.googleapis.com/v4/spreadsheets/17IzIUJeYQw3nO8GZsUSCgLfHVECNINZNkQdg38GW57o/values/"+encodeURIComponent(range),{headers:{Authorization:"Bearer "+token}});
 if(!res.ok)return respond(503,{error:"monthly_sheet_unavailable"});
 const rows=(await res.json()).values||[];
 const h=rows[0]||[];
 if(h[0]!=="対象月"||h[4]!=="納車予定日"||h[10]!=="実績日")return respond(409,{error:"monthly_headers_changed"});
 const summary=[["対象月","現在の納車予定","納車実績（暫定）"]];
 const details=[["対象月","区分","VehicleID","日付","DriverID","ドライバー名"]];
 for(const r of rows.slice(1)){
 if(r.some((v:unknown)=>typeof v==="string"&&/^#(REF!|ERROR!|VALUE!|N\/A|NUM!|DIV\/0!|NAME\?)/.test(v)))return respond(503,{error:"monthly_formula_error"});
 if(r[0])summary.push([r[0],r[1]||"0",r[2]||"0"]);
 for(const [i,kind] of [[4,"予定"],[10,"貸出開始実績（暫定）"]] as const){
 if(!r[i])continue;
 const d=String(r[i]);const m=d.match(/^(\d{4})[/-](\d{1,2})[/-]\d{1,2}$/);
 if(!m)return respond(409,{error:"monthly_date_invalid"});
 details.push([m[1]+"-"+m[2].padStart(2,"0"),kind,r[i+1]||"",d,r[i+2]||"",r[i+3]||""]);
 }}
 return respond(200,{summary,details});
 }catch{return respond(503,{error:"monthly_sheet_unavailable"});}
});