/* 一间小馆 · 界面（四角浮层、底栏、浮窗面板、放置、弹窗、引导与目标）
 * 能用图说的不用字：图标 + 数字 + 颜色，细节放进悬停提示。
 * 一次只处于「浏览 / 查看面板 / 放置」三种状态之一。 */
(function (root) {
  'use strict';
  const MR = root.MR;
  const C = MR.C;
  const sim = MR.sim;
  const R = MR.render;
  const IC = MR.ICON;
  const money = sim.money;
  const neg = (n) => (Math.round(n) > 0 ? '-' : '') + money(n);
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const SKILL_IC = { knife: '🔪', fire: '🔥', season: '🧂', plate: '🍽️', drink: '🍵', serve: '🛎️', cash: '💰', clean: '🧹', repair: '🔧', research: '🧪' };
  // 建造卡片上的一句话效果
  const FX = { table2: '🪑 +2', table4: '🪑 +4', counter: '💰 更快', waitchair: '⏳ +25%', sink: '💧 ×2.5', board: '🔪 刀工', wok: '🔥 炒', pan: '🔥 煎', pot: '🔥 煮', steamer: '🔥 蒸', fryer: '🔥 炸', pass: '🍽️ +12', shelf: '📦 30', fridge: '❄️ 40', freezer: '🧊 40', drinkbar: '🍵 饮品', oven: '🍮 甜品', restchair: '💤 恢复', plant: '🌿 +3', lamp: '🌿 +5', painting: '🌿 +7', aquarium: '🌿 +10' };
  const TIER_STAR = ['', '★', '★★'];

  const UI = (MR.ui = {
    S: null,
    speed: 0,
    lastSpeed: 1,
    sheet: null,
    tab: { build: '堂食', menu: 'dish', staff: 'team', ledger: 'today' },
    staffId: null,
    place: null,
    sel: null,
    modal: null,
    flags: {},
    logSeen: 0,
    story: 'calm',
    wide: false,
  });

  const cache = {};
  function set(id, v, prop) {
    const k = id + (prop || '');
    if (cache[k] === v) return;
    cache[k] = v;
    const el = $(id);
    if (!el) return;
    if (prop === 'class') el.className = v;
    else if (prop === 'hidden') el.hidden = v;
    else if (prop === 'html') el.innerHTML = v;
    else if (prop === 'width') el.style.width = v;
    else el.textContent = v;
  }
  const meter = (f, cls) => '<div class="meter ' + (cls || '') + '"><i style="width:' + Math.round(Math.max(0, Math.min(1, f)) * 100) + '%"></i></div>';
  const lvl = (v, hi, lo) => (v >= hi ? 'g' : v >= lo ? 'a' : 'r');
  const img = (src, t) => '<img src="' + src + '" alt="" ' + (t ? 'title="' + esc(t) + '"' : '') + '>';

  // ================= 常驻信息 =================
  function leftText(S) {
    const m = sim.minutesToRent(S);
    const d = Math.floor(m / 1440);
    return d >= 1 ? '⏳ ' + d + ' 天' : '⏳ ' + Math.max(0, Math.ceil(m / 60)) + ' 小时';
  }
  UI.hud = function () {
    const S = UI.S;
    if (!S) return;
    set('#d-week', '第 ' + sim.week(S) + ' 周');
    set('#d-day', C.WEEKDAYS[sim.dow(S)]);
    set('#d-time', sim.clockText(S));
    set('#d-phase', sim.PHASE_NAMES[sim.phase(S)] + (UI.speed && sim.fastForward(S) ? ' ⏩' : ''));
    set('#d-ev', S.ev.weather === 'rain' ? '🌧️' : S.ev.festival ? '🏮' : S.minute > 1110 ? '🌙' : '☀️');
    set('#s-cash', money(S.cash));
    if (S.bought) {
      set('#s-rent', '免租');
      set('#s-left', '');
      set('#s-after', money(S.cash));
      set('#st-after', 'res ok', 'class');
    } else {
      const rent = sim.rent(S);
      set('#s-rent', money(rent));
      set('#s-left', leftText(S));
      const after = S.cash - rent;
      set('#s-after', (after < 0 ? '-' : '') + money(Math.abs(after)));
      set('#st-after', 'res ' + (after < 0 ? 'bad' : after < rent * 0.25 ? 'warn' : 'ok'), 'class');
    }
    set('#s-rep', String(Math.round(S.rep)));
    set('#s-seats', '🪑' + sim.seats(S) + ' 🌿' + sim.env(S));
    if (S.bought) {
      set('#b-fill', '100%', 'width');
      set('#b-text', '已买下');
      set('#buyout', 'hudbox', 'class');
    } else {
      set('#b-fill', Math.min(100, (S.cash / C.BUYOUT) * 100).toFixed(1) + '%', 'width');
      const est = sim.estimateWeeks(S);
      set('#b-text', Math.floor((S.cash / C.BUYOUT) * 100) + '%' + (est == null || est === Infinity || S.cash >= C.BUYOUT ? '' : ' · ' + est + ' 周'));
      set('#buyout', 'hudbox' + (S.cash >= C.BUYOUT ? ' ready' : ''), 'class');
    }
    const al = sim.rentAlert(S);
    if (al) {
      set('#alert', al === 2 ? 'r' : 'y', 'class');
      set('#alert', '<span>🏠 还差 ' + money(sim.rent(S) - S.cash) + (al === 2 ? (sim.dow(S) === 6 ? ' · 今晚扣' : ' · 明晚扣') : '') + '</span>' + (al === 2 ? '<button type="button" data-act="open" data-sheet="emergency">🆘 应急</button>' : ''), 'html');
    }
    set('#alert', !al, 'hidden');
    // 各工位排队：图标 + 数字
    const p = sim.pipeline(S);
    const cells = [
      ['⏳', p.queue, '门口等位'],
      ['📝', p.order, '等点单'],
      0,
      [IC.wash, p.wash, '等洗菜'],
      [IC.cut, p.cut, '等切菜'],
      [IC.cook, p.cook + p.heat, '等下锅 / 在锅里'],
      [IC.plate, p.plate, '等摆盘'],
      [IC.serve, p.ready, '等上菜'],
      [IC.drink, p.mix, '等调饮'],
      0,
      ['💰', p.pay, '等结账'],
    ];
    set('#rail', cells.map((c) => (c ? '<span class="st' + (c[1] >= 4 ? ' h' : c[1] >= 2 ? ' w' : '') + '" title="' + c[2] + '">' + c[0] + '<b>' + c[1] + '</b></span>' : '<span class="sep"></span>')).join(''), 'html');
    set('#goal', goals(S).map((g) => '<span>🎯 ' + esc(g) + '</span>').join(''), 'html');
    for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', Number(b.dataset.v) === UI.speed);
    for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.sheet === UI.sheet);
    toasts(S);
  };

  // 同时只推一两条短目标
  function goals(S) {
    const out = [];
    if (S.over) return out;
    if (S.bought) return ['铺子是你的了，自由经营'];
    const rent = sim.rent(S);
    const y = S.days[S.days.length - 1];
    if (S.cash >= C.BUYOUT) out.push(sim.dow(S) === 6 ? '周一点 🔑 买下店铺' : '点 🔑 买下店铺！');
    else if (S.cash < rent) out.push('周日前备齐房租');
    if (out.length < 2 && S.cash < C.BUYOUT) {
      if (!sim.stationCount(S, 'sink')) out.push('买水池，洗菜快 2.5 倍');
      else if (y && y.walkQueue >= 4 && sim.seats(S) < 12) out.push('等位走了 ' + y.walkQueue + ' 桌：加桌椅');
      else if (!sim.stationCount(S, 'pass')) out.push('买出餐台，摆盘更快');
      else if (y && y.walkFood + y.walkOrder >= 2) out.push('等太久走了 ' + (y.walkFood + y.walkOrder) + ' 桌：' + (S.staff.length < 3 ? '加锅、砧板或人手' : '看哪个数字最大'));
      else if (S.items.some((it) => it.broken)) out.push('有设备坏了，点它修');
      else if (S.rep >= 42 && !S.research && MR.DISH_ORDER.some((id) => !S.menu[id].unlocked) && (S.flags.researched || 0) < 2) out.push('研发新菜，提高客单价');
      else if (y && sim.env(S) < 8 && S.cash > rent * 1.5) out.push('摆点绿植灯具，提升环境');
      else if (S.cash > MR.rentOf(sim.week(S) + 1) * 2) out.push('余钱攒着买断');
    }
    return out.slice(0, 2);
  }

  function toasts(S) {
    const box = $('#toasts');
    for (const l of S.log) {
      if (l.n <= UI.logSeen) continue;
      UI.logSeen = l.n;
      if (l.toast) UI.toast(l.text, l.kind);
    }
    while (box.children.length > 3) box.removeChild(box.firstChild);
  }
  UI.toast = function (text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind === 'warn' ? 'warn' : kind === 'good' || kind === 'win' ? 'good' : '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4100);
  };

  // ================= 浮窗面板 =================
  const TITLES = { build: '建造', menu: '菜单', stock: '采购', staff: '员工', ledger: '账本', emergency: '应急' };
  UI.open = function (name, tab) {
    if (UI.place) UI.cancelPlace();
    hidePop();
    if (UI.sheet === name && !tab) return UI.close();
    UI.sheet = name;
    if (tab) UI.tab[name] = tab;
    if (name !== 'staff') UI.staffId = null;
    $('#sheet').hidden = false;
    $('#sh-body').scrollTop = 0;
    UI.renderSheet();
  };
  UI.close = function () {
    UI.sheet = null;
    UI.staffId = null;
    $('#sheet').hidden = true;
  };
  UI.renderSheet = function () {
    const S = UI.S;
    if (!UI.sheet || !S) return;
    set('#sh-title', TITLES[UI.sheet]);
    set('#sheet', 'hudbox' + (UI.sheet === 'staff' ? ' wide' : ''), 'class');
    const v = SHEETS[UI.sheet](S);
    set('#sh-tabs', (v.tabs || []).map((t) => '<button type="button" data-act="tab" data-v="' + t[0] + '" class="' + (t[0] === UI.tab[UI.sheet] ? 'on' : '') + '">' + t[1] + '</button>').join(''), 'html');
    const body = $('#sh-body');
    if (cache.body !== v.html) {
      cache.body = v.html;
      const st = body.scrollTop;
      body.innerHTML = v.html;
      body.scrollTop = st;
    }
  };
  const afterTip = (S, cost) => (S.bought ? '' : '\n买后扣租结余 ' + money(S.cash - cost - sim.rent(S)));
  const ingIcons = (d) =>
    Object.keys(d.ing)
      .map((k) => '<span title="' + MR.INGREDIENTS[k].name + '">' + IC[k].repeat(d.ing[k]) + '</span>')
      .join('');

  const SHEETS = {
    build(S) {
      const cats = MR.ITEM_CATS.concat(['空间']);
      const tab = UI.tab.build;
      let html = '<div class="grid">';
      if (tab === '空间') {
        for (const z of MR.ZONES) {
          if (!z.price) continue;
          const own = S.zones[z.id];
          html += '<button type="button" class="card-item" data-act="buyZone" data-id="' + z.id + '"' + (own || S.cash < z.price ? ' disabled' : '') + ' title="' + z.name + '：一次性解锁费，不是房租' + afterTip(S, z.price) + '"><span class="lock">' + (own ? '✅' : '🔓') + '</span><span class="n">' + z.name + '</span><span class="fx">＋' + (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1) + ' 格</span><span class="price">' + (own ? '已解锁' : money(z.price)) + '</span></button>';
        }
        const open = sim.qrOpen(S);
        html += '<button type="button" class="card-item" data-act="buyQR"' + (S.qr || !open || S.cash < MR.QR_PRICE ? ' disabled' : '') + ' title="扫码桌牌：客人自己点单、桌上结账，服务员只管上菜收桌' + (open ? '' : '\n第 3 周或口碑 60 后可买') + '"><span class="lock">' + (S.qr ? '✅' : open ? '📱' : '🔒') + '</span><span class="n">扫码点单</span><span class="fx">📝💰 自助</span><span class="price">' + (S.qr ? '已装好' : money(MR.QR_PRICE)) + '</span></button>';
        html += '</div><div class="note">点店里的东西：搬动 · 升档 ★ · 修理 · 半价卖</div>';
        return { tabs: cats.map((c) => [c, c]), html };
      }
      for (const id in MR.ITEMS) {
        const d = MR.ITEMS[id];
        if (d.cat !== tab) continue;
        const n = S.items.filter((it) => it.type === id).length;
        html += '<button type="button" class="card-item" data-act="buy" data-id="' + id + '"' + (S.cash < d.price ? ' disabled' : '') + ' title="' + esc(d.name + '：' + d.desc + (d.tiers ? '\n可升档：实用 → 专业 → 名工' : '') + afterTip(S, d.price)) + '">' + (n ? '<span class="cnt">×' + n + '</span>' : '') + img(R.itemIcon(id)) + '<span class="n">' + d.name + '</span><span class="fx">' + FX[id] + '</span><span class="price">' + money(d.price) + '</span></button>';
      }
      html += '</div>';
      return { tabs: cats.map((c) => [c, c]), html };
    },

    menu(S) {
      const tab = UI.tab.menu;
      let html = '';
      if (S.research) {
        const r = S.research;
        html += '<div class="note" title="备菜、午休、打烊时，由排了 🧪 的人去试菜">🧪 <b>' + MR.DISHES[r.dish].name + '</b>　' + Math.round((r.done / r.need) * 100) + '%' + meter(r.done / r.need) + '</div>';
      }
      const ST = { nostock: ['缺料', 'r'], nostation: ['缺设备', 'r'], broken: ['设备坏', 'r'], off: ['下架', ''], ok: ['', ''] };
      for (const id of MR.DISH_ORDER) {
        const d = MR.DISHES[id];
        if (d.cat !== tab) continue;
        const m = S.menu[id];
        const stIcon = img(R.itemIcon(d.station === 'drinkbar' ? 'drinkbar' : d.station), '需要：' + MR.ITEMS[d.station].name + (d.cat === 'drink' && !d.needBar ? '（没有也能现沏，慢且分低）' : ''));
        if (!m.unlocked) {
          const busy = S.research && S.research.dish === id;
          html += '<div class="rowi off">' + stIcon + '<div class="main"><h4>🔒 ' + d.name + '</h4><p>' + ingIcons(d) + '　参考 ' + money(d.ref) + '</p></div><div class="side"><button type="button" class="btn sm" data-act="research" data-id="' + id + '"' + (S.research || S.cash < d.research.cost ? ' disabled' : '') + ' title="研发后才能上菜单">🧪 ' + (busy ? '研发中' : money(d.research.cost)) + '</button></div></div>';
          continue;
        }
        const st = ST[sim.dishStatus(S, id)];
        const feel = sim.priceFeel(S, id);
        const avg = m.n ? Math.round(m.sum) : null;
        html += '<div class="rowi' + (m.on ? '' : ' off') + '">' + stIcon + '<div class="main"><h4>' + d.name + (st[0] ? ' <span class="tag ' + st[1] + '">' + st[0] + '</span>' : '') + (avg != null ? ' <span class="tag" style="color:#fff;background:' + R.TIER_COL[MR.tierOf(avg).key] + '" title="近期平均分">' + avg + '</span>' : '') + '</h4><p>' + ingIcons(d) + '　进价 ' + money(sim.dishCost(id)) + '　卖出 ' + m.sold + '</p></div><div class="side"><div class="stepper ' + feel.k + '" title="' + feel.t + '\n客人心理价位约 ' + money(sim.fairPrice(S, id)) + '（出品越好越高）"><button type="button" data-act="price" data-id="' + id + '" data-d="-1">−</button><b>' + money(m.price) + '</b><button type="button" data-act="price" data-id="' + id + '" data-d="1">+</button></div><button type="button" class="icobtn" data-act="toggleDish" data-id="' + id + '" title="' + (m.on ? '下架' : '上架') + '">' + (m.on ? '👁️' : '🚫') + '</button></div></div>';
      }
      html += '<div class="note">价格框：<b class="pos">绿</b> 合适　<b style="color:var(--amber)">黄</b> 偏贵　<b class="neg">红</b> 太贵</div>';
      return { tabs: Object.keys(MR.CAT_NAMES).map((k) => [k, MR.CAT_NAMES[k]]), html };
    },

    stock(S) {
      const caps = sim.storage(S);
      const u = S.storeUse;
      const plan = sim.restockPlan(S);
      const cap = (ic, a, b, t) => '<div class="tile" title="' + t + '"><i>' + ic + '</i><b>' + Math.round(a) + '<small>/' + b + '</small></b>' + meter(b ? a / b : 0, a >= b && b ? 'a' : 'g') + '</div>';
      let html = '<div class="tiles">' + cap('📦', u.shelf, caps.shelf, '常温货架') + cap('❄️', u.fridge, caps.fridge, '冷藏：保质期 ×2.2') + cap('🧊', u.freezer, caps.freezer, '冷冻：肉和鱼保质期 ×4') + (u.floor > 0 ? '<div class="tile" title="放不下堆在地上：坏得快一倍，检查会罚款"><i>⚠️</i><b class="neg">' + Math.round(u.floor) + '</b><small>堆地上</small></div>' : '') + '</div>';
      for (const k of MR.ING_ORDER) {
        const ing = MR.INGREDIENTS[k];
        const q = sim.stockQty(S, k);
        const f = sim.stockFresh(S, k);
        let pend = 0;
        for (const d of S.deliveries) pend += d.items[k] || 0;
        html += '<div class="rowi" title="' + ing.name + '：单价 ' + money(ing.price) + '，常温可放 ' + ing.life + ' 天"><span class="em">' + IC[k] + '</span><div class="main"><h4>' + ing.name + ' <b class="num">' + q + '</b>' + (pend ? '<span class="tag a">🚚 +' + pend + '</span>' : '') + '<span class="tag">' + money(ing.price) + '</span></h4>' + (q ? meter(f.avg, f.min < 0.25 ? 'r' : f.min < 0.5 ? 'a' : 'g') : '') + '</div><div class="side"><span class="tag" title="每天早上补到这个数">🎯</span><div class="stepper"><button type="button" data-act="target" data-id="' + k + '" data-d="-2">−</button><b>' + S.targets[k] + '</b><button type="button" data-act="target" data-id="' + k + '" data-d="2">+</button></div></div></div>';
      }
      html += '<div class="rowi" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn primary" data-act="restock"' + (plan.cost <= 0 ? ' disabled' : '') + ' title="约 25 分钟到货">🛒 补货' + (plan.cost > 0 ? ' ' + money(plan.cost) : '') + '</button><button type="button" class="btn" data-act="autoRestock" title="每天早上自动补到目标">🔁 自动 ' + (S.autoRestock ? '开' : '关') + '</button><button type="button" class="btn" data-act="suggest" title="按昨天的用量设目标">📊 按昨日</button></div>';
      return { html };
    },

    staff(S) {
      const tabs = [
        ['team', '工作 ' + S.staff.length],
        ['hire', '招聘'],
      ];
      if (UI.staffId) {
        const s = S.staff.find((o) => o.id === UI.staffId);
        if (s) return { tabs, html: staffDetail(S, s) };
        UI.staffId = null;
      }
      let html = '';
      if (UI.tab.staff === 'hire') {
        S.candidates.forEach((c, i) => {
          const top = Object.keys(c.skills)
            .sort((a, b) => c.skills[b] - c.skills[a])
            .slice(0, 5)
            .map((k) => '<span title="' + MR.SKILLS[k] + '">' + SKILL_IC[k] + '<b class="num">' + Math.round(c.skills[k]) + '</b></span>')
            .join(' ');
          html += '<div class="rowi">' + img(R.staffIcon(Object.assign({}, c, { color: (S.staff.length + i) % 6 }))) + '<div class="main"><h4>' + c.name + ' <span class="tag">' + c.role + '</span>' + (c.trait ? '<span class="tag a" title="' + MR.TRAITS[c.trait].desc + '">' + MR.TRAITS[c.trait].name + '</span>' : '') + (c.arch === 'apprentice' ? '<span class="tag g" title="工资低、出错多，但技能涨得快 2.5 倍">成长 ×2.5</span>' : '') + '</h4><p>' + top + '</p></div><div class="side"><span class="price">' + money(c.wage) + '/天</span><button type="button" class="btn sm primary" data-act="hire" data-i="' + i + '"' + (S.cash < sim.HIRE_FEE ? ' disabled' : '') + ' title="中介费 ' + money(sim.HIRE_FEE) + '，工资每天打烊时发">雇用</button></div></div>';
        });
        if (!S.candidates.length) html += '<div class="note">今天的人见完了，明天再来。</div>';
        return { tabs, html };
      }
      // 工作优先级矩阵：行是人，列是工种
      const jobs = Object.keys(MR.JOBS);
      html += '<table class="work"><tr><th></th>' + jobs.map((j) => '<th title="' + MR.JOBS[j].name + '">' + IC[j] + '</th>').join('') + '</tr>';
      let wage = 0;
      for (const s of S.staff) {
        const m = sim.mood(s);
        if (!s.owner && !s.off) wage += s.wage;
        html += '<tr><td class="who"><button type="button" data-act="staff" data-id="' + s.id + '" title="' + esc(sim.describe(S, s)) + '">' + img(R.staffIcon(s)) + '<span><span class="nm">' + s.name + (s.off ? ' 💤' : '') + '</span><span class="mm"><span>😊</span>' + meter(m / 100, lvl(m, 60, 35)) + '<span>⚡</span>' + meter(s.energy / 100, lvl(s.energy, 50, 25)) + '</span></span></button></td>';
        for (const j of jobs) {
          const v = s.prio[j];
          html += '<td><button type="button" class="cell p' + v + '" data-act="prioCycle" data-id="' + s.id + '" data-job="' + j + '" title="' + MR.JOBS[j].name + '：' + MR.SKILLS[MR.JOBS[j].skill] + ' ' + Math.round(s.skills[MR.JOBS[j].skill]) + '">' + (v || '✕') + '<small>' + Math.round(s.skills[MR.JOBS[j].skill]) + '</small></button></td>';
        }
        html += '</tr>';
      }
      html += '</table><div class="note">点格子切换：<b>1</b> 最先做 → 4 → <b>✕</b> 不做（右键反向）。小字是对应技能。点头像看心情和技能。　今日工资 <b>' + money(wage) + '</b></div>';
      return { tabs, html };
    },

    ledger(S) {
      const tabs = [
        ['today', '今日'],
        ['rate', '评价'],
        ['regular', '熟客'],
        ['ach', '成就'],
        ['log', '日志'],
        ['help', '帮助'],
      ];
      const tab = UI.tab.ledger;
      let html = '';
      const tile = (ic, v, label, cls) => '<div class="tile"><i>' + ic + '</i><b class="' + (cls || '') + '">' + v + '</b><small>' + label + '</small></div>';
      if (tab === 'today') {
        const t = S.today;
        const walks = t.walkQueue + t.walkOrder + t.walkFood;
        html += '<div class="tiles">' + tile('💵', money(t.rev), '营业额') + tile('🥬', neg(t.food), '进货') + tile('🗑️', money(t.waste), '损耗', t.waste >= 30 ? 'neg' : '') + tile('🔨', neg(t.build), '建造') + tile('😊', t.groups + ' 桌', '接待') + tile('😠', walks + ' 桌', '等不及走了', walks ? 'neg' : '') + tile('⭐', t.dishes ? Math.round(t.scoreSum / t.dishes) : '—', '出品均分') + tile('❤️', t.satN ? Math.round(t.satSum / t.satN) : '—', '满意度') + '</div>';
        html += '<div class="sec">房租</div><table class="wk"><tr><th>周</th><th>🏠 房租</th><th>💵 营业额</th><th>交租后结余</th></tr>' + S.weeks.slice(-6).map((w) => '<tr><td>' + w.week + '</td><td>' + money(w.rent) + '</td><td>' + money(w.rev) + '</td><td class="' + (w.net < 0 ? 'neg' : 'pos') + '">' + (w.net < 0 ? '-' : '+') + money(Math.abs(w.net)) + '</td></tr>').join('') + [0, 1, 2].map((i) => '<tr><td>' + (sim.week(S) + i) + '</td><td>' + (S.bought ? '免租' : money(MR.rentOf(sim.week(S) + i))) + '</td><td>—</td><td>—</td></tr>').join('') + '</table>';
      } else if (tab === 'rate') {
        UI.flags.viewedRatings = true;
        if (!S.ratings.length) html += '<div class="note">还没有菜上桌。</div>';
        for (const r of S.ratings.slice().reverse()) {
          const d = MR.DISHES[r.dish];
          const tn = MR.TIERS.find((t) => t.key === r.tier).name;
          html += '<div class="rate"><h4><span class="score" style="background:' + R.TIER_COL[r.tier] + '">' + r.total + ' ' + tn + '</span>' + d.name + ' <small>👨‍🍳 ' + esc(r.by.cook || '') + (r.over > 0.5 ? ' · 起锅晚 ' + r.over.toFixed(0) + ' 分' : '') + '</small></h4><div class="dims">' + MR.DIMS[d.cat].map((x) => '<span class="' + (r.sc[x.k] < 50 ? 'lo' : r.sc[x.k] >= 80 ? 'hi' : '') + '"><b>' + Math.round(r.sc[x.k] == null ? 60 : r.sc[x.k]) + '</b>' + x.name + '</span>').join('') + '</div></div>';
        }
      } else if (tab === 'regular') {
        if (!S.regulars.length) html += '<div class="note">客人吃得很满意（❤️ 76 以上）时，有机会成为熟客。</div>';
        for (const r of S.regulars) html += '<div class="rowi">' + img(R.guestIcon(r.id, r.away > S.day ? 'sad' : 'happy', '#c4504a')) + '<div class="main"><h4>' + r.name + (r.away > S.day ? ' <span class="tag r">暂时不来</span>' : '') + '</h4><p>❤️ ' + MR.DISHES[r.fav].name + '　来过 ' + r.visits + ' 次</p></div></div>';
      } else if (tab === 'ach') {
        for (const a of MR.ACH) html += '<div class="rowi' + (S.ach[a.id] ? '' : ' off') + '"><span class="em">' + (S.ach[a.id] ? '🏆' : '🔒') + '</span><div class="main"><h4>' + a.name + '</h4><p>' + a.desc + '</p></div></div>';
      } else if (tab === 'log') {
        for (const l of S.log.slice().reverse()) html += '<div class="logline ' + (l.kind === 'warn' ? 'warn' : l.kind === 'good' || l.kind === 'win' ? 'good' : '') + '"><small>D' + l.d + ' ' + String(Math.floor(l.m / 60)).padStart(2, '0') + ':' + String(l.m % 60).padStart(2, '0') + '</small>' + esc(l.text) + '</div>';
      } else {
        html += '<div class="help"><i>🔁</i><span>赚钱 → 留够房租 → 扩建 → 赚更多 → 买下店铺</span><i>🍳</i><span>📝 → 💧 → 🔪 → 🍳 → 🍽️ → 🛎️ → 💰　底栏数字是各工位排着几单，最大的就是瓶颈</span><i>⭐</i><span>调味 20 · 刀工 20 · 摆盘 15 · 火候 25 · 食材 20。看人、工具档次、新鲜度</span><i>👥</i><span>「员工」里点格子排优先级；点头像可以让他立刻去做一件事</span><i>🔨</i><span>买了再点地面放下，绿色可放。点已有物品可搬、升档、修、卖</span><i>⌨️</i><span>空格暂停　1–4 调速　R 旋转　Esc 取消</span><i>🏠</i><span>周日 22:00 扣租，不够就倒闭。攒够 ¥24,000 点 🔑 买断</span></div>';
      }
      return { tabs, html };
    },

    emergency(S) {
      const short = Math.max(0, sim.rent(S) - S.cash);
      let html = '<div class="note">' + (short > 0 ? '🏠 还差 <b class="neg">' + money(short) + '</b>' : '房租够了') + '　能救命，但伤产能</div>';
      for (const s of S.staff) {
        if (s.owner) continue;
        html += '<div class="rowi">' + img(R.staffIcon(s)) + '<div class="main"><h4>' + s.name + '</h4><p>无薪假：省 ' + money(s.wage) + '，心情 -6</p></div><div class="side"><button type="button" class="btn sm" data-act="leave" data-id="' + s.id + '">' + (s.off ? '叫回来' : '💤 放假') + '</button></div></div>';
      }
      html += '<div class="rowi"><span class="em">🛒</span><div class="main"><h4>明早不进货</h4><p>省货款，可能缺料</p></div><div class="side"><button type="button" class="btn sm" data-act="autoRestock">自动补货 ' + (S.autoRestock ? '开' : '关') + '</button></div></div><div class="sec">半价卖</div><div class="grid">';
      for (const it of S.items.slice().sort((a, b) => sim.sellValue(b) - sim.sellValue(a))) {
        const d = MR.ITEMS[it.type];
        const busy = sim.itemBusy(S, it);
        html += '<button type="button" class="card-item" data-act="sell" data-id="' + it.id + '"' + (busy ? ' disabled' : '') + ' title="' + esc(d.name + (busy ? '：' + busy : '')) + '">' + img(R.itemIcon(it.type, it.tier)) + '<span class="n">' + d.name + '</span><span class="price pos">+' + money(sim.sellValue(it)) + '</span></button>';
      }
      html += '</div>';
      return { html };
    },
  };

  function staffDetail(S, s) {
    const m = sim.mood(s);
    let html = '<div class="rowi">' + img(R.staffIcon(s)) + '<div class="main"><h4>' + s.name + ' <span class="tag">' + s.role + '</span>' + (s.trait ? '<span class="tag a" title="' + MR.TRAITS[s.trait].desc + '">' + MR.TRAITS[s.trait].name + '</span>' : '') + (s.owner ? '' : '<span class="tag">' + money(s.wage) + '/天</span>') + '</h4><p>' + esc(sim.describe(S, s)) + '</p></div><div class="side">' + (s.owner ? '' : '<button type="button" class="btn sm" data-act="leave" data-id="' + s.id + '" title="今天不上班、不发工资，心情 -6">' + (s.off ? '叫回来' : '💤 放假') + '</button><button type="button" class="btn sm danger" data-act="fireAsk" data-id="' + s.id + '">辞退</button>') + '<button type="button" class="btn sm" data-act="staffBack">← 返回</button></div></div>';
    html += '<div class="tiles"><div class="tile"><i>😊 心情</i><b>' + m + '</b>' + meter(m / 100, lvl(m, 60, 35)) + '</div><div class="tile"><i>⚡ 体力</i><b>' + Math.round(s.energy) + '</b>' + meter(s.energy / 100, lvl(s.energy, 50, 25)) + '</div></div>';
    html += '<ul class="mods"><li><span>基础</span><b>55</b></li>' + s.mods.map((o) => '<li><span>' + esc(o.label) + '</span><b class="' + (o.v < 0 ? 'neg' : 'pos') + '">' + (o.v > 0 ? '+' : '') + o.v + '</b></li>').join('') + '</ul>';
    html += '<div class="sec">立刻去做一次</div><div class="forces">' + Object.keys(MR.JOBS).map((j) => '<button type="button" class="icobtn" data-act="force" data-id="' + s.id + '" data-job="' + j + '" title="' + MR.JOBS[j].name + '"' + (s.forced === j ? ' style="border-color:var(--amber)"' : '') + '>' + IC[j] + '</button>').join('') + '</div>';
    html += '<div class="sec" title="干得越多涨得越快；刀工、火候受工具档次封顶 66 / 84 / 100">技能</div><div class="skills">' + Object.keys(MR.SKILLS).map((k) => '<span title="' + MR.SKILLS[k] + '">' + SKILL_IC[k] + '<b>' + Math.round(s.skills[k]) + '</b>' + meter(s.skills[k] / 100) + '</span>').join('') + '</div>';
    return html;
  }

  // ================= 检视小卡（点店里的东西） =================
  function hidePop() {
    $('#pop').hidden = true;
    UI.sel = null;
    cache.pop = null;
  }
  UI.hidePop = hidePop;
  function popHtml(S) {
    const sel = UI.sel;
    if (!sel) return null;
    const closeBtn = '<button type="button" class="btn sm" data-act="popClose">✕</button>';
    if (sel.kind === 'item') {
      const it = S.items.find((o) => o.id === sel.id);
      if (!it) return null;
      const d = MR.ITEMS[it.type];
      const up = sim.upgradeCost(S, it);
      const busy = sim.itemBusy(S, it);
      let h = '<div class="head">' + img(R.itemIcon(it.type, it.tier)) + '<div><h3>' + d.name + (d.tiers ? ' <span class="tag a">' + MR.TIER_NAMES[it.tier] + ' ' + TIER_STAR[it.tier] + '</span>' : '') + (it.broken ? ' <span class="tag r">坏了</span>' : '') + (it.dirty ? ' <span class="tag a">待收拾</span>' : '') + '</h3><p>' + d.desc + '</p>' + (d.wear ? '<div title="耐久：低于 30% 会压低上限、高峰易坏" style="display:flex;gap:6px;align-items:center;margin-top:3px">🔧' + meter(it.dur / 100, lvl(it.dur, 60, 30)) + '<b class="num">' + Math.round(it.dur) + '%</b></div>' : '') + '</div></div><div class="row">';
      h += '<button type="button" class="btn sm" data-act="move" data-id="' + it.id + '"' + (busy ? ' disabled' : '') + '>✋ 搬</button>';
      if (up) h += '<button type="button" class="btn sm" data-act="upgrade" data-id="' + it.id + '"' + (up.locked || S.cash < up.cost ? ' disabled' : '') + ' title="' + (up.locked ? '名工档第 5 周或口碑 75 后有货' : '上限更高、更快、更耐用') + '">⬆ ' + MR.TIER_NAMES[it.tier + 1] + ' ' + money(up.cost) + '</button>';
      if (d.wear && (it.broken || it.dur < 70)) h += '<button type="button" class="btn sm" data-act="callRepair" data-id="' + it.id + '"' + (S.cash < 120 ? ' disabled' : '') + ' title="请师傅上门，立刻修好">🔧 ¥120</button>';
      h += '<button type="button" class="btn sm danger" data-act="sell" data-id="' + it.id + '"' + (busy ? ' disabled' : '') + ' title="只回收半价">卖 +' + money(sim.sellValue(it)) + '</button>' + closeBtn + '</div>';
      return h;
    }
    if (sel.kind === 'group') {
      const g = S.groups.find((o) => o.id === sel.id);
      if (!g) return null;
      const ST = { queue: '⏳ 等位', toTable: '入座中', browse: '📖 看菜单', wantOrder: '🙋 等点单', waitFood: '🍜 等上菜 ' + g.served + '/' + g.orders, eating: '😋 正在吃', toCounter: '💰 去结账', wantPay: '💰 等结账', leaving: '离开', vin: '进店', vstay: g.vtype === 'inspector' ? '🔍 检查后厨' : '🏠 来提醒交租' };
      const tks = S.tickets.filter((t) => t.g === g.id).map((t) => MR.DISHES[t.dish].name);
      const done = g.dishes.map((d) => MR.DISHES[d.id].name + ' <b>' + d.total + '</b>');
      const showPat = g.patMax > 1 && ['queue', 'wantOrder', 'waitFood', 'wantPay'].includes(g.state);
      return '<div class="head"><div style="flex:1"><h3>' + esc(g.label) + (g.size > 1 ? ' ×' + g.size : '') + '　' + ST[g.state] + '</h3>' + (showPat ? '<div style="display:flex;gap:6px;align-items:center" title="耐心">⏳' + meter(g.pat / g.patMax, lvl(g.pat / g.patMax, 0.5, 0.25)) + '</div>' : '') + '<p>' + (tks.length ? '在做：' + tks.join('、') : '') + (done.length ? (tks.length ? '<br>' : '') + '已上：' + done.join('、') : '') + '</p></div>' + closeBtn + '</div>';
    }
    if (sel.kind === 'zone') {
      const z = MR.ZONES.find((o) => o.id === sel.id);
      if (!z || S.zones[z.id]) return null;
      return '<div class="head"><div style="flex:1"><h3>🔒 ' + z.name + '</h3><p>一次性解锁，＋' + (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1) + ' 格' + (z.kind === 'kitchen' ? '后厨' : '堂食') + '</p></div></div><div class="row"><button type="button" class="btn sm primary" data-act="buyZone" data-id="' + z.id + '"' + (S.cash < z.price ? ' disabled' : '') + '>🔓 ' + money(z.price) + '</button>' + closeBtn + '</div>';
    }
    return null;
  }
  UI.refreshPop = function () {
    const S = UI.S;
    if (!UI.sel || UI.sel.kind === 'staff') return;
    const h = popHtml(S);
    if (!h) return hidePop();
    if (cache.pop !== h) {
      cache.pop = h;
      $('#pop').innerHTML = h;
    }
    $('#pop').hidden = false;
  };

  // 点店面：人 > 客人 > 物品 > 未解锁区域
  UI.tapTile = function (fx, fy) {
    const S = UI.S;
    const tx = Math.floor(fx),
      ty = Math.floor(fy);
    if (UI.place) return UI.placeAt(tx, ty);
    let best = null,
      bd = 0.75;
    for (const s of S.staff) {
      if (s.off) continue;
      const d = Math.hypot(s.x + 0.5 - fx, s.y + 0.3 - fy);
      if (d < bd) {
        bd = d;
        best = { kind: 'staff', id: s.id };
      }
    }
    if (!best)
      for (const g of S.groups)
        for (const m of g.m) {
          const d = Math.hypot(m.x + 0.5 - fx, m.y + 0.3 - fy);
          if (d < bd) {
            bd = d;
            best = { kind: 'group', id: g.id };
          }
        }
    if (!best && tx >= 0 && ty >= 0 && tx < C.COLS && ty < C.ROWS) {
      const id = S._grid[ty * C.COLS + tx];
      if (id) best = { kind: 'item', id };
      else {
        const z = sim.zoneAt(tx, ty);
        if (z && !S.zones[z.id]) best = { kind: 'zone', id: z.id };
      }
    }
    if (!best) {
      hidePop();
      return;
    }
    if (best.kind === 'staff') {
      hidePop();
      UI.sel = best;
      UI.staffId = best.id;
      UI.flags.viewedStaff = true;
      UI.sheet = 'staff';
      $('#sheet').hidden = false;
      $('#sh-body').scrollTop = 0;
      UI.renderSheet();
      return;
    }
    UI.sel = best;
    cache.pop = null;
    if (UI.sheet) UI.close();
    UI.refreshPop();
  };


  // ================= 放置 =================
  function anchor(type, rot, x, y) {
    if (type === 'table2' || type === 'table4') return rot ? { x, y: y - 1 } : { x: x - 1, y };
    return { x, y };
  }
  UI.startPlace = function (type, moveId) {
    const S = UI.S;
    hidePop();
    UI.close();
    const it = moveId ? S.items.find((o) => o.id === moveId) : null;
    UI.place = { type, rot: it ? it.rot : 0, x: null, y: null, ok: false, why: '', moveId: moveId || 0, tier: it ? it.tier : 0, cx: null, cy: null };
    UI.renderPlace();
  };
  UI.placeAt = function (tx, ty, hover) {
    const p = UI.place;
    const S = UI.S;
    if (!p) return;
    if (!hover && p.cx === tx && p.cy === ty && p.ok) return UI.confirmPlace();
    p.cx = tx;
    p.cy = ty;
    const a = anchor(p.type, p.rot, tx, ty);
    p.x = a.x;
    p.y = a.y;
    const r = sim.canPlace(S, p.type, p.x, p.y, p.rot, p.moveId);
    p.ok = r.ok;
    p.why = r.why || '';
    UI.renderPlace();
  };
  UI.renderPlace = function () {
    const p = UI.place;
    const bar = $('#placebar');
    if (!p) {
      bar.hidden = true;
      return;
    }
    const d = MR.ITEMS[p.type];
    const tip = p.x == null ? '点地面放下' : p.ok ? '✅ 点击放下' : '⛔ ' + p.why;
    bar.innerHTML = img(R.itemIcon(p.type, p.tier)) + '<div><b>' + (p.moveId ? '搬动 ' : '') + d.name + (p.moveId ? '' : ' ' + money(d.price)) + '</b><small class="' + (p.x != null && !p.ok ? 'no' : '') + '">' + tip + '</small></div>' + (d.rot ? '<button type="button" class="btn sm" data-act="rotate" title="旋转（R）">↻</button>' : '') + '<button type="button" class="btn sm primary" data-act="confirmPlace"' + (p.ok ? '' : ' disabled') + '>✓</button><button type="button" class="btn sm" data-act="cancelPlace" title="取消（Esc）">✕</button>';
    bar.hidden = false;
  };
  UI.confirmPlace = function () {
    const p = UI.place;
    const S = UI.S;
    if (!p || !p.ok) return;
    const r = p.moveId ? sim.moveItem(S, p.moveId, p.x, p.y, p.rot) : sim.place(S, p.type, p.x, p.y, p.rot);
    if (!r.ok) return UI.toast(r.why, 'warn');
    UI.place = null;
    UI.renderPlace();
  };
  UI.cancelPlace = function () {
    UI.place = null;
    UI.renderPlace();
  };

  // ================= 弹窗 =================
  function showModal(html) {
    $('#modal-card').innerHTML = html;
    $('#modal').hidden = false;
    $('#modal-card').scrollTop = 0;
  }
  function closeModal() {
    UI.modal = null;
    $('#modal').hidden = true;
  }
  const tile = (ic, v, label, cls) => '<div class="tile"><i>' + ic + '</i><b class="' + (cls || '') + '">' + v + '</b><small>' + label + '</small></div>';
  UI.pump = function () {
    const S = UI.S;
    if (UI.modal || !S || !S.modals.length) return;
    const m = (UI.modal = S.modals.shift());
    if (m.type === 'dayEnd') {
      const r = m.rec;
      const walks = r.walkQueue + r.walkOrder + r.walkFood;
      const sunday = r.dow === 6 && !r.bought;
      const ok = r.cash >= r.rent;
      const rentBox = r.bought ? '' : '<div class="box ' + (ok ? (sunday ? 'g' : '') : 'r') + '">🏠 ' + (sunday ? '<b>房东来收租</b>　' : '⏳ ' + r.daysLeft + ' 天　') + money(r.cash) + ' / ' + money(r.rent) + meter(r.cash / r.rent, ok ? 'g' : 'r') + (ok ? '' : '<b class="neg">还差 ' + money(r.rent - r.cash) + '</b>') + '</div>';
      showModal('<h2>🌙 第 ' + r.day + ' 天打烊</h2><p class="sub">第 ' + r.week + ' 周 · ' + C.WEEKDAYS[r.dow] + '</p><div class="tiles">' + tile('💵', money(r.rev), '营业额') + tile('🥬', neg(r.food), '进货') + tile('👥', neg(r.wages), '工资') + tile('💡', neg(r.util + r.repair + r.fines + r.other), '水电杂费') + '</div><dl class="kv"><dt class="tot">今日盈亏</dt><dd class="tot ' + (r.operating < 0 ? 'neg' : 'pos') + '">' + (r.operating < 0 ? '-' : '+') + money(Math.abs(r.operating)) + '</dd>' + (r.build ? '<dt>🔨 建造</dt><dd>' + neg(r.build) + '</dd>' : '') + '</dl><div class="tiles" style="margin-top:8px">' + tile('😊', r.groups + ' 桌', '接待') + tile('😠', walks + ' 桌', '走掉', walks ? 'neg' : '') + tile('⭐', r.dishes ? Math.round(r.scoreSum / r.dishes) : '—', r.dishes + ' 道均分') + tile('🗑️', money(r.waste), '损耗', r.waste >= 30 ? 'neg' : '') + '</div>' + (r.quits.length ? '<div class="box r">' + r.quits.join('、') + ' 辞职了</div>' : '') + (r.hint ? '<p style="margin-top:8px">💡 ' + esc(r.hint) + '</p>' : '') + rentBox + '<div class="actions"><button type="button" class="btn primary" data-act="dayNext">' + (sunday ? '🏠 交房租' : '☀️ 下一天') + '</button></div>');
    } else if (m.type === 'rent') {
      const est = sim.estimateWeeks(S);
      showModal('<span class="stamp g">已交租</span><h2>活过第 ' + m.week + ' 个周日</h2><div class="hero neg">-' + money(m.rent) + '</div><div class="tiles">' + tile('💰', money(m.after), '交租后') + tile('📈', (m.net < 0 ? '-' : '+') + money(Math.abs(m.net)), '本周结余', m.net < 0 ? 'neg' : 'pos') + tile('🏠', money(m.next), '下周房租 +' + C.RENT_STEP, 'neg') + '</div><div class="box">🔑 <b>' + money(m.after) + ' / ' + money(C.BUYOUT) + '</b>' + meter(m.after / C.BUYOUT) + (m.week === 1 ? '攒够就能买下铺子，不再交租。买断价不涨。' : est === Infinity ? '这两周没攒下钱。不扩建会被涨租勒死。' : est ? '按近两周速度，约 ' + est + ' 周' : '') + '</div><div class="actions"><button type="button" class="btn primary" data-act="modalClose">继续</button></div>');
    } else if (m.type === 'gameOver') {
      UI.setSpeed(0);
      clearSave();
      showModal('<span class="stamp">倒闭</span><h2>交不起房租，小馆关门了</h2><p class="sub">房租 ' + money(m.rent) + '，手里只有 ' + money(m.cash) + '</p><div class="tiles">' + tile('📅', m.day + ' 天', '经营') + tile('⭐', m.rep, '最高口碑') + tile('🏠', money(m.rentPaid), '交过的租') + tile('🔑', money(m.short), '离买断还差') + '</div><div class="box r"><b>失败主因</b><br>' + esc(m.cause) + '</div><div class="actions"><button type="button" class="btn primary" data-act="restart">重开一局</button></div>');
    } else if (m.type === 'victory') {
      UI.setSpeed(0);
      showModal('<span class="stamp g">买下了</span><h2>🔑 这间铺子是你的了</h2><p class="sub">第 ' + m.week + ' 周 · 第 ' + m.day + ' 天</p><p>从今天起，周日 22:00 只是一个普通的打烊时间。</p><div class="tiles">' + tile('🏠', money(m.rentPaid), '交过的租') + tile('⭐', m.rep, '最高口碑') + tile('💰', money(m.cash), '手里还剩') + '</div><div class="actions"><button type="button" class="btn" data-act="restart">新开一局</button><button type="button" class="btn primary" data-act="modalClose">继续经营</button></div>');
    } else if (m.type === 'choice') {
      showModal('<h2>' + esc(m.title) + '</h2><p>' + esc(m.text) + '</p><div class="choice">' + m.options.map((o, i) => '<button type="button" data-act="choose" data-i="' + i + '"><b>' + esc(o.label) + '</b><small>' + esc(o.desc) + '</small></button>').join('') + '</div>');
    }
  };
  function buyoutDialog() {
    const S = UI.S;
    UI.modal = { type: 'buyout' };
    const r = sim.canBuyout(S);
    const est = sim.estimateWeeks(S);
    if (S.bought) return showModal('<h2>🔑 铺子已经是你的了</h2><div class="actions"><button type="button" class="btn primary" data-act="modalClose">好</button></div>');
    showModal('<h2>🔑 向房东买下店铺</h2><p class="sub">买断价开局锁定，不随房租上涨</p><div class="hero">' + money(S.cash) + ' <small style="font-size:16px;color:var(--muted)">/ ' + money(C.BUYOUT) + '</small></div>' + meter(S.cash / C.BUYOUT) + '<div class="box">' + (r.ok ? '钱够了。买下后<b>永远不再交租</b>，未解锁的空间也归你。' : esc(r.why) + (est && est !== Infinity ? '　按近两周速度约 ' + est + ' 周' : '')) + '</div><div class="actions"><button type="button" class="btn" data-act="modalClose">再等等</button><button type="button" class="btn primary" data-act="buyout"' + (r.ok ? '' : ' disabled') + '>买下 -' + money(C.BUYOUT) + '</button></div>');
  }
  function confirmDialog(title, text, act, data, label) {
    UI.modal = { type: 'confirm' };
    showModal('<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="actions"><button type="button" class="btn" data-act="modalClose">取消</button><button type="button" class="btn danger" data-act="' + act + '" ' + Object.keys(data).map((k) => 'data-' + k + '="' + data[k] + '"').join(' ') + '>' + esc(label) + '</button></div>');
  }

  // ================= 引导（第一天） =================
  const TUT = [
    { text: '左上角是命脉：💰 现金、🏠 本周房租（周日 22:00 扣，不够就倒闭）、🧾 扣租后结余。🧾 变红就危险。', hl: '#tl', btn: '知道了' },
    { text: '先进货：点 📦 →「🛒 补货」。', hl: '#nav [data-sheet="stock"]', until: (S) => S.deliveries.length > 0 || MR.ING_ORDER.some((k) => sim.stockQty(S, k) > 0) },
    { text: '点 👥 看工作表：数字越小越先做，✕ 是不做。点格子就能改。', hl: '#nav [data-sheet="staff"]', until: () => UI.sheet === 'staff' || UI.flags.viewedStaff, skip: '跳过' },
    { text: '试一次摆放：🔨 → 等待椅（¥120）→ 点堂食地面。绿色可放，红色不行。', hl: '#nav [data-sheet="build"]', until: (S) => (S.flags.placed || 0) > 0, skip: '不买，跳过' },
    { text: '开门：点右下角 ▶（或按空格）。11:00 午市开始。', hl: '#speed', until: () => UI.speed > 0 },
    { when: (S) => S.flags.ordered, text: '第一单来了。底栏这排数字是各工位排着几单，哪个大，瓶颈就在哪。', hl: '#rail', btn: '知道了' },
    { when: (S) => S.flags.rated, text: '菜上桌了，飘出来的是综合分。📒 →「评价」能看五项细分。', hl: '#nav [data-sheet="ledger"]', until: () => UI.flags.viewedRatings, skip: '以后再看', enter: () => (UI.tab.ledger = 'rate') },
    { when: (S) => S.day >= 2, text: '日结不扣租，真正的坎是周日 22:00。之后跟着右上角 🎯 走。', btn: '开始经营' },
  ];
  UI.coach = function () {
    const S = UI.S;
    const box = $('#coach');
    if (!S || S.tut.done || S.over) {
      if (!box.hidden) {
        box.hidden = true;
        clearHl();
      }
      return;
    }
    const st = TUT[S.tut.step];
    if (!st) {
      S.tut.done = true;
      return;
    }
    if (st.when && !st.when(S)) {
      box.hidden = true;
      clearHl();
      return;
    }
    if (st.until && st.until(S)) return nextTut();
    if (cache.tut !== S.tut.step) {
      cache.tut = S.tut.step;
      if (st.enter) st.enter();
      box.innerHTML = '<div>' + st.text + '</div><div class="row"><button type="button" data-act="tutEnd">关掉引导</button>' + (st.skip ? '<button type="button" data-act="tutNext">' + st.skip + '</button>' : '') + (st.btn ? '<button type="button" class="go" data-act="tutNext">' + st.btn + '</button>' : '') + '</div>';
      clearHl();
      if (st.hl) {
        const el = $(st.hl);
        if (el) el.classList.add('hl');
      }
    }
    box.hidden = false;
  };
  function clearHl() {
    for (const el of document.querySelectorAll('.hl')) el.classList.remove('hl');
    cache.tut = null;
  }
  function nextTut() {
    const S = UI.S;
    S.tut.step++;
    clearHl();
    if (S.tut.step >= TUT.length) S.tut.done = true;
  }

  // ================= 存档 =================
  const SAVE_KEY = 'xiaoguan-save-v1';
  UI.save = function () {
    try {
      localStorage.setItem(SAVE_KEY, sim.serialize(UI.S));
    } catch (e) {
      /* 存不了就算了，不影响玩 */
    }
  };
  UI.loadSave = function () {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return null;
    }
  };
  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      /* 忽略 */
    }
  }

  // ================= 开局 / 速度 =================
  UI.setSpeed = function (v) {
    if (v > 0) UI.lastSpeed = v;
    UI.speed = v;
  };
  UI.begin = function (S) {
    UI.S = S;
    UI.logSeen = S.logN || 0;
    UI.flags = {};
    UI.place = null;
    UI.sel = null;
    UI.modal = null;
    UI.staffId = null;
    for (const k in cache) delete cache[k];
    $('#title').hidden = true;
    $('#modal').hidden = true;
    $('#pop').hidden = true;
    $('#toasts').innerHTML = '';
    UI.renderPlace();
    UI.setSpeed(0);
    UI.sheet = null;
    $('#sheet').hidden = true;
    UI.hud();
  };

  // ================= 操作 =================
  const fail = (r) => {
    if (r && !r.ok && r.why) UI.toast(r.why, 'warn');
    return r && r.ok;
  };
  const ACT = {
    speed(d) {
      UI.setSpeed(Number(d.v));
    },
    open(d) {
      UI.open(d.sheet);
    },
    close() {
      UI.close();
    },
    tab(d) {
      UI.tab[UI.sheet] = d.v;
      $('#sh-body').scrollTop = 0;
    },
    buy(d) {
      UI.startPlace(d.id);
    },
    buyZone(d) {
      if (fail(sim.buyZone(UI.S, d.id))) hidePop();
    },
    buyQR() {
      fail(sim.buyQR(UI.S));
    },
    rotate() {
      const p = UI.place;
      if (!p) return;
      p.rot = p.rot ? 0 : 1;
      if (p.cx != null) UI.placeAt(p.cx, p.cy, true);
      else UI.renderPlace();
    },
    confirmPlace() {
      UI.confirmPlace();
    },
    cancelPlace() {
      UI.cancelPlace();
    },
    move(d) {
      const it = UI.S.items.find((o) => o.id === Number(d.id));
      if (it) UI.startPlace(it.type, it.id);
    },
    upgrade(d) {
      fail(sim.upgradeItem(UI.S, Number(d.id)));
    },
    callRepair(d) {
      fail(sim.callRepair(UI.S, Number(d.id)));
    },
    sell(d) {
      const it = UI.S.items.find((o) => o.id === Number(d.id));
      if (!it) return;
      confirmDialog('卖掉「' + MR.ITEMS[it.type].name + '」？', '只回收半价 ' + money(sim.sellValue(it)) + '。卖掉后对应的工位或座位就没了。', 'sellYes', { id: it.id }, '卖掉 +' + money(sim.sellValue(it)));
    },
    sellYes(d) {
      closeModal();
      if (fail(sim.sellItem(UI.S, Number(d.id)))) hidePop();
    },
    popClose() {
      hidePop();
    },
    price(d) {
      const m = UI.S.menu[d.id];
      sim.setPrice(UI.S, d.id, m.price + Number(d.d));
    },
    toggleDish(d) {
      const m = UI.S.menu[d.id];
      m.on = !m.on;
    },
    research(d) {
      fail(sim.startResearch(UI.S, d.id));
    },
    target(d) {
      sim.setTarget(UI.S, d.id, UI.S.targets[d.id] + Number(d.d));
    },
    restock() {
      fail(sim.restockNow(UI.S));
    },
    autoRestock() {
      UI.S.autoRestock = !UI.S.autoRestock;
    },
    suggest() {
      if (!sim.suggestTargets(UI.S)) UI.toast('还没有昨天的用量记录', 'warn');
    },
    staff(d) {
      UI.staffId = Number(d.id);
      UI.flags.viewedStaff = true;
      UI.sel = { kind: 'staff', id: UI.staffId };
      $('#sh-body').scrollTop = 0;
    },
    staffBack() {
      UI.staffId = null;
      UI.sel = null;
    },
    prioCycle(d) {
      const s = UI.S.staff.find((o) => o.id === Number(d.id));
      if (!s) return;
      const order = [1, 2, 3, 4, 0];
      const i = order.indexOf(s.prio[d.job]);
      sim.setPrio(UI.S, s.id, d.job, order[(i + (d.dir === '-1' ? 4 : 1)) % 5]);
      UI.flags.viewedStaff = true;
    },
    rotateOk() {
      UI.flags.rotateOk = true;
      $('#rotate').hidden = true;
    },
    prio(d) {
      sim.setPrio(UI.S, Number(d.id), d.job, Number(d.v));
    },
    force(d) {
      sim.force(UI.S, Number(d.id), d.job);
      UI.toast(MR.ICON[d.job] + ' 已下令：有这类活时先去做一次', '');
    },
    leave(d) {
      const s = UI.S.staff.find((o) => o.id === Number(d.id));
      if (s) sim.setLeave(UI.S, s.id, !s.off);
    },
    hire(d) {
      fail(sim.hire(UI.S, Number(d.i)));
    },
    fireAsk(d) {
      const s = UI.S.staff.find((o) => o.id === Number(d.id));
      if (s) confirmDialog('辞退 ' + s.name + '？', '他今天的工资不用发了，其他员工的心情会受点影响。', 'fireYes', { id: s.id }, '辞退');
    },
    fireYes(d) {
      closeModal();
      sim.fire(UI.S, Number(d.id));
      UI.staffId = null;
    },
    buyoutOpen() {
      buyoutDialog();
    },
    buyout() {
      closeModal();
      fail(sim.buyout(UI.S));
    },
    modalClose() {
      closeModal();
    },
    dayNext() {
      closeModal();
      sim.proceed(UI.S);
      UI.flags.dayClosed = true;
    },
    choose(d) {
      const m = UI.modal;
      closeModal();
      sim.choose(UI.S, m, Number(d.i));
    },
    tutNext() {
      nextTut();
    },
    tutEnd() {
      UI.S.tut.done = true;
    },
    story(d) {
      UI.story = d.v;
      for (const b of document.querySelectorAll('#story button')) b.classList.toggle('on', b.dataset.v === d.v);
    },
    newGame() {
      UI.begin(sim.newGame({ story: UI.story, noTutorial: $('#skip-tut').checked }));
    },
    continue() {
      const j = UI.loadSave();
      if (!j) return;
      try {
        UI.begin(sim.restore(j));
      } catch (e) {
        clearSave();
        UI.toast('存档读不出来，开一局新的吧', 'warn');
      }
    },
    restart() {
      closeModal();
      clearSave();
      UI.S = null;
      $('#btn-continue').hidden = true;
      $('#title').hidden = false;
    },
  };
  UI.act = function (name, data) {
    if (!ACT[name]) return;
    ACT[name](data || {});
    if (UI.S) {
      UI.hud();
      UI.renderSheet();
      UI.refreshPop();
      UI.coach();
      UI.pump();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
