/** 既存doPostの先頭から呼ぶ受付専用分岐。別のイベントにはnullを返す。 */
function GFA_スタッフ受付受信_(e) {
  const raw = e?.postData?.contents;
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let data;
  try { data = JSON.parse(raw); } catch (_) { return null; }
  if (data?.action !== 'gfa_waiting_register_v1') return null;
  const reply = (status, state) => ContentService.createTextOutput(JSON.stringify({status,state}))
    .setMimeType(ContentService.MimeType.JSON);
  const {receiptId, receiptKey, driverId, issuedAt, signature} = data;
  if (typeof receiptId !== 'string' || !receiptId || receiptId.length > 150 || /[\r\n]/.test(receiptId) ||
      typeof receiptKey !== 'string' || !/^[a-f0-9]{64}$/i.test(receiptKey) ||
      typeof driverId !== 'string' || !/^D\d{6}$/.test(driverId) ||
      !Number.isSafeInteger(issuedAt) || Math.abs(Date.now() - issuedAt) > 60000 ||
      typeof signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return reply(403,'denied');
  }
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('GFA_STAFF_BRIDGE_SECRET');
  if (!secret || secret.length < 32) return reply(403,'denied');
  const signed = JSON.stringify([data.action,receiptId,receiptKey,driverId,issuedAt]);
  const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(signed,secret))
    .replace(/=+$/,'');
  let difference = 0;
  for (let i=0;i<expected.length;i++) difference |= expected.charCodeAt(i)^signature.charCodeAt(i);
  if (difference) return reply(403,'denied');
  if (props.getProperty('GFA_STAFF_BRIDGE_ENABLED') !== 'true') return reply(503,'disabled');
  try {
    const result = GFA_名変待ち受付登録_(receiptId,receiptKey,driverId);
    if (['registered','already_registered'].includes(result.state)) return reply(200,result.state);
    return reply(409,'reception_review_required');
  } catch (_) {
    return reply(409,'reception_review_required');
  }
}

/** 設定未作成の場合だけ停止状態で追加する。既存値はログ出力しない。 */
function GFA_スタッフ受付設定を準備() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('GFA_STAFF_BRIDGE_ENABLED') !== null) return {state:'existing'};
  props.setProperty('GFA_STAFF_BRIDGE_ENABLED','false');
  return {state:'added_disabled'};
}
