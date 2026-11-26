/**
 * 3-sheet validation GAS ONLY: signed staff waiting-registration target gate.
 * Separate from GFA_WaitingBridge_ValidationTarget.gs (legacy seven-sheet test).
 * No deployment changes or enabled flags are performed here.
 */
function GFA3_スタッフ受付接続診断_() {
  const props = PropertiesService.getScriptProperties();
  const expectedScript = '1h5czlOaSO0WeERVDxiGajVipVL4PAVyWPdaIB0kGVZsR11GMU12JwEE-';
  const expectedBook = '1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0';
  const expectedLineBook = '12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8';
  const actualScript = ScriptApp.getScriptId();
  const scriptApproved = actualScript === expectedScript &&
    props.getProperty('GF3_EXPECTED_SCRIPT_ID') === expectedScript;
  const bookApproved = props.getProperty('GF3_APPROVED_BOOK_ID') === expectedBook &&
    props.getProperty('GFA_APPROVED_BOOK_ID') === expectedBook;
  const lineApproved = props.getProperty('GFA_APPROVED_LINE_BOOK_ID') === expectedLineBook;
  const validationEnabled = props.getProperty('GF3_VALIDATION_ENABLED') === 'true';
  const secret = props.getProperty('GFA_STAFF_BRIDGE_SECRET') || '';
  const secretReady = secret.length >= 32;
  const registerEnabled = props.getProperty('GFA_WAITING_LINK_ENABLED') === 'true';
  const bridgeEnabled = props.getProperty('GFA_STAFF_BRIDGE_ENABLED') === 'true';
  const targetApproved = scriptApproved && bookApproved && lineApproved && validationEnabled;
  // These are independent gates; never print raw IDs, shared secrets, or receipt keys.
  return {
    scriptApproved, bookApproved, lineApproved, validationEnabled,
    secretReady, registerEnabled, bridgeEnabled,
    targetApproved,
    ready: targetApproved && secretReady && registerEnabled && bridgeEnabled
  };
}

/**
 * Call near the TOP of the EXISTING doPost (never create another doPost).
 * Non-waiting actions return null from the shared bridge and keep existing routes.
 * Waiting actions cannot write unless script/book/LINE destination exactly match.
 */
function GFA3_検証スタッフ受付受信_(e) {
  return GFA_スタッフ受付受信_(e, function () {
    return GFA3_スタッフ受付接続診断_().targetApproved === true;
  });
}

/** Read-only diagnostics for the newly authorized validation script. */
function GFA3_検証スタッフ受付診断() {
  const state = GFA3_スタッフ受付接続診断_();
  console.log(JSON.stringify(state));
  return state;
}

/** Safe one-time setup: sets a missing bridge flag to DISABLED, never enables it. */
function GFA3_検証スタッフ受付準備() {
  const state = GFA3_スタッフ受付接続診断_();
  if (!state.targetApproved) throw Error('three_sheet_validation_target_mismatch');
  const result = GFA_スタッフ受付設定を準備();
  return { prepared: true, mode: 'three_sheet_validation_only', state: result.state };
}
