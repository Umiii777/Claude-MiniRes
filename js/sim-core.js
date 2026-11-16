/* 一间小馆 · 模拟核心（状态、网格、仓储、建造、经营操作）
 * 不依赖 DOM。运行时逻辑（员工、客人、日程、事件）在 sim-run.js。 */
(function (root) {
  'use strict';
  const MR = root.MR;
  const C = MR.C;
  const sim = (MR.sim = {});
  const _ = (MR._ = {}); // 内部共享

  // ---------- 小工具 ----------
  const clamp = (_.clamp = (v, a, b) => (v < a ? a : v > b ? b : v));
  function rnd(S) {
    let t = (S.rng = (S.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  _.rnd = rnd;
  _.rint = (S, a, b) => a + Math.floor(rnd(S) * (b - a + 1));
  _.pick = (S, arr) => arr[Math.floor(rnd(S) * arr.length)];
  _.wpick = function (S, entries) {
    let sum = 0;
    for (const e of entries) sum += e[1];
    if (sum <= 0) return null;
    let r = rnd(S) * sum;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  };
  const money = (sim.money = (n) => '¥' + Math.round(n).toLocaleString('en-US'));

  function log(S, text, kind, toast) {
    S.logN = (S.logN || 0) + 1;
    S.log.push({ n: S.logN, d: S.day, m: Math.floor(S.minute), text, kind: kind || 'info', toast: !!toast });
    if (S.log.length > 120) S.log.shift();
  }
  _.log = log;
  function fx(S, o) {
    S.fx.push(o);
    if (S.fx.length > 60) S.fx.shift();
  }
  _.fx = fx;
  _.award = function (S, id) {
    if (S.ach[id]) return;
    S.ach[id] = S.day;
    const a = MR.ACH.find((o) => o.id === id);
    log(S, '成就达成：' + a.name + '（' + a.desc + '）', 'good', true);
  };

  // ---------- 日期 ----------
  sim.week = (S) => Math.ceil(S.day / 7);
  sim.dow = (S) => (S.day - 1) % 7;
  sim.rent = (S) => MR.rentOf(sim.week(S));
  sim.minutesToRent = (S) => (6 - sim.dow(S)) * 1440 + (C.DAY_END - S.minute);
  sim.afterRent = (S) => S.cash - (S.bought ? 0 : sim.rent(S));
  sim.phase = function (S) {
    const m = S.minute;
    if (m < C.LUNCH_START) return 'prep';
    if (m < C.LUNCH_END) return 'lunch';
    if (m < C.DINNER_START) return 'break';
    if (m < C.DINNER_END) return 'dinner';
    return 'close';
  };
  sim.PHASE_NAMES = { prep: '备菜', lunch: '午市', break: '午休', dinner: '晚市', close: '打烊' };
  sim.inService = (S) => {
    const p = sim.phase(S);
    return p === 'lunch' || p === 'dinner';
  };
  sim.clockText = (S) => {
    const m = Math.floor(S.minute);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  // 租金预警：0 无，1 黄（≤3 天且不够），2 红（≤1 天且不够）
  sim.rentAlert = function (S) {
    if (S.bought || S.cash >= sim.rent(S)) return 0;
    const days = sim.minutesToRent(S) / 1440;
    if (days <= 1) return 2;
    if (days <= 3) return 1;
    return 0;
  };

  // ---------- 记账 ----------
  function newDayStats() {
    return { rev: 0, tips: 0, food: 0, waste: 0, wages: 0, util: 0, fines: 0, repair: 0, build: 0, other: 0, sold: 0, groups: 0, guests: 0, walkQueue: 0, walkOrder: 0, walkFood: 0, turned: 0, noDish: 0, dishes: 0, scoreSum: 0, dim: { season: 0, knife: 0, plate: 0, fire: 0, ing: 0 }, bad: 0, god: 0, satSum: 0, satN: 0, used: {} };
  }
  _.newDayStats = newDayStats;
  function spend(S, amt, cat) {
    amt = Math.round(amt);
    S.cash -= amt;
    S.today[cat] = (S.today[cat] || 0) + amt;
    S.wk[cat] = (S.wk[cat] || 0) + amt;
  }
  _.spend = spend;
  function earn(S, amt, cat) {
    amt = Math.round(amt);
    S.cash += amt;
    S.today[cat] = (S.today[cat] || 0) + amt;
    S.wk[cat] = (S.wk[cat] || 0) + amt;
  }
  _.earn = earn;

  // ---------- 网格 ----------
  const idx = (x, y) => y * C.COLS + x;
  _.idx = idx;
  const inb = (x, y) => x >= 0 && y >= 0 && x < C.COLS && y < C.ROWS;
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  _.DIRS = DIRS;

  sim.zoneAt = function (x, y) {
    for (const z of MR.ZONES) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return z;
    return null;
  };
  function isDoor(x, y) {
    if (x === C.DOOR.x && y === C.DOOR.y) return true;
    for (const d of C.KITCHEN_DOORS) if (d.x === x && d.y === y) return true;
    return false;
  }
  sim.isDoor = isDoor;

  sim.cellsOf = function (type, x, y, rot) {
    if (type === 'table2') {
      return rot
        ? [
            { x, y, k: 3 },
            { x, y: y + 1, k: 2 },
            { x, y: y + 2, k: 3 },
          ]
        : [
            { x, y, k: 3 },
            { x: x + 1, y, k: 2 },
            { x: x + 2, y, k: 3 },
          ];
    }
    if (type === 'table4') {
      return rot
        ? [
            { x, y, k: 3 },
            { x: x + 1, y, k: 3 },
            { x, y: y + 1, k: 2 },
            { x: x + 1, y: y + 1, k: 2 },
            { x, y: y + 2, k: 3 },
            { x: x + 1, y: y + 2, k: 3 },
          ]
        : [
            { x, y, k: 3 },
            { x, y: y + 1, k: 3 },
            { x: x + 1, y, k: 2 },
            { x: x + 1, y: y + 1, k: 2 },
            { x: x + 2, y, k: 3 },
            { x: x + 2, y: y + 1, k: 3 },
          ];
    }
    return [{ x, y, k: 1 }];
  };
  const itemCells = (it) => sim.cellsOf(it.type, it.x, it.y, it.rot);
  _.itemCells = itemCells;

  // 重建占位图与可通行图。物品或区域变动后调用。
  function regrid(S) {
    const n = C.COLS * C.ROWS;
    const g = new Int32Array(n);
    const pass = new Uint8Array(n);
    for (let y = 0; y < C.ROWS; y++)
      for (let x = 0; x < C.COLS; x++) {
        let p = 0;
        if (y === C.STREET_Y) p = 1;
        else if (isDoor(x, y)) p = 1;
        else {
          const z = sim.zoneAt(x, y);
          if (z && S.zones[z.id]) p = 1;
        }
        pass[idx(x, y)] = p;
      }
    for (const it of S.items) for (const c of itemCells(it)) g[idx(c.x, c.y)] = it.id;
    S._grid = g;
    S._pass = pass;
    S._ver = (S._ver || 0) + 1;
    S._acc = {};
    S._byId = null;
  }
  _.regrid = regrid;
  const walkable = (_.walkable = (S, x, y) => inb(x, y) && S._pass[idx(x, y)] === 1 && S._grid[idx(x, y)] === 0);

  _.itemById = function (S, id) {
    if (!id) return null;
    if (!S._byId) {
      S._byId = {};
      for (const it of S.items) S._byId[it.id] = it;
    }
    return S._byId[id] || null;
  };

  // 从 (sx,sy) 出发的 BFS，返回 {dist, prev}。起点即使被占也可走出来。
  function bfs(S, sx, sy, grid) {
    const n = C.COLS * C.ROWS;
    const dist = new Int16Array(n).fill(-1);
    const prev = new Int16Array(n).fill(-1);
    const g = grid || S._grid;
    const q = new Int16Array(n);
    let h = 0,
      t = 0;
    sx = clamp(Math.round(sx), 0, C.COLS - 1);
    sy = clamp(Math.round(sy), 0, C.ROWS - 1);
    const s = idx(sx, sy);
    dist[s] = 0;
    q[t++] = s;
    while (h < t) {
      const c = q[h++];
      const cx = c % C.COLS,
        cy = (c - cx) / C.COLS;
      for (const d of DIRS) {
        const nx = cx + d[0],
          ny = cy + d[1];
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (dist[ni] >= 0 || S._pass[ni] !== 1 || g[ni] !== 0) continue;
        dist[ni] = dist[c] + 1;
        prev[ni] = c;
        q[t++] = ni;
      }
    }
    return { dist, prev, sx, sy };
  }
  _.bfs = bfs;
  function pathFrom(map, tx, ty) {
    const out = [];
    let c = idx(tx, ty);
    if (map.dist[c] < 0) return null;
    while (map.prev[c] >= 0) {
      out.push({ x: c % C.COLS, y: Math.floor(c / C.COLS) });
      c = map.prev[c];
    }
    return out.reverse();
  }
  _.pathFrom = pathFrom;

  // 物品周围可站人的格子（桌子只算桌面四周，不算椅子）。
  function accessTiles(S, it) {
    if (S._acc[it.id]) return S._acc[it.id];
    const out = [];
    const isTable = it.type === 'table2' || it.type === 'table4';
    for (const c of itemCells(it)) {
      if (isTable && c.k !== 2) continue;
      for (const d of DIRS) {
        const x = c.x + d[0],
          y = c.y + d[1];
        if (walkable(S, x, y) && !out.some((o) => o.x === x && o.y === y)) out.push({ x, y });
      }
    }
    S._acc[it.id] = out;
    return out;
  }
  _.accessTiles = accessTiles;
  // 在 BFS 图里找离起点最近的站位
  _.standAt = function (S, it, map, avoid) {
    let best = null;
    for (const a of accessTiles(S, it)) {
      const d = map.dist[idx(a.x, a.y)];
      if (d < 0) continue;
      const pen = avoid && avoid.x === a.x && avoid.y === a.y ? 50 : 0;
      if (!best || d + pen < best.d) best = { x: a.x, y: a.y, d: d + pen };
    }
    return best;
  };

  // ---------- 建造 ----------
  const HEAT = { wok: 1, pan: 1, pot: 1, steamer: 1, fryer: 1, oven: 1 };
  sim.canPlace = function (S, type, x, y, rot, ignoreId) {
    const def = MR.ITEMS[type];
    const cells = sim.cellsOf(type, x, y, rot);
    for (const c of cells) {
      if (!inb(c.x, c.y)) return { ok: false, why: '超出店面' };
      const z = sim.zoneAt(c.x, c.y);
      if (!z) return { ok: false, why: '这里不是可用地面' };
      if (!S.zones[z.id]) return { ok: false, why: z.name + '还没解锁' };
      if (def.zone !== 'any' && def.zone !== z.kind) return { ok: false, why: def.zone === 'kitchen' ? '只能放在后厨' : '只能放在堂食区' };
      if (C.KEEP_CLEAR.some((k) => k.x === c.x && k.y === c.y)) return { ok: false, why: '会挡住门口' };
      const occ = S._grid[idx(c.x, c.y)];
      if (occ && occ !== ignoreId) return { ok: false, why: '这里已经有东西了' };
    }
    // 炉火旁不堆货
    const hot = !!HEAT[type];
    if (hot || type === 'shelf') {
      for (const c of cells)
        for (const d of DIRS) {
          const o = _.itemById(S, S._grid[idx(clamp(c.x + d[0], 0, C.COLS - 1), clamp(c.y + d[1], 0, C.ROWS - 1))]);
          if (!o || o.id === ignoreId) continue;
          if ((hot && o.type === 'shelf') || (type === 'shelf' && HEAT[o.type])) return { ok: false, why: '货架不能紧挨炉火' };
        }
    }
    // 动线检查：放下后，门口到后厨、到每个工位和每把椅子都还走得通
    const g = S._grid.slice();
    if (ignoreId) for (let i = 0; i < g.length; i++) if (g[i] === ignoreId) g[i] = 0;
    for (const c of cells) g[idx(c.x, c.y)] = -1;
    const map = bfs(S, C.DOOR.x, C.DOOR.y, g);
    const reach = (px, py) => inb(px, py) && map.dist[idx(px, py)] >= 0;
    if (!reach(4, 3) && !reach(5, 3)) return { ok: false, why: '会把后厨的门堵死' };
    const check = (cs, isTable) => {
      let anyStand = false;
      for (const c of cs) {
        let ok = false;
        for (const d of DIRS) if (reach(c.x + d[0], c.y + d[1])) ok = true;
        if (c.k === 3 && !ok) return false; // 每把椅子都要坐得进去
        if (c.k !== 3 && ok) anyStand = true;
      }
      return anyStand || !cs.some((c) => c.k !== 3);
    };
    const needsReach = (t) => !MR.ITEMS[t].env && t !== 'waitchair';
    if (needsReach(type) && !check(cells)) return { ok: false, why: '放在这里人走不到' };
    for (const it of S.items) {
      if (it.id === ignoreId || !needsReach(it.type)) continue;
      if (!check(itemCells(it))) return { ok: false, why: '会把「' + MR.ITEMS[it.type].name + '」堵住' };
    }
    return { ok: true };
  };

  function addItem(S, type, x, y, rot) {
    const def = MR.ITEMS[type];
    const it = { id: S.nextId++, type, x, y, rot: rot ? 1 : 0, tier: 0, dur: 100, broken: false, user: 0, heat: null, dirty: false, g: 0, paid: def.price };
    S.items.push(it);
    regrid(S);
    return it;
  }
  _.addItem = addItem;

  sim.place = function (S, type, x, y, rot) {
    const def = MR.ITEMS[type];
    if (S.cash < def.price) return { ok: false, why: '现金不够' };
    const r = sim.canPlace(S, type, x, y, rot);
    if (!r.ok) return r;
    spend(S, def.price, 'build');
    const it = addItem(S, type, x, y, rot);
    S.flags.placed = (S.flags.placed || 0) + 1;
    log(S, '买下并摆好「' + def.name + '」，花费 ' + money(def.price), 'build');
    return { ok: true, item: it };
  };
  sim.itemBusy = function (S, it) {
    if (it.g) return '有客人正在用';
    if (it.heat) return '锅里还有菜';
    return null;
  };
  sim.moveItem = function (S, id, x, y, rot) {
    const it = _.itemById(S, id);
    if (!it) return { ok: false, why: '找不到物品' };
    const busy = sim.itemBusy(S, it);
    if (busy) return { ok: false, why: busy };
    const r = sim.canPlace(S, it.type, x, y, rot, id);
    if (!r.ok) return r;
    if (_.releaseItem) _.releaseItem(S, it);
    it.x = x;
    it.y = y;
    it.rot = rot ? 1 : 0;
    regrid(S);
    return { ok: true };
  };
  sim.sellValue = (it) => Math.round(it.paid * C.SELL_RATIO);
  sim.sellItem = function (S, id) {
    const it = _.itemById(S, id);
    if (!it) return { ok: false, why: '找不到物品' };
    const busy = sim.itemBusy(S, it);
    if (busy) return { ok: false, why: busy };
    if (_.releaseItem) _.releaseItem(S, it);
    const v = sim.sellValue(it);
    S.items = S.items.filter((o) => o.id !== id);
    regrid(S);
    S.cash += v;
    S.today.build -= v;
    S.wk.build -= v;
    S.wk.sold = (S.wk.sold || 0) + v;
    log(S, '半价卖掉「' + MR.ITEMS[it.type].name + '」，回收 ' + money(v), 'build');
    return { ok: true, value: v };
  };
  sim.tier3Open = (S) => sim.week(S) >= 5 || S.rep >= 75;
  sim.upgradeCost = function (S, it) {
    const def = MR.ITEMS[it.type];
    if (!def.tiers || it.tier >= 2) return null;
    if (it.tier === 1 && !sim.tier3Open(S)) return { locked: true, cost: def.tiers[2] - def.tiers[1] };
    return { cost: def.tiers[it.tier + 1] - def.tiers[it.tier] };
  };
  sim.upgradeItem = function (S, id) {
    const it = _.itemById(S, id);
    const u = it && sim.upgradeCost(S, it);
    if (!u) return { ok: false, why: '已经是最高档' };
    if (u.locked) return { ok: false, why: '名工档要到第 5 周或口碑 75 才有货' };
    if (S.cash < u.cost) return { ok: false, why: '现金不够' };
    spend(S, u.cost, 'build');
    it.tier++;
    it.paid += u.cost;
    it.dur = 100;
    it.broken = false;
    log(S, '「' + MR.ITEMS[it.type].name + '」升到' + MR.TIER_NAMES[it.tier] + '档，花费 ' + money(u.cost), 'build');
    return { ok: true };
  };
  sim.callRepair = function (S, id) {
    const it = _.itemById(S, id);
    if (!it) return { ok: false, why: '找不到物品' };
    if (S.cash < 120) return { ok: false, why: '现金不够' };
    spend(S, 120, 'repair');
    it.dur = 100;
    it.broken = false;
    it.fixer = 0;
    log(S, '请师傅上门修好了「' + MR.ITEMS[it.type].name + '」，花费 ¥120', 'repair');
    return { ok: true };
  };
  sim.buyZone = function (S, zid) {
    const z = MR.ZONES.find((o) => o.id === zid);
    if (!z || S.zones[zid]) return { ok: false, why: '已经解锁' };
    if (S.cash < z.price) return { ok: false, why: '现金不够' };
    spend(S, z.price, 'build');
    S.zones[zid] = true;
    regrid(S);
    log(S, '向房东付了 ' + money(z.price) + '，解锁「' + z.name + '」', 'build', true);
    return { ok: true };
  };
  sim.qrOpen = (S) => sim.week(S) >= 3 || S.rep >= 60;
  sim.buyQR = function (S) {
    if (S.qr) return { ok: false, why: '已经装好了' };
    if (!sim.qrOpen(S)) return { ok: false, why: '第 3 周起，或口碑到 60 才有人上门推销' };
    if (S.cash < MR.QR_PRICE) return { ok: false, why: '现金不够' };
    spend(S, MR.QR_PRICE, 'build');
    S.qr = true;
    log(S, '装好了扫码桌牌：客人自己点单、吃完桌上结账', 'build', true);
    return { ok: true };
  };

  sim.seats = (S) => S.items.reduce((a, it) => a + (MR.ITEMS[it.type].seats || 0), 0);
  sim.env = function (S) {
    const vals = [];
    for (const it of S.items) {
      const e = MR.ITEMS[it.type].env;
      if (!e) continue;
      const z = sim.zoneAt(it.x, it.y);
      if (z && z.kind === 'dining') vals.push(e);
    }
    vals.sort((a, b) => b - a);
    let s = 0,
      f = 1;
    for (const v of vals) {
      s += v * f;
      f *= 0.85;
    }
    return Math.min(40, Math.round(s));
  };
  sim.stationCount = (S, st) => S.items.filter((it) => MR.ITEMS[it.type].station === st).length;
  sim.hasStation = (S, st) => S.items.some((it) => MR.ITEMS[it.type].station === st && !it.broken);

  // ---------- 仓储 ----------
  const fresh = (k, b) => clamp(1 - b.age / MR.INGREDIENTS[k].life, 0, 1);
  sim.stockQty = (S, k) => S.stock[k].reduce((a, b) => a + b.q, 0);
  sim.stockFresh = function (S, k) {
    let q = 0,
      f = 0,
      min = 1;
    for (const b of S.stock[k]) {
      const fr = fresh(k, b);
      q += b.q;
      f += fr * b.q;
      if (fr < min) min = fr;
    }
    return q ? { avg: f / q, min } : { avg: 1, min: 1 };
  };
  function addStock(S, k, q, fr) {
    if (q <= 0) return;
    S.stock[k].push({ q, age: (1 - (fr == null ? 1 : fr)) * MR.INGREDIENTS[k].life });
  }
  _.addStock = addStock;
  // 先用最老的一批；返回这几份的平均新鲜度
  function takeStock(S, k, q) {
    const arr = S.stock[k];
    arr.sort((a, b) => b.age - a.age);
    let need = q,
      f = 0;
    while (need > 0 && arr.length) {
      const b = arr[0];
      const use = Math.min(need, b.q);
      f += fresh(k, b) * use;
      b.q -= use;
      need -= use;
      if (b.q <= 0) arr.shift();
    }
    S.today.used[k] = (S.today.used[k] || 0) + (q - need);
    return q - need > 0 ? f / (q - need) : 0;
  }
  _.takeStock = takeStock;
  sim.storage = function (S) {
    const caps = { shelf: 0, fridge: 0, freezer: 0 };
    for (const it of S.items) {
      const d = MR.ITEMS[it.type];
      if (d.cap && caps[d.station] != null) caps[d.station] += d.cap;
    }
    return caps;
  };
  // 按「冷冻 → 冷藏 → 货架 → 地上」分配并老化。地上的坏得快一倍。
  function ageStock(S, mins) {
    const caps = sim.storage(S);
    const use = { shelf: 0, fridge: 0, freezer: 0, floor: 0 };
    let wasted = 0;
    for (const k of ['fish', 'meat', 'veg', 'tea', 'egg', 'rice']) {
      const ing = MR.INGREDIENTS[k];
      const keep = [];
      for (const b of S.stock[k]) {
        let left = b.q,
          rate = 0;
        const put = (slot, mult) => {
          const n = Math.min(left, caps[slot] - use[slot]);
          if (n > 0) {
            use[slot] += n;
            left -= n;
            rate += n / mult;
          }
        };
        if (ing.cold === 'freezer') put('freezer', 4);
        if (ing.cold) put('fridge', 2.2);
        put('shelf', 1);
        if (left > 0) {
          use.floor += left;
          rate += left * 2;
        }
        b.age += ((rate / b.q) * mins) / 1440;
        if (b.age >= ing.life) wasted += b.q * ing.price;
        else keep.push(b);
      }
      S.stock[k] = keep;
    }
    S.storeUse = use;
    if (wasted > 0) {
      S.today.waste += wasted;
      S.wk.waste = (S.wk.waste || 0) + wasted;
      S.wasteNote = (S.wasteNote || 0) + wasted;
    }
  }
  _.ageStock = ageStock;

  sim.restockPlan = function (S) {
    const items = {};
    let cost = 0;
    for (const k of MR.ING_ORDER) {
      let pend = 0;
      for (const d of S.deliveries) pend += d.items[k] || 0;
      const n = Math.max(0, S.targets[k] - sim.stockQty(S, k) - pend);
      if (n > 0) {
        items[k] = n;
        cost += n * MR.INGREDIENTS[k].price;
      }
    }
    return { items, cost };
  };
  // delay: 到货延迟（分钟）。钱不够就按顺序能买多少买多少。
  function restock(S, delay) {
    const plan = sim.restockPlan(S);
    const items = {};
    let cost = 0;
    for (const k of MR.ING_ORDER) {
      let n = plan.items[k] || 0;
      const p = MR.INGREDIENTS[k].price;
      n = Math.min(n, Math.floor((S.cash - cost) / p));
      if (n > 0) {
        items[k] = n;
        cost += n * p;
      }
    }
    if (cost <= 0) return { ok: false, why: plan.cost > 0 ? '现金不够进货' : '库存已达目标' };
    spend(S, cost, 'food');
    S.deliveries.push({ at: S.clock + (delay || 0), items, cost });
    return { ok: true, cost, items };
  }
  _.restock = restock;
  sim.restockNow = function (S) {
    const r = restock(S, 25);
    if (r.ok) log(S, '下了一单补货 ' + money(r.cost) + '，约 25 分钟后到', 'stock');
    return r;
  };
  sim.setTarget = function (S, k, v) {
    S.targets[k] = clamp(Math.round(v), 0, 80);
  };
  sim.suggestTargets = function (S) {
    const used = S.usedYesterday || {};
    let any = false;
    for (const k of MR.ING_ORDER) {
      if (used[k]) {
        S.targets[k] = Math.ceil(used[k] * 1.25) + 2;
        any = true;
      }
    }
    return any;
  };

  // ---------- 菜单 ----------
  sim.dishCost = function (id) {
    let c = 0;
    const d = MR.DISHES[id];
    for (const k in d.ing) c += d.ing[k] * MR.INGREDIENTS[k].price;
    return c;
  };
  sim.setPrice = function (S, id, p) {
    const d = MR.DISHES[id];
    S.menu[id].price = clamp(Math.round(p), 1, d.ref * 3);
  };
  // 出品越好，客人越愿意多付：近期平均分每高 11 分，心理价位上浮 10%
  sim.fairPrice = function (S, id) {
    const m = S.menu[id];
    const q = m.n ? clamp(1 + (m.sum - 62) / 110, 0.85, 1.4) : 1;
    return MR.DISHES[id].ref * q;
  };
  sim.priceFeel = function (S, id) {
    const r = S.menu[id].price / sim.fairPrice(S, id);
    if (r <= 0.8) return { t: '便宜，好卖但利薄', k: 'low' };
    if (r <= 1.12) return { t: '合适', k: 'ok' };
    if (r <= 1.35) return { t: '偏贵，点的人变少', k: 'high' };
    return { t: '太贵，会挨骂', k: 'bad' };
  };
  // 能不能做：解锁、上架、有设备、有料
  sim.dishStatus = function (S, id) {
    const d = MR.DISHES[id],
      m = S.menu[id];
    if (!m.unlocked) return 'locked';
    if (!m.on) return 'off';
    const isDrink = d.cat === 'drink';
    if ((!isDrink || d.needBar) && !sim.hasStation(S, d.station)) return sim.stationCount(S, d.station) ? 'broken' : 'nostation';
    for (const k in d.ing) if (sim.stockQty(S, k) < d.ing[k]) return 'nostock';
    return 'ok';
  };
  sim.startResearch = function (S, id) {
    const d = MR.DISHES[id];
    if (!d.research || S.menu[id].unlocked) return { ok: false, why: '不需要研发' };
    if (S.research) return { ok: false, why: '已经在研发「' + MR.DISHES[S.research.dish].name + '」了' };
    if (S.cash < d.research.cost) return { ok: false, why: '现金不够' };
    spend(S, d.research.cost, 'other');
    S.research = { dish: id, need: d.research.work, done: 0 };
    log(S, '开始研发「' + d.name + '」，非营业时段由排了「研发」的人来试菜', 'menu', true);
    return { ok: true };
  };

  // ---------- 员工 ----------
  const ARCH = {
    chef: { role: '厨师', base: { knife: 52, fire: 55, season: 52, plate: 45, drink: 25, serve: 20, cash: 18, clean: 28, repair: 28, research: 40 }, prio: { cook: 1, cut: 2, plate: 2, wash: 3, drink: 4, clean: 4, repair: 3, research: 3, serve: 0, order: 0, cash: 0 } },
    helper: { role: '帮厨', base: { knife: 45, fire: 32, season: 35, plate: 44, drink: 30, serve: 28, cash: 20, clean: 48, repair: 32, research: 22 }, prio: { wash: 1, cut: 1, plate: 2, cook: 0, drink: 3, clean: 2, repair: 3, research: 4, serve: 4, order: 0, cash: 0 } },
    waiter: { role: '服务员', base: { knife: 18, fire: 15, season: 20, plate: 36, drink: 46, serve: 56, cash: 52, clean: 46, repair: 22, research: 15 }, prio: { order: 1, serve: 1, cash: 1, drink: 2, clean: 2, wash: 4, cut: 0, cook: 0, plate: 3, repair: 4, research: 0 } },
    apprentice: { role: '学徒', base: { knife: 24, fire: 22, season: 22, plate: 24, drink: 22, serve: 26, cash: 20, clean: 30, repair: 18, research: 14 }, prio: { wash: 1, clean: 1, cut: 2, plate: 3, serve: 3, cook: 0, drink: 3, order: 4, cash: 4, repair: 0, research: 0 } },
  };
  function makeStaff(S, arch, opts) {
    opts = opts || {};
    const a = ARCH[arch];
    const sk = {};
    const lift = opts.lift || 0;
    for (const k in a.base) sk[k] = clamp(Math.round(a.base[k] + lift + (opts.fixed ? 0 : (rnd(S) - 0.5) * 16)), 5, 95);
    const used = S.staff.map((s) => s.name).concat((S.candidates || []).map((s) => s.name));
    const pool = MR.NAMES.staff.filter((n) => !used.includes(n));
    const top = Object.values(sk)
      .sort((x, y) => y - x)
      .slice(0, 3)
      .reduce((x, y) => x + y, 0) / 3;
    const s = {
      id: S.nextId++,
      name: opts.name || (pool.length ? _.pick(S, pool) : '新人' + S.nextId),
      arch,
      role: a.role,
      owner: false,
      skills: sk,
      trait: opts.trait !== undefined ? opts.trait : rnd(S) < 0.7 ? _.pick(S, Object.keys(MR.TRAITS)) : null,
      wage: arch === 'apprentice' ? 38 : Math.round((36 + top * 0.95) / 2) * 2,
      prio: Object.assign({}, a.prio),
      x: C.DOOR.x,
      y: C.STREET_Y,
      path: [],
      task: null,
      think: 0,
      energy: 100,
      mods: [],
      lowDays: 0,
      unpaid: 0,
      off: false,
      forced: null,
      forcedN: 0,
      carry: 0,
      state: '待命',
      dir: 1,
      color: opts.color || 0,
    };
    return s;
  }
  _.makeStaff = makeStaff;
  sim.mood = function (s) {
    let m = 55;
    for (const o of s.mods) m += o.v;
    return clamp(Math.round(m), 0, 100);
  };
  function addMood(S, s, k, label, v, hours) {
    s.mods = s.mods.filter((m) => m.k !== k);
    s.mods.push({ k, label, v, until: S.clock + hours * 60 });
  }
  _.addMood = addMood;

  function refreshCandidates(S) {
    S.candidates = [];
    const w = sim.week(S);
    const archs = ['chef', 'helper', 'waiter'];
    if (w >= 2) archs.push('apprentice');
    const lift = Math.min(18, (w - 1) * 2.5);
    const first = _.pick(S, archs);
    const picks = [first];
    while (picks.length < 3) picks.push(_.pick(S, archs));
    for (const a of picks) {
      const c = makeStaff(S, a, { lift: a === 'apprentice' ? 0 : lift * rnd(S) });
      S.candidates.push(c);
    }
  }
  _.refreshCandidates = refreshCandidates;
  sim.HIRE_FEE = 60;
  sim.hire = function (S, i) {
    const c = S.candidates[i];
    if (!c) return { ok: false, why: '人已经走了' };
    if (S.staff.filter((s) => !s.owner).length >= C.MAX_STAFF) return { ok: false, why: '这间小店最多再雇 ' + C.MAX_STAFF + ' 个人' };
    if (S.cash < sim.HIRE_FEE) return { ok: false, why: '付不起中介费' };
    spend(S, sim.HIRE_FEE, 'other');
    S.candidates.splice(i, 1);
    c.color = S.staff.length % 6;
    c.x = C.DOOR.x;
    c.y = C.STREET_Y;
    S.staff.push(c);
    addMood(S, c, 'new', '新工作，有干劲', 6, 72);
    log(S, c.name + '（' + c.role + '）入职，日薪 ' + money(c.wage), 'staff', true);
    return { ok: true, staff: c };
  };
  sim.fire = function (S, id) {
    const s = S.staff.find((o) => o.id === id);
    if (!s || s.owner) return { ok: false, why: '不能辞退' };
    if (_.abortTask) _.abortTask(S, s);
    S.staff = S.staff.filter((o) => o.id !== id);
    for (const o of S.staff) if (!o.owner) addMood(S, o, 'fired', '同事被辞退了', -4, 48);
    log(S, '辞退了 ' + s.name, 'staff');
    return { ok: true };
  };
  sim.setPrio = function (S, id, job, v) {
    const s = S.staff.find((o) => o.id === id);
    if (s) {
      s.prio[job] = clamp(v, 0, 4);
      S.flags.prioTouched = true;
    }
  };
  sim.force = function (S, id, job) {
    const s = S.staff.find((o) => o.id === id);
    if (!s) return;
    s.forced = job;
    s.forcedAt = S.clock;
    s.forcedN++;
    s.think = 0;
    if (s.forcedN === 6) addMood(S, s, 'bossy', '今天被打断太多次', -5, 20);
  };
  sim.setLeave = function (S, id, off) {
    const s = S.staff.find((o) => o.id === id);
    if (!s || s.owner) return;
    s.off = off;
    if (off) {
      if (_.abortTask) _.abortTask(S, s);
      addMood(S, s, 'leave', '被放了无薪假', -6, 48);
      log(S, s.name + ' 今天放无薪假，不计工资', 'staff');
    }
  };

  // ---------- 买断 ----------
  sim.canBuyout = function (S) {
    if (S.bought || S.over) return { ok: false, why: '' };
    if (S.cash < C.BUYOUT) return { ok: false, why: '还差 ' + money(C.BUYOUT - S.cash) };
    if (sim.dow(S) === 6) return { ok: false, why: '周日房东只收租，周一到周六再来办手续' };
    return { ok: true };
  };
  sim.buyout = function (S) {
    const r = sim.canBuyout(S);
    if (!r.ok) return r;
    S.cash -= C.BUYOUT;
    S.bought = true;
    S.boughtDay = S.day;
    for (const z of MR.ZONES) S.zones[z.id] = true;
    regrid(S);
    log(S, '把铺子买下来了。从今天起，这里不再交租。', 'win', true);
    _.award(S, 'buyout');
    S.modals.push({ type: 'victory', day: S.day, week: sim.week(S), rep: Math.round(S.repMax), rentPaid: S.rentPaid, cash: S.cash });
    return { ok: true };
  };
  // 按近两周结余粗算还要几周
  sim.estimateWeeks = function (S) {
    const w = S.weeks.slice(-2);
    if (!w.length) return null;
    const avg = w.reduce((a, b) => a + b.net, 0) / w.length;
    if (avg <= 0) return Infinity;
    return Math.max(1, Math.ceil((C.BUYOUT - S.cash) / avg));
  };

  // ---------- 开局 ----------
  sim.newGame = function (opts) {
    opts = opts || {};
    const S = {
      v: 1,
      rng: (opts.seed == null ? Math.floor(Math.random() * 1e9) : opts.seed) | 0,
      story: opts.story || 'calm',
      day: 1,
      minute: C.DAY_START,
      clock: C.DAY_START,
      cash: C.START_CASH,
      rep: 30,
      repMax: 30,
      bought: false,
      over: false,
      zones: { kitchen: true, dining: true, storage: false, yard: false, kitchen2: false },
      items: [],
      nextId: 1,
      staff: [],
      groups: [],
      tickets: [],
      spots: [],
      stock: { veg: [], egg: [], rice: [], meat: [], fish: [], tea: [] },
      targets: { veg: 14, egg: 8, rice: 8, meat: 6, fish: 0, tea: 5 },
      autoRestock: true,
      deliveries: [],
      storeUse: { shelf: 0, fridge: 0, freezer: 0, floor: 0 },
      menu: {},
      research: null,
      regulars: [],
      candidates: [],
      qr: false,
      log: [],
      logN: 0,
      ratings: [],
      fx: [],
      modals: [],
      today: newDayStats(),
      wk: { startCash: C.START_CASH },
      days: [],
      weeks: [],
      usedYesterday: {},
      ev: { weather: 'clear', festival: false },
      evNext: {},
      sched: [],
      flags: {},
      rentPaid: 0,
      ach: {},
      tut: { step: 0, done: !!opts.noTutorial },
      neighbor: 0,
      halt: null,
    };
    for (const id of MR.DISH_ORDER) {
      const d = MR.DISHES[id];
      S.menu[id] = { unlocked: !!d.start, on: !!d.start, price: d.ref, sold: 0, sum: 0, n: 0 };
    }
    regrid(S);
    addItem(S, 'shelf', 2, 0, 0);
    addItem(S, 'board', 4, 0, 0);
    addItem(S, 'wok', 6, 0, 0);
    addItem(S, 'table2', 0, 7, 0);
    addItem(S, 'table2', 5, 7, 0);
    for (const it of S.items) it.paid = MR.ITEMS[it.type].price;

    const owner = makeStaff(S, 'waiter', { name: '店主', fixed: true, trait: null });
    owner.owner = true;
    owner.role = '店主';
    owner.wage = 0;
    owner.skills = { knife: 34, fire: 32, season: 36, plate: 38, drink: 42, serve: 55, cash: 55, clean: 50, repair: 42, research: 46 };
    owner.prio = { order: 1, serve: 1, cash: 1, drink: 2, clean: 2, wash: 3, plate: 4, cut: 0, cook: 0, repair: 2, research: 2 };
    owner.x = 3;
    owner.y = 8;
    owner.color = 0;
    const chef = makeStaff(S, 'chef', { name: '老周', fixed: true, trait: 'steady' });
    chef.skills = { knife: 48, fire: 50, season: 50, plate: 42, drink: 24, serve: 20, cash: 18, clean: 30, repair: 30, research: 40 };
    chef.wage = 84;
    chef.x = 5;
    chef.y = 2;
    chef.color = 1;
    S.staff.push(owner, chef);
    refreshCandidates(S);
    log(S, '小馆开张。租来的铺子，周日晚上 22:00 交第一笔房租 ' + money(sim.rent(S)) + '。', 'info');
    if (_.startDay) _.startDay(S, true);
    return S;
  };

  // ---------- 存档（只在早晨的干净状态存） ----------
  sim.serialize = function (S) {
    const o = {};
    for (const k in S) if (k[0] !== '_' && k !== 'fx' && k !== 'modals') o[k] = S[k];
    return JSON.stringify(o);
  };
  sim.restore = function (json) {
    const S = JSON.parse(json);
    S.ach = S.ach || {};
    S.fx = [];
    S.modals = [];
    S.groups = [];
    S.tickets = [];
    for (const s of S.staff) {
      s.task = null;
      s.path = [];
      s.carry = 0;
    }
    for (const it of S.items) {
      it.user = 0;
      it.heat = null;
      it.g = 0;
      it.fixer = 0;
      it.cleaner = 0;
    }
    regrid(S);
    // 存在日结那一刻的快照：把日结弹窗补回来
    if (S.halt === 'dayEnd' && S.days.length) S.modals.push({ type: 'dayEnd', rec: S.days[S.days.length - 1] });
    return S;
  };
})(typeof window !== 'undefined' ? window : globalThis);
