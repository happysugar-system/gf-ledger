# GF3検証GASの実績画面

1. リポジトリのルートで `node scripts/gf3-build-actual-gas.mjs build/gf3-actual` を実行する。
2. 検証GAS v5のプロジェクトで `GF3_MobileManagement.html` を生成版に差し替え、`GF3_ActualValidation.gs` を追加する。既に同名関数がある場合は、生成ファイルに含まれる4つの元ファイルの定義を生成版に集約して重複を解消する。既存の `doGet`、検証オーナー制限、Sheets拡張サービス、既存のスクリプトプロパティを引き継ぐ。
3. エディタから `GF3_ActualHealth` を実行し、`connected: true` を確認する。検証GASの `GF3_ACTUAL_TEST_ENABLED` を `true` にし、既存の検証Webアプリを新バージョンへ更新する。
4. オーナーとして V900005 を開き、受付2の割当後に「貸出・返却」で納車→返却→返却取消→納車取消を順に実行する。納車と返却の受付IDを控え、取消対象に入力する。返却時の前使用者・前DriverID・書類リンクの移動と、取消時の復元を3シートで確認する。検証が終わったら `GF3_ACTUAL_TEST_ENABLED` を戻す。

対象は検証GASの V900005、受付2、D999902。Supabase側には `gf3-actual-storage-test` と `gf3_actual_receipts_test` および遷移RPCが必要。認証情報は検証GASとSupabase側の既存設定を使用する。
