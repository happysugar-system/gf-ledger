# 書類再提出・スタッフ承認の検証手順

## 接続前の確認

- 検証用の Supabase、GAS、受付シート、Drive を同じ環境の組として確認する。公開済みの本番 Edge Function や GAS デプロイは事前承認を得てから変更する。
- `goldfirst-demo` には書類再提出用の2テーブルと `gf_demo_applications` がある。 `goldfirst-tokyo-test` には `gf_mypage_applications_prod` があり、書類再提出用テーブルは確認時点で未作成。現在のマイページとスタッフ API の申込照合には後者のテーブルを使うため、検証用の申込と申請が同一プロジェクトに揃っていることを確認する。
- 書類テーブルが無い場合はマイページリポジトリの `docs/driver-document-review-requests.sql`、続けて `docs/driver-document-attempts.sql` を確認した上で適用し、このリポジトリの `supabase/validation/document-approval-claim.sql` をトランザクション内で適用する。

## 検証用 Apps Script への組み込み

1. マイページの開発ブランチから `GF_DocumentApprovalBridge.gs` と `GF_DocumentApprovalSave.gs` を追加する。バックアップ（12）では `100_LINEお問い合わせFAQ` と `192_GitHub受信入口` の両方に `doPost` がある。検証デプロイが実際に使う `doPost` を特定し、その冒頭に次の2行を追加する。
   ```js
   const documentApprovalResponse = GF_DocumentApprovalRoute_(e);
   if (documentApprovalResponse !== null) return documentApprovalResponse;
   ```
2. 検証プロジェクトの `GF215_BOOK_ID` と `GF_DOCUMENT_APPROVAL_SHEET_ID` が同じ検証用受付シートを示すことと、`GF216_PROD_FOLDER_ID` が検証データ用の Drive フォルダを示すことを確認する。高度な Google サービスは Drive v3 と Sheets v4 を使う。 `GF_DOCUMENT_DRIVE_ALLOWED_EMAILS` には、ルートから個別ファイルまでアクセスを認める個人アカウントをカンマ区切りで登録する。全員、ドメイン、グループ共有は現行アダプターで拒否する。
3. 同じ32文字以上の高エントロピーの秘密を GAS スクリプトプロパティと Supabase Edge Function のシークレット `GF_DOCUMENT_BRIDGE_SECRET` に保存する。Edge の `GF_DOCUMENT_APPROVAL_BRIDGE_URL` に検証用 GAS の `/exec` を設定する。
4. 検証用 Edge Function と GAS を配置する。テスト対象をすべて確認した後、GAS の `GF_DOCUMENT_APPROVAL_WRITE_ENABLED`、Edge の `GF_DOCUMENT_REVIEW_WRITE_ENABLED` と `GF_DOCUMENT_APPROVAL_BRIDGE_ENABLED` を検証環境でのみ `YES` にする。スタッフ画面には対象 Edge Function を設定する。

## 操作確認と復旧

- 検証用の再提出済み申請を承認し、受付シートの書類リンクと確認欄、Supabase の `approved`、マイページ再読込後の通知解除を確認する。同じ申請を別タブで差し戻しても、承認中に状態を変更できないことを確認する。
- 郵送の住民票は既存の書類確認を使用し、再提出依頼や承認操作の対象から外れていることを確認する。Drive ACL に未許可アカウントを持つ合成テストファイルは承認できないことを確認する。
- `approving` が残った場合は、同じ申請を作り直す前に GAS 実行が終了したことを確認する。受付番号、DriverID、最新提出のファイルID、リンク、確認欄を照合する。両セルの保存が確認できた場合だけ対応する申請を管理者が `approved` に確定する。書き込みが一切なかったと確認できた場合は、その申請を `submitted` に戻す。結果を判別できない場合は保留する。
- ロールバック時は Edge と GAS の書き込みフラグを先に停止する。 `approving` の案件を確認してから旧バージョンに戻す。既存の提出データを削除しない。

## 別途接続して確認する箇所

- ドライバー再提出の実アップロードは、既存 LINE 認証後の申込・DriverID照合、GASの保存検証、`gf_record_document_attempt` の確定までの実経路が必要。
- 月別納車管理の読み取りとは別に、納車完了は既存スタッフ認証済みワーカーから `GF_DeliveryCompletionDispatch_` を呼び、既存の割当照合と同期後の再読込を接続する必要がある。
