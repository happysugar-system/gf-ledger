/******************************************************
 * GOLD FIRST
 * LINE お問い合わせFAQ
 *
 * ・カテゴリ／Q&Aはスプレッドシート管理
 * ・カテゴリ選択時は「〇〇について」と表示
 * ・質問一覧はFlex Messageで縦表示
 * ・内部データはユーザーに見せない
 ******************************************************/


// ==================================================
// 基本設定
// ==================================================

const LINE_FAQ_管理スプシID =
  '1BfGXUS_nO2Q5MvGVFYZqjd0Bgrhn4wGmWS1JuYZvqLI';

const LINE_FAQ_会社ID = 'GF';

const LINE_FAQ_カテゴリシート = 'カテゴリ管理';
const LINE_FAQ_FAQシート = 'FAQ管理';


// ==================================================
// LINE Webhook
// ==================================================

function doPost(e) {

  try {

    const データ = JSON.parse(e.postData.contents);

    if (!データ.events || データ.events.length === 0) {
      return ContentService.createTextOutput('OK');
    }


    データ.events.forEach(function(イベント) {

      const 返信トークン = イベント.replyToken;

      if (!返信トークン) return;


      // ==========================================
      // 通常のテキストメッセージ
      // ==========================================

      if (
        イベント.type === 'message' &&
        イベント.message &&
        イベント.message.type === 'text'
      ) {

        const 受信文章 =
          String(イベント.message.text || '').trim();

        LINE_FAQ_テキスト処理_(
          受信文章,
          返信トークン
        );

        return;
      }


      // ==========================================
      // ボタンからのポストバック
      // ==========================================

      if (
        イベント.type === 'postback' &&
        イベント.postback
      ) {

        const ポストバックデータ =
          String(イベント.postback.data || '');

        LINE_FAQ_ポストバック処理_(
          ポストバックデータ,
          返信トークン
        );

        return;
      }

    });


    return ContentService.createTextOutput('OK');


  } catch (エラー) {

    console.error(
      'LINE Webhookエラー',
      エラー
    );

    return ContentService.createTextOutput('ERROR');
  }
}


// ==================================================
// 通常テキスト処理
// ==================================================

function LINE_FAQ_テキスト処理_(
  受信文章,
  返信トークン
) {

  if (
    受信文章 === '問い合わせ' ||
    受信文章 === 'お問い合わせ'
  ) {

    LINE_FAQ_カテゴリ表示_(返信トークン);
    return;
  }

  // それ以外の通常メッセージは
  // 担当者確認用として何も自動返信しない
}


// ==================================================
// ポストバック処理
// ==================================================

function LINE_FAQ_ポストバック処理_(
  データ,
  返信トークン
) {

  // ------------------------------------------
  // 最初のFAQ画面へ戻る
  // ------------------------------------------

  if (データ === '操作=最初') {

    LINE_FAQ_カテゴリ表示_(返信トークン);
    return;
  }


  // ------------------------------------------
  // その他のお問い合わせ
  // ------------------------------------------

  if (データ === '操作=その他') {

    LINE_FAQ_その他表示_(返信トークン);
    return;
  }


  // ------------------------------------------
  // カテゴリ
  // ------------------------------------------

  if (データ.indexOf('操作=カテゴリ&カテゴリ=') === 0) {

    const カテゴリ =
      decodeURIComponent(
        データ.substring(
          '操作=カテゴリ&カテゴリ='.length
        )
      );

    LINE_FAQ_質問一覧表示_(
      返信トークン,
      カテゴリ
    );

    return;
  }


  // ------------------------------------------
  // 質問
  // ------------------------------------------

  if (データ.indexOf('操作=質問&行=') === 0) {

    const 行番号 =
      Number(
        データ.substring(
          '操作=質問&行='.length
        )
      );

    if (!行番号) return;

    LINE_FAQ_回答表示_(
      返信トークン,
      行番号
    );

    return;
  }
}


// ==================================================
// 最初のカテゴリ一覧
// ==================================================

function LINE_FAQ_カテゴリ表示_(返信トークン) {

  const スプシ =
    SpreadsheetApp.openById(
      LINE_FAQ_管理スプシID
    );

  const シート =
    スプシ.getSheetByName(
      LINE_FAQ_カテゴリシート
    );

  if (!シート) {
    throw new Error(
      '「カテゴリ管理」シートがありません。'
    );
  }


  const 最終行 = シート.getLastRow();

  if (最終行 < 2) {
    throw new Error(
      'カテゴリ管理にデータがありません。'
    );
  }


  const データ =
    シート
      .getRange(
        2,
        1,
        最終行 - 1,
        5
      )
      .getValues();


  const カテゴリ一覧 =
    データ
      .filter(function(行) {

        return (
          String(行[0]).trim() === LINE_FAQ_会社ID &&
          LINE_FAQ_使用中_(行[4])
        );

      })
      .sort(function(a, b) {

        return (
          Number(a[3] || 999) -
          Number(b[3] || 999)
        );

      });


  const ボタン = [];


  カテゴリ一覧.forEach(function(行) {

    const カテゴリ =
      String(行[1]).trim();

    const 表示名 =
      String(行[2]).trim() || カテゴリ;


    ボタン.push(
      LINE_FAQ_Flexボタン_(
        表示名,
        '操作=カテゴリ&カテゴリ=' +
          encodeURIComponent(カテゴリ),
        カテゴリ + 'について'
      )
    );

  });


  // その他
  ボタン.push(
    LINE_FAQ_Flexボタン_(
      '💬 その他のお問い合わせ',
      '操作=その他',
      'その他のお問い合わせ'
    )
  );


  const メッセージ = {

    type: 'flex',

    altText:
      'よくあるご質問を選んでください',

    contents: {

      type: 'bubble',

      body: {

        type: 'box',
        layout: 'vertical',
        spacing: 'md',

        contents: [

          {
            type: 'text',
            text: 'お問い合わせ',
            weight: 'bold',
            size: 'xl'
          },

          {
            type: 'text',
            text:
              'よくあるご質問を選んでください',
            size: 'sm',
            wrap: true
          },

          {
            type: 'separator',
            margin: 'md'
          }

        ].concat(ボタン)
      }
    }
  };


  LINE_FAQ_返信_(
    返信トークン,
    [メッセージ]
  );
}


// ==================================================
// 質問一覧
// ==================================================

function LINE_FAQ_質問一覧表示_(
  返信トークン,
  カテゴリ
) {

  const スプシ =
    SpreadsheetApp.openById(
      LINE_FAQ_管理スプシID
    );

  const シート =
    スプシ.getSheetByName(
      LINE_FAQ_FAQシート
    );

  if (!シート) {
    throw new Error(
      '「FAQ管理」シートがありません。'
    );
  }


  const 最終行 = シート.getLastRow();

  if (最終行 < 2) {
    throw new Error(
      'FAQ管理にデータがありません。'
    );
  }


  const データ =
    シート
      .getRange(
        2,
        1,
        最終行 - 1,
        6
      )
      .getValues();


  const 質問一覧 = [];


  データ.forEach(function(行, 配列番号) {

    const 会社ID =
      String(行[0]).trim();

    const 行カテゴリ =
      String(行[1]).trim();

    const 質問 =
      String(行[2]).trim();

    const 表示順 =
      Number(行[4] || 999);

    const 使用 =
      行[5];


    if (
      会社ID !== LINE_FAQ_会社ID ||
      行カテゴリ !== カテゴリ ||
      !LINE_FAQ_使用中_(使用) ||
      !質問
    ) {
      return;
    }


    質問一覧.push({

      質問: 質問,

      表示順: 表示順,

      // スプレッドシート上の実際の行
      行番号: 配列番号 + 2
    });

  });


  質問一覧.sort(function(a, b) {
    return a.表示順 - b.表示順;
  });


  const ボタン = [];


  質問一覧.forEach(function(項目) {

    ボタン.push(
      LINE_FAQ_Flexボタン_(
        項目.質問,
        '操作=質問&行=' +
          項目.行番号,
        項目.質問
      )
    );

  });


  // 最初に戻る
  ボタン.push(
    LINE_FAQ_Flexボタン_(
      '← 最初のメニューに戻る',
      '操作=最初',
      '最初のメニューに戻る'
    )
  );


  const メッセージ = {

    type: 'flex',

    altText:
      カテゴリ + 'について',

    contents: {

      type: 'bubble',

      body: {

        type: 'box',
        layout: 'vertical',
        spacing: 'md',

        contents: [

          {
            type: 'text',
            text:
              カテゴリ + 'について',
            weight: 'bold',
            size: 'xl',
            wrap: true
          },

          {
            type: 'text',
            text:
              '知りたい質問を選んでください',
            size: 'sm',
            wrap: true
          },

          {
            type: 'separator',
            margin: 'md'
          }

        ].concat(ボタン)
      }
    }
  };


  LINE_FAQ_返信_(
    返信トークン,
    [メッセージ]
  );
}


// ==================================================
// 回答
// ==================================================

function LINE_FAQ_回答表示_(
  返信トークン,
  行番号
) {

  const スプシ =
    SpreadsheetApp.openById(
      LINE_FAQ_管理スプシID
    );

  const シート =
    スプシ.getSheetByName(
      LINE_FAQ_FAQシート
    );


  if (!シート) {
    throw new Error(
      '「FAQ管理」シートがありません。'
    );
  }


  if (
    行番号 < 2 ||
    行番号 > シート.getLastRow()
  ) {
    throw new Error(
      'FAQ行番号が正しくありません。'
    );
  }


  const 行 =
    シート
      .getRange(
        行番号,
        1,
        1,
        6
      )
      .getValues()[0];


  const 会社ID =
    String(行[0]).trim();

  const カテゴリ =
    String(行[1]).trim();

  const 回答 =
    String(行[3]).trim();

  const 使用 =
    行[5];


  if (
    会社ID !== LINE_FAQ_会社ID ||
    !LINE_FAQ_使用中_(使用) ||
    !回答
  ) {

    LINE_FAQ_カテゴリ表示_(
      返信トークン
    );

    return;
  }


  const メッセージ = {

    type: 'flex',

    altText: 回答,

    contents: {

      type: 'bubble',

      body: {

        type: 'box',
        layout: 'vertical',
        spacing: 'md',

        contents: [

          {
            type: 'text',
            text: 回答,
            size: 'md',
            wrap: true
          },

          {
            type: 'separator',
            margin: 'lg'
          },

          LINE_FAQ_Flexボタン_(
            '← ' + カテゴリ + 'の質問に戻る',
            '操作=カテゴリ&カテゴリ=' +
              encodeURIComponent(カテゴリ),
            カテゴリ + 'について'
          ),

          LINE_FAQ_Flexボタン_(
            '🏠 最初のメニューに戻る',
            '操作=最初',
            '最初のメニューに戻る'
          ),

          LINE_FAQ_Flexボタン_(
            '💬 担当者に問い合わせる',
            '操作=その他',
            '担当者に問い合わせる'
          )
        ]
      }
    }
  };


  LINE_FAQ_返信_(
    返信トークン,
    [メッセージ]
  );
}


// ==================================================
// その他のお問い合わせ
// ==================================================

function LINE_FAQ_その他表示_(返信トークン) {

  const メッセージ = {

    type: 'text',

    text:
      'よくある質問で解決しない場合は、お問い合わせ内容をこのトークに送信してください。\n\n' +

      'いただいたメッセージは担当スタッフが確認のうえ、営業時間内にご返信いたします。\n' +
      '内容によってはお時間をいただく場合がございますが、順次対応します。\n\n' +

      'どんなことでも遠慮なくご相談ください！\n\n' +

      '平日9:30〜17:00\n' +
      '直通電話 070-1345-9597'
  };


  LINE_FAQ_返信_(
    返信トークン,
    [メッセージ]
  );
}


// ==================================================
// Flex用 縦ボタン
// ==================================================

function LINE_FAQ_Flexボタン_(
  表示名,
  内部データ,
  トーク表示文章
) {

  return {

    type: 'button',

    style: 'secondary',

    height: 'sm',

    margin: 'sm',

    action: {

      type: 'postback',

      label: 表示名,

      data: 内部データ,

      displayText: トーク表示文章
    }
  };
}


// ==================================================
// 使用中判定
// ==================================================

function LINE_FAQ_使用中_(値) {

  return (
    値 === true ||
    String(値).toUpperCase() === 'TRUE' ||
    String(値) === '1'
  );
}


// ==================================================
// LINE返信
// ==================================================

function LINE_FAQ_返信_(
  返信トークン,
  メッセージ一覧
) {

  const アクセストークン =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'GF_LINE_CHANNEL_ACCESS_TOKEN'
      );


  if (!アクセストークン) {

    throw new Error(
      'GF_LINE_CHANNEL_ACCESS_TOKEN が設定されていません。'
    );
  }


  const レスポンス =
    UrlFetchApp.fetch(
      'https://api.line.me/v2/bot/message/reply',
      {

        method: 'post',

        contentType: 'application/json',

        headers: {
          Authorization:
            'Bearer ' + アクセストークン
        },

        payload:
          JSON.stringify({

            replyToken:
              返信トークン,

            messages:
              メッセージ一覧
          }),

        muteHttpExceptions: true
      }
    );


  const コード =
    レスポンス.getResponseCode();

  const 本文 =
    レスポンス.getContentText();


  console.log(
    'LINE返信結果：' +
    コード +
    ' / ' +
    本文
  );


  if (コード < 200 || コード >= 300) {

    throw new Error(
      'LINE返信エラー：' +
      コード +
      ' / ' +
      本文
    );
  }
}


// ==================================================
// 設定確認
// ==================================================

function LINE設定確認() {

  const アクセストークン =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'GF_LINE_CHANNEL_ACCESS_TOKEN'
      );


  console.log(
    'GF LINEアクセストークン：' +
    (
      アクセストークン
        ? 'OK'
        : '未設定'
    )
  );


  const スプシ =
    SpreadsheetApp.openById(
      LINE_FAQ_管理スプシID
    );


  console.log(
    'LINE管理スプシ：' +
    スプシ.getName()
  );


  console.log(
    'カテゴリ管理：' +
    (
      スプシ.getSheetByName(
        LINE_FAQ_カテゴリシート
      )
        ? 'OK'
        : 'なし'
    )
  );


  console.log(
    'FAQ管理：' +
    (
      スプシ.getSheetByName(
        LINE_FAQ_FAQシート
      )
        ? 'OK'
        : 'なし'
    )
  );
}