# 共通検証のスタッフ登録を接続する

現行GASはユーザーが示したHeadと検証設定を前提に使用する。エディターのデプロイ・ルーティングは稼働環境で確定する。新しいGASやブックは作らない。GFAの既存割当拒否、既存の採番、ロック、二重登録チェックと免許証リンク補完処理は維持。

## GASをまとめて準備

1. 対象プロジェクトの現行コード・デプロイ・プロパティ名・トリガーを控える。`GFA_WaitingBridge_ValidationTarget.gs` を追加し、`GFA_検証接続先を診断` を実行する。ready、scriptIdMatches、vehicleBookMatches、lineBookMatches がすべて true のときだけ続ける。
2. `GFA_StaffWaitingBridge.gs` を追加（同名があればこの版へ差し替え）し、既存の172の GFA_名変待ち受付登録_ だけを差分どおり更新する。他のGFA関数・試験関数を残す。既存doPostがあれば冒頭に次の2行を追加する。

```javascript
const waitingResponse = GFA_検証スタッフ受付受信_(e);
if (waitingResponse) return waitingResponse;
```

既存のdoPostがなければ、次の入口を既存プロジェクトに1つ追加する。

```javascript
function doPost(e) {
  return GFA_検証スタッフ受付受信_(e) ||
    ContentService.createTextOutput(JSON.stringify({status:403,state:'denied'}))
      .setMimeType(ContentService.MimeType.JSON);
}
```

3. `GFA_検証スタッフ受付準備` を一度実行。ready:true、state:added_disabled（既存なら existing）が期待値。既存設定の全置換は行わない。同一の検証専用シークレットをGASの GFA_STAFF_BRIDGE_SECRET とEdgeの GF_WAITING_GAS_SECRET に設定する。値は共有・記録しない。
4. Headの表示だけではEdgeが使う版固定の /exec を確認できない。既存の検証Webデプロイがあれば版を更新する。なければ同じGAS内のWebアプリデプロイを使用する。実行主体と公開範囲の変更は管理者が確認する。Googleのサインインを前提とする公開範囲では、現行Edgeから直接呼べない。
5. 検証Edgeの GF_WAITING_GAS_URL に、検証専用 /exec を設定。GASとEdge両方の登録フラグを明示的に有効にする。既存GFA_WAITING_LINK_ENABLED は今の設定を使う。

## スタッフ画面

検証版のみ line-reception-admin.html?waiting-validation=1 を利用する。検証版には goldfirst-demo の事前登録済みスタッフ、owner/staff を判定する gf_reception_access、および検証ブックに絞ったSheets用の接続設定が必要。2026-11-25時点で goldfirst-demo に当該テーブル・受付Edgeは確認できない。既存の本番認証と本番のEdgeは配備対象外。

TEST-R04を開き「名変待ちに登録」を押す。初回 registered、同一受付の再送 already_registered、名変待ちに1行、DriverID D999904。一時的な通信切断では結果が不明になるため同じ受付で再試行する。R04は検証用の疑似受付履歴を使う。合格済みR01/R02/R03は操作対象外。

既存の割当・取消・進捗検証Workerは固定テスト車両の参照がある。R04対応の配備と割当・取消・再割当・進捗・納車日・台帳直接編集・Supabase・マイページまでの実地確認は未完了。既存割当済みDriverIDを別受付に登録するガードは維持する。

## 停止・復旧

Edgeの GF_WAITING_REGISTER_ENABLED とGASの GFA_STAFF_BRIDGE_ENABLED を停止。必要に応じ既存版のWebデプロイとEdgeへ復元する。影響した受付行をバックアップと照合して復旧。既存トリガー変更不要。生産版の有効化は別の本番環境照合と操作検証、承認を要する。既存リソース一覧・整理候補は waiting-registration-release-readiness.md を参照。
