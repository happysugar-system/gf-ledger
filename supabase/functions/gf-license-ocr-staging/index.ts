// GOLD FIRST: isolated license OCR staging function.
// No writes to production tables, Sheets, Drive or LINE identity mappings.
// Deploy ONLY to a dedicated test Supabase project after configuring secrets.
// Auth: verified Supabase JWT. Never expose GEMINI_API_KEY in browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status:number, value:unknown) => new Response(JSON.stringify(value),{
 status, headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
Deno.serve(async (req:Request)=>{
 if(req.method!=="POST") return json(405,{error:"POST only"});
 const started=Date.now();
 try {
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_ANON_KEY");
  const geminiKey=Deno.env.get("GEMINI_API_KEY");
  const model=Deno.env.get("GF_GEMINI_MODEL");
  if(!url||!key||!geminiKey||!model) return json(503,{error:"Test environment not configured"});
  const token=req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if(!token) return json(401,{error:"Login required"});
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await sb.auth.getUser(token);
  if(error||!user?.id||!user.email_confirmed_at) return json(401,{error:"Verified login required"});
  // Require an explicit staging allowlist, never use this endpoint as an open OCR service.
  const allowed=(Deno.env.get("GF_OCR_TEST_USER_IDS")||"").split(",").map(s=>s.trim());
  if(!allowed.includes(user.id)) return json(403,{error:"Not a staging tester"});
  const body=await req.json();
  const mime=body?.mime_type;
  const image=body?.image_base64;
  if(!["image/jpeg","image/png","image/webp"].includes(mime)||typeof image!=="string"||
     image.length>5_500_000||image.length<100||!/^[A-Za-z0-9+/=]+$/.test(image))
    return json(400,{error:"Invalid image"});
  const prompt=`日本の運転免許証の表面から氏名欄の氏名のみを読み取ってください。推測せず、旧字体を変更せず、姓と名の間は半角スペース1個。判読できなければ空文字。JSON形式で {"full_name":""} を返す。`;
  const aiStarted=Date.now();
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
    method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":geminiKey},
    body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inline_data:{mime_type:mime,data:image}}]}],
      generationConfig:{responseMimeType:"application/json",temperature:0}}),
    signal:AbortSignal.timeout(30000)
  });
  const aiMs=Date.now()-aiStarted;
  if(!response.ok) return json(502,{error:"OCR service unavailable",ai_ms:aiMs,total_ms:Date.now()-started});
  const data=await response.json();
  const raw=data?.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||"").join("")||"";
  let parsed:{full_name?:unknown};
  try { parsed=JSON.parse(raw); } catch {return json(502,{error:"Invalid OCR response",ai_ms:aiMs});}
  const name=typeof parsed.full_name==="string"?parsed.full_name.trim().slice(0,80):"";
  return json(200,{full_name:name,readable:!!name,verified_identity:false,
    ai_ms:aiMs,total_ms:Date.now()-started});
 }catch(_e){return json(503,{error:"OCR test failed",total_ms:Date.now()-started});}
});
