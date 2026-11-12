/******************************************************
 * GOLD FIRST
 * Gemini 利用可能モデル確認テスト
 *
 * 使い方：
 * 1. このファイルをGASへ追加
 * 2. 「Gemini利用可能モデルを確認する」を実行
 * 3. 実行ログをポテトへ送る
 *
 * 本番の免許証処理は変更しません。
 ******************************************************/

function Gemini利用可能モデルを確認する() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません。');
  }

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models' +
    '?pageSize=1000&key=' + encodeURIComponent(apiKey);

  const started = Date.now();

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  const sec = ((Date.now() - started) / 1000).toFixed(2);
  const status = response.getResponseCode();
  const body = response.getContentText();

  console.log('models.list / HTTP=' + status + ' / ' + sec + '秒');

  if (status !== 200) {
    console.log(body);
    throw new Error('モデル一覧取得失敗 / HTTP=' + status);
  }

  const json = JSON.parse(body);
  const models = Array.isArray(json.models) ? json.models : [];

  // generateContent が使える Gemini 系だけ表示
  const usable = models.filter(m => {
    const methods = m.supportedGenerationMethods || [];
    return String(m.name || '').includes('gemini') &&
           methods.includes('generateContent');
  });

  console.log('========== generateContent 利用可能 Gemini ==========');

  usable.forEach(m => {
    console.log(
      String(m.name || '') +
      ' | displayName=' + String(m.displayName || '') +
      ' | input=' + String(m.inputTokenLimit || '') +
      ' | output=' + String(m.outputTokenLimit || '')
    );
  });

  console.log('========== 今回確認したい候補 ==========');

  const candidates = [
    'models/gemini-3.5-flash-lite',
    'models/gemini-3.5-flash',
    'models/gemini-3.6-flash',
    'models/gemini-3.7-flash',
    'models/gemini-3.8-flash'
  ];

  candidates.forEach(name => {
    const found = usable.some(m => m.name === name);
    console.log((found ? '○ 使用可能  ' : '× 一覧になし ') + name);
  });

  console.log('========================================');
  console.log('この実行ログをそのままポテトへ送ってください。');

  return usable.map(m => m.name);
}

/******************************************************
 * GOLD FIRST
 * Gemini 免許証モデル エラー診断
 *
 * 本番85・HTMLは変更しません。
 * 5モデルを各1回だけ実行し、
 * HTTPエラー時はGeminiの返却本文もログへ出します。
 ******************************************************/

const GEMINI_診断設定 = {
  TEST_IMAGE_FILE_ID: '1vO0HIgAfThVwrUswmyIWYq_9y-8MNLBl',
  MODELS: [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash'
  ]
};

function Gemini免許証モデルエラー診断_各1回() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません。');

  const fileId = String(GEMINI_診断設定.TEST_IMAGE_FILE_ID || '').trim();
  if (!fileId || fileId.indexOf('ここに') >= 0) {
    throw new Error('TEST_IMAGE_FILE_ID に前回と同じ免許証表面画像のファイルIDを入れてください。');
  }

  const blob = DriveApp.getFileById(fileId).getBlob();
  const mimeType = blob.getContentType() || 'image/jpeg';
  const base64 = Utilities.base64Encode(blob.getBytes());

  const prompt = [
    'この画像は日本の運転免許証の表面です。',
    '本人氏名だけを読み取ってください。',
    '漢字は画像の表記どおりに読み、旧字体・異体字を変更しないでください。',
    '姓と名の間は半角スペース1個にしてください。',
    '判別できない場合は空文字にしてください。'
  ].join('\n');

  // まずはモデル間の互換性を優先し、
  // responseSchema等を使わないシンプルなリクエストで診断する。
  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0
    }
  };

  console.log('==================================================');
  console.log('Gemini免許証モデル エラー診断開始');
  console.log('各モデル1回のみ / エラー本文表示');
  console.log('==================================================');

  for (const model of GEMINI_診断設定.MODELS) {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      model +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const start = Date.now();

    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const sec = ((Date.now() - start) / 1000).toFixed(2);
      const status = response.getResponseCode();
      const body = response.getContentText();

      console.log('');
      console.log('---------- ' + model + ' ----------');
      console.log('HTTP=' + status + ' / ' + sec + '秒');

      if (status === 200) {
        let answer = '';
        try {
          const json = JSON.parse(body);
          answer = String(
            json.candidates?.[0]?.content?.parts?.[0]?.text || ''
          ).trim();
        } catch (e) {}

        // 個人情報保護のため氏名そのものはログに出さない
        console.log(answer ? '○ 回答取得成功（氏名本文は非表示）' : '△ HTTP 200だが回答文字列なし');
      } else {
        console.log('× Gemini返却本文：');
        console.log(body);
      }

    } catch (e) {
      const sec = ((Date.now() - start) / 1000).toFixed(2);
      console.log('');
      console.log('---------- ' + model + ' ----------');
      console.log('通信例外 / ' + sec + '秒');
      console.log(String(e && e.stack ? e.stack : e));
    }

    // 連打による429を避けるため診断では少し間隔を空ける
    Utilities.sleep(3000);
  }

  console.log('');
  console.log('==================================================');
  console.log('診断終了。この実行ログをそのままポテトへ送ってください。');
  console.log('==================================================');
}