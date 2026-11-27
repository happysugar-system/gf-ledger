function GF_車両テスト送信_(e) {
  const result = (heading, detail, ok) => HtmlService.createHtmlOutput(
    '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:sans-serif;padding:24px;max-width:500px;margin:auto">' +
    '<h2>' + heading + '</h2><p>' + detail + '</p>' +
    (ok ? '<p>この画面を閉じてください。</p>' : '<p>元のフォームに戻り、時間をおいて再度お試しください。</p>') + '</body></html>');
  try {
    const p = (e && e.parameter) || {};
    const token = String(p.gf_entry || '');
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('LINK_INVALID');
    const cache = CacheService.getScriptCache();
    const userId = cache.get('GF_VEHICLE_ENTRY_' + token);
    if (!/^U[0-9a-f]{32}$/i.test(String(userId || ''))) throw new Error('LINK_EXPIRED');
    const props = PropertiesService.getScriptProperties();
    const receiver = String(props.getProperty('GF_VEHICLE_TEST_RECEIVER_URL') || '');
    const secret = String(props.getProperty('GF_VEHICLE_BRIDGE_SECRET') || '');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(receiver) || secret.length < 40)
      throw new Error('SERVER_NOT_CONFIGURED');
    const started = Date.now();
    const fast = typeof GF_FAST_property_ === 'function' && GF_FAST_property_('GF_FAST_TEST_ENABLED') === 'true';
    let data = fast ? GF_FAST_existingIntake_(token) : null;
    if (!data) {
      const payload = Object.assign({}, p, {
        demo_action:fast?'gf_fast_stage_v1':'gf_vehicle_bridge_test_v1',
        bridge_secret:secret,
        bridge_line_user_id:userId,
        bridge_request_id:token
      });
      delete payload.action;
      delete payload.gf_entry;
      const response = UrlFetchApp.fetch(receiver, {
        method:'post', payload:payload, muteHttpExceptions:true, followRedirects:true
      });
      try { data = JSON.parse(response.getContentText()); }
      catch (_) { throw new Error('BRIDGE_RESPONSE_INVALID'); }
      if (!data || data.ok !== true) throw new Error('SAVE_FAILED');
      GF115_車両依頼受付へ反映_(p,userId,data,token);
    }
    if (fast) {
      GF_FAST_masterSync_(token);
      console.log(JSON.stringify({event:'gf_fast_acceptance', ms:Date.now()-started}));
    } else {
      cache.remove('GF_VEHICLE_ENTRY_' + token);
    }

const receipt = String(data.receipt || '');

if (!/^TEST145-[0-9]{14}-[a-f0-9]{8,}$/i.test(receipt)) {
  throw new Error('INVALID_RECEIPT');
}

const completeUrl =
  'https://happysugar-system.github.io/gf-ledger/' +
  'vehicle-request-complete.html?receipt=' +
  encodeURIComponent(receipt);

return HtmlService.createHtmlOutput(
  '<!doctype html><html lang="ja"><head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>受付完了</title></head><body>' +
  '<p>受付完了画面へ移動しています…</p>' +
  '<script>window.location.replace(' +
  JSON.stringify(completeUrl).replace(/</g, '\\u003c') +
  ');</script>' +
  '<p><a href="' + completeUrl + '">完了画面を開く</a></p>' +
  '</body></html>'
);

  } catch (err) {
    console.error('車両依頼テスト送信エラー（個人情報は記録しません）: ' + String(err.message || err));
    return result('送信を完了できませんでした', '入力内容はまだ受付完了になっていません。', false);
  }
}
