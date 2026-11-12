/** GOLD FIRST / 90_車検更新AI確認.gs
 * 既存車両の書類更新専用。89番のAIを再利用。
 * 車両新規作成はしない。車検予定日・所有者は変更しない。
 */
function GF_車検更新AI確認_90(VehicleID,画像一覧){
  const ss=対象スプレッドシートを開く_();
  const ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const row=IDで行を探す_(ledger,'VehicleID',String(VehicleID||'').trim());
  if(!row)throw new Error('対象の車両が見つかりません。');
  if(!Array.isArray(画像一覧)||画像一覧.length!==3)throw new Error('書類3枚を選択してください。');
  const car=行データを取得する_(ledger,row);
  const ai=スマホから車検証を読み取る(画像一覧);
  if(!ai||!ai.成功)return {成功:false,メッセージ:ai&&ai.メッセージ||'AIで読み取れませんでした。'};
  const expiry=String(ai.車検満了日||'').trim();
  const current=String(car['現在使用者']||'').trim(),read=String(ai.使用者氏名||'').trim();
  const old=car['車検満了日'];
  const oldText=old instanceof Date?Utilities.formatDate(old,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'):String(old||'');
  return {成功:true,車検満了日:expiry,台帳満了日:oldText,使用者氏名:read,台帳使用者:current,使用者相違:!!read&&read.replace(/[\s　]/g,'')!==current.replace(/[\s　]/g,'')};
}
function GF_車検更新確定_90(VehicleID,画像一覧,満了日,使用者変更,読取使用者){
  const id=String(VehicleID||'').trim();
  const ss=対象スプレッドシートを開く_();
  const ledger=必須シートを取得する_(ss,シート名.車両台帳);
  const row=IDで行を探す_(ledger,'VehicleID',id);
  if(!row)throw new Error('車両が見つかりません。');
  if(!Array.isArray(画像一覧)||画像一覧.length!==3)throw new Error('書類3枚が必要です。');
  const date=日付文字列から日付を作る_(String(満了日||''));
  const name=String(読取使用者||'').trim();
  if(使用者変更===true&&!name)throw new Error('変更後の使用者を確認してください。');
  const old=行データを取得する_(ledger,row);
  // 書類を先に保存。失敗時は台帳を変更しない。
  const saved=スマホから車両書類をまとめて登録する(id,画像一覧);
  if(!saved||saved.成功!==true)throw new Error('書類保存を確認できませんでした。');
  // 台帳は指定された項目だけ変更する。
  セルを書き込む_(ledger,row,'車検満了日',date);
  if(使用者変更===true&&name!==String(old['現在使用者']||'').trim()){
    セルを書き込む_(ledger,row,'現在使用者',name);
    // 以前の使用者のDriverIDを新しい使用者に引き継がない。
    セルを書き込む_(ledger,row,'DriverID','');
  }
  SpreadsheetApp.flush();
  const warnings=[];
  try{
    車検満了日を予定とカレンダーへ反映する_40(id,date);
  }catch(e){warnings.push('予定管理・カレンダーの反映を確認してください：'+String(e.message||e));}
  try{
    車両台帳の1台を同期する(row);
  }catch(e){warnings.push('関連シートの反映を確認してください：'+String(e.message||e));}
  return {成功:true,PDFURL:saved.PDFURL,
    メッセージ:warnings.length?'書類と台帳の更新は完了しました。ただし '+warnings.join(' / '):'書類3枚・車検満了日を更新しました。'+(使用者変更===true?' 使用者の変更も受け付けました。':' 使用者は変更していません。')};
}