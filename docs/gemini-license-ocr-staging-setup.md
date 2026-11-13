# Gemini免許証OCR：デモ環境セットアップ

対象: Supabase project `goldfirst-demo` (`zwprphmfgobkektzsuti`) の **gf-license-ocr-staging** のみ。本番環境は触らない。

## 1. Edge Function Secrets
Supabase Dashboard → goldfirst-demo → Edge Functions → Secrets に設定:
- `GEMINI_API_KEY`: 現行GASのScript Propertiesにあるキーを**管理画面で直接**登録。チャットやGitHubには貼らない。
- `GF_GEMINI_MODEL`: まず `gemini-2.5-flash`。既存GASのモデル名は実稼働を保証しないので、利用可能モデルを確認。
- `GF_OCR_TEST_USER_IDS`: デモプロジェクトの Authentication → Users で確認した **テスト担当者のuser UUID**。複数の場合はカンマ区切り。

Supabase標準の `SUPABASE_URL`, `SUPABASE_ANON_KEY` は自動提供される環境では再設定不要。ない場合は管理画面で確認。

## 2. 動作テスト
1. デモのテストユーザーでSupabase Authログインし、access_tokenを取得する（GitHub Pagesの公開コードに埋め込まない）。
2. `POST https://zwprphmfgobkektzsuti.supabase.co/functions/v1/gf-license-ocr-staging`
3. `Authorization: Bearer <access_token>`、`Content-Type: application/json`、本文 `{"mime_type":"image/jpeg","image_base64":"<base64>"}`
4. 最初は**架空のテスト画像**を使用。実際の免許証は送らない。
5. 応答の `ai_ms` と `total_ms` を計測。GASと同じ画像・同条件で複数回比較する。

## 安全上の注意
- 読み取り結果は**氏名の文字認識のみ**。本人確認・DriverID自動紐付けには使用しない。
- このテストFunctionはデータベース・Google Sheets・Drive・LINEには書き込まない。
- 本番切り替えは精度、遅延、本人確認手順、アクセス権限、個人情報の保存方針を確認してから別途実施。
- 失敗時はEdge Functionのログを確認する。ログに免許証画像や氏名を出さない。
