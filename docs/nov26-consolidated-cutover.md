# 11/26 統合反映手順（更新版）
本番変更は別途承認。過去のテストデータの照合・一括同期は行わない。
## 検証済み納車
既存検証台帳の DELIVERY:TEST-R01 / DELIVERY:TEST-R02 の履歴は保持。検証GASの再追加・再デプロイは不要。実際の本番納車処理は未承認、未検証。fixture allowlist を解除しない。
## LINE受付GAS
実際のLINE受付プロジェクトの 100_LINE受付.gs は既に GF_DocumentCombinedRoute_(e) を呼び出す。変更不要。GF_DocumentRouterStopOnly.gs に最新停止版を保存済み。診断 writesDisabled=true, driveService=true, sheetsService=true, target=true, headers=true, privateRoot=false。診断を繰り返さない。別のDEMO受付GASを前提にしない。
Driveの非公開化・個別許可メール設定は延期。書類書き込みを有効化しない。実際の保存・承認・通知解除の通し確認は未完了。
## 申込詳細
gf-mypage-demo の docs/application-detail-sync.md の New receipts only を参照。稼働中の GF_SB_v4受付計画_ の実ソースと同期先を確認し、既存の required と records.push に2項目を追加する。既存トリガー・ガードを維持。過去データは更新しない。GAS反映は未実施。
## 公開状態と承認
スタッフ公開HTMLは main f7a9e39、受付API v27、ドライバーstage API v17 が既に更新された。これらは明示的な本番承認前の変更であり、回帰確認と公開継続の承認が必要。v17の外部書き込み停止ガードは旧版と異なるため、公開継続前に確認する。LINE受付GASの停止ガードは維持。公開版マイページのモジュール配備は未確認。これ以上の公開変更は承認まで行わない。
## 最終確認
新規申込1件で本人認証・詳細2項目・車両番号・納車日を確認。既存検証納車履歴は再作成不要。Drive権限設定後のみダミー書類で再提出・承認・通知解除を確認。本番納車書き込みは別途承認と接続確認。未確認項目を完了扱いしない。
