/** Read-only three-sheet migration plan. Never log patches (private cell data). */
function GF3_MigrationPlan_(sources,targets){
 const norm=x=>x&&typeof x==='object'?{text:String(x.text||''),link:String(x.link||''),formula:String(x.formula||'')}:{text:String(x==null?'':x),link:'',formula:''};
 const index=(rows,key,re)=>{
  const map=new Map();
  for(const r of rows||[]){const id=String(r[key]||'').trim();if(!re.test(id)||map.has(id))throw Error('duplicate_or_invalid_id');map.set(id,r);}
  return map;
 };
 const src={
  v:index(sources.ledger,'VehicleID',/^V[0-9]{6}$/),
  status:index(sources.status,'VehicleID',/^V[0-9]{6}$/),
  users:index(sources.users,'VehicleID',/^V[0-9]{6}$/),
  driver:index(sources.drivers,'DriverID',/^D[0-9]{6}$/)
 };
 const dest={v:index(targets.ledger,'VehicleID',/^V[0-9]{6}$/),driver:index(targets.drivers,'DriverID',/^D[0-9]{6}$/)};
 const routes={
  '車両フォルダ':[['v','車両フォルダ']],'📁 車両書類フォルダ':[['v','📁 車両書類フォルダ']],
  '📄 最新車両書類':[['v','📄 最新車両書類']],'📷車両状態フォルダ':[['status','📷車両状態フォルダ']],
  '🔧整備書類フォルダ':[['status','🔧整備書類フォルダ']],
  '前DriverID':[['v','前DriverID'],['users','前DriverID']],
  '前使用者 車両書類':[['v','前使用者 車両書類'],['users','前使用者 車両書類']]
 };
 const contacts=['フリガナ','電話番号','紹介元','契約者メールアドレス','緊急連絡先氏名','緊急連絡先メールアドレス'];
 for(const k of contacts)routes[k]=[['v',k],['driver',k]];
 routes['ドライバーステータス']=[['v','ドライバーステータス'],['driver','ステータス']];
 routes['ドライバー備考']=[['v','ドライバー備考'],['driver','備考']];
 const links=new Set(['車両フォルダ','📁 車両書類フォルダ','📄 最新車両書類','📷車両状態フォルダ','🔧整備書類フォルダ','前使用者 車両書類']);
 const patches=[],review=[],used=x=>!!(x.text||x.link||x.formula);
 const propose=(sheet,id,key,target,raw)=>{
  const choices=raw.map(norm).filter(used).filter((v,i,a)=>a.findIndex(x=>JSON.stringify(x)===JSON.stringify(v))===i);
  if(!choices.length)return;
  if(choices.length>1){review.push({sheet,id,key,reason:'source_conflict'});return;}
  const c=choices[0];
  if(links.has(key)){
   if(c.formula){review.push({sheet,id,key,reason:'formula_link'});return;}
   if(!c.link&&/^https:\/\/(drive|docs)\.google\.com\//.test(c.text))c.link=c.text;
   if(!/^https:\/\/(drive|docs)\.google\.com\/\S+$/.test(c.link)){review.push({sheet,id,key,reason:'unverified_link'});return;}
  }
  if(!target){review.push({sheet,id,key,reason:'missing_target'});return;}
  const old=norm(target[key]);
  if(used(old)){
   if(JSON.stringify(c)!==JSON.stringify(old)&&!(links.has(key)&&old.link===c.link))review.push({sheet,id,key,reason:'occupied'});
   return;
  }
  patches.push({sheet,id,key,cell:c});
 };
 for(const [id,v] of src.v){
  const driver=src.driver.get(String(v.DriverID||'').trim());
  for(const [key,paths] of Object.entries(routes)){
   const raw=paths.flatMap(([s,k])=>{const row=s==='driver'?driver:src[s].get(id);return row?[row[k]]:[];});
   propose('車両台帳',id,key,dest.v.get(id),raw);
  }
 }
 for(const [id,driver] of src.driver)for(const key of [...contacts,'ステータス','備考']){
  propose('ドライバーマスター',id,key,dest.driver.get(id),[driver[key]]);
 }
 for(const key of ['status','users'])for(const [id] of src[key])if(!src.v.has(id))review.push({sheet:'車両台帳',id,key:'VehicleID',reason:'unmatched_legacy'});
 return {patches,review,counts:{proposed:patches.length,review:review.length}};
}
