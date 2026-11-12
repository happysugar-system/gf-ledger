/**
 * 192_GitHub受信入口.gs
 * 受信状況をログに記録する診断版
 */
function doPost(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.gf191_action || '');

  console.log(
    'GF192受信：action=' + action +
    ' / 項目=' + Object.keys(p).join(',')
  );

  if (action) {
    console.log('GF191へ転送');
    return GF191_GitHub受信_(e);
  }

  console.error('GF191へ転送できません：gf191_actionなし');

  return ContentService.createTextOutput(
    '未対応のリクエストです'
  );
}

function GF192_受信経路テスト() {
  const e = {
    parameter: {
      gf191_action: 'test',
      nonce: 'test1234567890123456'
    }
  };

  const result = doPost(e);
  console.log('doPost応答：' + result.getContent());
}

function GF192_公開URL接続テスト() {
  const url = 'https://script.google.com/macros/s/AKfycbzDrU44saPdqQLxP3yyTPA8UgGkbw0fWSkNcUZp9XCEF2QErzk5uQki4_4eVDVwl4Hw0g/exec';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: {
      gf191_action: 'test',
      nonce: 'test1234567890123456'
    },
    followRedirects: true,
    muteHttpExceptions: true
  });

  const html = response.getContentText();

  console.log('HTTP状態：' + response.getResponseCode());
  console.log('GF191_RESULTあり：' + html.includes('GF191_RESULT'));
  console.log('未対応の操作あり：' + html.includes('未対応の操作です'));
}