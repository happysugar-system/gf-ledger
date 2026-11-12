/******************************************************
 * GOLD FIRST 新システム
 * 20_車両管理.gs
 *
 * 役割
 * ・スマホから新規車両を車両台帳へ登録
 * ・VehicleIDを安全に自動発番
 * ・同じ車番の二重登録を防止
 * ・重い同期/Drive準備は登録後に別リクエストで実行
 ******************************************************/

/**
 * スマホから新規車両を登録する。
 * ここでは「車両台帳への保存」を最優先にして、重い後処理は行わない。
 */
function スマホから新規車両を登録する(data) {
  const GF20_計測開始 = Date.now();
  let GF20_前回 = GF20_計測開始;
  const GF20_記録 = (項目) => {
    const 今 = Date.now();
    console.log("車両新規登録 / " + 項目 + " / " + (今 - GF20_前回) + "ms / 累計=" + (今 - GF20_計測開始) + "ms");
    GF20_前回 = 今;
  };
  data = data || {};

  const 車番 = String(data['車番'] || '').trim();
  if (!車番) throw new Error('車番を入力してください。');

  const ロック = LockService.getScriptLock();
  if (!ロック.tryLock(10000)) {
    throw new Error('別の更新処理中です。数秒後にもう一度お試しください。');
  }

  GF20_記録("入力確認・ロック取得");
  let 行番号 = 0;
  let VehicleID = '';

  try {
    const ss = 対象スプレッドシートを開く_();
    const 台帳 = 必須シートを取得する_(ss, シート名.車両台帳);

    GF20_記録("スプシ・台帳取得");
    const 確認 = GF_複数車両の確認結果を作る_20(ss, data.DriverID, data['現在使用者'], '');
    GF20_記録("複数車両確認");
    if (確認.DriverID || 確認.会社) { data.DriverID = 確認.DriverID || ''; data['現在使用者'] = 確認.氏名; }
    if (確認.複数車両確認 && !GF_複数車両確認が一致する_20(確認, data.複数車両確認済み)) return 確認;
    const 最終列 = 台帳.getLastColumn();
    const ヘッダー = 台帳.getRange(1, 1, 1, 最終列)
      .getDisplayValues()[0]
      .map(v => String(v || '').trim());

    GF20_記録("ヘッダー取得");
    const 列 = {};
    ヘッダー.forEach((名前, i) => {
      if (名前) 列[名前] = i + 1;
    });

    if (!列['VehicleID']) throw new Error('車両台帳に「VehicleID」列がありません。');
    if (!列['車番']) throw new Error('車両台帳に「車番」列がありません。');

    // 車番は空白・全角/半角ハイフン差を吸収して比較。
    const 車番を正規化 = value => String(value || '')
      .trim()
      .replace(/[‐‑‒–—―ー−]/g, '-')
      .replace(/\s+/g, '')
      .toUpperCase();

    const 比較車番 = 車番を正規化(車番);

    // 「車番」列だけを見て既存車両と新規追加位置を判断する。
    const 読取行数 = Math.max(台帳.getLastRow() - 1, 0);
    let 車番一覧 = [];
    let ID一覧 = [];

    if (読取行数 > 0) {
      車番一覧 = 台帳.getRange(2, 列['車番'], 読取行数, 1)
        .getDisplayValues()
        .flat();

      ID一覧 = 台帳.getRange(2, 列['VehicleID'], 読取行数, 1)
        .getDisplayValues()
        .flat();

      if (車番一覧.some(v => 車番を正規化(v) === 比較車番)) {
        throw new Error('この車番はすでに登録されています。');
      }
    }

    GF20_記録("車番・VehicleID列取得と重複確認");
    // VehicleIDを発番。
    let 最大番号 = 0;
    ID一覧.forEach(v => {
      const m = String(v || '').trim().match(/^V(\d{6})$/);
      if (m) 最大番号 = Math.max(最大番号, Number(m[1]));
    });
    VehicleID = 'V' + String(最大番号 + 1).padStart(6, '0');

    // 車番が入っている最終行の直下へ追加。
    let 車両最終行 = 1;
    車番一覧.forEach((v, i) => {
      if (String(v || '').trim()) 車両最終行 = i + 2;
    });
    行番号 = 車両最終行 + 1;

    if (行番号 > 台帳.getMaxRows()) {
      台帳.insertRowsAfter(
        台帳.getMaxRows(),
        行番号 - 台帳.getMaxRows()
      );
    }

    GF20_記録("発番・登録行決定");
    // 旧システムで使っていた車両入力項目を新システムへ移植。
    const 許可項目 = [
      '管轄',
      '車番',
      '所在地',
      '駆動',
      '所有者',
      'スペア',
      'カギNo.',
      'タイヤサイズ',
      '走行距離(km)',
      '仕入れ値',
      'GPS番号',
      'GPS有無',
      '車体番号',
      '車種',
      '稼働拠点',
      'カラー',
      '仕入れ日/会場',
      '車検満了日',
      '名義変更日',
      '現在使用者',
      'DriverID',
      '備考'
    ];

    // 1セルずつ書かず、1行をまとめて1回で保存する。
    const 行データ = new Array(最終列).fill('');
    行データ[列['VehicleID'] - 1] = VehicleID;
    行データ[列['車番'] - 1] = 車番;

    // 新規車両は初期状態を空車にする。
    if (列['区分/ステータス']) {
      行データ[列['区分/ステータス'] - 1] =
        String(data['区分/ステータス'] || '').trim() || '空車';
    }

    許可項目.forEach(項目 => {
      if (!列[項目]) return;

      let 値 = data[項目];
      if (値 === undefined || 値 === null || 値 === '') return;

      if (項目 === 'GPS有無') {
        const s = String(値).trim();
        値 = ['有', 'あり', 'true', 'TRUE', '1'].includes(s);
      }

      行データ[列[項目] - 1] = 値;
    });

    if (列['更新日時']) {
      行データ[列['更新日時'] - 1] = new Date();
    }

    台帳.getRange(行番号, 1, 1, 最終列).setValues([行データ]);

    // 車番は文字列として保持。
    台帳.getRange(行番号, 列['車番']).setNumberFormat('@');

    SpreadsheetApp.flush();
    GF20_記録("台帳1行保存・書式・flush");

  } finally {
    ロック.releaseLock();
    GF20_記録("ロック解放");
  }

  GF20_記録("受付基本登録完了");
  return {
    成功: true,
    VehicleID: VehicleID,
    車番: 車番,
    行番号: 行番号,
    メッセージ: '新規車両を登録しました。'
  };
}


/**
 * 新規登録後の重い処理。
 * HTML側から保存成功後に別リクエストで呼ぶ。
 */
function スマホ新規車両登録後処理を実行する(行番号) {
  行番号 = Number(行番号);
  if (!行番号 || 行番号 < 2) {
    throw new Error('車両台帳の行番号が不正です。');
  }

  // 車両状況・利用者管理など、既存の新システム同期を利用。
  const 同期開始=Date.now();
  車両台帳の1台を同期する(行番号);
  console.log('新規車両後処理 / 全体同期 / 秒='+((Date.now()-同期開始)/1000).toFixed(2));

  // 車検満了日を「車検満了」として表示。実施予定の「車検」と分離。
  // 後から「車検予定日」を別日に変更した場合は、既存の予定管理ロジックで更新される。
  try {
    const ss = 対象スプレッドシートを開く_();
    const 台帳 = 必須シートを取得する_(ss, シート名.車両台帳);
    const VehicleID列 = 列番号を取得する_(台帳, 'VehicleID');
    const 車検満了日列 = 列番号を取得する_(台帳, '車検満了日');
    const VehicleID = String(台帳.getRange(行番号, VehicleID列).getDisplayValue() || '').trim();
    const 車検満了日 = 車検満了日列 > 0
      ? 台帳.getRange(行番号, 車検満了日列).getValue()
      : '';

    if (VehicleID && 車検満了日 && typeof 車検満了日を予定とカレンダーへ反映する_40 === 'function') {
      const 予定日 = GF_車検日を予定用文字列にする_20(車検満了日, ss.getSpreadsheetTimeZone());
      const 予定開始=Date.now();
      try {
        // ドライバー確定を含む全体同期は直前に済んでいる。
        車検満了日を予定とカレンダーへ反映する_40(VehicleID, 日付文字列から日付を作る_(予定日), true);
      } finally {
        // カレンダー側が失敗しても、保存済み予定を車両状況へ反映。
        GF_次の予定だけを反映する_20(ss,VehicleID);
        console.log('新規車両後処理 / 車検満了予定と次予定 / 秒='+((Date.now()-予定開始)/1000).toFixed(2));
      }
    }
  } catch (e) {
    console.error('車検満了日の予定登録:', e);
  }

  // 50_Drive管理.gs が入っている場合は車両フォルダも準備。
  if (typeof 車両行のDriveフォルダを準備する_ === 'function') {
    const Drive開始=Date.now();
    車両行のDriveフォルダを準備する_(行番号);
    console.log('新規車両後処理 / Driveリンク / 秒='+((Date.now()-Drive開始)/1000).toFixed(2));
  }

  return {
    成功: true,
    行番号: 行番号
  };
}

/** 日付セル・yyyy/M/d・yyyy-MM-dd・yyyy年M月d日を予定用へ統一。 */
function GF_車検日を予定用文字列にする_20(value, tz) {
  if(value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  const text=String(value||'').trim()
    .replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
  const match=text.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})(?:日)?(?:\s.*)?$/);
  if(!match)throw new Error('車検満了日を確認してください。日付を判定できません。');
  const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
  const check=new Date(Date.UTC(y,m-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d) {
    throw new Error('車検満了日が存在しない日付です。');
  }
  return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

/** 予定の選び方は30の既存関数を使い、全体同期は繰り返さない。 */
function GF_次の予定だけを反映する_20(ss,VehicleID) {
  const 状況=必須シートを取得する_(ss,シート名.車両状況);
  const 行=IDで行を探す_(状況,'VehicleID',VehicleID);
  if(!行)throw new Error('次の予定の反映先が見つかりません。');
  const 次=予定管理から次の予定を取得する_(VehicleID);
  セルを書き込む_(状況,行,'次の予定',次.予定||'');
  セルを書き込む_(状況,行,'次の予定日',次.日付||'');
  SpreadsheetApp.flush();
}

/** 今回の既存車両で速度だけを確認。新しい車両/受付は作らない。 */
function GF_登録済み車両の同期速度を確認する() {
  const ss=対象スプレッドシートを開く_();
  const 台帳=必須シートを取得する_(ss,シート名.車両台帳);
  const 行=IDで行を探す_(台帳,'VehicleID','V000001');
  if(!行)throw new Error('確認対象のV000001が見つかりません。');
  const 車=行データを取得する_(台帳,行);
  if(String(車['車番']||'').trim()!=='72-53')throw new Error('確認対象の車番が一致しません。');
  const 開始=Date.now();
  const 結果=スマホ新規車両登録後処理を実行する(行);
  console.log('新規車両後処理 / 合計 / 秒='+((Date.now()-開始)/1000).toFixed(2));
  return 結果;
}

/** スマホの追加登録前に、現在紐づいている車両を読み取る。保存はしない。 */
function スマホでドライバーの所有車両を確認する(data) {
  data = data || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('別の更新処理中です。数秒後にもう一度お試しください。');
  try {
    return GF_複数車両の確認結果を作る_20(対象スプレッドシートを開く_(), data.DriverID, data.氏名 || data['現在使用者'], data.VehicleID);
  } finally { lock.releaseLock(); }
}
function GF_複数車両の確認結果を作る_20(ss, DriverID, 氏名, VehicleID) {
  const norm = GF_使用者名比較キーを作る_20;
  DriverID = String(DriverID || '').trim();
  氏名 = String(氏名 || '').trim().replace(/[\s\u200B]+/g, ' ');
  VehicleID = String(VehicleID || '').trim();
  if (!DriverID && !氏名) return {成功:true, 複数車両確認:false, 車両:[]};
  const company = GF_会社名を正規化する_20(氏名);
  if (company) 氏名 = company;
  const master = 必須シートを取得する_(ss, シート名.ドライバーマスター);
  const people = master.getDataRange().getDisplayValues();
  const ph = (people[0] || []).map(v => String(v || '').trim());
  const pi = ph.indexOf('DriverID'), pn = ph.indexOf('氏名');
  if (pi < 0 || pn < 0) throw new Error('ドライバーの登録情報を確認できません。管理担当者に確認してください。');
  const candidates = people.slice(1).filter(r => DriverID ? String(r[pi] || '').trim() === DriverID : norm(r[pn]) === norm(氏名));
  if (candidates.length > 1) throw new Error('同じ氏名の登録が複数あります。候補からドライバーを選択してください。');
  if (DriverID && !candidates.length) throw new Error('選択したドライバーを確認できません。選び直してください。');
  if (candidates.length) { DriverID = String(candidates[0][pi] || '').trim(); 氏名 = GF_会社名を正規化する_20(candidates[0][pn]) || String(candidates[0][pn] || '').trim(); }
  const ledger = 必須シートを取得する_(ss, シート名.車両台帳);
  const rows = ledger.getDataRange().getDisplayValues();
  const h = (rows[0] || []).map(v => String(v || '').trim());
  const vi = h.indexOf('VehicleID'), di = h.indexOf('DriverID'), ni = h.indexOf('現在使用者'), plate = h.indexOf('車番'), status = h.indexOf('区分/ステータス');
  if ([vi, di, ni, plate].some(i => i < 0)) throw new Error('車両の登録情報を確認できません。管理担当者に確認してください。');
  const owns = r => String(r[ni] || '').trim() && ((DriverID && String(r[di] || '').trim() === DriverID) || ((company || !String(r[di] || '').trim()) && norm(r[ni]) === norm(氏名)));
  const same = VehicleID && rows.slice(1).some(r => String(r[vi] || '').trim() === VehicleID && owns(r));
  const vehicles = rows.slice(1).filter(r => String(r[vi] || '').trim() && owns(r) && (status < 0 || String(r[status] || '').trim() !== '終了')).map(r => ({VehicleID:String(r[vi]).trim(), 車番:String(r[plate] || '').trim()})).sort((a,b) => a.VehicleID.localeCompare(b.VehicleID));
  const snapshot = JSON.stringify({DriverID:DriverID, 氏名:氏名, VehicleID:VehicleID, 車両:vehicles});
  const noPopup = ['株式会社 GOLDFIRST', '株式会社 UP’s'].includes(GF_会社名を正規化する_20(氏名));
  return {成功:true, 会社:!!GF_会社名を正規化する_20(氏名), 複数車両確認:!noPopup && !same && vehicles.length > 0, DriverID:DriverID, 氏名:氏名,
    車両:vehicles, 登録後台数:vehicles.length + (same ? 0 : 1), 確認キー:snapshot};
}
function GF_複数車両確認が一致する_20(result, ack) {
  return typeof ack === 'string' && ack === result.確認キー;
}

/** 法人名だけ正規化する。個人の漢字・旧字体には適用しない。 */
function GF_会社名を正規化する_20(value) {
  const s = String(value || '').normalize('NFKC').trim().replace(/[\s\u200B]+/g, ' ').replace(/[’‘ʼ`´]/g, "'");
  if (!s.includes('株式会社')) return '';
  const key = s.replace(/\s/g, '').toUpperCase();
  if (key === '株式会社GOLDFIRST') return '株式会社 GOLDFIRST';
  if (key === "株式会社UP'S") return '株式会社 UP’s';
  return s.replace(/[a-z]/g, c => c.toUpperCase()).replace(/^株式会社\s*/, '株式会社 ');
}
/** 法人だけ表記差を吸収する。個人の字形は変更しない。 */
function GF_使用者名比較キーを作る_20(value) {
  const company = GF_会社名を正規化する_20(value);
  return (company || String(value || '')).replace(/[\s\u200B]+/g, '');
}
/** 旧除外処理は無効化。会社もドライバーとして管理する。 */
function GF_会社名登録を整理する() {
  console.log('会社もドライバーとして管理するため、旧会社除外処理は無効です。データは変更していません。');
  return {成功:false, メッセージ:'会社のドライバー登録を保持します。整理処理は行いません。'};
}