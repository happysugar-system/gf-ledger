function GF3_CanonicalCellUrl_(book,sheet,row,column){
 let letters='';
 for(let remaining=column;remaining>0;remaining=Math.floor((remaining-1)/26))
  letters=String.fromCharCode(65+(remaining-1)%26)+letters;
 return book.getUrl()+'#gid='+sheet.getSheetId()+'&range='+letters+row;
}

function GF3_UpdateCanonicalCellLink_(cell,book,url){
 if(!url||cell.getFormula())return false;
 const value=cell.getValue();
 if(typeof value!=='string'||!value.trim())return false;
 const rich=cell.getRichTextValue();
 const runs=rich?.getRuns()||[];
 const current=rich?.getLinkUrl();
 if(current===url||(!current&&runs.some(run=>run.getLinkUrl())))return false;
 if(current&&!current.startsWith(book.getUrl()+'#gid='))return false;
 const builder=rich?.copy()||SpreadsheetApp.newRichTextValue().setText(value);
 cell.setRichTextValue(builder.setLinkUrl(url).build());
 return true;
}

function GF3_CanonicalVehicleScreenLinks_(book,id,read){
 const lookup=read||((target,name,key,value,fields)=>GF3_CanonicalRow_(target.getSheetByName(name),key,value,fields));
 const vehicle=lookup(book,'車両台帳','VehicleID',id,['車番','DriverID','現在使用者']);
 const links={vehicle:GF3_CanonicalCellUrl_(book,vehicle.sheet,vehicle.number,vehicle.columns['車番']+1),driver:''};
 if(vehicle.data.DriverID&&vehicle.data['現在使用者']){
  const driver=lookup(book,'ドライバーマスター','DriverID',vehicle.data.DriverID,['氏名']);
  if(driver.data['氏名']!==vehicle.data['現在使用者'])throw Error('gf3_screen_driver_mismatch');
  links.driver=GF3_CanonicalCellUrl_(book,driver.sheet,driver.number,driver.columns['氏名']+1);
 }
 return {vehicle,links};
}

function GF3_UpdateCanonicalVehicleScreenLinks_(book,id){
 const {vehicle,links}=GF3_CanonicalVehicleScreenLinks_(book,id);
 GF3_UpdateCanonicalCellLink_(vehicle.sheet.getRange(vehicle.number,vehicle.columns['車番']+1),book,links.vehicle);
 if(links.driver)
  GF3_UpdateCanonicalCellLink_(vehicle.sheet.getRange(vehicle.number,vehicle.columns['現在使用者']+1),book,links.driver);
 return links;
}

function GF3_ResolveCalendarEvent_(calendar,id){
 if(!id)return null;
 if(!calendar)throw Error('既存イベントの連携先カレンダーが未設定です。');
 const event=calendar.getEventById(id);
 if(!event)throw Error('既存イベントを特定できません。予定IDとカレンダーを確認してください。');
 return event;
}
