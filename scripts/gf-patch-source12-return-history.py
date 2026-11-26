"""Generate review files from the supplied backup, without publishing its source."""
import json
from pathlib import Path
import sys

project = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
output = Path(sys.argv[2])
originals = {f["name"]: f["source"] for f in project["files"] if f["type"] == "server_js"}
changed = {}


def edit(name, old, new):
    source = changed.get(name, originals[name])
    if source.count(old) != 1:
        raise ValueError(f"Unexpected source in {name}: {old}")
    changed[name] = source.replace(old, new)


actual = "25_車両実績"
cancel = "24_実績取消"
sync = "30_車両同期"
edit(actual, "const check=GF_実績車両情報_(checkSS,String(r[2])).data;",
     "const checkVehicle=GF_実績車両情報_(checkSS,String(r[2]));\n          const check=checkVehicle.data;")
edit(actual, "if(actual&&actual===requested){",
     "if(actual&&actual===requested&&GF_MainReturnHistoryResume_(checkSS,r,checkVehicle)){")
edit(actual, "GF_実績履歴を保存_26(ss,r,v,'処理中');",
     """const history=GF_MainReturnHistoryPrepare_(ss,r,v);
          GF_実績履歴を保存_26(ss,r,v,'処理中',history);""")
edit(actual, "行を書き込む_(v.sheet,v.row,update);SpreadsheetApp.flush();",
     """if(history){
            if(!GF_MainReturnHistoryMatches_(v,history.before))throw Error('return_history_changed');
            Object.assign(update,GF_MainReturnHistoryDelta_(history.before,history.after));
            GF_MainReturnHistoryWrite_(ss,v.sheet,v.row,update);
          }else 行を書き込む_(v.sheet,v.row,update);
          SpreadsheetApp.flush();""")
edit(actual, "車両台帳の1台を同期する(v.row,true);",
     """const historyApplied=GF_MainReturnHistoryRecorded_(ss,r);
        if(historyApplied&&!GF_MainReturnHistoryMatches_(v,historyApplied.after))throw Error('return_history_changed');
        車両台帳の1台を同期する(v.row,true,Boolean(historyApplied));""")
edit(cancel, "function GF_実績履歴を保存_26(ss,r,v,state){",
     "function GF_実績履歴を保存_26(ss,r,v,state,returnHistory){")
edit(cancel, "if(vals.some((x,i)=>i>0&&String(x[0])===id))return;",
     """if(vals.some((x,i)=>i>0&&String(x[0])===id)){
    if(returnHistory)throw Error('return_history_receipt_exists');
    return;
  }""")
edit(cancel, "sh.appendRow([id,new Date(),String(r[2]),kind,",
     """if(returnHistory){
    before.gfReturnHistory=returnHistory.before;
    after.gfReturnHistory=returnHistory.after;
  }
  sh.appendRow([id,new Date(),String(r[2]),kind,""")
edit(cancel, "Object.keys(before).forEach(k=>{after[k]=vehicle.data[k]||'';});",
     """Object.keys(before).forEach(k=>{after[k]=vehicle.data[k]||'';});
  if(before.gfReturnHistory){
    const planned=JSON.parse(String(found.data[7])).gfReturnHistory;
    if(!planned||!GF_MainReturnHistoryMatches_(vehicle,planned))throw Error('return_history_changed');
    after.gfReturnHistory=planned;
  }""")
# Reject history conflicts before any legacy-sheet cancellation side effects.
edit(cancel, "changes[target]=before[target]||'';",
     """changes[target]=before[target]||'';
    if(before.gfReturnHistory&&(!after.gfReturnHistory||
       !GF_MainReturnHistoryEnabled_(ss)||
       !GF_MainReturnHistoryMatches_(v,after.gfReturnHistory)))
      throw Error('return_history_changed');""")
edit(cancel, "行を書き込む_(ledger,v.row,changes);",
     """if(before.gfReturnHistory){
      if(!after.gfReturnHistory||!GF_MainReturnHistoryEnabled_(ss)||
         !GF_MainReturnHistoryMatches_(v,after.gfReturnHistory))throw Error('return_history_changed');
      Object.assign(changes,GF_MainReturnHistoryDelta_(after.gfReturnHistory,before.gfReturnHistory));
      GF_MainReturnHistoryWrite_(ss,ledger,v.row,changes);
    }else 行を書き込む_(ledger,v.row,changes);""")
# The existing cancellation queue is keyed by vehicle. Once enabled, its sync
# must not infer a prior owner from the legacy sheets, even on retry.
edit(cancel, "車両台帳の1台を同期する(car.row,true);",
     "車両台帳の1台を同期する(car.row,true,GF_MainReturnHistoryEnabled_(ss));")
edit(sync, "現在使用者変更 = false) {",
     "現在使用者変更 = false, 台帳履歴確定済み = false) {")
edit(sync, "if (現在使用者変更) {\n\n      const 利用者管理行",
     "if (現在使用者変更 && !台帳履歴確定済み) {\n\n      const 利用者管理行")

# Optional isolated cancellation candidate: do not install in production.
if "--isolated-cancel" in sys.argv[3:]:
    edit(cancel, "const ss=対象スプレッドシートを開く_(),queue=GF_実績キューシート_(),q=queue.getDataRange().getValues();",
         """const ss=GF_IsolatedValidationOpen_();
    const queue=GF_IsolatedValidationSheet_(ss.getSheetByName('実績登録キュー'));
    const q=queue.getDataRange().getValues();""")
    edit(cancel, "const state=String(q[qi][7]);",
         """if(String(q[qi][3])!=='返却完了')throw Error('validation_cancel_kind_denied');
      const state=String(q[qi][7]);""")
    edit(cancel, "const target=GF_実績対象列_26(kind),tz=ss.getSpreadsheetTimeZone();",
         """if(kind!=='返却完了'||!before.gfReturnHistory)throw Error('validation_cancel_kind_denied');
    GF_IsolatedValidationSheet_(v.sheet);
    GF_IsolatedValidationSheet_(h.sheet);
    const target=GF_実績対象列_26(kind),tz=ss.getSpreadsheetTimeZone();""")
    edit(cancel, "GF_取消後同期を予約_24(ss,vehicle);",
         """// No legacy sync worker or external calls in this isolated candidate.
    // Replica synchronization remains pending until the isolated worker is connected.
    console.log('validation_cancel_saved_sync_pending');""")

output.mkdir()
for name, source in changed.items():
    (output / (name + ".gs")).write_text(source, encoding="utf-8")
review = Path(__file__).resolve().parents[1] / "integrations/gas/review"
for name in ("GF_CombinedHistoryPlan.gs", "GF_OperationalHistoryPlan.gs", "GF_MainReturnHistory.gs"):
    (output / name).write_bytes((review / name).read_bytes())
