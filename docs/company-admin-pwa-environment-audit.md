# GOLD FIRST PWA 認証：実環境確認結果とデプロイ停止条件

確認日：2026-11-14

## 読み取り確認（Supabase）
- `goldfirst-tokyo-test` / `tgxrnrqxafytyqfwwsag`: `gf_company_admin_identities`、`gf_company_line_member_requests`、`gf_company_admin_pairings`、`gf_company_admin_device_sessions` の4テーブルは存在しない。
- `goldfirst-demo` / `zwprphmfgobkektzsuti`: 既存の `gf_company_admin_identities` と `gf_company_line_member_requests` は存在。新規 `gf_company_admin_pairings` と `gf_company_admin_device_sessions` は存在しない。

## 結論
`goldfirst-tokyo-test` に現行の認証試作をデプロイしても、管理者テーブルもLINEチャンネル設定も未確認なので正常動作しない。デモ環境に新規関数を直接デプロイする前にも次を満たす必要がある。

1. 新規認証テーブルとサーバー限定の原子的レート制限を検証環境に適用
2. Edge Functionsに `GF_DEMO_LINE_LOGIN_CHANNEL_ID` があるか確認（秘密値をGitHubに書かない）
3. `cf-connecting-ip` の信頼できる提供元を実環境で検証し、認証レート制限が動くことを確認
4. LINE LIFFエンドポイントとGitHub Pagesの実際の公開パスを一致させる
5. PWA認証済みセッションを承認管理画面のAPI呼び出しに接続
6. 期限切れ、複数端末同時利用、管理者権限取り消し、ログアウトをテスト
7. 本番に関わる既存Edge Functionとテーブルを変更しない

## 今回の追加修正
- 認証コード12桁の生成を、乱数の剰余バイアスを除いた方式に変更
- IPアドレスが取得できない場合はレート制限を回避させず、認証処理を停止する（本番環境でヘッダー確認必須）
- ポーリングは通常の認証試行回数制限から分離済み

**DBマイグレーション、Edge Functionデプロイ、GitHub Pages公開は未実施。**
