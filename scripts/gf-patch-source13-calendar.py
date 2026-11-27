"""Generate the 40-series calendar change for the reviewed source-13 export."""
import argparse
import json
from pathlib import Path


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("Source does not match the reviewed calendar implementation")
    return source.replace(old, new, 1)


def patch(source, three_sheet_validation=False):
    source = replace_once(
        source,
        """  const cal=予定種類のカレンダーを取得する_(種類);
  if(!cal)return ''; // 未設定の論理カレンダーは予定管理だけ先に使える
  const p=行データを取得する_(管理,行);
  let e=null, id=String(p['CalendarEventID']||'').trim();
  if(id){try{e=cal.getEventById(id);}catch(_){e=null;}}""",
        """  const p=行データを取得する_(管理,行);
  const id=String(p['CalendarEventID']||'').trim();
  const cal=予定種類のカレンダーを取得する_(種類);
  if(!cal){
    if(id)throw new Error('既存イベントの連携先カレンダーが未設定です。');
    return '';
  }
  let e=null;
  if(id){
    e=cal.getEventById(id);
    if(!e)throw new Error('既存イベントを特定できません。予定IDとカレンダーを確認してください。');
  }""",
    )
    if three_sheet_validation:
        source = replace_once(
            source,
            """function GF_予定関連だけ反映する_40(ss,VehicleID) {
  const lock=LockService.getScriptLock();""",
            """function GF_予定関連だけ反映する_40(ss,VehicleID) {
  // Isolated validation only. Fail closed instead of writing to legacy sheets.
  if(PropertiesService.getScriptProperties().getProperty('GF3_VALIDATION_ENABLED')==='true'){
    if(typeof GF3_Source13ProjectionCutover_!=='function')throw Error('gf3_projection_adapter_missing');
    if(!GF3_Source13ProjectionCutover_(ss,VehicleID))throw Error('gf3_projection_denied');
    return;
  }
  const lock=LockService.getScriptLock();""",
        )
    return source


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source", type=Path)
    cli.add_argument("output", type=Path)
    cli.add_argument("--three-sheet-validation", action="store_true", help="Add fail-closed GF3 schedule projection hook; requires separate adapter")
    args = cli.parse_args()
    files = json.loads(args.source.read_text(encoding="utf-8-sig"))["files"]
    matches = [f for f in files if f["name"] == "40_車両予定カレンダー"]
    if len(matches) != 1:
        raise ValueError("Expected exactly one 40-series source file")
    source = patch(matches[0]["source"], three_sheet_validation=args.three_sheet_validation)
    with args.output.open("x", encoding="utf-8") as out:
        out.write(source)


if __name__ == "__main__":
    main()
