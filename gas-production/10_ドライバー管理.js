/******************************************************
 * GOLD FIRST 新システム
 * 10_ドライバー管理.gs
 *
 * 役割
 * ・スマホから新規ドライバーを登録
 * ・DriverIDを自動発番
 * ・任意で登録済み車両へ紐付け
 * ・重いDrive/車両同期は登録後に別リクエストで実行
 ******************************************************/
function スマホから新規ドライバーを登録する(data) {
  data = data || {};
  const 氏名 = GF_氏名表記を整える_10(data['氏名']);
  if (!氏名) throw new Error('氏名を入力してください。');
  const VehicleID = String(data['VehicleID'] || '').trim();
  const ロック = LockService.getScriptLock();
  if (!ロック.tryLock(10000)) {
    throw new Error('別の更新処理中です。数秒後にもう一度お試しください。');
  }
  let DriverID = '';
  let ドライバー行 = 0;
  let 車両行 = 0;
  let 車番 = '';
  try {
    const ss = 対象スプレッドシートを開く_();
    const dm = 必須シートを取得する_(ss, シート名.ドライバーマスター);
    // 確認と発番を同じロック内で行う。同時登録による確認漏れを防ぐ。
    const 同名候補 = GF_同じ氏名の候補を取得する_10(dm, 氏名);
    const 既存ID = String(data.既存DriverID || '').trim();
    if (既存ID) {
      const person = 同名候補.find(x => x.DriverID === 既存ID);
      if (!person) throw new Error('選択したドライバーと氏名が一致しません。もう一度確認してください。');
      return {成功:true, 既存:true, DriverID:person.DriverID, 氏名:person.氏名,
        ドライバー行:person.行番号, VehicleID:'', 車両行:0, 車番:'',
        メッセージ:'登録済みドライバーを選択しました。'};
    }
    if (同名候補.length) {
      const 確認済み = Array.isArray(data.確認済みDriverID一覧)
        ? data.確認済みDriverID一覧.map(String).sort() : [];
      const 現在ID = 同名候補.map(x => x.DriverID).sort();
      const 別人確認済み = data.同姓同名を別人として登録 === true &&
        JSON.stringify(確認済み) === JSON.stringify(現在ID);
      if (!別人確認済み) {
        return {成功:false, 同姓同名確認:true, 氏名:氏名, 候補:同名候補,
          メッセージ:'同じ氏名のドライバーが登録されています。登録済みの方か確認してください。'};
      }
    }
    // 既存の共通ID発番ルールをそのまま使う。
    DriverID = 次のIDを発番する_(
      dm,
      'DriverID',
      ドライバーID設定
    );
    ドライバー行 = Math.max(dm.getLastRow() + 1, 2);
    const 新規データ = {
      DriverID: DriverID,
      氏名: 氏名,
      フリガナ: data['フリガナ'] || '',
      電話番号: data['電話番号'] || '',
      紹介元: data['紹介元'] || '',
      所属会社名: data['所属会社名'] || '',
      稼働エリア: data['稼働エリア'] || '',
      契約者メールアドレス: data['契約者メールアドレス'] || '',
      緊急連絡先氏名: data['緊急連絡先氏名'] || '',
      緊急連絡先メールアドレス: data['緊急連絡先メールアドレス'] || '',
      登録日: new Date(),
      ステータス: String(data['ステータス'] || '').trim() || '有効',
      備考: data['備考'] || ''
    };
    // 車両選択は任意。選ばれた場合だけ車両台帳へ人物情報を反映する。
    if (VehicleID) {
      const ledger = 必須シートを取得する_(ss, シート名.車両台帳);
      車両行 = IDで行を探す_(ledger, 'VehicleID', VehicleID);
      if (!車両行) {
        throw new Error('選択した車両が車両台帳に見つかりません。');
      }
      const 車両データ = 行データを取得する_(ledger, 車両行);
      車番 = String(車両データ['車番'] || '').trim();
      // 既に別の使用者がいる車両を黙って上書きしない。
      const 現在使用者 = String(車両データ['現在使用者'] || '').trim();
      const 現在DriverID = String(車両データ['DriverID'] || '').trim();
      if (現在使用者 && 現在DriverID && 現在DriverID !== DriverID) {
        throw new Error(
          '選択した車両「' + 車番 + '」には現在使用者「' +
          現在使用者 + '」が登録されています。先に使用者変更処理を行ってください。'
        );
      }
      const 台帳更新 = {
        現在使用者: 氏名,
        DriverID: DriverID,
        フリガナ: 新規データ.フリガナ,
        電話番号: 新規データ.電話番号,
        紹介元: 新規データ.紹介元,
        所属会社名: 新規データ.所属会社名,
        稼働エリア: 新規データ.稼働エリア,
        契約者メールアドレス: 新規データ.契約者メールアドレス,
        緊急連絡先氏名: 新規データ.緊急連絡先氏名,
        緊急連絡先メールアドレス: 新規データ.緊急連絡先メールアドレス,
        ドライバーステータス: 新規データ.ステータス,
        ドライバー備考: 新規データ.備考,
        更新日時: new Date()
      };
      行を書き込む_(dm, ドライバー行, 新規データ);
      行を書き込む_(ledger, 車両行, 台帳更新);
    }
    if (!VehicleID) 行を書き込む_(dm, ドライバー行, 新規データ);
    SpreadsheetApp.flush();
  } finally {
    ロック.releaseLock();
  }
  // 新規登録したドライバーをスマホ検索へ即時反映
  if (typeof スマホ用ドライバー一覧キャッシュを削除する_ === 'function') {
    スマホ用ドライバー一覧キャッシュを削除する_();
  }
  return {
    成功: true,
    DriverID: DriverID,
    氏名: 氏名,
    ドライバー行: ドライバー行,
    VehicleID: VehicleID,
    車両行: 車両行,
    車番: 車番,
    メッセージ: VehicleID
      ? 'ドライバーを登録し、車両へ紐付けました。'
      : 'ドライバーを登録しました。'
  };
}
function スマホ新規ドライバー登録後処理を実行する(DriverID, 氏名, 車両行) {
  const 対象DriverID = String(DriverID || '').trim();
  const 対象氏名 = String(氏名 || '').trim();
  const 対象車両行 = Number(車両行 || 0);
  if (!対象DriverID) throw new Error('DriverIDが空です。');
  if (!対象氏名) throw new Error('氏名が空です。');
  // 免許証保存に使うドライバー個人Driveを先に準備。
  if (typeof ドライバーDriveフォルダを準備する_ === 'function') {
    ドライバーDriveフォルダを準備する_(
      対象DriverID,
      対象氏名
    );
  }
  // 車両を選んで登録した場合だけ既存の1台同期を通す。
  if (対象車両行 >= 2) {
    車両台帳の1台を同期する(対象車両行);
    if (typeof 車両行のDriveフォルダを準備する_ === 'function') {
      車両行のDriveフォルダを準備する_(対象車両行);
    }
  }
  return {
    成功: true,
    DriverID: 対象DriverID
  };
}
/******************************************************
 * STEP6 免許証先行登録
 *
 * 既存コードは消さずに追加してください。
 *
 * 流れ
 * 1. 免許証2枚からAIで氏名読取
 * 2. DriverID発行・ドライバーマスター最低限登録
 * 3. ドライバーDrive準備
 * 4. 同じ2枚で免許証画像＋PDF保存
 * 5. 後から必要な追加情報だけ更新
 ******************************************************/
function スマホから免許証を先行登録する(画像一覧) {
  if (!Array.isArray(画像一覧) || 画像一覧.length !== 2) {
    throw new Error('免許証の表・裏2枚が必要です。');
  }
  // ① 既存Gemini処理をそのまま使って氏名だけ読む
  const 読取結果 = スマホから免許証氏名を読み取る(画像一覧);
  const 氏名 = String(
    読取結果 && 読取結果.氏名 || ''
  ).trim();
  // 読めなかった時はDriverIDを発行しない
  if (!氏名) {
    return {
      成功: false,
      メッセージ:
        (読取結果 && 読取結果.メッセージ) ||
        '氏名を読み取れませんでした。写真を確認してもう一度お試しください。'
    };
  }
  // ② DriverID発行＋氏名だけで最低限マスター登録
  const 登録結果 = スマホから新規ドライバーを登録する({
    氏名: 氏名
  });
  const DriverID = String(登録結果.DriverID || '').trim();
  if (!DriverID) {
    throw new Error('DriverIDを発行できませんでした。');
  }
  // ③ Driveフォルダを先に準備
  スマホ新規ドライバー登録後処理を実行する(
    DriverID,
    氏名,
    0
  );
  // ④ 同じ画像2枚を既存の免許証保存処理へそのまま渡す
  const PDF結果 = スマホから免許証をまとめて登録する(
    DriverID,
    画像一覧
  );
  return {
    成功: true,
    DriverID: DriverID,
    氏名: 氏名,
    PDFURL: String(
      PDF結果 && PDF結果.PDFURL || ''
    ),
    メッセージ: '免許証登録が完了しました。'
  };
}
/******************************************************
 * 既に発行済みのDriverIDへ追加情報だけ保存
 ******************************************************/
/******************************************************
 * STEP7
 * 氏名はブラウザ側で既存AI処理により確定済み。
 * ここでは
 * DriverID発行 → Drive準備 → 同じ2枚でPDF保存
 * だけを1回のGAS処理で行う。
 *
 * 10_ドライバー管理.gs の末尾へ追加。
 ******************************************************/
function スマホから免許証を氏名確定後に登録する(
  氏名,
  画像一覧
) {
  const 確定氏名 = String(氏名 || '').trim();
  if (!確定氏名) {
    throw new Error('氏名が空です。');
  }
  if (!Array.isArray(画像一覧) || 画像一覧.length !== 2) {
    throw new Error('免許証画像が2枚届いていません。');
  }
  console.log(
    'STEP7開始 / 氏名=' + 確定氏名 +
    ' / 画像数=' + 画像一覧.length
  );
  // ① DriverID発行＋氏名だけ最低限登録
  const 登録結果 = スマホから新規ドライバーを登録する({
    氏名: 確定氏名
  });
  const DriverID = String(
    登録結果 && 登録結果.DriverID || ''
  ).trim();
  if (!DriverID) {
    throw new Error('DriverIDを発行できませんでした。');
  }
  console.log(
    'DriverID発行完了 / DriverID=' + DriverID
  );
  // ② ドライバー個人Driveを準備
  スマホ新規ドライバー登録後処理を実行する(
    DriverID,
    確定氏名,
    0
  );
  console.log(
    'Drive準備完了 / DriverID=' + DriverID
  );
  // ③ 最初に選択した同じ2枚を既存PDF処理へ
  const PDF結果 = スマホから免許証をまとめて登録する(
    DriverID,
    画像一覧
  );
  console.log(
    '免許証保存完了 / DriverID=' + DriverID
  );
  return {
    成功: true,
    DriverID: DriverID,
    氏名: 確定氏名,
    PDFURL: String(
      PDF結果 && PDF結果.PDFURL || ''
    ),
    メッセージ: '免許証登録が完了しました。'
  };
}
/******************************************************
 * GOLD FIRST
 * 10_ドライバー管理.gs 末尾追記 STEP8
 *
 * 追加するもの
 * ・追加情報保存（今止まっていた原因の不足関数）
 * ・登録済みドライバー詳細取得
 *
 * ※既存コードは消さず、このまま末尾へ追加
 ******************************************************/
/******************************************************
 * GOLD FIRST
 * 10_ドライバー管理.gs 末尾追記 STEP8
 *
 * 追加するもの
 * ・追加情報保存（今止まっていた原因の不足関数）
 * ・登録済みドライバー詳細取得
 *
 * ※既存コードは消さず、このまま末尾へ追加
 ******************************************************/
function スマホからドライバー追加情報を更新する(DriverID, data) {
  DriverID = String(DriverID || '').trim();
  data = data || {};
  if (!DriverID) {
    throw new Error('DriverIDが空です。');
  }
  const ロック = LockService.getScriptLock();
  // スマホから同時に軽い書込みが来た場合だけ順番待ち。
  // 登録キューワーカーとはロックを分離済みなので、重い裏処理待ちにはならない。
  ロック.waitLock(30000);
  let 車番 = '';
  try {
    const ss = 対象スプレッドシートを開く_();
    const dm = 必須シートを取得する_(ss, シート名.ドライバーマスター);
    if (String(data.VehicleID || '').trim()) {
      const check = GF_複数車両の確認結果を作る_20(ss, DriverID, data.氏名, data.VehicleID);
      if (check.複数車両確認 && !GF_複数車両確認が一致する_20(check, data.複数車両確認済み)) return check;
    }
    const row = IDで行を探す_(dm, 'DriverID', DriverID);
    if (!row) {
      throw new Error('ドライバーが見つかりません。DriverID=' + DriverID);
    }
    const 更新 = {
      氏名: GF_氏名表記を整える_10(data['氏名']),
      フリガナ: data['フリガナ'] || '',
      電話番号: data['電話番号'] || '',
      紹介元: data['紹介元'] || '',
      所属会社名: data['所属会社名'] || '',
      稼働エリア: data['稼働エリア'] || '',
      契約者メールアドレス: data['契約者メールアドレス'] || '',
      緊急連絡先氏名: data['緊急連絡先氏名'] || '',
      緊急連絡先メールアドレス: data['緊急連絡先メールアドレス'] || '',
      備考: data['備考'] || ''
    };
    // 氏名を空欄で上書きしない
    if (!更新.氏名) {
      delete 更新.氏名;
    }
    行を書き込む_(dm, row, 更新);
    SpreadsheetApp.flush();
  } finally {
    ロック.releaseLock();
  }
  // 車両選択がある場合は、既存の安全な割当処理を使う。
  const VehicleID = String(data['VehicleID'] || '').trim();
  if (VehicleID) {
    if (typeof 既存ドライバーを空車へ割り当てる !== 'function') {
      throw new Error('ドライバー情報は保存しましたが、車両割当処理が見つかりません。');
    }
    const r = 既存ドライバーを空車へ割り当てる(VehicleID, DriverID, data.複数車両確認済み);
    if (r && r.複数車両確認) return r;
    車番 = String(r && r.車番 || '').trim();
  }
  return {
    成功: true,
    DriverID: DriverID,
    車番: 車番,
    メッセージ: 'ドライバー情報を保存しました。'
  };
}
function スマホ用ドライバー詳細を取得する(DriverID) {
  DriverID = String(DriverID || '').trim();
  if (!DriverID) {
    throw new Error('DriverIDが空です。');
  }
  const ss = 対象スプレッドシートを開く_();
  const dm = 必須シートを取得する_(ss, シート名.ドライバーマスター);
  const row = IDで行を探す_(dm, 'DriverID', DriverID);
  if (!row) {
    throw new Error('ドライバーが見つかりません。DriverID=' + DriverID);
  }
  const d = 行データを取得する_(dm, row);
  return {
    DriverID: DriverID,
    氏名: d['氏名'] || '',
    フリガナ: d['フリガナ'] || '',
    電話番号: d['電話番号'] || '',
    紹介元: d['紹介元'] || '',
    所属会社名: d['所属会社名'] || '',
    稼働エリア: d['稼働エリア'] || '',
    契約者メールアドレス: d['契約者メールアドレス'] || '',
    緊急連絡先氏名: d['緊急連絡先氏名'] || '',
    緊急連絡先メールアドレス: d['緊急連絡先メールアドレス'] || '',
    ステータス: d['ステータス'] || '',
    備考: d['備考'] || ''
  };
}
/******************************************************
 * 10_ドライバー管理.gs 末尾追記
 * 免許証登録：DriverIDだけ先に確定する軽量受付
 ******************************************************/
/** 同じ氏名の候補があれば、発番せずに確認用データを返す。 */
function スマホ免許証ドライバーを先に登録する(氏名, 確認) {
  const 確定氏名 = GF_氏名表記を整える_10(氏名);
  if (!確定氏名) throw new Error('氏名が空です。');
  確認 = 確認 || {};
  const result = スマホから新規ドライバーを登録する({
    氏名:確定氏名,
    既存DriverID:確認.既存DriverID,
    同姓同名を別人として登録:確認.同姓同名を別人として登録,
    確認済みDriverID一覧:確認.確認済みDriverID一覧
  });
  if (result && result.同姓同名確認) return result;
  if (!result || !result.DriverID) throw new Error('ドライバーを確認できませんでした。');
  return result;
}
function GF_氏名表記を整える_10(値) {
  return GF_会社名を正規化する_20(値) || String(値 || '').trim().replace(/[\s\u200B]+/g, ' ');
}
function GF_氏名比較キーを作る_10(値) {
  // 法人名の表記差を吸収し、個人の漢字・旧字体は変更しない。
  return GF_使用者名比較キーを作る_20(値);
}
function GF_同じ氏名の候補を取得する_10(dm, 氏名) {
  const target = GF_氏名比較キーを作る_10(氏名);
  if (!target || dm.getLastRow() < 2) return [];
  const all = dm.getRange(1, 1, dm.getLastRow(), dm.getLastColumn()).getDisplayValues();
  const cols = {};
  all[0].forEach((v,i) => {
    const name = String(v || '').trim();
    if (!name) return;
    if (Object.prototype.hasOwnProperty.call(cols, name)) throw new Error('ドライバーマスターの列「' + name + '」が重複しています。');
    cols[name] = i;
  });
  if (cols.DriverID === undefined || cols['氏名'] === undefined) throw new Error('ドライバーマスターにDriverID・氏名列が必要です。');
  const result = [];
  all.slice(1).forEach((r,i) => {
    if (GF_氏名比較キーを作る_10(r[cols['氏名']]) !== target) return;
    const id = String(r[cols.DriverID] || '').trim();
    if (!id) throw new Error('同じ氏名の登録にDriverIDがありません。管理担当者に確認してください。');
    if (result.some(x => x.DriverID === id)) throw new Error('同じDriverIDが重複しています。管理担当者に確認してください。');
    const value = name => cols[name] === undefined ? '' : String(r[cols[name]] || '').trim();
    result.push({DriverID:id, 氏名:value('氏名'), フリガナ:value('フリガナ'),
      電話番号:value('電話番号'), ステータス:value('ステータス'), 行番号:i + 2});
  });
  return result;
}

/** 読取後の確認専用。発番・保存・Drive作成は一切行わない。 */
function スマホ免許証登録前に同名を確認する(氏名) {
  氏名 = GF_氏名表記を整える_10(氏名);
  if (!氏名) throw new Error('氏名を入力してください。');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('別の更新処理中です。数秒後にもう一度お試しください。');
  try {
    const ss = 対象スプレッドシートを開く_();
    const dm = 必須シートを取得する_(ss, シート名.ドライバーマスター);
    const 候補 = GF_同じ氏名の候補を取得する_10(dm, 氏名);
    return {成功:true, 氏名:氏名, 同姓同名確認:候補.length > 0, 候補:候補};
  } finally { lock.releaseLock(); }
}