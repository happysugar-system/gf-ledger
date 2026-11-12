/** 191_返却_GitHub受信.gs — 受付通信・診断版（全文貼替え） */
function GF191_GitHub受信_(e) {
  const p=(e&&e.parameter)||{};
  const nonce=String(p.nonce||'');
  const action=String(p.gf191_action||'');
  let result, stage='受信';
  try {
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(nonce)) throw Error('通信識別子が不正です');
    if(action==='start') {
      stage='受付開始';
      result=GF190_開始(String(p.token||''),JSON.parse(String(p.data||'{}')));
    } else if(action==='photo') {
      stage='写真保存';
      result=GF190_写真保存(String(p.token||''),String(p.key||''),String(p.direction||''),String(p.base64||''));
    } else if(action==='finish') {
      stage='受付確定';
      result=GF190_完了(String(p.token||''),String(p.key||''));
    } else throw Error('未対応の操作です');
    result={ok:true,result};
  } catch(err) {
    result={ok:false,error:String(err&&err.message||err)};
  }
  // 実行履歴を開けなくても確認できるよう、直近の診断結果をスクリプトプロパティに保存。
  try {
    PropertiesService.getScriptProperties().setProperty('GF191_最新診断',JSON.stringify({
      時刻:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss'),
      操作:action,段階:stage,成功:result.ok,エラー:result.ok?'':result.error
    }));
  } catch(ignore) {}
  const msg=JSON.stringify({type:'GF191_RESULT',nonce,payload:result}).replace(/</g,'\\u003c');
  // GAS HTMLはGoogleの内部iframeに入るため、親だけでなく最上位のGitHub画面へ通知する。
  const html='<!doctype html><html><body><script>'+
    'var m='+msg+';'+
    'try{parent.postMessage(m,"*")}catch(e){};'+
    'try{parent.parent.postMessage(m,"*")}catch(e){};'+
    'try{top.postMessage(m,"*")}catch(e){};'+
    '<'+'/script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('返却フォーム通信')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** エディタでこの関数を実行すると「実行ログ」に直近の診断を表示。 */
function GF191_最新診断を見る() {
  const v=PropertiesService.getScriptProperties().getProperty('GF191_最新診断');
  Logger.log(v||'診断記録なし：191番まで通信が届いていません');
}