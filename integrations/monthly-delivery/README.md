# 月別納車管理 統合引き継ぎ
既存の車両・ドライバー管理HTMLの内部に組み込む。トップメニューや中間画面は追加しない。
`mountMonthlyDelivery(root, fetchData)` に既存スタッフ認証済みの読み取りAPIを渡す。返却形式は GF_DELIVERY_reportRows_ の summary/details。認証なしのGAS公開APIは禁止。集計元は車両台帳と実績履歴。実績は貸出開始・完了・取消なしを暫定採用。実績氏名は当時の変更後JSONを使用し、現使用者で補完しない。集計専用ブックへの書き込みは別途承認。既存HTML・認証・台帳・入力規則・カレンダーを変更しない。統合側でAPI接続と実機テストを行う。

## 検証台帳への接続

1. 実際の検証用 GAS、検証台帳、既存スタッフ画面の組み合わせを確認する。検証台帳には車両台帳、実績履歴と既存の割当4テーブルが必要。
2. このディレクトリから `GF_DeliveryCompletionRoute.gs`、`GF_DeliveryCompletionSave.gs`、`GF_DeliveryCompletionPlan.gs` と `GF_MonthlyDeliveryHistory.gs`、`GF_MonthlyDeliveryPlan.gs`、`GF_MonthlyDeliveryReport.gs` を検証GASへ追加または更新する。既存の同名関数は置き換え、既存の割当検証ヘルパーと高度な Sheets v4 を使用する。
3. 検証デプロイの既存 `doPost(e)` のルート分岐より前に以下を追加する。
   ```js
   const deliveryResponse = GF_DeliveryCompletionRoute_(e);
   if (deliveryResponse !== null) return deliveryResponse;
   ```
4. GAS に検証ブック ID を `GF_DELIVERY_VALIDATION_BOOK_ID`、検証専用の32文字以上のランダム値を `GF_DELIVERY_BRIDGE_SECRET` として設定する。`GF_ReceiptAssignmentValidationBook_()` の返すIDと一致させる。`GF_DELIVERY_WRITE_ENABLED` は初期値を `NO` とし、検証デプロイのみ更新する。
5. 検証 Supabase で同じシークレットと検証 GAS の `/exec` を `GF_DELIVERY_BRIDGE_URL` に設定。`GF_DELIVERY_VALIDATION_READ_ENABLED=YES` にすると同じ検証台帳から予定・実績・納車対象を取得する。スタッフ認証後に検証台帳の表示を照合し、GAS と Supabase 両方で `GF_DELIVERY_WRITE_ENABLED=YES` にして合成の割当1件で操作する。
6. 納車完了の登録後、同じ受付の実績履歴が1行、月別完了が1件増え、その受付の予定が1件減ることを確認する。集計は実績履歴を再取得して更新し、集計用シートの書き換えは不要。停止時は両方の書き込みフラグを `NO`、読み取り切替を `NO` に戻す。
