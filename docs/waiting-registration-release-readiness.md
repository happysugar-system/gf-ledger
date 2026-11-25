# 名変待ち受付登録と検証環境の集約

## スタッフ入口

既存の line-reception-admin.html は gf-line-reception-admin を利用する。同APIの list/detail がLINE受付と車両依頼を参照し、save_contract が既存の契約保存を担当する。検証ブランチの waiting_registration_check は同APIに追加した読み取り照合。Supabaseセッションを検証し、gf_reception_access で有効な owner または staff だけ許可する。LINE受付IDの一意性、車両依頼、書類保存状態、受付識別子の一意性、GF143の確認DriverID一致を調べる。登録操作はまだ配備されていない。受付識別子とDriverIDは照合結果のレスポンスに含めない。

GFA_名変待ち受付登録_ の本番Web呼び出し元はGitHub収録範囲で確認できなかった。既存のGAS入口とその認証を調べ、認証済みのサーバーからだけ渡す。クライアントによるDriverID指定や、直接のシート追記での代用は禁止する。GFAが照合、ロック、重複防止と台帳の書き込みを担当する。

### 統合時の合格条件

- 現行のスタッフ資格で未ログイン401、権限なし403、許可済みスタッフで登録完了。同じ受付は既存行を返す。別の受付やDriverID不一致は停止する。
- 既存共通検証ブックに新しいダミー受付と車両を用意し、割当と取消、再割当後の進捗、納車可能日・納車確定日、既存同期、本人のLINEマイページまで同じ受付・VehicleIDを照合する。既存のテスト画面・ワーカーには固定ダミーを使うものがあるため、新規ID対応を確認してから書き込む。
- 同じDriverIDに複数台あるケースでは同一受付に結び付くVehicleIDだけを扱う。一意にならないケースを止める。
- 合成の免許証リンクで、GF138が空欄のみ補完し既存リンクを維持することを確認する。R03の隔離ブックにはリンク列がなく、今回の実地合格の対象外。
- 既存の入力規則、カレンダー反映、認証、トリガー、設定キーの差分を照合してから承認を取る。切替・復旧手順は docs/ledger-progress-production-cutover.md と docs/gf138-followup-field-verification.md を適用する。今回のスタッフ照合APIにデータ移行は不要。APIを切り戻す場合は旧配信版へ戻す。

## 整理候補と共通検証環境

現時点で削除確定のリソースはない。利用画面・定期実行・直近の履歴を照合し、依存ゼロとバックアップを確認して個別承認に回す。

| 資産 | 継続・整理の判断 |
|---|---|
| GAS | 共通検証用GASを継続。R03専用のスタンドアロンGASとR02の使い切り検証関数は実行ログと配備元を控えた後の停止候補。旧版の割当・取消の試験GASは依存の照合後に判定 |
| スプレッドシート | 割当統合検証用とLINE受付統合検証用の既存2冊を再利用。R03専用の2冊は隔離試験の証跡として保存し、参照がないことを確認して整理候補にする |
| トリガー | 本番GF138と既存業務トリガーを継続。旧PoCの時限ワーカーは所有者・対象GAS・実行先を照合し、現行試験から外れたものだけ停止候補 |
| Supabaseテーブル | 現行割当と進捗の gf_assignment_integration_replica_test、gf_assignment_integration_ui_queue_test、gf_assignment_progress_test、gf_assignment_progress_ui_queue_test は共通検証で継続。gf_assignment_queue_test、gf_vehicle_save_queue_test、gf_vehicle_replica_test、同v2系を依存調査の候補にする |
| Edge Functions | 現行の gf-assignment-integration-queue-worker-test、gf-assignment-progress-ui-test、gf-assignment-progress-queue-worker-test、gf-assignment-progress-read-test は既存利用を照合して継続。gf-assignment-demo-worker、gf-assignment-demo-save、gf-vehicle-save-worker-test、gf-vehicle-save-worker-v2-test は旧UI・ジョブ参照を調べた後に判定 |

今後は2冊と既存検証Supabaseに機能ごとの新規ダミー行を追加する。合格済みの受付は証跡として保持する。画面・GAS・Edgeの環境設定を切替前に読み取り照合し、検証環境から本番や実通知先への経路を遮断する。既存ツールの認証・同期を再利用し、利用場所、実行担当、テスト結果、停止可否を更新する。
