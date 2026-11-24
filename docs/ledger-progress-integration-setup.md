# GOLD FIRST 車両進捗：GAS 接続テスト手順（2026-11-24）

> **検証環境限定。GOLD FIRST 本番GAS、本番スプレッドシート、本番Supabaseは更新しないこと。**

## この版で実際に変更済み

- 専用ダミー台帳 `1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU` の `車両台帳` に `M1:納車可能日`、`N1:納車確定日` を追加。2行目以降は yyyy-mm-dd 日付書式。元の `A列 区分/ステータス` の入力規則と `K列 GPS有無` のチェックは維持。
- **goldfirst-demo** の Edge `gf-assignment-integration-worker-test` を拡張。既存の固定ダミー車両だけ、5進捗と2つの日付を含む14項目を受け付ける。Bearer ではなく既存の `GF_VEHICLE_DEMO_SYNC_TOKEN` によるGAS専用認証。
- デモDBの `gf_assignment_progress_sync_test` トリガーを拡張。車両レプリカの管理区分・納車日からマイページ用進捗を更新し、段階戻しでは未来段階の日付を消す。
- 編集受付 `gf-assignment-progress-ui-test`、受付テーブル `gf_assignment_progress_ui_queue_test`、GASワーカー用 `gf-assignment-progress-queue-worker-test` を追加。スタッフの検証用Supabaseアカウントと既存の許可リストだけを認証する。
- スタッフ画面： https://happysugar-system.github.io/gf-ledger/vehicle-driver-management-progress-save-test.html
- 進捗表示の確認： https://happysugar-system.github.io/gf-ledger/mypage-assignment-progress-test.html

## 実際の検証用GASに必要な操作（まとめて1回）

**既存のGFIテスト用GASプロジェクトだけ**を開く。既存コードのバックアップを保管してから以下を行う。現在のGASと以前共有済みのコードが異なる場合は停止し、最新の関数2本を共有して照合する。

1. 既存の `function GFI_実行_(assign)` の定義を丸ごと削除する。ほかの `GFI_確認_`、`GFI_読取_`、`GFI_反映_`、`GFI_通信_`、`GFI_割当テスト`、`GFI_取消テスト` は残す。
2. 既存の `function GFI_UI受付処理()` の定義だけを削除する。既存の `GFI_UI通信_` と `GFI_UI自動同期設定` は残す。
3. GASで新しいスクリプトファイル名 `GFI_PROGRESS_TEST` を追加し、下の**結合版コード全文**を貼り付けて保存する。
   - [結合版コードを開く](https://github.com/happysugar-system/gf-ledger/blob/test/ledger-progress-20261124/integrations/gas/GFI_PROGRESS_INSTALL_BUNDLE_TEST.gs)
   - [直接コピー用RAW](https://raw.githubusercontent.com/happysugar-system/gf-ledger/test/ledger-progress-20261124/integrations/gas/GFI_PROGRESS_INSTALL_BUNDLE_TEST.gs)
4. 左メニューの**サービス → ＋ → Google Sheets API → 追加**。既存のGoogle Sheets APIが有効なら再追加不要。
5. `GFI_進捗接続診断_読取のみ` を手動実行し、ログに「進捗テスト接続OK」が出ることを確認する。読み取りと接続確認だけで、データやプロパティを書き換えない。
6. 既存の `GFI_UI受付処理` の1分間隔トリガーはそのまま使う。**同名のトリガーを二重作成しない。** 既存トリガーがない場合に限り `GFI_UI自動同期設定` を1回実行。

**スクリプトプロパティは変更しない。** 以前設定済みの `GF_VEHICLE_DEMO_SYNC_TOKEN` を引き続き利用する。値を画面やチャットに公開しない。

## 画面からの実保存テスト

1. [既存の割当・取消検証画面](https://happysugar-system.github.io/gf-ledger/vehicle-driver-management-integration-live-test.html) に検証スタッフとしてログインし、`TEST-V01 / TEST-001 / D999901` が割当済みであることを確認。未割当なら先に割当。
2. [スタッフ進捗保存画面](https://happysugar-system.github.io/gf-ledger/vehicle-driver-management-progress-save-test.html) に同じ検証アカウントでログイン。管理区分を `車両手配済み`、納車可能日を `2026-12-01`、納車確定日を `2026-12-03` にして保存。
3. 保存受付が `verified` になったら、**検証スプシ `車両台帳` の B2/M2/N2** と [マイページ進捗表示](https://happysugar-system.github.io/gf-ledger/mypage-assignment-progress-test.html) を再読み込みして一致を確認する。
4. `車両台帳` の **M2** だけを手動で `2026-12-02` に変更。既存GASの1分間隔同期後に Supabase とマイページ側も同じ日付になったことを確認。タイムアウトした場合、同じ受付IDを新規発行せず状況を確認する。
5. 管理区分が `車両手配済み` または納車日が存在する状態での割当取消は、**検証用取消ガード**が拒否する。正式運用での取消可否は社長との合意待ち。解除する必要がある場合は、まず進捗を `車両準備中` に戻して2つの日付を空欄にし、同期済みを確認してから既存の取消画面を利用する。

## 保護対象・未完了

- 保存するのは `管理区分`、`納車可能日`、`納車確定日` の3項目だけ。車両の `区分/ステータス`、個人情報、予定、カレンダー、LINE本人認証、写真・書類は変更しない。
- フロントは手入力だが、**検証用保存サーバーは5つの既存進捗ラベルのみ許可**。`名義変更準備中` など社長との正式文言のすり合わせは本番移行前に必要。
- 現在の同期はテストレコード1件のみに固定。検証用GASを本番プロジェクトに貼り付けることは厳禁。
- GASワーカーは処理中に障害が起きると `reconciliation_required` で停止する場合がある。二重送信せず、GAS実行ログと受付IDを照合する。自動再処理は安全上まだ有効にしていない。
- GitHubコードの構文検証とSupabaseのトランザクションテストは通過済みだが、**スタッフ画面 → GAS実保存 → スプシ → Supabase → マイページの実機総合テストは、上記GAS反映前のため未実施**。
- 本番デプロイ、既存の本番GAS、実ドライバーのLINEマイページ表示経路は変更していない。
