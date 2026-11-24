
export async function mountAssignment(root, payload, onVerified) {
  root.replaceChildren();
  const form=document.createElement('form');
  form.innerHTML='<label>テスト用メール<input type="email" required autocomplete="username"></label><label>パスワード<input type="password" required autocomplete="current-password"></label><button>ログインして割当保存</button><button type="button" data-check>保存状況を確認</button><p role="status"></p>';
  root.append(form);
  const [email,password]=form.querySelectorAll('input'), msg=form.querySelector('p');
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
  const url='https://zwprphmfgobkektzsuti.supabase.co', key='sb_publishable__wtlccECQwOVd3-LvRVFYQ_2dCUlPVR';
  const client=createClient(url,key,{auth:{persistSession:false}});
  let user,busy=false;
  const storageKey=()=> 'gf-assignment-demo:'+user.id+':'+payload.waiting_id;
  async function api(action,id){
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw Error('ログインしてください');
    const r=await fetch(url+'/functions/v1/gf-assignment-demo-save',{method:'POST',headers:{authorization:'Bearer '+session.access_token,apikey:key,'content-type':'application/json'},body:JSON.stringify({...payload,request_id:id,action}),signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error(r.status===409?'すでに割当が予約されています。':r.status===403?'編集権限がありません。':'受付結果を確認できません。再ログインして同じ操作をお試しください。');
    return r.json();
  }
  async function check(id){
    const r=await api('status',id);
    if(r.state==='replica_verified'&&r.verified_at&&r.vehicle_id===payload.vehicle_id&&r.waiting_id===payload.waiting_id&&r.driver_id===payload.driver_id){msg.textContent='スプレッドシート保存・Supabase反映を確認しました。';onVerified();return;}
    msg.textContent='受付状態：'+({pending:'スプレッドシート反映待ち',sheet_saved:'Supabase反映待ち',rejected:'拒否',reconciliation_required:'管理者確認が必要'}[r.state]||'確認待ち');
  }
  async function run(fn){if(busy)return;busy=true;try{await fn()}catch(e){msg.textContent=e.message}finally{busy=false}}
  form.onsubmit=e=>{e.preventDefault();run(async()=>{const r=await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});password.value='';if(r.error)throw Error('ログインできません');user=r.data.user;let id=localStorage.getItem(storageKey());if(!id){id=crypto.randomUUID();localStorage.setItem(storageKey(),id)}await api('save',id);await check(id)})};
  form.querySelector('[data-check]').onclick=()=>run(async()=>{if(!user)throw Error('ログインしてください');const id=localStorage.getItem(storageKey());if(!id)throw Error('受付がありません');await check(id)});
}
