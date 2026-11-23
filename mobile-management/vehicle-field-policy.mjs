import {VEHICLE_HEADERS} from './vehicle-schema.mjs';
// Fail closed: classification is not authorization to write.
const groups={
 ordinary:['管轄','所在地','駆動','所有者','スペア','カギNo.','タイヤサイズ','走行距離(km)','仕入れ値','GPS番号','GPS有無','車体番号','車種','稼働拠点','カラー','仕入れ日/会場','保険会社','免責','備考','代車貸出先','代車貸出エリア','代車貸出備考','返却/12点検_備考','フォルダ備考'],
 workflow:['区分/ステータス','管理区分','納車予定日','返却予定日','代車予定日','代車返却予定日',' 12点検予定日','車検予定日','名変予定日','引渡し','代車開始日','代車返却日',' 板金予定日',' 整備予定日','返却/12点検','車検満了日','名義変更日'],
 identity:['車番','現在使用者','DriverID','前使用者','前々使用者','フリガナ','電話番号','紹介元','所属会社名','稼働エリア','契約者メールアドレス','緊急連絡先氏名','緊急連絡先メールアドレス','ドライバーステータス','ドライバー備考'],
 protected:['VehicleID','予定反映状況','車両画像','車両フォルダ','更新日時','📄 最新車両書類','📁 車両書類フォルダ']
};
const entries=Object.entries(groups).flatMap(([group,fields])=>fields.map(field=>[field,group]));
if(entries.length!==VEHICLE_HEADERS.length||new Set(entries.map(e=>e[0])).size!==entries.length||VEHICLE_HEADERS.some(h=>!entries.some(e=>e[0]===h)))throw Error('field classification mismatch');
export const FIELD_POLICY=Object.freeze(Object.fromEntries(entries));
export const DEMO_VERIFIED_FIELDS=Object.freeze(['GPS有無','代車貸出先','代車貸出エリア','代車貸出備考']);
export function canWriteDirectly(field){return DEMO_VERIFIED_FIELDS.includes(field)&&FIELD_POLICY[field]==='ordinary';}
