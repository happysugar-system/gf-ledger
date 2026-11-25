import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const file = new URL('../supabase/functions/gf-line-reception-admin/index.ts', import.meta.url);
const source = stripTypeScriptTypes(readFileSync(file, 'utf8').replace(/^import[^\n]+\n/, ''));

async function check({bearer='valid', access={enabled:true, role:'staff'}, confirmed='D123456', authError=false}={}) {
  let handler;
  let requests=0;
  const rows=[
    [['受付ID','受付種別','DriverID'], ['R04','車両依頼','D123456']],
    [['LINE受付ID','受付識別子','確認DriverID','書類状態'], ['R04','a'.repeat(64),confirmed,'保存完了']],
  ];
  const db={
    auth:{getUser:async()=>({data:{user:authError?null:{email:'staff@example.invalid'}},error:authError})},
    from(table) {
      assert.equal(table,'gf_reception_access');
      return {select:()=>({eq:()=>({maybeSingle:async()=>({data:access})})})};
    },
  };
  runInNewContext(source,{
    Deno:{serve:f=>{handler=f;},env:{get:()=> 'configured'}},
    createClient:()=>db, Response, console:{warn(){}},
    URLSearchParams, TextEncoder, btoa, atob,
    JSON:{...JSON, stringify:JSON.stringify,parse:()=>({client_email:'test',private_key:'YQ=='})},
    crypto:{subtle:{importKey:async()=>({}),sign:async()=>new Uint8Array([1])}},
    fetch:async(url, options)=>{
      requests++;
      if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'mock'});
      assert.equal(options.method,'GET');
      return Response.json({values:rows[requests-2]});
    },
  });
  const headers={origin:'https://happysugar-system.github.io'};
  if(bearer)headers.authorization='Bearer '+bearer;
  const response=await handler(new Request('https://example.invalid',{
    method:'POST',headers,body:JSON.stringify({action:'waiting_registration_check',receipt_id:'R04'}),
  }));
  return {status:response.status,requests,body:await response.json()};
}

test('未認証・無効セッション・権限なしはSheetsにアクセスしない', async()=>{
  for(const [options,status] of [[{bearer:''},401],[{authError:true},401],
    [{access:null},403],[{access:{enabled:false,role:'owner'}},403],
    [{access:{enabled:true,role:'other'}},403]]) {
    const result=await check(options);
    assert.equal(result.status,status);
    assert.equal(result.requests,0);
  }
});

test('許可済みスタッフの一致する受付は読取照合のみで成功する', async()=>{
  assert.deepEqual(await check(),{status:200,requests:3,body:{受付照合:true}});
  assert.equal((await check({confirmed:'D000001'})).status,409);
});
