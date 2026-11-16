/* 一间小馆 · 界面（常驻栏、面板、放置、弹窗、引导与目标）
 * 一次只处于「浏览 / 查看面板 / 放置」三种状态之一。 */
(function (root) {
  'use strict';
  const MR = root.MR;
  const C = MR.C;
  const sim = MR.sim;
  const money = sim.money;
  const neg = (n) => (Math.round(n) > 0 ? '-' : '') + money(n);
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const APRON = ['#c5382c', '#2f7fb5', '#d9951a', '#7a5fb0', '#2e9a78', '#c15a8a'];

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

  // ================= 常驻栏 =================
  function leftText(S) {
    const m = sim.minutesToRent(S);
    const d = Math.floor(m / 1440);
    if (d >= 1) return '还有 ' + d + ' 天扣租';
    const h = Math.max(0, Math.ceil(m / 60));
    return '今晚扣 · 还有 ' + h + ' 小时';
  }
  UI.hud = function () {
    const S = UI.S;
    if (!S) return;
    set('#d-week', '第 ' + sim.week(S) + ' 周');
    set('#d-day', C.WEEKDAYS[sim.dow(S)]);
    set('#d-time', sim.clockText(S));
    set('#d-phase', sim.PHASE_NAMES[sim.phase(S)] + (UI.speed && sim.fastForward(S) ? ' · 快进' : ''));
    const ev = S.ev.weather === 'rain' ? '暴雨' : S.ev.festival ? '节庆' : '';
    set('#d-ev', ev);
    set('#d-ev', !ev, 'hidden');
    set('#s-cash', money(S.cash));
    if (S.bought) {
      set('#s-rent', '免租');
      set('#s-left', '铺子是你的');
      set('#s-after', money(S.cash));
      set('#st-after', 'stat ok', 'class');
    } else {
      const rent = sim.rent(S);
      set('#s-rent', money(rent));
      set('#s-left', leftText(S));
      const after = S.cash - rent;
      set('#s-after', (after < 0 ? '-' : '') + money(Math.abs(after)));
      set('#st-after', 'stat ' + (after < 0 ? 'bad' : after < rent * 0.25 ? 'warn' : 'ok'), 'class');
    }
    set('#s-rep', String(Math.round(S.rep)));
    set('#s-seats', sim.seats(S) + ' 座 · 环境 ' + sim.env(S));
    // 买断进度
    if (S.bought) {
      set('#b-fill', '100%', 'width');
      set('#b-text', '已买下');
      set('#buyout', '', 'class');
    } else {
      set('#b-fill', Math.min(100, (S.cash / C.BUYOUT) * 100).toFixed(1) + '%', 'width');
      const est = sim.estimateWeeks(S);
      set('#b-text', money(S.cash) + ' / ' + money(C.BUYOUT) + (est == null || est === Infinity || S.cash >= C.BUYOUT ? '' : ' · 约 ' + est + ' 周'));
      set('#buyout', S.cash >= C.BUYOUT ? 'ready' : '', 'class');
    }
    // 交租预警
    const al = sim.rentAlert(S);
    if (al) {
      const short = sim.rent(S) - S.cash;
      set('#alert', al === 2 ? 'r' : 'y', 'class');
      set('#alert', '<span>' + (al === 2 ? (sim.dow(S) === 6 ? '今晚 22:00 交租，还差 ' : '明晚就交租，还差 ') : '本周租金尚未备齐，还差 ') + money(short) + '</span>' + (al === 2 ? '<button type="button" data-act="open" data-sheet="emergency">应急手段</button>' : ''), 'html');
    }
    set('#alert', !al, 'hidden');
    // 工位排队
    const p = sim.pipeline(S);
    const cells = [
      ['等位', p.queue],
      ['点单', p.order],
      ['洗', p.wash],
      ['切', p.cut],
      ['灶', p.cook + p.heat],
      ['盘', p.plate],
      ['送', p.ready],
      ['饮', p.mix],
      ['结账', p.pay],
    ];
    set('#rail', cells.map((c) => '<span class="st' + (c[1] >= 4 ? ' h' : c[1] >= 2 ? ' w' : '') + '">' + c[0] + '<b>' + c[1] + '</b></span>').join(''), 'html');
    set('#goal', goals(S).map((g) => '<span><i>目标</i>' + esc(g) + '</span>').join(''), 'html');
    for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', Number(b.dataset.v) === UI.speed);
    for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.sheet === UI.sheet);
    toasts(S);
  };

  // 同时只推一两条短目标
  function goals(S) {
    const out = [];
    if (S.over) return out;
    if (S.bought) return ['铺子是你的了，自由经营吧'];
    const rent = sim.rent(S);
    const y = S.days[S.days.length - 1];
    if (S.cash >= C.BUYOUT) out.push(sim.dow(S) === 6 ? '钱够了，周一点「买断进度」买下店铺' : '钱够了！点「买断进度」买下店铺');
    else if (S.cash < rent) out.push('在周日 22:00 前备齐房租：还差 ' + money(rent - S.cash));
    else out.push('房租已备齐。买东西前先看「扣租后结余」');
    if (out.length < 2 && S.cash < C.BUYOUT) {
      const walks = y ? y.walkQueue + y.walkOrder + y.walkFood : 0;
      if (!sim.stationCount(S, 'sink')) out.push('洗菜最慢，买个水池（¥350）');
      else if (y && y.walkQueue >= 4 && sim.seats(S) < 12) out.push('昨天 ' + y.walkQueue + ' 桌等不到位子走了，加一套桌椅');
      else if (!sim.stationCount(S, 'pass')) out.push('买个出餐台（¥300），摆盘更快');
      else if (y && y.walkFood + y.walkOrder >= 2) out.push('昨天 ' + (y.walkFood + y.walkOrder) + ' 桌等太久走了，' + (S.staff.length < 3 ? '加砧板、第二口锅或人手' : '看哪一截队伍最长'));
      else if (S.items.some((it) => it.broken)) out.push('有设备坏了，点它派人修或请师傅');
      else if (S.rep >= 42 && !S.research && MR.DISH_ORDER.some((id) => !S.menu[id].unlocked) && (S.flags.researched || 0) < 2) out.push('口碑起来了，去「菜单」研发新菜提高客单价');
      else if (S.cash > MR.rentOf(sim.week(S) + 1) * 2) out.push('余钱开始算买断进度：' + money(S.cash) + ' / ' + money(C.BUYOUT));
      else if (walks === 0 && y && sim.env(S) < 8) out.push('出餐稳了，摆点绿植灯具提升环境分');
    }
    return out.slice(0, 2);
  }

  function toasts(S) {
    const box = $('#toasts');
    for (const l of S.log) {
      if (l.n <= UI.logSeen) continue;
      UI.logSeen = l.n;
      if (!l.toast) continue;
      UI.toast(l.text, l.kind);
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

  // ================= 面板 =================
  const TITLES = { build: '建造', menu: '菜单', stock: '采购与仓储', staff: '员工', ledger: '账本', emergency: '应急手段' };
  UI.open = function (name, tab) {
    if (UI.place) UI.cancelPlace();
    hidePop();
    if (UI.sheet === name && !tab && !UI.wide) return UI.close();
    UI.sheet = name;
    if (tab) UI.tab[name] = tab;
    if (name !== 'staff') UI.staffId = null;
    $('#sheet').hidden = false;
    $('#sh-body').scrollTop = 0;
    UI.renderSheet();
  };
  UI.close = function () {
    if (UI.wide) {
      if (UI.sheet !== 'ledger') UI.open('ledger');
      return;
    }
    UI.sheet = null;
    UI.staffId = null;
    $('#sheet').hidden = true;
  };
  UI.renderSheet = function () {
    const S = UI.S;
    if (!UI.sheet || !S) return;
    set('#sh-title', UI.sheet === 'staff' && UI.staffId ? '员工' : TITLES[UI.sheet]);
    const v = SHEETS[UI.sheet](S);
    const tabs = (v.tabs || []).map((t) => '<button type="button" data-act="tab" data-v="' + t[0] + '" class="' + (t[0] === UI.tab[UI.sheet] ? 'on' : '') + '">' + t[1] + '</button>').join('');
    set('#sh-tabs', tabs, 'html');
    set('#sh-tabs', !tabs, 'hidden');
    const body = $('#sh-body');
    if (cache.body !== v.html) {
      cache.body = v.html;
      const st = body.scrollTop;
      body.innerHTML = v.html;
      body.scrollTop = st;
    }
  };

  const meter = (f, cls) => '<div class="meter ' + (cls || '') + '"><i style="width:' + Math.round(Math.max(0, Math.min(1, f)) * 100) + '%"></i></div>';
  const afterNote = (S, cost) => {
    if (S.bought) return '';
    const a = S.cash - cost - sim.rent(S);
    return '买后扣租结余 <b class="' + (a < 0 ? 'neg' : '') + '">' + (a < 0 ? '-' : '') + money(Math.abs(a)) + '</b>';
  };

  const SHEETS = {
    build(S) {
      const cats = MR.ITEM_CATS.concat(['空间与升级']);
      const tab = UI.tab.build;
      let html = '';
      if (tab === '空间与升级') {
        html += '<div class="sec">向房东解锁空间（一次性，不是房租）</div>';
        for (const z of MR.ZONES) {
          if (!z.price) continue;
          const own = S.zones[z.id];
          html += '<div class="row-item"><div class="ic">' + z.name[0] + '</div><div class="main"><h4>' + z.name + (own ? ' <span class="tag g">已解锁</span>' : '') + '</h4><p>' + (z.kind === 'kitchen' ? '后厨可用地面 +' : '堂食可用地面 +') + (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1) + ' 格' + (own ? '' : ' · ' + afterNote(S, z.price)) + '</p></div><div class="side"><span class="price">' + money(z.price) + '</span>' + (own ? '' : '<button type="button" class="btn sm primary" data-act="buyZone" data-id="' + z.id + '"' + (S.cash < z.price ? ' disabled' : '') + '>解锁</button>') + '</div></div>';
        }
        html += '<div class="sec">点单</div>';
        const open = sim.qrOpen(S);
        html += '<div class="row-item"><div class="ic">码</div><div class="main"><h4>扫码桌牌 + 基础设备' + (S.qr ? ' <span class="tag g">已装好</span>' : open ? '' : ' <span class="tag">第 3 周或口碑 60 解锁</span>') + '</h4><p>客人自己扫码点单、吃完桌上结账，服务员只管上菜和收桌' + (S.qr || !open ? '' : ' · ' + afterNote(S, MR.QR_PRICE)) + '</p></div><div class="side"><span class="price">' + money(MR.QR_PRICE) + '</span>' + (S.qr ? '' : '<button type="button" class="btn sm primary" data-act="buyQR"' + (!open || S.cash < MR.QR_PRICE ? ' disabled' : '') + '>购买</button>') + '</div></div>';
        html += '<div class="note"><b>搬动、升档、修理、出售：</b>直接点店里的物品。卖出只回收半价，别靠倒卖家具凑房租。<br>升档：实用 → 专业 → 名工（名工档第 5 周或口碑 75 后有货）。工具档次决定刀工 / 火候的上限，也决定员工技能能练到多高（66 / 84 / 100）。</div>';
        return { tabs: cats.map((c) => [c, c]), html };
      }
      html += '<div class="note">所有扩建都不加周租，代价是现金：每买一样，本周的安全垫和买断进度就薄一分。' + (S.bought ? '' : '现在扣租后结余 <b>' + money(sim.afterRent(S)) + '</b>。') + '</div>';
      for (const id in MR.ITEMS) {
        const d = MR.ITEMS[id];
        if (d.cat !== tab) continue;
        const n = S.items.filter((it) => it.type === id).length;
        html += '<div class="row-item"><div class="ic">' + (d.label || d.name[0]) + '</div><div class="main"><h4>' + d.name + (n ? ' <span class="tag">已有 ' + n + '</span>' : '') + (d.tiers ? ' <span class="tag">可升档</span>' : '') + '</h4><p>' + d.desc + '</p></div><div class="side"><span class="price">' + money(d.price) + '</span><button type="button" class="btn sm primary" data-act="buy" data-id="' + id + '"' + (S.cash < d.price ? ' disabled' : '') + '>买并摆放</button></div></div>';
      }
      return { tabs: cats.map((c) => [c, c]), html };
    },

    menu(S) {
      const tab = UI.tab.menu;
      let html = '';
      if (S.research) {
        const r = S.research;
        html += '<div class="note">正在研发「<b>' + MR.DISHES[r.dish].name + '</b>」　' + Math.round((r.done / r.need) * 100) + '%' + meter(r.done / r.need) + '<span>非营业时段（备菜、午休、打烊）由排了「研发」的人去试菜。</span></div>';
      }
      const ST = { nostock: ['缺料', 'r'], nostation: ['缺设备', 'r'], broken: ['设备坏了', 'r'], off: ['已下架', ''], ok: ['在售', 'g'] };
      for (const id of MR.DISH_ORDER) {
        const d = MR.DISHES[id];
        if (d.cat !== tab) continue;
        const m = S.menu[id];
        const cost = sim.dishCost(id);
        const stName = d.cat === 'drink' && !d.needBar ? '饮品台（没有也能现沏，慢且分低）' : MR.ITEMS[d.station].name;
        const ing = Object.keys(d.ing).map((k) => MR.INGREDIENTS[k].name + '×' + d.ing[k]).join(' ');
        if (!m.unlocked) {
          const busy = S.research && S.research.dish === id;
          html += '<div class="row-item"><div class="ic">' + d.method + '</div><div class="main"><h4>' + d.name + ' <span class="tag">未研发</span></h4><p>' + d.method + ' · 需要' + stName + ' · ' + ing + ' · 参考价 ' + money(d.ref) + '</p></div><div class="side"><span class="price">' + money(d.research.cost) + '</span><button type="button" class="btn sm" data-act="research" data-id="' + id + '"' + (S.research || S.cash < d.research.cost ? ' disabled' : '') + '>' + (busy ? '研发中' : '研发') + '</button></div></div>';
          continue;
        }
        const st = ST[sim.dishStatus(S, id)];
        const feel = sim.priceFeel(S, id);
        const avg = m.n ? Math.round(m.sum) : null;
        const tier = avg != null ? MR.tierOf(avg) : null;
        html += '<div class="row-item"><div class="ic">' + d.method + '</div><div class="main"><h4>' + d.name + ' <span class="tag ' + st[1] + '">' + st[0] + '</span>' + (tier ? ' <span class="tag">近期 ' + avg + ' ' + tier.name + '</span>' : '') + '</h4><p>' + stName + ' · ' + ing + ' · 进价 ' + money(cost) + ' · 已卖 ' + m.sold + '</p><p>定价感受：<span class="' + (feel.k === 'bad' ? 'neg' : feel.k === 'ok' ? 'pos' : '') + '">' + feel.t + '</span>（心理价位约 ' + money(sim.fairPrice(S, id)) + '）</p></div><div class="side"><div class="stepper"><button type="button" data-act="price" data-id="' + id + '" data-d="-1" aria-label="降价">−</button><b>' + money(m.price) + '</b><button type="button" data-act="price" data-id="' + id + '" data-d="1" aria-label="涨价">+</button></div><button type="button" class="btn sm" data-act="toggleDish" data-id="' + id + '">' + (m.on ? '下架' : '上架') + '</button></div></div>';
      }
      html += '<div class="note">售价由你定。出品越好，客人的心理价位越高；定得比心理价位贵，点的人变少、满意度下降。</div>';
      return { tabs: Object.keys(MR.CAT_NAMES).map((k) => [k, MR.CAT_NAMES[k]]), html };
    },

    stock(S) {
      const caps = sim.storage(S);
      const u = S.storeUse;
      const plan = sim.restockPlan(S);
      let html = '<div class="note">常温 <b>' + Math.round(u.shelf) + '/' + caps.shelf + '</b>　冷藏 <b>' + Math.round(u.fridge) + '/' + caps.fridge + '</b>　冷冻 <b>' + Math.round(u.freezer) + '/' + caps.freezer + '</b>' + (u.floor > 0 ? '　<b class="neg">堆在地上 ' + Math.round(u.floor) + '（坏得快一倍，检查会罚款）</b>' : '') + '</div>';
      for (const k of MR.ING_ORDER) {
        const ing = MR.INGREDIENTS[k];
        const q = sim.stockQty(S, k);
        const f = sim.stockFresh(S, k);
        let pend = 0;
        for (const d of S.deliveries) pend += d.items[k] || 0;
        html += '<div class="row-item"><div class="ic">' + ing.name[0] + '</div><div class="main"><h4>' + ing.name + ' <span class="tag">库存 ' + q + (pend ? ' +' + pend + ' 在路上' : '') + '</span><span class="tag">单价 ' + money(ing.price) + '</span></h4><p>新鲜度' + (q ? '（最旧一批 ' + Math.round(f.min * 100) + '%）' : '') + ' · 常温可放 ' + ing.life + ' 天</p>' + (q ? meter(f.avg, f.min < 0.25 ? 'r' : f.min < 0.5 ? 'a' : 'g') : '') + '</div><div class="side"><span class="tag">每日补到</span><div class="stepper"><button type="button" data-act="target" data-id="' + k + '" data-d="-2" aria-label="减少">−</button><b>' + S.targets[k] + '</b><button type="button" data-act="target" data-id="' + k + '" data-d="2" aria-label="增加">+</button></div></div></div>';
      }
      html += '<div class="row-item" style="border:0;gap:8px;flex-wrap:wrap"><button type="button" class="btn primary" data-act="restock"' + (plan.cost <= 0 ? ' disabled' : '') + '>补货到目标' + (plan.cost > 0 ? '　' + money(plan.cost) : '') + '</button><button type="button" class="btn" data-act="autoRestock">每早自动补货：' + (S.autoRestock ? '开' : '关') + '</button><button type="button" class="btn" data-act="suggest">按昨日用量设目标</button></div>';
      html += '<div class="note">现在下单约 25 分钟到货。食材过期就直接损耗；临期的会先拿去做员工餐。冷藏柜、冷冻柜能把保质期拉长 2.2 / 4 倍。</div>';
      return { html };
    },

    staff(S) {
      if (UI.staffId) {
        const s = S.staff.find((o) => o.id === UI.staffId);
        if (s) return { html: staffDetail(S, s) };
        UI.staffId = null;
      }
      const tabs = [
        ['team', '在职 ' + S.staff.length],
        ['hire', '招聘'],
      ];
      let html = '';
      if (UI.tab.staff === 'hire') {
        html += '<div class="note">每天来三位应聘的人。雇用收 ' + money(sim.HIRE_FEE) + ' 中介费，工资按天在打烊时发。要和当前瓶颈匹配，不是见人就雇。</div>';
        S.candidates.forEach((c, i) => {
          const top = Object.keys(c.skills)
            .sort((a, b) => c.skills[b] - c.skills[a])
            .slice(0, 4)
            .map((k) => MR.SKILLS[k] + ' ' + Math.round(c.skills[k]))
            .join(' · ');
          html += '<div class="row-item"><div class="avatar" style="background:' + APRON[(S.staff.length + i) % 6] + '">' + c.name[c.name.length - 1] + '</div><div class="main"><h4>' + c.name + ' <span class="tag">' + c.role + '</span>' + (c.trait ? '<span class="tag a">' + MR.TRAITS[c.trait].name + '</span>' : '') + '</h4><p>' + top + '</p>' + (c.trait ? '<p>' + MR.TRAITS[c.trait].desc + '</p>' : '') + (c.arch === 'apprentice' ? '<p>学徒：工资低、出错多，但技能涨得快 2.5 倍</p>' : '') + '</div><div class="side"><span class="price">' + money(c.wage) + '/天</span><button type="button" class="btn sm primary" data-act="hire" data-i="' + i + '"' + (S.cash < sim.HIRE_FEE ? ' disabled' : '') + '>雇用</button></div></div>';
        });
        if (!S.candidates.length) html += '<div class="note">今天的人都见完了，明天再来看。</div>';
        return { tabs, html };
      }
      let wage = 0;
      for (const s of S.staff) {
        const m = sim.mood(s);
        if (!s.owner && !s.off) wage += s.wage;
        html += '<button type="button" class="staff-card" data-act="staff" data-id="' + s.id + '"><span class="avatar" style="background:' + APRON[s.color % 6] + '">' + (s.owner ? '店' : s.name[s.name.length - 1]) + '</span><span class="main"><h4>' + s.name + ' <span class="tag">' + s.role + '</span>' + (s.trait ? '<span class="tag a">' + MR.TRAITS[s.trait].name + '</span>' : '') + (s.off ? '<span class="tag r">放假</span>' : '') + '</h4><p>' + esc(sim.describe(S, s)) + (s.owner ? '' : ' · 日薪 ' + money(s.wage)) + '</p><span class="bars"><span>心情</span>' + meter(m / 100, m >= 60 ? 'g' : m >= 35 ? 'a' : 'r') + '<b>' + m + '</b><span>体力</span>' + meter(s.energy / 100, s.energy >= 50 ? 'g' : s.energy >= 25 ? 'a' : 'r') + '<b>' + Math.round(s.energy) + '</b></span></span></button>';
      }
      html += '<div class="note">今天要发的工资合计 <b>' + money(wage) + '</b>。点一个人，排他的工作优先级，或让他立刻去做一件事。</div>';
      return { tabs, html };
    },

    ledger(S) {
      const tabs = [
        ['today', '今日'],
        ['rate', '评价'],
        ['regular', '熟客'],
        ['ach', '成就'],
        ['log', '日志'],
        ['help', '怎么玩'],
      ];
      const tab = UI.tab.ledger;
      let html = '';
      if (tab === 'today') {
        const t = S.today;
        const walks = t.walkQueue + t.walkOrder + t.walkFood;
        html += '<dl class="kv"><dt>营业额（含小费 ' + money(t.tips) + '）</dt><dd>' + money(t.rev) + '</dd><dt>食材进货</dt><dd>' + neg(t.food) + '</dd><dt>其中坏掉、浪费</dt><dd>' + money(t.waste) + '</dd><dt>修理 / 罚款 / 其他</dt><dd>' + neg(t.repair + t.fines + t.other) + '</dd><dt>建造净支出</dt><dd>' + neg(t.build) + '</dd><dt>接待 / 等不及走掉</dt><dd>' + t.groups + ' 桌 / ' + walks + ' 桌</dd><dt>出品均分</dt><dd>' + (t.dishes ? Math.round(t.scoreSum / t.dishes) : '—') + '</dd><dt>客人满意度</dt><dd>' + (t.satN ? Math.round(t.satSum / t.satN) : '—') + '</dd></dl><div class="note">工资和水电在 22:00 日结时扣。日结只算盈亏，房租只在周日 22:00 扣一次。</div>';
        if (S.weeks.length) {
          html += '<div class="sec">往周</div><table class="wk"><tr><th>周</th><th>房租</th><th>营业额</th><th>交租后当周结余</th></tr>' + S.weeks.slice(-8).map((w) => '<tr><td>第 ' + w.week + ' 周</td><td>' + money(w.rent) + '</td><td>' + money(w.rev) + '</td><td class="' + (w.net < 0 ? 'neg' : 'pos') + '">' + (w.net < 0 ? '-' : '+') + money(Math.abs(w.net)) + '</td></tr>').join('') + '</table>';
        }
        html += '<div class="sec">接下来四周的房租</div><div class="note">' + [0, 1, 2, 3].map((i) => '第 ' + (sim.week(S) + i) + ' 周 <b>' + money(MR.rentOf(sim.week(S) + i)) + '</b>').join('　') + '</div>';
      } else if (tab === 'rate') {
        UI.flags.viewedRatings = true;
        if (!S.ratings.length) html += '<div class="note">还没有菜上桌。每道菜上桌时都会留下一份五项评价。</div>';
        for (const r of S.ratings.slice().reverse()) {
          const d = MR.DISHES[r.dish];
          const dims = MR.DIMS[d.cat];
          const tn = MR.TIERS.find((t) => t.key === r.tier).name;
          html += '<div class="rate"><h4><span class="score" style="background:' + MR.render.TIER_COL[r.tier] + '">' + r.total + ' ' + tn + '</span>' + d.name + ' <small>第 ' + r.day + ' 天 · ' + esc(r.by.cook || '') + ' 掌勺 · 给' + esc(r.guest || '客人') + (r.over > 0.5 ? ' · 起锅晚了 ' + r.over.toFixed(0) + ' 分钟' : '') + '</small></h4><div class="dims">' + dims.map((x) => '<span class="' + (r.sc[x.k] < 50 ? 'lo' : r.sc[x.k] >= 80 ? 'hi' : '') + '"><b>' + Math.round(r.sc[x.k] == null ? 60 : r.sc[x.k]) + '</b>' + x.name + '</span>').join('') + '</div></div>';
        }
      } else if (tab === 'regular') {
        if (!S.regulars.length) html += '<div class="note">还没有熟客。客人吃得很满意（满意度 76 以上）时，有机会记住你家的某道菜，以后反复上门。</div>';
        for (const r of S.regulars) html += '<div class="row-item"><div class="avatar" style="background:#c4504a">' + r.name[0] + '</div><div class="main"><h4>' + r.name + (r.away > S.day ? ' <span class="tag r">暂时不来了</span>' : '') + '</h4><p>爱点「' + MR.DISHES[r.fav].name + '」 · 来过 ' + r.visits + ' 次 · 上次第 ' + r.last + ' 天</p></div></div>';
        if (S.regulars.length) html += '<div class="note">熟客更有耐心、小费更多；在你周末还没凑齐房租时，更可能带朋友来捧场。一次翻车会让他们很久不来。</div>';
      } else if (tab === 'ach') {
        for (const a of MR.ACH) html += '<div class="row-item"><div class="ic">' + (S.ach[a.id] ? '✓' : '·') + '</div><div class="main"><h4>' + a.name + (S.ach[a.id] ? ' <span class="tag g">第 ' + S.ach[a.id] + ' 天达成</span>' : '') + '</h4><p>' + a.desc + '</p></div></div>';
      } else if (tab === 'log') {
        for (const l of S.log.slice().reverse()) html += '<div class="logline ' + (l.kind === 'warn' ? 'warn' : l.kind === 'good' || l.kind === 'win' ? 'good' : '') + '"><small>第' + l.d + '天 ' + String(Math.floor(l.m / 60)).padStart(2, '0') + ':' + String(l.m % 60).padStart(2, '0') + '</small>' + esc(l.text) + '</div>';
      } else {
        html += '<div class="help"><p><b>闭环</b>　赚钱 → 留够本周房租 → 余钱存着或拿去扩建 → 接待更多、做得更好 → 赚得更多 → 买下店铺。</p><p><b>一单的路</b>　点单 → 洗 → 切 → 烹饪 → 摆盘 → 上菜 → 结账。店面下面那排数字是每个工位排着几单，哪个数字大，瓶颈就在哪。</p><p><b>评分</b>　调味 20% · 刀工 20% · 摆盘 15% · 火候 25% · 食材 20%。取决于谁做的、用什么档次的工具、食材新不新鲜。0–39 翻车，40–59 普通，60–74 好，75–89 出色，90+ 神作。</p><p><b>自动化</b>　每个人有一张优先级表，1 最先做，「禁」不碰。也可以点名让他立刻去做一件事，做完回到自动化。</p><p><b>建造</b>　在「建造」里买，再点地面放下，绿色可放、红色不行。点店里已有的物品可以搬、升档、修、卖。</p><p><b>时间</b>　一天从 10:30 到 22:00：午市 11:00–13:30，晚市 17:00–20:30。非营业时段自动快进。</p><p><b>输赢</b>　周日 22:00 现金不够交租就倒闭。攒够 ¥24,000，在周一到周六点「买断进度」买下店铺。</p></div>';
      }
      return { tabs, html };
    },

    emergency(S) {
      const short = Math.max(0, sim.rent(S) - S.cash);
      let html = '<div class="note">' + (short > 0 ? '离本周房租还差 <b class="neg">' + money(short) + '</b>。' : '本周房租已经够了。') + '下面的办法能救命，但会伤产能或口碑。</div>';
      html += '<div class="sec">让店主自己顶班，减少雇工开支</div>';
      for (const s of S.staff) {
        if (s.owner) continue;
        html += '<div class="row-item"><div class="avatar" style="background:' + APRON[s.color % 6] + '">' + s.name[s.name.length - 1] + '</div><div class="main"><h4>' + s.name + ' <span class="tag">' + s.role + '</span></h4><p>今天放无薪假，省 ' + money(s.wage) + '，他的心情 -6</p></div><div class="side"><button type="button" class="btn sm" data-act="leave" data-id="' + s.id + '">' + (s.off ? '叫回来上班' : '放无薪假') + '</button></div></div>';
      }
      html += '<div class="sec">取消明早的采购</div><div class="row-item"><div class="main"><h4>每早自动补货：' + (S.autoRestock ? '开' : '关') + '</h4><p>关掉后明早不进货，省下货款，但可能缺料撤菜</p></div><div class="side"><button type="button" class="btn sm" data-act="autoRestock">' + (S.autoRestock ? '关掉' : '打开') + '</button></div></div>';
      html += '<div class="sec">半价卖掉家具设备</div>';
      const items = S.items.slice().sort((a, b) => sim.sellValue(b) - sim.sellValue(a));
      for (const it of items) {
        const d = MR.ITEMS[it.type];
        const busy = sim.itemBusy(S, it);
        html += '<div class="row-item"><div class="ic">' + (d.label || d.name[0]) + '</div><div class="main"><h4>' + d.name + (d.tiers ? ' <span class="tag">' + MR.TIER_NAMES[it.tier] + '</span>' : '') + '</h4><p>' + (busy || d.desc) + '</p></div><div class="side"><span class="price">+' + money(sim.sellValue(it)) + '</span><button type="button" class="btn sm danger" data-act="sell" data-id="' + it.id + '"' + (busy ? ' disabled' : '') + '>卖掉</button></div></div>';
      }
      return { html };
    },
  };

  function staffDetail(S, s) {
    const m = sim.mood(s);
    let html = '<div class="row-item" style="border:0;padding-top:0"><div class="avatar" style="background:' + APRON[s.color % 6] + '">' + (s.owner ? '店' : s.name[s.name.length - 1]) + '</div><div class="main"><h4>' + s.name + ' <span class="tag">' + s.role + '</span>' + (s.trait ? '<span class="tag a">' + MR.TRAITS[s.trait].name + '</span>' : '') + '</h4><p>正在：' + esc(sim.describe(S, s)) + (s.owner ? '' : ' · 日薪 ' + money(s.wage)) + '</p></div><div class="side"><button type="button" class="btn sm" data-act="staffBack">返回</button></div></div>';
    if (s.trait) html += '<div class="note">' + MR.TRAITS[s.trait].name + '：' + MR.TRAITS[s.trait].desc + '</div>';
    html += '<div class="bars" style="font-size:13px"><span>心情</span>' + meter(m / 100, m >= 60 ? 'g' : m >= 35 ? 'a' : 'r') + '<b>' + m + '</b><span>体力</span>' + meter(s.energy / 100, s.energy >= 50 ? 'g' : s.energy >= 25 ? 'a' : 'r') + '<b>' + Math.round(s.energy) + '</b></div>';
    html += '<ul class="mods"><li><span>基础</span><b>55</b></li>' + s.mods.map((o) => '<li><span>' + esc(o.label) + '</span><b class="' + (o.v < 0 ? 'neg' : 'pos') + '">' + (o.v > 0 ? '+' : '') + o.v + '</b></li>').join('') + '</ul>';
    html += '<div class="sec">工作优先级（1 最先做）　　「去」= 立刻去做一次</div><div class="prio">';
    for (const job of Object.keys(MR.JOBS)) {
      const j = MR.JOBS[job];
      const v = s.prio[job];
      html += '<span class="name">' + j.name + '<small>' + MR.SKILLS[j.skill] + ' ' + Math.round(s.skills[j.skill]) + '</small></span><span class="seg5">' + [0, 1, 2, 3, 4].map((n) => '<button type="button" data-act="prio" data-id="' + s.id + '" data-job="' + job + '" data-v="' + n + '" class="' + (v === n ? 'on' : '') + '">' + (n ? n : '禁') + '</button>').join('') + '</span><button type="button" class="btn sm" data-act="force" data-id="' + s.id + '" data-job="' + job + '"' + (s.forced === job ? ' disabled' : '') + '>' + (s.forced === job ? '已下令' : '去') + '</button>';
    }
    html += '</div><div class="sec">技能（干得越多涨得越快；刀工、火候受工具档次封顶）</div><div class="bars">';
    for (const k in MR.SKILLS) html += '<span>' + MR.SKILLS[k] + '</span>' + meter(s.skills[k] / 100) + '<b>' + Math.round(s.skills[k]) + '</b>';
    html += '</div>';
    if (!s.owner) html += '<div class="row-item" style="border:0;gap:8px;justify-content:flex-end"><button type="button" class="btn sm" data-act="leave" data-id="' + s.id + '">' + (s.off ? '叫回来上班' : '今天放无薪假') + '</button><button type="button" class="btn sm danger" data-act="fireAsk" data-id="' + s.id + '">辞退</button></div>';
    return html;
  }

  // ================= 弹出小卡（点店里的东西） =================
  function hidePop() {
    $('#pop').hidden = true;
    UI.sel = null;
    cache.pop = null;
  }
  UI.hidePop = hidePop;
  function popHtml(S) {
    const sel = UI.sel;
    if (!sel) return null;
    if (sel.kind === 'item') {
      const it = S.items.find((o) => o.id === sel.id);
      if (!it) return null;
      const d = MR.ITEMS[it.type];
      const up = sim.upgradeCost(S, it);
      const busy = sim.itemBusy(S, it);
      let h = '<h3>' + d.name + (d.tiers ? ' · ' + MR.TIER_NAMES[it.tier] + '档' : '') + (it.broken ? ' <span class="tag r">坏了</span>' : '') + (it.dirty ? ' <span class="tag a">待收拾</span>' : '') + '</h3><p>' + d.desc + (d.wear ? ' · 耐久 ' + Math.round(it.dur) + '%' + (it.dur < 30 ? '（低于 30% 会压低上限、高峰易坏）' : '') : '') + '</p><div class="row">';
      h += '<button type="button" class="btn sm" data-act="move" data-id="' + it.id + '"' + (busy ? ' disabled' : '') + '>搬动</button>';
      if (up) h += '<button type="button" class="btn sm" data-act="upgrade" data-id="' + it.id + '"' + (up.locked || S.cash < up.cost ? ' disabled' : '') + '>升到' + MR.TIER_NAMES[it.tier + 1] + ' ' + money(up.cost) + (up.locked ? '（未到货）' : '') + '</button>';
      if (d.wear && (it.broken || it.dur < 70)) h += '<button type="button" class="btn sm" data-act="callRepair" data-id="' + it.id + '"' + (S.cash < 120 ? ' disabled' : '') + '>请师傅上门修 ¥120</button>';
      h += '<button type="button" class="btn sm danger" data-act="sell" data-id="' + it.id + '"' + (busy ? ' disabled' : '') + '>半价卖 +' + money(sim.sellValue(it)) + '</button><button type="button" class="btn sm" data-act="popClose">关闭</button></div>';
      return h;
    }
    if (sel.kind === 'group') {
      const g = S.groups.find((o) => o.id === sel.id);
      if (!g) return null;
      const ST = { queue: '在门口等位', toTable: '正走向座位', browse: '在看菜单', wantOrder: '等人来点单', waitFood: '等上菜（已上 ' + g.served + '/' + g.orders + '）', eating: '正在吃', toCounter: '去前台结账', wantPay: '等结账', leaving: '离开了', vin: '进店', vstay: g.vtype === 'inspector' ? '正在检查后厨' : '在和你说话' };
      const tks = S.tickets.filter((t) => t.g === g.id).map((t) => MR.DISHES[t.dish].name);
      const done = g.dishes.map((d) => MR.DISHES[d.id].name + ' ' + d.total + '分');
      const pat = g.patMax > 1 && ['queue', 'wantOrder', 'waitFood', 'wantPay'].includes(g.state) ? ' · 耐心 ' + Math.round((g.pat / g.patMax) * 100) + '%' : '';
      return '<h3>' + esc(g.label) + (g.size > 1 ? ' · ' + g.size + ' 人' : '') + '</h3><p>' + ST[g.state] + pat + (tks.length ? '<br>还在做：' + tks.join('、') : '') + (done.length ? '<br>已上桌：' + done.join('、') : '') + '</p><div class="row"><button type="button" class="btn sm" data-act="popClose">关闭</button></div>';
    }
    if (sel.kind === 'zone') {
      const z = MR.ZONES.find((o) => o.id === sel.id);
      if (!z || S.zones[z.id]) return null;
      return '<h3>' + z.name + ' · 未解锁</h3><p>向房东付一次性解锁费 ' + money(z.price) + '，多出 ' + (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1) + ' 格' + (z.kind === 'kitchen' ? '后厨' : '堂食') + '地面。' + afterNote(S, z.price) + '</p><div class="row"><button type="button" class="btn sm primary" data-act="buyZone" data-id="' + z.id + '"' + (S.cash < z.price ? ' disabled' : '') + '>解锁 ' + money(z.price) + '</button><button type="button" class="btn sm" data-act="popClose">关闭</button></div>';
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
    if (!UI.wide && UI.sheet) UI.close();
    UI.refreshPop();
  };

  // ================= 放置 =================
  function anchor(type, rot, x, y) {
    if (type === 'table2') return rot ? { x, y: y - 1 } : { x: x - 1, y };
    if (type === 'table4') return rot ? { x, y: y - 1 } : { x: x - 1, y };
    return { x, y };
  }
  UI.startPlace = function (type, moveId) {
    const S = UI.S;
    hidePop();
    if (!UI.wide) UI.close();
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
    const tip = p.x == null ? '点地面选位置。绿色可放，红色不行' : p.ok ? '再点一次这个位置，或按「放这里」' : '红色：' + p.why;
    bar.innerHTML = '<div class="t"><b>' + (p.moveId ? '搬动 ' : '') + d.name + (p.moveId ? '' : ' ' + money(d.price)) + '</b><small class="' + (p.x != null && !p.ok ? 'no' : '') + '">' + tip + '</small></div>' + (d.rot ? '<button type="button" class="btn sm" data-act="rotate">旋转</button>' : '') + '<button type="button" class="btn sm primary" data-act="confirmPlace"' + (p.ok ? '' : ' disabled') + '>放这里</button><button type="button" class="btn sm" data-act="cancelPlace">取消</button>';
    bar.hidden = false;
  };
  UI.confirmPlace = function () {
    const p = UI.place;
    const S = UI.S;
    if (!p || !p.ok) return;
    const r = p.moveId ? sim.moveItem(S, p.moveId, p.x, p.y, p.rot) : sim.place(S, p.type, p.x, p.y, p.rot);
    if (!r.ok) {
      UI.toast(r.why, 'warn');
      return;
    }
    UI.place = null;
    UI.renderPlace();
    if (UI.wide) UI.renderSheet();
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
  UI.pump = function () {
    const S = UI.S;
    if (UI.modal || !S || !S.modals.length) return;
    const m = (UI.modal = S.modals.shift());
    if (m.type === 'dayEnd') {
      const r = m.rec;
      const walks = r.walkQueue + r.walkOrder + r.walkFood;
      const sunday = r.dow === 6 && !r.bought;
      let rentBox;
      if (r.bought) rentBox = '<div class="box g">铺子是你的，不用再交租。</div>';
      else if (sunday) rentBox = '<div class="box ' + (r.cash >= r.rent ? 'g' : 'r') + '"><b>现在是周日 22:00，房东来收租。</b><br>本周房租 ' + money(r.rent) + '，你有 ' + money(r.cash) + (r.cash >= r.rent ? '。' : '，还差 ' + money(r.rent - r.cash) + '。') + '</div>';
      else rentBox = '<div class="box ' + (r.cash >= r.rent ? '' : 'r') + '">距交租还剩 <b>' + r.daysLeft + ' 天</b>。本周房租 ' + money(r.rent) + '，' + (r.cash >= r.rent ? '已经备齐，扣完还剩 ' + money(r.cash - r.rent) + '。' : '还差 <b>' + money(r.rent - r.cash) + '</b>。') + '</div>';
      showModal('<h2>第 ' + r.day + ' 天打烊</h2><p class="sub">第 ' + r.week + ' 周 · ' + C.WEEKDAYS[r.dow] + ' · 日结只算盈亏，不扣租</p><dl class="kv"><dt>营业额</dt><dd>' + money(r.rev) + '</dd><dt>食材进货</dt><dd>' + neg(r.food) + '</dd><dt>工资</dt><dd>' + neg(r.wages) + '</dd><dt>水电燃气</dt><dd>' + neg(r.util) + '</dd>' + (r.repair + r.fines + r.other ? '<dt>修理 / 罚款 / 其他</dt><dd>' + neg(r.repair + r.fines + r.other) + '</dd>' : '') + '<dt class="tot">今日经营盈亏</dt><dd class="tot ' + (r.operating < 0 ? 'neg' : 'pos') + '">' + (r.operating < 0 ? '-' : '+') + money(Math.abs(r.operating)) + '</dd>' + (r.build ? '<dt>另：建造净支出</dt><dd>' + neg(r.build) + '</dd>' : '') + '</dl><div class="box">接待 <b>' + r.groups + '</b> 桌 ' + r.guests + ' 人，上了 <b>' + r.dishes + '</b> 道，均分 <b>' + (r.dishes ? Math.round(r.scoreSum / r.dishes) : '—') + '</b>' + (r.god ? '，神作 ' + r.god + ' 道' : '') + (r.bad ? '，翻车 ' + r.bad + ' 道' : '') + '。' + (walks ? '<br>等不及走掉 <b class="neg">' + walks + '</b> 桌（等位 ' + r.walkQueue + ' / 等点单 ' + r.walkOrder + ' / 等上菜 ' + r.walkFood + '）。' : '') + (r.waste >= 10 ? '<br>坏掉、浪费的食材约 ' + money(r.waste) + '。' : '') + (r.quits.length ? '<br><b class="neg">' + r.quits.join('、') + ' 辞职了。</b>' : '') + '</div>' + (r.hint ? '<p><b>今天最该改的一件事：</b>' + esc(r.hint) + '</p>' : '') + rentBox + '<div class="actions"><button type="button" class="btn primary" data-act="dayNext">' + (sunday ? '交房租' : '开始下一天') + '</button></div>');
    } else if (m.type === 'rent') {
      const est = sim.estimateWeeks(S);
      showModal('<span class="stamp g">已交租</span><h2>第 ' + m.week + ' 周的房租交上了</h2><p class="sub">这家店又活过了一个周日</p><div class="hero neg">-' + money(m.rent) + '</div><dl class="kv"><dt>交租前</dt><dd>' + money(m.before) + '</dd><dt>交租后</dt><dd>' + money(m.after) + '</dd><dt>这一周净结余</dt><dd class="' + (m.net < 0 ? 'neg' : 'pos') + '">' + (m.net < 0 ? '-' : '+') + money(Math.abs(m.net)) + '</dd></dl><div class="box r"><b>下周房租涨到 ' + money(m.next) + '</b>（+¥' + C.RENT_STEP + '）。以后每周都涨这么多。</div><div class="box"><b>买断进度　' + money(m.after) + ' / ' + money(C.BUYOUT) + '</b>' + meter(m.after / C.BUYOUT) + (m.week === 1 ? '攒够 ¥24,000 就能向房东买下这间铺，从此不再交租。买断价开局锁定，不会跟着房租涨。' : est === Infinity ? '这两周没攒下钱。不扩建，收入有上限，会被涨租慢慢勒死。' : est ? '按近两周的结余速度，大约还要 ' + est + ' 周（只是参考）。' : '') + '</div><div class="actions"><button type="button" class="btn primary" data-act="modalClose">继续经营</button></div>');
    } else if (m.type === 'gameOver') {
      UI.setSpeed(0);
      clearSave();
      showModal('<span class="stamp">倒闭</span><h2>交不起房租，小馆关门了</h2><p class="sub">第 ' + m.week + ' 周的房租 ' + money(m.rent) + '，你只有 ' + money(m.cash) + '</p><dl class="kv"><dt>经营天数</dt><dd>' + m.day + ' 天</dd><dt>最高口碑</dt><dd>' + m.rep + '</dd><dt>累计交过的房租</dt><dd>' + money(m.rentPaid) + '</dd><dt>离买下店铺还差</dt><dd>' + money(m.short) + '</dd></dl><div class="box r"><b>失败主因</b><br>' + esc(m.cause) + '</div><div class="actions"><button type="button" class="btn primary" data-act="restart">立刻重开一局</button></div>');
    } else if (m.type === 'victory') {
      UI.setSpeed(0);
      showModal('<span class="stamp g">买下了</span><h2>这间铺子是你的了</h2><p class="sub">第 ' + m.week + ' 周 · 经营第 ' + m.day + ' 天</p><p>房东把钥匙和房本一起推过来。从今天起，周日晚上 22:00 只是一个普通的打烊时间。</p><dl class="kv"><dt>买断价</dt><dd>' + money(C.BUYOUT) + '</dd><dt>此前累计交过的房租</dt><dd>' + money(m.rentPaid) + '</dd><dt>最高口碑</dt><dd>' + m.rep + '</dd><dt>手里还剩</dt><dd>' + money(m.cash) + '</dd></dl><div class="box g">买断不会自动修好设备，也不会让菜变好吃，只是拿掉了倒闭的威胁。储藏间、后院和扩大的后厨随店铺一起归你。</div><div class="actions"><button type="button" class="btn" data-act="restart">新开一局</button><button type="button" class="btn primary" data-act="modalClose">继续经营这间店</button></div>');
    } else if (m.type === 'choice') {
      showModal('<h2>' + esc(m.title) + '</h2><p>' + esc(m.text) + '</p><div class="choice">' + m.options.map((o, i) => '<button type="button" data-act="choose" data-i="' + i + '"><b>' + esc(o.label) + '</b><small>' + esc(o.desc) + '</small></button>').join('') + '</div>');
    }
  };
  function buyoutDialog() {
    const S = UI.S;
    UI.modal = { type: 'buyout' };
    const r = sim.canBuyout(S);
    const est = sim.estimateWeeks(S);
    if (S.bought) return showModal('<h2>铺子已经是你的了</h2><p>不用再交租。自由经营吧。</p><div class="actions"><button type="button" class="btn primary" data-act="modalClose">好</button></div>');
    showModal('<h2>向房东买下店铺</h2><p class="sub">终极目标 · 买断价开局锁定，不随周租上涨</p><div class="hero">' + money(S.cash) + ' <small style="font-size:16px;color:var(--muted)">/ ' + money(C.BUYOUT) + '</small></div>' + meter(S.cash / C.BUYOUT) + '<div class="box">' + (r.ok ? '钱够了。买下之后<b>永远不再交租</b>，未解锁的空间也一并归你。' : esc(r.why) + '。' + (est && est !== Infinity ? '按近两周的结余速度，大约还要 ' + est + ' 周（只是参考）。' : est === Infinity ? '近两周没有攒下钱。' : '交过第一周房租后，这里会给出粗算。')) + '</div><div class="actions"><button type="button" class="btn" data-act="modalClose">再等等</button><button type="button" class="btn primary" data-act="buyout"' + (r.ok ? '' : ' disabled') + '>买下店铺 -' + money(C.BUYOUT) + '</button></div>');
  }
  function confirmDialog(title, text, act, data, label) {
    UI.modal = { type: 'confirm' };
    showModal('<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="actions"><button type="button" class="btn" data-act="modalClose">取消</button><button type="button" class="btn danger" data-act="' + act + '" ' + Object.keys(data).map((k) => 'data-' + k + '="' + data[k] + '"').join(' ') + '>' + esc(label) + '</button></div>');
  }

  // ================= 引导（第一天） =================
  const TUT = [
    { text: '这四个数是命脉：<b>现金 ¥3,000</b>、<b>本周房租 ¥800</b>，周日 22:00 自动扣，不够就倒闭。「扣租后结余」变红就是危险。', hl: '#stats', btn: '知道了' },
    { text: '先进货：打开「<b>采购</b>」，点「<b>补货到目标</b>」。', hl: '#nav [data-sheet="stock"]', until: (S) => S.deliveries.length > 0 || MR.ING_ORDER.some((k) => sim.stockQty(S, k) > 0) },
    { text: '打开「<b>员工</b>」点老周，看他的优先级：数字越小越先做，「禁」是不碰。清洁先靠你。', hl: '#nav [data-sheet="staff"]', until: () => UI.flags.viewedStaff, skip: '跳过' },
    { text: '试一次摆放：「<b>建造</b>」→ 买一把等待椅（¥120）→ 点堂食地面。绿色可放，红色不行，也能取消。', hl: '#nav [data-sheet="build"]', until: (S) => (S.flags.placed || 0) > 0, skip: '不买，跳过' },
    { text: '开门：点右上角「<b>1×</b>」让时间走起来。11:00 午市开始。', hl: '#speed', until: () => UI.speed > 0 },
    { when: (S) => S.flags.ordered, text: '第一单来了。下面这排数字是每个工位排着几单，哪个数字大，瓶颈就在哪。', hl: '#rail', btn: '知道了' },
    { when: (S) => S.flags.rated, text: '菜上桌了，飘出来的是综合分。打开「<b>账本 → 评价</b>」看五项细分。', hl: '#nav [data-sheet="ledger"]', until: () => UI.flags.viewedRatings, skip: '以后再看', enter: () => (UI.tab.ledger = 'rate') },
    { when: (S) => S.day >= 2, text: '日结只算盈亏，不扣租；真正的坎是周日 22:00。之后跟着下方的「目标」走，先补最卡的瓶颈。', btn: '开始经营' },
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
    if (UI.wide) UI.open('ledger');
    else {
      UI.sheet = null;
      $('#sheet').hidden = true;
    }
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
    prio(d) {
      sim.setPrio(UI.S, Number(d.id), d.job, Number(d.v));
    },
    force(d) {
      sim.force(UI.S, Number(d.id), d.job);
      UI.toast('已下令：' + MR.JOBS[d.job].name + '。有这类活时他会先去做一次', '');
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
