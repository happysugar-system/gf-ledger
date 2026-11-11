/**
 * GOLD FIRST マイページ連絡先変更申請 → ドライバーマスター (PROD)
 *
 * v7 PROD GAS の同一プロジェクトへ追加する想定。
 * 前提関数: GF_SB_対象ブック_, GF_SB_v4全件_, GF_SB_v4API_
 * 初期状態は「読取・プレビューのみ」。トリガーは作らない。
 * 個人情報や secret を Logger に出さない。
 *
 * 運用ルール:
 * - 電話番号だけの変更申請は、本人認証済みDriverIDを照合した上で反映可能
 * - メール変更を含む申請は新メール宛の本人確認が終わるまで自動反映しない
 * - スプシのDriverIDが1件に決まらない場合は必ず停止
 */
const GF_CONTACT_CFG = Object.freeze({
  SHEET: 'ドライバーマスター',
  TABLE: 'gf_mypage_contact_change_requests',
  BOOK_ID: '17IzIUJeYQw3nO8GZsUSCgLfHVECNINZNkQdg38GW57o',
  MAX_PER_RUN: 20
});

function GF_CONTACT_申請計画_読取専用() {
  const sh = GF_SB_対象ブック_().getSheetByName(GF_CONTACT_CFG.SHEET);
  if (!sh || sh.getParent().getId() !== GF_CONTACT_CFG.BOOK_ID) {
    throw new Error('本番ドライバーマスターの参照先不一致');
  }
  const rows = sh.getDataRange().getDisplayValues();
  if (rows.length < 1) throw new Error('見出しなし');
  const heads = rows[0].map(v => String(v).trim());
  for (const h of ['DriverID','電話番号','契約者メールアドレス']) {
    if (heads.filter(x => x === h).length !== 1) throw new Error('見出し不足・重複: '+h);
  }
  const idx = Object.fromEntries(heads.map((h,i)=>[h,i]));
  const driverIndex = new Map();
  for(let i=1;i<rows.length;i++){
    const d=String(rows[i][idx.DriverID]||'').trim();
    if(!d)continue;
    if(!driverIndex.has(d))driverIndex.set(d,[]);
    driverIndex.get(d).push(i+1);
  }
  const items = GF_SB_v4全件_(GF_CONTACT_CFG.TABLE,
    'id,driver_id,requested_phone,requested_email,status,created_at')
    .filter(x=>x.status==='pending')
    .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));

  const plans=items.map(item=>{
    const locations=driverIndex.get(item.driver_id)||[];
    const hasEmail=!!String(item.requested_email||'').trim();
    const phone=String(item.requested_phone||'').trim();
    let verdict='READY_PHONE';
    if(locations.length!==1)verdict='DRIVER_NOT_UNIQUE';
    else if(hasEmail)verdict='EMAIL_VERIFICATION_REQUIRED';
    else if(!/^0[0-9]{9,10}$/.test(phone))verdict='PHONE_INVALID';
    return {id:item.id,row:locations.length===1?locations[0]:null,
      phone,verdict,driverId:item.driver_id};
  });
  return {sh,idx,plans};
}

/** 件数と状態のみ出力。変更申請の内容はログ表示しない。 */
function GF_CONTACT_申請プレビュー_読取専用() {
  const p=GF_CONTACT_申請計画_読取専用();
  const stats={total:p.plans.length,ready:p.plans.filter(x=>x.verdict==='READY_PHONE').length,
    emailVerification:p.plans.filter(x=>x.verdict==='EMAIL_VERIFICATION_REQUIRED').length,
    blocked:p.plans.filter(x=>!['READY_PHONE','EMAIL_VERIFICATION_REQUIRED'].includes(x.verdict)).length};
  console.log(JSON.stringify(stats));
  return stats;
}

/**
 * 電話番号だけの申請を処理。メール変更は検証・承認フロー実装まで保留。
 * PRODスクリプトプロパティ GF_CONTACT_PHONE_APPLY_ENABLED=YES が必要。
 * トリガー登録は禁止。テスト・承認を経て運用開始する。
 */
function GF_CONTACT_電話変更申請を反映() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('GF_CONTACT_PHONE_APPLY_ENABLED')!=='YES')
    throw new Error('電話変更反映は無効。事前にプレビューと本番承認が必要');
  GF_SB_v4書込許可_();
  if(props.getProperty('GF_SB_PROD_INIT_VERIFIED')!=='YES')
    throw new Error('PROD初期確認未完了');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('同時実行のため停止');
  try{
    const p=GF_CONTACT_申請計画_読取専用();
    const ready=p.plans.filter(x=>x.verdict==='READY_PHONE');
    if(ready.length>GF_CONTACT_CFG.MAX_PER_RUN)
      throw new Error('申請件数上限超過のため停止');
    let applied=0;
    for(const x of ready){
      const cell=p.sh.getRange(x.row,p.idx['電話番号']+1);
      // フォーマットをテキスト固定にして先頭ゼロを保持
      cell.setNumberFormat('@');
      if(String(cell.getDisplayValue()).replace(/\D/g,'')!==x.phone)cell.setValue(x.phone);
      SpreadsheetApp.flush();
      if(String(cell.getDisplayValue()).replace(/\D/g,'')!==x.phone)
        throw new Error('スプシ反映検証に失敗');
      const result=GF_SB_v4API_(
        GF_CONTACT_CFG.TABLE,
        '?id=eq.'+encodeURIComponent(x.id)+'&status=eq.pending',
        'patch',
        {status:'approved',processed_at:new Date().toISOString(),processing_note:'phone_sheet_applied'},
        'return=representation'
      );
      if(!Array.isArray(result)||result.length!==1||result[0].id!==x.id)
        throw new Error('申請処理結果不一致');
      applied++;
    }
    const result={applied,heldEmail:p.plans.filter(x=>x.verdict==='EMAIL_VERIFICATION_REQUIRED').length};
    console.log(JSON.stringify(result));
    return result;
  }finally{lock.releaseLock();}
}
