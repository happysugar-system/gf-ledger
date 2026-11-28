# GOLD FIRST: 最短統合検証の現状 (2026-11-28)

## 確認済み
- 書類: ダミー V900005 のJPEG3点→PDF→Drive→Supabase→台帳、同一受付再送、取消と復元はGAS実地合格。書込フラグOFF。
- 1851dfb: mobile-management/index.html から本人限定の書類GASを開く入口だけ。統合版保存は未接続。
- mobile-management/index.html のデータ読取は gf-mobile-vehicles-read / gf-mobile-namechange-read / gf-mobile-vehicle-links-read と Supabase JWT + gf_staff_access_self。これらのAPIがGF3検証3シートだけを読むことは未確認。
- mobile-management/demo-save.mjs と assignment-save.demo.mjs は別検証プロジェクト zwprphmfgobkektzsuti / TEST-V01 用。現在のGF3検証プロジェクト tgxrnrqxafytyqfwwsag / V900005 の代わりには使えない。
- 既存GitHub Pages デプロイワークフローは main ブランチのみ。
- レビューブランチに追加した gf3-review-pages-artifact.yml は静的HTMLのCI成果物を作るだけ。公開サイトや操作URLはまだ作らない。実行結果も未確認。

## 最短順の実装対象
1. GF3検証台帳 (車両台帳/名変待ち管理/ドライバーマスター) を参照し、スタッフ認証を必須とする検証専用の読取APIを確立する。UIでV900005と検証用受付を再読取できることを確認する。
2. 合格済みのGF3割当・取消ロジックを同じ検証台帳への保存経路と接続し、受付ID/VehicleID/DriverID一致、排他、二重受付防止、再読取を確認する。車両台帳A列は保持。
3. 既存の進捗管理、納車/返却の履歴ワーカーをGF3専用に接続し、古いTEST-V01デモAPIを混ぜない。
4. 既存の書類GASへ開く導線はそのまま利用し、PDF処理を作り直さない。
5. 既存の予定イベントID、予定種類マスター、Googleカレンダーを無断で変更・再作成せず、読取接続を優先する。
6. mainとは別の検証ホストを使うまではGitHub Pages統合稼働と称しない。検証用API、ログイン、実保存、ブラウザ再読取が通ってから操作URLを案内する。

## 禁止
- mainへのpush/merge、既存Pages変更、既存本番GAS・本番台帳変更。
- GF3_MIGRATION_VERIFIED / GF3_SYNC_ENABLED の無条件ON。
- 別検証Supabaseプロジェクトのデモ保存をGF3で成功したとみなすこと。
- UIのリンクだけを接続完了とみなすこと。