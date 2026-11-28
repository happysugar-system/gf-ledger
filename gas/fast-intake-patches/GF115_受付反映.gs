function GF115_車両依頼受付へ反映_(p,lineUserId,result,requestId,fastMode) {
  if(!/^[a-f0-9]{64}$/i.test(requestId))throw Error('受付識別子が不正です');
  const receipt=String(result.receipt||'');
  if(!/^TEST145-\d{14}-[a-f0-9]{8}$/i.test(receipt))throw Error('受付番号が不正です');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw Error('受付同期が混み合っています');
  try {
    const fast = fastMode === true;
    if (fast && (typeof GF_FAST_property_ !== 'function' || GF_FAST_property_('GF_FAST_ISOLATED_TEST_ENABLED') !== 'true')) throw Error('FAST_TEST_DISABLED');
    const ss=fast ? GF_FAST_lineTestBook_() : 対象スプレッドシートを開く_();
    const detail=GF115_詳細シート_(ss);
    const master=ss.getSheetByName('LINE受付管理');
    if(!master)throw Error('LINE受付管理シートがありません');
    const headers=master.getRange(1,1,1,master.getLastColumn()).getDisplayValues()[0];
    const idx={};headers.forEach((v,i)=>idx[v]=i);
    ['受付ID','受付日時','受付種別','LINEユーザーID','ドライバー名','受付内容','ステータス','写真フォルダURL'].forEach(k=>{
      if(idx[k]===undefined)throw Error('LINE受付管理の列不足:'+k);
    });
    const existing=GF115_受付行_(detail,22,requestId);
    if(existing && detail.getRange(existing,1).getDisplayValue()!==receipt)throw Error('受付番号の不整合');
    let lineReceptionId=existing?detail.getRange(existing,21).getDisplayValue():'';
    // 途中失敗後の再送も、既存案件を先に検索してから新規登録する。
    const data=master.getDataRange().getDisplayValues();
    const related=data.slice(1).filter(r=>String(r[idx['受付内容']]||'').includes('申込番号: '+receipt));
    if(related.length>1)throw Error('LINE受付管理に同一申込番号が重複しています');
    if(related.length===1)lineReceptionId=String(related[0][idx['受付ID']]);
    if(!lineReceptionId) {
      const entry = {
        受付種別:'車両依頼',LINEユーザーID:lineUserId,ドライバー名:GF115_文字_(p.name),
        受付内容:'車両依頼申込 / 申込番号: '+receipt+' / 納車希望: '+GF115_文字_(p.deliveryWish)+' / 稼働エリア: '+GF115_文字_(p.area),
        写真フォルダURL:String(result.folderUrl||'')
      };
      if (fast) {
        lineReceptionId = 'TEST-FAST-' + requestId;
        const values = Object.assign({}, entry, {'受付ID':lineReceptionId,'受付日時':new Date(),'ステータス':'未対応'});
        master.appendRow(headers.map(h => Object.prototype.hasOwnProperty.call(values,h) ? values[h] : ''));
      } else {
        lineReceptionId=GF_LINE受付を登録する_(entry);
      }
    }
    const staged = typeof GF_FAST_PENDING !== 'undefined' && result.documentStatus === GF_FAST_PENDING;
    if (staged && existing && detail.getRange(existing,21).getDisplayValue() === lineReceptionId &&
        [GF_FAST_PENDING,GF_FAST_CLEANUP,'保存完了'].includes(detail.getRange(existing,20).getDisplayValue())) {
      return {receipt,lineReceptionId};
    }
    const vals=[receipt,new Date(),p.name,p.kana,p.phone,p.referrer,p.company,p.area,p.email,
      p.guarantorName,p.guarantorPhone,p.guarantorEmail,p.deliveryWish,p.startWish,
      result.match||'', staged?'受付済・書類転送待ち':'受付済・書類保存完了',result.licenseUrl||'',
      result.residentUrl||(staged && p.residentMethod==='mail'?'原本郵送予定':''),result.folderUrl||'',
      staged?GF_FAST_PENDING:'保存完了',lineReceptionId,requestId].map((v,i)=>i===1?v:GF115_文字_(v));
    const row=existing||detail.getLastRow()+1;
    detail.getRange(row,5).setNumberFormat('@');detail.getRange(row,11).setNumberFormat('@');
    detail.getRange(row,1,1,vals.length).setValues([vals]);
    SpreadsheetApp.flush();
    return {receipt,lineReceptionId};
  } finally {lock.releaseLock();}
}
