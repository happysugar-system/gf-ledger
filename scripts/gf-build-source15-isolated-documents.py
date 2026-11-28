#!/usr/bin/env python3
"""Extract only isolated vehicle-document entrypoints and pure PDF helpers from source15."""
import json, re, sys
from pathlib import Path
src=next(f["source"] for f in json.loads(Path(sys.argv[1]).read_text())["files"] if f["name"]=="60_書類PDF")
parts=re.split(r'(?m)(?=^function )',src)
names=["スマホから車両書類をまとめて登録する","車両書類PDFを作る_","固定向きPDFを作る_","画像データをBlobにする_","MIMEから拡張子を取得する_","GF_JPEG情報を読む_60","GF_JPEGを直接PDFにする_60","GF_EXIFの向きを読む_60"]
out=[]
for name in names:
 matches=[p for p in parts if p.startswith("function "+name+"(")]
 if len(matches)!=1: raise ValueError(name)
 out.append(matches[0])
out.append("""function 車両書類を保存する_(VehicleID, blobs) {
 return GF3_VehicleDocumentSave_(VehicleID, blobs);
}
function スマホから直前登録を取り消す(取消情報) {
 if(!取消情報 || 取消情報.種類!=='車両書類')throw Error('gf3_cancel_kind_denied');
 return GF3_VehicleDocumentCancel_(取消情報.受付ID);
}
function GF_従来の固定向きPDFを作る_60(){
 throw Error('gf3_pdf_fallback_not_isolated');
}
""")
Path(sys.argv[2]).write_text("\n".join(out))
