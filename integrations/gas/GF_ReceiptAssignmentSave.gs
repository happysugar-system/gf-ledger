/** 既存の認可済み受付ワーカーからのみ呼ぶ。公開 doPost ではない。
 * syncExisting: 現行同期を実行するサーバー側関数。nullなら定期同期に委ねる。
 * verifyExisting: 現行DBを読み、対象3シートの反映を確認するサーバー側関数。
 * 本番設定・既存トリガーは変更しない。
 */
function GF_ReceiptAssignmentSave_(bookId, request, syncExisting, verifyExisting, expectedVersion, verifySource) {
  if ((syncExisting !== null && typeof syncExisting !== 'function') || typeof verifyExisting !== 'function')
    throw Error('existing_sync_not_connected');
  if (typeof GF_SB_対象ID_ !== 'function' || GF_SB_対象ID_() !== bookId)
    throw Error('ledger_target_mismatch');
  const api = Sheets.Spreadsheets;
  const names = ['GF_LINEドライバー同期履歴','名変待ち管理','ドライバーマスター','車両台帳'];
  const keys = [
    ['LINE受付ID','受付識別子','DriverID','処理状態'],
    ['LINE受付ID','受付識別子','DriverID','ステータス','割当VehicleID','割当車番'],
    ['DriverID','氏名','ステータス','所属会社名','稼働エリア','割当VehicleID','割当車番'],
    ['VehicleID','DriverID','車番','区分/ステータス','管理区分','現在使用者','所属会社名','稼働エリア','納車可能日','納車確定日']
  ];
  const read = () => {
    const result = api.Values.batchGet(bookId,{ranges:names.map(n=>"'"+n+"'"),valueRenderOption:'UNFORMATTED_VALUE'}).valueRanges;
    if (!result || result.length !== names.length) throw Error('ledger_read_failed');
    return result.map((item,i)=>{
      const [header,...rows] = item.values || [];
      if (!header) throw Error('missing_header');
      const columns = Object.fromEntries(keys[i].map(k=>{
        const c=header.indexOf(k);
        if(c<0 || c!==header.lastIndexOf(k)) throw Error('invalid_header:'+k);
        return [k,c];
      }));
      return {columns,rows:rows.map(row=>Object.fromEntries(keys[i].map(k=>[k,row[columns[k]]??''])))};
    });
  };
  const snapshot = tables => ({history:tables[0].rows,waiting:tables[1].rows,drivers:tables[2].rows,vehicles:tables[3].rows});
  const plan = tables => GF_ReceiptAssignmentPlan_(snapshot(tables),request);
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const tables=read(), p=plan(tables);
    if(expectedVersion !== undefined) {
      GF_ReceiptAssignmentAssertVersion_(snapshot(tables),request,expectedVersion);
      const h=tables[0].rows.find(r=>r['LINE受付ID']===request.receiptId);
      if(typeof verifySource!=='function'||verifySource(request,h['受付識別子'])!==true) throw Error('receipt_source_not_verified');
    }
    if(p.patches.length){
      const meta=api.get(bookId,{fields:'sheets(properties(sheetId,title))'}).sheets;
      const requests=[];
      for(const patch of p.patches){
        const t=tables[names.indexOf(patch.sheet)];
        const matches=t.rows.map((r,i)=>r[patch.key]===patch.id?i+1:-1).filter(i=>i>=0);
        if(matches.length!==1) throw Error('row_not_unique');
        const rowIndex=matches[0];
        const sheetId=meta.find(s=>s.properties.title===patch.sheet)?.properties.sheetId;
        if(!Number.isInteger(sheetId)) throw Error('sheet_missing');
        const range="'"+patch.sheet+"'!"+(rowIndex+1)+":"+(rowIndex+1);
        const cells=api.get(bookId,{ranges:[range],fields:'sheets(data(rowData(values(userEnteredValue,effectiveValue))))'}).sheets?.[0]?.data?.[0]?.rowData?.[0]?.values;
        if(!cells) throw Error('row_read_failed');
        for(const [k,c] of Object.entries(t.columns)){
          const val=cells[c]?.effectiveValue;
          if(val?.errorValue || (val?.stringValue??val?.numberValue??val?.boolValue??'')!==t.rows[rowIndex-1][k]) throw Error('row_changed');
        }
        for(const [k,value] of Object.entries(patch.values)){
          const columnIndex=t.columns[k];
          if(!Number.isInteger(columnIndex)||cells[columnIndex]?.userEnteredValue?.formulaValue) throw Error('protected_cell');
          requests.push({updateCells:{start:{sheetId,rowIndex,columnIndex},rows:[{values:[value===''?{}:{userEnteredValue:{stringValue:String(value)}}]}],fields:'userEnteredValue'}});
        }
      }
      if(JSON.stringify(read())!==JSON.stringify(tables)) throw Error('ledger_changed');
      try {
        api.batchUpdate({requests},bookId);
      } catch (_) {
        // A transport failure can arrive after Sheets has committed the atomic batch.
        // Verify once and leave a nonmatching or unreadable state for review.
        if (plan(read()).state !== 'unchanged') throw Error('ledger_write_unconfirmed');
      }
    }
    if(plan(read()).state!=='unchanged') throw Error('ledger_verification_failed');
  } finally {lock.releaseLock();}
  // Existing synchronization can acquire its own lock. Never call it while holding ours.
  try {
    if (syncExisting) syncExisting();
    if(verifyExisting(request)!==true || plan(read()).state!=='unchanged')
      return {status:'reconciliation_required'};
    return {status:'verified'};
  } catch(e) {return {status:'reconciliation_required'};}
}
