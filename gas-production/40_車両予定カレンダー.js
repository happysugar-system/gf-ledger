/******************************************************
 * GOLD FIRST 新システム
 * 40_車両予定カレンダー.gs
 *
 * 入力: スマホ／車両台帳
 *   ↓
 * 予定管理（正本）
 *   ↓
 * Googleカレンダー（表示）
 * 車両状況「次の予定」
 ******************************************************/
const 台帳予定列対応 = {
  納車:'納車予定日',
  返却:'返却予定日',
  代車:'代車予定日',
  代車返却:'代車返却予定日',
  車検:'車検予定日',
  名変:'名変予定日',
  板金:'板金予定日',
  整備:'整備予定日',
  '12点検':'12点検予定日'
};
function スマホ用予定種類一覧を取得する() {
  return 予定種類一覧を取得する_(true).map(x => ({
    予定種類ID:x.予定種類ID,
    予定種類名:x.予定種類名,
    開始操作を使う:x.開始操作を使う
  }));
}
function 予定種類一覧を取得する_(スマホのみ, ss) {
  ss = ss || 対象スプレッドシートを開く_();
  const s=必須シートを取得する_(ss,シート名.予定種類マスター);
  if(s.getLastRow()<2)return [];
  const h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
  const vals=s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).getValues();
  return vals.map(r=>{
    const o={}; h.forEach((k,i)=>o[k]=r[i]); return o;
  }).filter(o=>真偽値_(o['有効']) && (!スマホのみ || 真偽値_(o['スマホ表示'])))
    .sort((a,b)=>Number(a['並び順']||999)-Number(b['並び順']||999));
}
function 予定種類を取得する_(IDまたは名前, ss) {
  const key=String(IDまたは名前||'').trim();
  if(key==='車検満了'||key==='GF_VEHICLE_INSPECTION_EXPIRY'){
    return {予定種類ID:'GF_VEHICLE_INSPECTION_EXPIRY',予定種類名:'車検満了',
      カレンダー種別:'車検',有効:true,スマホ表示:false,開始操作を使う:false};
  }
  const x=予定種類一覧を取得する_(false, ss).find(o =>
    String(o['予定種類ID']||'').trim()===key || String(o['予定種類名']||'').trim()===key
  );
  if(!x)throw new Error('予定種類「'+key+'」が予定種類マスターにありません。');
  return x;
}
/**
 * スマホ画面用：選択した車両の未完了予定を返す。
 * 予定IDを使って開始・完了・取消するための一覧。
 */
function スマホ用車両予定一覧を取得する(VehicleID) {
  const 対象ID = String(VehicleID || '').trim();
  if (!対象ID) return [];
  const ss = 対象スプレッドシートを開く_();
  const 管理 = 必須シートを取得する_(ss, シート名.予定管理);
  if (管理.getLastRow() < 2) return [];
  const h = 管理.getRange(1,1,1,管理.getLastColumn())
    .getDisplayValues()[0].map(v=>String(v||'').trim());
  const rows = 管理.getRange(2,1,管理.getLastRow()-1,管理.getLastColumn()).getValues();
  const c = {}; h.forEach((v,i)=>c[v]=i);
  // 予定カードごとにマスターを読み直さない。1回だけ取得してMap化する。
  const 種類Map = {};
  予定種類一覧を取得する_(false, ss).forEach(x=>{
    種類Map[String(x['予定種類ID']||'').trim()] = x;
    種類Map[String(x['予定種類名']||'').trim()] = x;
  });
  return rows.map(r=>{
    if (String(r[c['VehicleID']]||'').trim() !== 対象ID) return null;
    const 状態 = String(r[c['状態']]||'').trim();
    if (!['予定','進行中'].includes(状態)) return null;
    const 種類 = 種類Map[String(r[c['予定種類ID']]||r[c['予定種類名']]||'').trim()] || {};
    const d = r[c['予定日']];
    const 日付 = d instanceof Date && !isNaN(d.getTime())
      ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d||'');
    return {
      予定ID: String(r[c['予定ID']]||'').trim(),
      予定種類ID: String(r[c['予定種類ID']]||'').trim(),
      予定種類名: String(r[c['予定種類名']]||'').trim(),
      予定日: 日付,
      状態: 状態,
      備考: String(r[c['備考']]||''),
      開始操作を使う: 真偽値_(種類['開始操作を使う']),
      開始ボタン名: 予定開始ボタン名を取得する_(String(r[c['予定種類名']]||'').trim()),
      完了ボタン名: 予定完了ボタン名を取得する_(String(r[c['予定種類名']]||'').trim())
    };
  }).filter(Boolean).sort((a,b)=>{
    const da = a.予定日 || '9999-12-31', db = b.予定日 || '9999-12-31';
    return da.localeCompare(db) || a.予定種類名.localeCompare(b.予定種類名,'ja');
  });
}
/**
 * 予定ID指定の取消。スマホの予定カードから安全に取り消す。
 */
function スマホから予定IDで取り消す(予定ID) {
  const ss = 対象スプレッドシートを開く_();
  const 管理 = 必須シートを取得する_(ss, シート名.予定管理);
  const 台帳 = 必須シートを取得する_(ss, シート名.車両台帳);
  const 行 = IDで行を探す_(管理, '予定ID', 予定ID);
  if (!行) throw new Error('予定ID=' + 予定ID + ' が見つかりません。');
  const p = 行データを取得する_(管理, 行);
  if (!['予定','進行中'].includes(String(p['状態']||'').trim())) {
    throw new Error('この予定はすでに「' + p['状態'] + '」です。');
  }
  const 種類 = 予定種類を取得する_(p['予定種類ID'] || p['予定種類名'], ss);
  const 車両行 = IDで行を探す_(台帳, 'VehicleID', p['VehicleID']);
  予定を取り消す_(管理, 行, 種類);
  const 台帳列 = 台帳予定列対応[種類['予定種類名']];
  if (台帳列 && 車両行) セルを書き込む_(台帳, 車両行, 台帳列, '');
  if (車両行) GF_予定関連だけ反映する_40(ss,p['VehicleID']);
  return {成功:true, メッセージ:種類['予定種類名']+'予定を取り消しました。'};
}
function スマホから車両予定を登録する(VehicleID,予定種類,日付文字列,貸出情報) {
  return 車両予定を登録する_(VehicleID,予定種類,日付文字列,'スマホ',true,貸出情報);
}
function 車両予定を登録する_(VehicleID,予定種類,日付文字列,登録元,自動実績を許可,貸出情報) {
  const 日付=日付文字列 instanceof Date ? 日付文字列 : 日付文字列から日付を作る_(日付文字列);
  const ロック=LockService.getScriptLock();
  // 混雑時に10秒待たせない。取れなければすぐエラーにして再操作できるようにする。
  if(!ロック.tryLock(1500)) {
    throw new Error('ただいま別の更新処理中です。数秒後にもう一度押してください。');
  }
  try {
    const ss=対象スプレッドシートを開く_();
    const 台帳=必須シートを取得する_(ss,シート名.車両台帳);
    const 管理=必須シートを取得する_(ss,シート名.予定管理);
    const 種類=予定種類を取得する_(予定種類, ss);
    const 車両行番号=IDで行を探す_(台帳,'VehicleID',VehicleID);
    if(!車両行番号)throw new Error('VehicleID='+VehicleID+' の車両が見つかりません。');
    const 車=行データを取得する_(台帳,車両行番号);
    let 行番号=未完了予定行を探す_(管理,VehicleID,種類['予定種類ID']);
    const now=new Date();
    let 予定ID='';
    if(!行番号) {
      行番号=Math.max(管理.getLastRow()+1,2);
      予定ID=次の予定IDを発番する_(管理);
      予定管理行を高速更新する_(管理,行番号,{
        予定ID:予定ID,
        VehicleID:VehicleID,
        車番:車['車番']||'',
        DriverID:車['DriverID']||'',
        現在使用者:車['現在使用者']||'',
        予定種類ID:種類['予定種類ID'],
        予定種類名:種類['予定種類名'],
        予定日:日付,
        状態:'予定',
        登録元:登録元||'',
        登録日時:now,
        更新日時:now
      });
    } else {
      const 既存=行データを取得する_(管理,行番号);
      GF_予定月キャッシュを消す_40(既存['予定日']);
      予定ID=String(既存['予定ID']||'').trim();
      予定管理行を高速更新する_(管理,行番号,{
        車番:車['車番']||'',
        DriverID:車['DriverID']||'',
        現在使用者:車['現在使用者']||'',
        予定日:日付,
        更新日時:now
      });
    }
    const 台帳列=台帳予定列対応[種類['予定種類名']];
    if(台帳列 && 登録元!=='車両台帳') {
      セルを書き込む_(台帳,車両行番号,台帳列,日付);
    }
    if(貸出情報!=null&&['納車','代車'].includes(種類['予定種類名']))GF_予定の貸出情報を保存する_25(ss,予定ID,貸出情報);
    const 自動実績=GF_予定の自動実績依頼を保存する_40(ss,予定ID,種類['予定種類名'],日付,車,自動実績を許可===true);
    GF_予定月キャッシュを消す_40(日付);
    return {
      成功:true,
      予定ID:予定ID,
      メッセージ:(自動実績?'実績登録を受付しました！ ':'登録しました！ ')+(車['車番']||VehicleID)+' / '+種類['予定種類名']+' / '+日付表示_(日付)
    };
  } finally {
    ロック.releaseLock();
  }
}
/**
 * スマホの「登録しました」を先に返した後に呼ぶ後処理。
 * Calendar反映と既存の1台同期は別リクエストで行う。
 */
function スマホ予定登録後処理を実行する(予定ID, 全体同期済み) {
  const ss=対象スプレッドシートを開く_();
  const 管理=必須シートを取得する_(ss,シート名.予定管理);
  const 台帳=必須シートを取得する_(ss,シート名.車両台帳);
  const 行=IDで行を探す_(管理,'予定ID',予定ID);
  if(!行)return {成功:false,メッセージ:'予定が見つかりません。'};
  const p=行データを取得する_(管理,行);
  if(!['予定','進行中'].includes(String(p['状態']||'').trim())) {
    return {成功:true,スキップ:true};
  }
  if(GF_自動実績待ちの予定か_40(予定ID))return {成功:true,自動実績待ち:true};
  const 種類=予定種類を取得する_(p['予定種類ID']||p['予定種類名'], ss);
  const 車両行=IDで行を探す_(台帳,'VehicleID',p['VehicleID']);
  if(!車両行)throw new Error('対象車両が見つかりません。');
  const 車=行データを取得する_(台帳,車両行);
  const 日付=p['予定日'] instanceof Date ? p['予定日'] : 日付文字列から日付を作る_(p['予定日']);
  let calendarError=null;
  try{
    const eventId=カレンダー予定を保存する_(管理,行,種類,車,日付);
    セルを書き込む_(管理,行,'CalendarEventID',eventId);
  }catch(e){calendarError=e;}
  if(全体同期済み!==true)GF_予定関連だけ反映する_40(ss,p['VehicleID']);
  if(calendarError)throw calendarError;
  return {成功:true};
}
function スマホから車両予定を取り消す(VehicleID,予定種類) {
  const ss=対象スプレッドシートを開く_();
  const 種類=予定種類を取得する_(予定種類, ss);
  const 管理=必須シートを取得する_(ss,シート名.予定管理);
  const 台帳=必須シートを取得する_(ss,シート名.車両台帳);
  const 行=未完了予定行を探す_(管理,VehicleID,種類['予定種類ID']);
  if(!行)throw new Error('取り消せる'+種類['予定種類名']+'予定がありません。');
  const 車両行=IDで行を探す_(台帳,'VehicleID',VehicleID);
  予定を取り消す_(管理,行,種類);
  const 台帳列=台帳予定列対応[種類['予定種類名']];
  if(台帳列 && 車両行)セルを書き込む_(台帳,車両行,台帳列,'');
  if(車両行)GF_予定関連だけ反映する_40(ss,VehicleID);
  return {成功:true,メッセージ:種類['予定種類名']+'予定を取り消しました。'};
}
function スマホから予定を開始する(予定ID) {
  const ロック=LockService.getScriptLock();
  if(!ロック.tryLock(1500)) {
    throw new Error('ただいま別の更新処理中です。数秒後にもう一度押してください。');
  }
  let 車両ID='', 種類名='';
  try {
    const ss=対象スプレッドシートを開く_();
    const 管理=必須シートを取得する_(ss,シート名.予定管理);
    const 行=IDで行を探す_(管理,'予定ID',予定ID);
    if(!行)throw new Error('予定ID='+予定ID+' が見つかりません。');
    const p=行データを取得する_(管理,行);
    const 種類=予定種類を取得する_(p['予定種類ID']||p['予定種類名'], ss);
    if(!真偽値_(種類['開始操作を使う'])) {
      throw new Error(種類['予定種類名']+'は開始操作を使わない設定です。');
    }
    if(String(p['状態'])!=='予定') {
      throw new Error('予定状態が「予定」ではありません。');
    }
    const 台帳=必須シートを取得する_(ss,シート名.車両台帳);
    const 車両行=IDで行を探す_(台帳,'VehicleID',p['VehicleID']);
    if(!車両行)throw new Error('対象車両が見つかりません。');
    const 車=行データを取得する_(台帳,車両行);
    予定管理行を高速更新する_(管理,行,{
      状態:'進行中',
      開始日時:new Date(),
      直前ステータス:車['区分/ステータス']||'',
      更新日時:new Date()
    });
    if(種類['予定中ステータス']) {
      セルを書き込む_(台帳,車両行,'区分/ステータス',種類['予定中ステータス']);
    }
    車両ID=String(p['VehicleID']||'').trim();
    種類名=String(種類['予定種類名']||'').trim();
  } finally {
    ロック.releaseLock();
  }
  return {
    成功:true,
    VehicleID:車両ID,
    メッセージ:種類名+'を開始しました。'
  };
}
function スマホから予定を完了する(予定ID) {
  const ロック=LockService.getScriptLock();
  if(!ロック.tryLock(1500)) throw new Error('ただいま別の更新処理中です。数秒後にもう一度押してください。');
  let 車両ID='', 種類名='';
  try {
    const ss=対象スプレッドシートを開く_();
    const 管理=必須シートを取得する_(ss,シート名.予定管理);
    const 行=IDで行を探す_(管理,'予定ID',予定ID);
    if(!行)throw new Error('予定ID='+予定ID+' が見つかりません。');
    const p=行データを取得する_(管理,行);
    const 種類=予定種類を取得する_(p['予定種類ID']||p['予定種類名'], ss);
    種類名=String(種類['予定種類名']||'').trim();
    if(['完了','取消'].includes(String(p['状態']))) {
      throw new Error('この予定はすでに'+p['状態']+'です。');
    }
    const 台帳=必須シートを取得する_(ss,シート名.車両台帳);
    const 車両行=IDで行を探す_(台帳,'VehicleID',p['VehicleID']);
    if(!車両行)throw new Error('対象車両が見つかりません。');
    const 車=行データを取得する_(台帳,車両行);
    const 現在状態=String(車['区分/ステータス']||'').trim();
    // 「代車」は完了＝代車開始。
    // 代車開始前の状態をこの予定に保存し、後の「代車返却」で使う。
    let 保存する直前状態=String(p['直前ステータス']||'').trim();
    if(種類名==='代車' && !保存する直前状態) {
      保存する直前状態=現在状態;
    }
    let 次状態='';
    const 動作=String(種類['完了時動作']||'').trim();
    if(動作==='固定') {
      次状態=String(種類['完了後ステータス']||'').trim();
    }
    if(動作==='直前に戻す') {
      if(種類名==='代車返却') {
        // 返却予定そのものの直前状態（=代車）ではなく、
        // 直近の「代車開始前」の状態へ戻す。
        次状態=代車開始前ステータスを取得する_(管理, String(p['VehicleID']||'').trim());
      } else {
        次状態=保存する直前状態;
      }
    }
    if(次状態) {
      セルを書き込む_(台帳,車両行,'区分/ステータス',次状態);
    }
    予定管理行を高速更新する_(管理,行,{
      状態:'完了',
      完了日時:new Date(),
      直前ステータス:保存する直前状態,
      更新日時:new Date()
    });
    // 完了した予定は「これからやる予定」ではないのでカレンダーから削除。
    完了予定のカレンダーを削除する_(p, 種類);
    const 台帳列=台帳予定列対応[種類名];
    if(台帳列)セルを書き込む_(台帳,車両行,台帳列,'');
    車両ID=String(p['VehicleID']||'').trim();
  } finally {
    ロック.releaseLock();
  }
  return {
    成功:true,
    VehicleID:車両ID,
    メッセージ:予定完了ボタン名を取得する_(種類名)+'しました。'
  };
}
/**
 * 完了後の重い関連シート同期を、画面を待たせず別リクエストで実行する。
 */
function スマホ予定完了後処理を実行する(VehicleID) {
  const ss=対象スプレッドシートを開く_();
  const 台帳=必須シートを取得する_(ss,シート名.車両台帳);
  const 車両行=IDで行を探す_(台帳,'VehicleID',VehicleID);
  if(!車両行)return {成功:false};
  車両台帳の1台を同期する(車両行);
  return {成功:true};
}
function 車両台帳の予定日を予定管理へ同期する(VehicleID) {
  const ss = 対象スプレッドシートを開く_();
  const 台帳 = 必須シートを取得する_(ss, シート名.車両台帳);
  const 管理 = 必須シートを取得する_(ss, シート名.予定管理);
  const 車両行 = IDで行を探す_(台帳, 'VehicleID', VehicleID);
  if (!車両行) throw new Error('対象車両が見つかりません。VehicleID=' + VehicleID);
  const 車 = 行データを取得する_(台帳, 車両行);
  const 結果 = [];
  // 車両台帳の9つの予定日列を、予定管理の正本へ同期する。
  // 同じ VehicleID × 予定種類 の未完了予定があれば更新するので二重登録しない。
  Object.keys(台帳予定列対応).forEach(予定種類名 => {
    const 台帳列名 = 台帳予定列対応[予定種類名];
    const 値 = 車[台帳列名];
    const 種類 = 予定種類を取得する_(予定種類名, ss);
    const 既存行 = 未完了予定行を探す_(管理, VehicleID, 種類['予定種類ID']);
    if (値) {
      // 日付あり：新規登録または既存予定の日付変更。
      // 登録関数側で VehicleID×予定種類 の未完了予定を再利用する。
      const 登録結果 = 車両予定を登録する_(VehicleID, 種類['予定種類ID'], 値, '車両台帳');
      結果.push(登録結果);
      // スマホではHTML側から呼んでいる「登録後処理」を、
      // 車両台帳編集ではトリガー側から明示的に実行する。
      // これで CalendarEventID / Googleカレンダー / 車両状況まで反映する。
      if (登録結果 && 登録結果.予定ID) {
        スマホ予定登録後処理を実行する(登録結果.予定ID);
      }
      return;
    }
    // 日付が消された場合：対応する未完了予定があれば取消。
    // 完了済み履歴は触らない。
    if (既存行) {
      const p = 行データを取得する_(管理, 既存行);
      予定を取り消す_(管理, 既存行, 種類);
      結果.push({
        成功: true,
        予定ID: p['予定ID'],
        VehicleID: VehicleID,
        予定種類名: 種類['予定種類名'],
        操作: '取消'
      });
    }
  });
  // 日付削除（取消）だけだった場合も「次の予定」を再計算する。
  // 登録/更新時は上の登録後処理でも同期されるが、最後に1回揃えておく。
  GF_予定関連だけ反映する_40(ss,VehicleID);
  return {
    成功: true,
    VehicleID: VehicleID,
    件数: 結果.length,
    結果: 結果
  };
}
/**
 * 予定管理の1行をまとめて更新する。
 * 共通の 行を書き込む_ は1セルずつ setValue するため、
 * スマホ予定ではこちらを使って通信回数を減らす。
 */
function 予定管理行を高速更新する_(シート, 行番号, 更新データ) {
  const 列数 = シート.getLastColumn();
  const ヘッダー = シート.getRange(1,1,1,列数).getDisplayValues()[0]
    .map(v=>String(v||'').trim());
  const 現在値 = 行番号 <= シート.getLastRow()
    ? シート.getRange(行番号,1,1,列数).getValues()[0]
    : new Array(列数).fill('');
  Object.keys(更新データ).forEach(列名=>{
    const i=ヘッダー.indexOf(列名);
    if(i<0)throw new Error('「'+シート.getName()+'」に必要な列「'+列名+'」がありません。');
    現在値[i]=更新データ[列名];
  });
  シート.getRange(行番号,1,1,列数).setValues([現在値]);
}
/**
 * 車両台帳で編集された「1種類の予定だけ」を同期する高速版。
 * 9種類全部を毎回走査しない。
 */
function 車両台帳の予定種類を同期する_(VehicleID, 予定種類名, 値, 自動実績を許可) {
  const ss = 対象スプレッドシートを開く_();
  const 台帳 = 必須シートを取得する_(ss, シート名.車両台帳);
  const 管理 = 必須シートを取得する_(ss, シート名.予定管理);
  const 車両行 = IDで行を探す_(台帳, 'VehicleID', VehicleID);
  if (!車両行) throw new Error('対象車両が見つかりません。VehicleID=' + VehicleID);
  const 種類 = 予定種類を取得する_(予定種類名, ss);
  const 既存行 = 未完了予定行を探す_(管理, VehicleID, 種類['予定種類ID']);
  if (値 !== '' && 値 != null) {
    // この1種類だけ登録／日付変更する。
    const 登録結果 = 車両予定を登録する_(VehicleID, 種類['予定種類ID'], 値, '車両台帳',自動実績を許可===true);
    if (登録結果 && 登録結果.予定ID) {
      スマホ予定登録後処理を実行する(登録結果.予定ID);
    }
    return 登録結果;
  }
  // 日付を消した場合は、この1種類だけ取消する。
  if (既存行) {
    const p = 行データを取得する_(管理, 既存行);
    予定を取り消す_(管理, 既存行, 種類);
    GF_予定関連だけ反映する_40(ss,VehicleID);
    return {
      成功: true,
      予定ID: p['予定ID'],
      VehicleID: VehicleID,
      予定種類名: 種類['予定種類名'],
      操作: '取消'
    };
  }
  return {成功:true, VehicleID:VehicleID, 予定種類名:予定種類名, 操作:'変更なし'};
}
/**
 * スタンドアロンGAS用：編集された予定日列だけを予定管理へ流す高速版。
 * 実シートの1行目ヘッダーを見て判定するため、00の列順に依存しない。
 */
function 車両台帳予定日編集トリガー(e) {
  return GF_台帳予定編集を受付する_40(e);
}
function 未完了予定行を探す_(s,VehicleID,種類ID) {
  if(s.getLastRow()<2)return 0;
  const h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
  const v=s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).getDisplayValues();
  const vi=h.indexOf('VehicleID'),ti=h.indexOf('予定種類ID'),si=h.indexOf('状態');
  const hit=[];
  v.forEach((r,i)=>{if(String(r[vi]).trim()===String(VehicleID).trim()&&String(r[ti]).trim()===String(種類ID).trim()&&['予定','進行中'].includes(String(r[si]).trim()))hit.push(i+2);});
  if(hit.length>1)throw new Error('同じ車両・予定種類の未完了予定が複数あります。');
  return hit[0]||0;
}
function 次の予定IDを発番する_(s) {
  const c=列番号を取得する_(s,'予定ID'), last=s.getLastRow(); let max=0;
  if(last>=2)s.getRange(2,c,last-1,1).getDisplayValues().flat().forEach(v=>{const m=String(v||'').match(/^P([0-9]+)$/);if(m)max=Math.max(max,Number(m[1]));});
  return 'P'+String(max+1).padStart(7,'0');
}
function 予定開始ボタン名を取得する_(予定種類名) {
  const 名=String(予定種類名||'').trim();
  return 名 ? 名+'開始' : '開始';
}
function 予定完了ボタン名を取得する_(予定種類名) {
  const 名=String(予定種類名||'').trim();
  if(名==='代車') return '代車開始';
  return 名 ? 名+'完了' : '完了';
}
/**
 * 直近の完了済み「代車」予定から、代車開始前の状態を取得する。
 */
function 代車開始前ステータスを取得する_(管理, VehicleID) {
  if(管理.getLastRow()<2) return '';
  const h=管理.getRange(1,1,1,管理.getLastColumn())
    .getDisplayValues()[0].map(v=>String(v||'').trim());
  const c={}; h.forEach((v,i)=>c[v]=i);
  const rows=管理.getRange(2,1,管理.getLastRow()-1,管理.getLastColumn()).getValues();
  const 候補=rows.filter(r=>
    String(r[c['VehicleID']]||'').trim()===VehicleID &&
    String(r[c['予定種類名']]||'').trim()==='代車' &&
    String(r[c['状態']]||'').trim()==='完了' &&
    String(r[c['直前ステータス']]||'').trim()!==''
  ).sort((a,b)=>{
    const ad=a[c['完了日時']] instanceof Date ? a[c['完了日時']].getTime() : 0;
    const bd=b[c['完了日時']] instanceof Date ? b[c['完了日時']].getTime() : 0;
    return bd-ad;
  });
  return 候補.length ? String(候補[0][c['直前ステータス']]||'').trim() : '';
}
function 完了予定のカレンダーを削除する_(予定データ, 種類) {
  const eventId=String(予定データ['CalendarEventID']||'').trim();
  if(!eventId) return;
  const cal=予定種類のカレンダーを取得する_(種類);
  if(!cal) return;
  try {
    const e=cal.getEventById(eventId);
    if(e)e.deleteEvent();
  } catch(err) {
    console.log('完了予定のカレンダー削除失敗: '+err);
  }
}
function カレンダー予定を保存する_(管理,行,種類,車,日付) {
  const cal=予定種類のカレンダーを取得する_(種類);
  if(!cal)return ''; // 未設定の論理カレンダーは予定管理だけ先に使える
  const p=行データを取得する_(管理,行);
  let e=null, id=String(p['CalendarEventID']||'').trim();
  if(id){try{e=cal.getEventById(id);}catch(_){e=null;}}
  const 表示種類=種類['予定種類名']==='車検'?'車検予定':種類['予定種類名'];
  const title='【'+表示種類+'】'+(車['車番']?' '+車['車番']:'')+(車['現在使用者']?' '+車['現在使用者']:'');
  const desc=['GOLD FIRST 新システム','予定ID: '+p['予定ID'],'VehicleID: '+p['VehicleID'],'予定種類: '+種類['予定種類名']].join(String.fromCharCode(10));
  if(e){e.setTitle(title);e.setAllDayDate(日付);e.setDescription(desc);}
  else e=cal.createAllDayEvent(title,日付,{description:desc});
  return e.getId();
}
function 予定を取り消す_(管理,行,種類) {
  const p=行データを取得する_(管理,行), cal=予定種類のカレンダーを取得する_(種類);
  if(cal&&p['CalendarEventID']){try{const e=cal.getEventById(String(p['CalendarEventID']));if(e)e.deleteEvent();}catch(err){throw err;}}
  GF_予定月キャッシュを消す_40(p['予定日']);
  行を書き込む_(管理,行,{状態:'取消',取消日時:new Date(),更新日時:new Date()});
}
function 予定種類のカレンダーを取得する_(種類) {
  const map={
    '納車':'納車カレンダーID','代車':'代車カレンダーID',
    '車検':'車検カレンダーID','名変':'名変カレンダーID',
    'シフト':'シフトカレンダーID',
    // 板金・整備・12点検用は顧客管理に列を追加したら自動でここへ接続可能
    '整備・点検':'整備点検カレンダーID'
  };
  const 種別=String(種類['カレンダー種別']||'').trim(), 列=map[種別];
  if(!列)return null;
  const 契約=現在の契約情報を取得する_();
  const id=String(契約[列]||'').trim();
  if(!id){
    if(種別==='整備・点検')return null;
    throw new Error('顧客管理の「'+列+'」が空です。');
  }
  const cal=CalendarApp.getCalendarById(id);
  if(!cal)throw new Error('「'+列+'」のGoogleカレンダーを開けません。');
  return cal;
}
function 日付文字列から日付を作る_(文字列) {
  if(文字列 instanceof Date){const d=new Date(文字列);d.setHours(0,0,0,0);return d;}
  const m=String(文字列||'').match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if(!m)throw new Error('予定日の形式が正しくありません。');
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));d.setHours(0,0,0,0);
  if(d.getFullYear()!==Number(m[1])||d.getMonth()!==Number(m[2])-1||d.getDate()!==Number(m[3]))throw new Error('予定日が正しくありません。');
  return d;
}
function 日付表示_(d){return Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy/MM/dd');}
function 真偽値_(v){return v===true || String(v).toUpperCase()==='TRUE' || String(v)==='1';}
function カレンダー接続を確認する() {
  const 契約=現在の契約情報を取得する_();
  const cols=['シフトカレンダーID','納車カレンダーID','代車カレンダーID','車検カレンダーID','名変カレンダーID','整備点検カレンダーID'];
  const 結果=cols.map(c=>{
    const id=String(契約[c]||'').trim(); if(!id)throw new Error('顧客管理の「'+c+'」が空です。');
    const cal=CalendarApp.getCalendarById(id); if(!cal)throw new Error('「'+c+'」のカレンダーを開けません。');
    return c+' → '+cal.getName();
  });
  console.log(結果.join(String.fromCharCode(10))); return 結果.join(String.fromCharCode(10));
}
/**
 * ============================================================
 * 車両台帳の編集トリガー設定
 * ============================================================
 * スタンドアロンGASから、顧客管理に登録された対象スプレッドシートへ
 * インストール型 onEdit トリガーを作成する。
 *
 * 初回セットアップ時に「車両台帳連携トリガーを設定する」を1回だけ実行する。
 */
function 車両台帳連携トリガーを設定する() {
  const 実行関数名 = '車両台帳予定日編集トリガー';
  // 顧客管理から現在の契約先スプレッドシートを取得する。
  // 対象スプレッドシートを開く_() を使うことでIDの直書きを避ける。
  const 対象SS = 対象スプレッドシートを開く_();
  const 対象ID = 対象SS.getId();
  // 同じ関数の既存トリガーを先に削除し、二重発火を防止する。
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 実行関数名) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  const trigger = ScriptApp.newTrigger(実行関数名)
    .forSpreadsheet(対象ID)
    .onEdit()
    .create();
  return {
    成功: true,
    対象スプレッドシートID: 対象ID,
    トリガーID: trigger.getUniqueId(),
    メッセージ: '車両台帳の編集トリガーを設定しました。'
  };
}
/**
 * 車両台帳連携トリガーを削除する。
 * 顧客切替・再設定・保守時に使用。
 */
function 車両台帳連携トリガーを削除する() {
  const 実行関数名 = '車両台帳予定日編集トリガー';
  let 削除件数 = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 実行関数名) {
      ScriptApp.deleteTrigger(trigger);
      削除件数++;
    }
  });
  return {
    成功: true,
    削除件数: 削除件数,
    メッセージ: '車両台帳の編集トリガーを' + 削除件数 + '件削除しました。'
  };
}
/************************************************************
 * 1台同期後のリンク自動更新
 *
 * 車両台帳の同期が終わった車両だけを対象にする。
 ************************************************************/
function 車両1台の画面リンクを更新する_(VehicleID) {
  // このリンク更新の中だけで同じ行・列情報を再利用する。
  const GF_リンク行 = new Map();
  const GF_リンク列 = new Map();
  const GF_リンク行取得 = (sheet, row) => {
    const key = sheet.getSheetId() + ':' + row;
    if (!GF_リンク行.has(key)) GF_リンク行.set(key, 行データを取得する_(sheet, row));
    return GF_リンク行.get(key);
  };
  const GF_リンク列取得 = (sheet, name) => {
    const id = sheet.getSheetId();
    if (!GF_リンク列.has(id)) {
      GF_リンク列.set(id, sheet.getRange(1, 1, 1, sheet.getLastColumn())
        .getDisplayValues()[0].map(v => String(v || '').trim()));
    }
    const h = GF_リンク列.get(id);
    const matches = [];
    h.forEach((v, i) => { if (v === name) matches.push(i + 1); });
    if (matches.length !== 1) throw new Error('「' + sheet.getName() + '」の列「' + name + '」を一意に取得できません。');
    return matches[0];
  };
  const GF_リンク保存 = (sheet, row, name, text, url) => {
    リンク付き文字列を書き込む_(sheet, row, name, text, url, GF_リンク列取得(sheet, name));
  };
  VehicleID = String(VehicleID || '').trim();
  if (!VehicleID) return;
  const ss = 対象スプレッドシートを開く_();
  const 車両台帳 =
    必須シートを取得する_(
      ss,
      シート名.車両台帳
    );
  const 利用者管理 =
    必須シートを取得する_(
      ss,
      シート名.利用者管理
    );
  const 車両状況 =
    必須シートを取得する_(
      ss,
      シート名.車両状況
    );
  const ドライバー =
    必須シートを取得する_(
      ss,
      シート名.ドライバーマスター
    );
  const 台帳行 =
    IDで行を探す_(
      車両台帳,
      'VehicleID',
      VehicleID
    );
  const 利用者行 =
    IDで行を探す_(
      利用者管理,
      'VehicleID',
      VehicleID
    );
  const 状況行 =
    IDで行を探す_(
      車両状況,
      'VehicleID',
      VehicleID
    );
  const driverMap =
    ドライバーリンクMAPを作る_(
      ドライバー
    );
  const マスター氏名列 =
    GF_リンク列取得(
      ドライバー,
      '氏名'
    );
  const 状況車番列 =
    GF_リンク列取得(
      車両状況,
      '車番'
    );
  // ==================================================
  // 車両台帳
  // ==================================================
  if (台帳行) {
    const d =
      GF_リンク行取得(
        車両台帳,
        台帳行
      );
    // 車番 → 車両状況
    if (状況行) {
      GF_リンク保存(
        車両台帳,
        台帳行,
        '車番',
        d['車番'],
        シート表示セルURLを作る_(
          ss,
          車両状況,
          状況車番列,
          状況行
        )
      );
    }
    // 現在使用者 → ドライバーマスター
    const DriverID =
      String(
        d['DriverID'] || ''
      ).trim();
    const driver =
      driverMap.id[DriverID];
    GF_リンク保存(
      車両台帳,
      台帳行,
      '現在使用者',
      d['現在使用者'],
      driver
        ? シート表示セルURLを作る_(
            ss,
            ドライバー,
            マスター氏名列,
            driver.row
          )
        : ''
    );
  }
  // ==================================================
  // 利用者管理
  // ==================================================
  if (利用者行) {
    const d =
      GF_リンク行取得(
        利用者管理,
        利用者行
      );
    // 車番 → 車両状況
    if (状況行) {
      GF_リンク保存(
        利用者管理,
        利用者行,
        '車番',
        d['車番'],
        シート表示セルURLを作る_(
          ss,
          車両状況,
          状況車番列,
          状況行
        )
      );
    }
    // 現在使用者
    const DriverID =
      String(
        d['DriverID'] || ''
      ).trim();
    const driver =
      driverMap.id[DriverID];
    GF_リンク保存(
      利用者管理,
      利用者行,
      '現在使用者',
      d['現在使用者'],
      driver
        ? シート表示セルURLを作る_(
            ss,
            ドライバー,
            マスター氏名列,
            driver.row
          )
        : ''
    );
    // 前使用者
    const 前DriverID =
      String(
        d['前DriverID'] || ''
      ).trim();
    const 前driver =
      driverMap.id[前DriverID];
    GF_リンク保存(
      利用者管理,
      利用者行,
      '前使用者',
      d['前使用者'],
      前driver
        ? シート表示セルURLを作る_(
            ss,
            ドライバー,
            マスター氏名列,
            前driver.row
          )
        : ''
    );
  }
    // ==================================================
  // 車両状況
  // 現在使用者 → ドライバーマスター
  // ==================================================
  if (状況行) {
    const d =
      GF_リンク行取得(
        車両状況,
        状況行
      );
    // 車両台帳のDriverIDを使って本人を特定
    let DriverID = '';
    if (台帳行) {
      const 台帳データ =
        GF_リンク行取得(
          車両台帳,
          台帳行
        );
      DriverID =
        String(
          台帳データ['DriverID'] || ''
        ).trim();
    }
    const driver =
      driverMap.id[DriverID];
    GF_リンク保存(
      車両状況,
      状況行,
      '現在使用者',
      d['現在使用者'],
      driver
        ? シート表示セルURLを作る_(
            ss,
            ドライバー,
            マスター氏名列,
            driver.row
          )
        : ''
    );
  }
  SpreadsheetApp.flush();
}
/************************************************************
 * 1セルだけRichTextリンクにする
 ************************************************************/
function リンク付き文字列を書き込む_(
  sheet,
  row,
  列名,
  表示文字,
  url,
  指定列
) {
  const col = 指定列 ||
    列番号を取得する_(
      sheet,
      列名
    );
  const text =
    String(
      表示文字 || ''
    );
  let builder =
    SpreadsheetApp
      .newRichTextValue()
      .setText(text);
  if (text && url) {
    builder.setLinkUrl(url);
  }
  sheet
    .getRange(
      row,
      col
    )
    .setRichTextValue(
      builder.build()
    );
}
/**
 * ============================================================
 * 一時テスト用：🗓️「予定を見る」通信速度確認
 * ============================================================
 *
 * 目的：
 * スプレッドシート・シフト管理ブック・Googleカレンダーを一切読まず、
 * HTML → GAS の呼び出し自体が速いか確認する。
 *
 * テスト後、この関数は本番版へ差し替える。
 */
/** 予定を見る：更新時は必ず予定管理を読む。月キャッシュの古い値は返さない。 */
function スマホ用統合予定一覧を取得する(年月) {
  return スマホ用統合予定一覧を作る_(String(年月 || '').trim());
}
/** 日付セル・文字列の yyyy/M/d を同じ yyyy-MM-dd に揃える。 */
function GF_予定表示日付_40(value,tz) {
  if(value instanceof Date)return isNaN(value.getTime())?'':Utilities.formatDate(value,tz,'yyyy-MM-dd');
  const m=String(value||'').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T])/);
  if(!m)return '';
  const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]),d=new Date(Date.UTC(y,mo-1,day));
  if(d.getUTCFullYear()!==y||d.getUTCMonth()!==mo-1||d.getUTCDate()!==day)return '';
  return m[1]+'-'+String(mo).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
/**
 * 車両予定を変更した後に呼ぶ。
 * 前月～翌月を消して、次回取得時に必ず最新化する。
 */
function 予定表示キャッシュを削除する() {
  const cache = CacheService.getScriptCache();
  const now = new Date();
  const keys = [];
  for (let n = -1; n <= 1; n++) {
    const d = new Date(now.getFullYear(), now.getMonth() + n, 1);
    const ym =
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0');
    keys.push('GF_SCHEDULE_' + ym);
  }
  cache.removeAll(keys);
  return true;
}
function スマホ用統合予定一覧を作る_(年月) {
  const ym = String(年月 || '').trim();
  const ymParts = ym.split('-');
  const ymValid =
    ym.length === 7 &&
    ymParts.length === 2 &&
    ymParts[0].length === 4 &&
    ymParts[1].length === 2 &&
    !isNaN(Number(ymParts[0])) &&
    !isNaN(Number(ymParts[1])) &&
    Number(ymParts[1]) >= 1 &&
    Number(ymParts[1]) <= 12;
  if (!ymValid) {
    throw new Error('年月の形式が正しくありません。');
  }
  const result = [];
  const tz = Session.getScriptTimeZone();
  // ===== 車両予定 =====
  const ss = 対象スプレッドシートを開く_();
  const planSh = 必須シートを取得する_(ss, シート名.予定管理);
  if (planSh.getLastRow() >= 2) {
    const values = planSh.getDataRange().getValues();
    const headers = values[0].map(v => String(v || '').trim());
    const c = {};
    headers.forEach((v, i) => c[v] = i);
    values.slice(1).forEach(r => {
      const status = String(r[c['状態']] || '').trim();
      if (status === '取消') return;
      const rawDate = r[c['予定日']];
      const date = GF_予定表示日付_40(rawDate, ss.getSpreadsheetTimeZone());
      if (!date.startsWith(ym + '-')) return;
      result.push({
        種別: '車両',
        ID: String(r[c['予定ID']] || '').trim(),
        日付: date,
        予定種類: String(r[c['予定種類名']] || '').trim(),
        車番: String(r[c['車番']] || '').trim(),
        名前: String(r[c['現在使用者']] || '').trim(),
        開始時間: '',
        終了時間: '',
        メモ: String(r[c['備考']]||''),
        状態: status
      });
    });
  }
  result.sort((a, b) =>
    a.日付.localeCompare(b.日付) ||
    a.種別.localeCompare(b.種別, 'ja') ||
    a.名前.localeCompare(b.名前, 'ja')
  );
  return result;
}
/** 写真から読み取った期限。台帳の車検予定日は変更しない。 */
function 車検満了日を予定とカレンダーへ反映する_40(VehicleID,満了日,全体同期済み){
  const result=車両予定を登録する_(VehicleID,'車検満了',満了日,'車検証');
  スマホ予定登録後処理を実行する(result.予定ID,全体同期済み);
  return result;
}
/** 今回の72-53 / V000001のみ、誤って入った満了日と同日の車検予定を整理。
 * スタッフが決めた予定日が別日なら一切変更しない。
 */
function 今回の車検満了日を整理して反映する(){
  const id='V000001';
  const ss=対象スプレッドシートを開く_();
  const ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const row=IDで行を探す_(ledger,'VehicleID',id);
  if(!row)throw new Error('V000001が見つかりません。');
  const car=行データを取得する_(ledger,row);
  if(String(car.車番||'').trim()!=='72-53')throw new Error('確認対象の車番が違うため中止しました。');
  const expiry=car['車検満了日'];
  if(!expiry)throw new Error('車検満了日が空です。');
  const tz=ss.getSpreadsheetTimeZone();
  const expiryText=GF_車検日を予定用文字列にする_20(expiry,tz);
  const plan=car['車検予定日'];
  const management=必須シートを取得する_(ss,シート名.予定管理);
  const type=予定種類を取得する_('車検',ss);
  const oldRow=未完了予定行を探す_(management,id,type.予定種類ID);
  if(oldRow){
    const old=行データを取得する_(management,oldRow);
    const oldText=GF_車検日を予定用文字列にする_20(old.予定日,tz);
    if(oldText===expiryText&&String(old.状態)==='予定'&&String(old.登録元)==='スマホ'
      &&(!plan||GF_車検日を予定用文字列にする_20(plan,tz)===expiryText)){
      予定を取り消す_(management,oldRow,type);
      if(plan)セルを書き込む_(ledger,row,'車検予定日','');
    }else{console.log('既存の車検予定は変更しませんでした。');}
  }else if(plan&&GF_車検日を予定用文字列にする_20(plan,tz)===expiryText){
    console.log('予定の登録元を確認できないため車検予定日は変更しませんでした。');
  }
  const result=車検満了日を予定とカレンダーへ反映する_40(id,日付文字列から日付を作る_(expiryText));
  // Other existing scheduled events retain their dates; refresh inspection title only.
  const remaining=未完了予定行を探す_(management,id,type.予定種類ID);
  if(remaining){const p=行データを取得する_(management,remaining);スマホ予定登録後処理を実行する(p.予定ID);}
  console.log('車検満了日を反映しました。車検予定日='+String(行データを取得する_(ledger,row)['車検予定日']||''));
  return result;
}
/** 初回のみ実行。台帳編集は既存の統合編集トリガーから受付する。 */
/** 1分トリガーと編集受付を準備。統合編集と直接編集の二重受付を避ける。 */
function GF_台帳予定の再試行を設定する() {
  const ss=対象スプレッドシートを開く_(),id=ss.getId(),triggers=ScriptApp.getProjectTriggers();
  GF_予定反映状況列を準備する_40(ss);
  const name='GF_台帳予定同期ワーカー_40';
  if(!triggers.some(t=>t.getHandlerFunction()===name))ScriptApp.newTrigger(name).timeBased().everyMinutes(1).create();
  const combined=triggers.some(t=>t.getHandlerFunction()==='車両台帳編集統合トリガー'&&t.getTriggerSourceId()===id);
  const direct=triggers.filter(t=>t.getHandlerFunction()==='車両台帳予定日編集トリガー'&&t.getTriggerSourceId()===id);
  if(combined)direct.forEach(t=>ScriptApp.deleteTrigger(t));
  else if(!direct.length)ScriptApp.newTrigger('車両台帳予定日編集トリガー').forSpreadsheet(ss).onEdit().create();
  else direct.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
  console.log('予定の軽量反映を設定しました。'+(combined?'統合編集トリガーから受付':'予定日編集トリガーから受付')+'。');
}
function GF_台帳予定編集を受付する_40(e) {
  if(!e||!e.range)return;
  const range=e.range,sheet=range.getSheet();
  if(sheet.getName()!==シート名.車両台帳)return;
  const heads=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const mapping={};
  Object.keys(台帳予定列対応).forEach(kind=>mapping[台帳予定列対応[kind]]=kind);
  mapping['車検満了日']='車検満了';
  const changed=[];
  for(let col=range.getColumn();col<=range.getLastColumn();col++)
    if(mapping[heads[col-1]])changed.push({column:heads[col-1],kind:mapping[heads[col-1]]});
  if(!changed.length)return;
  const idCol=heads.indexOf('VehicleID')+1;
  if(!idCol)throw new Error('車両台帳にVehicleID列がありません。');
  const props=PropertiesService.getScriptProperties(),book=sheet.getParent().getId();
  const active=GF_未完了台帳予定索引_40(sheet.getParent());
  for(let row=Math.max(2,range.getRow());row<=range.getLastRow();row++){
    const id=String(sheet.getRange(row,idCol).getDisplayValue()||'').trim();
    if(!id)continue;
    const targets=changed.filter(x=>{
      const value=sheet.getRange(row,heads.indexOf(x.column)+1).getValue();
      return !GF_予定日が空欄_40(value)||active.has(JSON.stringify([id,x.kind]));
    });
    if(!targets.length)continue;
    targets.forEach(x=>props.setProperty('GF_PLAN_EDIT_40_'+Utilities.getUuid(),JSON.stringify({book,id,column:x.column,kind:x.kind,time:Date.now()})));
    GF_予定反映状況を書く_40(sheet,row,heads,'受付しました（反映待ち）');
  }
  console.log('台帳予定の編集を受付しました。混雑時も次の定期処理で再試行します。');
}
/** 同期中は長いScriptLockを保持しない。予定登録関数自身のロックを使う。 */
/** 受付がなければ即終了。反映は予定関連だけ。 */
function GF_台帳予定同期ワーカー_40() {
  const props=PropertiesService.getScriptProperties(),initial=props.getProperties();
  if(!Object.keys(initial).some(k=>k.indexOf('GF_PLAN_EDIT_40_')===0)&&!initial.GF_PLAN_STATUS_CLEAN_40&&!Object.keys(initial).some(k=>k.startsWith('GF_PLAN_AUTO_40_')))return;
  const lock=LockService.getScriptLock(),leaseKey='GF_PLAN_EDIT_WORKER_40';
  const token=Utilities.getUuid(),start=Date.now();
  if(!lock.tryLock(1000)){console.log('台帳予定：更新中のため受付を保持。次回再試行。');return;}
  let owned=false;
  try{
    let lease=null;try{lease=JSON.parse(props.getProperty(leaseKey)||'null');}catch(e){}
    if(lease&&lease.until>Date.now())return;
    props.setProperty(leaseKey,JSON.stringify({token,until:Date.now()+600000}));owned=true;
  }finally{lock.releaseLock();}
  if(!owned)return;
  try{
    const cleanup=props.getProperty('GF_PLAN_STATUS_CLEAN_40');
    if(cleanup){
      GF_予定受付表示整理本体_40();
      if(props.getProperty('GF_PLAN_STATUS_CLEAN_40')===cleanup)props.deleteProperty('GF_PLAN_STATUS_CLEAN_40');
    }
    const all=props.getProperties(),groups={};
    Object.keys(all).filter(k=>k.indexOf('GF_PLAN_EDIT_40_')===0).forEach(key=>{
      try{
        const job=JSON.parse(all[key]),g=JSON.stringify([job.book,job.id,job.column]);
        if(!groups[g])groups[g]={job,keys:[]};groups[g].keys.push(key);
      }catch(e){console.error('台帳予定受付を確認してください：'+key);}
    });
    const ss=対象スプレッドシートを開く_(),ledger=必須シートを取得する_(ss,シート名.車両台帳);
    const heads=ledger.getRange(1,1,1,ledger.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
    const active=GF_未完了台帳予定索引_40(ss);
    let completed=0;
    for(const g of Object.values(groups)){
      if(Date.now()-start>120000)break;
      const j=g.job;if(j.book!==ss.getId())continue;
      const itemStart=Date.now();
      try{
        const row=IDで行を探す_(ledger,'VehicleID',j.id),col=heads.indexOf(j.column)+1;
        if(!row||!col)throw new Error('対象の車両または予定列がありません。');
        const value=ledger.getRange(row,col).getValue();
        if(GF_予定日が空欄_40(value)&&!active.has(JSON.stringify([j.id,j.kind]))){
          g.keys.forEach(k=>props.deleteProperty(k));
          if(!GF_車両予定受付が残る_40(props,j.book,j.id))GF_不要な予定受付表示を消す_40(ledger,row,heads);
          continue;
        }
        GF_予定反映状況を書く_40(ledger,row,heads,'登録しています…');
        車両台帳の予定種類を同期する_(j.id,j.kind,value,Number(j.time)>=Number(props.getProperty('GF_PLAN_ACTUAL_ENABLED_40')||Infinity));
        // 同期中の再編集は別キーなので消さない。
        g.keys.forEach(k=>props.deleteProperty(k));completed++;
        GF_予定反映状況を書く_40(ledger,row,heads,GF_車両予定受付が残る_40(props,j.book,j.id)?'受付しました（反映待ち）':'');
        console.log('台帳予定同期完了 / VehicleID='+j.id+' / 種類='+j.kind+' / 秒='+((Date.now()-itemStart)/1000).toFixed(2));
      }catch(e){
        const row=IDで行を探す_(ledger,'VehicleID',j.id);
        if(row)GF_予定反映状況を書く_40(ledger,row,heads,'反映待ち（自動で再試行します）');
        console.warn('台帳予定は受付を保持して再試行 / VehicleID='+j.id+' / '+String(e&&e.message||e));
      }
    }
    GF_自動予定実績の受付を進める_40(ss);
    console.log('台帳予定まとめ / 完了='+completed+' / 秒='+((Date.now()-start)/1000).toFixed(2));
  }finally{
    // この期限内は別ワーカーが所有権を取得できない。
    // 終了時の共通ロック競合で10分間の待機が残ることを避ける。
    let lease=null;try{lease=JSON.parse(props.getProperty(leaseKey)||'null');}catch(e){}
    if(lease&&lease.token===token&&Date.now()<lease.until-5000)props.deleteProperty(leaseKey);
    // 期限間際・期限切れは新しい所有者と競合しないよう自然失効に任せる。
  }
}
/** Drive・ドライバー同期・リンク装飾・スマホ一覧再作成は行わない。 */
function GF_予定関連だけ反映する_40(ss,VehicleID) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1500))throw new Error('予定は保存済みです。関連表示の更新を再試行します。');
  try{
    const ledger=必須シートを取得する_(ss,シート名.車両台帳);
    const status=必須シートを取得する_(ss,シート名.車両状況);
    const users=必須シートを取得する_(ss,シート名.利用者管理);
    const ledgerRow=IDで行を探す_(ledger,'VehicleID',VehicleID);
    const statusRow=IDで行を探す_(status,'VehicleID',VehicleID);
    const userRow=IDで行を探す_(users,'VehicleID',VehicleID);
    if(!ledgerRow||!statusRow||!userRow)throw new Error('関連シートが未作成です。車両登録の同期完了後に再試行します。');
    const car=行データを取得する_(ledger,ledgerRow);
    const next=予定管理から次の予定を取得する_(VehicleID);
    const heads=status.getRange(1,1,1,status.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
    const planCol=heads.indexOf('次の予定')+1,dateCol=heads.indexOf('次の予定日')+1;
    if(!planCol||!dateCol)throw new Error('車両状況に次の予定・次の予定日列がありません。');
    if(dateCol===planCol+1)status.getRange(statusRow,planCol,1,2).setValues([[next.予定,next.日付]]);
    else{status.getRange(statusRow,planCol).setValue(next.予定);status.getRange(statusRow,dateCol).setValue(next.日付);}
    const userHeads=users.getRange(1,1,1,users.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
    const write=(sheet,row,name,value)=>{
      const h=sheet===status?heads:userHeads;
      const col=h.indexOf(name)+1;if(col)sheet.getRange(row,col).setValue(value);
    };
    write(status,statusRow,'車検満了日',car['車検満了日']||'');
    const warningCol=GF_車検注意列を準備する_30(status);
    status.getRange(statusRow,warningCol).setValue(GF_車検注意を判定する_30(car['車検満了日']));
    write(status,statusRow,'更新日時',new Date());
    write(users,userRow,'納車希望日',car['納車予定日']||'');
    write(users,userRow,'返却予定日',car['返却予定日']||'');
    write(users,userRow,'更新日時',new Date());
    SpreadsheetApp.flush();
  }finally{lock.releaseLock();}
  予定表示キャッシュを削除する();
}
function GF_予定月キャッシュを消す_40(value) {
  const d=value instanceof Date?value:new Date(value);
  if(!value||isNaN(d.getTime()))return;
  CacheService.getScriptCache().remove('GF_SCHEDULE_'+Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM'));
}
/** 初回設定時だけ末尾に列を追加。既存の車両情報は書き換えない。 */
function GF_予定反映状況列を準備する_40(ss) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('更新中です。少し待って設定をもう一度実行してください。');
  try{
    const sheet=必須シートを取得する_(ss,シート名.車両台帳);
    const last=sheet.getLastColumn();
    const heads=sheet.getRange(1,1,1,last).getDisplayValues()[0].map(v=>String(v||'').trim());
    if(heads.includes('予定反映状況'))return;
    if(last>=sheet.getMaxColumns())sheet.insertColumnAfter(last);
    sheet.getRange(1,last+1).setValue('予定反映状況');
  }finally{lock.releaseLock();}
}
/** 表示の失敗で予定の受付・登録自体を止めない。 */
function GF_予定反映状況を書く_40(sheet,row,heads,text) {
  const col=heads.indexOf('予定反映状況')+1;if(!col)return;
  try{sheet.getRange(row,col).setValue(text);}catch(e){console.warn('予定反映状況の表示を更新できませんでした：'+String(e&&e.message||e));}
}
function GF_車両予定受付が残る_40(props,book,id) {
  const all=props.getProperties();
  return Object.keys(all).some(k=>{
    if(!k.startsWith('GF_PLAN_EDIT_40_')&&!k.startsWith('GF_PLAN_AUTO_40_'))return false;
    try{const j=JSON.parse(all[k]);return j.book===book&&j.id===id;}catch(e){return false;}
  });
}
function GF_予定日が空欄_40(value) {
  return value==null||typeof value==='string'&&value.trim()==='';
}
/** 空欄の編集は、取消対象がある時だけ受付する。1回の受付でまとめて読む。 */
function GF_未完了台帳予定索引_40(ss) {
  const sheet=必須シートを取得する_(ss,シート名.予定管理),result=new Set();
  const rows=sheet.getDataRange().getDisplayValues();
  const heads=rows[0].map(v=>String(v||'').trim());
  const vi=heads.indexOf('VehicleID'),ki=heads.indexOf('予定種類名'),si=heads.indexOf('状態');
  if(vi<0||ki<0||si<0)throw new Error('予定管理の列を確認してください。');
  rows.slice(1).forEach(r=>{
    if(['予定','進行中'].includes(String(r[si]||'').trim()))result.add(JSON.stringify([String(r[vi]||'').trim(),String(r[ki]||'').trim()]));
  });
  return result;
}
function GF_不要な予定受付表示を消す_40(sheet,row,heads) {
  const col=heads.indexOf('予定反映状況')+1;if(!col)return;
  const text=String(sheet.getRange(row,col).getDisplayValue()||'').trim();
  if(['受付しました（反映待ち）','登録しています…','反映待ち（自動で再試行します）','反映しました'].includes(text))GF_予定反映状況を書く_40(sheet,row,heads,'');
}
/** 初回に実行。更新中でも整理依頼を保持し、既存の1分ワーカーで再試行する。 */
function GF_予定表示を反映中だけにする_40() {
  const props=PropertiesService.getScriptProperties();
  props.setProperty('GF_PLAN_STATUS_CLEAN_40',Utilities.getUuid());
  try{GF_台帳予定同期ワーカー_40();}catch(e){console.warn('予定表示の整理は定期実行で再試行します：'+String(e&&e.message||e));}
  console.log(props.getProperty('GF_PLAN_STATUS_CLEAN_40')?'表示整理を受付しました。次の定期実行で再試行します。':'表示整理が完了しました。今後は反映完了で表示を消します。');
  return {成功:true,メッセージ:'表示整理を受付しました。'};
}
/** 以前の手動関数も待機依頼へ回す。 */
function GF_不要な予定受付を整理する_40() {
  return GF_予定表示を反映中だけにする_40();
}
/** 予定ワーカーの所有権を取得した時だけ実行。 */
function GF_予定受付表示整理本体_40() {
  const props=PropertiesService.getScriptProperties();
    const ss=対象スプレッドシートを開く_(),ledger=必須シートを取得する_(ss,シート名.車両台帳);
    const heads=ledger.getRange(1,1,1,ledger.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
    const active=GF_未完了台帳予定索引_40(ss),all=props.getProperties();let count=0;
    Object.keys(all).filter(k=>k.startsWith('GF_PLAN_EDIT_40_')).forEach(key=>{
      let j;try{j=JSON.parse(all[key]);}catch(e){return;}
      if(j.book!==ss.getId())return;
      const row=IDで行を探す_(ledger,'VehicleID',j.id),col=heads.indexOf(j.column)+1;
      if(!row||!col)return;
      if(GF_予定日が空欄_40(ledger.getRange(row,col).getValue())&&!active.has(JSON.stringify([j.id,j.kind]))){props.deleteProperty(key);count++;}
    });
    const rows=ledger.getDataRange().getDisplayValues(),idCol=heads.indexOf('VehicleID');
    if(idCol<0)throw new Error('VehicleID列がありません。');
    const pending=props.getProperties(),vehicles=new Set();
    Object.keys(pending).filter(k=>k.startsWith('GF_PLAN_EDIT_40_')||k.startsWith('GF_PLAN_AUTO_40_')).forEach(k=>{try{const j=JSON.parse(pending[k]);if(j.book===ss.getId())vehicles.add(j.id);}catch(e){}});
    for(let i=1;i<rows.length;i++)if(!vehicles.has(String(rows[i][idCol]||'').trim()))GF_不要な予定受付表示を消す_40(ledger,i+1,heads);
    console.log('不要な空欄受付を整理しました：'+count+'件。登録・取消の受付は保持。');
}
/** 初回のみ。過去の予定を一括実績化せず、設定後の入力・変更だけを対象にする。 */
function GF_予定日から実績の自動登録を設定する_40(){
  if(typeof GF_実績受付本体_25!=='function')throw new Error('25_車両実績を貼り替えてください。');
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('GF_PLAN_ACTUAL_ENABLED_40'))props.setProperty('GF_PLAN_ACTUAL_ENABLED_40',String(Date.now()));
  const triggers=ScriptApp.getProjectTriggers();
  ['GF_実績キューワーカー','GF_台帳予定同期ワーカー_40'].forEach(name=>{
    if(!triggers.some(t=>t.getHandlerFunction()===name))ScriptApp.newTrigger(name).timeBased().everyMinutes(1).create();
  });
  console.log('納車・代車の今日以前の入力を自動実績化します。未来の日付は予定として保持します。');
}
/** 予定登録のScriptLock保持中に、実績化依頼を耐久保存。 */
function GF_予定の自動実績依頼を保存する_40(ss,planId,kind,date,car,allow){
  const props=PropertiesService.getScriptProperties(),enabled=Number(props.getProperty('GF_PLAN_ACTUAL_ENABLED_40')||0);
  if(!allow||!enabled||!['納車','代車'].includes(kind))return false;
  const day=GF_予定表示日付_40(date,ss.getSpreadsheetTimeZone());
  const today=Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');
  if(!day||day>today)return false;
  const loanInfo=GF_予定の貸出情報を取得する_25(ss,planId);
  const all=props.getProperties();
  for(const k of Object.keys(all).filter(k=>k.startsWith('GF_PLAN_AUTO_40_'))){
    try{const j=JSON.parse(all[k]);if(j.planId===planId&&j.date===day&&j.driver===String(car.DriverID||'').trim()&&j.name===String(car.現在使用者||'').trim()&&JSON.stringify(j.loanInfo||{})===JSON.stringify(loanInfo))return true;}catch(e){}
  }
  const request='AUTO-'+Utilities.getUuid();
  props.setProperty('GF_PLAN_AUTO_40_'+request,JSON.stringify({request,book:ss.getId(),planId,id:String(car.VehicleID||'').trim(),kind,date:day,driver:String(car.DriverID||'').trim(),name:String(car.現在使用者||'').trim(),priorStatus:String(car['区分/ステータス']||'').trim(),column:台帳予定列対応[kind],loanInfo,phase:'受付待ち'}));
  return true;
}
/** 実績適用前に、受付した日付・車両・使用者が現在も一致するか確認。 */
function GF_自動予定実績の入力が一致する_40(ss,j){
  const plans=必須シートを取得する_(ss,シート名.予定管理),ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const pr=IDで行を探す_(plans,'予定ID',j.planId),vr=IDで行を探す_(ledger,'VehicleID',j.id);
  if(!pr||!vr)return false;
  const p=行データを取得する_(plans,pr),v=行データを取得する_(ledger,vr),tz=ss.getSpreadsheetTimeZone();
  return ['予定','進行中'].includes(String(p.状態||''))&&String(p.VehicleID||'').trim()===j.id&&String(p.予定種類名||'').trim()===j.kind&&GF_予定表示日付_40(p.予定日,tz)===j.date&&GF_予定表示日付_40(v[j.column],tz)===j.date&&String(v.DriverID||'').trim()===j.driver&&String(v.現在使用者||'').trim()===j.name&&JSON.stringify(GF_予定の貸出情報を取得する_25(ss,j.planId))===JSON.stringify(j.loanInfo||{貸出先:'',貸出エリア:'',備考:''});
}
/** 既存の実績キューへ受付。混雑時はこの依頼を残して次回再試行する。 */
function GF_自動予定実績の受付を進める_40(ss){
  const props=PropertiesService.getScriptProperties(),all=props.getProperties();
  const ledger=必須シートを取得する_(ss,シート名.車両台帳),heads=ledger.getRange(1,1,1,ledger.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
  const started=Date.now();
  for(const key of Object.keys(all).filter(k=>k.startsWith('GF_PLAN_AUTO_40_'))){
    if(Date.now()-started>45000)break;
    let j;try{j=JSON.parse(all[key]);}catch(e){continue;}if(j.book!==ss.getId())continue;
    const metaKey='GF_PLAN_ACTUAL_META_25_'+j.request,raw=props.getProperty(metaKey),meta=raw?JSON.parse(raw):null;
    const row=IDで行を探す_(ledger,'VehicleID',j.id);
    try{
      if(meta&&['完了','取消'].includes(meta.phase)){
        props.deleteProperty(key);props.deleteProperty(metaKey);
        if(row&&!GF_車両予定受付が残る_40(props,j.book,j.id))GF_予定反映状況を書く_40(ledger,row,heads,'');
        continue;
      }
      if(meta&&meta.phase==='要確認'){
        if(row)GF_予定反映状況を書く_40(ledger,row,heads,'実績反映を確認してください');continue;
      }
      if(j.phase==='受付済み')continue;
      if(!GF_自動予定実績の入力が一致する_40(ss,j)){
        props.deleteProperty(key);
        if(row&&!GF_車両予定受付が残る_40(props,j.book,j.id))GF_予定反映状況を書く_40(ledger,row,heads,'');
        continue;
      }
      const v=行データを取得する_(ledger,row),actual=j.kind==='納車'?'引渡し':'代車開始日',status=j.kind==='納車'?'貸出中':'代車';
      if(GF_予定表示日付_40(v[actual],ss.getSpreadsheetTimeZone())===j.date&&String(v['区分/ステータス']||'').trim()===status){
        GF_自動予定実績を仕上げる_40(ss,j);props.deleteProperty(key);props.deleteProperty(metaKey);
        if(!GF_車両予定受付が残る_40(props,j.book,j.id))GF_予定反映状況を書く_40(ledger,row,heads,'');continue;
      }
      const result=GF_実績受付本体_25({VehicleID:j.id,種類:j.kind==='納車'?'貸出開始':'代車開始',実施日:j.date,RequestID:j.request,自動予定:j,...(j.loanInfo||{})});
      if(!result||!result.成功)throw new Error('実績受付を再試行します。');
      j.phase='受付済み';props.setProperty(key,JSON.stringify(j));
      if(row)GF_予定反映状況を書く_40(ledger,row,heads,'実績を反映しています…');
    }catch(e){
      if(row)GF_予定反映状況を書く_40(ledger,row,heads,'実績の反映待ち（自動再試行）');
      console.warn('予定から実績を再試行 / '+j.id+' / '+String(e&&e.message||e));
    }
  }
}
/** 実績反映後だけ予定を完了にする。再編集した予定や使用者へ上書きしない。 */
function GF_自動予定実績を仕上げる_40(ss,j){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1500))throw new Error('予定完了の反映を再試行します。');
  try{
    const plans=必須シートを取得する_(ss,シート名.予定管理),ledger=必須シートを取得する_(ss,シート名.車両台帳);
    const pr=IDで行を探す_(plans,'予定ID',j.planId),vr=IDで行を探す_(ledger,'VehicleID',j.id);
    const p=pr?行データを取得する_(plans,pr):null,v=vr?行データを取得する_(ledger,vr):null,tz=ss.getSpreadsheetTimeZone();
    const actual=j.kind==='納車'?'引渡し':'代車開始日';
    if(!p||!v||String(p.VehicleID||'').trim()!==j.id||GF_予定表示日付_40(p.予定日,tz)!==j.date||!['予定','進行中','完了'].includes(String(p.状態||''))||String(v.DriverID||'').trim()!==j.driver||String(v.現在使用者||'').trim()!==j.name||GF_予定表示日付_40(v[actual],tz)!==j.date||(String(p.状態)!=='完了'&&JSON.stringify(GF_予定の貸出情報を取得する_25(ss,j.planId))!==JSON.stringify(j.loanInfo||{貸出先:'',貸出エリア:'',備考:''}))){const e=new Error('実績反映中に入力が変更されています。内容を確認してください。');e.GF要確認=true;throw e;}
    const eventId=String(p.CalendarEventID||'').trim();
    if(eventId){const type=予定種類を取得する_(p.予定種類ID||p.予定種類名,ss),cal=予定種類のカレンダーを取得する_(type);if(!cal)throw new Error('完了予定のカレンダーを確認してください。');const ev=cal.getEventById(eventId);if(ev)ev.deleteEvent();}
    const update={状態:'完了',CalendarEventID:'',更新日時:new Date()};
    if(String(p.状態)!=='完了')update.完了日時=new Date();
    if(j.kind==='代車'&&!String(p.直前ステータス||'').trim())update.直前ステータス=j.priorStatus;
    予定管理行を高速更新する_(plans,pr,update);
    if(GF_予定表示日付_40(v[j.column],tz)===j.date)セルを書き込む_(ledger,vr,j.column,'');
    GF_予定月キャッシュを消す_40(p.予定日);SpreadsheetApp.flush();
  }finally{lock.releaseLock();}
  GF_貸出情報を実績から反映する_25(ss,{id:j.id,kind:j.kind==='納車'?'貸出開始':'代車開始',date:j.date,fields:j.loanInfo||{}});
  GF_予定関連だけ反映する_40(ss,j.id);
  PropertiesService.getScriptProperties().deleteProperty('GF_PLAN_LOAN_25_'+j.planId);
  j.phase='完了';PropertiesService.getScriptProperties().setProperty('GF_PLAN_ACTUAL_META_25_'+j.request,JSON.stringify(j));
}

/** 即時実績化する予定には、後処理で未実施のカレンダー予定を新設しない。 */
function GF_自動実績待ちの予定か_40(planId){
  const all=PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all).some(k=>{
    if(!k.startsWith('GF_PLAN_AUTO_40_'))return false;
    try{return JSON.parse(all[k]).planId===planId;}catch(e){return false;}
  });
}