
/** 写真不要：保存済みの最新完了受付をLINE受付管理へ再送 */
function テスト_GF190_最新完了受付をLINE管理へ再送() {
  const sh = GF190_sheet_();
  const rows = sh.getDataRange().getValues();

  let r = null;
  let index = -1;

  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][8]).trim() === '完了') {
      r = rows[i];
      index = i + 1;
      break;
    }
  }

  if (!r) {
    throw new Error('返却受付シートに完了済みの行がありません');
  }

  const props = PropertiesService.getScriptProperties();
  const endpoint = String(
    props.getProperty('GF190_LINE_RECEIPT_ENDPOINT') || ''
  ).trim();
  console.log('送信先URL：' + endpoint);

  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)) {
    throw new Error('GF190_LINE_RECEIPT_ENDPOINT が未設定または不正です');
  }

  const d = {
    key: String(r[0] || ''),
    uid: String(r[1] || ''),
    vehicle: String(r[2] || ''),
    car: String(r[3] || ''),
    name: String(r[4] || ''),
    phone: String(r[5] || ''),
    date: r[6] instanceof Date
      ? Utilities.formatDate(r[6], 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(r[6] || ''),
    memo: String(r[7] || ''),
    folder: String(r[10] || ''),
    time: r[13] instanceof Date
      ? Utilities.formatDate(r[13], 'Asia/Tokyo', 'HH:mm')
      : String(r[13] || ''),
    damage: String(r[14] || ''),
    insurance: String(r[15] || '')
  };

  console.log('対象：返却受付シート ' + index + ' 行目');

  for (const k of ['key', 'uid', 'vehicle', 'folder']) {
    if (!d[k]) {
      throw new Error('連携必須項目が空欄：' + k);
    }
  }

  const body = Utilities.base64EncodeWebSafe(
    Utilities.newBlob(
      JSON.stringify(d),
      'application/json; charset=UTF-8'
    ).getBytes()
  ).replace(/=+$/, '');

  const sig = GF190_sign_(body);

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    payload: {
      action: 'gf190_receipt',
      body: body,
      sig: sig
    },
    followRedirects: true,
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const result = response.getContentText().trim();

  const headers = response.getAllHeaders();

console.log('応答ヘッダー：' + JSON.stringify({
  location: headers.Location || headers.location || '',
  contentType: headers['Content-Type'] || headers['content-type'] || ''
}));

console.log('HTML末尾：' + result.slice(-1200));

  console.log(
    'LINE受付管理への連携結果：HTTP ' +
    code + ' / ' + result.slice(0, 160)
  );

  if (
    code !== 200 ||
    !/^OK(?::|_ALREADY(?::|$)|$)/.test(result)
  ) {
    throw new Error('連携失敗。上のログを確認してください');
  }

  console.log('LINE連携成功');
}
