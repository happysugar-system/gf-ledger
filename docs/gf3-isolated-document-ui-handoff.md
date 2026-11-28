# GF3 書類専用スマホ・PC操作テスト画面（検証GAS専用）

2026-11-28。書類保存・再送・取消の**実地APIテストは既に合格**（`docs/gf3-document-live-acceptance-20261128.md`）。ここでは同じ保存経路をスタッフ向け操作画面から試すための**コード**を追加した。**GASへのインストール・デプロイ・操作URLの発行は未実施**。本番環境は無変更。

## ソース

- `integrations/gas/review/GF3_DocumentIsolatedUI.gs`：厳密なGoogleアカウント許可、書類UI用サーバーブリッジ、画像復号・JPEG直接判定、既存GF3書類API呼び出し。
- `integrations/gas/review/GF3_DocumentIsolatedUI.html`：スマホ/PC対応、ダミーJPEG3枚の無変換転送、セッション内で受付ID維持、保存/同一受付再送/取消、PDF閲覧。

## 導入前の必須確認（Work/検証GAS担当）

1. **専用検証GASのみ**。スクリプトID `1h5czlOaSO0WeERVDxiGajVipVL4PAVyWPdaIB0kGVZsR11GMU12JwEE-` と台帳ID `1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0` を実確認。**本番GASには入れない**。
2. 検証GASの既存 `doGet`、共通関数名を棚卸し。重複定義は作らない。既存 `doGet` がなければ検証GAS限定で `function doGet(e){return GF3_DocumentUiDoGet_();}` を追加。既にある場合は、その既存ルーターが本番経路を参照しないことを確認した上で専用画面だけに安全に振り分ける。安全な分岐が作れなければ公開しない。
3. GASの配備HTMLファイル名は正確に `GF3_DocumentIsolatedUIView`（`.html`）。GitHub上のHTMLは `GF3_DocumentIsolatedUI.html` として管理し、配備時に名前を合わせる。`GF3_DocumentUiStatus`/`GF3_DocumentUiSave`/`GF3_DocumentUiCancel` は公開ブリッジ、末尾アンダースコア付きの実処理は非公開ヘルパー。
4. `GF3_DOCUMENT_UI_OWNER_EMAIL` に**実際の検証用GAS操作アカウント**を設定する。ブラウザユーザーとGAS実効ユーザーのメールが両方一致しない場合はアクセス拒否。**個人情報や秘密鍵をHTMLに埋め込まない**。
5. ウェブアプリは検証用Googleユーザーで実行する設定（`User accessing the web app`）かつ最小限の公開範囲。Googleアカウントの承認が必要になる可能性あり。匿名・全体公開・実行者＝スクリプト所有者にする構成は不可。
6. `GF3_DOCUMENT_TEST_ENABLED` は既定OFFを維持。権限・画面アクセスの動作確認後、ダミー `V900005` 限定で短時間だけONにし、`try/finally` で元に戻す。 `GF3_MIGRATION_VERIFIED`、`GF3_SYNC_ENABLED` はOFFのまま。
7. 保存結果をDrive PDF、Supabase receipt、台帳最新PDFの3点で突合。再送は同一URL、取消は台帳リンク復元とDrive `archived` を確認。テスト後は書類フラグOFF・匿名アクセス不可・履歴の状態と権限を再確認。

## 現時点の検証

- GAS関数とブラウザスクリプトのJavaScript構文チェック成功。
- Googleアカウント不一致・空メール拒否、書き込みフラグOFF拒否、表示ステータスの模擬テスト5件合格。
- 実ブラウザ操作、実Google認証、GAS公開URL、画像保存/取消の画面経由テストは**未実施**。

## 注意

この画面は書類操作専用。車両割当・納車・返却・予定・ドライバーマイページには**接続していない**。既存の `mobile-management/index.html` は読取専用画面で、現状 `gf-mobile-vehicles-read` など別経路のAPIを参照する。ダミー3シートへ隔離した真正のエンドポイントであることを証明するまで、本番用の操作URLとして扱わない。

全体3シート移行の完了認定、旧シート依存解消、実カレンダーへの書き込みテスト、本番移行許可は別工程。

## 2026-11-28 Googleウェブアプリの限定配備

- 実行ユーザー：ウェブアプリにアクセスしているユーザー。アクセス範囲：自分のみ。
- 配備URL（オーナーGoogleアカウントのみ）： https://script.google.com/macros/s/AKfycbxrRj75HIxUGPCXBODJFDkEP-YLtvKyH73wQdvgQmFUNQdWSgq-wmrGI9FLcpc5YRH2sA/exec
- GAS HTML名が `GF3_DocumentIsolatedUIView` であるため、`GF3_DocumentUiDoGet_` の参照名を合わせた GitHub 修正を保存。**この変更は検証GASへの再反映未確認**。
- クラウドブラウザでは Google の「現在、ファイルを開くことができません」で停止。`自分のみ` の権限制限が原因である可能性はあるが未確定。本人アカウントでの表示成功、`doGet` の例外、デプロイの反映バージョン、実操作の成否は未確認。403/Googleファイルエラーをアプリ成功とみなさない。
- `GF3_DOCUMENT_TEST_ENABLED` は OFF。UI表示のために ON にしない。`GF3_MIGRATION_VERIFIED` と `GF3_SYNC_ENABLED` も OFF。
- 次の確認は、配備したオーナーGoogleアカウントで `/exec` を開いて見出し「車両書類・操作テスト」が表示されるか、GAS「実行数」の `doGet` 成否、バージョンとHTML名を照合。オーナーでも失敗する場合はGoogleの認証、URL・デプロイ公開範囲、`GF3_AssertBook_` と `GF3_DOCUMENT_UI_OWNER_EMAIL` を切り分ける。無断でアクセスを全体公開に変更しない。
