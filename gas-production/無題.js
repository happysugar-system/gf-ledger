/** GOLD FIRST 実績履歴・取消可否の安全確認（読み取り専用）
 * 既存ファイルを置き換えず、新規GSファイルとして追加して実行してください。
 * 車両台帳・実績履歴・実績キューは変更しません。
 */
function GF_実績履歴の整合性を安全確認する() {
  const ss=対象スプレッドシートを開く_();
  const ledger=ss.getSheetByName(シート名.車両台帳);
  const history=ss.getSheetByName('実績履歴');
  if(!ledger)throw new Error('車両台帳がありません。');
  const lh=ledger.getRange(1,1,1,ledger.getLastColumn()).getDisplayValues()[0].map(x=>String(x||'').trim());
  const idcol=lh.indexOf('VehicleID');
  if(idcol<0)throw new Error('VehicleID列がありません。');
  const targets=[['貸出開始','引渡し'],['返却完了','返却/12点検'],['代車開始','代車開始日'],['代車返却','代車返却日']];
  const tz=ss.getSpreadsheetTimeZone();
  const datekey=v=>{
    if(v instanceof Date)return isNaN(v.getTime())?'':Utilities.formatDate(v,tz,'yyyy-MM-dd');
    const m=String(v||'').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';
  };
  let histories=[];
  if(history&&history.getLastRow()>1){
    const all=history.getDataRange().getValues(),hh=all[0].map(x=>String(x||'').trim());
    const pos=k=>hh.indexOf(k);
    for(const k of ['VehicleID','種類','実施日','状態','変更前JSON','変更後JSON'])if(pos(k)<0)throw new Error('実績履歴に列「'+k+'」がありません。');
    histories=all.slice(1).map(r=>({id:String(r[pos('VehicleID')]||'').trim(),kind:String(r[pos('種類')]||'').trim(),date:datekey(r[pos('実施日')]),state:String(r[pos('状態')]||'').trim(),before:String(r[pos('変更前JSON')]||''),after:String(r[pos('変更後JSON')]||'')}));
  }
  const rows=ledger.getLastRow()>1?ledger.getRange(2,1,ledger.getLastRow()-1,ledger.getLastColumn()).getValues():[];
  const result=[];
  rows.forEach((r,i)=>{
    const id=String(r[idcol]||'').trim();if(!id)return;
    targets.forEach(([kind,col])=>{
      const c=lh.indexOf(col);if(c<0)return;
      const day=datekey(r[c]);if(!day)return;
      const matches=histories.filter(h=>h.id===id&&h.kind===kind&&h.date===day&&h.state==='完了');
      const usable=matches.length===1&&matches[0].before&&matches[0].after;
      if(!usable)result.push({行:i+2,VehicleID:id,車番:String(r[lh.indexOf('車番')]||''),種類:kind,実施日:day,判定:matches.length===0?'完了履歴なし':matches.length>1?'完了履歴重複':'復元情報不足'});
    });
  });
  console.log('確認完了：取消に必要な履歴を確認できない実績 '+result.length+'件');
  result.slice(0,100).forEach(x=>console.log(JSON.stringify(x)));
  if(result.length>100)console.log('残り '+(result.length-100)+'件は省略しました。');
  return {要確認件数:result.length,要確認:result.slice(0,100),備考:'読み取り専用。実績や車両状態は変更していません。'};
}
