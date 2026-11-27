# 車両依頼受付の高速化（検証環境）

## GAS100（LINE受付の検証コピー）

同梱の GF_FAST_車両依頼.gs を追加します。検証コピーで既存の `GF_車両テスト送信_` と `GF115_車両依頼受付へ反映_` を、`gas/fast-intake-patches/` の同名関数で差し替えます。既存の他の関数は残します。LINE入口の認証・完了画面への遷移・マイページの案内を従来どおり使います。

## GAS140（LINE認証・書類保存の検証コピー）

同じ GF_FAST_車両依頼.gs を追加し、既存 doPost(e) の先頭に追加します。

```javascript
const fastAction = String((e && e.parameter && e.parameter.demo_action) || '');
if (['gf_fast_stage_v1','gf_fast_transfer_v1','gf_fast_cleanup_v1'].includes(fastAction)) {
  return GF_FAST_receiver_(e);
}
```

GF146の既存PDF後処理トリガーを有効化します。既存の免許証・住民票サブフォルダ名と保存先設定を使います。

## 車両管理GAS（検証コピー）

既存の GF138 の本体に引数 `onlyRequest` を追加します。
行ループ内で `requestKey` を取得した直後に `if (onlyRequest && requestKey !== onlyRequest) continue;` を追加します。
既存の書類状態確認は以下の条件に差し替えます。これにより一時保存完了行は、車両管理側から要求キーを指定した場合のみ即時同期します。

```javascript
!(get('書類状態') === '保存完了' ||
  (onlyRequest && ['一時保存完了・Drive転送待ち','Drive保存完了・一時ファイル削除待ち'].includes(get('書類状態'))))
```

検証コピーの `GF138_LINE_BOOK_ID` を検証LINE受付ブックに向け、既存の本番ブックID照合を検証車両台帳のIDとの照合に変更します。同梱の GF_FAST_ドライバー即時同期.gs を追加し、既存 doPost(e) の先頭で以下を接続します。

```javascript
if (e && e.parameter && e.parameter.action === 'gf_fast_driver_sync_test_v1') {
  return GF_FAST_driverEndpoint_(e);
}
```

## 検証用プロパティと操作順

1. 検証用コピーのGAS140に既存のブリッジ設定と `GF_FAST_RECEIVER_TEST_BOOK_ID`（145の検証ブックID）、`GF_FAST_RECEIVER_TEST_FOLDER_ID`（検証用書類フォルダID。`GF146_TEST_FOLDER_ID` と一致）、検証Supabaseの既存 `GF_FAST_INTAKE_SECRET` と同値を設定します。鍵は各管理画面の設定欄に登録します。
2. 車両管理の検証用GASで `GF_FAST_DRIVER_SECRET`（十分に長いランダム値）、`GF_FAST_VEHICLE_TEST_BOOK_ID`、`GF_FAST_LINE_TEST_BOOK_ID` を設定して検証用Webアプリを更新します。
3. 検証用GAS100に車両管理の検証用URLを `GF_FAST_DRIVER_TEST_URL`、同じ同期用の鍵を `GF_FAST_DRIVER_SECRET`、検証LINE受付のブックIDを `GF_FAST_LINE_TEST_BOOK_ID` に設定します。既存ブリッジURLは検証用GAS140へ向けます。
4. GAS100と140で `GF_FAST_TEST_ENABLED=true` を設定し、検証用のデプロイを更新します。GAS100で `GF_FAST_workerInstall` を一度実行します。
5. 検証専用フォームの `GF_VEHICLE_SUBMIT_URL` が検証GAS100の `/exec` を指し、検証LINEがそのフォームを発行することを確認します。検証LINEの「車両依頼」から架空の連絡先とダミー画像／PDFを送信します。受付番号とマイページ案内を確認し、LINE受付・ドライバーマスターで対応する一件を確認します。住民票の郵送とPDF提出は別々に実行します。
6. DriveとシートのURLが反映され、書類状態が「保存完了」になることを確認します。転送エラーを検証用Driveで再現し、設定復旧後に同じ受付で転送が完了することを確認します。
7. 旧経路と高速経路で同じサイズのダミー書類をそれぞれ3回送り、送信から完了画面までを計測します。GASログの `gf_fast_stage_verified` と `gf_fast_drive` は書類一時保存とDrive転送の内訳です。

## 受付済みの場合の同期失敗・再送の扱い（追記）

- 検証ブランチの最新 GF100 差し替え版を使ってください。最初の `c4e6a0c` のファイルを再貼付しないでください。
- 書類一時保存・GF115の受付反映が成功した後に、ドライバーマスター即時同期が一時失敗しても、申込者に受付エラーは出さず、完了画面へ案内します。`GF_FAST_runWorker` が転送待ちの受付について同期を再試行します。
- ただし、同期の成功を待つ構成が残るため、完了画面が1～3秒で出るとは未検証です。検証GASで旧・新経路の実測値を比較してください。
- GASプロジェクトが本番・検証で共用の場合には、差し替えず、先に独立した検証用コピーを用意してください。
- 秘密鍵の値、免許証や住民票の実データをGitHubのコミット・ログ・チャットに貼らないでください。
- 必ずダミー画像と架空の連絡先で動作試験を実施し、受付番号の再利用・二重発番防止・Drive保存とURL反映・転送失敗後の再試行を確認してから本番移行を検討してください。
