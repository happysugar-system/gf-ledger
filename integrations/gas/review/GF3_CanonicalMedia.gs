const GF3_MEDIA_FIELDS_=['車両フォルダ','📄 最新車両書類','📁 車両書類フォルダ','📷車両状態フォルダ',
 '🔧整備書類フォルダ','前使用者 車両書類','前々使用者 車両書類'];

function GF3_CanonicalDriveUrl_(value){
 const url=String(value??'').trim();
 return /^https:\/\/(?:drive|docs)\.google\.com\/[A-Za-z0-9_./?&=%#-]+$/.test(url)?url:'';
}

function GF3_ReadCanonicalMedia_(row){
 const entries=[];
 for(const field of GF3_MEDIA_FIELDS_){
  if(!(field in row.columns))continue;
  const cell=row.sheet.getRange(row.number,row.columns[field]+1);
  const rich=cell.getRichTextValue();
  const url=GF3_CanonicalDriveUrl_(rich?.getLinkUrl()||cell.getValue());
  if(url)entries.push([field,url]);
 }
 return Object.fromEntries(entries);
}

function GF3_CanonicalPhotoDates_(parent){
 const iterator=parent.getFolders(),dated=[];
 while(iterator.hasNext()){
  const folder=iterator.next(),date=folder.getName();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||folder.isTrashed()||!folder.getFiles().hasNext())continue;
  dated.push({date,url:folder.getUrl()});
 }
 dated.sort((a,b)=>b.date.localeCompare(a.date));
 return dated.slice(0,2);
}

function GF3_CanonicalPhotoFolderCell_(row){
 const field='📷車両状態フォルダ';
 const cell=row.sheet.getRange(row.number,row.columns[field]+1);
 const existing=GF3_ReadCanonicalMedia_(row)[field];
 if(cell.getFormula()||cell.getDataValidation()||(!existing&&cell.getValue()!==''))
  throw Error('gf3_photo_folder_link_conflict');
 return {cell,existing};
}

/** The caller supplies an authorized vehicle folder and a canonical ledger row. */
function GF3_SaveCanonicalPhotos_(row,parent,date,images){
 const {cell,existing}=GF3_CanonicalPhotoFolderCell_(row);
 const url=parent.getUrl();
 if(existing&&existing!==url)
  throw Error('gf3_photo_folder_link_conflict');
 const sameDate=parent.getFoldersByName(date);
 const folder=sameDate.hasNext()?sameDate.next():parent.createFolder(date);
 if(sameDate.hasNext()||folder.isTrashed())throw Error('gf3_photo_folder_conflict');
 const created=[];
 try{
  images.forEach((blob,i)=>{
   const name=date+'_'+Utilities.getUuid()+'_'+String(i+1).padStart(2,'0')+'.jpg';
   created.push(folder.createFile(blob.copyBlob().setName(name)));
  });
  if(!existing)cell.setValue(url);
 }catch(error){
  created.forEach(file=>{try{file.setTrashed(true);}catch(_){}});
  throw error;
 }
 return {saved:created.length,folderUrl:folder.getUrl(),fileIds:created.map(file=>file.getId()),
  recent:GF3_CanonicalPhotoDates_(parent)};
}

function GF3_CancelCanonicalPhotoFiles_(folder,date,files){
 for(const file of files){
  const parts=file.getName().split('_');
  if(parts.length!==3||parts[0]!==date||!/^[0-9a-f-]{36}$/i.test(parts[1])||!/^\d{2}\.jpg$/.test(parts[2]))
   throw Error('gf3_photo_file_denied');
  const parents=file.getParents();
  if(!parents.hasNext()||parents.next().getId()!==folder.getId()||parents.hasNext())
   throw Error('gf3_photo_file_denied');
 }
 for(const file of files)if(!file.isTrashed())file.setTrashed(true);
}
