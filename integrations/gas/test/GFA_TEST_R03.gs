/** TEST-R03専用。新規のスタンドアロンGASに貼り付け、下の2つのIDを設定する。 */
function GFA_TEST_R03_実地確認() {
  const lineId = 'LINE検証ブックID';
  const vehicleId = '車両検証ブックID';
  if (!/^[A-Za-z0-9_-]{30,}$/.test(lineId) || !/^[A-Za-z0-9_-]{30,}$/.test(vehicleId) ||
      lineId === vehicleId) throw Error('検証専用の2冊のIDを設定してください');
  const line = SpreadsheetApp.openById(lineId);
  const vehicle = SpreadsheetApp.openById(vehicleId);
  const books = {line, vehicle};
  return GFA_TEST_R03_隔離実行_(books, LockService, () => SpreadsheetApp.flush());
}

function GFA_TEST_R03_隔離実行_({line, vehicle}, LockService, flush) {
  if (line.getName() !== 'GOLD FIRST TEST-R03 隔離検証 LINE受付' ||
      vehicle.getName() !== 'GOLD FIRST TEST-R03 隔離検証 車両管理' ||
      line.getId() === vehicle.getId()) throw Error('隔離検証ブック以外は対象外です');

  const lineId = line.getId(), vehicleId = vehicle.getId();
  const SpreadsheetApp = {
    openById(id) {
      if (id === lineId) return line;
      if (id === vehicleId) return vehicle;
      throw Error('隔離検証ブック以外には接続できません');
    },
    flush,
  };
  const prefs = {GFA_APPROVED_BOOK_ID:vehicleId,GFA_APPROVED_LINE_BOOK_ID:lineId,GFA_WAITING_LINK_ENABLED:'true'};
  const PropertiesService = {getScriptProperties: () => ({getProperty: name => prefs[name]})};
  const 対象スプレッドシートを開く_ = () => vehicle;
  // GF138の採番入口へ検証専用の初期値を渡す。本番の採番設定は読み込まない。
  const ドライバーID設定 = {};
  const 次のIDを発番する_ = () => 'D999903';
  function 行を書き込む_(sheet, row, data) {
    if (sheet.getName() !== 'ドライバーマスター' || row !== 2 || sheet.getLastRow() !== 1) {
      throw Error('新規の検証ドライバー行以外は書き込めません');
    }
    const header = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    if (Object.keys(data).some(key => !header.includes(key))) throw Error('検証列が不足しています');
    sheet.getRange(row,1,1,header.length).setValues([header.map(key => data[key] ?? '')]);
  }

  // 以下は保存済みGF138・GF143と修正版GFAを検証用アダプターに閉じ込めたもの。
  /**
   * GOLD FIRST 車両管理GAS側専用
   * LINE車両依頼 → ドライバーマスター（非同期）
   *
   * 現行の本番受付同期。書き込みは有効（GF138_WRITE_ENABLED=true）。
   * 初期3件除外は専用の手動関数のみ。通常同期は2行目以降を対象とする。
   */
  const GF138_LINE_BOOK_ID = lineId;
  const GF138_WRITE_ENABLED = true;
  const GF138_FIRST_NEW_ROW = 2;
  const GF138_ONLY_RECEIPT_ROW = 0; // 初回1件限定を解除
  const GF138_LOG_SHEET = 'GF_LINEドライバー同期履歴';
  const GF138_LOG_HEADERS = [
    '受付識別子','受付番号','LINE受付ID',
    '処理状態','DriverID','処理日時','備考'
  ];

  /**
   * 既存のGF138トリガーのまま使用する入口。
   * GF138内部のLockServiceを解放してからGF143の照合を行う。
   * GF143は初期状態READ_ONLYであり、明示的に解放するまで受付を書き換えない。
   */


  function GF138_車両依頼を同期_本体_() {
    if (!GF138_LINE_BOOK_ID ||
        GF138_LINE_BOOK_ID.startsWith('ここに')) {
      throw new Error('GF138_LINE_BOOK_IDを設定してください');
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      // 多重実行時は次回の定期実行に任せ、監視上はWARNとして記録。
      // 失敗による登録重複を防ぐため、処理の途中には入らない。
      console.warn('GF138: ロック取得待ち10秒超過。次回の定期実行で再試行');
      return;
    }

    try {
      const line = SpreadsheetApp.openById(GF138_LINE_BOOK_ID);
      const vehicle = 対象スプレッドシートを開く_();
      if (vehicle.getId() !== vehicleId) {
        throw new Error('GF138: 隔離検証ブック以外への登録を停止');
      }

      if (line.getId() === vehicle.getId()) {
        throw new Error('LINE受付と車両管理のブックが同一です');
      }

      const reception = GF138_sheet_(line, '車両依頼受付');
      const lineMaster = GF138_sheet_(line, 'LINE受付管理');
      const drivers = GF138_sheet_(vehicle, 'ドライバーマスター');
      // URLの実在する保存列を探す。見つからない場合は警告し、リンクを作り上げない。
      const licenseSource = GF138_免許証列を探す_(reception, lineMaster);

      const rh = GF138_headers_(reception, [
        '受付番号','氏名','フリガナ','電話番号',
        '紹介元','所属会社名','稼働エリア',
        '契約者メールアドレス','緊急連絡先氏名',
        '緊急連絡先メールアドレス',
        'LINE受付ID','受付識別子','書類状態'
      ]);

      const lh = GF138_headers_(lineMaster, [
        '受付ID','DriverID'
      ]);

      const dh = GF138_headers_(drivers, [
        'DriverID','氏名','電話番号',
        '契約者メールアドレス','備考','🪪免許証フォルダ'
      ]);

      const existingLog = vehicle.getSheetByName(GF138_LOG_SHEET);
      if (existingLog) {
        GF138_headers_(existingLog, GF138_LOG_HEADERS);
      }

      const logMap = {};

      if (existingLog && existingLog.getLastRow() >= 2) {
        const h = GF138_headers_(existingLog, GF138_LOG_HEADERS);
        const rows = existingLog.getRange(
          2,1,existingLog.getLastRow()-1,
          existingLog.getLastColumn()
        ).getDisplayValues();

        rows.forEach(r => {
          const k = String(r[h['受付識別子']] || '').trim();
          if (k) {
            if (logMap[k]) throw new Error('同期履歴に重複があります');
            logMap[k] = r;
          }
        });
      }

      if (reception.getLastRow() < GF138_FIRST_NEW_ROW) {
        console.log('新規受付なし。書込=' + GF138_WRITE_ENABLED);
        return;
      }

      const source = reception.getRange(
        GF138_FIRST_NEW_ROW,1,
        reception.getLastRow()-GF138_FIRST_NEW_ROW+1,
        reception.getLastColumn()
      ).getDisplayValues();

      const idsSeen = new Set();

      for (let i = 0; i < source.length; i++) {
        const r = source[i];
        const row = GF138_FIRST_NEW_ROW + i;
        // 現在は0（全対象）。限定実行時だけ指定行に絞る。
        if (GF138_ONLY_RECEIPT_ROW && row !== GF138_ONLY_RECEIPT_ROW) {
          continue;
        }
        const get = k => String(r[rh[k]] || '').trim();

        const requestKey = get('受付識別子');
        const receipt = get('受付番号');
        const name = get('氏名');

        if (!requestKey && !receipt && !name) continue;

        if (!/^[a-f0-9]{64}$/i.test(requestKey)) {
          console.warn('保留: 受付識別子不正 行=' + row);
          continue;
        }

        if (idsSeen.has(requestKey)) {
          throw new Error('受付識別子が重複: ' + requestKey);
        }
        idsSeen.add(requestKey);

        if (logMap[requestKey]) {
          // 登録済みは再登録せず、免許証リンクの空欄だけ補完する。
          const logH = existingLog ? GF138_headers_(existingLog, GF138_LOG_HEADERS) : null;
          const logEntry = logMap[requestKey];
          if (logH && String(logEntry[logH['処理状態']] || '').trim() === '登録済') {
            const linkedId = String(logEntry[logH['DriverID']] || '').trim();
            if (linkedId) {
              const masterRowsForLink = lineMaster.getLastRow() >= 2
                ? lineMaster.getRange(2,1,lineMaster.getLastRow()-1,lineMaster.getLastColumn()).getDisplayValues() : [];
              const matchedMaster = masterRowsForLink.map((v,j) => ({v,row:j+2})).filter(x =>
                String(x.v[lh['受付ID']] || '').trim() === get('LINE受付ID'));
              if (matchedMaster.length === 1 &&
                  String(matchedMaster[0].v[lh['DriverID']] || '').trim() === linkedId) {
                GF138_免許証補完_(licenseSource, reception, row, lineMaster,
                  matchedMaster[0].row, drivers, dh, linkedId);
              } else {
                console.warn('免許証補完保留: LINE受付IDとDriverID不一致 行=' + row);
              }
            }
          }
          console.log('処理済/保留済: 行=' + row);
          continue;
        }

        if (!receipt || !name ||
            !get('LINE受付ID') ||
            get('書類状態') !== '保存完了') {
          console.log('受付未完了: 行=' + row);
          continue;
        }

        const masterRows = lineMaster.getLastRow() >= 2
          ? lineMaster.getRange(
              2,1,lineMaster.getLastRow()-1,
              lineMaster.getLastColumn()
            ).getDisplayValues()
          : [];

        const matches = masterRows
          .map((v,j) => ({v,row:j+2}))
          .filter(x =>
            String(x.v[lh['受付ID']] || '').trim() ===
            get('LINE受付ID')
          );

        if (matches.length !== 1) {
          console.warn('LINE受付IDが一意でない: 行=' + row);
          continue;
        }

        const lineRow = matches[0].row;
        const alreadyLinked = String(
          matches[0].v[lh['DriverID']] || ''
        ).trim();

        if (alreadyLinked) {
          console.log('既存DriverIDあり。確認対象: 行=' + row);
          if (GF138_WRITE_ENABLED) {
            GF138_log_(
              vehicle,requestKey,receipt,
              get('LINE受付ID'),'要確認',
              alreadyLinked,'LINE受付側に既存DriverID'
            );
          }
          continue;
        }

        const driverRows = drivers.getLastRow() >= 2
          ? drivers.getRange(
              2,1,drivers.getLastRow()-1,
              drivers.getLastColumn()
            ).getDisplayValues()
          : [];

        const marker = 'GF_LINE_REQ:' + requestKey;
        const prior = driverRows.filter(v =>
          String(v[dh['備考']] || '').includes(marker)
        );

        if (prior.length > 1) {
          throw new Error('同じ申込で複数登録されています');
        }

        if (prior.length === 1) {
          const id = String(
            prior[0][dh['DriverID']] || ''
          ).trim();

          if (!id) throw new Error('登録済DriverIDが空欄です');

          if (GF138_WRITE_ENABLED) {
            GF138_linkAndLog_(
              vehicle,lineMaster,lineRow,lh,
              requestKey,receipt,get('LINE受付ID'),id
            );
          }
          GF138_免許証補完_(licenseSource,reception,row,lineMaster,lineRow,drivers,dh,id);
          console.log('登録済み申込を復旧: 行=' + row);
          continue;
        }

        const norm = v => String(v || '')
          .normalize('NFKC')
          .replace(/\s/g,'')
          .toLowerCase();

        const phone = v => String(v || '')
          .replace(/[^0-9]/g,'');

        const email = v => String(v || '')
          .trim().toLowerCase();

        const candidates = driverRows.filter(v =>
          (name && norm(v[dh['氏名']]) === norm(name)) ||
          (phone(get('電話番号')) &&
    phone(v[dh['電話番号']]) === phone(get('電話番号'))) ||
  (email(get('契約者メールアドレス')) &&
    email(v[dh['契約者メールアドレス']]) ===
    email(get('契約者メールアドレス')))
        );

        if (candidates.length) {
          console.log(
            '要確認（重複候補' + candidates.length + '件）行=' + row
          );

          if (GF138_WRITE_ENABLED) {
            GF138_log_(
              vehicle,requestKey,receipt,
              get('LINE受付ID'),'要確認','',
              '既存ドライバー候補 ' + candidates.length + '件'
            );
          }
          continue;
        }

        if (!GF138_WRITE_ENABLED) {
          console.log('新規登録候補（書込OFF）: 行=' + row);
          continue;
        }

        // 過去の同期履歴に残る欠番IDも予約済みとして扱う。
        // 既存マスターと履歴の双方を確認し、別人へのID再利用を防ぐ。
        const id = GF138_履歴を考慮して次のIDを発番_(drivers, existingLog);


        const data = {
          DriverID:id,
          氏名:name,
          フリガナ:get('フリガナ'),
          電話番号:get('電話番号'),
          紹介元:get('紹介元'),
          所属会社名:get('所属会社名'),
          稼働エリア:get('稼働エリア'),
          契約者メールアドレス:get('契約者メールアドレス'),
          緊急連絡先氏名:get('緊急連絡先氏名'),
          緊急連絡先メールアドレス:get('緊急連絡先メールアドレス'),
          登録日:new Date(),
          ステータス:'有効',
          備考:marker
  
        };

        const newRow = Math.max(2,drivers.getLastRow()+1);
        行を書き込む_(drivers,newRow,data);
        SpreadsheetApp.flush();

        GF138_linkAndLog_(
          vehicle,lineMaster,lineRow,lh,
          requestKey,receipt,get('LINE受付ID'),id
        );

        GF138_免許証補完_(licenseSource,reception,row,lineMaster,lineRow,drivers,dh,id);
        console.log('新規登録完了: 行=' + row + ' / ' + id);
      }

      console.log('同期終了。書込=' + GF138_WRITE_ENABLED);

    } finally {
      lock.releaseLock();
    }
  }

  function GF138_sheet_(ss,name) {
    const s = ss.getSheetByName(name);
    if (!s) throw new Error('シートがありません: ' + name);
    return s;
  }

  function GF138_headers_(s,required) {
    const h = s.getRange(
      1,1,1,s.getLastColumn()
    ).getDisplayValues()[0].map(v => String(v || '').trim());

    const m = {};
    h.forEach((v,i) => {
      if (v) {
        if (m[v] !== undefined) {
          throw new Error(s.getName() + ' 見出し重複: ' + v);
        }
        m[v] = i;
      }
    });

    required.forEach(v => {
      if (m[v] === undefined) {
        throw new Error(s.getName() + ' 見出し不足: ' + v);
      }
    });

    return m;
  }

  function GF138_log_(vehicle,key,receipt,lineId,status,id,note) {
    let s = vehicle.getSheetByName(GF138_LOG_SHEET);

    if (!s) {
      s = vehicle.insertSheet(GF138_LOG_SHEET);
      s.getRange(
        1,1,1,GF138_LOG_HEADERS.length
      ).setValues([GF138_LOG_HEADERS]);
      s.setFrozenRows(1);
    }

    const h = GF138_headers_(s,GF138_LOG_HEADERS);
    const rows = s.getLastRow() >= 2
      ? s.getRange(
          2,1,s.getLastRow()-1,s.getLastColumn()
        ).getDisplayValues()
      : [];

    const found = rows
      .map((r,i) =>
        String(r[h['受付識別子']] || '').trim() === key
          ? i+2 : 0
      )
      .filter(Boolean);

    if (found.length > 1) {
      throw new Error('同期履歴重複');
    }

    const row = found[0] || s.getLastRow()+1;

    s.getRange(
      row,1,1,GF138_LOG_HEADERS.length
    ).setValues([[
      key,receipt,lineId,status,id,new Date(),note
    ]]);
  }

  function GF138_linkAndLog_(
    vehicle,lineMaster,lineRow,lh,
    key,receipt,lineId,id
  ) {
    const cell = lineMaster.getRange(
      lineRow,lh['DriverID']+1
    );

    const old = String(cell.getDisplayValue() || '').trim();

    if (old && old !== id) {
      throw new Error('LINE受付側DriverIDが変更されています');
    }

    if (!old) cell.setValue(id);

    GF138_log_(
      vehicle,key,receipt,lineId,
      '登録済',id,'車両未割当'
    );
  }


  /**
   * 初回1回だけ実行
   * 既存受付2～4行目を自動登録対象から除外する
   */



  /**
   * 免許証リンクの保存元を列見出しから検出。
   * 候補が複数ある場合は勝手に選ばずエラーにする。
   * URLの保存先が別シートの場合は、この関数の調整が必要。
   */
  function GF138_免許証列を探す_(reception, lineMaster) {
    const candidates = [
      '🪪免許証フォルダ','免許証フォルダ','免許証PDF',
      '免許証URL','免許証リンク','免許証保存先','免許証ファイルURL'
    ];
    const found = [];
    [
      {sheet:reception,type:'reception'},
      {sheet:lineMaster,type:'master'}
    ].forEach(item => {
      const h = GF138_headers_(item.sheet, []);
      candidates.forEach(name => {
        if (h[name] !== undefined) found.push({sheet:item.sheet,type:item.type,col:h[name]+1,name});
      });
    });
    if (!found.length) {
      console.warn('免許証リンクの保存列が見つかりません。車両依頼受付/LINE受付管理の列名を確認してください');
      return null;
    }
    if (found.length > 1) {
      throw new Error('免許証リンク候補列が複数あります: ' + found.map(x=>x.sheet.getName()+'/'+x.name).join(', '));
    }
    console.log('免許証リンク参照元: '+found[0].sheet.getName()+'/'+found[0].name);
    return found[0];
  }

  /** セルのリンク先URLを取得。表示文字だけでなくリッチテキスト/数式も確認 */
  function GF138_セルURL_(cell) {
    const rich = cell.getRichTextValue();
    if (rich) {
      const direct = rich.getLinkUrl();
      if (direct) return direct;
      const urls = [...new Set(rich.getRuns().map(r=>r.getLinkUrl()).filter(Boolean))];
      if (urls.length === 1) return urls[0];
      if (urls.length > 1) throw new Error('1セルに異なる複数リンクがあります: '+cell.getA1Notation());
    }
    const formula = cell.getFormula();
    const match = formula.match(/^=HYPERLINK\(\s*"(https?:\/\/[^"]+)"/i);
    if (match) return match[1].replace(/""/g,'"');
    const value = String(cell.getDisplayValue() || '').trim();
    return /^https?:\/\/\S+$/i.test(value) ? value : '';
  }

  /** 既存リンクは絶対に上書きせず、DriverID一致時だけ空欄補完 */
  function GF138_免許証補完_(source,reception,receptionRow,lineMaster,lineRow,drivers,dh,id) {
    if (!source) return;
    const sourceRow = source.type === 'reception' ? receptionRow : lineRow;
    const url = GF138_セルURL_(source.sheet.getRange(sourceRow,source.col));
    if (!url) {
      console.log('免許証リンク未保存: 受付行='+receptionRow);
      return;
    }
    if (!/^https:\/\//i.test(url)) throw new Error('免許証リンクがHTTPSではありません: 行='+receptionRow);
    const rows = drivers.getLastRow() >= 2
      ? drivers.getRange(2,dh['DriverID']+1,drivers.getLastRow()-1,1).getDisplayValues() : [];
    const hits = rows.map((r,i)=>String(r[0]||'').trim()===id?i+2:0).filter(Boolean);
    if (hits.length !== 1) {
      console.warn('GF138: 免許証補完保留 / DriverID=' + id +
        ' / 件数=' + hits.length + ' / 受付行=' + receptionRow);
      return;
    }
    const h = GF138_headers_(drivers,['🪪免許証フォルダ']);
    const target = drivers.getRange(hits[0],h['🪪免許証フォルダ']+1);
    if (target.getFormula() || target.getDisplayValue() || GF138_セルURL_(target)) {
      console.log('免許証リンク登録済み・上書きなし: '+id);
      return;
    }
    if (!GF138_WRITE_ENABLED) {
      console.log('免許証リンク補完候補（書込OFF）: '+id);
      return;
    }
    const linked = SpreadsheetApp.newRichTextValue().setText('🪪 免許証を見る').setLinkUrl(url).build();
    target.setRichTextValue(linked);
    console.log('免許証リンク補完完了: '+id);
  }

  /** マスター欠番でも過去の同期履歴で使用済みのIDは再利用しない。 */
  function GF138_履歴を考慮して次のIDを発番_(drivers, history) {
    const candidate = String(次のIDを発番する_(drivers, 'DriverID', ドライバーID設定) || '').trim();
    const match = candidate.match(/^([A-Za-z]+)([0-9]+)$/);
    if (!match) throw new Error('GF138: DriverID発番形式が不正: ' + candidate);
    const prefix = match[1];
    const width = match[2].length;
    let next = Number(match[2]);
    if (!Number.isSafeInteger(next)) throw new Error('GF138: DriverID発番値が不正');
    const used = new Set();
    const dh = GF138_headers_(drivers, ['DriverID']);
    if (drivers.getLastRow() > 1) {
      drivers.getRange(2, dh['DriverID'] + 1, drivers.getLastRow() - 1, 1)
        .getDisplayValues().forEach(r => { if (r[0]) used.add(String(r[0]).trim()); });
    }
    if (history && history.getLastRow() > 1) {
      const hh = GF138_headers_(history, ['DriverID']);
      history.getRange(2, hh['DriverID'] + 1, history.getLastRow() - 1, 1)
        .getDisplayValues().forEach(r => { if (r[0]) used.add(String(r[0]).trim()); });
    }
    for (let attempts = 0; attempts < 100000; attempts++, next++) {
      const id = prefix + String(next).padStart(width, '0');
      if (!used.has(id)) {
        if (id !== candidate) console.warn('GF138: 過去の同期履歴で使用済みのIDを回避: ' + candidate + ' → ' + id);
        return id;
      }
    }
    throw new Error('GF138: 使用可能なDriverIDが見つかりません');
  }

  /**
   * GF143 確認DriverID 自動反映（車両管理GASに新規ファイルとして追加）
   * 既存のGF138/145/146は変更しない。
   * 初回は GF143_事前確認() を実行する。
   */
  const GF143_LINE_BOOK_ID = lineId;

  function GF143_事前確認() { GF143_同期_(false); }
  function GF143_確認DriverIDを反映() { GF143_同期_(true); }

  function GF143_同期_(write) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('同期処理が実行中です');
    try {
      const lineBook = SpreadsheetApp.openById(GF143_LINE_BOOK_ID);
      const vehicleBook = 対象スプレッドシートを開く_();
      const receiptSheet = lineBook.getSheetByName('車両依頼受付');
      const lineSheet = lineBook.getSheetByName('LINE受付管理');
      const driverSheet = vehicleBook.getSheetByName('ドライバーマスター');
      if (!receiptSheet || !lineSheet || !driverSheet) throw new Error('必要なシートがありません');

      const load = (sheet, required) => {
        const rows = sheet.getDataRange().getDisplayValues();
        if (!rows.length) throw new Error(sheet.getName() + ': 見出しがありません');
        const h = {};
        required.forEach(name => {
          const matches = rows[0].map((v,i) => String(v).trim() === name ? i : -1).filter(i => i >= 0);
          if (matches.length !== 1) throw new Error(sheet.getName() + ': 見出し不足または重複 ' + name);
          h[name] = matches[0];
        });
        return {rows, h};
      };
      const reception = load(receiptSheet, ['受付番号','LINE受付ID','確認DriverID']);
      const line = load(lineSheet, ['受付ID','DriverID']);
      const drivers = load(driverSheet, ['DriverID']);

      const ids = new Set();
      for (const row of drivers.rows.slice(1)) {
        const id = String(row[drivers.h.DriverID] || '').trim();
        if (id) {
          if (ids.has(id)) throw new Error('ドライバーマスターにDriverID重複: ' + id);
          ids.add(id);
        }
      }
      const lineMap = new Map();
      for (const row of line.rows.slice(1)) {
        const receiptId = String(row[line.h['受付ID']] || '').trim();
        if (!receiptId) continue;
        if (lineMap.has(receiptId)) throw new Error('LINE受付管理の受付ID重複: ' + receiptId);
        lineMap.set(receiptId, String(row[line.h.DriverID] || '').trim());
      }

      let eligible = 0, already = 0, waiting = 0, mismatch = 0;
      const pending = [];
      const seenReceipts = new Set();
      for (let i = 1; i < reception.rows.length; i++) {
        const row = reception.rows[i];
        const sheetRow = i + 1;
        const receipt = String(row[reception.h['受付番号']] || '').trim();
        const lineId = String(row[reception.h['LINE受付ID']] || '').trim();
        const current = String(row[reception.h['確認DriverID']] || '').trim();
        if (!receipt && !lineId && !current) continue;
        if (!receipt || !lineId) { waiting++; console.log('保留: 受付番号またはLINE受付IDなし 行=' + sheetRow); continue; }
        if (seenReceipts.has(receipt)) throw new Error('車両依頼受付の受付番号重複: ' + receipt);
        seenReceipts.add(receipt);
        const id = lineMap.get(lineId) || '';
        if (!id) { waiting++; console.log('保留: LINE受付管理にDriverIDなし 行=' + sheetRow); continue; }
        if (!ids.has(id)) { mismatch++; console.warn('要確認: ドライバーマスターにDriverIDなし 行=' + sheetRow); continue; }
        if (current) {
          if (current === id) already++;
          else { mismatch++; console.warn('要確認: 既存確認DriverIDと不一致（上書きなし）行=' + sheetRow); }
          continue;
        }
        eligible++;
        pending.push({row: sheetRow, id});
      }
      console.log('===== GF143 確認DriverID同期 =====');
      console.log('モード: ' + (write ? '書き込み' : '事前確認（書き込みなし）'));
      console.log('反映対象: ' + eligible);
      console.log('既に一致: ' + already);
      console.log('保留: ' + waiting);
      console.log('要確認: ' + mismatch);
      if (write) {
        const col = reception.h['確認DriverID'] + 1;
        let count = 0;
        for (const item of pending) {
          const cell = receiptSheet.getRange(item.row, col);
          if (String(cell.getDisplayValue() || '').trim()) {
            console.warn('書き込み直前に値が存在したためスキップ 行=' + item.row);
            continue;
          }
          cell.setValue(item.id);
          count++;
        }
        SpreadsheetApp.flush();
        console.log('実際の反映件数: ' + count);
      }
      console.log('===== GF143 終了 =====');
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Resolve an assignment identity in the vehicle-management GAS project.
   * The caller supplies the waiting row's stored receipt ID, receipt key and DriverID.
   * GF138's existing trigger owns registration. Retry pending results after it runs.
   */
  function GFA_割当DriverIDを照合_(lineReceiptId, waitingDriverId, books) {
    if (!books?.line || !books?.vehicle) throw Error('照合する台帳がありません');
    const receiptId = GFA_ID文字列_(lineReceiptId);
    if (!receiptId) throw new Error('LINE受付IDを確認してください');

    const { line, vehicle } = books;
    if (line.getId() === vehicle.getId()) throw new Error('台帳の接続先が不正です');

    const source = GFA_割当照合シート_(line, '車両依頼受付');
    const reception = GFA_割当照合シート_(line, 'LINE受付管理');
    const drivers = GFA_割当照合シート_(vehicle, 'ドライバーマスター');
    const sourceRow = GFA_割当照合行_(source, 'LINE受付ID', receiptId, ['書類状態', '受付識別子']);
    const receptionRow = GFA_割当照合行_(reception, '受付ID', receiptId, ['DriverID']);

    const requestKey = sourceRow['受付識別子'];
    const waitingKey = GFA_ID文字列_(books?.waitingKey);
    if (!/^[a-f0-9]{64}$/i.test(requestKey) || waitingKey !== requestKey) {
      throw new Error('名変待ちと車両依頼の受付識別子が一致しません');
    }
    if (sourceRow['書類状態'] !== '保存完了') return { state: 'reception_incomplete' };

    const linkedId = receptionRow.DriverID;
    const savedId = GFA_ID文字列_(waitingDriverId);
    if (savedId && savedId !== linkedId) {
      throw new Error('名変待ちとLINE受付のDriverIDが一致しません');
    }
    const history = vehicle.getSheetByName('GF_LINEドライバー同期履歴');
    const result = history && GFA_割当照合行_(
      history, '受付識別子', requestKey, ['処理状態', 'LINE受付ID', 'DriverID'], true
    );
    if (result && (result['LINE受付ID'] !== receiptId || (result.DriverID && result.DriverID !== linkedId))) {
      throw new Error('GF138の同期履歴がLINE受付と一致しません');
    }
    if (!linkedId || !result || result['処理状態'] !== '登録済' || result.DriverID !== linkedId) {
      return { state: result || linkedId ? 'registration_review_required' : 'registration_pending' };
    }
    if (!/^D\d{6}$/.test(linkedId)) throw Error('GF138のDriverID形式が不正です');
    const driver = GFA_割当照合行_(drivers, 'DriverID', linkedId, ['ステータス']);
    if (driver['ステータス'] !== '有効') throw new Error('ドライバーが有効ではありません');
    return { state: 'resolved', driver_id: linkedId };
  }

  function GFA_割当照合行_(sheet, key, id, fields, allowMissing = false) {
    const rows = sheet.getDataRange().getDisplayValues();
    const header = rows[0];
    const columns = [key, ...fields].map(field => {
      const indices = header.flatMap((value, index) => GFA_ID文字列_(value) === field ? [index] : []);
      if (indices.length !== 1) throw new Error('照合に必要な列を一意に特定できません');
      return indices[0];
    });
    const matches = rows.slice(1).filter(row => GFA_ID文字列_(row[columns[0]]) === id);
    if (allowMissing && matches.length === 0) return null;
    if (matches.length !== 1) throw new Error('照合対象を一意に特定できません');
    return Object.fromEntries(fields.map((field, index) =>
      [field, GFA_ID文字列_(matches[0][columns[index + 1]])]));
  }

  function GFA_ID文字列_(value) {
    return String(value ?? '').trim();
  }

  function GFA_割当照合シート_(book, name) {
    const sheet = book.getSheetByName(name);
    if (!sheet) throw Error('GF138との照合に必要なシートがありません: ' + name);
    return sheet;
  }

  /** GF138登録済みの受付を、明示的な受付キーを持つ名変待ち行に引き継ぐ。
   * GFA_assignment_driver_link.gs が必要。既存の未紐付け行は変更しない。
   */
  function GFA_名変待ちDriverID診断(){return GFA_名変待ちDriverID同期_(false);}
  function GFA_名変待ちDriverID同期(){return GFA_名変待ちDriverID同期_(true);}
  function GFA_名変待ちDriverID同期_(write){
   const props=PropertiesService.getScriptProperties();
   const id=props.getProperty('GFA_APPROVED_BOOK_ID');
   const lineId=props.getProperty('GFA_APPROVED_LINE_BOOK_ID');
   if(!id||!lineId||id===lineId)throw Error('接続先未承認');
   if(write&&props.getProperty('GFA_WAITING_LINK_ENABLED')!=='true')throw Error('書込未承認');
   const lock=LockService.getScriptLock();lock.waitLock(30000);
   try{
   const vehicle=SpreadsheetApp.openById(id),line=SpreadsheetApp.openById(lineId);
   const s=vehicle.getSheetByName('名変待ち管理');if(!s)throw Error('名変待ち管理なし');
   const rows=s.getDataRange().getDisplayValues(),h=rows[0];
   const col=n=>{const a=h.flatMap((v,i)=>v.trim()===n?[i]:[]);if(a.length!==1)throw Error('列不一致: '+n);return a[0];};
   const c=['受付ID','LINE受付ID','受付識別子','DriverID','割当VehicleID','ステータス'].map(col);
   const count={legacy:0,pending:0,linked:0,ready:0,updated:0,review:0};
   const receiptCounts=new Map(),keyCounts=new Map();
   for(const r of rows.slice(1)){
    const receipt=GFA_ID文字列_(r[c[1]]),key=GFA_ID文字列_(r[c[2]]);
    if(receipt)receiptCounts.set(receipt,(receiptCounts.get(receipt)||0)+1);
    if(key)keyCounts.set(key,(keyCounts.get(key)||0)+1);
   }
   for(let i=1;i<rows.length;i++){
   const r=rows[i];if(!r[c[0]])continue;
   const receipt=GFA_ID文字列_(r[c[1]]),key=GFA_ID文字列_(r[c[2]]),old=GFA_ID文字列_(r[c[3]]);
   if(!receipt&&!key&&!old){count.legacy++;continue;}
   if(!receipt||!key||receiptCounts.get(receipt)!==1||keyCounts.get(key)!==1){count.review++;continue;}
   try{
   const result=GFA_割当DriverIDを照合_(receipt,old,{line,vehicle,waitingKey:key});
   if(result.state!=='resolved'){count.pending++;continue;}
   if(old){count.linked++;continue;}
   if(r[c[4]]||r[c[5]]!=='名変待ち'){count.review++;continue;}
   count.ready++;
   if(write){
   const live=s.getRange(i+1,1,1,h.length).getDisplayValues()[0];
   if(c.some(j=>live[j]!==r[j])){count.review++;continue;}
   const cell=s.getRange(i+1,c[3]+1);if(cell.getFormula()||cell.getValue()!==''){count.review++;continue;}
   cell.setValue(result.driver_id);SpreadsheetApp.flush();
   if(cell.getDisplayValue()!==result.driver_id)throw Error('書込確認失敗');
   count.updated++;
   }
   }catch(e){count.review++;console.warn('GFA waiting review row='+ (i+1));}
   }
   console.log(JSON.stringify(count));return count;
   }finally{lock.releaseLock();}
  }

  /** 名変待ちへの明示的な受付登録。スタッフ認証済みのサーバー処理からのみ呼ぶ内部関数。 */
  function GFA_名変待ち受付登録_(receiptId,key){
   const p=PropertiesService.getScriptProperties();
   if(p.getProperty('GFA_WAITING_LINK_ENABLED')!=='true')throw Error('書込未承認');
   const vid=p.getProperty('GFA_APPROVED_BOOK_ID'),lid=p.getProperty('GFA_APPROVED_LINE_BOOK_ID');
   if(!vid||!lid||vid===lid)throw Error('接続先不正');
   receiptId=String(receiptId||'').trim();key=String(key||'').trim();
   if(!receiptId||!/^[a-f0-9]{64}$/i.test(key))throw Error('受付識別情報不正');
   const lock=LockService.getScriptLock();lock.waitLock(30000);
   try{
   const vehicle=SpreadsheetApp.openById(vid),line=SpreadsheetApp.openById(lid);
   const result=GFA_割当DriverIDを照合_(receiptId,'',{vehicle,line,waitingKey:key});
   if(result.state!=='resolved')return result;
   const driver=GFA_割当照合行_(vehicle.getSheetByName('ドライバーマスター'),'DriverID',result.driver_id,['氏名','所属会社名','稼働エリア','割当VehicleID']);
   const s=vehicle.getSheetByName('名変待ち管理'),rows=s.getDataRange().getDisplayValues();
   const headers=['受付ID','氏名','所属会社名','稼働エリア','希望日','ステータス','割当VehicleID','割当車番','受付日時','割当日時','備考','進捗','旧シート行','LINE受付ID','受付識別子','DriverID'];
   if(headers.some((v,i)=>!GFA_名変待ち見出し一致_(rows[0],i,v)))throw Error('列構成不一致');
   const matches=rows.slice(1).filter(r=>r[13]===receiptId||r[14]===key);
   if(matches.length){if(matches.length===1&&matches[0][13]===receiptId&&matches[0][14]===key&&matches[0][15]===result.driver_id)return {state:'already_registered',id:matches[0][0]};throw Error('受付重複・不一致');}
   if(driver['割当VehicleID'])throw Error('既存割当あり');
   const cars=vehicle.getSheetByName('車両台帳').getDataRange().getDisplayValues();
   const dc=cars[0].indexOf('DriverID');if(dc<0||cars[0].filter(x=>x==='DriverID').length!==1)throw Error('車両台帳DriverID列不正');
   if(cars.slice(1).some(r=>r[dc]===result.driver_id))throw Error('車両台帳に既存割当あり');
   if(rows.slice(1).some(r=>r[15]===result.driver_id||(!r[15]&&String(r[1]).normalize('NFKC').replace(/\s/g,'')===driver['氏名'].normalize('NFKC').replace(/\s/g,''))))throw Error('既存名変待ちの確認が必要');
   const ids=rows.slice(1).filter(r=>r[0]).map(r=>Number(r[0]));
   if(ids.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(ids).size!==ids.length)throw Error('受付ID不正');
   const id=Math.max(0,...ids)+1;if(!Number.isSafeInteger(id))throw Error('受付ID上限');
   const safe=v=>/^[=+@-]/.test(v)?"'"+v:v;
   s.appendRow([id,safe(driver['氏名']),safe(driver['所属会社名']),safe(driver['稼働エリア']),'','名変待ち','','',new Date(),'','','','',safe(receiptId),key,result.driver_id]);
   SpreadsheetApp.flush();return {state:'registered',id};
   }finally{lock.releaseLock();}
  }
  /** GF138の既存入口の末尾（本体のロック解放後）から呼ぶ。 */
  function GFA_GF138後続同期_(){
   if(PropertiesService.getScriptProperties().getProperty('GFA_WAITING_LINK_ENABLED')!=='true')return;
   return GFA_名変待ちDriverID同期();
  }

  /** 名変待ち管理の列追加。既存データは変更しない。 */
  function GFA_名変待ち列追加診断(){return GFA_名変待ち列準備_(false);}
  function GFA_名変待ち列追加実行(){return GFA_名変待ち列準備_(true);}
  function GFA_名変待ち列準備_(write){
   const id=PropertiesService.getScriptProperties().getProperty('GFA_APPROVED_BOOK_ID');
   if(!id)throw Error('承認済み対象ブックIDが未設定');
   const lock=LockService.getScriptLock();lock.waitLock(30000);
   try{
   const s=SpreadsheetApp.openById(id).getSheetByName('名変待ち管理');
   if(!s)throw Error('対象シートなし');
   const base=['受付ID','氏名','所属会社名','稼働エリア','希望日','ステータス','割当VehicleID','割当車番','受付日時','割当日時','備考','進捗','旧シート行'];
   const extra=['LINE受付ID','受付識別子','DriverID'];
   if(s.getMaxColumns()<16)throw Error('列数不足');
   const h=s.getRange(1,1,1,Math.max(16,s.getLastColumn())).getDisplayValues()[0];
   if(base.some((v,i)=>!GFA_名変待ち見出し一致_(h,i,v)))throw Error('既存列構成不一致');
   const done=extra.every((v,i)=>h[13+i]===v)&&extra.every(v=>h.filter(x=>x===v).length===1);
   if(done)return {state:'already_ready'};
   if(extra.some(v=>h.includes(v)))throw Error('既存追加列の位置を確認');
   const r=s.getRange(1,14,Math.max(1,s.getLastRow()),3);
   if(r.getValues().some(row=>row.some(v=>v!==''))||r.getFormulas().some(row=>row.some(Boolean)))throw Error('追加先に既存データあり');
   if(r.isPartOfMerge())throw Error('追加先に結合セルあり');
   if(write){s.getRange(1,14,1,3).setValues([extra]);SpreadsheetApp.flush();if(extra.some((v,i)=>s.getRange(1,14,1,3).getDisplayValues()[0][i]!==v))throw Error('書込確認失敗');}
   return {state:write?'ready':'diagnostic_ok',columns:extra};
   }finally{lock.releaseLock();}
  }

  function GFA_名変待ち見出し一致_(header,index,expected){
   const allowed=expected==='旧シート行' ? [expected,'旧社長シート行'] : [expected];
   return allowed.includes(header[index])&&header.filter(value=>allowed.includes(value)).length===1;
  }

  const source = line.getSheetByName('車両依頼受付');
  const intake = line.getSheetByName('LINE受付管理');
  const waiting = vehicle.getSheetByName('名変待ち管理');
  const drivers = vehicle.getSheetByName('ドライバーマスター');
  const history = vehicle.getSheetByName('GF_LINEドライバー同期履歴');
  const ledger = vehicle.getSheetByName('車両台帳');
  const value = (sheet, key) => {
    const h = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    const col = h.indexOf(key);
    if (col < 0 || h.lastIndexOf(key) !== col) throw Error('検証見出し不正: ' + key);
    return sheet.getRange(2,col+1).getDisplayValue();
  };
  if ([source,intake,waiting].some(s => s.getLastRow() !== 2) ||
      [drivers,history,ledger].some(s => s.getLastRow() !== 1) ||
      value(source,'LINE受付ID') !== 'TEST-R03' || value(intake,'受付ID') !== 'TEST-R03' ||
      value(waiting,'LINE受付ID') !== 'TEST-R03' || value(source,'書類状態') !== '保存完了' ||
      value(source,'受付識別子') !== 'c'.repeat(64) || value(waiting,'受付識別子') !== 'c'.repeat(64) ||
      value(waiting,'ステータス') !== '名変待ち' || value(waiting,'割当VehicleID') ||
      value(intake,'DriverID') || value(source,'確認DriverID') || value(waiting,'DriverID') ||
      [source,intake].some(s => s.getDataRange().getDisplayValues().flat().some(v => /https?:/i.test(v)))) {
    throw Error('TEST-R03の隔離された初回条件を確認してください');
  }
  GF138_車両依頼を同期_本体_();
  if (value(intake,'DriverID') !== 'D999903' || value(drivers,'DriverID') !== 'D999903' ||
      value(history,'DriverID') !== 'D999903' || value(history,'処理状態') !== '登録済') throw Error('GF138不一致');
  GF143_確認DriverIDを反映();
  if (value(source,'確認DriverID') !== 'D999903') throw Error('GF143不一致');
  const first = GFA_GF138後続同期_();
  const snapshot = () => JSON.stringify([source,intake,waiting,drivers,history,ledger]
    .map(s => s.getDataRange().getDisplayValues()));
  const saved = snapshot();
  GF138_車両依頼を同期_本体_();
  GF143_確認DriverIDを反映();
  const retry = GFA_GF138後続同期_();
  const duplicate = GFA_名変待ち受付登録_('TEST-R03','c'.repeat(64));
  if (first.updated !== 1 || first.review || retry.updated !== 0 || retry.review ||
      value(waiting,'DriverID') !== 'D999903' || duplicate.state !== 'already_registered' ||
      snapshot() !== saved) throw Error('後続同期、再実行または重複登録照合不一致');
  const result = {receipt:'TEST-R03', gf138:'registered', gf143:'confirmed', first, retry, duplicate};
  console.log(JSON.stringify(result));
  return result;
}
