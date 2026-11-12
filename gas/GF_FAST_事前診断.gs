/** GF_FAST_事前診断.gs — TEST ONLY / READ ONLY
 * Place in the isolated LINE authentication TEST GAS project alongside GF145/146.
 * Run GF_FAST_事前診断() manually; no Drive files or sheet rows are created.
 * Do not add to production GAS100 or the vehicle-ledger GAS project.
 */
function GF_FAST_事前診断() {
  const props = PropertiesService.getScriptProperties();
  const checks = [];
  const check = (name, fn) => {
    try { checks.push({name, ok: Boolean(fn())}); }
    catch (_) { checks.push({name, ok:false}); }
  };
  check('GF145 function exists', () => typeof GF145_フォーム受付保存_ === 'function');
  check('GF146 function exists', () => typeof GF146_書類保存_ === 'function');
  check('GF145 sheet resolver exists', () => typeof GF145_テストシート取得_ === 'function');
  check('GF146 owner key helper exists', () => typeof GF146_照合キー_ === 'function');
  check('GF142 matcher exists', () => typeof GF142_既存候補照合_ === 'function');
  check('test sheet configured', () => !!props.getProperty('GF144_TEST_SHEET_ID'));
  check('master sheet configured', () => !!props.getProperty('GF_LINK_SHEET_ID'));
  check('test and master are different', () => {
    const a=props.getProperty('GF144_TEST_SHEET_ID'),b=props.getProperty('GF_LINK_SHEET_ID');
    return !!a && !!b && a!==b;
  });
  check('test Drive folder configured', () => !!props.getProperty('GF146_TEST_FOLDER_ID'));
  check('owner HMAC secret configured', () => String(props.getProperty('GF146_OWNER_SECRET')||'').length>=32);
  check('bridge secret configured', () => String(props.getProperty('GF_VEHICLE_BRIDGE_SECRET')||'').length>=40);
  check('receipt sheet headers valid', () => {
    // Avoid GF145_テストシート取得_ here: it may create a sheet/header.
    const id=props.getProperty('GF144_TEST_SHEET_ID');
    const sh=SpreadsheetApp.openById(id).getSheetByName('145_フォーム申込テスト');
    if(!sh) return false;
    const expected=['受付番号','受付日時','氏名','フリガナ','電話番号','紹介元','所属会社名','稼働エリア',
      '契約者メールアドレス','緊急連絡先氏名','緊急連絡先電話番号','緊急連絡先メールアドレス',
      '納車希望','稼働開始希望','既存候補判定','受付状態'];
    const actual=sh.getRange(1,1,1,expected.length).getDisplayValues()[0];
    return JSON.stringify(actual)===JSON.stringify(expected);
  });
  check('document columns present', () => {
    const id=props.getProperty('GF144_TEST_SHEET_ID');
    const sh=SpreadsheetApp.openById(id).getSheetByName('145_フォーム申込テスト');
    if(!sh) return false;
    const expected=['LINE照合キー','🪪免許証を見る','📄住民票を見る','📁書類フォルダ','書類状態'];
    return JSON.stringify(sh.getRange(1,17,1,5).getDisplayValues()[0])===JSON.stringify(expected);
  });
  check('request-id column present', () => {
    const id=props.getProperty('GF144_TEST_SHEET_ID');
    const sh=SpreadsheetApp.openById(id).getSheetByName('145_フォーム申込テスト');
    return !!sh && sh.getRange(1,22).getDisplayValue()==='受付識別子';
  });
  check('test Drive folder accessible', () => {
    const id=props.getProperty('GF146_TEST_FOLDER_ID');
    return !!id && !!DriveApp.getFolderById(id).getName();
  });
  const summary={ok:checks.every(c=>c.ok),passed:checks.filter(c=>c.ok).length,total:checks.length,checks};
  console.log(JSON.stringify(summary)); // only booleans, no IDs, PII, or secret values
  return summary;
}
