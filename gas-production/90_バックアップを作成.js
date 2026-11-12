/**
 * 90_バックアップ.gs
 *
 * GOLD FIRST 新システム
 * 対象スプレッドシートを毎日バックアップする。
 *
 * 保存先：
 * Drive親フォルダ
 * └─ 99_バックアップ
 *
 * 保持期間：30日
 */


/**
 * 毎日のバックアップ本体
 */
function GOLD_FIRST毎日バックアップ() {
  const ss = 対象スプレッドシートを開く_();
  const 親フォルダ = Drive親フォルダを取得する_();

  // バックアップフォルダ取得・作成
  let バックアップフォルダ =
    既存子フォルダを取得する_(親フォルダ, '99_バックアップ');

  if (!バックアップフォルダ) {
    バックアップフォルダ =
      親フォルダ.createFolder('99_バックアップ');
  }

  // 元スプレッドシート
  const 元ファイル = DriveApp.getFileById(ss.getId());

  // バックアップ名
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const 日時 = Utilities.formatDate(
    new Date(),
    tz,
    'yyyy-MM-dd_HHmm'
  );

  const バックアップ名 =
    'GOLD FIRST_バックアップ_' + 日時;

  // コピー作成
  const コピー =
    元ファイル.makeCopy(
      バックアップ名,
      バックアップフォルダ
    );

  // 30日より古いバックアップを削除
  GOLD_FIRST古いバックアップを削除_(
    バックアップフォルダ,
    30
  );

  Logger.log(
    'バックアップ完了：' +
    コピー.getName() +
    ' / ' +
    コピー.getUrl()
  );

  return コピー.getUrl();
}


/**
 * 指定日数より古いバックアップをゴミ箱へ
 */
function GOLD_FIRST古いバックアップを削除_(
  バックアップフォルダ,
  保持日数
) {
  const 現在 = new Date();
  const 境界 =
    new Date(
      現在.getTime() -
      保持日数 * 24 * 60 * 60 * 1000
    );

  const files =
    バックアップフォルダ.getFiles();

  while (files.hasNext()) {
    const file = files.next();

    // この機能で作ったバックアップだけ対象
    if (
      !file.getName().startsWith(
        'GOLD FIRST_バックアップ_'
      )
    ) {
      continue;
    }

    if (file.getDateCreated() < 境界) {
      file.setTrashed(true);

      Logger.log(
        '古いバックアップ削除：' +
        file.getName()
      );
    }
  }
}


/**
 * 初回だけ実行する。
 *
 * ・既存の同名トリガーを削除
 * ・毎日午前2時台にバックアップ
 * ・設定直後に1回バックアップして動作確認
 */
function GOLD_FIRST毎日バックアップを設定する() {
  const handler =
    'GOLD_FIRST毎日バックアップ';

  // 同じトリガーの重複を防止
  ScriptApp
    .getProjectTriggers()
    .forEach(function(trigger) {
      if (
        trigger.getHandlerFunction() ===
        handler
      ) {
        ScriptApp.deleteTrigger(trigger);
      }
    });

  // 毎日午前2時台
  ScriptApp
    .newTrigger(handler)
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  // その場で1回バックアップ
  const url =
    GOLD_FIRST毎日バックアップ();

  Logger.log(
    '毎日バックアップ設定完了'
  );

  return url;
}
