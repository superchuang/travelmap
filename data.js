/* =========================================================
   旅程資料檔 —— 新增旅程只要改這個檔案！
   ---------------------------------------------------------
   新增步驟：
   1. 把照片放進 images/ 資料夾（建議用英文檔名，例如 osaka-1.jpg）
   2. 複製下面任何一段 { ... }，貼在最後一段的後面
      （每段之間要用「逗號」隔開）
   3. 修改內容：
      - id      ：英文代號，不能和別趟重複
      - lat/lng ：緯度／經度。在 Google 地圖對地點按右鍵，
                  第一行數字就是「緯度, 經度」，複製過來即可
      - date    ：出發日期，格式 YYYY-MM-DD
      - endDate ：回程日期（當天來回可以刪掉這一行）
      - cover   ：封面照片（通常用第一張）
      - photos  ：照片清單，src 是路徑、caption 是照片說明
      - story   ：心得。想分段就用 \n\n 隔開
   4. 存檔、重新整理網頁就會看到新的圖釘！

   ※ 目前的旅程都是虛構的示範資料，換成你自己的就好。
   ========================================================= */

const SITE = {
  title: "我的旅行手帳",
  subtitle: "把走過的地方，一個一個釘在地圖上",
  // 出發地：地圖上的航線會從這裡飛出去（不想要航線可以刪掉這一行）
  home: { name: "台北", lat: 25.0330, lng: 121.5654 }
};

const TRIPS = [
  {
    id: "kyoto-2024",
    title: "京都・楓紅的季節",
    place: "日本・京都",
    lat: 35.0116,
    lng: 135.7681,
    date: "2024-11-20",
    endDate: "2024-11-25",
    cover: "images/kyoto-1.svg",
    photos: [
      { src: "images/kyoto-1.svg", caption: "清水寺的楓紅，人好多但值得" },
      { src: "images/kyoto-2.svg", caption: "一大早去嵐山竹林，終於拍到沒人的畫面" },
      { src: "images/kyoto-3.svg", caption: "鴨川邊坐著看夕陽" }
    ],
    story: "第一次在秋天去京都，整座城市都被染成橘紅色。清水寺的人潮多到要側身走路，但站上舞台往下看的那一刻，還是忍不住哇了一聲。\n\n最喜歡的是第三天早上六點出門去嵐山，竹林裡只有風聲和自己的腳步聲。回程在一間小店吃了湯豆腐，暖到心裡。\n\n傍晚就去鴨川邊坐著，看情侶和學生一對對沿著河岸坐好，間隔整齊得好好笑。"
  },
  {
    id: "iceland-2023",
    title: "冰島環島追極光",
    place: "冰島・雷克雅維克",
    lat: 64.1466,
    lng: -21.9426,
    date: "2023-02-08",
    endDate: "2023-02-17",
    cover: "images/iceland-2.svg",
    photos: [
      { src: "images/iceland-1.svg", caption: "傑古沙龍冰河湖，冰塊是藍色的" },
      { src: "images/iceland-2.svg", caption: "等了三個晚上，終於看到極光" },
      { src: "images/iceland-3.svg", caption: "維克的黑沙灘，風大到站不穩" }
    ],
    story: "十天自駕環島，每天都在換風景。前兩晚雲層太厚，極光預報一直是灰的，心情有點低落。\n\n第三晚在民宿外面等到快凌晨一點，天空突然出現一條淡綠色的帶子，然後越來越亮、開始流動。冷到手指沒有知覺，還是捨不得進屋。\n\n下次想在夏天再來一次，看看永晝的冰島。"
  },
  {
    id: "tainan-2025",
    title: "台南吃不停",
    place: "台灣・台南",
    lat: 22.9999,
    lng: 120.2270,
    date: "2025-04-04",
    endDate: "2025-04-06",
    cover: "images/tainan-1.svg",
    photos: [
      { src: "images/tainan-1.svg", caption: "赤崁樓" },
      { src: "images/tainan-2.svg", caption: "神農街晚上點燈超好拍" },
      { src: "images/tainan-3.svg", caption: "國華街一路吃過去" }
    ],
    story: "三天兩夜，胃從來沒有空過。早餐牛肉湯、中午碗粿、下午豆花、晚上再來一碗鱔魚意麵。\n\n神農街晚上的燈籠很有味道，老房子改成的小酒館坐起來很舒服。下次要留一天去安平看夕陽。"
  },
  {
    id: "paris-2022",
    title: "巴黎的慢步調",
    place: "法國・巴黎",
    lat: 48.8566,
    lng: 2.3522,
    date: "2022-06-12",
    endDate: "2022-06-19",
    cover: "images/paris-1.svg",
    photos: [
      { src: "images/paris-1.svg", caption: "在戰神廣場野餐，法棍＋起司＋草莓" },
      { src: "images/paris-2.svg", caption: "蒙馬特的小巷，每個轉角都像明信片" },
      { src: "images/paris-3.svg", caption: "塞納河畔的舊書攤" }
    ],
    story: "這趟刻意不排行程，每天只決定一個想去的地方，剩下的時間就隨便走。\n\n六月的巴黎晚上十點天還是亮的，大家都在河邊、公園裡坐著聊天。學著當地人買一瓶酒、一條法棍，在鐵塔下坐到天黑，看它整點閃燈。"
  },
  {
    id: "seoul-2024",
    title: "首爾櫻花季",
    place: "韓國・首爾",
    lat: 37.5665,
    lng: 126.9780,
    date: "2024-04-03",
    endDate: "2024-04-07",
    cover: "images/seoul-1.svg",
    photos: [
      { src: "images/seoul-1.svg", caption: "汝矣島的櫻花隧道" },
      { src: "images/seoul-2.svg", caption: "弘大街頭表演到半夜" },
      { src: "images/seoul-3.svg", caption: "北村韓屋村，穿韓服拍了一整個下午" }
    ],
    story: "運氣很好，剛好碰上櫻花滿開的那一週。汝矣島整條路都是粉紅色，風一吹就下起花瓣雨。\n\n晚上去弘大吃烤肉、看街頭跳舞，年輕人的活力好有感染力。最後一天去廣藏市場吃綠豆煎餅和生拌牛肉，滿足。"
  },
  {
    id: "bali-2023",
    title: "峇里島放空之旅",
    place: "印尼・峇里島",
    lat: -8.5069,
    lng: 115.2625,
    date: "2023-08-20",
    endDate: "2023-08-26",
    cover: "images/bali-1.svg",
    photos: [
      { src: "images/bali-1.svg", caption: "烏布的德格拉朗梯田" },
      { src: "images/bali-2.svg", caption: "早上在海邊散步" },
      { src: "images/bali-3.svg", caption: "烏魯瓦圖斷崖看夕陽" }
    ],
    story: "完全是為了放空而去的一趟。住在烏布稻田旁邊的小villa，早上被鳥叫醒，吃完水果早餐就在泳池邊看書。\n\n後半段搬到海邊，每天傍晚去不同的地方看夕陽。烏魯瓦圖的斷崖夕陽配上 Kecak 火舞，是整趟最難忘的畫面。"
  },
  {
    id: "newyork-2021",
    title: "紐約的秋天",
    place: "美國・紐約",
    lat: 40.7128,
    lng: -74.0060,
    date: "2021-10-15",
    endDate: "2021-10-22",
    cover: "images/newyork-1.svg",
    photos: [
      { src: "images/newyork-1.svg", caption: "中央公園的秋色" },
      { src: "images/newyork-2.svg", caption: "清晨走布魯克林大橋" },
      { src: "images/newyork-3.svg", caption: "時代廣場，晚上比白天還亮" }
    ],
    story: "一直很想看看電影裡的紐約秋天，中央公園真的就跟想像中一樣，整片金黃色。\n\n早上六點走布魯克林大橋，看太陽從曼哈頓的大樓間升起。吃了好多次一美元披薩，也去看了人生第一場百老匯。"
  },
  {
    id: "cappadocia-2025",
    title: "卡帕多奇亞熱氣球",
    place: "土耳其・卡帕多奇亞",
    lat: 38.6431,
    lng: 34.8289,
    date: "2025-09-10",
    endDate: "2025-09-13",
    cover: "images/cappadocia-1.svg",
    photos: [
      { src: "images/cappadocia-1.svg", caption: "清晨四點半起床，看上百顆熱氣球升空" },
      { src: "images/cappadocia-2.svg", caption: "像外星球一樣的奇岩群" }
    ],
    story: "為了熱氣球特地排了三個早上，結果第一天就成功飛了！升空的時候天還沒全亮，四周慢慢冒出一顆一顆熱氣球，美到不真實。\n\n住的是洞穴飯店，房間是在岩石裡挖出來的，冬暖夏涼。"
  },
  {
    id: "peru-2019",
    title: "馬丘比丘朝聖",
    place: "秘魯・庫斯科",
    lat: -13.1631,
    lng: -72.5450,
    date: "2019-07-02",
    endDate: "2019-07-12",
    cover: "images/peru-1.svg",
    photos: [
      { src: "images/peru-1.svg", caption: "終於親眼看到馬丘比丘" },
      { src: "images/peru-2.svg", caption: "路上遇到的羊駝，表情很跩" }
    ],
    story: "人生清單上的地方。在庫斯科先待了兩天適應高山，還是喘到不行，靠古柯茶撐過去。\n\n到馬丘比丘那天早上起大霧，什麼都看不見，等了一個小時霧突然散開，整座古城就出現在眼前，周圍的人都一起歡呼。"
  }
];
