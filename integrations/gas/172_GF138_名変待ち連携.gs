/**
 * Resolve an assignment identity in the vehicle-management GAS project.
 * The caller supplies the waiting row's stored receipt ID, receipt key and DriverID.
 * GF138's existing trigger owns registration. Retry pending results after it runs.
 */
function GFA_割当DriverIDを照合_(lineReceiptId, waitingDriverId, books) {
  if (!books?.line || !books?.vehicle) throw Error('照合する台帳がありません');
  const receiptId = GFA_ID文字列_(lineReceiptId);
  if (!receiptId) throw new Error('LINE受付IDを確認してください');

  const { line, vehicle } = books;
  if (line.getId() === vehicle.getId()) throw new Error('台帳の接続先が不正です');

  const source = GFA_割当照合シート_(line, '車両依頼受付');
  const reception = GFA_割当照合シート_(line, 'LINE受付管理');
  const drivers = GFA_割当照合シート_(vehicle, 'ドライバーマスター');
  const sourceRow = GFA_割当照合行_(source, 'LINE受付ID', receiptId, ['書類状態', '受付識別子']);
  const receptionRow = GFA_割当照合行_(reception, '受付ID', receiptId, ['DriverID']);

  const requestKey = sourceRow['受付識別子'];
  const waitingKey = GFA_ID文字列_(books?.waitingKey);
  if (!/^[a-f0-9]{64}$/i.test(requestKey) || waitingKey !== requestKey) {
    throw new Error('名変待ちと車両依頼の受付識別子が一致しません');
  }
  if (sourceRow['書類状態'] !== '保存完了') return { state: 'reception_incomplete' };

  const linkedId = receptionRow.DriverID;
  const savedId = GFA_ID文字列_(waitingDriverId);
  if (savedId && savedId !== linkedId) {
    throw new Error('名変待ちとLINE受付のDriverIDが一致しません');
  }
  const history = vehicle.getSheetByName('GF_LINEドライバー同期履歴');
  const result = history && GFA_割当照合行_(
    history, '受付識別子', requestKey, ['処理状態', 'LINE受付ID', 'DriverID'], true
  );
  if (result && (result['LINE受付ID'] !== receiptId || (result.DriverID && result.DriverID !== linkedId))) {
    throw new Error('GF138の同期履歴がLINE受付と一致しません');
  }
  if (!linkedId || !result || result['処理状態'] !== '登録済' || result.DriverID !== linkedId) {
    return { state: result || linkedId ? 'registration_review_required' : 'registration_pending' };
  }
  if (!/^D\d{6}$/.test(linkedId)) throw Error('GF138のDriverID形式が不正です');
  const driver = GFA_割当照合行_(drivers, 'DriverID', linkedId, ['ステータス']);
  if (driver['ステータス'] !== '有効') throw new Error('ドライバーが有効ではありません');
  return { state: 'resolved', driver_id: linkedId };
}

function GFA_割当照合行_(sheet, key, id, fields, allowMissing = false) {
  const rows = sheet.getDataRange().getDisplayValues();
  const header = rows[0];
  const columns = [key, ...fields].map(field => {
    const indices = header.flatMap((value, index) => GFA_ID文字列_(value) === field ? [index] : []);
    if (indices.length !== 1) throw new Error('照合に必要な列を一意に特定できません');
    return indices[0];
  });
  const matches = rows.slice(1).filter(row => GFA_ID文字列_(row[columns[0]]) === id);
  if (allowMissing && matches.length === 0) return null;
  if (matches.length !== 1) throw new Error('照合対象を一意に特定できません');
  return Object.fromEntries(fields.map((field, index) =>
    [field, GFA_ID文字列_(matches[0][columns[index + 1]])]));
}

function GFA_ID文字列_(value) {
  return String(value ?? '').trim();
}

function GFA_割当照合シート_(book, name) {
  const sheet = book.getSheetByName(name);
  if (!sheet) throw Error('GF138との照合に必要なシートがありません: ' + name);
  return sheet;
}

/** GF138登録済みの受付を、明示的な受付キーを持つ名変待ち行に引き継ぐ。
 * GFA_assignment_driver_link.gs が必要。既存の未紐付け行は変更しない。
 */
function GFA_名変待ちDriverID診断(){return GFA_名変待ちDriverID同期_(false);}
function GFA_名変待ちDriverID同期(){return GFA_名変待ちDriverID同期_(true);}
function GFA_名変待ちDriverID同期_(write){
 const props=PropertiesService.getScriptProperties();
 const id=props.getProperty('GFA_APPROVED_BOOK_ID');
 const lineId=props.getProperty('GFA_APPROVED_LINE_BOOK_ID');
 if(!id||!lineId||id===lineId)throw Error('接続先未承認');
 if(write&&props.getProperty('GFA_WAITING_LINK_ENABLED')!=='true')throw Error('書込未承認');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 const vehicle=SpreadsheetApp.openById(id),line=SpreadsheetApp.openById(lineId);
 const s=vehicle.getSheetByName('名変待ち管理');if(!s)throw Error('名変待ち管理なし');
 const rows=s.getDataRange().getDisplayValues(),h=rows[0];
 const col=n=>{const a=h.flatMap((v,i)=>v.trim()===n?[i]:[]);if(a.length!==1)throw Error('列不一致: '+n);return a[0];};
 const c=['受付ID','LINE受付ID','受付識別子','DriverID','割当VehicleID','ステータス'].map(col);
 const count={legacy:0,pending:0,linked:0,ready:0,updated:0,review:0};
 const receiptCounts=new Map(),keyCounts=new Map();
 for(const r of rows.slice(1)){
  const receipt=GFA_ID文字列_(r[c[1]]),key=GFA_ID文字列_(r[c[2]]);
  if(receipt)receiptCounts.set(receipt,(receiptCounts.get(receipt)||0)+1);
  if(key)keyCounts.set(key,(keyCounts.get(key)||0)+1);
 }
 for(let i=1;i<rows.length;i++){
 const r=rows[i];if(!r[c[0]])continue;
 const receipt=GFA_ID文字列_(r[c[1]]),key=GFA_ID文字列_(r[c[2]]),old=GFA_ID文字列_(r[c[3]]);
 if(!receipt&&!key&&!old){count.legacy++;continue;}
 if(!receipt||!key||receiptCounts.get(receipt)!==1||keyCounts.get(key)!==1){count.review++;continue;}
 try{
 const result=GFA_割当DriverIDを照合_(receipt,old,{line,vehicle,waitingKey:key});
 if(result.state!=='resolved'){count.pending++;continue;}
 if(old){count.linked++;continue;}
 if(r[c[4]]||r[c[5]]!=='名変待ち'){count.review++;continue;}
 count.ready++;
 if(write){
 const live=s.getRange(i+1,1,1,h.length).getDisplayValues()[0];
 if(c.some(j=>live[j]!==r[j])){count.review++;continue;}
 const cell=s.getRange(i+1,c[3]+1);if(cell.getFormula()||cell.getValue()!==''){count.review++;continue;}
 cell.setValue(result.driver_id);SpreadsheetApp.flush();
 if(cell.getDisplayValue()!==result.driver_id)throw Error('書込確認失敗');
 count.updated++;
 }
 }catch(e){count.review++;console.warn('GFA waiting review row='+ (i+1));}
 }
 console.log(JSON.stringify(count));return count;
 }finally{lock.releaseLock();}
}

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
 if(headers.some((v,i)=>!GFA_名変待ち見出し一致_(rows[0],i,v)))throw Error('列構成不一致');
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
 return GFA_名変待ちDriverID同期();
}

/** 名変待ち管理の列追加。既存データは変更しない。 */
function GFA_名変待ち列追加診断(){return GFA_名変待ち列準備_(false);}
function GFA_名変待ち列追加実行(){return GFA_名変待ち列準備_(true);}
function GFA_名変待ち列準備_(write){
 const id=PropertiesService.getScriptProperties().getProperty('GFA_APPROVED_BOOK_ID');
 if(!id)throw Error('承認済み対象ブックIDが未設定');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 const s=SpreadsheetApp.openById(id).getSheetByName('名変待ち管理');
 if(!s)throw Error('対象シートなし');
 const base=['受付ID','氏名','所属会社名','稼働エリア','希望日','ステータス','割当VehicleID','割当車番','受付日時','割当日時','備考','進捗','旧シート行'];
 const extra=['LINE受付ID','受付識別子','DriverID'];
 if(s.getMaxColumns()<16)throw Error('列数不足');
 const h=s.getRange(1,1,1,Math.max(16,s.getLastColumn())).getDisplayValues()[0];
 if(base.some((v,i)=>!GFA_名変待ち見出し一致_(h,i,v)))throw Error('既存列構成不一致');
 const done=extra.every((v,i)=>h[13+i]===v)&&extra.every(v=>h.filter(x=>x===v).length===1);
 if(done)return {state:'already_ready'};
 if(extra.some(v=>h.includes(v)))throw Error('既存追加列の位置を確認');
 const r=s.getRange(1,14,Math.max(1,s.getLastRow()),3);
 if(r.getValues().some(row=>row.some(v=>v!==''))||r.getFormulas().some(row=>row.some(Boolean)))throw Error('追加先に既存データあり');
 if(r.isPartOfMerge())throw Error('追加先に結合セルあり');
 if(write){s.getRange(1,14,1,3).setValues([extra]);SpreadsheetApp.flush();if(extra.some((v,i)=>s.getRange(1,14,1,3).getDisplayValues()[0][i]!==v))throw Error('書込確認失敗');}
 return {state:write?'ready':'diagnostic_ok',columns:extra};
 }finally{lock.releaseLock();}
}

function GFA_名変待ち見出し一致_(header,index,expected){
 const allowed=expected==='旧シート行' ? [expected,'旧社長シート行'] : [expected];
 return allowed.includes(header[index])&&header.filter(value=>allowed.includes(value)).length===1;
}
