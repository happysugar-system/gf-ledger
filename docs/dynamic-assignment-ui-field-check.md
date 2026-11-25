# 動的割当・取消の検証画面接続

2026-11-25。既存統合版29e0b90の実地読み取り診断は利用者が合格確認済み。実行ログは connected:true / write_enabled:false / assignment_planned:true。再実行していない。

既存のスタッフ検証サイトにだけ割当・取消パネルを追加した。既存ページの匿名公開範囲や認証は変更していない。版取得は既存認証のユーザーから owner/staff を照合し、署名付きで検証GASに台帳の版を問い合わせる。投入直前にもう一度版を取得し、GAS処理時にも再照合する。画面の受付番号・DriverIDは既存受付詳細を利用し、VehicleIDは検証利用者が選んだV9系IDに限定。保存ボタンの連打を止め、通信断では同じ操作IDを再利用する。

## 残るGAS操作と試験

対象は既存の「GOLD FIRST 名変待ち連携検証」。既存統合版29e0b90と検証トークンは追加済み。次の作業をまとめて実施する。

1. 既存GASへ integrations/gas/GF_ReceiptAssignmentPreviewBridge.gs を新規ファイルとして追加。同名なら差し替え。既存の doPost に下記を追加し、従来の名変待ち登録などの分岐を残す。doPost は二重定義しない。

```javascript
const dynamicPreview = GF_動的割当検証版を受信_(e);
if (dynamicPreview) return dynamicPreview;
```

2. 既存検証Webアプリの版を更新し、同じ /exec を使う。GFA_STAFF_BRIDGE_SECRET と demo Edge 側の GF_WAITING_GAS_SECRET、今の GF_WAITING_GAS_URL を再利用する。値は出力しない。既存の保存トリガーは変更しない。
3. 既存検証画面にログインし、TEST-R04 詳細の車両割当パネルに V900004 を指定して「台帳を照合」。期待表示は「台帳を照合しました」。成功すれば、従来のGAS診断の繰り返しは不要。
4. 検証用の書き込みだけを有効にする。goldfirst-demo Edge の GF_DYNAMIC_ASSIGNMENT_STAFF_ENQUEUE_ENABLED と GF_DYNAMIC_ASSIGNMENT_CLAIMS_ENABLED_V2、検証GASの GF_DYNAMIC_ASSIGNMENT_GAS_ENABLED を true にする。テスト以外の環境には設定しない。検証画面で保存を受け付けた後、GASの GF_動的割当検証キューを1件処理 を1回実行。「処理状況を確認」で verified が期待値。名変待ち管理、車両台帳、ドライバーマスター、Supabaseの同じVehicleIDを再照合する。取消時も版取得と受付から同じ手順で実行する。再照合待ちの場合は同じ受付を別IDで投入せず、対象を確認する。
5. 動的IDの進捗・納車日・台帳直接編集・マイページを続けて検証する。割当・取消の完了表示は、進捗・納車日・マイページの実地合格を意味しない。

## 切替と復旧

本番切替は動的IDでの一貫試験と承認後。本番の稼働ソース、認証、配備版、台帳と対象行、複製データを控える。問題時は検証用3フラグを停止し、未完了キューを照合してから既存Web版・Edge版を戻す。実際に変更した対象行だけ台帳から復旧する。詳しい移行判定は dynamic-assignment-validation-20261125.md を参照。
