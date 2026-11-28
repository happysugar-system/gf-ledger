function GF3_ReadFixtureMedia(vehicleId){
 const book=GF3_DocumentUiOwner_();
 if(!/^V9\d{5}$/.test(vehicleId))throw Error('gf3_photo_vehicle_denied');
 const row=GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID',vehicleId,GF3_MEDIA_FIELDS_);
 const links=GF3_ReadCanonicalMedia_(row);
 const parent=vehicleId==='V900005'&&links['📷車両状態フォルダ']?GF3_FixturePhotoParent_(vehicleId,false):null;
 const recent=parent&&parent.getUrl()===links['📷車両状態フォルダ']?GF3_CanonicalPhotoDates_(parent):[];
 return {links,recent,photoWriteEnabled:vehicleId==='V900005'&&
  PropertiesService.getScriptProperties().getProperty('GF3_PHOTO_TEST_ENABLED')==='true'};
}

function GF3_FixturePhotoParent_(vehicleId,create){
 const root=DriveApp.getFolderById('1WMPFMkP292gilphGsqbTV8God81x7AiM');
 if(root.getName()!=='GOLD FIRST GF3 検証専用書類（ダミーのみ）'||root.isTrashed())throw Error('gf3_document_root');
 let parent=root;
 for(const name of ['01_車両',vehicleId,'車両状態画像']){
  const iterator=parent.getFoldersByName(name);
  if(!iterator.hasNext()){
   if(!create)return null;
   parent=parent.createFolder(name);
   continue;
  }
  parent=iterator.next();
  if(iterator.hasNext()||parent.isTrashed())throw Error('gf3_photo_folder_conflict');
 }
 return parent;
}

function GF3_SaveFixturePhotos(vehicleId,date,images){
 const book=GF3_DocumentUiOwner_();
 if(vehicleId!=='V900005'||PropertiesService.getScriptProperties().getProperty('GF3_PHOTO_TEST_ENABLED')!=='true')
  throw Error('gf3_photo_disabled');
 if(!date||GF3_ProgressDate_(date)!==date||!Array.isArray(images)||images.length<1||images.length>5)
  throw Error('gf3_photo_input');
 const blobs=images.map(image=>{
  const encoded=typeof image==='string'&&/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if(!encoded||encoded[1].length>3700000)throw Error('gf3_photo_jpeg_required');
  const bytes=Utilities.base64Decode(encoded[1]);
  if(bytes.length<16||bytes.length>2750000)throw Error('gf3_photo_size');
  const blob=Utilities.newBlob(bytes,'image/jpeg');
  if(!GF_JPEG情報を読む_60(blob))throw Error('gf3_photo_jpeg_required');
  return blob;
 });
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(5000))throw Error('gf3_photo_busy');
 try{
  const row=GF3_AssignmentFixtureRow_(book,'車両台帳','VehicleID',vehicleId,['📷車両状態フォルダ']);
  const {existing:known}=GF3_CanonicalPhotoFolderCell_(row);
  if(known&&GF3_FixturePhotoParent_(vehicleId,false)?.getUrl()!==known)throw Error('gf3_photo_folder_link_conflict');
  const parent=GF3_FixturePhotoParent_(vehicleId,true);
  return GF3_SaveCanonicalPhotos_(row,parent,date,blobs);
 }finally{lock.releaseLock();}
}
