"""Generate a fail-closed isolated source-13 document entrypoint candidate."""
import argparse,json
from pathlib import Path

def patch(source):
    signatures=[
        "function 車両書類を保存する_(VehicleID, blobs) {",
        "function 免許証を保存する_(DriverID, blobs) {",
        "function スマホから直前登録を取り消す(\n  取消情報\n) {",
        "function スマホから車両写真登録を取り消す(\n  取消情報\n) {",
    ]
    for signature in signatures:
        if source.count(signature)!=1:
            raise ValueError("source13 document anchor changed: "+signature)
        source=source.replace(signature,signature+"\n  throw new Error('gf3_document_live_storage_not_connected');\n",1)
    return source

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("source",type=Path)
    p.add_argument("output",type=Path)
    a=p.parse_args()
    files=json.loads(a.source.read_text(encoding="utf-8-sig"))["files"]
    matches=[f for f in files if f["name"]=="60_書類PDF"]
    if len(matches)!=1: raise ValueError("source13 file missing")
    with a.output.open("x",encoding="utf-8") as out: out.write(patch(matches[0]["source"]))
