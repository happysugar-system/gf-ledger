/******************************************************



 * GOLD FIRST 新システム



 * 80_スマホ画面.gs



 *



 * ・車両一覧／ドライバー一覧をキャッシュ



 * ・検索型プルダウン用データを返す



 * ・車両状態写真登録



 * ・免許証 表＋裏 登録



 ******************************************************/







const スマホ画面キャッシュ設定 = {



  車両一覧キー: 'GF_スマホ用車両一覧',



  ドライバー一覧キー: 'GF_スマホ用ドライバー一覧',



  保存秒数: 21600



};







function スマホ用キャッシュキー_(基本キー) {



  const ClientID = String(



    システム設定.ClientID || ''



  ).trim();







  if (!ClientID) {



    throw new Error('ClientIDが設定されていません。');



  }







  return 基本キー + '_' + ClientID;



}







function doGet() {



  return HtmlService



    .createTemplateFromFile('80_スマホ画面_HTML_免許証追加版')



    .evaluate()



    .setTitle('GOLD FIRST 管理')



    .addMetaTag('viewport', 'width=device-width, initial-scale=1');



}











/******************************************************



 * 車両一覧



 ******************************************************/







function スマホ用車両一覧を取得する() {
  // 車両候補は毎回、現在の「車両台帳」から直接取得する。
  // ブック切替前の古いキャッシュで候補0件になるのを防ぐ。
  return スマホ用車両一覧を作成する_();
}











function スマホ用車両一覧を作成する_() {







  const ブック = 対象スプレッドシートを開く_();







  const 台帳 = 必須シートを取得する_(



    ブック,



    シート名.車両台帳



  );







  const 最終行 = 台帳.getLastRow();



  const 最終列 = 台帳.getLastColumn();







  if (最終行 < 2 || 最終列 < 1) return [];







  // 全データを一括取得



  const 全データ = 台帳



    .getRange(1, 1, 最終行, 最終列)



    .getDisplayValues();







  const 見出し = 全データ[0].map(v =>



    String(v || '').trim()



  );







  const VehicleID列 = 見出し.indexOf('VehicleID');



  const 管轄列 = 見出し.indexOf('管轄');



  const 車番列 = 見出し.indexOf('車番');



  const 現在使用者列 = 見出し.indexOf('現在使用者');







  if (VehicleID列 < 0 || 車番列 < 0) {
    throw new Error(
      '車両台帳にVehicleIDまたは車番列がありません。'
    );
  }

  // コピー元の既存車両でVehicleIDが空でも候補に出せるよう、
  // 車番がある既存行には元30と同じ発番ルールでVehicleIDを補完する。
  let ID補完あり = false;
  for (let i = 1; i < 全データ.length; i++) {
    const 行 = 全データ[i];
    const 車番 = String(行[車番列] || '').trim();
    let VehicleID = String(行[VehicleID列] || '').trim();
    if (!車番 || VehicleID) continue;

    VehicleID = 次のIDを発番する_(台帳, 'VehicleID', 車両ID設定);
    台帳.getRange(i + 1, VehicleID列 + 1).setValue(VehicleID);
    行[VehicleID列] = VehicleID;
    ID補完あり = true;
  }
  if (ID補完あり) SpreadsheetApp.flush();

  const 一覧 = [];







  for (let i = 1; i < 全データ.length; i++) {







    const 行 = 全データ[i];







    const VehicleID = String(



      行[VehicleID列] || ''



    ).trim();







    const 管轄 =



      管轄列 >= 0



        ? String(行[管轄列] || '').trim()



        : '';







    const 車番 = String(



      行[車番列] || ''



    ).trim();







    const 現在使用者 =



      現在使用者列 >= 0



        ? String(行[現在使用者列] || '').trim()



        : '';







    if (!VehicleID || !車番) continue;







    一覧.push({



      VehicleID: VehicleID,



      管轄: 管轄,



      車番: 車番,



      現在使用者: 現在使用者,







      // スマホ候補に表示する文字



      表示名:



        (管轄 ? 管轄 + ' ｜ ' : '') +



        車番 +



        (現在使用者



          ? ' ｜ ' + 現在使用者



          : '')



    });



  }







  // 車番順



  一覧.sort((a, b) =>



    a.車番.localeCompare(



      b.車番,



      'ja',



      { numeric: true }



    )



  );







  console.log(



    'スマホ用車両一覧作成完了：' +



    一覧.length +



    '台'



  );







  return 一覧;



}















/******************************************************



 * ドライバー一覧



 ******************************************************/







function スマホ用ドライバー一覧を取得する() {



  return キャッシュ付き一覧を取得する_(



    スマホ画面キャッシュ設定.ドライバー一覧キー,



    スマホ用ドライバー一覧を作成する_



  );



}







function スマホ用ドライバー一覧を作成する_() {



  const ブック = 対象スプレッドシートを開く_();







  const マスター = 必須シートを取得する_(



    ブック,



    シート名.ドライバーマスター



  );







  if (マスター.getLastRow() < 2) return [];







  const 一覧 = [];







  for (



    let 行 = 2;



    行 <= マスター.getLastRow();



    行++



  ) {



    const データ = 行データを取得する_(



      マスター,



      行



    );







    const DriverID = String(



      データ['DriverID'] || ''



    ).trim();







    const 氏名 = String(



      データ['氏名'] || ''



    ).trim();







    const フリガナ = String(



      データ['フリガナ'] || ''



    ).trim();







    const 電話番号 = String(



      データ['電話番号'] || ''



    ).trim();







    const ステータス = String(



      データ['ステータス'] || ''



    ).trim();







    if (!DriverID || !氏名) continue;







    一覧.push({



      DriverID: DriverID,



      氏名: 氏名,



      フリガナ: フリガナ,



      電話番号: 電話番号,



      ステータス: ステータス,



      表示名:



        氏名 +



        (フリガナ ? ' ｜ ' + フリガナ : '')



    });



  }







  一覧.sort((a, b) =>



    a.氏名.localeCompare(b.氏名, 'ja')



  );







  return 一覧;



}











/******************************************************



 * キャッシュ



 ******************************************************/







function キャッシュ付き一覧を取得する_(基本キー, 作成関数) {



  const キャッシュ = CacheService.getScriptCache();



  const キー = スマホ用キャッシュキー_(基本キー);







  const 保存値 = キャッシュ.get(キー);







  if (保存値) {



    try {



      return JSON.parse(保存値);



    } catch (エラー) {



      キャッシュ.remove(キー);



    }



  }







  const 一覧 = 作成関数();







  try {



    キャッシュ.put(



      キー,



      JSON.stringify(一覧),



      スマホ画面キャッシュ設定.保存秒数



    );



  } catch (エラー) {



    console.warn(



      '一覧キャッシュ保存失敗: ' + エラー.message



    );



  }







  return 一覧;



}











function スマホ用車両一覧キャッシュを削除する_() {



  const キー = スマホ用キャッシュキー_(



    スマホ画面キャッシュ設定.車両一覧キー



  );







  CacheService



    .getScriptCache()



    .remove(キー);



}











function スマホ用ドライバー一覧キャッシュを削除する_() {



  const キー = スマホ用キャッシュキー_(



    スマホ画面キャッシュ設定.ドライバー一覧キー



  );







  CacheService



    .getScriptCache()



    .remove(キー);



}











function スマホ用一覧キャッシュを更新する() {



  const キャッシュ = CacheService.getScriptCache();







  const 車両キー = スマホ用キャッシュキー_(



    スマホ画面キャッシュ設定.車両一覧キー



  );







  const ドライバーキー = スマホ用キャッシュキー_(



    スマホ画面キャッシュ設定.ドライバー一覧キー



  );







  キャッシュ.remove(車両キー);



  キャッシュ.remove(ドライバーキー);







  const 車両 = スマホ用車両一覧を取得する();







  const ドライバー =



    スマホ用ドライバー一覧を取得する();







  return (



    'キャッシュ更新完了 / ' +



    システム設定.ClientID +



    ' / 車両 ' +



    車両.length +



    '台 / ドライバー ' +



    ドライバー.length +



    '名'



  );



}











/******************************************************



 * 車両状態写真



 ******************************************************/







/**



 * スマホから車両状態写真を登録する



 *



 * ・HTML側から5枚ずつ送信する想定



 * ・撮影日はユーザー指定可能



 * ・指定がなければ今日



 * ・同じVehicleID＋同じ撮影日なら



 *   70_車両写真.gs 側で同じ日付フォルダを再利用



 */



function スマホから車両状態写真を登録する(



  VehicleID,



  写真一覧,



  撮影日



) {



  const 対象ID = String(VehicleID || '').trim();







  if (!対象ID) {



    throw new Error('車両を選択してください。');



  }







  if (



    !Array.isArray(写真一覧) ||



    写真一覧.length === 0



  ) {



    throw new Error(



      '写真を1枚以上選択してください。'



    );



  }







  // 1回の通信は5枚まで



  if (写真一覧.length > 5) {



    throw new Error(



      '写真は1回5枚までにしてください。'



    );



  }







  const Blob一覧 = 写真一覧.map((写真, i) => {



    const Base64 = String(写真.Base64 || '');







    if (!Base64) {



      throw new Error(



        (i + 1) +



        '枚目の写真データが空です。'



      );



    }







    return Utilities.newBlob(



      Utilities.base64Decode(Base64),



      String(



        写真.MIMEタイプ || 'image/jpeg'



      ),



      String(



        写真.ファイル名 || ''



      ).trim() ||



      ('写真_' + (i + 1) + '.jpg')



    );



  });







  // 撮影日が指定されていればその日、



  // なければ今日



  const 保存日 = 撮影日



  ? 日付文字列をDateにする_(撮影日)



  : new Date();







  const 結果 = 車両状態写真を保存する_(



    対象ID,



    Blob一覧,



    保存日



  );







  return {



    成功: true,



    VehicleID: 結果.VehicleID,



    撮影日: 結果.撮影日,



    保存枚数: 結果.保存枚数,



    日付フォルダURL: 結果.日付フォルダURL,







    // HTML側で各5枚分を最後に合体させる



    取消情報: {



      種類: '車両写真',



      ファイルID一覧:



        (結果.ファイル || [])



          .map(x => x.ファイルID)



          .filter(Boolean)



    }



  };



}







function テスト_スマホ車両一覧作成() {



  const 一覧 = スマホ用車両一覧を作成する_();







  console.log('取得台数=' + 一覧.length);



  console.log(JSON.stringify(一覧.slice(0, 5)));







  return 一覧.length;



}







/******************************************************



 * 車両状態写真



 * 直前登録を取り消す



 ******************************************************/



function スマホから車両写真登録を取り消す(取消情報) {







  if (!取消情報) {



    throw new Error('取り消し情報がありません。');



  }







  const VehicleID =



    String(取消情報.VehicleID || '').trim();







  const 撮影日 =



    String(取消情報.撮影日 || '').trim();







  const ファイルID一覧 =



    Array.isArray(取消情報.ファイルID一覧)



      ? 取消情報.ファイルID一覧



      : [];







  if (!VehicleID) {



    throw new Error(



      '取り消し対象のVehicleIDがありません。'



    );



  }







  if (!撮影日) {



    throw new Error(



      '取り消し対象の撮影日がありません。'



    );



  }











  /****************************************************



   * ① 今回登録した写真だけ削除



   ****************************************************/







  ファイルID一覧.forEach(id => {







    try {







      DriveApp



        .getFileById(id)



        .setTrashed(true);







    } catch (e) {







      console.log(



        '写真削除スキップ / ' +



        id +



        ' / ' +



        e.message



      );



    }







  });











  /****************************************************



   * ② 車両状態画像の親フォルダを取得



   *



   * 車両状況に入っている最新/前回リンクではなく、



   * 車両Driveから正しい親フォルダを取得する



   ****************************************************/







  const ss =



    対象スプレッドシートを開く_();







  const 車両台帳 =



    必須シートを取得する_(



      ss,



      シート名.車両台帳



    );







  const 車両行 =



    IDで行を探す_(



      車両台帳,



      'VehicleID',



      VehicleID



    );







  if (!車両行) {



    throw new Error(



      'VehicleID=' +



      VehicleID +



      ' が車両台帳にありません。'



    );



  }







  const 車両データ =



    行データを取得する_(



      車両台帳,



      車両行



    );







  const 車番 =



    String(



      車両データ['車番'] || ''



    ).trim();







  if (!車番) {



    throw new Error(



      '車番を取得できません。'



    );



  }











  // 既存の正式な車両フォルダ取得処理を使用



  // 既存の車両DriveをVehicleID基準で取得



const 親フォルダ = Drive親フォルダを取得する_();







const 車両ルート =



  子フォルダを取得または作成する_(



    親フォルダ,



    '01_車両'



  );







const 車両フォルダ =



  ID付きフォルダを取得または作成する_(



    車両ルート,



    VehicleID,



    車番



  );







const 車両状態親フォルダ =



  子フォルダを取得または作成する_(



    車両フォルダ,



    '車両状態画像'



  );







  console.log(



    '【写真取消確認】VehicleID=' + VehicleID +



    ' / 撮影日=' + 撮影日 +



    ' / 親フォルダ=' + 車両状態親フォルダ.getName() +



    ' / 親フォルダID=' + 車両状態親フォルダ.getId()



  );







  const 確認用フォルダ一覧 =



    車両状態親フォルダ.getFolders();







  while (確認用フォルダ一覧.hasNext()) {







    const f = 確認用フォルダ一覧.next();







    console.log(



      '【日付フォルダ確認】名前=' +



      f.getName() +



      ' / ID=' +



      f.getId()



    );



  }











   /****************************************************



   * ③ 今回の日付フォルダを確認



   * 今回削除したファイル以外が残っていなければ



   * 日付フォルダ自体をゴミ箱へ



   ****************************************************/







  const 削除対象ID =



    new Set(



      ファイルID一覧.map(id =>



        String(id || '').trim()



      )



    );







  const 日付フォルダ群 =



    車両状態親フォルダ



      .getFoldersByName(撮影日);







  while (日付フォルダ群.hasNext()) {







    const 日付フォルダ =



      日付フォルダ群.next();







    const ファイル群 =



      日付フォルダ.getFiles();







    let 残っているファイルあり = false;







    while (ファイル群.hasNext()) {







      const ファイル =



        ファイル群.next();







      const ファイルID =



        String(



          ファイル.getId() || ''



        ).trim();







      // 今回取り消した写真は残存扱いしない



      if (削除対象ID.has(ファイルID)) {



        continue;



      }







      残っているファイルあり = true;



      break;



    }







    if (!残っているファイルあり) {







      日付フォルダ.setTrashed(true);







      console.log(



        '空の日付フォルダを削除 / ' +



        VehicleID +



        ' / ' +



        撮影日



      );



    }



  }











  /****************************************************



   * ④ 最新・前回を再計算



   ****************************************************/







  const 車両状況 =



    必須シートを取得する_(



      ss,



      シート名.車両状況



    );







  車両状態フォルダリンクを更新する_(



    ss,



    車両状況,



    VehicleID,



    車両状態親フォルダ



  );











  /****************************************************



   * ⑤ 利用者管理へ確実に反映



   ****************************************************/







  車両写真リンクを利用者管理へ同期する();







  SpreadsheetApp.flush();











  return {



    成功: true,



    VehicleID: VehicleID,



    撮影日: 撮影日,



    削除枚数: ファイルID一覧.length



  };



}







/******************************************************



 * スマホ候補キャッシュ 自動更新トリガー



 * ・1時間おきに最新の車両／ドライバー一覧を再生成



 * ・同じトリガーが重複しないように作り直す



 ******************************************************/







function スマホ用一覧キャッシュ自動更新トリガーを設定する() {







  const 関数名 = 'スマホ用一覧キャッシュを更新する';







  // 同じトリガーがあれば一度削除



  ScriptApp.getProjectTriggers().forEach(trigger => {



    if (



      trigger.getHandlerFunction() === 関数名 &&



      trigger.getEventType() === ScriptApp.EventType.CLOCK



    ) {



      ScriptApp.deleteTrigger(trigger);



    }



  });







  // 1時間おき



  ScriptApp



    .newTrigger(関数名)



    .timeBased()



    .everyHours(1)



    .create();







  return 'スマホ候補キャッシュ：1時間おき自動更新を設定しました';



}



/**

 * ============================================================

 * スマホ初期データを1回の通信でまとめて返す

 * ============================================================

 */

function スマホ初期データを取得する() {

  const now = new Date();

  const ym =

    now.getFullYear() + '-' +

    String(now.getMonth() + 1).padStart(2, '0');



  return {

    cars: スマホ用車両一覧を取得する(),

    drivers: スマホ用ドライバー一覧を取得する(),

    planTypes: スマホ用予定種類一覧を取得する(),

    scheduleYm: ym,

    schedule: スマホ用統合予定一覧を取得する(ym)

  };

}

function img書類(file, 回転角度=0){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();

    reader.onerror=()=>reject(new Error('書類画像の読込に失敗しました'));

    reader.onload=()=>{
      const raw=String(reader.result||'');
      const angle=[0,90,180,270].includes(Number(回転角度))
        ? Number(回転角度)
        : 0;

      const image=new Image();
      image.onerror=()=>reject(new Error('書類画像を開けませんでした'));

      image.onload=()=>{
        try{
          /*
           * 保存/PDF用は高解像度優先。
           * AI用の軽量化は imgAI() 側だけで行う。
           *
           * ここでは:
           * 1. 元解像度のままEXIF正規化・必要な回転
           * 2. 外側余白だけトリミング
           * 3. 縮小しない
           * 4. JPEG再圧縮を避け、PNGで書き出す
           */
          const srcW=Math.max(1,image.naturalWidth||image.width);
          const srcH=Math.max(1,image.naturalHeight||image.height);
          const swap=angle===90||angle===270;

          const rotated=document.createElement('canvas');
          rotated.width=swap?srcH:srcW;
          rotated.height=swap?srcW:srcH;

          const rctx=rotated.getContext('2d',{
            willReadFrequently:true
          });
          if(!rctx)throw new Error('画像回転を準備できませんでした');

          if(angle===90){
            rctx.translate(rotated.width,0);
            rctx.rotate(Math.PI/2);
          }else if(angle===180){
            rctx.translate(rotated.width,rotated.height);
            rctx.rotate(Math.PI);
          }else if(angle===270){
            rctx.translate(0,rotated.height);
            rctx.rotate(-Math.PI/2);
          }

          rctx.drawImage(image,0,0);

          // 元解像度のまま、外側余白だけを切る
          const output=書類画像の外側余白を切る_(rotated);

          /*
           * 重要:
           * 長辺2200pxへの縮小はしない。
           * JPEG 0.94再圧縮もしない。
           * PNGで文字・罫線をできるだけ保持する。
           */
          const dataURL=output.toDataURL('image/png');
          const comma=dataURL.indexOf(',');

          if(comma<0){
            throw new Error('書類画像をPNG化できませんでした');
          }

          resolve({
            ファイル名:String(file.name||'書類')
              .replace(/\.[^.]+$/,'')+'_正位置_高画質.png',
            MIMEタイプ:'image/png',
            Base64:dataURL.slice(comma+1)
          });

        }catch(e){
          reject(e);
        }
      };

      image.src=raw;
    };

    reader.readAsDataURL(file);
  });
}


/*
 * 書類画像の外側余白を自動トリミングする。
 *
 * ・元解像度は落とさない
 * ・四隅から外側背景を推定
 * ・文字1本やノイズだけでは境界扱いしない
 * ・検出範囲の外へ約3%の安全余白を戻す
 * ・判定が怪しい画像は切らずにそのまま返す
 */
function 書類画像の外側余白を切る_(source){

  const w=source.width;
  const h=source.height;

  if(w<200||h<200){
    return source;
  }

  const ctx=source.getContext('2d',{
    willReadFrequently:true
  });

  if(!ctx){
    return source;
  }

  const data=ctx.getImageData(0,0,w,h).data;

  function pixel(x,y){
    x=Math.max(0,Math.min(w-1,Math.round(x)));
    y=Math.max(0,Math.min(h-1,Math.round(y)));

    const i=(y*w+x)*4;

    return [
      data[i],
      data[i+1],
      data[i+2]
    ];
  }

  const insetX=Math.max(2,Math.round(w*0.015));
  const insetY=Math.max(2,Math.round(h*0.015));

  const samples=[
    pixel(insetX,insetY),
    pixel(w-1-insetX,insetY),
    pixel(insetX,h-1-insetY),
    pixel(w-1-insetX,h-1-insetY),

    pixel(w*0.05,h*0.05),
    pixel(w*0.95,h*0.05),
    pixel(w*0.05,h*0.95),
    pixel(w*0.95,h*0.95)
  ];

  function median(values){
    const a=values.slice().sort((a,b)=>a-b);
    return a[Math.floor(a.length/2)];
  }

  const bg=[
    median(samples.map(v=>v[0])),
    median(samples.map(v=>v[1])),
    median(samples.map(v=>v[2]))
  ];

  function isForeground(x,y){
    const p=pixel(x,y);

    const dr=Math.abs(p[0]-bg[0]);
    const dg=Math.abs(p[1]-bg[1]);
    const db=Math.abs(p[2]-bg[2]);

    return (
      Math.max(dr,dg,db)>38 ||
      (dr+dg+db)/3>24
    );
  }

  // 判定だけ間引く。出力画像そのものは縮小しない。
  const stepX=Math.max(2,Math.floor(w/500));
  const stepY=Math.max(2,Math.floor(h/500));

  const rowScore=[];
  const colScore=[];

  for(let y=0;y<h;y+=stepY){
    let fg=0;
    let total=0;

    for(let x=0;x<w;x+=stepX){
      total++;
      if(isForeground(x,y))fg++;
    }

    rowScore.push({
      pos:y,
      rate:total?fg/total:0
    });
  }

  for(let x=0;x<w;x+=stepX){
    let fg=0;
    let total=0;

    for(let y=0;y<h;y+=stepY){
      total++;
      if(isForeground(x,y))fg++;
    }

    colScore.push({
      pos:x,
      rate:total?fg/total:0
    });
  }

  const requiredRate=0.04;

  const rows=rowScore.filter(v=>v.rate>=requiredRate);
  const cols=colScore.filter(v=>v.rate>=requiredRate);

  if(!rows.length||!cols.length){
    return source;
  }

  let top=rows[0].pos;
  let bottom=rows[rows.length-1].pos;
  let left=cols[0].pos;
  let right=cols[cols.length-1].pos;

  const padX=Math.round(w*0.03);
  const padY=Math.round(h*0.03);

  left=Math.max(0,left-padX);
  right=Math.min(w-1,right+padX);
  top=Math.max(0,top-padY);
  bottom=Math.min(h-1,bottom+padY);

  const cropW=right-left+1;
  const cropH=bottom-top+1;

  // 誤検出時は元画像を守る
  if(
    cropW<w*0.20 ||
    cropH<h*0.20
  ){
    return source;
  }

  if(
    cropW>w*0.96 &&
    cropH>h*0.96
  ){
    return source;
  }

  const out=document.createElement('canvas');
  out.width=Math.max(1,Math.round(cropW));
  out.height=Math.max(1,Math.round(cropH));

  const octx=out.getContext('2d');
  if(!octx){
    return source;
  }

  octx.drawImage(
    source,
    left,top,cropW,cropH,
    0,0,out.width,out.height
  );

  return out;
}



/*
 * 書類画像の外側余白を自動トリミングする。
 *
 * ポイント:
 * ・四隅の色から「外側背景」を推定
 * ・1画素のノイズでは切らない
 * ・行/列の一定割合に前景がある場所を境界とする
 * ・検出が怪しい時は元画像をそのまま返す
 */
function 書類画像の外側余白を切る_(source){

  const w=source.width;
  const h=source.height;

  // 小さすぎる画像は触らない
  if(w<200||h<200){
    return source;
  }

  const ctx=source.getContext('2d',{
    willReadFrequently:true
  });

  if(!ctx){
    return source;
  }

  const data=ctx.getImageData(0,0,w,h).data;

  function pixel(x,y){
    const i=(y*w+x)*4;
    return [
      data[i],
      data[i+1],
      data[i+2]
    ];
  }

  /*
   * 画像の本当の角1点だけだと影や指の影響を受けるので、
   * 四隅の内側数点を背景候補として使う。
   */
  const insetX=Math.max(2,Math.round(w*0.015));
  const insetY=Math.max(2,Math.round(h*0.015));

  const samples=[
    pixel(insetX,insetY),
    pixel(w-1-insetX,insetY),
    pixel(insetX,h-1-insetY),
    pixel(w-1-insetX,h-1-insetY),

    pixel(Math.round(w*0.05),Math.round(h*0.05)),
    pixel(Math.round(w*0.95),Math.round(h*0.05)),
    pixel(Math.round(w*0.05),Math.round(h*0.95)),
    pixel(Math.round(w*0.95),Math.round(h*0.95))
  ];

  function median(values){
    const a=values.slice().sort((a,b)=>a-b);
    return a[Math.floor(a.length/2)];
  }

  const bg=[
    median(samples.map(v=>v[0])),
    median(samples.map(v=>v[1])),
    median(samples.map(v=>v[2]))
  ];

  /*
   * 背景との差。
   * 明るさ差だけでなくRGB差も見る。
   */
  function isForeground(x,y){
    const p=pixel(x,y);

    const dr=Math.abs(p[0]-bg[0]);
    const dg=Math.abs(p[1]-bg[1]);
    const db=Math.abs(p[2]-bg[2]);

    const maxDiff=Math.max(dr,dg,db);
    const avgDiff=(dr+dg+db)/3;

    return maxDiff>38 || avgDiff>24;
  }

  /*
   * 高解像度写真を全画素走査するとスマホで重くなるため、
   * 約500×500以下になる間隔でサンプリングする。
   */
  const stepX=Math.max(2,Math.floor(w/500));
  const stepY=Math.max(2,Math.floor(h/500));

  const rowScore=[];
  const colScore=[];

  for(let y=0;y<h;y+=stepY){
    let fg=0;
    let total=0;

    for(let x=0;x<w;x+=stepX){
      total++;
      if(isForeground(x,y))fg++;
    }

    rowScore.push({
      pos:y,
      rate:total?fg/total:0
    });
  }

  for(let x=0;x<w;x+=stepX){
    let fg=0;
    let total=0;

    for(let y=0;y<h;y+=stepY){
      total++;
      if(isForeground(x,y))fg++;
    }

    colScore.push({
      pos:x,
      rate:total?fg/total:0
    });
  }

  /*
   * 文字1本やゴミではなく、
   * その行/列の4%以上に背景と違うものがある場所を
   * 書類領域の候補とする。
   */
  const requiredRate=0.04;

  const rows=rowScore.filter(v=>v.rate>=requiredRate);
  const cols=colScore.filter(v=>v.rate>=requiredRate);

  if(!rows.length||!cols.length){
    return source;
  }

  let top=rows[0].pos;
  let bottom=rows[rows.length-1].pos;
  let left=cols[0].pos;
  let right=cols[cols.length-1].pos;

  /*
   * 書類の端を切らないため、検出範囲の外へ余白を戻す。
   */
  const padX=Math.round(w*0.03);
  const padY=Math.round(h*0.03);

  left=Math.max(0,left-padX);
  right=Math.min(w-1,right+padX);
  top=Math.max(0,top-padY);
  bottom=Math.min(h-1,bottom+padY);

  const cropW=right-left+1;
  const cropH=bottom-top+1;

  /*
   * 安全装置:
   * ・小さすぎる範囲しか見つからない
   * ・ほぼ元画像と同じ
   * の場合は無理に切らない。
   */
  if(
    cropW<w*0.20 ||
    cropH<h*0.20
  ){
    return source;
  }

  if(
    cropW>w*0.96 &&
    cropH>h*0.96
  ){
    return source;
  }

  const out=document.createElement('canvas');
  out.width=Math.max(1,Math.round(cropW));
  out.height=Math.max(1,Math.round(cropH));

  const octx=out.getContext('2d');
  if(!octx){
    return source;
  }

  octx.drawImage(
    source,
    left,top,cropW,cropH,
    0,0,out.width,out.height
  );

  return out;
}

