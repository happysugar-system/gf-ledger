# GOLD FIRST 高速受付：2026-11-12 現状照合と実装ゲート

## 調査済み（本番変更なし）
- GAS145 の過去共有版は `145_フォーム受付テスト_二重登録防止_全文.txt`。受付キーはシートV列、スクリプトロック内で照合。受付番号 `TEST145-...`。保存先はテスト用スプレッドシート。
- GAS146 の過去共有版は `GF146_元のコード完全復元.gs`。免許証表裏を Google Docs 経由でPDF化し、Driveへ保存。住民票はPDFか郵送。
- Supabase project `tgxrnrqxafytyqfwwsag`: private bucket `gf-secure-intake-staging` 存在、`gf_secure_intake_documents` 9行、`gf_vehicle_fast_intake_jobs` 0行（調査時）。
- Edge Functions `gf-secure-intake-staging-test` v8、`gf-vehicle-fast-intake-admin-test` v2 は稼働中だが **Supabase Auth 管理者専用**。公開受付には使えない。

## 検出した修正候補（未修正）
1. `gf-vehicle-fast-intake-admin-test` の `verify_staging_test` は `storage_status` に `staged` または `transferred` を許可。一方 `gf_secure_intake_documents` の CHECK は `staged` / `drive_verified` / `failed`。後続のDrive検証済み状態は `drive_verified` で統一する必要がある。
2. 現行の書類テストAPIは `x-test-receipt` をクライアントが指定でき、管理者認証だけで保存する。一般利用者に公開せず、GASでLINEトークン検証後に発行する短命・受付限定権限を別APIで実装する。
3. `verify_staging_test` は `STAGING-<UUID>` のみを受理。GAS145の `TEST145-...` をそのまま渡せない。サーバー側でIDの関連付けが必要。
4. 現行のGAS145のシート保存を完了させるだけでは免許証・住民票は保護されない。**必須書類がprivate Storageへ保存・ハッシュ照合されるまで受付完了表示禁止**。
5. `GF115` は既存の受付反映処理と二重起動しない設計が必要。Drive転送ワーカーが成功しても同じ受付キーで再実行して二重反映しない。

## 次の実装順
1. `GF_FAST_事前診断.gs` をテストGASで手動実行し、結果を確認（診断は読み取り専用）。
2. 既存の管理者テストAPIは変更せず、一般受付専用の署名検証・一回限りセッションAPIを別名で実装する。秘密鍵はGASスクリプトプロパティ／Supabase Secretsにのみ保存。
3. 受付IDをサーバーで発行し、既存のGAS145受付番号との関連を保存。本人確認はCORS/Originに依存しない。
4. 書類アップロード（JPEG/PNG、PDF、郵送）を新規APIに接続。private Storageへの保存、マジックバイト、サイズ、SHA256、再送時の同一性を確認。
5. 保存確認後だけ画面に受付番号を表示。Drive保存・PDF結合・GF115反映は冪等な後続処理にする。
6. ダミーで新規・重複・郵送・期限切れ・サイズ超過・転送失敗・再試行を検証してから切替。

## 本番保護
- GAS100/140/145/146、GAS132〜136、LINE Webhook、現行フォームは変更しない。
- 管理者専用Edge Functionsと既存データは変更しない。
- ここに記した確認は**公開フォームからのE2E成功を意味しない**。
