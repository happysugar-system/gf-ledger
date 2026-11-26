/** Read-only connection check; token must be provisioned separately in both systems. */
function GF_検証実績DB一括確認(){
 const book=GF_IsolatedValidationOpen_();
 const p=PropertiesService.getScriptProperties();
 const expected={GF_TEST_RETURN_HISTORY_ENABLED:'true',GF_VALIDATION_RETURN_RECEIPT_ID:'TEST-RETURN-R005',GF_VALIDATION_RETURN_VEHICLE_ID:'V900005'};
 Object.keys(expected).forEach(k=>{if(p.getProperty(k)!==expected[k])throw Error('invalid_property:'+k);});
 if(typeof Sheets==='undefined')throw Error('advanced_sheets_service_required');
 const result=GF_検証実績DB接続診断();
 const q=GF_ActualStorageTestRead_(book,'queue'),h=GF_ActualStorageTestRead_(book,'history');
 const v=GF_実績車両情報_(book,q.vehicle_id);
 const report={...result,beforeMatches:GF_ActualDBSnapshotMatches_(v,h.before_data,book),afterMatches:GF_ActualDBSnapshotMatches_(v,h.after_data,book)};
 console.log(JSON.stringify(report));return report;
}