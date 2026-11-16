/* 一间小馆 · 数据表（常量、区域、物品目录、菜谱、人物模板）
 * 纯数据，不依赖 DOM；浏览器和 Node（tools/balance.js）共用。 */
(function (root) {
  'use strict';
  const MR = (root.MR = root.MR || {});

  MR.C = {
    COLS: 20,
    ROWS: 12,
    START_CASH: 3000,
    BUYOUT: 24000,
    RENT_BASE: 800,
    RENT_STEP: 120,
    SELL_RATIO: 0.5,
    // 一天的时间轴（单位：游戏分钟，从 0:00 起算）
    DAY_START: 630, // 10:30 员工到店、备菜
    LUNCH_START: 660, // 11:00
    LUNCH_END: 810, // 13:30
    DINNER_START: 1020, // 17:00
    DINNER_END: 1230, // 20:30
    DAY_END: 1320, // 22:00 日结；周日此刻扣租
    LAST_ORDER: 20, // 收市前 20 分钟不再进客
    STAFF_SPEED: 3.3, // 格 / 游戏分钟
    GUEST_SPEED: 2.3,
    MAX_STAFF: 5, // 不含店主
    MAX_QUEUE: 4,
    DOOR: { x: 4, y: 10 },
    STREET_Y: 11,
    KITCHEN_DOORS: [
      { x: 5, y: 4 },
      { x: 6, y: 4 },
    ],
    // 门口两侧不许摆东西（挡门）
    KEEP_CLEAR: [
      { x: 5, y: 3 },
      { x: 6, y: 3 },
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 4, y: 9 },
    ],
    WEEKDAYS: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  };

  // 承租范围。kind 决定能摆哪类物品；price 为一次性空间解锁费。
  MR.ZONES = [
    { id: 'kitchen', name: '后厨', kind: 'kitchen', x0: 3, y0: 0, x1: 10, y1: 3, price: 0 },
    { id: 'dining', name: '堂食', kind: 'dining', x0: 0, y0: 5, x1: 11, y1: 9, price: 0 },
    { id: 'storage', name: '储藏间', kind: 'kitchen', x0: 0, y0: 0, x1: 2, y1: 3, price: 1200 },
    { id: 'yard', name: '后院座位', kind: 'dining', x0: 12, y0: 5, x1: 19, y1: 9, price: 2000 },
    { id: 'kitchen2', name: '扩大后厨', kind: 'kitchen', x0: 11, y0: 0, x1: 19, y1: 3, price: 2500 },
  ];

  MR.INGREDIENTS = {
    veg: { name: '蔬菜', price: 2, life: 2.5, cold: 'fridge' },
    egg: { name: '鸡蛋', price: 2, life: 6, cold: 'fridge' },
    rice: { name: '米面', price: 2, life: 12, cold: null },
    meat: { name: '鲜肉', price: 6, life: 2, cold: 'freezer' },
    fish: { name: '鲜鱼', price: 10, life: 1.2, cold: 'freezer' },
    tea: { name: '茶果', price: 3, life: 8, cold: 'fridge' },
  };
  MR.ING_ORDER = ['veg', 'egg', 'rice', 'meat', 'fish', 'tea'];

  // 工作类别（优先级表的行）。skill 为主要关联技能。
  MR.JOBS = {
    wash: { name: '洗菜', icon: '洗', skill: 'clean' },
    cut: { name: '切菜', icon: '切', skill: 'knife' },
    cook: { name: '烹饪', icon: '炒', skill: 'fire' },
    plate: { name: '摆盘', icon: '盘', skill: 'plate' },
    serve: { name: '上菜', icon: '送', skill: 'serve' },
    order: { name: '点单', icon: '点', skill: 'serve' },
    cash: { name: '收银', icon: '收', skill: 'cash' },
    drink: { name: '调饮', icon: '饮', skill: 'drink' },
    clean: { name: '清洁', icon: '扫', skill: 'clean' },
    repair: { name: '修理', icon: '修', skill: 'repair' },
    research: { name: '研发', icon: '研', skill: 'research' },
  };
  // 同一优先级内，先清下游（拉动式），避免做好的菜凉在台上。
  MR.JOB_ORDER = ['serve', 'plate', 'cash', 'order', 'cook', 'cut', 'wash', 'drink', 'clean', 'repair', 'research'];

  MR.SKILLS = {
    knife: '刀工',
    fire: '火候',
    season: '调味',
    plate: '摆盘',
    drink: '饮品',
    serve: '招待',
    cash: '收银',
    clean: '清洁',
    repair: '修理',
    research: '研发',
  };

  MR.TRAITS = {
    hasty: { name: '急性子', desc: '手脚快 20%，但火候容易漂（-8）' },
    chatty: { name: '话痨', desc: '招待 +10，偶尔停下来跟客人聊天' },
    tidy: { name: '洁癖', desc: '打扫快 40%，看到脏乱心情掉得更猛' },
    steady: { name: '稳重', desc: '火候 +6，动作慢 8%' },
    diligent: { name: '勤快', desc: '体力消耗少 25%' },
    deft: { name: '手巧', desc: '刀工与摆盘 +6' },
  };

  /* 建造目录。
   * tiers: 各档累计价值（实用 / 专业 / 名工），升档只补差价。
   * station: 该物品提供的工位类型。zone: 可摆放的区域类别。 */
  MR.ITEMS = {
    table2: { name: '双人桌椅', cat: '堂食', price: 280, zone: 'dining', seats: 2, desc: '+2 座位，直接提高接待上限', rot: true },
    table4: { name: '四人桌椅', cat: '堂食', price: 520, zone: 'dining', seats: 4, desc: '+4 座位，占地更大，能接三四人的聚餐客', rot: true },
    counter: { name: '收银台', cat: '堂食', price: 450, zone: 'dining', station: 'counter', desc: '客人吃完到前台结账，桌子更早空出来；点单也更快' },
    waitchair: { name: '等待椅', cat: '堂食', price: 120, zone: 'dining', desc: '门口等位的客人更有耐心（每把 +25%，最多三把）' },

    sink: { name: '水池', cat: '后厨', price: 350, zone: 'kitchen', station: 'sink', label: '池', desc: '洗菜快 2.5 倍，食材分不再被封顶' },
    board: { name: '菜板 + 菜刀', cat: '后厨', price: 180, tiers: [180, 600, 1400], zone: 'kitchen', station: 'board', label: '砧', wear: 0.9, desc: '切菜工位。档次决定刀工上限' },
    wok: { name: '炒锅', cat: '后厨', price: 240, tiers: [240, 720, 1600], zone: 'kitchen', station: 'wok', label: '炒', wear: 1.1, desc: '炒菜要人一直守着。档次决定火候上限' },
    pan: { name: '平底锅', cat: '后厨', price: 300, tiers: [300, 780, 1600], zone: 'kitchen', station: 'pan', label: '煎', wear: 1.0, desc: '解锁「煎」的做法，同样要人守着' },
    pot: { name: '煮锅', cat: '后厨', price: 360, tiers: [360, 840, 1700], zone: 'kitchen', station: 'pot', label: '煮', wear: 0.8, desc: '解锁「煮」。下锅后不用守，但要有人及时起锅' },
    steamer: { name: '蒸锅', cat: '后厨', price: 520, tiers: [520, 1000, 1900], zone: 'kitchen', station: 'steamer', label: '蒸', wear: 0.8, desc: '解锁「蒸」。不用守，火候窗口更窄' },
    fryer: { name: '空气炸锅', cat: '后厨', price: 900, tiers: [900, 1500, 2400], zone: 'kitchen', station: 'fryer', label: '炸', wear: 0.7, desc: '解锁「炸」。不用守，出餐稳定' },
    pass: { name: '出餐台', cat: '后厨', price: 300, zone: 'kitchen', station: 'pass', label: '出', desc: '摆盘快一倍、摆盘分 +12，灶台也更早腾出来' },

    shelf: { name: '货架', cat: '仓储', price: 160, zone: 'kitchen', station: 'shelf', label: '货', cap: 30, desc: '常温仓储 30 份。放不下的只能堆地上，坏得更快' },
    fridge: { name: '冷藏柜', cat: '仓储', price: 700, zone: 'kitchen', station: 'fridge', label: '藏', cap: 40, desc: '冷藏 40 份，蔬菜蛋奶肉鱼保质期 ×2.2' },
    freezer: { name: '冷冻柜', cat: '仓储', price: 1100, zone: 'kitchen', station: 'freezer', label: '冻', cap: 40, desc: '冷冻 40 份，鲜肉和鲜鱼保质期 ×4' },

    drinkbar: { name: '饮品台', cat: '饮品甜品', price: 650, zone: 'any', station: 'drinkbar', label: '饮', wear: 0.5, desc: '带制冰和保温。出杯快一倍，手法与温度上限更高，可研发新饮品' },
    oven: { name: '小烤箱', cat: '饮品甜品', price: 800, tiers: [800, 1400, 2300], zone: 'kitchen', station: 'oven', label: '烤', wear: 0.7, desc: '支撑甜品。不用守，但要及时出炉' },

    restchair: { name: '休息椅', cat: '员工', price: 150, zone: 'any', station: 'rest', desc: '午休恢复体力更快，降低下班前崩盘' },

    plant: { name: '绿植', cat: '装修', price: 80, zone: 'any', env: 3, desc: '环境 +3' },
    lamp: { name: '落地灯', cat: '装修', price: 180, zone: 'any', env: 5, desc: '环境 +5' },
    painting: { name: '装饰画', cat: '装修', price: 260, zone: 'any', env: 7, desc: '环境 +7' },
    aquarium: { name: '鱼缸', cat: '装修', price: 400, zone: 'any', env: 10, desc: '环境 +10，在意氛围的客人会多付一点小费' },
  };
  MR.ITEM_CATS = ['堂食', '后厨', '仓储', '饮品甜品', '员工', '装修'];
  MR.TIER_NAMES = ['实用', '专业', '名工'];
  MR.TIER_BONUS = [12, 21, 29]; // 工具档次对刀工 / 火候的加成
  MR.QR_PRICE = 900;

  /* 菜谱。
   * wash / cut / cook 为各工序基础时长（游戏分钟）；attended 表示烹饪要人守着。
   * kd / fd 为刀工、火候难度。ref 为食客心里的参考价。 */
  MR.DISHES = {
    eggrice: { name: '蛋炒饭', cat: 'dish', method: '炒', station: 'wok', ing: { rice: 1, egg: 1 }, ref: 22, wash: 0, cut: 2, cook: 4.5, attended: true, kd: 6, fd: 12, pop: 1.2, start: true },
    greens: { name: '清炒时蔬', cat: 'dish', method: '炒', station: 'wok', ing: { veg: 2 }, ref: 20, wash: 3, cut: 2.5, cook: 3.5, attended: true, kd: 10, fd: 16, pop: 0.9, start: true },
    porkpepper: { name: '青椒肉丝', cat: 'dish', method: '炒', station: 'wok', ing: { veg: 1, meat: 1 }, ref: 34, wash: 2.5, cut: 4.5, cook: 5, attended: true, kd: 26, fd: 22, pop: 1.0, start: true },
    eggsoup: { name: '番茄蛋汤', cat: 'dish', method: '煮', station: 'pot', ing: { veg: 1, egg: 1 }, ref: 18, wash: 2, cut: 2, cook: 7, attended: false, kd: 8, fd: 10, pop: 0.9, research: { cost: 120, work: 45 } },
    dumpling: { name: '煎饺', cat: 'dish', method: '煎', station: 'pan', ing: { rice: 1, meat: 1 }, ref: 28, wash: 0, cut: 4, cook: 5.5, attended: true, kd: 20, fd: 26, pop: 1.1, research: { cost: 160, work: 60 } },
    braised: { name: '红烧肉', cat: 'dish', method: '煮', station: 'pot', ing: { meat: 2 }, ref: 48, wash: 2, cut: 3.5, cook: 13, attended: false, kd: 16, fd: 30, pop: 1.0, research: { cost: 260, work: 90 } },
    friedchicken: { name: '炸鸡块', cat: 'dish', method: '炸', station: 'fryer', ing: { meat: 1, rice: 1 }, ref: 34, wash: 1.5, cut: 3, cook: 7, attended: false, kd: 12, fd: 14, pop: 1.2, research: { cost: 220, work: 70 } },
    steamfish: { name: '清蒸鱼', cat: 'dish', method: '蒸', station: 'steamer', ing: { fish: 1, veg: 1 }, ref: 60, wash: 3, cut: 4, cook: 9, attended: false, kd: 30, fd: 40, pop: 0.9, research: { cost: 320, work: 110 } },
    beef: { name: '小炒黄牛肉', cat: 'dish', method: '炒', station: 'wok', ing: { meat: 2, veg: 1 }, ref: 56, wash: 2.5, cut: 5, cook: 5.5, attended: true, kd: 32, fd: 36, pop: 1.0, research: { cost: 340, work: 120 } },

    barleytea: { name: '大麦茶', cat: 'drink', method: '沏', station: 'drinkbar', ing: { tea: 1 }, ref: 10, wash: 0, cut: 0, cook: 2, attended: true, kd: 0, fd: 8, pop: 1.0, start: true },
    lemontea: { name: '手打柠檬茶', cat: 'drink', method: '摇', station: 'drinkbar', needBar: true, ing: { tea: 2 }, ref: 18, wash: 0, cut: 0, cook: 3, attended: true, kd: 0, fd: 22, pop: 1.2, research: { cost: 140, work: 50 } },

    pudding: { name: '烤布丁', cat: 'dessert', method: '烤', station: 'oven', ing: { egg: 2 }, ref: 22, wash: 0, cut: 1.5, cook: 9, attended: false, kd: 4, fd: 28, pop: 1.0, research: { cost: 180, work: 70 } },
  };
  MR.DISH_ORDER = ['eggrice', 'greens', 'porkpepper', 'eggsoup', 'dumpling', 'friedchicken', 'braised', 'steamfish', 'beef', 'barleytea', 'lemontea', 'pudding'];
  MR.CAT_NAMES = { dish: '菜品', drink: '饮品', dessert: '甜品' };

  // 五维评价：菜品 / 饮品 / 甜品各用一套名字和权重，内部都映射到同五个槽位。
  MR.DIMS = {
    dish: [
      { k: 'season', name: '调味', w: 0.2 },
      { k: 'knife', name: '刀工', w: 0.2 },
      { k: 'plate', name: '摆盘', w: 0.15 },
      { k: 'fire', name: '火候', w: 0.25 },
      { k: 'ing', name: '食材', w: 0.2 },
    ],
    drink: [
      { k: 'fire', name: '温度', w: 0.2 },
      { k: 'season', name: '配比', w: 0.25 },
      { k: 'ing', name: '新鲜度', w: 0.2 },
      { k: 'knife', name: '手法', w: 0.2 },
      { k: 'plate', name: '呈现', w: 0.15 },
    ],
    dessert: [
      { k: 'season', name: '甜度平衡', w: 0.2 },
      { k: 'fire', name: '口感', w: 0.25 },
      { k: 'plate', name: '造型', w: 0.15 },
      { k: 'knife', name: '温度', w: 0.2 },
      { k: 'ing', name: '新鲜度', w: 0.2 },
    ],
  };
  MR.TIERS = [
    { min: 90, name: '神作', key: 'god' },
    { min: 75, name: '出色', key: 'great' },
    { min: 60, name: '好', key: 'good' },
    { min: 40, name: '普通', key: 'ok' },
    { min: 0, name: '翻车', key: 'bad' },
  ];
  MR.tierOf = function (score) {
    for (const t of MR.TIERS) if (score >= t.min) return t;
    return MR.TIERS[MR.TIERS.length - 1];
  };

  // 食客类型：耐心倍率、用餐时长、看重的维度、出现时段权重。
  MR.GUEST_TYPES = {
    passerby: { name: '路人', patience: 1.0, eat: 12, focus: null, tip: 1.0, color: '#7d8fa3' },
    office: { name: '上班族', patience: 0.8, eat: 9, focus: null, tip: 0.9, color: '#5b6f8c' },
    gourmet: { name: '讲究火候的食客', patience: 1.1, eat: 14, focus: 'fire', tip: 1.4, color: '#a8663a' },
    party: { name: '聚餐客', patience: 1.15, eat: 17, focus: 'env', tip: 1.2, color: '#9b5d86' },
    family: { name: '带小孩的家庭', patience: 0.85, eat: 15, focus: null, tip: 1.0, color: '#c08a3e' },
    rester: { name: '歇脚客', patience: 0.9, eat: 12, focus: 'drink', tip: 1.0, color: '#5f9c8e' },
    critic: { name: '美食评论者', patience: 1.2, eat: 16, focus: 'fire', tip: 1.0, color: '#3d3d46' },
    regular: { name: '熟客', patience: 1.25, eat: 13, focus: null, tip: 1.3, color: '#c4504a' },
  };

  MR.NAMES = {
    staff: ['老周', '阿芳', '小满', '大刘', '春梅', '阿杰', '秀兰', '小虎', '老郑', '玉珍', '阿斌', '小雪', '建国', '阿香', '小北', '德顺'],
    regular: ['陈伯', '王姐', '小林', '老马', '眼镜张', '邱老师', '阿May', '胖哥', '孙阿姨', '夜班李', '画画的小周', '遛狗的赵叔'],
  };

  MR.ICON = { wash: '💧', cut: '🔪', cook: '🍳', plate: '🍽️', serve: '🛎️', order: '📝', cash: '💰', drink: '🍵', clean: '🧹', repair: '🔧', research: '🧪', rest: '💤', veg: '🥬', egg: '🥚', rice: '🍚', meat: '🥩', fish: '🐟', tea: '🍋' };

  MR.ACH = [
    { id: 'rent1', name: '活过第一个周日', desc: '第一次交上房租' },
    { id: 'rent1640', name: '涨租也不怕', desc: '房租涨到 ¥1,640 时交完仍有余钱' },
    { id: 'noflop', name: '稳定出品', desc: '连续两周没有一道翻车菜' },
    { id: 'apprentice', name: '学徒出师', desc: '把一名学徒的刀工或火候带到 55 以上' },
    { id: 'buyout', name: '我的店', desc: '把店铺买下来' },
  ];

  MR.rentOf = function (week) {
    return MR.C.RENT_BASE + (week - 1) * MR.C.RENT_STEP;
  };
})(typeof window !== 'undefined' ? window : globalThis);
