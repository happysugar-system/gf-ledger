/** LINE認証テストGAS専用。架空データでGF145→Supabase一時保存を単体検証する。
 * Web公開しない。既存doPost/書類ルーター/通常受付を変更しない。
 * GF_FAST_受付接続.gs にある GF_FAST_CreateDummyPng_ を利用する。
 * 成功すると検証用GF145シートと非公開Supabase検証バケットに架空レコードが1件残る。
 */
function GF_FAST_書類保存単体検証() {
  const start = Date.now();
  const p = PropertiesService.getScriptProperties();
  const required = {
    isolated: p.getProperty('GF_FAST_ISOLATED_TEST_ENABLED') === 'true',
    legacyOff: p.getProperty('GF_FAST_TEST_ENABLED') !== 'true',
    book: p.getProperty('GF_FAST_RECEIVER_TEST_BOOK_ID') === p.getProperty('GF144_TEST_SHEET_ID'),
    folder: p.getProperty('GF_FAST_RECEIVER_TEST_FOLDER_ID') === p.getProperty('GF146_TEST_FOLDER_ID'),
    secret: String(p.getProperty('GF_FAST_INTAKE_SECRET') || '').length >= 48,
    stage: typeof GF_FAST_stage_ === 'function',
    png: typeof GF_FAST_CreateDummyPng_ === 'function'
  };
  console.log(JSON.stringify({test:'GF_FAST_stage',checks:required}));
  if (Object.keys(required).some(k => !required[k])) throw Error('FAST_DIAG_CONFIG_CHECK_FAILED');
  const request = (Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'').toLowerCase();
  const user = 'U'+Utilities.getUuid().replace(/-/g,'').toLowerCase();
  const png = 'data:image/png;base64,' + Utilities.base64Encode(GF_FAST_CreateDummyPng_().getBytes());
  const data = {
    bridge_request_id: request,
    front: png, back: png, residentMethod: 'mail',
    name: '高速受付架空診断', kana: 'コウソクウケツケカクウシンダン',
    phone: '09000000000', referrer: '検証', company: '架空テスト', area: '検証地域',
    email: 'gf-fast-diag@example.invalid',
    guarantorName: '架空緊急連絡先', guarantorPhone: '09000000001',
    guarantorEmail: 'gf-fast-contact@example.invalid',
    deliveryWish: '未定', startWish: '未定'
  };
  try {
    const result = GF_FAST_stage_(data,user,request);
    console.log(JSON.stringify({test:'GF_FAST_stage',ok:result.ok===true,
      documentStatus:result.documentStatus||'',ms:Date.now()-start}));
  } catch(error) {
    const code = String(error && error.message || error).slice(0,160);
    console.error(JSON.stringify({test:'GF_FAST_stage',ok:false,
      error:code,ms:Date.now()-start}));
    throw error;
  }
}
