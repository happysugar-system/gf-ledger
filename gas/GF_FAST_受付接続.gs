/**
 * GF_FAST_受付接続.gs — 既存GAS100に追加するコード（未デプロイ）
 *
 * 現在の GF_車両テスト送信_ を置換する前に
 * Supabase側の署名付き書類受付APIと同一秘密鍵を設定する必要がある。
 * 既存GAS132〜136は変更しない。
 *
 * 注意：本ファイルは実装作業用であり、現在の本番受付には接続していない。
 */
function GF_FAST_受付設定確認_() {
  const p = PropertiesService.getScriptProperties();
  const receiver = String(p.getProperty('GF_VEHICLE_TEST_RECEIVER_URL') || '');
  const secret = String(p.getProperty('GF_VEHICLE_BRIDGE_SECRET') || '');
  const supabase = String(p.getProperty('GF_FAST_INTAKE_URL') || '');
  const signing = String(p.getProperty('GF_FAST_INTAKE_SECRET') || '');
  return {
    existingReceiverConfigured: /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(receiver),
    existingBridgeSecretConfigured: secret.length >= 40,
    fastIntakeUrlConfigured: /^https:\/\/[^/]+\.supabase\.co\/functions\/v1\//.test(supabase),
    fastIntakeSecretConfigured: signing.length >= 48
  };
}

/** HMAC-SHA256 hex. Never log input or secret. */
function GF_FAST_署名_(textValue) {
  const secret = String(PropertiesService.getScriptProperties().getProperty('GF_FAST_INTAKE_SECRET') || '');
  if (secret.length < 48) throw new Error('FAST_SECRET_NOT_CONFIGURED');
  return Utilities.computeHmacSha256Signature(textValue, secret)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

/** Server-to-server authentication envelope for a future verified intake API. */
function GF_FAST_署名付き要求_(lineUserId, requestId, receipt, residentMethod) {
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId) ||
      !/^[a-f0-9]{64}$/i.test(requestId) ||
      !/^[A-Za-z0-9-]{4,100}$/.test(receipt) ||
      !['upload','mail'].includes(residentMethod)) throw new Error('INVALID_INPUT');
  const timestamp = Math.floor(Date.now()/1000);
  const nonce = Utilities.getUuid();
  const message = [String(timestamp),nonce,requestId,receipt,lineUserId,residentMethod].join('\n');
  return {timestamp,nonce,requestId,receipt,lineUserId,residentMethod,signature:GF_FAST_署名_(message)};
}
