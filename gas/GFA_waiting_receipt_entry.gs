/** 名変待ちへの明示的な受付登録。スタッフ認証済みのサーバー処理からのみ呼ぶ内部関数。 */
function GFA_名変待ち受付登録_(receiptId,key){
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('GFA_WAITING_LINK_ENABLED')!=='true')throw Error('書込未承認');
 const vid=p.getProperty('GFA_APPROVED_BOOK_ID'),lid=p.getProperty('GFA_APPROVED_LINE_BOOK_ID');
 if(!vid||!lid||vid===lid)throw Error('接続先不正');
 receiptId=String(receiptId||'').trim();key=String(key||'').trim();
 if(!receiptId||!/^[a-f0-9]{64}$/i.test(key))throw Error('受付識別情報不正');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 const vehicle=SpreadsheetApp.openById(vid),line=SpreadsheetApp.openById(lid);
 const result=GFA_割当DriverIDを照合_(receiptId,'',{vehicle,line,waitingKey:key});
 if(result.state!=='resolved')return result;
 const driver=GFA_割当照合行_(vehicle.getSheetByName('ドライバーマスター'),'DriverID',result.driver_id,['氏名','所属会社名','稼働エリア','割当VehicleID']);
 const s=vehicle.getSheetByName('名変待ち管理'),rows=s.getDataRange().getDisplayValues();
 const headers=['受付ID','氏名','所属会社名','稼働エリア','希望日','ステータス','割当VehicleID','割当車番','受付日時','割当日時','備考','進捗','旧シート行','LINE受付ID','受付識別子','DriverID'];
 if(headers.some((v,i)=>rows[0][i]!==v||rows[0].filter(x=>x===v).length!==1))throw Error('列構成不一致');
 const matches=rows.slice(1).filter(r=>r[13]===receiptId||r[14]===key);
 if(matches.length){if(matches.length===1&&matches[0][13]===receiptId&&matches[0][14]===key&&matches[0][15]===result.driver_id)return {state:'already_registered',id:matches[0][0]};throw Error('受付重複・不一致');}
 if(driver['割当VehicleID'])throw Error('既存割当あり');
 const cars=vehicle.getSheetByName('車両台帳').getDataRange().getDisplayValues();
 const dc=cars[0].indexOf('DriverID');if(dc<0||cars[0].filter(x=>x==='DriverID').length!==1)throw Error('車両台帳DriverID列不正');
 if(cars.slice(1).some(r=>r[dc]===result.driver_id))throw Error('車両台帳に既存割当あり');
 if(rows.slice(1).some(r=>r[15]===result.driver_id||(!r[15]&&String(r[1]).normalize('NFKC').replace(/\s/g,'')===driver['氏名'].normalize('NFKC').replace(/\s/g,''))))throw Error('既存名変待ちの確認が必要');
 const ids=rows.slice(1).filter(r=>r[0]).map(r=>Number(r[0]));
 if(ids.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(ids).size!==ids.length)throw Error('受付ID不正');
 const id=Math.max(0,...ids)+1;if(!Number.isSafeInteger(id))throw Error('受付ID上限');
 const safe=v=>/^[=+@-]/.test(v)?"'"+v:v;
 s.appendRow([id,safe(driver['氏名']),safe(driver['所属会社名']),safe(driver['稼働エリア']),'','名変待ち','','',new Date(),'','','','',safe(receiptId),key,result.driver_id]);
 SpreadsheetApp.flush();return {state:'registered',id};
 }finally{lock.releaseLock();}
}
/** GF138の既存入口の末尾（本体のロック解放後）から呼ぶ。 */
function GFA_GF138後続同期_(){
 if(PropertiesService.getScriptProperties().getProperty('GFA_WAITING_LINK_ENABLED')!=='true')return;
 try{return GFA_名変待ちDriverID同期();}catch(e){console.warn('GFA後続同期失敗。次回再試行');}
}
