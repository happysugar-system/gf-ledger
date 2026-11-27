"""Generate the 40-series calendar change for the reviewed source-13 export."""
import argparse
import json
from pathlib import Path


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("Source does not match the reviewed calendar implementation")
    return source.replace(old, new, 1)


def patch(source):
    return replace_once(
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


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source", type=Path)
    cli.add_argument("output", type=Path)
    args = cli.parse_args()
    files = json.loads(args.source.read_text(encoding="utf-8-sig"))["files"]
    matches = [f for f in files if f["name"] == "40_車両予定カレンダー"]
    if len(matches) != 1:
        raise ValueError("Expected exactly one 40-series source file")
    source = patch(matches[0]["source"])
    with args.output.open("x", encoding="utf-8") as out:
        out.write(source)


if __name__ == "__main__":
    main()
