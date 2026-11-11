/**
 * GOLD FIRST / GAS100 LINE受付側
 * 追加案：受付保存成功時だけ呼び出す完了画面
 *
 * このファイルはGitHub上のレビュー用です。GitHub Pagesには置かず、
 * GAS100の現在のソースと照合してからGASに組み込んでください。
 * 既存のdoPostやGF_車両テスト送信_は、このファイルでは定義しません。
 */
function GF_車両受付成功マイページ案内_(receipt) {
  // 個人情報・受付トークンをURLに渡さない。
  const mypageUrl =
    'https://happysugar-system.github.io/gf-mypage-demo/mypage-prod-test.html';

  // 受付番号はテキスト表示のみ。HTMLエスケープする。
  const safeReceipt = String(receipt || '')
    .replace(/[^A-Za-z0-9-]/g, '');
  const receiptHtml = safeReceipt
    ? '<p class="receipt">受付番号：<strong>' + safeReceipt + '</strong></p>'
    : '';

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GOLD FIRST｜車両依頼受付完了</title>
  <style>
    *{box-sizing:border-box}
    body{background:#f4f7fb;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;margin:0}
    main{max-width:540px;margin:28px auto;padding:0 16px}
    .card{padding:30px 22px;background:white;border-radius:17px;box-shadow:0 7px 25px rgba(20,40,60,.06)}
    .check{text-align:center;color:#198456;font-size:48px;font-weight:700}
    h1{font-size:24px;text-align:center;margin:8px 0 16px}
    p{line-height:1.8}
    .receipt{text-align:center;font-size:16px}
    .info{padding:17px;border-radius:12px;background:#f2f6fc;margin:24px 0}
    .btn{display:block;background:#1564a6;padding:16px;border-radius:11px;text-align:center;color:#fff;text-decoration:none;font-weight:700}
    .small{color:#687589;font-size:13px;line-height:1.75}
  </style>
</head>
<body><main><section class="card">
  <div class="check" aria-hidden="true">✓</div>
  <h1>車両依頼を受け付けました</h1>
  <p style="text-align:center">お申し込みありがとうございます。</p>
  ${receiptHtml}
  <div class="info">
    <strong>次はマイページの初回登録へ</strong>
    <p>お申し込み状況や車両情報は、ドライバー専用マイページから確認できます。</p>
    <p>メールに届く認証コードでログインし、初回登録を申請してください。</p>
  </div>
  <a class="btn" href="${mypageUrl}" target="_top" rel="noopener">マイページの初回登録へ進む</a>
  <p class="small">※ 本人確認・DriverIDの紐付けが完了するまで、一部情報は表示されない場合があります。<br>※ マイページは現在テスト版です。</p>
</section></main></body></html>`;
  return HtmlService.createHtmlOutput(html)
    .setTitle('GOLD FIRST｜車両依頼受付完了')
    .addMetaTag('viewport','width=device-width,initial-scale=1');
}
