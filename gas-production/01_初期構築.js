/******************************************************
 * GOLD FIRST 新システム
 * 01_初期構築.gs
 * 予定種類マスター／予定管理 追加版
 ******************************************************/

function 新システムを初期構築する() {
  const スプレッドシート = 対象スプレッドシートを開く_();

  const 対象一覧 = [
    { 名前: シート名.車両台帳, 列: 車両台帳の列 },
    { 名前: シート名.ドライバーマスター, 列: ドライバーマスターの列 },
    { 名前: シート名.利用者管理, 列: 利用者管理の列 },
    { 名前: シート名.車両状況, 列: 車両状況の列 },
    { 名前: シート名.予定種類マスター, 列: 予定種類マスターの列 },
    { 名前: シート名.予定管理, 列: 予定管理の列 }
  ];

  対象一覧.forEach(設定 => {
    const シート = シートを取得または作成する_(スプレッドシート, 設定.名前);
    ヘッダーを設定する_(シート, 設定.列);
    基本表示を整える_(シート);
  });

  予定種類マスターを初期登録する_(スプレッドシート);
  車両ステータスのプルダウンを設定する_(スプレッドシート);
  ドライバーステータスのプルダウンを設定する_(スプレッドシート);
  予定管理のプルダウンを設定する_(スプレッドシート);
  日付列の表示形式を設定する_(スプレッドシート);
  ID列を文字列形式にする_(スプレッドシート);
  内部ID列を非表示にする_(スプレッドシート);
  内部管理シートを非表示にする_(スプレッドシート);
  ヘッダーを保護する_(スプレッドシート);

  ['シート1','Sheet1'].forEach(名前 => {
    const 初期シート = スプレッドシート.getSheetByName(名前);
    if (初期シート && 初期シート.getLastRow() <= 1 && 初期シート.getLastColumn() <= 1 &&
        String(初期シート.getRange('A1').getDisplayValue() || '').trim() === '' &&
        スプレッドシート.getSheets().length > 1) {
      スプレッドシート.deleteSheet(初期シート);
    }
  });

  SpreadsheetApp.flush();
  const 契約 = 現在の契約情報を取得する_();
  return '初期構築完了：' + 契約.会社名 + ' / 既存4シート＋予定種類マスター＋予定管理';
}

function シートを取得または作成する_(スプレッドシート, 名前) {
  let シート = スプレッドシート.getSheetByName(名前);
  if (!シート) シート = スプレッドシート.insertSheet(名前);
  return シート;
}

function ヘッダーを設定する_(シート, 正しい列一覧) {
  const 必要列数 = 正しい列一覧.length;
  if (シート.getMaxColumns() < 必要列数) {
    シート.insertColumnsAfter(シート.getMaxColumns(), 必要列数 - シート.getMaxColumns());
  }
  const 現在の最終列 = Math.max(シート.getLastColumn(), 1);
  const 現在ヘッダー = シート.getRange(1, 1, 1, 現在の最終列).getDisplayValues()[0].map(v => String(v || '').trim());
  const 何か入っている = 現在ヘッダー.some(v => v !== '');
  if (何か入っている) {
    const 使用中ヘッダー = 現在ヘッダー.filter(v => v !== '');
    const 完全一致 = 使用中ヘッダー.length === 正しい列一覧.length &&
      使用中ヘッダー.every((値, i) => 値 === 正しい列一覧[i]);
    if (!完全一致) throw new Error('「' + シート.getName() + '」の1行目に既存の内容があります。安全のため自動上書きしません。');
    return;
  }
  シート.getRange(1, 1, 1, 必要列数).setValues([正しい列一覧]);
}

function 基本表示を整える_(シート) {
  const 最終列 = シート.getLastColumn();
  if (最終列 < 1) return;
  シート.setFrozenRows(1);
  シート.setHiddenGridlines(true);
  シート.getRange(1, 1, 1, 最終列).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  シート.setRowHeight(1, 34);
}

function 予定種類マスターを初期登録する_(スプレッドシート) {
  const シート = スプレッドシート.getSheetByName(シート名.予定種類マスター);
  if (!シート) return;

  const 初期データ = [
    ['PLAN001','納車',true,1,'納車',false,'固定','貸出中','納車',true,''],
    ['PLAN002','返却',true,2,'返却',false,'固定','空車','納車',true,''],
    ['PLAN003','代車',true,3,'代車',false,'固定','代車','代車',true,''],
    ['PLAN004','代車返却',true,4,'代車返却',false,'直前に戻す','','代車',true,''],
    ['PLAN005','車検',true,5,'車検',true,'直前に戻す','','車検',true,''],
    ['PLAN006','名変',true,6,'名変',false,'直前に戻す','','名変',true,''],
    ['PLAN007','板金',true,7,'板金',true,'直前に戻す','','整備・点検',true,''],
    ['PLAN008','整備',true,8,'整備',true,'直前に戻す','','整備・点検',true,''],
    ['PLAN009','12点検',true,9,'12点検',true,'直前に戻す','','整備・点検',true,'']
  ];

  const 既存ID = new Set();
  if (シート.getLastRow() >= 2) {
    シート.getRange(2, 1, シート.getLastRow() - 1, 1).getDisplayValues().flat()
      .forEach(v => 既存ID.add(String(v || '').trim()));
  }
  const 追加 = 初期データ.filter(行 => !既存ID.has(行[0]));
  if (追加.length) シート.getRange(シート.getLastRow() + 1, 1, 追加.length, 初期データ[0].length).setValues(追加);

  const 行数 = Math.max(シート.getMaxRows() - 1, 1);
  [3,6,10].forEach(列 => シート.getRange(2, 列, 行数, 1).insertCheckboxes());
}

function 車両ステータスのプルダウンを設定する_(ss) {
  const s = ss.getSheetByName(シート名.車両台帳); if (!s) return;
  const c = 列番号を取得する_(s,'区分/ステータス'); if (!c) return;
  const r = SpreadsheetApp.newDataValidation().requireValueInList(車両ステータス一覧,true).setAllowInvalid(false).build();
  s.getRange(2,c,Math.max(s.getMaxRows()-1,1),1).setDataValidation(r);
}
function ドライバーステータスのプルダウンを設定する_(ss) {
  const s = ss.getSheetByName(シート名.ドライバーマスター); if (!s) return;
  const c = 列番号を取得する_(s,'ステータス'); if (!c) return;
  const r = SpreadsheetApp.newDataValidation().requireValueInList(ドライバーステータス一覧,true).setAllowInvalid(false).build();
  s.getRange(2,c,Math.max(s.getMaxRows()-1,1),1).setDataValidation(r);
}
function 予定管理のプルダウンを設定する_(ss) {
  const s = ss.getSheetByName(シート名.予定管理); if (!s) return;
  const c = 列番号を取得する_(s,'状態'); if (!c) return;
  const r = SpreadsheetApp.newDataValidation().requireValueInList(予定状態一覧,true).setAllowInvalid(false).build();
  s.getRange(2,c,Math.max(s.getMaxRows()-1,1),1).setDataValidation(r);
}

function 日付列の表示形式を設定する_(ss) {
  const 一覧 = {
    車両台帳:['仕入れ日/会場','納車予定日','返却予定日','代車予定日','代車返却予定日','車検予定日','名変予定日','引渡し','返却/12点検','代車開始日','代車返却日','車検満了日','名義変更日'],
    ドライバーマスター:['登録日'],
    利用者管理:['納車希望日','稼働開始日','返却予定日','返却完了日'],
    車両状況:['次の予定日','ステータス予定日','車検満了日'],
    予定管理:['予定日','開始日時','完了日時','取消日時','登録日時','更新日時']
  };
  Object.keys(一覧).forEach(k => {
    const s=ss.getSheetByName(シート名[k]); if(!s)return;
    一覧[k].forEach(n => {
      const c=列番号を取得する_(s,n); if(!c)return;
      const fmt=n.includes('日時')?'yyyy/m/d h:mm':'yyyy/m/d';
      s.getRange(2,c,Math.max(s.getMaxRows()-1,1),1).setNumberFormat(fmt);
    });
  });
}

function ID列を文字列形式にする_(ss) {
  const 対象=[
    [シート名.車両台帳,['VehicleID','DriverID','車番']],
    [シート名.ドライバーマスター,['DriverID']],
    [シート名.利用者管理,['VehicleID','DriverID','車番']],
    [シート名.車両状況,['VehicleID','車番']],
    [シート名.予定種類マスター,['予定種類ID']],
    [シート名.予定管理,['予定ID','VehicleID','DriverID','車番','予定種類ID','CalendarEventID']]
  ];
  対象.forEach(([n,cols])=>{const s=ss.getSheetByName(n);if(!s)return;cols.forEach(x=>{const c=列番号を取得する_(s,x);if(c)s.getRange(2,c,Math.max(s.getMaxRows()-1,1),1).setNumberFormat('@');});});
}

function 内部ID列を非表示にする_(ss) {
  const 対象=[
    [シート名.車両台帳,['VehicleID','DriverID']],
    [シート名.ドライバーマスター,['DriverID']],
    [シート名.利用者管理,['VehicleID','DriverID']],
    [シート名.車両状況,['VehicleID']]
  ];
  対象.forEach(([n,cols])=>{const s=ss.getSheetByName(n);if(!s)return;cols.forEach(x=>{const c=列番号を取得する_(s,x);if(c)s.hideColumns(c);});});
}

function 内部管理シートを非表示にする_(ss) {
  [シート名.予定種類マスター,シート名.予定管理].forEach(n=>{const s=ss.getSheetByName(n);if(s&&!s.isSheetHidden())s.hideSheet();});
}

function ヘッダーを保護する_(ss) {
  [シート名.車両台帳,シート名.ドライバーマスター,シート名.利用者管理,シート名.車両状況,シート名.予定種類マスター,シート名.予定管理].forEach(n=>{
    const s=ss.getSheetByName(n);if(!s)return;
    s.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(p=>p.getDescription()==='GOLD FIRST ヘッダー保護').forEach(p=>p.remove());
    const p=s.getRange(1,1,1,s.getLastColumn()).protect().setDescription('GOLD FIRST ヘッダー保護');
    if(p.canDomainEdit())p.setDomainEdit(false);
  });
}

function 列番号を取得する_(s,n) {
  const h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
  const m=[];h.forEach((v,i)=>{if(v===n)m.push(i+1);});
  if(m.length>1)throw new Error('「'+s.getName()+'」に「'+n+'」列が複数あります。');
  return m.length===1?m[0]:0;
}
