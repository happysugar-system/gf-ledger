import assert from 'node:assert/strict';
import {createHmac, webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const file=new URL('../supabase/validation/gf-line-reception-admin/index.ts',import.meta.url);
const source=stripTypeScriptTypes(readFileSync(file,'utf8').replace(/^import[^\n]+\n/,''));
const origin='https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site';
const book='12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8';
const gasUrl='https://script.google.com/macros/s/fixture/exec';
const secret='mock-validation-bridge-key-at-least-32-bytes';

function fixture({access={enabled:true,role:'staff'},confirmed='D999904',wrongBook=false}={}) {
  let handler;
  let calls=0;
  let registered=false;
  const env={
    SUPABASE_URL:'https://zwprphmfgobkektzsuti.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'fixture',
    GF_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'fixture@example.invalid',private_key:'YQ=='}),
    GF_WAITING_REGISTER_ENABLED:'true',GF_WAITING_GAS_URL:gasUrl,GF_WAITING_GAS_SECRET:secret,
    GF_LINE_RECEPTION_SHEET_ID:wrongBook?'different-book':undefined,
  };
  const db={
    auth:{getUser:async()=>({data:{user:{email:'staff@example.invalid'}}})},
    from(name){
      assert.equal(name,'gf_reception_access');
      return {select:()=>({eq:()=>({maybeSingle:async()=>({data:access})})})};
    },
  };
  runInNewContext(source,{
    Deno:{serve:f=>{handler=f;},env:{get:name=>env[name]}},createClient:()=>db,
    Response,TextEncoder,URLSearchParams,btoa,atob,AbortSignal,console:{warn(){},error(){}},
    crypto:{subtle:{
      importKey:(format,...args)=>format==='pkcs8'?{}:webcrypto.subtle.importKey(format,...args),
      sign:(algorithm,...args)=>algorithm==='RSASSA-PKCS1-v1_5'?new Uint8Array([1]):webcrypto.subtle.sign(algorithm,...args),
    }},
    fetch:async(url, opts)=>{
      if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture'});
      if(url===gasUrl){
        const {action,receiptId,receiptKey,driverId,issuedAt,signature}=JSON.parse(opts.body);
        assert.equal(signature,createHmac('sha256',secret).update(JSON.stringify([action,receiptId,receiptKey,driverId,issuedAt])).digest('base64url'));
        assert.equal(driverId,'D999904');
        calls++;
        if(!registered){
          registered=true;
          throw new Error('simulated response timeout after commit');
        }
        return Response.json({status:200,state:'already_registered'});
      }
      assert.ok(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'+book+'/values/'));
      assert.equal(opts.method,'GET');
      const values=decodeURIComponent(url).includes('LINE受付管理')
        ?[['受付ID','受付種別','DriverID'],['TEST-R04','車両依頼','D999904']]
        :[['LINE受付ID','受付識別子','確認DriverID','書類状態'],['TEST-R04','d'.repeat(64),confirmed,'保存完了']];
      return Response.json({values});
    },
  });
  return {
    call:action=>handler(new Request('https://example.invalid',{method:'POST',
      headers:{origin,authorization:'Bearer test'},body:JSON.stringify({action,receipt_id:'TEST-R04'})})),
    gasCalls:()=>calls,
  };
}

test('配備版は権限なし403、受付不一致409、別ブック503で登録を呼ばない',async()=>{
  for(const [options,status] of [[{access:null},403],[{confirmed:'D999905'},409],[{wrongBook:true},503]]){
    const f=fixture(options);
    assert.equal((await f.call('waiting_register')).status,status);
    assert.equal(f.gasCalls(),0);
  }
});

test('署名を検証し、応答消失後に同一受付を再送して登録済みを返す',async()=>{
  const f=fixture();
  assert.equal((await f.call('waiting_register')).status,503);
  const retry=await f.call('waiting_register');
  assert.equal(retry.status,200);
  assert.deepEqual(await retry.json(),{登録状態:'already_registered'});
  assert.equal(f.gasCalls(),2);
});
