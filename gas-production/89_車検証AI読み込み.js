/******************************************************
 * GOLD FIRST 新システム
 * 89_車検証AI読取.gs
 *
 * 自動車検査証記録事項の画像1枚から
 * 車両台帳へ入れる項目をGeminiで読み取り、
 * 車両番号から「管轄」と「車番」を既存台帳形式へ自動整形する。
 *
 * 読取・整形項目：
 * ・管轄
 * ・車番
 * ・車体番号
 * ・車検満了日
 * ・所有者
 * ・車種
 * ・所在地
 * ・走行距離(km)
 *
 * ※ 車両台帳への登録・VehicleID発番・Drive作成は
 *    既存の30_車両同期.gsへ任せる。
 ******************************************************/
const GEMINI_車検証AI設定_89 = {
  モデル: 'gemini-3.8-flash',
  最大試行回数: 3,
  待機ミリ秒: [800, 1800]
};
/**
 * スマホ画面から呼ぶ関数。
 *
 * 画像:
 * {
 *   Base64: '...',
 *   MIMEタイプ: 'image/jpeg'
 * }
 *
 * 戻り値:
 * {
 *   成功: true,
 *   管轄: '',
 *   車番: '',
 *   車体番号: '',
 *   車検満了日: 'yyyy-MM-dd',
 *   所有者: '',
 *   車種: '',
 *   所在地: '',
 *   '走行距離(km)': '',
 *   処理秒: 4.21,
 *   メッセージ: ''
 * }
 */
function スマホから車検証を読み取る(画像一覧) {
  const 開始 = Date.now();
  if (
    !Array.isArray(画像一覧) ||
    画像一覧.length !== 3
  ) {
    return 車検証AI失敗結果_(
      '車両書類3枚を選択してください。',
      開始
    );
  }
  const apiKey =
    PropertiesService
      .getScriptProperties()
      .getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY が設定されていません。');
    return 車検証AI失敗結果_(
      '読み取り設定が見つかりません。手入力で登録できます。',
      開始
    );
  }
  const 画像Parts = [];
  for (let i = 0; i < 画像一覧.length; i++) {
    const 画像 = 画像一覧[i] || {};
    const base64 = String(画像.Base64 || '')
      .replace(/^data:[^;]+;base64,/, '');
    if (!base64) {
      return 車検証AI失敗結果_(
        '画像を読み込めませんでした。もう一度選択してください。',
        開始
      );
    }
    const mimeType =
      String(画像.MIMEタイプ || 'image/jpeg').trim() ||
      'image/jpeg';
    画像Parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64
      }
    });
  }
  const prompt = [
    '添付した3枚は車両に関する書類です。順番はランダムです。',
    '3枚の中から「自動車検査証記録事項」を画像の内容で特定してください。',
    '自動車検査証や自賠責保険証明書ではなく、必ず「自動車検査証記録事項」から次の項目を読み取ってください。',
    '',
    '【読み取る項目】',
    '1. 車番',
    '   「車両番号」欄の内容。',
    '   例：大宮 481 り 7253',
    '',
    '2. 車体番号',
    '   「車台番号」欄の内容。',
    '',
    '3. 車検満了日',
    '   「有効期間の満了する日」。',
    '   和暦を yyyy-MM-dd 形式の西暦へ変換する。',
    '',
    '4. 所有者',
    '   「所有者の氏名又は名称」。',
    '',
    '5. 車種',
    '   「車名」欄の内容。',
    '',
    '6. 所在地',
    '   「使用の本拠の位置」欄の住所。',
    '',
    '7. 稼働拠点',
    '   「使用者の住所」欄の住所。',
    '   所有者の住所や使用の本拠の位置と取り違えない。',
    '',
    '8. 使用者氏名',
    '   「使用者の氏名又は名称」欄の氏名または会社名。',
    '   所有者と取り違えない。',
    '',
    '9. 記録年月日',
    '   自動車検査証記録事項の右上にある「記録年月日」。',
    '   和暦の場合は yyyy-MM-dd 形式の西暦へ変換する。',
    '   例：令和8年8月19日 → 2026-08-19',
    '',
    '10. 走行距離(km)',
    '   備考欄に複数の走行距離計表示値がある場合は、最も新しい日付の値。',
    '   数字だけを返す。カンマやkmは付けない。',
    '',
    '【重要ルール】',
    '・3枚の並び順を前提にしない',
    '・自動車検査証記録事項を内容で判別する',
    '・推測しない',
    '・読めない項目は空文字にする',
    '・車番の文字を勝手に変更しない',
    '・車体番号の英数字とハイフンを正確に読む',
    '',
    '【画像の向き】',
    '・添付した画像1・画像2・画像3それぞれについて、文字が正しい向きで読めるようにするため、時計回りに何度回転すべきか判定する',
    '・画像1回転、画像2回転、画像3回転は必ず 0 / 90 / 180 / 270 のどれかを返す',
    '・写真全体の縦横ではなく、書類内の文字の向きで判定する',
    '・説明文は不要'
  ].join('\n');
  const url =
    'https\://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_車検証AI設定_89.モデル +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);
  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        ...画像Parts
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          車番: { type: 'STRING' },
          車体番号: { type: 'STRING' },
          車検満了日: { type: 'STRING' },
          所有者: { type: 'STRING' },
          車種: { type: 'STRING' },
          所在地: { type: 'STRING' },
          稼働拠点: { type: 'STRING' },
          使用者氏名: { type: 'STRING' },
          記録年月日: { type: 'STRING' },
          '走行距離(km)': { type: 'STRING' },
          画像1回転: { type: 'INTEGER' },
          画像2回転: { type: 'INTEGER' },
          画像3回転: { type: 'INTEGER' }
        },
        required: [
          '車番',
          '車体番号',
          '車検満了日',
          '所有者',
          '車種',
          '所在地',
          '稼働拠点',
          '使用者氏名',
          '記録年月日',
          '走行距離(km)',
          '画像1回転',
          '画像2回転',
          '画像3回転'
        ]
      }
    }
  };
  let 最後のHTTP = 0;
  let 最後の本文 = '';
  for (
    let 試行 = 1;
    試行 <= GEMINI_車検証AI設定_89.最大試行回数;
    試行++
  ) {
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const status = response.getResponseCode();
      const body = response.getContentText();
      最後のHTTP = status;
      最後の本文 = body;
      console.log(
        'Gemini車検証読取 / 試行=' +
        試行 +
        ' / HTTP=' +
        status
      );
      if (status === 200) {
        const json = JSON.parse(body);
        const answer = String(
          json.candidates &&
          json.candidates[0] &&
          json.candidates[0].content &&
          json.candidates[0].content.parts &&
          json.candidates[0].content.parts[0]
            ? json.candidates[0].content.parts[0].text || ''
            : ''
        ).trim();
        let result;
        try {
          result = JSON.parse(answer);
        } catch (e) {
          console.warn(
            'Gemini車検証 JSON解析失敗=' + answer
          );
          return 車検証AI失敗結果_(
            '車検証を読み取れませんでした。手入力で修正できます。',
            開始
          );
        }
        const 車両番号 = 車検証文字列_(result.車番);
        const 車番分解 = 車検証車両番号を台帳形式へ_(車両番号);
        const 読取結果 = {
          成功: true,
          管轄: 車番分解.管轄,
          車番: 車番分解.車番,
          車両番号原文: 車両番号,
          車体番号: 車検証文字列_(result.車体番号),
          車検満了日: 車検証文字列_(result.車検満了日),
          所有者: 車検証文字列_(result.所有者),
          車種: 車検証文字列_(result.車種),
          所在地: 車検証文字列_(result.所在地),
          稼働拠点: 車検証文字列_(result.稼働拠点),
          使用者氏名: 車検証文字列_(result.使用者氏名),
          記録年月日: 車検証文字列_(result.記録年月日),
          '走行距離(km)': 車検証走行距離_(result['走行距離(km)']),
          画像回転: [
            車検証回転角_(result.画像1回転),
            車検証回転角_(result.画像2回転),
            車検証回転角_(result.画像3回転)
          ],
          処理秒: 車検証処理秒_(開始),
          メッセージ: ''
        };
        // 最低限、車番か車体番号のどちらかは読めていること
        if (!読取結果.車番 && !読取結果.車体番号) {
          return 車検証AI失敗結果_(
            '車番・車体番号を読み取れませんでした。画像を確認してください。',
            開始
          );
        }
        console.log(
          '車検証AI読取成功=' +
          JSON.stringify(読取結果)
        );
        return 読取結果;
      }
      // 無料枠の日次上限など、待っても直らない429は即終了
      const 日次上限 =
        status === 429 &&
        (
          body.includes('free_tier_requests') ||
          body.includes('PerDayPerProjectPerModel') ||
          body.includes('GenerateRequestsPerDayPerProjectPerModel')
        );
      if (日次上限) {
        console.error(
          'Gemini日次上限 / HTTP=429 / body=' + body
        );
        return 車検証AI失敗結果_(
          'AIの利用上限に達しています。手入力で登録できます。',
          開始
        );
      }
      // 一時エラーだけ短く再試行
      const 再試行対象 =
        [429, 500, 502, 503, 504].includes(status);
      if (
        再試行対象 &&
        試行 < GEMINI_車検証AI設定_89.最大試行回数
      ) {
        const wait =
          GEMINI_車検証AI設定_89.待機ミリ秒[試行 - 1] ||
          1500;
        console.warn(
          'Gemini車検証 一時エラー。再試行 / HTTP=' +
          status
        );
        Utilities.sleep(wait);
        continue;
      }
      break;
    } catch (e) {
      console.error(
        'Gemini車検証 通信例外 / 試行=' +
        試行 +
        ' / ' +
        (
          e && e.message
            ? e.message
            : e
        )
      );
      if (
        試行 < GEMINI_車検証AI設定_89.最大試行回数
      ) {
        const wait =
          GEMINI_車検証AI設定_89.待機ミリ秒[試行 - 1] ||
          1500;
        Utilities.sleep(wait);
        continue;
      }
    }
  }
  console.error(
    'Gemini車検証読取 最終失敗 / HTTP=' +
    最後のHTTP +
    ' / body=' +
    最後の本文
  );
  return 車検証AI失敗結果_(
    'AIで車検証を読み取れませんでした。手入力で登録できます。',
    開始
  );
}
/**
 * 失敗時の戻り値
 */
function 車検証AI失敗結果_(メッセージ, 開始) {
  return {
    成功: false,
    管轄: '',
    車番: '',
    車体番号: '',
    車検満了日: '',
    所有者: '',
    車種: '',
    所在地: '',
    稼働拠点: '',
    使用者氏名: '',
    記録年月日: '',
    '走行距離(km)': '',
    処理秒: 車検証処理秒_(開始),
    メッセージ: String(メッセージ || '')
  };
}
/**
 * null / undefined を安全に空文字へ
 */
function 車検証文字列_(値) {
  if (値 === null || 値 === undefined) {
    return '';
  }
  return String(値).trim();
}
/**
 * 走行距離を数字だけへ統一
 */
function 車検証走行距離_(値) {
  const s = 車検証文字列_(値);
  if (!s) return '';
  const digits =
    s.replace(/[^\d]/g, '');
  return digits;
}
/**
 * 処理時間
 */
function 車検証処理秒_(開始) {
  return Math.round(
    ((Date.now() - 開始) / 1000) * 100
  ) / 100;
}
/**
 * 車検証の「車両番号」をGOLD FIRSTの既存台帳形式へ分ける。
 *
 * 例：
 * 大宮 481 り 7253
 *   → 管轄：大宮481り
 *   → 車番：72-53
 */
function 車検証車両番号を台帳形式へ_(値) {
  const 原文 = String(値 || '').trim();
  const compact = 原文.replace(/\s+/g, '');
  if (!compact) {
    return { 管轄: '', 車番: '' };
  }
  // 末尾の1～4桁をナンバー数字として扱う。
  // 「・」や「･」が付く表記にも対応。
  const m = compact.match(/^(.*?)[・･]?(\d{1,4})$/);
  if (!m) {
    // 分解できない場合は勝手に推測せず、車番へ原文を残す。
    return {
      管轄: '',
      車番: 原文
    };
  }
  const 管轄 = String(m[1] || '').trim();
  const digits = String(m[2] || '');
  let 車番 = digits;
  if (digits.length === 4) {
    車番 = digits.slice(0, 2) + '-' + digits.slice(2);
  } else if (digits.length === 3) {
    車番 = digits.slice(0, 1) + '-' + digits.slice(1);
  }
  return {
    管轄: 管轄,
    車番: 車番
  };
}
/**
 * 新規車両登録時の「基本3書類」を、
 * 車両フォルダ直下の「車両書類」へ保存する。
 *
 * 既存の「利用者別車両書類」とは別物。
 * 現在使用者がいない新規車両でも保存できる。
 *
 * 保存先：
 * Drive親 / 01_車両 / VehicleID_車番 / 車両書類 / 基本書類
 *
 * 保存内容：
 * ・元画像3枚
 * ・車両基本書類一式.pdf
 */
function スマホから新規車両基本書類を保存する(
  VehicleID,
  画像一覧
) {
  VehicleID = String(VehicleID || '').trim();
  if (!VehicleID) {
    throw new Error('VehicleIDがありません。');
  }
  if (
    !Array.isArray(画像一覧) ||
    画像一覧.length !== 3
  ) {
    throw new Error(
      '車両書類は3枚まとめて選択してください。'
    );
  }
  if (typeof 画像データをBlobにする_ !== 'function') {
    throw new Error(
      '画像保存関数が見つかりません。'
    );
  }
  // 60_書類PDF.gs の現行仕様：
  // 車両書類は縦型PDF専用関数を使う。
  if (typeof 車両書類PDFを作る_ !== 'function') {
    throw new Error(
      '車両書類PDF作成関数が見つかりません。'
    );
  }
  const ブック = 対象スプレッドシートを開く_();
  const 台帳 = 必須シートを取得する_(
    ブック,
    シート名.車両台帳
  );
  const 行 = IDで行を探す_(
    台帳,
    'VehicleID',
    VehicleID
  );
  if (!行) {
    throw new Error(
      '登録した車両が車両台帳に見つかりません。'
    );
  }
  const 車両 = 行データを取得する_(
    台帳,
    行
  );
  const 車番 = String(
    車両['車番'] || ''
  ).trim();
  if (!車番) {
    throw new Error('車番がありません。');
  }
  if (typeof 車両フォルダを準備して反映する_ !== 'function') {
    throw new Error(
      '30_車両同期.gs の車両フォルダ準備関数が見つかりません。'
    );
  }
  // 現在の30_車両同期.gsに実在する関数で
  // Drive親 / 01_車両 / VehicleID_車番 と基本サブフォルダを準備する。
  const 車両フォルダURL =
    車両フォルダを準備して反映する_(
      台帳,
      行,
      車両
    );
  if (!車両フォルダURL) {
    throw new Error(
      '車両フォルダを準備できませんでした。'
    );
  }
  const idMatch =
    String(車両フォルダURL)
      .match(/[-\w]{25,}/);
  if (!idMatch) {
    throw new Error(
      '車両フォルダIDを取得できませんでした。'
    );
  }
  const 車両フォルダ =
    DriveApp.getFolderById(idMatch[0]);
  const 書類フォルダ =
    子フォルダを取得または作成する_(
      車両フォルダ,
      '車両書類'
    );
  // 基本書類だけをまとめる専用フォルダ。
  const 基本書類フォルダ =
    子フォルダを取得または作成する_(
      書類フォルダ,
      '基本書類'
    );
  // 旧書類は新しい画像3枚とPDFの保存・リンク反映が終わるまで残す。
  const oldIterator=基本書類フォルダ.getFiles(),oldFileIDs=[];
  while(oldIterator.hasNext())oldFileIDs.push(oldIterator.next().getId());
  const blobs = 画像一覧.map(
    (x, i) =>
      画像データをBlobにする_(
        x,
        '車両基本書類_' + (i + 1)
      )
  );
  // 選択順は自由なので、元画像には誤った書類名を付けず連番で保存する。
  const 保存名 = [
    '車両書類',
    '車両書類',
    '車両書類'
  ];
  // 新規ファイルのIDを保持し、同名の旧書類とは区別して確認する。
  const 新規画像ID = [];
  blobs.forEach((blob, i) => {
    const ext =
      typeof MIMEから拡張子を取得する_ === 'function'
        ? MIMEから拡張子を取得する_(blob.getContentType())
        : 'jpg';
    const file = 基本書類フォルダ.createFile(
      blob.copyBlob().setName(
        保存名[i] + '_' + String(i + 1).padStart(2, '0') + '.' + ext
      )
    );
    新規画像ID.push(file.getId());
  });

  const PDF = 基本書類フォルダ.createFile(
    車両書類PDFを作る_(
      '車両基本書類_' + 車番,
      blobs
    ).setName('車両基本書類一式.pdf')
  );

  // 4件とも正式フォルダ内に存在し、空でないことを読み直して確認。
  // 検証に失敗した場合は例外を出し、旧書類・一時写真を残す。
  const 確認対象ID = 新規画像ID.concat([PDF.getId()]);
  const 確認対象 = {};
  const it = 基本書類フォルダ.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (確認対象ID.indexOf(f.getId()) !== -1) {
      確認対象[f.getId()] = {
        名前: f.getName(),
        サイズ: f.getSize(),
        ゴミ箱: f.isTrashed()
      };
    }
  }
  if (確認対象ID.some(id => !確認対象[id] || 確認対象[id].ゴミ箱 || 確認対象[id].サイズ <= 0)) {
    throw new Error('正式Drive保存の確認に失敗しました。新旧書類と一時写真を残して確認してください。');
  }
  for (let i = 0; i < 3; i++) {
    if (!確認対象[新規画像ID[i]].名前.startsWith('車両書類_' + String(i + 1).padStart(2, '0') + '.')) {
      throw new Error('正式Driveの画像名が一致しません。一時写真を残して確認してください。');
    }
  }
  if (確認対象[PDF.getId()].名前 !== '車両基本書類一式.pdf') {
    throw new Error('正式DriveのPDF名が一致しません。一時写真を残して確認してください。');
  }
  // 車両台帳に「📄車両書類」列がある場合はPDFへ直リンク。
  try {
    セルを書き込む_(
      台帳,
      行,
      '📄車両書類',
      PDF.getUrl()
    );
  } catch (e) {
    // 列が無い版でもDrive保存自体は成功扱いにする。
    console.warn(
      '📄車両書類リンク反映スキップ: ' +
      (e && e.message ? e.message : e)
    );
  }
  SpreadsheetApp.flush();
  // 旧書類は自動削除しない。再送・部分失敗でも元データを守る。
  // 新規4件の存在確認済み。旧ファイルの整理は別途確認して行う。
  console.log('正式書類保存確認OK / VehicleID=' + VehicleID + ' / 新規画像=3 / PDF=1 / 旧書類保持=' + oldFileIDs.length);
  return {
    成功: true,
    VehicleID: VehicleID,
    車番: 車番,
    PDFURL: PDF.getUrl(),
    フォルダURL: 基本書類フォルダ.getUrl(),
    保存枚数: 3
  };
}
/** AIの回転角を安全に 0/90/180/270 へ限定する。 */
function 車検証回転角_(値) {
  const n = Number(値 || 0);
  return [0, 90, 180, 270].includes(n) ? n : 0;
}