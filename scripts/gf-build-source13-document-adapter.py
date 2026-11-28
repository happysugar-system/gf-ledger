"""Extract existing PDF helpers and replace legacy entrypoints with isolated adapters.
Never deploy the original source export into the isolated project."""
import json,argparse
from pathlib import Path
def patch(s):
    start=s.index('function 車両書類を保存する_(VehicleID, blobs) {')
    end=s.index('/******************************************************\n * 直前登録取消',start)
    s=s[:start]+'''function 車両書類を保存する_(VehicleID, blobs) {
  return GF3_VehicleDocumentSave_(VehicleID, blobs);
}
'''+s[end:]
    start=s.index('function スマホから直前登録を取り消す(')
    end=s.index('/******************************************************\n * 車両写真取消',start)
    s=s[:start]+'''function スマホから直前登録を取り消す(取消情報) {
  if (!取消情報 || 取消情報.種類 !== '車両書類') throw new Error('gf3_document_kind_not_connected');
  return GF3_VehicleDocumentCancel_(取消情報.受付ID);
}
'''+s[end:]
    start=s.index('function 免許証を保存する_(DriverID, blobs) {')
    end=s.index('/******************************************************\n * 車両書類',start)
    s=s[:start]+'''function 免許証を保存する_(DriverID, blobs) {
  throw new Error('gf3_license_not_connected');
}
'''+s[end:]
    start=s.index('function スマホから車両写真登録を取り消す(')
    end=s.index('/******************************************************\n * 画像 → PDF',start)
    s=s[:start]+'''function スマホから車両写真登録を取り消す(取消情報) {
  throw new Error('gf3_photo_cancel_not_connected');
}
'''+s[end:]
    # Only retain explicit PDF helper functions; omit maintenance/production diagnostics.
    import re
    names=['免許証PDFを作る_','車両書類PDFを作る_','固定向きPDFを作る_','GF_従来の固定向きPDFを作る_60','GF_JPEG情報を読む_60','GF_JPEGを直接PDFにする_60','GF_EXIFの向きを読む_60','画像データをBlobにする_','MIMEから拡張子を取得する_','登録日時名を作る_']
    matches=list(re.finditer(r'^function ([^\s(]+)\(',s,re.M))
    first=s.index('/******************************************************\n * 画像 → PDF')
    result=s[:first]
    for i,m in enumerate(matches):
        if m.group(1) in names:
            result+=s[m.start():matches[i+1].start() if i+1<len(matches) else len(s)]+'\n'
    actual=set(re.findall(r'^function ([^\\s(]+)\\(',result,re.M))
    required=set(names)|{'スマホから免許証をまとめて登録する','スマホから車両書類をまとめて登録する','車両書類を保存する_','スマホから直前登録を取り消す'}
    if not required <= actual: raise ValueError('missing helpers: '+str(required-actual))
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('source',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args()
    files=json.loads(a.source.read_text(encoding='utf-8-sig'))['files']
    source=next(f['source'] for f in files if f['name']=='60_書類PDF')
    result=patch(source)
    with a.output.open('x',encoding='utf-8') as f:f.write(result)
