/** GOLD FIRST / 27_スマホ保存書類閲覧.gs
 * 保存済みリンクをスマホへ返す読み取り専用処理。
 * フォルダ作成・画像削除・台帳更新・共有権限変更は行わない。
 */
function GF_スマホ車両の保存書類を取得する_27(VehicleID){
  const id=String(VehicleID||'').trim();
  if(!id)throw new Error('車両を選択してください。');
  const ss=対象スプレッドシートを開く_();
  const ledger=GF_閲覧行を取得する_27(ss,シート名.車両台帳,'VehicleID',id,true);
  const status=GF_閲覧行を取得する_27(ss,シート名.車両状況,'VehicleID',id,false);
  const user=GF_閲覧行を取得する_27(ss,シート名.利用者管理,'VehicleID',id,false);
  const result={成功:true,表示名:[ledger.data['管轄'],ledger.data['車番'],ledger.data['現在使用者']].filter(Boolean).join(' ｜ '),車両書類:[],整備書類:[],車両状態:[],免許証:[]};
  const add=(key,label,url)=>{
    url=GF_閲覧URLを確認する_27(url);
    if(url&&!result[key].some(x=>x.URL===url))result[key].push({表示名:label,URL:url});
  };
  const cell=(row,header)=>row?row.links[header]||'':'';
  add('整備書類','整備書類フォルダ',cell(status,'🔧整備書類フォルダ'));
  add('車両状態','最新の車両状態写真',cell(user,'最新 車両状態写真'));
  add('車両状態','前回の車両状態写真',cell(user,'前回 車両状態写真')||cell(status,'📷前回車両状態フォルダ'));
  add('車両状態','車両状態写真フォルダ',cell(status,'📷車両状態フォルダ'));
  // 基本書類リンク列がない台帳にも対応。保存済み車両フォルダの直下だけを探す。
  const vehicleURL=cell(ledger,'車両フォルダ');
  const folderMatch=vehicleURL.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if(folderMatch){
    try{
      const root=DriveApp.getFolderById(folderMatch[1]);
      if(!root.isTrashed()){
        const groups=[['整備書類','整備書類','整備書類フォルダ'],['車両状態','車両状態画像','車両状態写真フォルダ']];
        groups.forEach(([key,name,label])=>{
          const it=root.getFoldersByName(name);let count=0;
          while(it.hasNext()&&count++<10){const f=it.next();if(!f.isTrashed())add(key,label,f.getUrl());}
        });
      }
    }catch(e){console.warn('保存済み車両フォルダの閲覧補助に失敗 / VehicleID='+id);}
  }
  // 車両書類はDriverIDや現在使用者リンク列に依存せず、車両単位で最新を1つ返す。
  const documentURL=GF_最新車両PDFを探す_28(GF_車両書類フォルダを探す_28(id));
  result.車両書類=documentURL?[{表示名:'最新の車両書類を開く',URL:documentURL}]:[];
  const driver=String(ledger.data['DriverID']||'').trim();
  if(driver){
    const master=GF_閲覧行を取得する_27(ss,シート名.ドライバーマスター,'DriverID',driver,false);
    if(master)add('免許証',(master.data['氏名']||'現在使用者')+'の免許証',cell(master,'🪪免許証フォルダ'));
  }
  return result;
}
function GF_スマホドライバーの保存免許証を取得する_27(DriverID){
  const id=String(DriverID||'').trim();
  if(!id)throw new Error('ドライバーを選択してください。');
  const row=GF_閲覧行を取得する_27(対象スプレッドシートを開く_(),シート名.ドライバーマスター,'DriverID',id,true);
  const url=GF_閲覧URLを確認する_27(row.links['🪪免許証フォルダ']);
  return {成功:true,表示名:row.data['氏名']||id,免許証:url?[{表示名:'免許証を開く',URL:url}]:[]};
}
function GF_閲覧行を取得する_27(ss,name,idHeader,id,required){
  const sheet=ss.getSheetByName(name);
  if(!sheet){if(required)throw new Error('対象の管理シートがありません。');return null;}
  const rows=sheet.getDataRange().getDisplayValues();
  const heads=(rows[0]||[]).map(v=>String(v||'').trim()),col=heads.indexOf(idHeader);
  if(col<0){if(required)throw new Error('対象ID列がありません。');return null;}
  const matches=[];rows.forEach((r,i)=>{if(i>0&&String(r[col]||'').trim()===id)matches.push(i);});
  if(matches.length>1)throw new Error('対象IDが重複しています。管理担当者に確認してください。');
  if(!matches.length){if(required)throw new Error('対象が見つかりません。');return null;}
  const i=matches[0],range=sheet.getRange(i+1,1,1,heads.length);
  const rich=range.getRichTextValues()[0],formulas=range.getFormulas()[0],data={},links={};
  heads.forEach((h,n)=>{
    if(!h)return;data[h]=rows[i][n];
    let url=GF_閲覧URLを確認する_27(rows[i][n]);
    if(!url&&rich[n]){
      url=GF_閲覧URLを確認する_27(rich[n].getLinkUrl());
      if(!url){const runs=rich[n].getRuns();for(let j=0;j<runs.length&&!url;j++)url=GF_閲覧URLを確認する_27(runs[j].getLinkUrl());}
    }
    if(!url){const m=String(formulas[n]||'').match(/^=HYPERLINK\(\s*"([^"]+)"/i);if(m)url=GF_閲覧URLを確認する_27(m[1]);}
    if(url)links[h]=url;
  });
  return {data:data,links:links};
}
function GF_閲覧URLを確認する_27(value){
  const url=String(value||'').trim();
  return /^https:\/\/(?:drive|docs)\.google\.com\//i.test(url)?url:'';
}

