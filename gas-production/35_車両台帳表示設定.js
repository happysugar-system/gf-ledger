/************************************************************
 * GOLD FIRST
 * 35_車両台帳表示設定.gs
 *
 * 車両台帳を「見る・操作する画面」として整える
 *
 * ・VehicleID / DriverID を非表示
 * ・現在使用者 → ドライバーマスター該当行へリンク
 * ・車番 → 車両状況該当行へリンク
 * ・メールアドレス → メール作成リンク
 * ・ステータス色分け
 * ・1行目固定
 * ・フィルタ設定
 * ・列幅調整
 *
 * ※値そのものは変更しない
 ************************************************************/


/**
 * 最初にこれを1回実行。
 * 何度実行してもOK。
 */
function 車両台帳の表示を整える() {

  const ss = 対象スプレッドシートを開く_();

  const 台帳 =
    必須シートを取得する_(ss, シート名.車両台帳);

  const マスター =
    必須シートを取得する_(ss, シート名.ドライバーマスター);

  const 車両状況 =
    必須シートを取得する_(ss, シート名.車両状況);


  // ==========================================
  // 基本表示
  // ==========================================

  台帳.setFrozenRows(1);

  // 横スクロールしても
// ステータス・管轄・車番・現在使用者が見えるように固定
const 現在使用者列 =
  列番号を取得する_(台帳, '現在使用者');

if (現在使用者列) {
  台帳.setFrozenColumns(現在使用者列);
}

  台帳.getRange(
    1,
    1,
    1,
    台帳.getLastColumn()
  )
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  台帳.setRowHeight(1, 40);


  // ==========================================
  // フィルタ
  // ==========================================

  if (!台帳.getFilter()) {

    台帳.getRange(
      1,
      1,
      Math.max(台帳.getLastRow(), 2),
      台帳.getLastColumn()
    ).createFilter();
  }


  // ==========================================
  // ID列を非表示
  // ==========================================

  ['VehicleID', 'DriverID'].forEach(列名 => {

    const 列 =
      列番号を取得する_(台帳, 列名);

    if (列) {
      台帳.hideColumns(列);
    }
  });


  // ==========================================
  // 列幅
  // ==========================================

  const 列幅設定 = {

    '区分/ステータス': 115,

    '管轄': 90,

    '車番': 110,

    '現在使用者': 150,

    '前使用者': 150,

    'フリガナ': 150,

    '電話番号': 130,

    '紹介元': 120,

    '所属会社名': 160,

    '稼働エリア': 120,

    '契約者メールアドレス': 220,

    '緊急連絡先氏名': 150,

    '緊急連絡先メールアドレス': 220,

    'ドライバーステータス': 120,

    'ドライバー備考': 200,

    '所在地': 180,

    '駆動': 80,

    '所有者': 120,

    'スペア': 80,

    'カギNo.': 90,

    'タイヤサイズ': 120,

    '走行距離(km)': 110,

    '仕入れ値': 110,

    'GPS番号': 110,

    'GPS有無': 90,

    '車体番号': 160,

    '車種': 130,

    '稼働拠点': 120,

    'カラー': 100,

    '仕入れ日/会場': 150,

    '備考': 220,

    '納車予定日': 115,

    '返却予定日': 115,

    '代車予定日': 115,

    '代車返却予定日': 125,

    '車検予定日': 115,

    '名変予定日': 115,

    '引渡し': 110,

    '返却/12点検': 120,

    '代車開始日': 115,

    '代車返却日': 115,

    '車検満了日': 115,

    '名義変更日': 115,

    '板金予定日': 115,

    '整備予定日': 115,

    '12点検予定日': 115,

    '車両画像': 100,

    '車両フォルダ': 120,

    '更新日時': 150
  };


  Object.keys(列幅設定).forEach(列名 => {

    const 列 =
      列番号を取得する_(台帳, 列名);

    if (列) {
      台帳.setColumnWidth(
        列,
        列幅設定[列名]
      );
    }
  });


  // ==========================================
  // 全体の縦位置
  // ==========================================

  if (台帳.getLastRow() >= 2) {

    台帳.getRange(
      2,
      1,
      台帳.getLastRow() - 1,
      台帳.getLastColumn()
    )
      .setVerticalAlignment('middle');
  }


  // ==========================================
  // リンク
  // ==========================================

  function 車両台帳リンクを更新する_(
  台帳,
  マスター,
  車両状況
) {

  const 最終行 = 台帳.getLastRow();
  if (最終行 < 2) return;


  // ==================================================
  // 必要な列
  // ==================================================

  const 車番列 =
    列番号を取得する_(台帳, '車番');

  const VehicleID列 =
    列番号を取得する_(台帳, 'VehicleID');

  const 使用者列 =
    列番号を取得する_(台帳, '現在使用者');

  const DriverID列 =
    列番号を取得する_(台帳, 'DriverID');

  const 契約メール列 =
    列番号を取得する_(台帳, '契約者メールアドレス');

  const 緊急メール列 =
    列番号を取得する_(台帳, '緊急連絡先メールアドレス');


  // ==================================================
  // 車両状況
  // VehicleID → 行番号 の一覧を先に作る
  // ==================================================

  const 状況VehicleID列 =
    列番号を取得する_(車両状況, 'VehicleID');

  const 状況車番列 =
    列番号を取得する_(車両状況, '車番');

  const 車両状況MAP = {};

  if (車両状況.getLastRow() >= 2) {

    const IDs =
      車両状況
        .getRange(
          2,
          状況VehicleID列,
          車両状況.getLastRow() - 1,
          1
        )
        .getDisplayValues()
        .flat();

    IDs.forEach((id, i) => {

      id = String(id || '').trim();

      if (id) {
        車両状況MAP[id] = i + 2;
      }
    });
  }


  // ==================================================
  // ドライバーマスター
  // DriverID → 行番号 の一覧を先に作る
  // ==================================================

  const マスターDriverID列 =
    列番号を取得する_(
      マスター,
      'DriverID'
    );

  const マスター氏名列 =
    列番号を取得する_(
      マスター,
      '氏名'
    );

  const ドライバーMAP = {};

  if (マスター.getLastRow() >= 2) {

    const IDs =
      マスター
        .getRange(
          2,
          マスターDriverID列,
          マスター.getLastRow() - 1,
          1
        )
        .getDisplayValues()
        .flat();

    IDs.forEach((id, i) => {

      id = String(id || '').trim();

      if (id) {
        ドライバーMAP[id] = i + 2;
      }
    });
  }


  // ==================================================
  // 車両台帳データをまとめて取得
  // ==================================================

  const 行数 = 最終行 - 1;

  const 車番一覧 =
    台帳
      .getRange(2, 車番列, 行数, 1)
      .getDisplayValues()
      .flat();

  const VehicleID一覧 =
    台帳
      .getRange(2, VehicleID列, 行数, 1)
      .getDisplayValues()
      .flat();

  const 使用者一覧 =
    台帳
      .getRange(2, 使用者列, 行数, 1)
      .getDisplayValues()
      .flat();

  const DriverID一覧 =
    台帳
      .getRange(2, DriverID列, 行数, 1)
      .getDisplayValues()
      .flat();

  const 契約メール一覧 =
    台帳
      .getRange(2, 契約メール列, 行数, 1)
      .getDisplayValues()
      .flat();

  const 緊急メール一覧 =
    台帳
      .getRange(2, 緊急メール列, 行数, 1)
      .getDisplayValues()
      .flat();


  // ==================================================
  // RichTextをメモリ上で作る
  // ==================================================

  const 車番Rich = [];
  const 使用者Rich = [];
  const 契約メールRich = [];
  const 緊急メールRich = [];


  for (let i = 0; i < 行数; i++) {

    // ------------------------------------------
    // 車番 → 車両状況「車番」セル
    // ------------------------------------------

    const 車番 =
      String(車番一覧[i] || '').trim();

    const VehicleID =
      String(VehicleID一覧[i] || '').trim();

    let 車番Builder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(車番);

    const 状況行 =
      車両状況MAP[VehicleID];

    if (車番 && 状況行) {

      const URL =
        '#gid=' +
        車両状況.getSheetId() +
        '&range=' +
        列番号をA1列名に変換する_(
          状況車番列
        ) +
        状況行;

      車番Builder =
        車番Builder.setLinkUrl(URL);
    }

    車番Rich.push([
      車番Builder.build()
    ]);


    // ------------------------------------------
    // 氏名 → ドライバーマスター「氏名」セル
    // ------------------------------------------

    const 使用者 =
      String(使用者一覧[i] || '').trim();

    const DriverID =
      String(DriverID一覧[i] || '').trim();

    let 使用者Builder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(使用者);

    const マスター行 =
      ドライバーMAP[DriverID];

    if (使用者 && マスター行) {

      const URL =
        '#gid=' +
        マスター.getSheetId() +
        '&range=' +
        列番号をA1列名に変換する_(
          マスター氏名列
        ) +
        マスター行;

      使用者Builder =
        使用者Builder.setLinkUrl(URL);
    }

    使用者Rich.push([
      使用者Builder.build()
    ]);


    // ------------------------------------------
    // 契約者メール
    // ------------------------------------------

    const 契約メール =
      String(
        契約メール一覧[i] || ''
      ).trim();

    let 契約Builder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(契約メール);

    if (契約メール) {

      契約Builder =
        契約Builder.setLinkUrl(
          'mailto:' + 契約メール
        );
    }

    契約メールRich.push([
      契約Builder.build()
    ]);


    // ------------------------------------------
    // 緊急連絡先メール
    // ------------------------------------------

    const 緊急メール =
      String(
        緊急メール一覧[i] || ''
      ).trim();

    let 緊急Builder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(緊急メール);

    if (緊急メール) {

      緊急Builder =
        緊急Builder.setLinkUrl(
          'mailto:' + 緊急メール
        );
    }

    緊急メールRich.push([
      緊急Builder.build()
    ]);
  }


  // ==================================================
  // ★最後に4回だけまとめて書き込む
  // ==================================================

  台帳
    .getRange(
      2,
      車番列,
      行数,
      1
    )
    .setRichTextValues(車番Rich);


  台帳
    .getRange(
      2,
      使用者列,
      行数,
      1
    )
    .setRichTextValues(使用者Rich);


  台帳
    .getRange(
      2,
      契約メール列,
      行数,
      1
    )
    .setRichTextValues(契約メールRich);


  台帳
    .getRange(
      2,
      緊急メール列,
      行数,
      1
    )
    .setRichTextValues(緊急メールRich);
}



  // ==========================================
  // ステータス色分け
  // ==========================================

  車両台帳ステータス色分けを設定する_(
    台帳
  );


  SpreadsheetApp.flush();

  return '車両台帳の表示設定が完了しました。';
}


/**
 * 車番・現在使用者・メールアドレスにリンクを設定。
 */
function 車両台帳リンクを更新する_(
  台帳,
  マスター,
  車両状況
) {

  const 最終行 = 台帳.getLastRow();

  if (最終行 < 2) return;


  const 車番列 =
    列番号を取得する_(台帳, '車番');

  const VehicleID列 =
    列番号を取得する_(台帳, 'VehicleID');

  const 使用者列 =
    列番号を取得する_(台帳, '現在使用者');

  const DriverID列 =
    列番号を取得する_(台帳, 'DriverID');


  // ==========================================
  // 車番
  // → 車両状況の該当VehicleID
  // ==========================================

  for (let row = 2; row <= 最終行; row++) {

    const 車番 =
      String(
        台帳
          .getRange(row, 車番列)
          .getDisplayValue() || ''
      ).trim();

    const VehicleID =
      String(
        台帳
          .getRange(row, VehicleID列)
          .getDisplayValue() || ''
      ).trim();


    if (車番 && VehicleID) {

      const 状況行 =
        IDで行を探す_(
          車両状況,
          'VehicleID',
          VehicleID
        );

      if (状況行) {

        const URL =
          '#gid=' +
          車両状況.getSheetId() +
          '&range=A' +
          状況行;


        const richText =
          SpreadsheetApp
            .newRichTextValue()
            .setText(車番)
            .setLinkUrl(URL)
            .build();


        台帳
          .getRange(row, 車番列)
          .setRichTextValue(richText);
      }
    }


    // ========================================
    // 現在使用者
    // → ドライバーマスターのDriverID
    // ========================================

    const 使用者 =
      String(
        台帳
          .getRange(row, 使用者列)
          .getDisplayValue() || ''
      ).trim();

    const DriverID =
      String(
        台帳
          .getRange(row, DriverID列)
          .getDisplayValue() || ''
      ).trim();


    if (使用者 && DriverID) {

      const マスター行 =
        IDで行を探す_(
          マスター,
          'DriverID',
          DriverID
        );

      if (マスター行) {

        const URL =
          '#gid=' +
          マスター.getSheetId() +
          '&range=A' +
          マスター行;


        const richText =
          SpreadsheetApp
            .newRichTextValue()
            .setText(使用者)
            .setLinkUrl(URL)
            .build();


        台帳
          .getRange(row, 使用者列)
          .setRichTextValue(richText);
      }
    }
  }


  // ==========================================
  // メールリンク
  // ==========================================

  [
    '契約者メールアドレス',
    '緊急連絡先メールアドレス'
  ].forEach(列名 => {

    const 列 =
      列番号を取得する_(台帳, 列名);

    if (!列) return;


    for (let row = 2; row <= 最終行; row++) {

      const email =
        String(
          台帳
            .getRange(row, 列)
            .getDisplayValue() || ''
        ).trim();


      if (!email) continue;


      const richText =
        SpreadsheetApp
          .newRichTextValue()
          .setText(email)
          .setLinkUrl(
            'mailto:' + email
          )
          .build();


      台帳
        .getRange(row, 列)
        .setRichTextValue(richText);
    }
  });
}


/**
 * 車両ステータスを色分け。
 */
function 車両台帳ステータス色分けを設定する_(
  台帳
) {

  const 列 =
    列番号を取得する_(
      台帳,
      '区分/ステータス'
    );

  if (!列) return;


  const 最大行 =
    Math.max(
      台帳.getMaxRows() - 1,
      1
    );


  const range =
    台帳.getRange(
      2,
      列,
      最大行,
      1
    );


  // この列に設定済みの条件付き書式だけ除去
  const existing =
    台帳.getConditionalFormatRules();

  const keep =
    existing.filter(rule => {

      return !rule
        .getRanges()
        .some(r =>
          r.getColumn() === 列 &&
          r.getNumColumns() === 1
        );
    });


  const 設定 = [

    ['空車', '#E2F0D9'],

    ['納車', '#D9EAF7'],

    ['貸出中', '#FFF2CC'],

    ['返却', '#FCE4D6'],

    ['12点検', '#E4DFEC'],

    ['整備', '#F4CCCC'],

    ['板金', '#F4CCCC'],

    ['車検', '#D9D2E9'],

    ['代車', '#DDEBF7'],

    ['代車返却', '#EAD1DC'],

    ['名変', '#D0E0E3'],

    ['終了', '#D9D9D9']
  ];


  const rules =
    設定.map(([文字, 色]) => {

      return SpreadsheetApp
        .newConditionalFormatRule()
        .whenTextEqualTo(文字)
        .setBackground(色)
        .setRanges([range])
        .build();
    });


  台帳.setConditionalFormatRules(
    keep.concat(rules)
  );
}