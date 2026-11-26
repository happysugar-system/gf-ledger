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

# Generate a closed validation subset. Keep the full-source patch as the
# default for review, but never import the full backup into the shared test GAS.
if "--isolated" in sys.argv[3:]:
    def section(name, start, end):
        source = changed[name]
        if source.count(start) != 1 or end not in source[source.index(start):]:
            raise ValueError(f"Unexpected validation boundary in {name}")
        return source[source.index(start):source.index(end, source.index(start))]

    changed[cancel] = section(cancel,"function GF_実績履歴を準備_26(ss){","function GF_スマホ実績取消_26(id)")
    edit(cancel, "const ss=対象スプレッドシートを開く_(),queue=GF_実績キューシート_(),q=queue.getDataRange().getValues();",
         """const ss=GF_IsolatedValidationOpen_(),queue=GF_IsolatedValidationQueue_(ss);
    const q=queue.getDataRange().getValues();
    const active=Number(PropertiesService.getScriptProperties().getProperty('GF_VALIDATION_RETURN_WORKER_RUNNING')||0);
    if(active&&Date.now()-active<600000)throw Error('validation_worker_active');
    GF_IsolatedValidationReceipt_(id);""")
    edit(cancel, "const state=String(q[qi][7]);",
         """if(String(q[qi][3])!=='返却完了')throw Error('validation_cancel_kind_denied');
      GF_IsolatedValidationVehicle_(String(q[qi][2]));
      const state=String(q[qi][7]);
      if(state==='待機')throw Error('validation_cancel_requires_applied_return');""")
    edit(cancel, "const target=GF_実績対象列_26(kind),tz=ss.getSpreadsheetTimeZone();",
         """if(kind!=='返却完了'||!before.gfReturnHistory)throw Error('validation_cancel_kind_denied');
    GF_IsolatedValidationVehicle_(vehicle);
    const target=GF_実績対象列_26(kind),tz=ss.getSpreadsheetTimeZone();""")
    start = "// 実績開始時に書いた貸出情報のみ取り消す。"
    stop = "h.sheet.getRange(h.row,6).setValue('取消済');"
    edit(cancel, section(cancel,start,stop), """    Object.assign(changes,GF_MainReturnHistoryDelta_(after.gfReturnHistory,before.gfReturnHistory));
    GF_MainReturnHistoryWrite_(ss,ledger,v.row,changes);
""")
    edit(cancel,"GF_取消後同期を予約_24(ss,vehicle);","GF_IsolatedValidationReread_(ss,v.row,vehicle,before.gfReturnHistory);")
    begin = "function GF_実績履歴を準備_26(ss){"
    end = "function GF_実績対象列_26(kind)"
    edit(cancel,section(cancel,begin,end),"""function GF_実績履歴を準備_26(ss){
  GF_IsolatedValidationBook_(ss);
  return GF_IsolatedValidationSheet_(ss.getSheetByName('実績履歴'));
}
""")


    worker=section(actual,"function GF_実績キューワーカー(){","// 車両実績の処理が正常終了した後に実行。")
    changed[actual]=(
        section(actual,"function GF_実績日付_(value,tz){","function GF_実績車両情報_(ss,id){")+
        section(actual,"function GF_実績台帳日付キー_25(value,tz){","function GF_実績キューワーカー(){")+
        worker+"}\n"
    )
    edit(actual,"GF_貸出先連携の準備を進める_25();","const validationBook=GF_IsolatedValidationOpen_();")
    edit(actual,"const key='GF_ACTUAL_WORKER_RUNNING';","const key='GF_VALIDATION_RETURN_WORKER_RUNNING';")
    edit(actual,"const sheet=GF_実績キューシート_();","const sheet=GF_IsolatedValidationQueue_(validationBook);")
    edit(actual,"const r=rows[i],state=String(r[7]);",
         """const r=rows[i],state=String(r[7]);
      if(String(r[0])!==props.getProperty('GF_VALIDATION_RETURN_RECEIPT_ID')||String(r[3])!=='返却完了')continue;
      GF_IsolatedValidationReceipt_(String(r[0]));
      GF_IsolatedValidationVehicle_(String(r[2]));""")
    edit(actual,"const checkSS=対象スプレッドシートを開く_();","const checkSS=validationBook;")
    edit(actual,"const ss=対象スプレッドシートを開く_();","const ss=validationBook;")
    edit(actual,section(actual,"const metaKey='GF_PLAN_ACTUAL_META_25_'","let applied="),"")
    edit(actual,section(actual,"if(auto&&!GF_自動予定実績の入力が一致する_40","const kind=String(r[3]);"),"")
    edit(actual,"if(auto){auto.phase='要確認';props.setProperty(metaKey,JSON.stringify(auto));}","")
    old=section(actual,"車両台帳の1台を同期する(v.row,true,Boolean(historyApplied));","GF_実績履歴の変更後を確定_26")
    edit(actual,old,"GF_IsolatedValidationReread_(ss,v.row,String(r[2]),historyApplied?.after);\n        ")
    edit(actual,"}else 行を書き込む_(v.sheet,v.row,update);","}else throw Error('validation_history_required');")
    edit(actual,section(actual,"// 受付との競合を避け","} finally {\n    props.deleteProperty(key);"),"")
    for name in (cancel,actual):
        changed[name] = (changed[name].replace("シート名.車両台帳","'車両台帳'")
                         .replace("列番号を取得する_(", "GF_IsolatedValidationColumn_("))
    changed[sync] = (Path(__file__).resolve().parents[1] /
                     "integrations/gas/review/GF_IsolatedValidationReadback.gs").read_text(encoding="utf-8")

output.mkdir()
for name, source in changed.items():
    (output / (name + ".gs")).write_text(source, encoding="utf-8")
review = Path(__file__).resolve().parents[1] / "integrations/gas/review"
for name in ("GF_CombinedHistoryPlan.gs", "GF_OperationalHistoryPlan.gs", "GF_MainReturnHistory.gs"):
    (output / name).write_bytes((review / name).read_bytes())

if "--isolated" in sys.argv[3:]:
    name = "GF_IsolatedValidationBoundary.gs"
    (output / name).write_bytes((review / name).read_bytes())
