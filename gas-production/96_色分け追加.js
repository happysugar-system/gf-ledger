/** GOLD FIRST / 96_ステータス色分け追加.gs
 * 新しいスクリプトファイルへ貼り付け、GF_管理シートのステータス色を設定する を1回実行。
 * 利用者管理・車両状況のステータスセルだけに条件付き書式を設定する。
 * 同期処理・値・リンクは変更しない。再実行しても同じルールを重複追加しない。
 */
function GF_管理シートのステータス色を設定する(){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const ss=対象スプレッドシートを開く_();
    const palette={
      '空車':'#E2F0D9','納車':'#D9EAF7','貸出中':'#FFF2CC','返却':'#FCE4D6',
      '12点検':'#E4DFEC','整備':'#F4CCCC','板金':'#F4CCCC','車検':'#D9D2E9',
      '代車':'#DDEBF7','代車返却':'#EAD1DC','名変':'#D0E0E3','終了':'#D9D9D9'
    };
    const ledger=ss.getSheetByName(シート名.車両台帳);
    if(ledger){
      const col=GF_色分け列を探す_96(ledger,'区分/ステータス');
      // 現在の台帳に設定された色があれば優先する。先頭のルールを優先。
      const found={};
      ledger.getConditionalFormatRules().forEach(rule=>{
        const condition=rule.getBooleanCondition();
        if(!condition||condition.getCriteriaType()!==SpreadsheetApp.BooleanCriteria.TEXT_EQUAL_TO)return;
        const name=String(condition.getCriteriaValues()[0]||'');
        if(!Object.prototype.hasOwnProperty.call(palette,name)||found[name])return;
        if(!rule.getRanges().some(r=>r.getColumn()===col&&r.getNumColumns()===1))return;
        const color=condition.getBackground();
        if(color){palette[name]=color;found[name]=true;}
      });
    }
    const targets=[[シート名.利用者管理,'ステータス'],[シート名.車両状況,'現在のステータス']].map(([name,header])=>{
      const sheet=ss.getSheetByName(name);
      if(!sheet)throw new Error('シート「'+name+'」がありません。');
      const col=GF_色分け列を探す_96(sheet,header);
      if(!col)throw new Error(name+'に「'+header+'」列がありません。');
      return {sheet:sheet,col:col};
    });
    targets.forEach(({sheet,col})=>{
      let letter='',n=col;
      while(n){letter=String.fromCharCode(65+(n-1)%26)+letter;n=Math.floor((n-1)/26);}
      const range=sheet.getRange(letter+'2:'+letter);
      const keep=[];
      sheet.getConditionalFormatRules().forEach(rule=>{
        const condition=rule.getBooleanCondition();
        const statusRule=condition&&condition.getCriteriaType()===SpreadsheetApp.BooleanCriteria.TEXT_EQUAL_TO&&
          Object.prototype.hasOwnProperty.call(palette,String(condition.getCriteriaValues()[0]||''));
        if(!statusRule){keep.push(rule);return;}
        // 他の列・ヘッダー・複数列にかかる既存ルールは残す。
        const ranges=rule.getRanges();
        const rest=ranges.filter(r=>!(r.getColumn()===col&&r.getNumColumns()===1&&r.getRow()>=2));
        if(rest.length===ranges.length)keep.push(rule);
        else if(rest.length)keep.push(rule.copy().setRanges(rest).build());
      });
      const rules=Object.keys(palette).map(name=>SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(name).setBackground(palette[name]).setRanges([range]).build());
      sheet.setConditionalFormatRules(rules.concat(keep));
    });
    SpreadsheetApp.flush();
    console.log('利用者管理・車両状況のステータス色分けを設定しました。');
  }finally{lock.releaseLock();}
}
function GF_色分け列を探す_96(sheet,name){
  const heads=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(v=>String(v||'').trim());
  const matches=[];heads.forEach((h,i)=>{if(h===name)matches.push(i+1);});
  if(matches.length>1)throw new Error(sheet.getName()+'に「'+name+'」列が複数あります。');
  return matches[0]||0;
}
