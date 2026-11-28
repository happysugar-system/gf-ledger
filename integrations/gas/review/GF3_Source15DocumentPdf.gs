function 車両書類PDFを作る_(一時名, blobs) {
  // 車両書類は縦型。
  // 車検証記録事項などの縦長書類を大きく表示する。
  return 固定向きPDFを作る_(
    一時名,
    blobs,
    '縦'
  );
}

function 固定向きPDFを作る_(一時名, blobs, ページ向き) {
  if(!Array.isArray(blobs)||!blobs.length)throw new Error('PDF化する画像がありません。');
  const start=Date.now();
  const images=blobs.map(blob=>GF_JPEG情報を読む_60(blob));
  if(images.every(Boolean)){
    const pdf=GF_JPEGを直接PDFにする_60(一時名,images,ページ向き);
    console.log('書類PDF作成 / 方式=JPEG直接 / ページ='+images.length+' / 秒='+((Date.now()-start)/1000).toFixed(2));
    return pdf;
  }
  // PNG等や特殊なJPEGは従来の変換を使う。
  throw new Error('検証用の書類画像は標準JPEGに変換してください。');
}

function MIMEから拡張子を取得する_(
  MIME
) {
  MIME = String(
    MIME || ''
  ).toLowerCase();
  if (MIME.includes('png')) {
    return 'png';
  }
  if (MIME.includes('webp')) {
    return 'webp';
  }
  if (MIME.includes('heic')) {
    return 'heic';
  }
  if (MIME.includes('heif')) {
    return 'heif';
  }
  return 'jpg';
}

function GF_JPEG情報を読む_60(blob,理由を表示) {
  const fallback=reason=>{if(理由を表示)console.log("JPEG直接方式を使わない理由: "+reason);return null;};
  const bytes=Uint8Array.from(blob.getBytes(),v=>v&255);
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)return fallback('JPEG以外の画像形式');
  if(bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return fallback('JPEG末尾が標準の終端と異なる');
  let pos=2,info=null,transform=null,orientation=1;
  while(pos<bytes.length){
    if(bytes[pos++]!==255)return fallback('JPEGの対応条件外');
    while(pos<bytes.length&&bytes[pos]===255)pos++;
    const marker=bytes[pos++];
    if(marker===218)break;
    if(marker===217)return fallback('JPEGの対応条件外');
    if(marker===1||(marker>=208&&marker<=215))continue;
    if(pos+2>bytes.length)return fallback('JPEGの対応条件外');
    const len=(bytes[pos]<<8)|bytes[pos+1];
    if(len<2||pos+len>bytes.length)return fallback('JPEGの対応条件外');
    if(marker===225&&len>=8&&bytes[pos+2]===69&&bytes[pos+3]===120&&bytes[pos+4]===105&&bytes[pos+5]===102){
      const direction=GF_EXIFの向きを読む_60(bytes,pos+8,pos+len);
      if(direction===null)return fallback('EXIFの向き情報を確認できない');
      orientation=direction;
    }
    if(marker===238&&len>=14&&bytes[pos+2]===65&&bytes[pos+3]===100&&bytes[pos+4]===111&&bytes[pos+5]===98&&bytes[pos+6]===101)transform=bytes[pos+13];
    if(marker===192||marker===194){
      if(len<8)return fallback('JPEGの対応条件外');
      const depth=bytes[pos+2],height=(bytes[pos+3]<<8)|bytes[pos+4],width=(bytes[pos+5]<<8)|bytes[pos+6],components=bytes[pos+7];
      if(depth!==8||!width||!height||![1,3].includes(components)||len<8+3*components)return fallback('JPEGの対応条件外');
      info={bytes:bytes,width:width,height:height,components:components};
    }else if((marker>=193&&marker<=207)&&![196,200,204].includes(marker))return fallback('JPEGの対応条件外');
    pos+=len;
  }
  if(!info||bytes[pos-1]!==218)return fallback('JPEGの対応条件外');
  if(transform!==null&&!([0,1].includes(transform)))return fallback('JPEGの対応条件外');
  info.transform=transform;info.orientation=orientation;
  return info;
}

function GF_JPEGを直接PDFにする_60(name,images,orientation) {
  const portrait=String(orientation||'').trim()==='縦';
  const w=portrait?595:842,h=portrait?842:595,margin=8;
  const chunks=[],offsets=[0];let length=0;
  const raw=bytes=>{chunks.push(bytes);length+=bytes.length;};
  const ascii=text=>raw(Uint8Array.from(String(text),c=>c.charCodeAt(0)));
  const object=(id,text)=>{offsets[id]=length;ascii(id+' 0 obj\n'+text+'\nendobj\n');};
  ascii('%PDF-1.4\n');raw(Uint8Array.from([37,226,227,207,211,10]));
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Count '+images.length+' /Kids ['+images.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  images.forEach((image,i)=>{
    const page=3+i*3,img=page+1,content=page+2;
    const swapped=image.orientation>=5;
    const displayW=swapped?image.height:image.width,displayH=swapped?image.width:image.height;
    let targetW=w-2*margin,targetH=targetW*displayH/displayW;
    if(targetH>h-2*margin){targetH=h-2*margin;targetW=targetH*displayW/displayH;}
    // 従来と同じ丸め、横中央・上余白8ptの配置。
    targetW=Math.max(1,Math.round(targetW));targetH=Math.max(1,Math.round(targetH));
    const x=(w-targetW)/2,y=h-margin-targetH;
    // EXIFの回転・鏡像を表示行列で反映。埋込JPEGの画素は変更しない。
    const transforms={1:[1,0,0,1,0,0],2:[-1,0,0,1,1,0],3:[-1,0,0,-1,1,1],4:[1,0,0,-1,0,1],5:[0,-1,-1,0,1,1],6:[0,-1,1,0,0,1],7:[0,1,1,0,0,0],8:[0,1,-1,0,1,0]};
    const t=transforms[image.orientation||1];
    const matrix=[t[0]*targetW,t[1]*targetH,t[2]*targetW,t[3]*targetH,x+t[4]*targetW,y+t[5]*targetH];
    const stream='q\n'+matrix.join(' ')+' cm\n/Im0 Do\nQ\n';
    object(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /XObject << /Im0 '+img+' 0 R >> >> /Contents '+content+' 0 R >>');
    offsets[img]=length;
    ascii(img+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+' /ColorSpace /'+(image.components===1?'DeviceGray':'DeviceRGB')+' /BitsPerComponent 8 /Filter /DCTDecode '+(image.transform!==null?'/DecodeParms << /ColorTransform '+image.transform+' >> ':'')+'/Length '+image.bytes.length+' >>\nstream\n');
    raw(image.bytes);ascii('\nendstream\nendobj\n');
    object(content,'<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
  });
  const xref=length,count=2+images.length*3;
  ascii('xref\n0 '+(count+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<=count;i++)ascii(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  ascii('trailer\n<< /Size '+(count+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  const output=new Uint8Array(length);let pos=0;
  chunks.forEach(chunk=>{output.set(chunk,pos);pos+=chunk.length;});
  return Utilities.newBlob(Array.from(output,b=>b>127?b-256:b),'application/pdf',String(name)+'.pdf');
}

function GF_EXIFの向きを読む_60(bytes,start,end) {
  if(start+8>end)return null;
  const little=bytes[start]===73&&bytes[start+1]===73;
  if(!little&&!(bytes[start]===77&&bytes[start+1]===77))return null;
  const u16=p=>little?(bytes[p]|bytes[p+1]<<8):(bytes[p]<<8|bytes[p+1]);
  const u32=p=>little?((bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16|bytes[p+3]<<24)>>>0):((bytes[p]<<24|bytes[p+1]<<16|bytes[p+2]<<8|bytes[p+3])>>>0);
  if(u16(start+2)!==42)return null;
  const ifd=start+u32(start+4);
  if(ifd<start+8||ifd+2>end)return null;
  const n=u16(ifd);
  if(ifd+2+n*12>end)return null;
  for(let i=0;i<n;i++){
    const p=ifd+2+i*12;
    if(u16(p)!==274)continue;
    if(u16(p+2)!==3||u32(p+4)!==1)return null;
    const value=u16(p+8);
    return value>=1&&value<=8?value:null;
  }
  return 1;
}
