"""Connect source-13's replacement-loan display to the three-sheet ledger."""
import argparse
import json
from pathlib import Path


def patch(source):
    name = "function GF_スマホ貸出先情報を取得する_25(VehicleID) {"
    if source.count(name) != 1:
        raise ValueError("Expected exactly one source-13 loan display entrypoint")
    prefix, entry = source.split(name, 1)
    opening = "  const ss = 対象スプレッドシートを開く_();"
    legacy = """  const users = 必須シートを取得する_(ss, シート名.利用者管理);
  const u = 対象行を取得する_(users) || {};

  const kind = String(car['区分/ステータス'] || '').trim();"""
    if entry.count(opening) != 1 or entry.count(legacy) != 1:
        raise ValueError("Source-13 loan display anchors changed")
    entry = entry.replace(opening, """  const threeSheetValidation = PropertiesService.getScriptProperties()
    .getProperty('GF3_VALIDATION_ENABLED') === 'true';
  if (threeSheetValidation && !/^V9\\d{5}$/.test(id)) {
    throw new Error('validation_vehicle_required');
  }
  const ss = threeSheetValidation ? GF3_Open_() : 対象スプレッドシートを開く_();""", 1)
    finder = """    const match = sheet.getRange(2, idColumn, lastRow - 1, 1)
      .createTextFinder(id).matchEntireCell(true).matchCase(true).findNext();
    if (!match) return null;"""
    strict_finder = """    const finder = sheet.getRange(2, idColumn, lastRow - 1, 1)
      .createTextFinder(id).matchEntireCell(true).matchCase(true);
    const match = threeSheetValidation ? (() => {
      const matches = finder.findAll();
      if (matches.length > 1) throw new Error('validation_vehicle_duplicate');
      return matches[0] || null;
    })() : finder.findNext();
    if (!match) return null;"""
    if entry.count(finder) != 1:
        raise ValueError("Source-13 VehicleID finder changed")
    entry = entry.replace(finder, strict_finder, 1)
    entry = entry.replace(legacy, """  const kind = String(car['区分/ステータス'] || '').trim();
  let u;
  if (threeSheetValidation) {
    if (kind !== '代車') throw new Error('通常貸出情報の移行先が未確定です。');
    GF3_Columns_(ledger, ['代車貸出先', '代車貸出エリア', '代車貸出備考']);
    u = {貸出先: car['代車貸出先'], 貸出エリア: car['代車貸出エリア'], 貸出備考: car['代車貸出備考']};
  } else {
    const users = 必須シートを取得する_(ss, シート名.利用者管理);
    u = 対象行を取得する_(users) || {};
  }""", 1)
    return prefix + name + entry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    files = json.loads(args.source.read_text(encoding="utf-8-sig"))["files"]
    matches = [f for f in files if f["name"] == "25_車両実績"]
    if len(matches) != 1:
        raise ValueError("Expected exactly one 25-series source file")
    with args.output.open("x", encoding="utf-8") as out:
        out.write(patch(matches[0]["source"]))


if __name__ == "__main__":
    main()
