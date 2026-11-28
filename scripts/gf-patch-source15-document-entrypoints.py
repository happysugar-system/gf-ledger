"""Patch the source-15 mobile document entrypoints for the isolated GF3 route."""
import argparse
import json
from pathlib import Path


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise ValueError("Source-15 entrypoint anchor must occur exactly once")
    return source.replace(before, after, 1)


def patch_server(source):
    source = replace_once(source, """function スマホから車両書類をまとめて登録する(
  VehicleID,
  画像一覧
) {""", """function スマホから車両書類をまとめて登録する(
  VehicleID,
  画像一覧,
  受付ID
) {""")
    source = replace_once(source, """  return 車両書類を保存する_(
    String(VehicleID).trim(),
    blobs
  );""", """  if (PropertiesService.getScriptProperties().getProperty('GF3_VALIDATION_ENABLED') === 'true') {
    if (typeof 受付ID !== 'string' || !/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(受付ID)) {
      throw new Error('検証用の書類受付IDが必要です。');
    }
    return GF3_VehicleDocumentSave_(String(VehicleID).trim(), blobs, 受付ID);
  }
  if (受付ID) throw new Error('検証用の書類受付はこの環境では処理できません。');
  return 車両書類を保存する_(String(VehicleID).trim(), blobs);""")
    return replace_once(source, """function スマホから直前登録を取り消す(
  取消情報
) {""", """function スマホから直前登録を取り消す(
  取消情報
) {
  const validation = PropertiesService.getScriptProperties().getProperty('GF3_VALIDATION_ENABLED') === 'true';
  if (validation) {
    if (取消情報?.種類 !== '車両書類' || !/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(取消情報.受付ID || '')) {
      throw new Error('検証用の書類取消受付が必要です。');
    }
    return GF3_VehicleDocumentCancel_(取消情報.受付ID);
  }
  if (取消情報?.受付ID?.startsWith('TEST-GF3-')) {
    throw new Error('検証用の書類取消はこの環境では処理できません。');
  }""")


def patch_mobile(source):
    start = source.index("async function 書類登録(){")
    end = source.index("async function GF_登録時の書類を送り直す_80(){", start)
    prefix, source, suffix = source[:start], source[start:end], source[end:]
    source = replace_once(source, """async function 書類登録(){""", """const GF3_書類受付キャッシュ = new Map();
const GF3_書類受付キー = new Map();
async function GF3_書類受付IDを取得する(id, images) {
  const bytes = new TextEncoder().encode(JSON.stringify([id, images]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const digest = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  const key = 'GF3-DOC-RETRY:' + digest;
  let saved = GF3_書類受付キャッシュ.get(key) || '';
  if (!saved) { try { saved = sessionStorage.getItem(key) || ''; } catch (ignored) {} }
  if (!/^TEST-GF3-[A-Z0-9-]{1,60}$/.test(saved)) {
    saved = 'TEST-GF3-' + crypto.randomUUID().replace(/-/g, '').toUpperCase();
    try { sessionStorage.setItem(key, saved); } catch (ignored) {}
  }
  GF3_書類受付キャッシュ.set(key, saved);
  GF3_書類受付キー.set(saved, key);
  return saved;
}
async function 書類登録(){""")
    source = replace_once(source, """  const fs=車両書類撮影ファイル.slice();""", """  const vehicleId=selCar2;
  const fs=車両書類撮影ファイル.slice();""")
    source = replace_once(source, """    .スマホから車両書類をまとめて登録する(selCar2,a);""", """    .スマホから車両書類をまとめて登録する(vehicleId,a,receiptId);""")
    source = replace_once(source, """    const a=[];for(const f of fs)a.push(await img書類(f));
    google.script.run.withSuccessHandler(r=>{
      $('docsBtn').disabled=false;$('docsRepairBtn').disabled=false;undo.docs=r.取消情報;""", """    const a=[];for(const f of fs)a.push(await img書類(f));
    const receiptId=await GF3_書類受付IDを取得する(vehicleId, a);
    google.script.run.withSuccessHandler(r=>{
      const cacheKey=GF3_書類受付キー.get(receiptId);
      if (cacheKey) {
        GF3_書類受付キャッシュ.delete(cacheKey);
        GF3_書類受付キー.delete(receiptId);
        try { sessionStorage.removeItem(cacheKey); } catch (ignored) {}
      }
      $('docsBtn').disabled=false;$('docsRepairBtn').disabled=false;undo.docs=r.取消情報;""")
    return prefix + source + suffix


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    files = json.loads(args.source.read_text(encoding="utf-8-sig"))["files"]
    targets = {
        "60_書類PDF": (patch_server, ".gs"),
        "80_スマホ画面_HTML_免許証追加版": (patch_mobile, ".html"),
    }
    results = []
    for name, (transform, extension) in targets.items():
        matches = [f for f in files if f["name"] == name]
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one source file for {name}")
        results.append((name + extension, transform(matches[0]["source"])))
    args.output.mkdir()
    for name, source in results:
        (args.output / name).write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
