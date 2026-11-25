/** Read the original LINE receipt again before a dynamic assignment.
 * The caller must supply server-read sheet values, never browser data.
 */
function GF_ReceiptAssignmentSourceCheck_(lineValues,detailValues,request,expectedKey) {
  const rows=(values,required)=>{
    const [header,...body]=values||[];
    if(!Array.isArray(header)||required.some(k=>header.filter(h=>h===k).length!==1))throw Error('receipt_columns_invalid');
    return body.map(row=>Object.fromEntries(required.map(k=>[k,String(row[header.indexOf(k)]??'')])));
  };
  const line=rows(lineValues,['受付ID','受付種別','DriverID']).filter(r=>r['受付ID']===request.receiptId);
  const details=rows(detailValues,['LINE受付ID','受付識別子','確認DriverID','書類状態']);
  const found=details.filter(r=>r['LINE受付ID']===request.receiptId);
  if(line.length!==1||found.length!==1)throw Error('receipt_not_unique');
  const d=found[0],key=d['受付識別子'];
  if(line[0]['受付種別']!=='車両依頼'||line[0].DriverID!==request.driverId||
     d['確認DriverID']!==request.driverId||d['書類状態']!=='保存完了'||
     !/^[a-f0-9]{64}$/.test(key)||key!==expectedKey||
     details.filter(r=>r['受付識別子']===key).length!==1)throw Error('receipt_source_mismatch');
  return true;
}
