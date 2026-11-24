/** Existing integration fixture only. Call immediately before the existing assignment worker writes.
 * Does not create drivers or mutate any sheet. */
function GFA_検証割当DriverID確認_(){
 const p=PropertiesService.getScriptProperties();
 const v='1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU',l='12iXmFwRX9yI-cbzPYyWJGXFdllZpu8Ujm_r33-7F7M8';
 if(p.getProperty('GFA_APPROVED_BOOK_ID')!==v||p.getProperty('GFA_APPROVED_LINE_BOOK_ID')!==l)throw Error('検証接続先不一致');
 const vehicle=SpreadsheetApp.openById(v),line=SpreadsheetApp.openById(l);
 const w=GFA_割当照合行_(vehicle.getSheetByName('名変待ち管理'),'LINE受付ID','TEST-R01',['受付識別子','DriverID','ステータス','割当VehicleID']);
 if(!w.DriverID)throw Error('名変待ちDriverID未連携');
 const r=GFA_割当DriverIDを照合_('TEST-R01',w.DriverID,{vehicle,line,waitingKey:w['受付識別子']});
 if(r.state!=='resolved'||r.driver_id!=='D999901')throw Error('検証DriverID不一致');
 return r.driver_id;
}
