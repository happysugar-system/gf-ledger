# 11/26 統合反映手順
本番変更は別途承認。検証済み納車履歴 DELIVERY:TEST-R01 は消さない。
## 車両台帳検証GAS
既存 GF_DeliveryAllInOne を integrations/monthly-delivery/gfi-fixture/GF_DeliveryAllInOne.gs で置換。追加で重複定義しない。既存 doPost がある場合のみその先頭に GF_DeliveryCompletionRoute_(e) の非null応答を返す分岐を入れる。存在しない場合は単独ルーターを作成。Sheets advanced service を維持。
GF_DELIVERY_VALIDATION_BOOK_ID は既存検証台帳ID、GF_DELIVERY_BRIDGE_SECRET は32文字以上の独立した秘密、GF_DELIVERY_WRITE_ENABLED=NO。既存検証デプロイを更新し exec URL を取得。
Supabase tokyo-test の GF_DELIVERY_BRIDGE_URL と同じ秘密、GF_DELIVERY_FIXTURE_MODE=YES、GF_DELIVERY_VALIDATION_READ_ENABLED=YES、GF_DELIVERY_WRITE_ENABLED=NO。API v4 は外部書き込み停止版として配備されたため、有効化前にソースと配備差分を確認。
## LINE受付GAS
既存 GF_DocumentRouterStopOnly を置換する候補は gf-mypage-demo の review/driver-mypage-nov25 ブランチ integrations/gas-bundle/GF_DocumentLiveRouterDisabled.gs。追加併存禁止。既存 doPost は変更しない。Drive v3 / Sheets advanced service が必要。
現候補のターゲット検査は DEMO プロパティ前提であり、実際のLINE受付GASの対象シート・ルートフォルダを確認してから修正すること。現状は書き込み不可。実データを検証APIから書き換えない。許可メール・保存先・署名秘密は公開しない。
## 公開
スタッフ画面とマイページの指定ブランチを利用し、既存公開ページを無断で更新しない。実際の公開先とブランチ設定を確認する。
## 最終確認
個別の小テストは利用者に依頼しない。認証済みスタッフ画面で集計、ドライバーマイページで申込詳細と通知、承認済み通知の消去を一括確認。書類書き込みと納車完了のUI確認は対象分離と承認後のみ。未確認項目を完了扱いしない。
