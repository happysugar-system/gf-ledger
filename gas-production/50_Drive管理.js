/******************************************************
 * GOLD FIRST 新システム
 * 50_Drive管理.gs
 *
 * 役割
 * ・契約ライセンスの Drive親フォルダID を起点にする
 * ・車両DriveとドライバーDriveを独立して管理する
 * ・作成済みフォルダはID基準で再利用する
 * ・車両状況へ車両Driveリンクを反映する
 *
 * この段階では写真・PDFそのものの保存はまだ行わない。
 ******************************************************/


/******************************************************
 * 初期準備・テスト
 ******************************************************/

function Drive基本フォルダを準備する() {
  const 親フォルダ = Drive親フォルダを取得する_();

  const 車両ルート = 子フォルダを取得または作成する_(
    親フォルダ,
    '01_車両'
  );

  const ドライバールート = 子フォルダを取得または作成する_(
    親フォルダ,
    '02_ドライバー'
  );

  const 結果 =
    'Drive準備完了 / 01_車両=' + 車両ルート.getName() +
    ' / 02_ドライバー=' + ドライバールート.getName();

  console.log(結果);
  return 結果;
}


/**
 * 71-47の車両Driveだけを準備するテスト。
 * 現在使用者のドライバーDriveはここでは作らない。
 */
function 車番7147のDriveフォルダを作成テストする() {
  return 車番のDriveフォルダを準備する_('71-47');
}


/**
 * ドライバーマスターに登録済みの全ドライバーについて
 * 個人フォルダを作成／再利用し、免許証フォルダURLを反映する。
 *
 * 阿部のような「現在使用者ではない既存ドライバー」も対象。
 */
function 全ドライバーのDriveフォルダを準備する() {
  const ロック = LockService.getScriptLock();
  ロック.waitLock(30000);

  try {
    const スプレッドシート = 対象スプレッドシートを開く_();
    const マスター = 必須シートを取得する_(
      スプレッドシート,
      シート名.ドライバーマスター
    );

    if (マスター.getLastRow() < 2) {
      return 'ドライバーマスターに対象者がいません。';
    }

    let 件数 = 0;

    for (let 行 = 2; 行 <= マスター.getLastRow(); 行++) {
      const データ = 行データを取得する_(マスター, 行);
      const DriverID = String(データ['DriverID'] || '').trim();
      const 氏名 = String(データ['氏名'] || '').trim();

      // 完全な空行は無視。
      if (!DriverID && !氏名) continue;

      if (!DriverID) {
        throw new Error(
          'ドライバーマスター ' + 行 +
          '行目「' + 氏名 + '」にDriverIDがありません。' +
          '先に車両同期またはドライバー登録処理を行ってください。'
        );
      }

      if (!氏名) {
        throw new Error(
          'ドライバーマスター ' + 行 +
          '行目 DriverID=' + DriverID + ' の氏名が空です。'
        );
      }

      ドライバーDriveフォルダを準備する_(DriverID, 氏名);
      件数++;
    }

    SpreadsheetApp.flush();

    const 結果 = '全ドライバーDrive準備完了 / ' + 件数 + '名';
    console.log(結果);
    return 結果;

  } finally {
    ロック.releaseLock();
  }
}


/******************************************************
 * 車両Drive
 ******************************************************/

function 車番のDriveフォルダを準備する_(車番) {
  const ロック = LockService.getScriptLock();
  ロック.waitLock(30000);

  try {
    const スプレッドシート = 対象スプレッドシートを開く_();
    const 車両台帳 = 必須シートを取得する_(
      スプレッドシート,
      シート名.車両台帳
    );

    const 車番列 = 列番号を取得する_(車両台帳, '車番');
    const 最終行 = 車両台帳.getLastRow();

    if (最終行 < 2) {
      throw new Error('車両台帳にデータがありません。');
    }

    const 対象車番 = String(車番 || '').trim();

    const 車番一覧 = 車両台帳
      .getRange(2, 車番列, 最終行 - 1, 1)
      .getDisplayValues()
      .flat()
      .map(v => String(v || '').trim());

    const 一致行 = [];

    車番一覧.forEach((値, i) => {
      if (値 === 対象車番) 一致行.push(i + 2);
    });

    if (一致行.length === 0) {
      throw new Error(
        '車番「' + 対象車番 + '」が車両台帳に見つかりません。'
      );
    }

    if (一致行.length > 1) {
      throw new Error(
        '車番「' + 対象車番 + '」が車両台帳に複数あります。'
      );
    }

    return 車両行のDriveフォルダを準備する_(一致行[0]);

  } finally {
    ロック.releaseLock();
  }
}


function 車両行のDriveフォルダを準備する_(行番号) {
  GF_書類列定義を統一する_28();
  const スプレッドシート = 対象スプレッドシートを開く_();

  const 車両台帳 = 必須シートを取得する_(
    スプレッドシート,
    シート名.車両台帳
  );

  const 車両状況 = 必須シートを取得する_(
    スプレッドシート,
    シート名.車両状況
  );

  const 車両データ = 行データを取得する_(車両台帳, 行番号);

  const VehicleID = String(車両データ['VehicleID'] || '').trim();
  const 車番 = String(車両データ['車番'] || '').trim();

  if (!VehicleID) {
    throw new Error(
      'VehicleIDがありません。先に車両同期を実行してください。'
    );
  }

  if (!車番) {
    throw new Error('車番がありません。');
  }

  const 親フォルダ = Drive親フォルダを取得する_();

  const 車両ルート = 子フォルダを取得または作成する_(
    親フォルダ,
    '01_車両'
  );

  const 車両フォルダ = ID付きフォルダを取得または作成する_(
    車両ルート,
    VehicleID,
    車番
  );

  const 車両状態フォルダ = 子フォルダを取得または作成する_(
    車両フォルダ,
    '車両状態画像'
  );

  const 車両書類フォルダ = 子フォルダを取得または作成する_(
    車両フォルダ,
    '車両書類'
  );

  // 車両台帳
  セルを書き込む_(
    車両台帳,
    行番号,
    '車両フォルダ',
    車両フォルダ.getUrl()
  );

  // 車両状況
  let 車両状況行 = IDで行を探す_(
    車両状況,
    'VehicleID',
    VehicleID
  );

  // 車両状況がまだ作られていなければ、先に通常同期を行う。
  if (!車両状況行) {
    車両状況を更新する_(車両状況, 車両データ);

    車両状況行 = IDで行を探す_(
      車両状況,
      'VehicleID',
      VehicleID
    );
  }

  if (!車両状況行) {
    throw new Error(
      'VehicleID=' + VehicleID +
      ' の車両状況行を作成できませんでした。'
    );
  }

  セルを書き込む_(
    車両状況,
    車両状況行,
    '📷車両状態フォルダ',
    車両状態フォルダ.getUrl()
  );

  GF_車両書類を同期する_28(スプレッドシート,VehicleID);

  セルを書き込む_(
    車両状況,
    車両状況行,
    '更新日時',
    new Date()
  );

  SpreadsheetApp.flush();

  const 結果 =
    '車両Drive準備完了 / ' +
    VehicleID + '_' + 車番;

  console.log(結果);

  return {
    VehicleID: VehicleID,
    車番: 車番,
    車両フォルダURL: 車両フォルダ.getUrl(),
    車両状態フォルダURL: 車両状態フォルダ.getUrl(),
    車両書類フォルダURL: 車両書類フォルダ.getUrl()
  };
}


/******************************************************
 * ドライバーDrive
 ******************************************************/

/**
 * DriverIDを基準にドライバー個人フォルダを作る。
 *
 * 車両の現在使用者かどうかには依存しない。
 * 免許証はドライバー本人の情報なので、車両Driveから独立させる。
 */
function ドライバーDriveフォルダを準備する_(DriverID, 氏名) {
  const 対象DriverID = String(DriverID || '').trim();
  const 対象氏名 = String(氏名 || '').trim();

  if (!対象DriverID) {
    throw new Error('DriverIDが空です。');
  }

  if (!対象氏名) {
    throw new Error('ドライバー氏名が空です。');
  }

  const スプレッドシート = 対象スプレッドシートを開く_();

  const マスター = 必須シートを取得する_(
    スプレッドシート,
    シート名.ドライバーマスター
  );

  const ドライバー行 = IDで行を探す_(
    マスター,
    'DriverID',
    対象DriverID
  );

  if (!ドライバー行) {
    throw new Error(
      'DriverID=' + 対象DriverID +
      ' がドライバーマスターに見つかりません。'
    );
  }

  const 親フォルダ = Drive親フォルダを取得する_();

  const ドライバールート = 子フォルダを取得または作成する_(
    親フォルダ,
    '02_ドライバー'
  );

  const ドライバーフォルダ = ID付きフォルダを取得または作成する_(
    ドライバールート,
    対象DriverID,
    対象氏名
  );

  // 現段階ではこの個人フォルダ自体を免許証保存先として使う。
  // 後の免許証PDF機能で必要なら配下構成を追加する。
  セルを書き込む_(
    マスター,
    ドライバー行,
    '🪪免許証フォルダ',
    ドライバーフォルダ.getUrl()
  );

  return ドライバーフォルダ;
}


/******************************************************
 * Drive共通処理
 ******************************************************/

function Drive親フォルダを取得する_() {
  const フォルダID = Drive親フォルダIDを取得する_();

  try {
    return DriveApp.getFolderById(フォルダID);
  } catch (エラー) {
    throw new Error(
      '契約ライセンスに登録されたDrive親フォルダを開けません。' +
      'Drive親フォルダIDと、このGAS実行アカウントの権限を確認してください。' +
      ' 元エラー: ' + エラー.message
    );
  }
}


function 子フォルダを取得または作成する_(親フォルダ, フォルダ名) {
  const 対象名 = String(フォルダ名 || '').trim();

  if (!対象名) {
    throw new Error('作成するフォルダ名が空です。');
  }

  const 一覧 = 親フォルダ.getFoldersByName(対象名);
  const 一致 = [];

  while (一覧.hasNext()) {
    一致.push(一覧.next());
  }

  if (一致.length > 1) {
    throw new Error(
      '親フォルダ「' + 親フォルダ.getName() +
      '」直下に「' + 対象名 +
      '」が複数あります。重複を解消してください。'
    );
  }

  if (一致.length === 1) {
    return 一致[0];
  }

  return 親フォルダ.createFolder(対象名);
}


function ID付きフォルダを取得または作成する_(
  親フォルダ,
  ID,
  表示名
) {
  const 対象ID = String(ID || '').trim();
  const 対象表示名 = ファイル名に使える文字へ整える_(表示名);

  if (!対象ID) {
    throw new Error('フォルダ作成に必要なIDが空です。');
  }

  const 期待名 = 対象ID + '_' + 対象表示名;
  const 一覧 = 親フォルダ.getFolders();
  const 一致 = [];

  while (一覧.hasNext()) {
    const フォルダ = 一覧.next();
    const 名前 = String(フォルダ.getName() || '').trim();

    if (
      名前 === 対象ID ||
      名前.startsWith(対象ID + '_')
    ) {
      一致.push(フォルダ);
    }
  }

  if (一致.length > 1) {
    throw new Error(
      '「' + 親フォルダ.getName() +
      '」内にID「' + 対象ID +
      '」のフォルダが複数あります。'
    );
  }

  if (一致.length === 1) {
    const フォルダ = 一致[0];

    if (フォルダ.getName() !== 期待名) {
      フォルダ.setName(期待名);
    }

    return フォルダ;
  }

  return 親フォルダ.createFolder(期待名);
}


function ファイル名に使える文字へ整える_(値) {
  return String(値 || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}
