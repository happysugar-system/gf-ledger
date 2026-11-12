# GAS100 受付完了→初回登録ボタン：レビュー用パッチ

## 調査で確認できた既存処理

過去に共有された `100_LINE受付` のソース（2026-11-08頃の保存版）では、`doPost(e)` が `action=gf_vehicle_submit_test` を `GF_車両テスト送信_(e)` に振り分ける。

`GF_車両テスト送信_` では、
1. `gf_entry` とキャッシュ内のLINEユーザーIDを検証
2. スクリプトプロパティ `GF_VEHICLE_TEST_RECEIVER_URL` / `GF_VEHICLE_BRIDGE_SECRET` で別GASに転送
3. レスポンスをJSON解析して `data.ok === true` を確認
4. `GF115_車両依頼受付へ反映_(p,userId,data,token)` を実行
5. キャッシュの受付トークンを消去
6. **成功HTML**を返す

※ GitHub上の `gf-gas-test` は車両管理側であり、**GAS100受付側とは別プロジェクト**。保存版が現在のGAS100の最新ソースかはまだ確認できていない。現行コードとの照合が必須。

## 変更内容（成功レスポンス１行だけ）

GAS100の現行 `GF_車両テスト送信_(e)` 内で、**上記4・5の処理が成功した後**にだけ、次の呼び出しへ置き換える。

現在の保存版：
```javascript
GF115_車両依頼受付へ反映_(p,userId,data,token);
cache.remove('GF_VEHICLE_ENTRY_' + token);
return result('受付が完了しました', '受付番号：' + String(data.receipt || '').replace(/[^A-Za-z0-9-]/g,''), true);
```

変更案：
```javascript
GF115_車両依頼受付へ反映_(p,userId,data,token);
cache.remove('GF_VEHICLE_ENTRY_' + token);
return GF_車両受付成功マイページ案内_(data.receipt);
```

あわせて `gas100/vehicle-request-success-mypage.gs` の関数をGAS100へ追加する。**元の`doPost`や失敗時の処理、受信・保存処理は変更しない**。

## 動作確認の順序

- [ ] 実際のGAS100プロジェクトの最新ソースと保存版を比較
- [ ] テストGASプロジェクトへ変更案を反映（本番デプロイには触れない）
- [ ] 成功パターンでは、受付番号表示＋初回登録ボタンが出る
- [ ] 失敗パターンでは、成功画面・登録ボタンが出ない
- [ ] 同じトークンの連続送信で重複受付が生じない
- [ ] 登録先でメールOTP→本人照合→管理者承認待ち→DriverID紐付けが正常
- [ ] テストLINEからフォームを開き、受付完了→初回登録→再訪導線を確認

## 重要な制約

- リンクURLに受付番号・氏名・電話番号・メール・LINE ID・免許証データ・トークンを含めない。
- 公開直後に本番車両依頼の受付が発生するため、**接続確認前にデプロイしない**。
- `mypage-prod-test.html` は現時点で**テストページ**なので本番公開前に正式URLを確定する。
- GASプロジェクト内にすでに同名の `GF_車両受付成功マイページ案内_` がないか確認し、重複定義を避ける。
