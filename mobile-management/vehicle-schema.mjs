// GOLD FIRST: vehicle ledger 63-column schema contract.
// Header names were read from production sheet on 2026-11-18.
// Do not put personal data or service credentials in this file.
export const VEHICLE_HEADERS = [
  "VehicleID",
  "区分/ステータス",
  "管理区分",
  "管轄",
  "車番",
  "現在使用者",
  "DriverID",
  "前使用者",
  "前々使用者",
  "フリガナ",
  "電話番号",
  "紹介元",
  "所属会社名",
  "稼働エリア",
  "契約者メールアドレス",
  "緊急連絡先氏名",
  "緊急連絡先メールアドレス",
  "ドライバーステータス",
  "ドライバー備考",
  "所在地",
  "駆動",
  "所有者",
  "スペア",
  "カギNo.",
  "タイヤサイズ",
  "走行距離(km)",
  "仕入れ値",
  "GPS番号",
  "GPS有無",
  "車体番号",
  "車種",
  "稼働拠点",
  "カラー",
  "仕入れ日/会場",
  "保険会社",
  "免責",
  "備考",
  "納車予定日",
  "返却予定日",
  "代車予定日",
  "代車返却予定日",
  " 12点検予定日",
  "車検予定日",
  "名変予定日",
  "引渡し",
  "代車開始日",
  "代車貸出先",
  "代車貸出エリア",
  "代車貸出備考",
  "代車返却日",
  " 板金予定日",
  " 整備予定日",
  "返却/12点検",
  "返却/12点検_備考",
  "予定反映状況",
  "車検満了日",
  "名義変更日",
  "車両画像",
  "車両フォルダ",
  "フォルダ備考",
  "更新日時",
  "📄 最新車両書類",
  "📁 車両書類フォルダ"
];

export const FIELD_GROUPS = {
  system: ["VehicleID","DriverID","更新日時","予定反映状況"],
  loan: ["引渡し","代車開始日","代車貸出先","代車貸出エリア","代車貸出備考","代車返却日"],
  schedule: ["納車予定日","返却予定日","代車予定日","代車返却予定日"," 12点検予定日","車検予定日","名変予定日"," 板金予定日"," 整備予定日","車検満了日"],
  files: ["車両画像","車両フォルダ","📄 最新車両書類","📁 車両書類フォルダ"],
  basic: ["名義変更日"]
};
const claimed=new Set(Object.values(FIELD_GROUPS).flat());
FIELD_GROUPS.basic.push(...VEHICLE_HEADERS.filter(h=>!claimed.has(h)));
export function validateVehicleHeaders(actual) {
  const missing=VEHICLE_HEADERS.filter(h=>!actual.includes(h));
  const extra=actual.filter(h=>!VEHICLE_HEADERS.includes(h));
  const duplicates=actual.filter((h,i)=>actual.indexOf(h)!==i);
  const groupNames=Object.values(FIELD_GROUPS).flat();
  const duplicateAssignments=groupNames.filter((h,i)=>groupNames.indexOf(h)!==i);
  const unassigned=VEHICLE_HEADERS.filter(h=>!groupNames.includes(h));
  return {ok:actual.length===63&&!missing.length&&!extra.length&&!duplicates.length&&!duplicateAssignments.length&&!unassigned.length,missing,extra,duplicates,duplicateAssignments,unassigned};
}
