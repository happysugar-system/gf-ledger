/** 既存の名変待ち連携検証GAS専用。ログや戻り値に設定値を含めない。 */
function GFA_検証接続先を診断() {
  const props = PropertiesService.getScriptProperties();
  const scriptIdMatches = ScriptApp.getScriptId() === '1rRpYdmZsCocUtldRJrpKokpX_Km_NPw0F8h3SOaiykHiR3y4kTgBdSt5';
  const vehicleBookMatches = props.getProperty('GFA_APPROVED_BOOK_ID') === '1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU';
  const lineBookMatches = props.getProperty('GFA_APPROVED_LINE_BOOK_ID') === '12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8';
  const ready = scriptIdMatches && vehicleBookMatches && lineBookMatches;
  return {ready,scriptIdMatches,vehicleBookMatches,lineBookMatches};
}

/** 既存doPostから呼ぶ。検証対象と一致する署名付き依頼だけを登録する。 */
function GFA_検証スタッフ受付受信_(e) {
  return GFA_スタッフ受付受信_(e, () => GFA_検証接続先を診断().ready);
}

/** 配備前に一度実行。検証先照合に成功した場合だけ、未作成の停止フラグを追加。 */
function GFA_検証スタッフ受付準備() {
  const target = GFA_検証接続先を診断();
  if (!target.ready) throw Error('検証GASまたは接続先が一致しません');
  const result = {...target, ...GFA_スタッフ受付設定を準備()};
  console.log(JSON.stringify(result));
  return result;
}
