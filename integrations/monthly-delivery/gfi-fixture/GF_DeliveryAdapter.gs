/** Isolated GFI fixture only. No production access. */
function GF_ReceiptAssignmentValidationBook_(){
 if(typeof GFI_BOOK==='undefined'||GFI_BOOK!=='1NE2DNQK2vV0UBNg_-6B9xiyfE4y4i2JTKrUBuL902tU')throw Error('fixture_mismatch');
 return GFI_BOOK;
}
function GF_ReceiptAssignmentReadTables_(id){
 if(id!==GF_ReceiptAssignmentValidationBook_())throw Error('fixture_mismatch');
 const book=SpreadsheetApp.openById(id);
 return ['GF_LINEドライバー同期履歴','名変待ち管理','ドライバーマスター','車両台帳'].map(name=>({rows:[GFI_読取_(book,name).r]}));
}
function GF_DeliveryFixturePreflight(){
 const id=GF_ReceiptAssignmentValidationBook_(),book=SpreadsheetApp.openById(id);
 const required={'車両台帳':['VehicleID','DriverID','現在使用者','納車予定日','紹介元','管轄','車番','車種','所属会社名','稼働エリア'],'実績履歴':['受付ID','登録日時','VehicleID','種類','実施日','状態','変更後JSON','取消日時']};
 const missing=[];
 for(const [name,keys] of Object.entries(required)){
 const sh=book.getSheetByName(name);if(!sh){missing.push(name);continue;}
 const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
 for(const k of keys)if(h.filter(x=>x===k).length!==1)missing.push(name+':'+k);
 }
 const tables=GF_ReceiptAssignmentReadTables_(id);
 const result={fixture:tables[3].rows[0].VehicleID==='TEST-V01',sheets:typeof Sheets!=='undefined',missing,ready:false};
 result.ready=result.fixture&&result.sheets&&!missing.length;
 console.log(JSON.stringify(result));return result;
}
