/******************************************************
 * GOLD FIRST 新システム
 * 60_書類PDF.gs【完成版】
 *
 * ・免許証：2枚 → 元画像保存 → 1PDF
 * ・車両書類：3枚 → 元画像保存 → 1PDF
 * ・ドライバーマスターの「🪪免許証フォルダ」は
 *   フォルダではなく免許証PDFそのものへ直リンク
 * ・必要な補助関数もこのファイル内に全て収録
 ******************************************************/
/******************************************************
 * 免許証
 ******************************************************/
function スマホから免許証をまとめて登録する(
  DriverID,
  画像一覧
) {
  if (!DriverID) {
    throw new Error('ドライバーを選択してください。');
  }
  if (
    !Array.isArray(画像一覧) ||
    画像一覧.length !== 2
  ) {
    throw new Error(
      '免許証は表・裏の2枚をまとめて選択してください。'
    );
  }
  const blobs = 画像一覧.map(
    (x, i) =>
      画像データをBlobにする_(
        x,
        '免許証_' + (i + 1)
      )
  );
  return 免許証を保存する_(
    String(DriverID).trim(),
    blobs
  );
}
function 免許証を保存する_(DriverID, blobs) {
  const ブック = 対象スプレッドシートを開く_();
  const マスター = 必須シートを取得する_(
    ブック,
    シート名.ドライバーマスター
  );
  const 行 = IDで行を探す_(
    マスター,
    'DriverID',
    DriverID
  );
  if (!行) {
    throw new Error('ドライバーが見つかりません。');
  }
  const d = 行データを取得する_(マスター, 行);
  const 氏名 = String(d['氏名'] || '').trim();
  const 免許証列 = 列番号を取得する_(
    マスター,
    '🪪免許証フォルダ'
  );
  const 免許証セル = マスター.getRange(行, 免許証列);
  let 前リンク = '';
  const 前RichText = 免許証セル.getRichTextValue();
  if (前RichText) {
    前リンク = 前RichText.getLinkUrl() || '';
  }
  if (!前リンク) {
    const 前値 = String(免許証セル.getValue() || '').trim();
    if (/^https?:\/\//i.test(前値)) 前リンク = 前値;
  }
  /****************************************************
   * Dxxxxxx_氏名 → 免許証
   * ★ 日時フォルダは作らない
   ****************************************************/
  const 個人 = ドライバーDriveフォルダを準備する_(
    DriverID,
    氏名
  );
  const 免許証フォルダ = 子フォルダを取得または作成する_(
    個人,
    '免許証'
  );
  /****************************************************
   * 再登録時は旧PDF・旧元画像だけ入れ替える
   ****************************************************/
  const 旧PDF一覧 = 免許証フォルダ.getFilesByName('免許証.pdf');
  while (旧PDF一覧.hasNext()) {
    旧PDF一覧.next().setTrashed(true);
  }
  const 旧元画像 = 免許証フォルダ.getFiles();
  while (旧元画像.hasNext()) {
    const f = 旧元画像.next();
    if (/^免許証_\d{2}\./.test(f.getName())) {
      f.setTrashed(true);
    }
  }
  // 以前の版で作った「元画像」フォルダがあれば削除
  const 旧元画像フォルダ一覧 = 免許証フォルダ.getFoldersByName('元画像');
  while (旧元画像フォルダ一覧.hasNext()) {
    旧元画像フォルダ一覧.next().setTrashed(true);
  }
  /****************************************************
   * 元画像2枚を免許証フォルダへ直接保存
   ****************************************************/
  blobs.forEach((b, i) => {
    免許証フォルダ.createFile(
      b.copyBlob().setName(
        '免許証_' +
        String(i + 1).padStart(2, '0') +
        '.' +
        MIMEから拡張子を取得する_(b.getContentType())
      )
    );
  });
  /****************************************************
   * 表・裏 → 2ページPDF
   ****************************************************/
  const PDF = 免許証フォルダ.createFile(
    免許証PDFを作る_(
      '免許証_' + 氏名,
      blobs
    ).setName('免許証.pdf')
  );
  セルを書き込む_(
    マスター,
    行,
    '🪪免許証フォルダ',
    PDF.getUrl()
  );
  SpreadsheetApp.flush();
  return {
    成功: true,
    種類: '免許証',
    氏名: 氏名,
    PDFURL: PDF.getUrl(),
    取消情報: {
      種類: '免許証',
      フォルダID: '',
      DriverID: DriverID,
      前リンク: 前リンク
    }
  };
}
/******************************************************
 * 車両書類
 ******************************************************/
function スマホから車両書類をまとめて登録する(
  VehicleID,
  画像一覧
) {
  if (!VehicleID) {
    throw new Error('車両を選択してください。');
  }
  if (
    !Array.isArray(画像一覧) ||
    画像一覧.length !== 3
  ) {
    throw new Error(
      '車両書類は3枚まとめて選択してください。'
    );
  }
  const blobs = 画像一覧.map(
    (x, i) =>
      画像データをBlobにする_(
        x,
        '車両書類_' + (i + 1)
      )
  );
  return 車両書類を保存する_(
    String(VehicleID).trim(),
    blobs
  );
}
function 車両書類を保存する_(VehicleID, blobs) {
  const ブック = 対象スプレッドシートを開く_();
  const 台帳 = 必須シートを取得する_(
    ブック,
    シート名.車両台帳
  );
  const 利用者 = 必須シートを取得する_(
    ブック,
    シート名.利用者管理
  );
  const 状況 = 必須シートを取得する_(
    ブック,
    シート名.車両状況
  );
  const 車両行 = IDで行を探す_(
    台帳,
    'VehicleID',
    VehicleID
  );
  if (!車両行) {
    throw new Error('車両が見つかりません。');
  }
  const 車両 = 行データを取得する_(
    台帳,
    車両行
  );
  const 車番 = String(
    車両['車番'] || ''
  ).trim();
  const DriverID = String(
    車両['DriverID'] || ''
  ).trim();
  const 氏名 = String(
    車両['現在使用者'] || ''
  ).trim();

  車両行のDriveフォルダを準備する_(
    車両行
  );
  const 親 =
    Drive親フォルダを取得する_();
  const 車両ルート =
    子フォルダを取得または作成する_(
      親,
      '01_車両'
    );
  const 車両フォルダ =
    ID付きフォルダを取得または作成する_(
      車両ルート,
      VehicleID,
      車番
    );
  const 書類親 =
    子フォルダを取得または作成する_(
      車両フォルダ,
      '車両書類'
    );
  const 登録 = 書類親.createFolder(登録日時名を作る_()+'_'+Utilities.getUuid().slice(0,8));
  /****************************************************
   * 元画像
   ****************************************************/
  const 元画像フォルダ =
    子フォルダを取得または作成する_(
      登録,
      '元画像'
    );
  blobs.forEach((b, i) => {
    元画像フォルダ.createFile(
      b.copyBlob().setName(
        '車両書類_' +
        String(i + 1).padStart(2, '0') +
        '.' +
        MIMEから拡張子を取得する_(
          b.getContentType()
        )
      )
    );
  });
  /****************************************************
   * 3枚 → 1PDF
   ****************************************************/
  const PDF = 登録.createFile(
    車両書類PDFを作る_(
      '車両書類一式_' + 車番,
      blobs
    ).setName('車両書類一式.pdf')
  );
  /****************************************************
   * 利用者管理・車両状況へPDF直リンク
   ****************************************************/
  const 利用者行 = IDで行を探す_(
    利用者,
    'VehicleID',
    VehicleID
  );
  const 状況行 = IDで行を探す_(
    状況,
    'VehicleID',
    VehicleID
  );
  const 前利用者リンク =
    利用者行
      ? String(
          行データを取得する_(
            利用者,
            利用者行
          )['車両書類を見る'] || ''
        )
      : '';
  const 前状況リンク =
    状況行
      ? String(
          行データを取得する_(
            状況,
            状況行
          )['車両書類'] || ''
        )
      : '';
  if (利用者行) {
    セルを書き込む_(
      利用者,
      利用者行,
      '車両書類を見る',
      PDF.getUrl()
    );
  }
  if (状況行) {
    セルを書き込む_(
      状況,
      状況行,
      '車両書類',
      PDF.getUrl()
    );
  }
  // 新しい3点セットを保存した直後、車両台帳の最新PDF・履歴フォルダも更新。
  // リンク反映の失敗で保存済み書類を再送させない。
  try {
    GF_車両書類を同期する_28(ブック,VehicleID);
  } catch (e) {
    console.error('車両書類リンクの更新に失敗（PDF保存済み）：'+String(e));
  }
  SpreadsheetApp.flush();
  return {
    成功: true,
    種類: '車両書類',
    車番: 車番,
    氏名: 氏名,
    PDFURL: PDF.getUrl(),
    取消情報: {
      種類: '車両書類',
      フォルダID: 登録.getId(),
      VehicleID: VehicleID,
      前利用者リンク: 前利用者リンク,
      前状況リンク: 前状況リンク
    }
  };
}
/******************************************************
 * 直前登録取消
 ******************************************************/
function スマホから直前登録を取り消す(
  取消情報
) {
  if (
    !取消情報 ||
    !取消情報.種類
  ) {
    throw new Error(
      '取り消し情報がありません。'
    );
  }
  if (取消情報.フォルダID) {
    try {
      DriveApp
        .getFolderById(
          取消情報.フォルダID
        )
        .setTrashed(true);
    } catch (e) {}
  }
  const ブック =
    対象スプレッドシートを開く_();
  if (取消情報.種類 === '免許証') {
    const m =
      必須シートを取得する_(
        ブック,
        シート名.ドライバーマスター
      );
    const 行 =
      IDで行を探す_(
        m,
        'DriverID',
        取消情報.DriverID
      );
    if (行) {
      セルを書き込む_(
        m,
        行,
        '🪪免許証フォルダ',
        取消情報.前リンク || ''
      );
    }
  } else if (
    取消情報.種類 === '車両書類'
  ) {
    const u =
      必須シートを取得する_(
        ブック,
        シート名.利用者管理
      );
    const s =
      必須シートを取得する_(
        ブック,
        シート名.車両状況
      );
    const ur =
      IDで行を探す_(
        u,
        'VehicleID',
        取消情報.VehicleID
      );
    const sr =
      IDで行を探す_(
        s,
        'VehicleID',
        取消情報.VehicleID
      );
    GF_車両書類を同期する_28(ブック,取消情報.VehicleID);
  }
  SpreadsheetApp.flush();
  return { 成功: true };
}
/******************************************************
 * 車両写真取消
 ******************************************************/
function スマホから車両写真登録を取り消す(
  取消情報
) {
  if (
    !取消情報 ||
    !Array.isArray(
      取消情報.ファイルID一覧
    )
  ) {
    throw new Error(
      '取り消し情報がありません。'
    );
  }
  取消情報.ファイルID一覧.forEach(
    id => {
      try {
        DriveApp
          .getFileById(id)
          .setTrashed(true);
      } catch (e) {}
    }
  );
  return { 成功: true };
}
/******************************************************
 * 画像 → PDF
 *
 * ・PDFの大きな白余白をなくす
 * ・画像の縦横比に合わせてPDFページ自体を作る
 * ・画像をページいっぱいに配置する
 *
 * ※画像そのものの90度回転はスマホHTML側の
 *   img書類() で行う。
 ******************************************************/
function 免許証PDFを作る_(一時名, blobs) {
  // 免許証は横型。
  // 横長の表・裏を大きく見せる。
  return 固定向きPDFを作る_(
    一時名,
    blobs,
    '横'
  );
}
function 車両書類PDFを作る_(一時名, blobs) {
  // 車両書類は縦型。
  // 車検証記録事項などの縦長書類を大きく表示する。
  return 固定向きPDFを作る_(
    一時名,
    blobs,
    '縦'
  );
}
/******************************************************
 * 固定向きPDFを作る_
 *
 * 免許証   : 横型ページ
 * 車両書類 : 縦型ページ
 *
 * ・画像の縦横比は絶対に崩さない
 * ・画像ごとにページ内へ最大表示
 * ・元画像の解像度をここでは縮小しない
 * ・ページ向きだけ書類種類ごとに固定
 *
 * ※画像の回転・余白トリミング・高画質化は
 *   スマホHTML側の img書類() で完了済み。
 ******************************************************/
function 固定向きPDFを作る_(一時名, blobs, ページ向き) {
  if(!Array.isArray(blobs)||!blobs.length)throw new Error('PDF化する画像がありません。');
  const start=Date.now();
  const images=blobs.map(blob=>GF_JPEG情報を読む_60(blob));
  if(images.every(Boolean)){
    const pdf=GF_JPEGを直接PDFにする_60(一時名,images,ページ向き);
    console.log('書類PDF作成 / 方式=JPEG直接 / ページ='+images.length+' / 秒='+((Date.now()-start)/1000).toFixed(2));
    return pdf;
  }
  // PNG等や特殊なJPEGは従来の変換を使う。
  const pdf=GF_従来の固定向きPDFを作る_60(一時名,blobs,ページ向き);
  console.log('書類PDF作成 / 方式=従来変換 / ページ='+blobs.length+' / 秒='+((Date.now()-start)/1000).toFixed(2));
  return pdf;
}
function GF_従来の固定向きPDFを作る_60(一時名, blobs, ページ向き) {
  if (!Array.isArray(blobs) || !blobs.length) {
    throw new Error('PDF化する画像がありません。');
  }
  const 縦型 = String(ページ向き || '').trim() === '縦';
  /*
   * Google Docsのページサイズを明示指定する。
   *
   * 縦型: A4に近い 595 × 842 pt
   * 横型: 842 × 595 pt
   *
   * これならSlides権限は不要。
   */
  const pageW = 縦型 ? 595 : 842;
  const pageH = 縦型 ? 842 : 595;
  // 小さな安全余白だけ残す
  const margin = 8;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const doc = DocumentApp.create(
    'TEMP_' + 一時名 + '_' + Utilities.getUuid()
  );
  const body = doc.getBody();
  body.clear();
  body.setPageWidth(pageW);
  body.setPageHeight(pageH);
  body.setMarginTop(margin);
  body.setMarginBottom(margin);
  body.setMarginLeft(margin);
  body.setMarginRight(margin);
  /*
   * 1画像 = 1ページ。
   * 各画像自身の縦横比を維持したまま、
   * そのページに入る最大サイズを毎回計算する。
   */
  blobs.forEach(function(blob, index) {
    if (index > 0) {
      body.appendPageBreak();
    }
    const p = body.appendParagraph('');
    p.setSpacingBefore(0);
    p.setSpacingAfter(0);
    p.setLineSpacing(1);
    p.setAlignment(
      DocumentApp.HorizontalAlignment.CENTER
    );
    const img = p.appendInlineImage(
      blob.copyBlob()
    );
    const originalW = Math.max(
      1,
      Number(img.getWidth()) || 1
    );
    const originalH = Math.max(
      1,
      Number(img.getHeight()) || 1
    );
    const ratio = originalW / originalH;
    /*
     * まず使用可能な横幅いっぱいにする。
     * 高さがはみ出す場合だけ高さ基準へ切り替える。
     */
    let targetW = usableW;
    let targetH = targetW / ratio;
    if (targetH > usableH) {
      targetH = usableH;
      targetW = targetH * ratio;
    }
    targetW = Math.max(
      1,
      Math.round(targetW)
    );
    targetH = Math.max(
      1,
      Math.round(targetH)
    );
    img.setWidth(targetW);
    img.setHeight(targetH);
  });
  doc.saveAndClose();
  const temp = DriveApp.getFileById(
    doc.getId()
  );
  try {
    return temp
      .getAs(MimeType.PDF)
      .setName(一時名 + '.pdf');
  } finally {
    temp.setTrashed(true);
  }
}
/******************************************************
 * スマホ画像データ → Blob
 ******************************************************/
function 画像データをBlobにする_(
  画像,
  基本名
) {
  const Base64 = String(
    画像.Base64 || ''
  );
  const MIME = String(
    画像.MIMEタイプ ||
    'image/jpeg'
  );
  if (!Base64) {
    throw new Error(
      基本名 +
      'の画像データが空です。'
    );
  }
  return Utilities.newBlob(
    Utilities.base64Decode(
      Base64
    ),
    MIME,
    基本名 +
    '.' +
    MIMEから拡張子を取得する_(
      MIME
    )
  );
}
/******************************************************
 * MIME → 拡張子
 ******************************************************/
function MIMEから拡張子を取得する_(
  MIME
) {
  MIME = String(
    MIME || ''
  ).toLowerCase();
  if (MIME.includes('png')) {
    return 'png';
  }
  if (MIME.includes('webp')) {
    return 'webp';
  }
  if (MIME.includes('heic')) {
    return 'heic';
  }
  if (MIME.includes('heif')) {
    return 'heif';
  }
  return 'jpg';
}
/******************************************************
 * 登録日時フォルダ名
 ******************************************************/
function 登録日時名を作る_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() ||
      'Asia/Tokyo',
    'yyyy-MM-dd_HHmmss'
  );
}
/******************************************************
 * 既存免許証リンクをPDF直リンクに修正
 ******************************************************/
function 既存免許証リンクをPDF直リンクに直す() {
  const ブック =
    対象スプレッドシートを開く_();
  const マスター =
    必須シートを取得する_(
      ブック,
      シート名.ドライバーマスター
    );
  const DriverID列 =
    列番号を取得する_(
      マスター,
      'DriverID'
    );
  const 氏名列 =
    列番号を取得する_(
      マスター,
      '氏名'
    );
  const 免許証列 =
    列番号を取得する_(
      マスター,
      '🪪免許証フォルダ'
    );
  let 更新件数 = 0;
  for (
    let 行 = 2;
    行 <= マスター.getLastRow();
    行++
  ) {
    const DriverID = String(
      マスター
        .getRange(行, DriverID列)
        .getDisplayValue() || ''
    ).trim();
    const 氏名 = String(
      マスター
        .getRange(行, 氏名列)
        .getDisplayValue() || ''
    ).trim();
    if (!DriverID || !氏名) {
      continue;
    }
    const 個人 =
      ドライバーDriveフォルダを準備する_(
        DriverID,
        氏名
      );
    const 免許証親一覧 =
      個人.getFoldersByName(
        '免許証'
      );
    if (!免許証親一覧.hasNext()) {
      continue;
    }
    const 免許証親 =
      免許証親一覧.next();
    const 登録一覧 = [];
    const フォルダ一覧 =
      免許証親.getFolders();
    while (
      フォルダ一覧.hasNext()
    ) {
      const フォルダ =
        フォルダ一覧.next();
      const 名前 = String(
        フォルダ.getName() || ''
      ).trim();
      if (
        /^\d{4}-\d{2}-\d{2}_\d{6}$/
          .test(名前)
      ) {
        登録一覧.push(
          フォルダ
        );
      }
    }
    登録一覧.sort(
      (a, b) =>
        b.getName()
          .localeCompare(
            a.getName()
          )
    );
    let PDF = null;
    for (
      const 登録 of 登録一覧
    ) {
      const PDF一覧 =
        登録.getFilesByName(
          '免許証.pdf'
        );
      if (
        PDF一覧.hasNext()
      ) {
        PDF =
          PDF一覧.next();
        break;
      }
    }
    if (!PDF) {
      continue;
    }
    セルを書き込む_(
      マスター,
      行,
      '🪪免許証フォルダ',
      PDF.getUrl()
    );
    更新件数++;
  }
  SpreadsheetApp.flush();
  const 結果 =
    '免許証PDF直リンク更新完了：' +
    更新件数 +
    '名';
  console.log(結果);
  return 結果;
}
/** CanvasのJPEGを解析。元の画像データは再圧縮しない。 */
function GF_JPEG情報を読む_60(blob,理由を表示) {
  const fallback=reason=>{if(理由を表示)console.log("JPEG直接方式を使わない理由: "+reason);return null;};
  const bytes=Uint8Array.from(blob.getBytes(),v=>v&255);
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)return fallback('JPEG以外の画像形式');
  if(bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return fallback('JPEG末尾が標準の終端と異なる');
  let pos=2,info=null,transform=null,orientation=1;
  while(pos<bytes.length){
    if(bytes[pos++]!==255)return fallback('JPEGの対応条件外');
    while(pos<bytes.length&&bytes[pos]===255)pos++;
    const marker=bytes[pos++];
    if(marker===218)break;
    if(marker===217)return fallback('JPEGの対応条件外');
    if(marker===1||(marker>=208&&marker<=215))continue;
    if(pos+2>bytes.length)return fallback('JPEGの対応条件外');
    const len=(bytes[pos]<<8)|bytes[pos+1];
    if(len<2||pos+len>bytes.length)return fallback('JPEGの対応条件外');
    if(marker===225&&len>=8&&bytes[pos+2]===69&&bytes[pos+3]===120&&bytes[pos+4]===105&&bytes[pos+5]===102){
      const direction=GF_EXIFの向きを読む_60(bytes,pos+8,pos+len);
      if(direction===null)return fallback('EXIFの向き情報を確認できない');
      orientation=direction;
    }
    if(marker===238&&len>=14&&bytes[pos+2]===65&&bytes[pos+3]===100&&bytes[pos+4]===111&&bytes[pos+5]===98&&bytes[pos+6]===101)transform=bytes[pos+13];
    if(marker===192||marker===194){
      if(len<8)return fallback('JPEGの対応条件外');
      const depth=bytes[pos+2],height=(bytes[pos+3]<<8)|bytes[pos+4],width=(bytes[pos+5]<<8)|bytes[pos+6],components=bytes[pos+7];
      if(depth!==8||!width||!height||![1,3].includes(components)||len<8+3*components)return fallback('JPEGの対応条件外');
      info={bytes:bytes,width:width,height:height,components:components};
    }else if((marker>=193&&marker<=207)&&![196,200,204].includes(marker))return fallback('JPEGの対応条件外');
    pos+=len;
  }
  if(!info||bytes[pos-1]!==218)return fallback('JPEGの対応条件外');
  if(transform!==null&&!([0,1].includes(transform)))return fallback('JPEGの対応条件外');
  info.transform=transform;info.orientation=orientation;
  return info;
}
/** A4相当、余白8pt、1画像1ページ。JPEGの全ピクセルをPDFに埋め込む。 */
function GF_JPEGを直接PDFにする_60(name,images,orientation) {
  const portrait=String(orientation||'').trim()==='縦';
  const w=portrait?595:842,h=portrait?842:595,margin=8;
  const chunks=[],offsets=[0];let length=0;
  const raw=bytes=>{chunks.push(bytes);length+=bytes.length;};
  const ascii=text=>raw(Uint8Array.from(String(text),c=>c.charCodeAt(0)));
  const object=(id,text)=>{offsets[id]=length;ascii(id+' 0 obj\n'+text+'\nendobj\n');};
  ascii('%PDF-1.4\n');raw(Uint8Array.from([37,226,227,207,211,10]));
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Count '+images.length+' /Kids ['+images.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  images.forEach((image,i)=>{
    const page=3+i*3,img=page+1,content=page+2;
    const swapped=image.orientation>=5;
    const displayW=swapped?image.height:image.width,displayH=swapped?image.width:image.height;
    let targetW=w-2*margin,targetH=targetW*displayH/displayW;
    if(targetH>h-2*margin){targetH=h-2*margin;targetW=targetH*displayW/displayH;}
    // 従来と同じ丸め、横中央・上余白8ptの配置。
    targetW=Math.max(1,Math.round(targetW));targetH=Math.max(1,Math.round(targetH));
    const x=(w-targetW)/2,y=h-margin-targetH;
    // EXIFの回転・鏡像を表示行列で反映。埋込JPEGの画素は変更しない。
    const transforms={1:[1,0,0,1,0,0],2:[-1,0,0,1,1,0],3:[-1,0,0,-1,1,1],4:[1,0,0,-1,0,1],5:[0,-1,-1,0,1,1],6:[0,-1,1,0,0,1],7:[0,1,1,0,0,0],8:[0,1,-1,0,1,0]};
    const t=transforms[image.orientation||1];
    const matrix=[t[0]*targetW,t[1]*targetH,t[2]*targetW,t[3]*targetH,x+t[4]*targetW,y+t[5]*targetH];
    const stream='q\n'+matrix.join(' ')+' cm\n/Im0 Do\nQ\n';
    object(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /XObject << /Im0 '+img+' 0 R >> >> /Contents '+content+' 0 R >>');
    offsets[img]=length;
    ascii(img+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+' /ColorSpace /'+(image.components===1?'DeviceGray':'DeviceRGB')+' /BitsPerComponent 8 /Filter /DCTDecode '+(image.transform!==null?'/DecodeParms << /ColorTransform '+image.transform+' >> ':'')+'/Length '+image.bytes.length+' >>\nstream\n');
    raw(image.bytes);ascii('\nendstream\nendobj\n');
    object(content,'<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
  });
  const xref=length,count=2+images.length*3;
  ascii('xref\n0 '+(count+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<=count;i++)ascii(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  ascii('trailer\n<< /Size '+(count+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  const output=new Uint8Array(length);let pos=0;
  chunks.forEach(chunk=>{output.set(chunk,pos);pos+=chunk.length;});
  return Utilities.newBlob(Array.from(output,b=>b>127?b-256:b),'application/pdf',String(name)+'.pdf');
}
/** 保存済みの車両写真で計測。台帳のリンクと本番PDFは変更しない。 */
function GF_登録済み車両のPDF速度を確認する() {
  const start=Date.now(),data=GF_確認用の保存済み車両写真を読む_60(),blobs=data.blobs;
  const pdf=車両書類PDFを作る_('速度確認_車両基本書類',blobs);
  const saved=data.folder.createFile(pdf);
  console.log('PDF確認用URL: '+saved.getUrl());
  console.log('PDF速度確認 / 写真読込・PDF保存を含む合計 / 秒='+((Date.now()-start)/1000).toFixed(2));
  return saved.getUrl();
}
function GF_確認用の保存済み車両写真を読む_60() {
  const ss=対象スプレッドシートを開く_();
  const ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const row=IDで行を探す_(ledger,'VehicleID','V000001');
  if(!row)throw new Error('V000001が見つかりません。');
  const car=行データを取得する_(ledger,row);
  if(String(car['車番']||'').trim()!=='72-53')throw new Error('確認対象の車番が一致しません。');
  const folderColumn=列番号を取得する_(ledger,'車両フォルダ');
  if(!folderColumn)throw new Error('車両フォルダ列が見つかりません。');
  const folderURL=GF_セルのリンクURLを読む_60(ledger.getRange(row,folderColumn));
  const match=folderURL.match(/[-\w]{25,}/);
  if(!match)throw new Error('保存済み車両フォルダが見つかりません。');
  const vehicle=DriveApp.getFolderById(match[0]),docs=vehicle.getFoldersByName('車両書類');
  if(!docs.hasNext())throw new Error('車両書類フォルダが見つかりません。');
  const base=docs.next().getFoldersByName('基本書類');
  if(!base.hasNext())throw new Error('基本書類フォルダが見つかりません。');
  const folder=base.next(),files=folder.getFiles(),images=[];
  while(files.hasNext()){
    const f=files.next();if(/^車両書類_\d{2}\.(jpg|jpeg|png|webp)$/i.test(f.getName()))images.push(f);
  }
  images.sort((a,b)=>a.getName().localeCompare(b.getName()));
  if(images.length!==3)throw new Error('保存済み写真3枚を確認してください。');
  return {folder:folder,blobs:images.map(f=>f.getBlob())};
}

/** URL表示・文字に付けたリンク・HYPERLINK式から実際のリンク先を取得。 */
function GF_セルのリンクURLを読む_60(cell) {
  const urls=[];
  const rich=cell.getRichTextValue();
  if(rich){
    const link=rich.getLinkUrl();if(link)urls.push(link);
    if(!link)rich.getRuns().forEach(run=>{const url=run.getLinkUrl();if(url)urls.push(url);});
  }
  const formula=String(cell.getFormula()||'');
  const matched=formula.match(/^=HYPERLINK\(\s*"((?:[^"]|"")*)"/i);
  if(matched)urls.push(matched[1].replace(/""/g,'"'));
  urls.push(String(cell.getValue()||''));
  return urls.find(url=>/^https?:\/\//i.test(String(url)))||'';
}

/** 写真の内容は出さず、形式だけ確認。PDF作成・保存はしない。 */
function GF_保存済み車両写真の形式を確認する() {
  const data=GF_確認用の保存済み車両写真を読む_60();
  data.blobs.forEach((blob,i)=>{
    const bytes=blob.getBytes();
    console.log('写真'+(i+1)+' / MIME='+blob.getContentType()+' / サイズKB='+Math.round(bytes.length/1024)+' / 先頭4バイト='+bytes.slice(0,4).map(b=>(b&255).toString(16).padStart(2,'0')).join(' '));
    const info=GF_JPEG情報を読む_60(blob,true);
    console.log('写真'+(i+1)+' / JPEG直接対応='+(!!info));
  });
}

/** EXIF TIFFのOrientationを取得。破損・未対応形式は従来処理へ。 */
function GF_EXIFの向きを読む_60(bytes,start,end) {
  if(start+8>end)return null;
  const little=bytes[start]===73&&bytes[start+1]===73;
  if(!little&&!(bytes[start]===77&&bytes[start+1]===77))return null;
  const u16=p=>little?(bytes[p]|bytes[p+1]<<8):(bytes[p]<<8|bytes[p+1]);
  const u32=p=>little?((bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16|bytes[p+3]<<24)>>>0):((bytes[p]<<24|bytes[p+1]<<16|bytes[p+2]<<8|bytes[p+3])>>>0);
  if(u16(start+2)!==42)return null;
  const ifd=start+u32(start+4);
  if(ifd<start+8||ifd+2>end)return null;
  const n=u16(ifd);
  if(ifd+2+n*12>end)return null;
  for(let i=0;i<n;i++){
    const p=ifd+2+i*12;
    if(u16(p)!==274)continue;
    if(u16(p+2)!==3||u32(p+4)!==1)return null;
    const value=u16(p+8);
    return value>=1&&value<=8?value:null;
  }
  return 1;
}