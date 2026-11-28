# GF3検証GASの実績画面

1. リポジトリのルートで `node scripts/gf3-build-actual-gas.mjs build/gf3-actual` を実行する。
2. 専用検証GASの `GF3_MobileManagement.html`、`GF3_FixtureSnapshot.gs`、`GF3_ActualValidation.gs` を生成版に差し替える。既存の `doGet`、検証オーナー制限、Sheets拡張サービス、既存のスクリプトプロパティを引き継ぐ。
3. エディタから `GF3_ActualHealth` を実行し、`connected: true` を確認する。検証GASの `GF3_ACTUAL_TEST_ENABLED` を `true` にし、既存の検証Webアプリを新バージョンへ更新する。
4. オーナーとして V900005 を開き、受付2の割当後に「貸出・返却」で納車→返却→返却取消→納車取消を順に実行する。納車と返却の受付IDを控え、取消対象に入力する。返却時の前使用者・前DriverID・書類リンクの移動と、取消時の復元を3シートで確認する。検証が終わったら `GF3_ACTUAL_TEST_ENABLED` を戻す。

対象は検証GASの V900005、受付2、D999902。Supabase側には `gf3-actual-storage-test` と `gf3_actual_receipts_test` および遷移RPCが必要。認証情報は検証GASとSupabase側の既存設定を使用する。

「予定」の月別集計は検証台帳の納車予定日と、検証Supabaseで完了中の納車履歴を表示する。納車取消後に予定画面を開くと再集計する。

専用検証台帳に月別納車管理タブがない場合は、オーナーとして `GF3_InstallMonthlyDelivery` を一度実行する。検証用タブを用意し、A4:Cに集計を出力する。既存の同名タブがある場合は、GF3管理用メタデータが付いている場合だけ更新する。納車実績の保存・取消直後に再集計する。

台帳直編集の同期を確認する場合は、専用検証GASで `GF3_LEDGER_SYNC_TEST_ENABLED=true` を設定し、オーナーとして `GF3_InstallLedgerFixtureSync` を一度実行する。直接編集はインストール型編集トリガーで、GASからの更新・集計・失敗後の回復は5分間隔で確認する。同じデータは書き直さない。停止する場合は同期フラグを `false` にする。

LINEマイページの検証入口は `integrations/edge/gf3-line-mypage-test.ts`。既存LINE認証でD999902に一意に紐づく検証ユーザーと、検証用LINEチャネル設定が必要。既存のマイページ入口は引き続き利用できる。検証予定画面は台帳日付と専用予定DBを読み、既存の予定IDとイベントIDを保持する。
