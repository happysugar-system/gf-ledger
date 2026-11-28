# GF3検証GASの実績画面

1. リポジトリのルートで `node scripts/gf3-build-actual-gas.mjs build/gf3-actual` を実行する。
2. 専用検証GASの `GF3_MobileManagement.html`、`GF3_FixtureSnapshot.gs`、`GF3_ActualValidation.gs` を生成版に差し替える。既存の `doGet`、検証オーナー制限、Sheets拡張サービス、既存のスクリプトプロパティを引き継ぐ。
3. エディタから `GF3_ActualHealth` を実行し、`connected: true` を確認する。検証GASの `GF3_ACTUAL_TEST_ENABLED` を `true` にし、既存の検証Webアプリを新バージョンへ更新する。
4. オーナーとして V900005 を開き、受付2の割当後に「貸出・返却」で納車→返却→返却取消→納車取消を順に実行する。納車と返却の受付IDを控え、取消対象に入力する。返却時の前使用者・前DriverID・書類リンクの移動と、取消時の復元を3シートで確認する。検証が終わったら `GF3_ACTUAL_TEST_ENABLED` を戻す。

対象は検証GASの V900005、受付2、D999902。Supabase側には `gf3-actual-storage-test` と `gf3_actual_receipts_test` および遷移RPCが必要。認証情報は検証GASとSupabase側の既存設定を使用する。

「予定」の月別集計は検証台帳の納車予定日と、検証Supabaseで完了中の納車履歴を表示する。納車取消後に予定画面を開くと再集計する。

専用検証台帳に月別納車管理タブがない場合は、オーナーとして `GF3_InstallMonthlyDelivery` を一度実行する。検証用タブを用意し、A4:Cに集計を出力する。既存の同名タブがある場合は、GF3管理用メタデータが付いている場合だけ更新する。納車実績の保存・取消直後に再集計する。

台帳直編集の同期を確認する場合は、専用検証GASで `GF3_LEDGER_SYNC_TEST_ENABLED=true` を設定し、オーナーとして `GF3_InstallLedgerFixtureSync` を一度実行する。直接編集はインストール型編集トリガーで、GASからの更新・集計・失敗後の回復は5分間隔で確認する。同じデータは書き直さない。停止する場合は同期フラグを `false` にする。

LINEマイページの検証入口は、レビュー成果物に含まれる `mypage-assignment-progress-test.html?gf3_liff=<検証用LIFF ID>`。検証用LIFFの登録済みURLで開く。対応する検証用チャネルIDをEdge Functionの `GF3_MYPAGE_LINE_CHANNEL_ID` に設定し、D999902に一意に紐づく検証LINEユーザーで確認する。GitHub Actionsの成果物生成は公開URLを変更しない。検証予定画面は台帳日付と専用予定DBを読み、既存の予定IDとイベントIDを保持する。

「写真・書類」は車両台帳のDriveリンクと書類履歴を参照する。状態写真の保存を検証する場合は、専用検証GASで `GF3_PHOTO_TEST_ENABLED=true` に設定し、V900005の「写真・書類」で撮影日とダミーJPEGを選択する。保存先は検証専用Driveの既存車両フォルダ配下。既存の台帳リンクが別の保存先を指す場合はエラーを返す。検証終了後は写真フラグを `false` に戻す。既存の車両書類PDFの操作入口は「書類登録・PDF・Driveを開く」。
