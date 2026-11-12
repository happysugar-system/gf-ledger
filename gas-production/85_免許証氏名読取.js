/******************************************************
 * GOLD FIRST 新システム
 * 85_免許証氏名読取.gs
 * Gemini画像認識版 / 高速・安定化
 *
 * 方針
 * ・表裏2枚を1回のAI通信で送り、氏名＋各画像の向きを同時判定
 * ・Gemini 3.8 Flash の thinkingLevel を low に固定
 * ・画像は mediaResolution=HIGH で文字精度を優先
 * ・503/429等だけ指数バックオフ＋jitterで再試行
 * ・各処理時間をログへ出して遅い箇所を特定できる
 ******************************************************/

const GEMINI_免許証設定 = {
  モデル: 'gemini-3.8-flash',
  最大試行回数: 5,
  待機ミリ秒: [600, 1400, 2800, 5000],
  再試行HTTP: [408, 429, 500, 502, 503, 504]
};

function スマホから免許証氏名を読み取る(画像一覧) {
  const 開始 = Date.now();

  // 表裏2枚を1回のAI通信で判定する。
  if (!Array.isArray(画像一覧) || 画像一覧.length < 2) {
    return {
      成功: false,
      氏名: '',
      メッセージ: '免許証の表面画像を読み込めませんでした。'
    };
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY が設定されていません。');
    return {
      成功: false,
      氏名: '',
      メッセージ: '氏名を自動入力できませんでした。'
    };
  }

  const 表面 = 画像一覧[0] || {};
  const 裏面 = 画像一覧[1] || {};

  const 表面Base64 = String(表面.Base64 || '').replace(/^data:[^;]+;base64,/, '');
  const 裏面Base64 = String(裏面.Base64 || '').replace(/^data:[^;]+;base64,/, '');

  if (!表面Base64 || !裏面Base64) {
    return {
      成功: false,
      氏名: '',
      メッセージ: '免許証の表裏画像を読み込めませんでした。'
    };
  }

  const parts = [
    {
      text: [
        'これは日本の運転免許証の表面画像と裏面画像です。',
        '最初の画像が表面、2番目の画像が裏面です。',
        '表面の氏名欄に記載された本人氏名だけを正確に読み取ってください。',
        '漢字は画像どおり。旧字体・異体字を変更しない。',
        '姓と名の間は半角スペース1個。',
        '推測しない。判別できない場合は空文字。',
        '',
        'さらに表面・裏面をそれぞれ独立して見てください。',
        '回転角度を考えず、現在の画像の中で「免許証の本来の上辺」が画像の上・右・下・左のどこにあるかだけを判定してください。',
        '例：文字が普通に読める正位置なら上。',
        '上下逆さまで文字も逆さまなら下。',
        '免許証の本来の上辺が画像の右側に来ていれば右、左側に来ていれば左。',
        '表面上辺・裏面上辺は必ず 上 / 右 / 下 / 左 のどれか。',
        '表と裏は必ず別々に判定してください。'
      ].join('\\n')
    },
    {
      inline_data: {
        mime_type: String(表面.MIMEタイプ || 'image/jpeg'),
        data: 表面Base64
      }
    },
    {
      inline_data: {
        mime_type: String(裏面.MIMEタイプ || 'image/jpeg'),
        data: 裏面Base64
      }
    }
  ];

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_免許証設定.モデル +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      thinkingConfig: {
        thinkingLevel: 'low'
      },
      mediaResolution: 'MEDIA_RESOLUTION_HIGH',
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          氏名: { type: 'STRING' },
          表面上辺: { type: 'STRING', enum: ['上','右','下','左'] },
          裏面上辺: { type: 'STRING', enum: ['上','右','下','左'] }
        },
        required: ['氏名', '表面上辺', '裏面上辺']
      }
    }
  };

  let 最後のHTTP = 0;
  let 最後の本文 = '';
  const 診断 = []; // スマホ画面へ返す調査用内訳

  for (let 試行 = 1; 試行 <= GEMINI_免許証設定.最大試行回数; 試行++) {
    const 通信開始 = Date.now();

    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const status = response.getResponseCode();
      const body = response.getContentText();
      const 通信秒 = ((Date.now() - 通信開始) / 1000).toFixed(2);

      最後のHTTP = status;
      最後の本文 = body;
      診断.push(試行 + '回目 HTTP ' + status + ' / ' + 通信秒 + '秒');

      console.log(
        'Gemini免許証読取 / 試行=' + 試行 +
        ' / HTTP=' + status +
        ' / 通信=' + 通信秒 + '秒' +
        ' / 経過=' + ((Date.now() - 開始) / 1000).toFixed(2) + '秒'
      );

      if (status === 200) {
        const json = JSON.parse(body);
        const answer = String(
          json.candidates?.[0]?.content?.parts?.[0]?.text || ''
        ).trim();

        let result;
        try {
          result = JSON.parse(answer);
        } catch (e) {
          console.warn('Gemini JSON解析失敗=' + answer);
          return {
            成功: false,
            氏名: '',
            メッセージ: '氏名を自動入力できませんでした。'
          };
        }

        const 氏名 = String(result.氏名 || '').trim();

        // AIには曖昧な「何度回すか」を答えさせない。
        // 現在の画像で書類の上辺がどこにあるかだけを答えさせ、
        // Canvasへ渡す時計回り角度はコード側で一意に決める。
        const 上辺から回転角度 = v => {
          const map = { '上':0, '右':270, '下':180, '左':90 };
          return Object.prototype.hasOwnProperty.call(map, String(v || '').trim())
            ? map[String(v || '').trim()]
            : 0;
        };

        const 表面回転 = 上辺から回転角度(result.表面上辺);
        const 裏面回転 = 上辺から回転角度(result.裏面上辺);
        const 合計秒 = ((Date.now() - 開始) / 1000).toFixed(2);

        if (!氏名) {
          return {
            成功: false,
            氏名: '',
            メッセージ: '氏名を読み取れませんでした。',
            処理秒: Number(合計秒),
            診断: 診断.join(' ｜ ')
          };
        }

        console.log('Gemini免許証読取 成功 / 氏名=' + 氏名 + ' / 合計=' + 合計秒 + '秒');

        return {
          成功: true,
          氏名: 氏名,
          回転: 表面回転, // 旧HTML互換
          回転一覧: [表面回転, 裏面回転],
          メッセージ: '',
          処理秒: Number(合計秒),
          試行回数: 試行,
          診断: 診断.join(' ｜ ')
        };
      }

      const 再試行対象 = GEMINI_免許証設定.再試行HTTP.includes(status);
      if (!再試行対象 || 試行 >= GEMINI_免許証設定.最大試行回数) break;

      const 基本待機 = GEMINI_免許証設定.待機ミリ秒[試行 - 1] || 2000;
      const jitter = Math.floor(Math.random() * 350);
      const wait = 基本待機 + jitter;
      診断.push('待機 ' + (wait / 1000).toFixed(2) + '秒');

      console.warn(
        'Gemini一時エラー / HTTP=' + status +
        ' / ' + wait + 'ms後に再試行'
      );
      Utilities.sleep(wait);

    } catch (e) {
      const 例外文 = (e && e.message ? e.message : e);
      診断.push(試行 + '回目 通信例外');
      console.error(
        'Gemini通信例外 / 試行=' + 試行 +
        ' / ' + 例外文
      );

      if (試行 >= GEMINI_免許証設定.最大試行回数) break;

      const 基本待機 = GEMINI_免許証設定.待機ミリ秒[試行 - 1] || 2000;
      const 例外待機 = 基本待機 + Math.floor(Math.random() * 350);
      診断.push('待機 ' + (例外待機 / 1000).toFixed(2) + '秒');
      Utilities.sleep(例外待機);
    }
  }

  console.error(
    'Gemini免許証読取 最終失敗 / HTTP=' + 最後のHTTP +
    ' / 合計=' + ((Date.now() - 開始) / 1000).toFixed(2) + '秒' +
    ' / body=' + 最後の本文
  );

  return {
    成功: false,
    氏名: '',
    メッセージ: 'AIが混み合っているため氏名を自動入力できませんでした。',
    処理秒: Number(((Date.now() - 開始) / 1000).toFixed(2)),
    診断: 診断.join(' ｜ ')
  };
}

function Gemini接続テスト() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません。');

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_免許証設定.モデル +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  const 開始 = Date.now();
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: '「接続OK」とだけ返してください。' }] }],
      generationConfig: {
        thinkingConfig: { thinkingLevel: 'low' }
      }
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  console.log('Gemini接続テスト / HTTP=' + status + ' / ' + ((Date.now()-開始)/1000).toFixed(2) + '秒');

  if (status !== 200) {
    throw new Error('Gemini APIエラー / HTTP=' + status + '\\n' + body);
  }

  const json = JSON.parse(body);
  const answer = String(json.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  console.log('Gemini回答 = ' + answer);
  return answer;
}