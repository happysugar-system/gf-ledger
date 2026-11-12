/** 車両編集用。既存の関数と名前を分けて追加します。 */
function スマホ用車両編集詳細を安全取得する(VehicleID) {
  const id=String(VehicleID||'').trim();
  if(!id)throw new Error('車両を選択してください。');
  const book=対象スプレッドシートを開く_();
  const sheet=必須シートを取得する_(book,シート名.車両台帳);
  const rows=sheet.getDataRange().getValues();
  const headers=rows[0].map(v=>String(v||'').trim());
  const col=headers.indexOf('VehicleID');
  if(col<0)throw new Error('車両台帳にVehicleID列がありません。');
  const row=rows.slice(1).find(r=>String(r[col]||'').trim()===id);
  if(!row)throw new Error('車両台帳に対象車両が見つかりません。');
  const result={};
  headers.forEach((key,i)=>{
    if(!key)return;
    const v=row[i];
    result[key]=v instanceof Date
      ? Utilities.formatDate(v,book.getSpreadsheetTimeZone(),'yyyy-MM-dd')
      : (v===null||v===undefined?'':v);
  });
  return result;
}