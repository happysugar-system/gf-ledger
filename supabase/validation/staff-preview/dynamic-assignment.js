/* Validation staff screen only. Credentials remain in the existing Supabase session. */
(() => {
  const endpoint='https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-assignment-dynamic-ui-test';
  const pending=new Map();
  const messages={
    assignment_review_required:'受付・車両・進捗を再確認してください。',
    stale_assignment:'台帳が更新されました。もう一度照合してください。',
    dynamic_assignment_not_enabled:'検証の書き込みは停止中です。',
    request_conflict:'同じ受付・ドライバー・車両に未完了の処理があります。',
    preview_not_configured:'検証GASの接続設定を確認してください。',
    preview_unavailable:'検証GASの読み取り接続を確認してください。',
  };
  const states={
    pending:'受付済み。GASによる保存待ちです。',
    processing:'保存・同期を処理中です。',
    verified:'台帳保存とSupabase反映を確認しました。',
    reconciliation_required:'台帳または同期の状態を確認してください。再登録は保留です。',
    rejected:'保存前の照合で停止しました。',
  };
  window.gfDynamicAssignmentPanel=({fields,receiptId,driverId,session,isCurrent})=>{
    if(!receiptId||!/^D\d{6}$/.test(driverId))return;
    const section=document.createElement('section');
    section.className='item';
    const title=document.createElement('h4');
    title.textContent='車両割当（検証）';
    const select=document.createElement('select');
    select.setAttribute('aria-label','操作');
    for(const [value,label] of [['assign','割当'],['cancel','取消']]){
      const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
    }
    const vehicle=document.createElement('input');
    vehicle.placeholder='検証車両ID（例 V900004）';
    vehicle.setAttribute('aria-label','検証車両ID');
    const check=document.createElement('button');
    const save=document.createElement('button');
    const status=document.createElement('button');
    const note=document.createElement('p');
    note.setAttribute('role','status');
    for(const [button,label] of [[check,'台帳を照合'],[save,'保存を受け付ける'],[status,'処理状況を確認']]){
      button.type='button';button.className='btn';button.textContent=label;
    }
    section.append(title,select,vehicle,check,save,status,note);
    fields.append(section);
    let draft=null,busy=false;
    const refresh=()=>{
      const current=pending.get(receiptId);
      select.disabled=vehicle.disabled=check.disabled=busy||!!current;
      save.disabled=busy||!draft||(!!current&&current.enqueued);
      status.disabled=busy||!current;
    };
    const current=pending.get(receiptId);
    if(current){
      vehicle.value=current.vehicle_id;
      select.value=current.action;
      if(!current.enqueued)draft=current;
    }
    const api=async payload=>{
      const token=await session();
      if(!token)throw Error('ログインの有効期限が切れました。');
      const response=await fetch(endpoint,{method:'POST',headers:{
        authorization:'Bearer '+token,'content-type':'application/json',
      },body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Object.assign(Error(messages[data.error]||'処理結果を確認できません。'),{code:response.status});
      return data;
    };
    const run=async work=>{
      if(busy||!isCurrent())return;
      busy=true;refresh();
      try{await work();}catch(e){if(isCurrent())note.textContent=e.message;}
      finally{busy=false;refresh();}
    };
    const display=out=>{
      if(isCurrent())note.textContent=states[out.state]||'処理状況を確認できません。';
      if(['verified','rejected'].includes(out.state)){pending.delete(receiptId);draft=null;}
    };
    const invalidate=()=>{draft=null;note.textContent='';refresh();};
    vehicle.oninput=select.onchange=invalidate;
    check.onclick=()=>run(async()=>{
      draft=null;
      const id=vehicle.value.trim().toUpperCase();
      const operation=select.value;
      if(!/^V9\d{5}$/.test(id))throw Error('V9で始まる検証車両IDを入力してください。');
      const target={receipt_id:receiptId,driver_id:driverId,vehicle_id:id};
      const result=await api({action:'version',operation,...target});
      if(!isCurrent())return;
      draft={...target,action:operation,expected_version:result.version,request_id:crypto.randomUUID()};
      note.textContent='台帳を照合しました。内容を確認して保存を受け付けてください。';
    });
    save.onclick=()=>run(async()=>{
      if(!draft)return;
      const operation=draft;
      pending.set(receiptId,operation);
      try{
        const result=await api(operation);
        operation.enqueued=true;
        display(result);
      }catch(e){
        if([400,401,403,409].includes(e.code)){
          pending.delete(receiptId);
          draft=null;
        }
        throw e;
      }
    });
    status.onclick=()=>run(async()=>{
      const operation=pending.get(receiptId);
      if(!operation)return;
      display(await api({action:'status',request_id:operation.request_id}));
    });
    refresh();
  };
})();
