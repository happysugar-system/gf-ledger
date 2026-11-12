/************************************************************
 * GOLD FIRST
 * 36_画面リンク.gs
 *
 * シート間の画面移動リンクをまとめて設定
 *
 * 【ドライバーリンク】
 * 車両台帳   現在使用者 → ドライバーマスター 氏名
 * 利用者管理 現在使用者 → ドライバーマスター 氏名
 * 利用者管理 前使用者   → ドライバーマスター 氏名
 * 車両状況   現在使用者 → ドライバーマスター 氏名
 *
 * 【車両リンク】
 * 車両台帳 車番 → 車両状況 車番
 *
 * ※リンク先は必ず「表示列」のセル
 ************************************************************/


/**
 * ★最初にこれを1回実行
 */
function 画面リンクを全部更新する() {

  const ss = 対象スプレッドシートを開く_();

  const 車両台帳 =
    必須シートを取得する_(
      ss,
      シート名.車両台帳
    );

  const ドライバー =
    必須シートを取得する_(
      ss,
      シート名.ドライバーマスター
    );

  const 利用者管理 =
    必須シートを取得する_(
      ss,
      シート名.利用者管理
    );

  const 車両状況 =
    必須シートを取得する_(
      ss,
      シート名.車両状況
    );


  // ==========================================
  // マスター情報をMAP化
  // ==========================================

  const ドライバー情報 =
    ドライバーリンクMAPを作る_(
      ドライバー
    );

  const 車両状況情報 =
    車両状況リンクMAPを作る_(
      車両状況
    );


  // ==========================================
  // 車両台帳
  // ==========================================

  車両台帳の画面リンクを設定する_(
    ss,
    車両台帳,
    ドライバー,
    車両状況,
    ドライバー情報,
    車両状況情報
  );


  // ==========================================
  // 利用者管理
  // ==========================================

  利用者管理の画面リンクを設定する_(
    ss,
    利用者管理,
    ドライバー,
    ドライバー情報
  );


  // ==========================================
  // 車両状況
  // ==========================================

  車両状況の画面リンクを設定する_(
    ss,
    車両状況,
    車両台帳,
    ドライバー,
    ドライバー情報
  );


  SpreadsheetApp.flush();

  return '画面リンクを更新しました。';
}


/************************************************************
 * ドライバーマスターMAP
 ************************************************************/
function ドライバーリンクMAPを作る_(
  sheet
) {

  const result = {
    id: {},
    name: {}
  };

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return result;
  }

  const idCol =
    列番号を取得する_(
      sheet,
      'DriverID'
    );

  const nameCol =
    列番号を取得する_(
      sheet,
      '氏名'
    );

  const ids =
    sheet
      .getRange(
        2,
        idCol,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  const names =
    sheet
      .getRange(
        2,
        nameCol,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();


  for (
    let i = 0;
    i < ids.length;
    i++
  ) {

    const id =
      String(ids[i] || '').trim();

    const name =
      String(names[i] || '').trim();

    const row = i + 2;


    if (id) {

      result.id[id] = {
        row: row,
        name: name
      };
    }


    if (name) {

      if (!result.name[name]) {
        result.name[name] = [];
      }

      result.name[name].push({
        row: row,
        id: id
      });
    }
  }

  return result;
}


/************************************************************
 * 車両状況MAP
 ************************************************************/
function 車両状況リンクMAPを作る_(
  sheet
) {

  const result = {};

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return result;
  }

  const idCol =
    列番号を取得する_(
      sheet,
      'VehicleID'
    );

  const ids =
    sheet
      .getRange(
        2,
        idCol,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();


  ids.forEach((value, index) => {

    const id =
      String(value || '').trim();

    if (id) {
      result[id] = index + 2;
    }
  });


  return result;
}


/************************************************************
 * 車両台帳
 ************************************************************/
function 車両台帳の画面リンクを設定する_(
  ss,
  台帳,
  ドライバー,
  車両状況,
  driverMap,
  vehicleMap
) {

  const lastRow =
    台帳.getLastRow();

  if (lastRow < 2) return;


  const rows =
    lastRow - 1;


  const vehicleIdCol =
    列番号を取得する_(
      台帳,
      'VehicleID'
    );

  const driverIdCol =
    列番号を取得する_(
      台帳,
      'DriverID'
    );

  const carCol =
    列番号を取得する_(
      台帳,
      '車番'
    );

  const userCol =
    列番号を取得する_(
      台帳,
      '現在使用者'
    );


  // ★リンク先の表示列
  const targetCarCol =
    列番号を取得する_(
      車両状況,
      '車番'
    );

  const targetNameCol =
    列番号を取得する_(
      ドライバー,
      '氏名'
    );


  const vehicleIds =
    台帳
      .getRange(
        2,
        vehicleIdCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();

  const driverIds =
    台帳
      .getRange(
        2,
        driverIdCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();

  const cars =
    台帳
      .getRange(
        2,
        carCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();

  const users =
    台帳
      .getRange(
        2,
        userCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const carRich = [];
  const userRich = [];


  for (
    let i = 0;
    i < rows;
    i++
  ) {

    // ========================================
    // 車番 → 車両状況
    // ========================================

    const vehicleId =
      String(
        vehicleIds[i] || ''
      ).trim();

    const car =
      String(
        cars[i] || ''
      ).trim();


    let carBuilder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(car);


    const targetRow =
      vehicleMap[vehicleId];


    if (
      car &&
      targetRow
    ) {

      const url =
        シート表示セルURLを作る_(
          ss,
          車両状況,
          targetCarCol,
          targetRow
        );

      carBuilder.setLinkUrl(url);
    }


    carRich.push([
      carBuilder.build()
    ]);


    // ========================================
    // 現在使用者 → ドライバーマスター
    // ========================================

    const driverId =
      String(
        driverIds[i] || ''
      ).trim();

    const user =
      String(
        users[i] || ''
      ).trim();


    let userBuilder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(user);


    const driver =
      driverMap.id[driverId];


    if (
      user &&
      driver
    ) {

      const url =
        シート表示セルURLを作る_(
          ss,
          ドライバー,
          targetNameCol,
          driver.row
        );

      userBuilder.setLinkUrl(url);
    }


    userRich.push([
      userBuilder.build()
    ]);
  }


  台帳
    .getRange(
      2,
      carCol,
      rows,
      1
    )
    .setRichTextValues(
      carRich
    );


  台帳
    .getRange(
      2,
      userCol,
      rows,
      1
    )
    .setRichTextValues(
      userRich
    );
}


/************************************************************
 * 利用者管理
 ************************************************************/
function 利用者管理の画面リンクを設定する_(
  ss,
  sheet,
  ドライバー,
  driverMap
) {

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const rows = lastRow - 1;

  // ==========================================
  // 利用者管理の列
  // ==========================================

  const vehicleIdCol =
    列番号を取得する_(
      sheet,
      'VehicleID'
    );

  const driverIdCol =
    列番号を取得する_(
      sheet,
      'DriverID'
    );

  const carCol =
    列番号を取得する_(
      sheet,
      '車番'
    );

  const currentCol =
    列番号を取得する_(
      sheet,
      '現在使用者'
    );

  const previousCol =
    列番号を取得する_(
      sheet,
      '前使用者'
    );

  const previousDriverIdCol =
    列番号を取得する_(
      sheet,
      '前DriverID'
    );


  // ==========================================
  // リンク先
  // ==========================================

  const 車両状況 =
    必須シートを取得する_(
      ss,
      シート名.車両状況
    );

  const targetCarCol =
    列番号を取得する_(
      車両状況,
      '車番'
    );

  const targetNameCol =
    列番号を取得する_(
      ドライバー,
      '氏名'
    );


  // ==========================================
  // 車両状況
  // VehicleID → 行番号
  // ==========================================

  const vehicleMap =
    車両状況リンクMAPを作る_(
      車両状況
    );


  // ==========================================
  // 利用者管理データをまとめて取得
  // ==========================================

  const vehicleIds =
    sheet
      .getRange(
        2,
        vehicleIdCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const driverIds =
    sheet
      .getRange(
        2,
        driverIdCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const cars =
    sheet
      .getRange(
        2,
        carCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const currentNames =
    sheet
      .getRange(
        2,
        currentCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const previousNames =
    sheet
      .getRange(
        2,
        previousCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const previousDriverIds =
    sheet
      .getRange(
        2,
        previousDriverIdCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  // ==========================================
  // RichText作成
  // ==========================================

  const carRich = [];
  const currentRich = [];
  const previousRich = [];


  for (let i = 0; i < rows; i++) {

    // ========================================
    // 車番 → 車両状況
    // VehicleIDで確実に特定
    // ========================================

    const vehicleId =
      String(
        vehicleIds[i] || ''
      ).trim();

    const car =
      String(
        cars[i] || ''
      ).trim();


    let carBuilder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(car);


    const vehicleRow =
      vehicleMap[vehicleId];


    if (
      car &&
      vehicleRow
    ) {

      const url =
        シート表示セルURLを作る_(
          ss,
          車両状況,
          targetCarCol,
          vehicleRow
        );

      carBuilder.setLinkUrl(url);
    }


    carRich.push([
      carBuilder.build()
    ]);


    // ========================================
    // 現在使用者 → ドライバーマスター
    // DriverIDで特定
    // ========================================

    const driverId =
      String(
        driverIds[i] || ''
      ).trim();

    const currentName =
      String(
        currentNames[i] || ''
      ).trim();


    let currentBuilder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(currentName);


    const currentDriver =
      driverMap.id[driverId];


    if (
      currentName &&
      currentDriver
    ) {

      const url =
        シート表示セルURLを作る_(
          ss,
          ドライバー,
          targetNameCol,
          currentDriver.row
        );

      currentBuilder.setLinkUrl(url);
    }


    currentRich.push([
      currentBuilder.build()
    ]);


    // ========================================
    // 前使用者 → ドライバーマスター
    // 前DriverIDで確実に特定
    // ========================================

    const previousDriverId =
      String(
        previousDriverIds[i] || ''
      ).trim();

    const previousName =
      String(
        previousNames[i] || ''
      ).trim();


    let previousBuilder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(previousName);


    const previousDriver =
      driverMap.id[
        previousDriverId
      ];


    if (
      previousName &&
      previousDriver
    ) {

      const url =
        シート表示セルURLを作る_(
          ss,
          ドライバー,
          targetNameCol,
          previousDriver.row
        );

      previousBuilder.setLinkUrl(url);
    }


    previousRich.push([
      previousBuilder.build()
    ]);
  }


  // ==========================================
  // 一括反映
  // ==========================================

  sheet
    .getRange(
      2,
      carCol,
      rows,
      1
    )
    .setRichTextValues(
      carRich
    );


  sheet
    .getRange(
      2,
      currentCol,
      rows,
      1
    )
    .setRichTextValues(
      currentRich
    );


  sheet
    .getRange(
      2,
      previousCol,
      rows,
      1
    )
    .setRichTextValues(
      previousRich
    );
}

/************************************************************
 * 車両状況
 *
 * 車両状況にはDriverIDがないので
 * VehicleID → 車両台帳 → DriverID
 * で本人を特定する。
 ************************************************************/
function 車両状況の画面リンクを設定する_(
  ss,
  状況,
  台帳,
  ドライバー,
  driverMap
) {

  const lastRow =
    状況.getLastRow();

  if (lastRow < 2) return;


  const rows =
    lastRow - 1;


  // ==========================================
  // 車両台帳から
  // VehicleID → DriverID
  // ==========================================

  const 台帳LastRow =
    台帳.getLastRow();

  const vehicleDriverMap = {};


  if (台帳LastRow >= 2) {

    const 台帳VehicleCol =
      列番号を取得する_(
        台帳,
        'VehicleID'
      );

    const 台帳DriverCol =
      列番号を取得する_(
        台帳,
        'DriverID'
      );


    const ids =
      台帳
        .getRange(
          2,
          台帳VehicleCol,
          台帳LastRow - 1,
          1
        )
        .getDisplayValues()
        .flat();


    const drivers =
      台帳
        .getRange(
          2,
          台帳DriverCol,
          台帳LastRow - 1,
          1
        )
        .getDisplayValues()
        .flat();


    for (
      let i = 0;
      i < ids.length;
      i++
    ) {

      const vehicleId =
        String(
          ids[i] || ''
        ).trim();

      const driverId =
        String(
          drivers[i] || ''
        ).trim();


      if (vehicleId) {

        vehicleDriverMap[
          vehicleId
        ] = driverId;
      }
    }
  }


  // ==========================================
  // 車両状況
  // ==========================================

  const vehicleCol =
    列番号を取得する_(
      状況,
      'VehicleID'
    );

  const userCol =
    列番号を取得する_(
      状況,
      '現在使用者'
    );

  const targetNameCol =
    列番号を取得する_(
      ドライバー,
      '氏名'
    );


  const vehicleIds =
    状況
      .getRange(
        2,
        vehicleCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const users =
    状況
      .getRange(
        2,
        userCol,
        rows,
        1
      )
      .getDisplayValues()
      .flat();


  const rich = [];


  for (
    let i = 0;
    i < rows;
    i++
  ) {

    const vehicleId =
      String(
        vehicleIds[i] || ''
      ).trim();

    const user =
      String(
        users[i] || ''
      ).trim();


    let builder =
      SpreadsheetApp
        .newRichTextValue()
        .setText(user);


    const driverId =
      vehicleDriverMap[
        vehicleId
      ];

    const driver =
      driverMap.id[
        driverId
      ];


    if (
      user &&
      driver
    ) {

      const url =
        シート表示セルURLを作る_(
          ss,
          ドライバー,
          targetNameCol,
          driver.row
        );

      builder.setLinkUrl(url);
    }


    rich.push([
      builder.build()
    ]);
  }


  状況
    .getRange(
      2,
      userCol,
      rows,
      1
    )
    .setRichTextValues(
      rich
    );
}


/************************************************************
 * ★共通
 *
 * 「スプレッドシート完全URL」
 * ＋
 * 「表示されている列」
 *
 * のリンクを作る。
 ************************************************************/
function シート表示セルURLを作る_(
  ss,
  sheet,
  col,
  row
) {

  const a1 =
    列番号をA1列名に変換する_(
      col
    ) +
    row;


  return (
    ss.getUrl() +
    '#gid=' +
    sheet.getSheetId() +
    '&range=' +
    a1
  );
}


/************************************************************
 * 列番号 → A / B / AA ...
 ************************************************************/
function 列番号をA1列名に変換する_(
  col
) {

  let result = '';
  let n = col;


  while (n > 0) {

    const remainder =
      (n - 1) % 26;

    result =
      String.fromCharCode(
        65 + remainder
      ) +
      result;

    n =
      Math.floor(
        (n - 1) / 26
      );
  }


  return result;
}
