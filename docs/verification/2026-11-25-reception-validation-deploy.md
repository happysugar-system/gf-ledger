# GOLD FIRST スタッフ検証環境の配備記録

## 配備先

- Supabase: goldfirst-demo (zwprphmfgobkektzsuti) のみ。
- Edge: gf-line-reception-admin v2。配備コードは supabase/validation/gf-line-reception-admin/index.ts。
- 権限テーブル: public.gf_reception_access。適用したSQLは supabase/validation/202611250001_validation_reception_access.sql。
- スタッフ検証画面: https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site 。所有者向けの別配備。8edcd78の line-reception-admin.html を index.html として配置し、waitingValidationMode を常に true にした。
- Webの既存本番アプリ、テストシート、GAS、R01～R03を変更していない。停止・削除は未実行。

## 権限と隔離

本番と同様にSupabase Authのユーザーセッションをサーバー側で検証し、メールアドレスがACLの有効な owner または staff に一致したときだけ処理する。配備版は本番プロジェクトを拒否する。LINE受付は既存検証ブックに固定し、別IDが環境変数に設定された場合は拒否する。検証APIは一覧・詳細・事前照合・名変待ち登録だけを受け付ける。ACLにはRLSが有効で、anon/authenticatedの直接読取権限なし、バックエンドにはSELECTあり。

## 結果

実Edgeで検証画面オリジンのpreflight 204、未ログイン401、無効セッション401、別オリジン403を確認した。スタッフ権限なし403、受付不一致409、別ブック拒否、GAS宛てHMAC署名と応答消失後の再送・登録済み応答は模擬試験。Apps Scriptの直接署名検査、期限、接続先照合はローカル試験。本番・共通検証の実データに書き込む一貫試験は未実施。

既存の検証Authアカウントが1件あり、メール確認と過去のログインを確認した。今回のACLに追加したアカウントはない。ログインリンク送信、実セッションでの権限なし403、検証スタッフでの受付一覧は未確認。

## 実地テストの開通条件

1. 検証スタッフとして使うアカウントを特定し、当該アカウントだけに demo の ACL の staff を設定する。検証画面からのメールリンクを使う場合は demo Auth の Redirect URLs に https://goldfirst-staff-validation.rompinghydrangea4.chatgpt.site/?waiting-validation=1 を追加し、メールの配送と戻り先を確認する。
2. 検証のLINE受付ブックだけを読めるGoogleサービスアカウントを使い、demoの GF_GOOGLE_SERVICE_ACCOUNT_JSON に管理画面から設定する。受付一覧と照合を確認する。本番サービスアカウントの秘密を検証へ流用しない。
3. 上記の後、既存検証GASを docs/waiting-validation-install.md のコードと手順で一括準備する。検証用 /exec、署名用設定、EdgeとGASの有効化フラグを一致させる。秘密値はチャットやGitHubに記録しない。
4. R04で正常登録、再送、並行送信を検証する。その後に割当・取消・再割当・進捗と納車日・台帳直編集・Supabase・マイページを試験する。既存試験ワーカーに固定IDが残る場合はR04へ書き込みを行う前に解消する。

停止時は検証EdgeとGASの登録フラグを無効化する。旧配信版とソースを控え、影響行の個別復旧を行う。既存リソースの削除は不要。
