/* 一间小馆 · 模拟运行（员工自动化、客人、订单流水线、日程、事件、交租）
 * 不依赖 DOM。 */
(function (root) {
  'use strict';
  const MR = root.MR;
  const C = MR.C;
  const sim = MR.sim;
  const _ = MR._;
  const { clamp, rnd, rint, pick, wpick, log, fx, idx, bfs, pathFrom, walkable, itemById, accessTiles, standAt, spend, earn, addMood, takeStock, addStock, DIRS } = _;
  const money = sim.money;
  const jit = (S, r) => (rnd(S) - 0.5) * 2 * r;

  // ============ 移动 ============
  function moveAlong(e, d) {
    while (d > 0 && e.path.length) {
      const n = e.path[0];
      const dx = n.x - e.x,
        dy = n.y - e.y;
      const L = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) e.dir = dx > 0 ? 1 : -1;
      if (L <= d) {
        e.x = n.x;
        e.y = n.y;
        e.path.shift();
        d -= L;
      } else {
        e.x += (dx / L) * d;
        e.y += (dy / L) * d;
        d = 0;
      }
    }
  }
  // cell=true 时目标可以是被占的格子（椅子）：先走到旁边，再坐进去
  function go(S, e, tx, ty, cell) {
    const map = bfs(S, e.x, e.y);
    e.goal = { x: tx, y: ty, cell: !!cell };
    e._ver = S._ver;
    if (map.sx === tx && map.sy === ty) {
      e.path = [{ x: tx, y: ty }];
      return true;
    }
    if (!cell) {
      const p = pathFrom(map, tx, ty);
      if (!p) return false;
      e.path = p;
      return true;
    }
    let best = null;
    for (const d of DIRS) {
      const nx = tx + d[0],
        ny = ty + d[1];
      if (nx < 0 || ny < 0 || nx >= C.COLS || ny >= C.ROWS) continue;
      const dd = map.dist[idx(nx, ny)];
      if (dd >= 0 && (!best || dd < best.d)) best = { x: nx, y: ny, d: dd };
    }
    if (!best) return false;
    const p = pathFrom(map, best.x, best.y) || [];
    p.push({ x: tx, y: ty });
    e.path = p;
    return true;
  }
  function nearWalkable(S, x, y) {
    const map = bfs(S, C.DOOR.x, C.DOOR.y);
    let best = null;
    for (let yy = 0; yy < C.ROWS; yy++)
      for (let xx = 0; xx < C.COLS; xx++) {
        if (map.dist[idx(xx, yy)] < 0) continue;
        const d = Math.abs(xx - x) + Math.abs(yy - y);
        if (!best || d < best.d) best = { x: xx, y: yy, d };
      }
    return best || { x: C.DOOR.x, y: C.DOOR.y };
  }

  // ============ 员工：速度、成长 ============
  function spd(S, s, job) {
    const j = MR.JOBS[job];
    if (!j) return 1;
    const sk = s.skills[j.skill];
    let f = 0.62 + sk / 130;
    const m = sim.mood(s);
    if (m < 30) f *= 0.85;
    else if (m > 72) f *= 1.06;
    if (s.energy < 25) f *= 0.85;
    if (s.trait === 'hasty') f *= 1.2;
    if (s.trait === 'steady') f *= 0.92;
    if (s.trait === 'tidy' && job === 'clean') f *= 1.4;
    return f;
  }
  // 工具档次决定刀工 / 火候能练到多高：实用 66、专业 84、名工 100
  const SKILL_CAP = (MR.SKILL_CAP = [66, 84, 100]);
  function gain(s, skill, amt, cap) {
    if (cap != null && s.skills[skill] >= cap) return;
    const g = (amt || 0.12) * (s.arch === 'apprentice' ? 2.5 : 1) * (1 - s.skills[skill] / 115);
    s.skills[skill] = Math.min(100, s.skills[skill] + g);
  }
  const adj = (s) => (sim.mood(s) - 55) * 0.07 + (s.energy < 25 ? -4 : 0);
  const durF = (it) => clamp(0.65 + (0.35 * it.dur) / 100, 0.65, 1);
  const tk = (S, id) => S.tickets.find((t) => t.id === id);
  const grp = (S, id) => S.groups.find((g) => g.id === id);

  function breakItem(S, it, why) {
    if (it.broken) return;
    it.broken = true;
    if (it.heat) {
      const t = tk(S, it.heat.t);
      if (t) t.stage = 'cook';
      it.heat = null;
    }
    S.wk.broke = (S.wk.broke || 0) + 1;
    fx(S, { k: 'smoke', x: it.x, y: it.y });
    log(S, '「' + MR.ITEMS[it.type].name + '」' + (why || '坏了') + '。派人修（排「修理」）或请师傅上门 ¥120。', 'warn', true);
  }
  function wear(S, it) {
    if (!it) return;
    const def = MR.ITEMS[it.type];
    if (!def.wear) return;
    it.dur = Math.max(0, it.dur - def.wear * [1, 0.8, 0.62][it.tier]);
    if (it.dur < 30 && sim.inService(S) && rnd(S) < 0.06) breakItem(S, it, '用到一半坏了');
  }

  // ============ 任务 ============
  function mkTask(job, legs, claims) {
    return { job, legs, i: 0, t: 0, dur: 0, work: false, claims: claims || {} };
  }
  function applyClaims(S, s, c, on) {
    const v = on ? s.id : 0;
    if (c.tickets)
      for (const id of c.tickets) {
        const t = tk(S, id);
        if (t && (on || t.claimed === s.id)) t.claimed = v;
      }
    if (c.items)
      for (const id of c.items) {
        const it = itemById(S, id);
        if (it && (on || it.user === s.id)) it.user = v;
      }
    if (c.group) {
      const g = grp(S, c.group);
      if (g && (on || g.claimed === s.id)) g.claimed = v;
    }
    if (c.spot) {
      const sp = S.spots.find((o) => o.id === c.spot);
      if (sp) sp.claimed = v;
    }
    if (c.table) {
      const it = itemById(S, c.table);
      if (it) it.cleaner = v;
    }
    if (c.fix) {
      const it = itemById(S, c.fix);
      if (it) it.fixer = v;
    }
  }
  function startTask(S, s, task) {
    s.task = task;
    applyClaims(S, s, task.claims, true);
    const leg = task.legs[0];
    if (!go(S, s, leg.x, leg.y)) abortTask(S, s);
  }
  function endTask(S, s) {
    if (!s.task) return;
    applyClaims(S, s, s.task.claims, false);
    s.task = null;
    s.think = 0;
  }
  function abortTask(S, s) {
    const t = s.task;
    if (!t) return;
    if (t.claims.tickets)
      for (const id of t.claims.tickets) {
        const o = tk(S, id);
        if (o && o.stage === 'carry') o.stage = 'ready';
      }
    s.carry = 0;
    s.path = [];
    endTask(S, s);
    s.think = 0.5;
  }
  _.abortTask = abortTask;
  // 物品被搬走 / 卖掉前，把用着它的人和锅里的菜都放开
  _.releaseItem = function (S, it) {
    for (const s of S.staff) {
      const c = s.task && s.task.claims;
      if (!c) continue;
      if ((c.items && c.items.includes(it.id)) || c.table === it.id || c.fix === it.id) abortTask(S, s);
    }
    if (it.heat) {
      const t = tk(S, it.heat.t);
      if (t) t.stage = 'cook';
      it.heat = null;
    }
    it.user = 0;
  };

  function freeNear(S, type, map) {
    let best = null;
    for (const it of S.items) {
      if (MR.ITEMS[it.type].station !== type || it.broken || it.user || it.heat) continue;
      const p = standAt(S, it, map);
      if (p && (!best || p.d < best.pos.d)) best = { it, pos: p };
    }
    return best;
  }
  const K = () => MR.TUNE.kitchen; // 后厨工序的整体时长系数
  const self = (map) => ({ x: map.sx, y: map.sy, d: 0 });

  const TRY = {
    wash(S, s, map) {
      const t = S.tickets.find((o) => o.stage === 'wash' && !o.claimed);
      if (!t) return null;
      const d = MR.DISHES[t.dish];
      const hasSink = sim.stationCount(S, 'sink') > 0;
      let st = null,
        pos,
        slow = 1;
      if (hasSink) {
        const f = freeNear(S, 'sink', map);
        if (!f) return null;
        st = f.it;
        pos = f.pos;
      } else {
        slow = 2.2; // 没水池只能在货架边拿盆接水洗，慢得多
        const sh = S.items.find((it) => it.type === 'shelf');
        pos = (sh && standAt(S, sh, map)) || self(map);
        return mkTask('wash', [{ x: pos.x, y: pos.y, dur: d.wash * slow * K(), fn: 'washDone', a: { t: t.id, sink: false }, st: sh && sh.id }], { tickets: [t.id] });
      }
      return mkTask('wash', [{ x: pos.x, y: pos.y, dur: d.wash * slow * K(), fn: 'washDone', a: { t: t.id, sink: hasSink }, st: st && st.id }], { tickets: [t.id], items: st ? [st.id] : [] });
    },
    cut(S, s, map) {
      const t = S.tickets.find((o) => o.stage === 'cut' && !o.claimed);
      if (!t) return null;
      const d = MR.DISHES[t.dish];
      let st = null,
        pos,
        slow = 1;
      if (sim.stationCount(S, 'board') > 0) {
        const f = freeNear(S, 'board', map);
        if (!f) return null;
        st = f.it;
        pos = f.pos;
      } else {
        slow = 2.2;
        pos = self(map);
      }
      return mkTask('cut', [{ x: pos.x, y: pos.y, dur: d.cut * slow * K(), fn: 'cutDone', a: { t: t.id, it: st && st.id }, st: st && st.id }], { tickets: [t.id], items: st ? [st.id] : [] });
    },
    cook(S, s, map) {
      for (const t of S.tickets) {
        if (t.stage !== 'cook' || t.claimed) continue;
        const d = MR.DISHES[t.dish];
        const f = freeNear(S, d.station, map);
        if (!f) continue;
        const sp = 1 + 0.12 * f.it.tier;
        const leg = d.attended ? { dur: (d.cook * K()) / sp, fn: 'cookDone' } : { dur: 1.5, fn: 'cookStart' };
        leg.x = f.pos.x;
        leg.y = f.pos.y;
        leg.a = { t: t.id, it: f.it.id };
        leg.st = f.it.id;
        return mkTask('cook', [leg], { tickets: [t.id], items: [f.it.id] });
      }
      return null;
    },
    plate(S, s, map) {
      let t = null;
      for (const o of S.tickets) {
        if (o.stage !== 'plate' || o.claimed) continue;
        const it = itemById(S, o.loc);
        if (it && it.heat && it.heat.t === o.id) {
          t = o; // 还在火上的先起锅
          break;
        }
        if (!t) t = o;
      }
      if (!t) return null;
      const loc = itemById(S, t.loc);
      const p1 = loc ? standAt(S, loc, map) : self(map);
      if (!p1) return null;
      const f = freeNear(S, 'pass', map);
      const legs = [{ x: p1.x, y: p1.y, dur: 0.3, fn: 'takeOff', a: { t: t.id }, st: t.loc }];
      if (f) legs.push({ x: f.pos.x, y: f.pos.y, dur: 1.2, fn: 'plateDone', a: { t: t.id, pass: f.it.id }, st: f.it.id });
      else legs.push({ x: p1.x, y: p1.y, dur: 2.2, fn: 'plateDone', a: { t: t.id, pass: 0 }, st: t.loc });
      return mkTask('plate', legs, { tickets: [t.id], items: f ? [f.it.id] : [] });
    },
    serve(S, s, map) {
      for (const t of S.tickets) {
        if (t.stage !== 'ready' || t.claimed) continue;
        const g = grp(S, t.g);
        const table = g && itemById(S, g.table);
        if (!table) continue;
        const loc = itemById(S, t.loc);
        const p1 = loc ? standAt(S, loc, map) : self(map);
        if (!p1) continue;
        const p2 = standAt(S, table, bfs(S, p1.x, p1.y));
        if (!p2) continue;
        const ids = S.tickets
          .filter((o) => o.stage === 'ready' && !o.claimed && o.g === t.g && o.loc === t.loc)
          .slice(0, 4)
          .map((o) => o.id);
        return mkTask(
          'serve',
          [
            { x: p1.x, y: p1.y, dur: 0.25, fn: 'pickup', a: { ids }, st: t.loc },
            { x: p2.x, y: p2.y, dur: 0.4, fn: 'deliver', a: { ids, g: g.id }, st: table.id },
          ],
          { tickets: ids }
        );
      }
      return null;
    },
    order(S, s, map) {
      let g = null;
      for (const o of S.groups) if (o.state === 'wantOrder' && !o.claimed && (!g || o.pat < g.pat)) g = o;
      if (!g) return null;
      const table = itemById(S, g.table);
      const pos = table && standAt(S, table, map);
      if (!pos) return null;
      const base = sim.stationCount(S, 'counter') > 0 ? 1.8 : 3;
      return mkTask('order', [{ x: pos.x, y: pos.y, dur: base + 0.3 * g.size, fn: 'orderDone', a: { g: g.id }, st: table.id }], { group: g.id });
    },
    cash(S, s, map) {
      let g = null;
      for (const o of S.groups) if (o.state === 'wantPay' && !o.claimed && (!g || o.pat < g.pat)) g = o;
      if (!g) return null;
      let pos, dur, st;
      if (g.atCounter) {
        const c = itemById(S, g.counter);
        pos = c ? standAt(S, c, map, { x: Math.round(g.m[0].x), y: Math.round(g.m[0].y) }) : self(map);
        dur = 1.2;
        st = g.counter;
      } else {
        const table = itemById(S, g.table);
        pos = table && standAt(S, table, map);
        dur = 2.5;
        st = g.table;
      }
      if (!pos) return null;
      return mkTask('cash', [{ x: pos.x, y: pos.y, dur, fn: 'payDone', a: { g: g.id }, st }], { group: g.id });
    },
    drink(S, s, map) {
      const t = S.tickets.find((o) => o.stage === 'mix' && !o.claimed);
      if (!t) return null;
      const d = MR.DISHES[t.dish];
      let st = null,
        pos,
        slow = 1,
        claim = [];
      if (sim.stationCount(S, 'drinkbar') > 0) {
        const f = freeNear(S, 'drinkbar', map);
        if (!f) return null;
        st = f.it;
        pos = f.pos;
        claim = [st.id];
      } else {
        slow = 2; // 没饮品台：在货架边拿暖壶现沏
        const sh = S.items.find((it) => it.type === 'shelf');
        pos = (sh && standAt(S, sh, map)) || self(map);
        st = sh || null;
      }
      return mkTask('drink', [{ x: pos.x, y: pos.y, dur: d.cook * slow * K(), fn: 'mixDone', a: { t: t.id, it: st && st.id, bar: slow === 1 }, st: st && st.id }], { tickets: [t.id], items: claim });
    },
    clean(S, s, map) {
      let best = null;
      for (const it of S.items) {
        if (!it.dirty || it.cleaner || it.g) continue;
        const p = standAt(S, it, map);
        if (p && (!best || p.d < best.p.d)) best = { it, p };
      }
      if (best) return mkTask('clean', [{ x: best.p.x, y: best.p.y, dur: 2.5, fn: 'cleanTable', a: { it: best.it.id }, st: best.it.id }], { table: best.it.id });
      let sp = null,
        bd = 1e9;
      for (const o of S.spots) {
        if (o.claimed) continue;
        const d = map.dist[idx(o.x, o.y)];
        if (d >= 0 && d < bd) {
          bd = d;
          sp = o;
        }
      }
      if (sp) return mkTask('clean', [{ x: sp.x, y: sp.y, dur: 2, fn: 'cleanSpot', a: { id: sp.id } }], { spot: sp.id });
      return null;
    },
    repair(S, s, map) {
      const svc = sim.inService(S);
      let best = null;
      for (const it of S.items) {
        const def = MR.ITEMS[it.type];
        if (!def.wear || it.fixer) continue;
        const need = it.broken || (!svc && it.dur < 45 && !it.user && !it.heat);
        if (!need) continue;
        const cost = it.broken ? 30 : 12;
        if (S.cash < cost) continue;
        const p = standAt(S, it, map);
        if (!p) continue;
        const score = (it.broken ? 0 : 100) + p.d;
        if (!best || score < best.score) best = { it, p, score };
      }
      if (!best) return null;
      const it = best.it;
      return mkTask('repair', [{ x: best.p.x, y: best.p.y, dur: it.broken ? 12 : 6, fn: 'repairDone', a: { it: it.id }, st: it.id }], { fix: it.id });
    },
    research(S, s, map) {
      if (!S.research || sim.inService(S) || S.groups.some((g) => g.kind === 'guest')) return null;
      const f = freeNear(S, 'board', map);
      const pos = f ? f.pos : self(map);
      return mkTask('research', [{ x: pos.x, y: pos.y, dur: 15, fn: 'researchTick', a: {}, st: f && f.it.id }], { items: f ? [f.it.id] : [] });
    },
  };

  function pickJob(S, s) {
    const map = bfs(S, s.x, s.y);
    if (s.forced) {
      if (S.clock - s.forcedAt > 40) s.forced = null;
      else {
        const t = TRY[s.forced](S, s, map);
        if (t) {
          s.forced = null;
          t.forced = true;
          return t;
        }
      }
    }
    for (let p = 1; p <= 4; p++)
      for (const job of MR.JOB_ORDER) {
        if (s.prio[job] !== p) continue;
        const t = TRY[job](S, s, map);
        if (t) return t;
      }
    // 没活干：非营业时段去歇着
    if (!sim.inService(S) && s.energy < 97) {
      const f = freeNear(S, 'rest', map);
      const pos = f ? f.pos : self(map);
      const t = mkTask('rest', [{ x: pos.x, y: pos.y, dur: 10, fn: 'restDone', a: {}, st: f && f.it.id }], { items: f ? [f.it.id] : [] });
      t.chair = !!f;
      return t;
    }
    return null;
  }

  // ============ 评分 ============
  function totalOf(t) {
    const cat = MR.DISHES[t.dish].cat;
    let s = 0;
    for (const d of MR.DIMS[cat]) s += (t.sc[d.k] == null ? 60 : t.sc[d.k]) * d.w;
    return clamp(s, 0, 100);
  }
  function ingScore(t) {
    const d = MR.DISHES[t.dish];
    let v = 42 + 58 * Math.pow(t.fresh, 0.8);
    if (d.wash > 0 && !t.sink) v = Math.min(v, 72);
    return clamp(v, 5, 100);
  }
  function fireScore(S, s, d, it, distract) {
    let v = 25 + 0.55 * s.skills.fire + (it ? MR.TIER_BONUS[it.tier] * durF(it) : 0) - d.fd * 0.5 - 4 * (distract || 0) + adj(s) + jit(S, 6);
    if (s.trait === 'hasty') v -= 8;
    if (s.trait === 'steady') v += 6;
    if (it && it.dur < 30) v = Math.min(v, 60);
    return clamp(v, 5, 100);
  }
  const seasonScore = (S, s) => clamp(38 + 0.6 * s.skills.season + adj(s) * 0.5 + jit(S, 5), 5, 100);

  function addSpot(S, x, y) {
    if (S.spots.length >= 24) return;
    const cand = [{ x, y }];
    for (const d of DIRS) cand.push({ x: x + d[0], y: y + d[1] });
    for (const c of cand) {
      if (!walkable(S, c.x, c.y) || c.y === C.STREET_Y || sim.isDoor(c.x, c.y)) continue;
      if (S.spots.some((o) => o.x === c.x && o.y === c.y)) continue;
      S.spots.push({ id: S.nextId++, x: c.x, y: c.y, claimed: 0 });
      return;
    }
  }

  // ============ 工序完成 ============
  const H = {
    washDone(S, s, a) {
      const t = tk(S, a.t);
      if (!t) return;
      t.sink = a.sink;
      t.stage = MR.DISHES[t.dish].cut > 0 ? 'cut' : 'cook';
      gain(s, 'clean', 0.06);
    },
    cutDone(S, s, a) {
      const t = tk(S, a.t);
      if (!t) return;
      const d = MR.DISHES[t.dish];
      const it = itemById(S, a.it);
      const waiting = S.tickets.filter((o) => o.stage === 'cut' && !o.claimed).length;
      const rush = clamp((waiting - 2) * 3, 0, 12);
      let v = 25 + 0.55 * s.skills.knife + (it ? MR.TIER_BONUS[it.tier] * durF(it) : 0) - d.kd * 0.5 - rush + (s.trait === 'deft' ? 6 : 0) + adj(s) + jit(S, 5);
      if (it && it.dur < 30) v = Math.min(v, 60);
      if (!it) v = Math.min(v, 48);
      t.sc.knife = clamp(v, 5, 100);
      t.by.cut = s.name;
      t.stage = 'cook';
      wear(S, it);
      gain(s, 'knife', 0, it ? SKILL_CAP[it.tier] : 50);
    },
    cookDone(S, s, a) {
      const t = tk(S, a.t);
      if (!t) return;
      const d = MR.DISHES[t.dish];
      const it = itemById(S, a.it);
      t.sc.fire = fireScore(S, s, d, it, 0);
      t.sc.season = seasonScore(S, s);
      t.by.cook = s.name;
      t.cookId = s.id;
      t.stage = 'plate';
      t.loc = a.it;
      wear(S, it);
      gain(s, 'fire', 0, it ? SKILL_CAP[it.tier] : 50);
      gain(s, 'season', 0.06);
      if (it && rnd(S) < 0.12) addSpot(S, s.x, s.y);
    },
    cookStart(S, s, a) {
      const t = tk(S, a.t);
      const it = itemById(S, a.it);
      if (!t || !it) return;
      const d = MR.DISHES[t.dish];
      const distract = S.items.filter((o) => o.heat && o.heat.by === s.id && !o.heat.done).length;
      t.sc.fire = fireScore(S, s, d, it, distract);
      t.sc.season = seasonScore(S, s);
      t.by.cook = s.name;
      t.cookId = s.id;
      t.stage = 'heat';
      t.loc = it.id;
      it.heat = { t: t.id, start: S.clock, end: S.clock + (d.cook * K()) / (1 + 0.12 * it.tier), by: s.id, done: false, doneAt: 0 };
      gain(s, 'fire', 0, SKILL_CAP[it.tier]);
      gain(s, 'season', 0.06);
    },
    takeOff(S, s, a) {
      const t = tk(S, a.t);
      if (!t) return;
      const it = itemById(S, t.loc);
      if (it && it.heat && it.heat.t === t.id) {
        const over = S.clock - it.heat.doneAt - 1.5;
        if (over > 0) {
          t.sc.fire = clamp(t.sc.fire - Math.min(35, over * 2.5), 5, 100);
          t.over = over;
        }
        it.heat = null;
        wear(S, it);
        if (rnd(S) < 0.1) addSpot(S, s.x, s.y);
      }
    },
    plateDone(S, s, a) {
      const t = tk(S, a.t);
      if (!t) return;
      const g = grp(S, t.g);
      const rushed = g && g.state === 'waitFood' && g.pat / g.patMax < 0.3;
      t.sc.plate = clamp(25 + 0.55 * s.skills.plate + (a.pass ? 15 : 3) + (s.trait === 'deft' ? 6 : 0) + adj(s) - (rushed ? 6 : 0) + jit(S, 4), 5, 100);
      t.sc.ing = ingScore(t);
      t.by.plate = s.name;
      t.stage = 'ready';
      if (a.pass) t.loc = a.pass;
      t.readyAt = S.clock;
      gain(s, 'plate');
    },
    mixDone(S, s, a) {
      const t = tk(S, a.t);
      if (!t) return;
      const bar = a.bar;
      const dk = s.skills.drink;
      let hand = 25 + 0.6 * dk + (bar ? 14 : 0) + adj(s) + jit(S, 5);
      if (!bar) hand = Math.min(hand, 62);
      t.sc.knife = clamp(hand, 5, 100);
      t.sc.season = clamp(27 + 0.6 * dk + (bar ? 8 : 0) - MR.DISHES[t.dish].fd * 0.3 + jit(S, 7), 5, 100);
      t.sc.plate = clamp(30 + 0.5 * s.skills.plate + (bar ? 12 : 0) + jit(S, 4), 5, 100);
      t.sc.ing = ingScore(t);
      t.by.cook = s.name;
      t.cookId = s.id;
      t.bar = bar;
      t.stage = 'ready';
      t.loc = a.it || 0;
      t.readyAt = S.clock;
      if (bar) wear(S, itemById(S, a.it));
      gain(s, 'drink');
    },
    pickup(S, s, a) {
      let n = 0;
      for (const id of a.ids) {
        const t = tk(S, id);
        if (t && t.stage === 'ready') {
          t.stage = 'carry';
          n++;
        }
      }
      s.carry = n;
      if (!n) abortTask(S, s);
    },
    deliver(S, s, a) {
      const g = grp(S, a.g);
      for (const id of a.ids) {
        const t = tk(S, id);
        if (t && g) serveTicket(S, s, t, g);
      }
      s.carry = 0;
      gain(s, 'serve', 0.06);
      if (g && s.trait === 'chatty' && rnd(S) < 0.25) {
        g.chat += 3;
        fx(S, { k: 'say', x: s.x, y: s.y, text: '聊上了' });
      }
    },
    orderDone(S, s, a) {
      const g = grp(S, a.g);
      if (g) placeOrders(S, g, s);
      gain(s, 'serve', 0.08);
    },
    payDone(S, s, a) {
      const g = grp(S, a.g);
      if (g) checkout(S, g, 1);
      gain(s, 'cash', 0.1);
    },
    cleanTable(S, s, a) {
      const it = itemById(S, a.it);
      if (it) it.dirty = false;
      gain(s, 'clean', 0.08);
    },
    cleanSpot(S, s, a) {
      S.spots = S.spots.filter((o) => o.id !== a.id);
      gain(s, 'clean', 0.08);
    },
    repairDone(S, s, a) {
      const it = itemById(S, a.it);
      if (!it) return;
      const cost = it.broken ? 30 : 12;
      if (S.cash < cost) return;
      spend(S, cost, 'repair');
      it.broken = false;
      it.dur = s.skills.repair >= 40 ? 100 : 85;
      gain(s, 'repair', 0.3);
      fx(S, { k: 'say', x: it.x, y: it.y, text: '修好了' });
    },
    researchTick(S, s) {
      const r = S.research;
      if (!r) return;
      r.done += 15;
      gain(s, 'research', 0.2);
      if (r.done >= r.need) {
        const m = S.menu[r.dish];
        m.unlocked = true;
        m.on = true;
        S.research = null;
        S.flags.researched = (S.flags.researched || 0) + 1;
        addMood(S, s, 'newdish', '研发出一道新菜', 6, 48);
        const d = MR.DISHES[r.dish];
        const need = d.cat === 'drink' && !d.needBar ? '' : sim.stationCount(S, d.station) ? '' : '（还缺「' + MR.ITEMS[d.station].name + '」才能做）';
        log(S, s.name + ' 研发出了「' + d.name + '」，已上菜单' + need, 'menu', true);
      }
    },
    restDone() {},
  };

  function serveTicket(S, s, t, g) {
    const d = MR.DISHES[t.dish];
    const waited = S.clock - (t.readyAt || S.clock);
    if (d.cat === 'drink') t.sc.fire = clamp((t.bar ? 96 : 84) - waited * (t.bar ? 1.5 : 3) + jit(S, 3), 20, 100);
    if (d.cat === 'dessert') t.sc.knife = clamp(94 - waited * 2.2 + jit(S, 3), 30, 100);
    const total = Math.round(totalOf(t));
    const tier = MR.tierOf(total);
    const m = S.menu[t.dish];
    m.sold++;
    m.sum = m.sum * 0.85 + total * 0.15 * (m.n ? 1 : 1 / 0.15);
    m.n++;
    g.dishes.push({ id: t.dish, total, price: m.price, ratio: m.price / sim.fairPrice(S, t.dish), fire: d.cat === 'dish' ? t.sc.fire : total });
    g.served++;
    g.pat = g.patMax;
    const td = S.today;
    td.dishes++;
    td.scoreSum += total;
    if (d.cat === 'dish') for (const k in td.dim) td.dim[k] += t.sc[k] || 0;
    td.dimN = (td.dimN || 0) + (d.cat === 'dish' ? 1 : 0);
    if (tier.key === 'bad') {
      td.bad++;
      S.wk.bad = (S.wk.bad || 0) + 1;
    }
    if (tier.key === 'god') td.god++;
    S.rateN = (S.rateN || 0) + 1;
    S.ratings.push({ n: S.rateN, day: S.day, m: Math.floor(S.minute), dish: t.dish, sc: Object.assign({}, t.sc), total, tier: tier.key, by: t.by, over: t.over || 0, guest: g.label });
    if (S.ratings.length > 40) S.ratings.shift();
    S.flags.rated = true;
    if (!S.flags.ratedPhase) S.flags.ratedPhase = sim.phase(S);
    const table = itemById(S, g.table);
    fx(S, { k: 'score', x: table ? table.x + (table.type === 'table2' && !table.rot ? 1 : 0.5) : s.x, y: table ? table.y : s.y, total, tier: tier.key });
    const cook = S.staff.find((o) => o.id === t.cookId);
    if (cook) {
      if (tier.key === 'god') {
        addMood(S, cook, 'god', '做成了一道神作', 8, 48);
        if (g.reg) {
          addMood(S, cook, 'praise', '被熟客点名表扬', 6, 48);
          log(S, g.label + '点名夸了 ' + cook.name + ' 的「' + d.name + '」', 'good', true);
        }
      } else if (tier.key === 'bad') {
        cook.flops = (cook.flops || 0) + 1;
        addMood(S, cook, 'flop', cook.flops >= 2 ? '今天连续翻车' : '有道菜翻车了', cook.flops >= 2 ? -8 : -4, 24);
      }
    }
    S.tickets = S.tickets.filter((o) => o !== t);
    if (g.served >= g.orders && g.state === 'waitFood') {
      g.state = 'eating';
      g.t = MR.GUEST_TYPES[g.type].eat * (1 + 0.08 * (g.size - 1));
    }
  }

  // ============ 客人 ============
  function availDishes(S, cat) {
    const out = [];
    for (const id of MR.DISH_ORDER) if (MR.DISHES[id].cat === cat && sim.dishStatus(S, id) === 'ok') out.push(id);
    return out;
  }
  function chooseDish(S, g, list) {
    const reg = g.reg && S.regulars.find((r) => r.id === g.reg);
    const w = [];
    for (const id of list) {
      const d = MR.DISHES[id];
      const ratio = S.menu[id].price / sim.fairPrice(S, id);
      let v = d.pop * Math.pow(clamp(1.9 - ratio, 0, 1.4), 1.5);
      if (reg && reg.fav === id) v *= 6;
      if (g.type === 'gourmet' || g.type === 'critic') v *= d.ref / 20;
      w.push([id, v]);
    }
    return wpick(S, w);
  }
  function makeTicket(S, id, g) {
    const d = MR.DISHES[id];
    let f = 0,
      n = 0;
    for (const k in d.ing) {
      f += takeStock(S, k, d.ing[k]) * d.ing[k];
      n += d.ing[k];
    }
    const stage = d.cat === 'drink' ? 'mix' : d.wash > 0 ? 'wash' : d.cut > 0 ? 'cut' : 'cook';
    S.tickets.push({ id: S.nextId++, dish: id, g: g.id, stage, claimed: 0, sc: {}, by: {}, fresh: n ? f / n : 1, at: S.clock, loc: 0, sink: false, bar: false });
  }
  function placeOrders(S, g) {
    let n = 0;
    const want = (cat) => {
      const id = chooseDish(S, g, availDishes(S, cat));
      if (id) {
        makeTicket(S, id, g);
        n++;
      }
      return id;
    };
    const rest = g.type === 'rester';
    for (let i = 0; i < g.size; i++) {
      let got = false;
      if (rest) {
        if (rnd(S) < 0.9) got = !!want('drink') || got;
        if (rnd(S) < 0.5 || !got) got = !!want('dessert') || got;
        if (!got) got = !!want('drink');
        if (!got) want('dish');
      } else {
        want('dish');
        if (rnd(S) < 0.35) want('drink');
        if (rnd(S) < 0.2) want('dessert');
      }
    }
    if (!n) {
      S.today.noDish++;
      S.rep = clamp(S.rep - 0.4, 0, 100);
      log(S, '有客人坐下却没菜可点（缺料或设备坏了），走了', 'warn', true);
      leave(S, g, 'nodish');
      return;
    }
    g.orders = n;
    g.state = 'waitFood';
    g.patMax = g.pat = 42 * MR.GUEST_TYPES[g.type].patience;
    S.flags.ordered = true;
    if (!S.flags.orderedPhase) S.flags.orderedPhase = sim.phase(S);
  }
  function findTable(S, size) {
    let best = null;
    for (const it of S.items) {
      const seats = MR.ITEMS[it.type].seats;
      if (!seats || seats < size || it.g || it.dirty) continue;
      if (!best || seats < MR.ITEMS[best.type].seats) best = it;
    }
    return best;
  }
  function sit(S, g, tb) {
    tb.g = g.id;
    g.table = tb.id;
    g.state = 'toTable';
    const chairs = _.itemCells(tb).filter((c) => c.k === 3);
    g.m.forEach((m, i) => {
      const c = chairs[i];
      if (!go(S, m, c.x, c.y, true)) {
        m.x = c.x;
        m.y = c.y;
        m.path = [];
      }
    });
  }
  function spawnGroup(S, type, size, extra) {
    const side = rnd(S) < 0.5 ? 0 : C.COLS - 1;
    const tp = MR.GUEST_TYPES[type];
    const g = Object.assign({ id: S.nextId++, kind: 'guest', type, size, state: 'queue', t: 0, pat: 0, patMax: 1, table: 0, m: [], orders: 0, served: 0, dishes: [], waitFrac: 0, claimed: 0, reg: 0, chat: 0, atCounter: false, counter: 0, side, label: tp.name, hue: rint(S, 0, 5) }, extra || {});
    for (let i = 0; i < size; i++) g.m.push({ x: side, y: C.STREET_Y, path: [], delay: i * 0.35, dir: side ? -1 : 1 });
    S.groups.push(g);
    const tb = findTable(S, size);
    if (tb && !S.groups.some((o) => o.state === 'queue' && o !== g)) sit(S, g, tb);
    else {
      const wc = Math.min(3, S.items.filter((it) => it.type === 'waitchair').length);
      let pat = 30 * tp.patience * (1 + 0.25 * wc);
      // 平静头两天门口只排得下一小波人，再给一点耐心，让这一位多半能等到桌子，而不是连着走掉。
      if (S.story !== 'tense' && S.day <= 2) pat *= 1.4;
      g.patMax = g.pat = pat;
    }
    return g;
  }
  function freeTable(S, g, dirty) {
    const tb = itemById(S, g.table);
    if (tb) {
      tb.g = 0;
      if (dirty) {
        tb.dirty = true;
        if (rnd(S) < 0.45) addSpot(S, tb.x + rint(S, -1, 1), tb.y + (rnd(S) < 0.5 ? 1 : -1));
      }
    }
    g.table = 0;
  }
  function depart(S, g) {
    if (g.table) freeTable(S, g, g.served > 0);
    g.state = 'leaving';
    g.claimed = 0;
    for (const m of g.m) {
      m.delay = 0;
      if (!go(S, m, g.side, C.STREET_Y)) m.path = [];
    }
  }
  function cancelTickets(S, g) {
    let lost = 0;
    for (const t of S.tickets) {
      if (t.g !== g.id) continue;
      lost += sim.dishCost(t.dish);
      if (t.claimed) {
        const s = S.staff.find((o) => o.id === t.claimed);
        if (s) abortTask(S, s);
      }
      for (const it of S.items) if (it.heat && it.heat.t === t.id) it.heat = null;
    }
    S.tickets = S.tickets.filter((t) => t.g !== g.id);
    if (lost) {
      S.today.waste += lost;
      S.wk.waste = (S.wk.waste || 0) + lost;
    }
  }
  function leave(S, g, why) {
    const td = S.today;
    if (why === 'queue') {
      td.walkQueue++;
      S.rep = clamp(S.rep - 0.05, 0, 100);
    } else if (why === 'order') {
      td.walkOrder++;
      S.rep = clamp(S.rep - 0.6, 0, 100);
    } else if (why === 'food') {
      td.walkFood++;
      S.rep = clamp(S.rep - 1.0, 0, 100);
      if (g.reg) {
        const r = S.regulars.find((o) => o.id === g.reg);
        if (r) r.away = S.day + 5;
      }
    }
    if (why !== 'nodish') S.wk.walk = (S.wk.walk || 0) + 1;
    const m = g.m[0];
    g.sat = 0;
    fx(S, { k: 'angry', x: m.x, y: m.y });
    cancelTickets(S, g);
    // 已经上桌的菜照价付八折
    if (g.dishes.length && why === 'food') {
      let bill = 0;
      for (const d of g.dishes) bill += d.price;
      earn(S, bill * 0.8, 'rev');
    }
    depart(S, g);
  }

  function checkout(S, g, factor) {
    const tp = MR.GUEST_TYPES[g.type];
    const n = g.dishes.length;
    if (!n) {
      depart(S, g);
      return;
    }
    let bill = 0,
      food = 0,
      ratio = 0,
      fire = 0,
      best = g.dishes[0],
      refund = 0;
    for (const d of g.dishes) {
      let p = d.price;
      if (d.total < 40 && rnd(S) < 0.5) {
        refund += p;
        p = 0;
      }
      bill += p;
      food += d.total;
      ratio += d.ratio;
      fire += d.fire;
      if (d.total > best.total) best = d;
    }
    food /= n;
    ratio /= n;
    fire /= n;
    if (tp.focus === 'fire') food += 0.35 * (fire - 62);
    const env = sim.env(S);
    let sat = food - 24 * Math.max(0, (g.waitFrac - 0.5) / 0.5) + Math.min(9, env * 0.3) * (tp.focus === 'env' ? 1.8 : 1) - Math.min(14, S.spots.length) - clamp((ratio - 1) * 45, -8, 18) + g.chat + (factor < 1 ? -12 : 0);
    sat = clamp(sat, 0, 100);
    g.sat = sat;
    const tipRate = sat >= 90 ? 0.2 : sat >= 75 ? 0.08 : 0;
    const tip = bill * factor * tipRate * tp.tip;
    const pay = Math.round(bill * factor + tip);
    earn(S, pay, 'rev');
    const td = S.today;
    td.tips += Math.round(tip);
    td.groups++;
    td.guests += g.size;
    td.satSum += sat;
    td.satN++;
    S.wk.groups = (S.wk.groups || 0) + 1;
    S.wk.satSum = (S.wk.satSum || 0) + sat;
    // 口碑向「近期满意度」对应的水平靠拢：满意度 60 → 口碑 30，75 → 60，90 → 90
    let d = (clamp(2 * sat - 90, 0, 100) - S.rep) * 0.012;
    if (g.type === 'critic') {
      d *= 6;
      if (sat >= 72) log(S, '那位独自吃饭的客人是探店的评论者，发了篇好评（满意度 ' + Math.round(sat) + '），口碑大涨', 'good', true);
      else if (sat < 52) log(S, '评论者发了篇差评（满意度 ' + Math.round(sat) + '），接下来几天客人会变少', 'warn', true);
      else log(S, '评论者来过，写得不咸不淡', 'info', true);
    }
    S.rep = clamp(S.rep + d, 0, 100);
    if (S.rep > S.repMax) S.repMax = S.rep;
    if (refund) log(S, '一道翻车菜被退了，少收 ' + money(refund), 'warn');
    // 熟客
    if (g.reg) {
      const r = S.regulars.find((o) => o.id === g.reg);
      if (r) {
        r.visits++;
        r.last = S.day;
        if (sat < 45) {
          r.away = S.day + 7;
          log(S, r.name + '这次吃得不满意，一阵子不会来了', 'warn', true);
        }
      }
    } else if (g.type !== 'critic' && sat >= 76 && S.regulars.length < 12 && rnd(S) < 0.22) {
      const used = S.regulars.map((r) => r.name);
      const pool = MR.NAMES.regular.filter((x) => !used.includes(x));
      if (pool.length) {
        const r = { id: S.nextId++, name: pick(S, pool), fav: best.id, visits: 1, last: S.day, away: 0, since: S.day };
        S.regulars.push(r);
        log(S, '多了一位熟客：' + r.name + '，记住了你家的「' + MR.DISHES[r.fav].name + '」', 'good', true);
      }
    }
    const m = g.m[0];
    fx(S, { k: 'pay', x: m.x, y: m.y, text: '+' + money(pay), stars: Math.max(1, Math.round(sat / 20)) });
    S.flags.paid = true;
    depart(S, g);
  }

  function updateGroup(S, g, dt) {
    let moving = false;
    for (const m of g.m) {
      if (m.delay > 0) {
        m.delay -= dt;
        moving = true;
        continue;
      }
      if (m.path.length) {
        if (m._ver !== S._ver && m.goal && !go(S, m, m.goal.x, m.goal.y, m.goal.cell)) {
          m.x = m.goal.x;
          m.y = m.goal.y;
          m.path = [];
        }
        moveAlong(m, C.GUEST_SPEED * dt);
      }
      if (m.path.length) moving = true;
    }
    const tp = MR.GUEST_TYPES[g.type] || MR.GUEST_TYPES.passerby;
    switch (g.state) {
      case 'queue': {
        const q = S.groups.filter((o) => o.state === 'queue');
        const qi = q.indexOf(g);
        const tx = Math.min(C.COLS - 1, C.DOOR.x + 1 + qi);
        for (const m of g.m) if (!m.path.length && (Math.round(m.x) !== tx || Math.round(m.y) !== C.STREET_Y)) go(S, m, tx, C.STREET_Y);
        if (qi === 0 || q.slice(0, qi).every((o) => o.size > g.size)) {
          const tb = findTable(S, g.size);
          if (tb) {
            sit(S, g, tb);
            break;
          }
        }
        g.pat -= dt;
        if (g.pat <= 0) leave(S, g, 'queue');
        break;
      }
      case 'toTable':
        if (!moving) {
          g.state = 'browse';
          g.t = S.qr ? 1.5 : 2.5;
        }
        break;
      case 'browse':
        g.t -= dt;
        if (g.t <= 0) {
          if (S.qr) placeOrders(S, g);
          else {
            g.state = 'wantOrder';
            g.patMax = g.pat = 18 * tp.patience;
          }
        }
        break;
      case 'wantOrder':
        if (!g.claimed) {
          g.pat -= dt;
          if (g.pat <= 0) leave(S, g, 'order');
        }
        break;
      case 'waitFood':
        g.pat -= dt;
        g.waitFrac = Math.max(g.waitFrac, 1 - g.pat / g.patMax);
        if (g.pat <= 0) leave(S, g, 'food');
        break;
      case 'eating':
        g.t -= dt;
        if (g.t <= 0) {
          if (S.qr) checkout(S, g, 1);
          else {
            const c = S.items.find((it) => it.type === 'counter');
            const p = c && standAt(S, c, bfs(S, C.DOOR.x, C.DOOR.y - 1));
            if (p) {
              freeTable(S, g, true);
              g.counter = c.id;
              g.state = 'toCounter';
              for (const m of g.m) go(S, m, p.x, p.y);
            } else {
              g.state = 'wantPay';
              g.patMax = g.pat = 15 * tp.patience;
            }
          }
        }
        break;
      case 'toCounter':
        if (!moving) {
          g.state = 'wantPay';
          g.atCounter = true;
          g.patMax = g.pat = 15 * tp.patience;
        }
        break;
      case 'wantPay':
        if (!g.claimed) {
          g.pat -= dt;
          if (g.pat <= 0) checkout(S, g, 0.85); // 等不到人结账：放下八五折的钱走人
        }
        break;
      case 'leaving':
        if (!moving) g.gone = true;
        break;
      case 'vin':
        if (!moving) {
          g.state = 'vstay';
          g.t = g.vtype === 'inspector' ? 7 : 4;
          if (g.vtype === 'landlord') landlordTalk(S, g);
        }
        break;
      case 'vstay':
        g.t -= dt;
        if (g.t <= 0) {
          if (g.vtype === 'inspector') inspect(S, g);
          depart(S, g);
        }
        break;
    }
  }

  // ============ 访客事件 ============
  function spawnVisitor(S, vtype) {
    const side = rnd(S) < 0.5 ? 0 : C.COLS - 1;
    const g = { id: S.nextId++, kind: 'visitor', vtype, type: 'passerby', size: 1, state: 'vin', t: 0, pat: 1, patMax: 1, table: 0, m: [{ x: side, y: C.STREET_Y, path: [], delay: 0, dir: 1 }], orders: 0, served: 0, dishes: [], claimed: 0, side, label: vtype === 'inspector' ? '卫生检查员' : '房东' };
    const target = vtype === 'inspector' ? nearWalkable(S, 6, 2) : nearWalkable(S, 4, 7);
    go(S, g.m[0], target.x, target.y);
    S.groups.push(g);
  }
  function inspect(S, g) {
    const why = [];
    let fine = 0;
    if (S.spots.length >= 8) {
      fine += 150;
      why.push('地面脏乱');
    }
    if (S.storeUse.floor > 0) {
      fine += 100;
      why.push('食材堆在地上');
    }
    if (fine) {
      fine = Math.min(fine, Math.max(0, S.cash));
      spend(S, fine, 'fines');
      S.rep = clamp(S.rep - 1.5, 0, 100);
      log(S, '卫生检查没过（' + why.join('、') + '），罚款 ' + money(fine), 'warn', true);
    } else {
      S.rep = clamp(S.rep + 1.5, 0, 100);
      log(S, '卫生检查通过，门口贴了张「良好」', 'good', true);
    }
  }
  function landlordTalk(S, g) {
    const rent = sim.rent(S);
    const m = g.m[0];
    if (S.cash >= rent) {
      fx(S, { k: 'say', x: m.x, y: m.y, text: '钱备好了就行' });
      log(S, '房东来转了一圈：「钱备好了就行，明晚 22:00 见。」', 'info', true);
    } else {
      fx(S, { k: 'say', x: m.x, y: m.y, text: '明晚交租' });
      log(S, '房东提前来提醒：明晚 22:00 交 ' + money(rent) + '，你现在还差 ' + money(rent - S.cash) + '。', 'warn', true);
    }
  }

  // ============ 客流 ============
  function priceFactor(S) {
    let r = 0,
      n = 0;
    for (const id of MR.DISH_ORDER) {
      const m = S.menu[id];
      if (m.unlocked && m.on) {
        r += m.price / sim.fairPrice(S, id);
        n++;
      }
    }
    if (!n) return 0;
    return clamp(1.7 - (0.7 * r) / n, 0.35, 1.2);
  }
  sim.arrivalRate = function (S) {
    const m = S.minute;
    let curve = 0;
    if (m >= C.LUNCH_START && m < C.LUNCH_END - C.LAST_ORDER) curve = 0.65 + 0.9 * Math.sin(Math.PI * clamp(((m - C.LUNCH_START) / (C.LUNCH_END - C.LUNCH_START)) * 1.12, 0, 1));
    else if (m >= C.DINNER_START && m < C.DINNER_END - C.LAST_ORDER) curve = 0.65 + 1.0 * Math.sin(Math.PI * clamp(((m - C.DINNER_START) / (C.DINNER_END - C.DINNER_START)) * 1.1, 0, 1));
    if (!curve) return 0;
    let r = (MR.TUNE.arrive / 60) * (0.35 + S.rep / 45) * curve * priceFactor(S);
    if (S.ev.weather === 'rain') r *= 0.55;
    if (S.ev.festival) r *= 1.7;
    return r * openingCrowd(S);
  };
  // 平静档头两天客流跟着座位走，周一午市再错开。
  // 开局只有两张双人桌、一口锅，原曲线会在门口堆出一长队并连着走掉，新人还没看清后厨就觉得自己在失败。
  // 紧张档、以及第三天起，恢复原曲线：周租、涨租和买断压力不动。
  function openingCrowd(S) {
    if (S.story === 'tense' || S.day > 2) return 1;
    let f = 1;
    if (S.day === 1 && sim.phase(S) === 'lunch') {
      const t = (S.minute - C.LUNCH_START) / 45;
      f *= Math.max(0.38, Math.min(1, 0.38 + 0.62 * t));
    } else if (S.day === 1) f *= 0.82;
    else f *= 0.9;
    const seats = Math.max(2, sim.seats(S));
    let seated = 0,
      q = 0;
    for (const g of S.groups) {
      if (g.kind !== 'guest' || g.state === 'leaving') continue;
      if (g.state === 'queue') q++;
      else seated += g.size;
    }
    const load = (seated + q * 2) / seats;
    // 已经有人在门口等，就先别再往里塞，避免一串人一起失去耐心。
    if (q >= 1) return 0;
    if (load >= 1) f *= 0.45;
    return f;
  }
  MR.TUNE = { arrive: 2.0, kitchen: 0.55 };

  function spawnRandom(S) {
    const lunch = sim.phase(S) === 'lunch';
    const has4 = S.items.some((it) => it.type === 'table4');
    const size = wpick(S, [
      [1, 35],
      [2, 45],
      [3, has4 ? 12 : 0],
      [4, has4 ? 10 : 0],
    ]);
    const sip = availDishes(S, 'drink').length + availDishes(S, 'dessert').length > 0;
    let type;
    if (size >= 3)
      type = wpick(S, [
        ['party', 6],
        ['family', 5],
      ]);
    else if (lunch)
      type = wpick(S, [
        ['office', 40],
        ['passerby', 35],
        ['gourmet', 10],
        ['rester', sip ? 14 : 0],
      ]);
    else
      type = wpick(S, [
        ['passerby', 42],
        ['gourmet', 18],
        ['rester', sip ? 10 : 0],
        ['office', 10],
        ['family', size === 2 ? 8 : 0],
      ]);
    if (!findTable(S, size) && S.groups.filter((o) => o.state === 'queue').length >= C.MAX_QUEUE) {
      S.today.turned++;
      S.wk.turned = (S.wk.turned || 0) + 1;
      return;
    }
    spawnGroup(S, type, size);
  }

  // ============ 每日事件 ============
  function rollEvents(S) {
    const next = S.evNext || {};
    S.ev = { weather: 'clear', festival: !!next.festival, notes: [] };
    S.evNext = {};
    S.sched = [{ at: 840, k: 'meal' }];
    const dow = sim.dow(S);
    if (S.ev.festival) log(S, '今天街区有小节庆，客流会比平时多不少', 'good', true);
    if (dow === 5 && !S.bought) S.sched.push({ at: 900, k: 'landlord' });
    if (S.gifts && S.gifts.includes(S.day)) {
      S.gifts = S.gifts.filter((d) => d !== S.day);
      addStock(S, 'veg', 6, 1);
      S.rep = clamp(S.rep + 1, 0, 100);
      log(S, '隔壁老板还了货，还多送一筐菜，顺口帮你在街坊里说了好话', 'good', true);
    }
    // 熟客
    const tight = !S.bought && dow >= 4 && S.cash < sim.rent(S);
    for (const r of S.regulars) {
      if (r.away > S.day) continue;
      if (rnd(S) < (tight ? 0.65 : S.ev.festival ? 0.5 : 0.4)) {
        const lunch = rnd(S) < 0.4;
        S.sched.push({ at: lunch ? rint(S, 670, 770) : rint(S, 1030, 1190), k: 'regular', rid: r.id, friend: tight || rnd(S) < 0.3 });
      }
    }
    if (S.day <= 2) return;
    const tense = S.story === 'tense';
    let p = tense ? 0.5 : 0.28;
    if (tense && dow >= 4) p += 0.15;
    const rolls = tense ? 2 : 1;
    const seen = {};
    for (let i = 0; i < rolls; i++) {
      if (rnd(S) >= (i ? 0.25 : p)) continue;
      const cookers = S.items.filter((it) => MR.ITEMS[it.type].wear && !it.broken && it.type !== 'board');
      const low = S.staff.filter((s) => sim.mood(s) < 40);
      const k = wpick(
        S,
        [
          ['rain', 3],
          ['festival', S.ev.festival ? 0 : 2],
          ['critic', S.rep >= 35 ? 2 : 0],
          ['inspect', 2],
          ['late', S.autoRestock ? 2 : 0],
          ['badbatch', S.autoRestock ? 2 : 0],
          ['borrow', 2],
          ['breakdown', cookers.length ? 2 : 0],
          ['quarrel', low.length >= 2 ? 3 : 0],
        ].filter((e) => !seen[e[0]])
      );
      if (!k) continue;
      seen[k] = 1;
      if (k === 'rain') {
        S.ev.weather = 'rain';
        log(S, '今天暴雨，路过的人会少一半；熟客照常', 'warn', true);
      } else if (k === 'festival') {
        S.evNext.festival = true;
        log(S, '听说明天街区有小节庆，客流会翻高——备用桌椅和食材够吗？', 'info', true);
      } else if (k === 'critic') S.sched.push({ at: rint(S, 1060, 1150), k: 'critic' });
      else if (k === 'inspect') S.sched.push({ at: rnd(S) < 0.5 ? rint(S, 700, 780) : rint(S, 1080, 1180), k: 'inspect' });
      else if (k === 'late') S.ev.late = true;
      else if (k === 'badbatch') S.ev.badbatch = true;
      else if (k === 'borrow') S.sched.push({ at: rint(S, 640, 655), k: 'borrow' });
      else if (k === 'breakdown') S.sched.push({ at: rnd(S) < 0.4 ? 725 : 1110, k: 'breakdown' });
      else if (k === 'quarrel') S.sched.push({ at: 750, k: 'quarrel' });
    }
  }
  function fire(S, e) {
    if (e.k === 'meal') staffMeal(S);
    else if (e.k === 'landlord') spawnVisitor(S, 'landlord');
    else if (e.k === 'inspect') {
      spawnVisitor(S, 'inspector');
      log(S, '卫生检查员进店抽查，正往后厨走', 'warn', true);
    } else if (e.k === 'critic') spawnGroup(S, 'critic', 1, { label: '独自吃饭的客人' });
    else if (e.k === 'regular') {
      const r = S.regulars.find((o) => o.id === e.rid);
      if (r) spawnGroup(S, 'regular', e.friend && S.items.some((it) => (MR.ITEMS[it.type].seats || 0) >= 2) ? 2 : 1, { reg: r.id, label: '熟客 ' + r.name });
    } else if (e.k === 'breakdown') {
      const c = S.items.filter((it) => MR.ITEMS[it.type].wear && !it.broken && it.type !== 'board');
      if (c.length) {
        const it = pick(S, c);
        it.dur = Math.min(it.dur, 25);
        _.releaseItem(S, it);
        breakItem(S, it, '高峰时冒烟停用了');
      }
    } else if (e.k === 'quarrel') {
      const low = S.staff.filter((s) => !s.off).sort((a, b) => sim.mood(a) - sim.mood(b));
      if (low.length >= 2 && sim.mood(low[1]) < 45) {
        addMood(S, low[0], 'quarrel', '和同事当众吵了一架', -8, 36);
        addMood(S, low[1], 'quarrel', '和同事当众吵了一架', -8, 36);
        fx(S, { k: 'angry', x: low[0].x, y: low[0].y });
        S.rep = clamp(S.rep - 0.8, 0, 100);
        log(S, low[0].name + ' 和 ' + low[1].name + ' 在店里吵了起来，客人都看见了', 'warn', true);
      }
    } else if (e.k === 'borrow') {
      const cand = MR.ING_ORDER.filter((k) => sim.stockQty(S, k) >= 8);
      if (cand.length) {
        const k = pick(S, cand);
        S.modals.push({ type: 'choice', id: 'borrow', k, n: 4, title: '邻居来借货', text: '隔壁面馆的老板探头进来：「' + MR.INGREDIENTS[k].name + '借我 4 份应个急，过两天还你。」', options: [{ label: '借给他', desc: '少 4 份' + MR.INGREDIENTS[k].name + '；过两天他会还，还会帮你说好话' }, { label: '今天不方便', desc: '什么也不会发生' }] });
      }
    }
  }
  sim.choose = function (S, m, i) {
    if (m.id === 'borrow') {
      if (i === 0) {
        takeStock(S, m.k, m.n);
        S.today.used[m.k] -= m.n;
        S.neighbor++;
        S.gifts = (S.gifts || []).concat(S.day + rint(S, 2, 3));
        log(S, '借给隔壁 ' + m.n + ' 份' + MR.INGREDIENTS[m.k].name, 'info');
      }
    } else if (m.id === 'badbatch') {
      const d = S.deliveries.find((o) => o.bad === m.k);
      const q = d ? d.items[m.k] : 0;
      if (!d) return;
      if (i === 0) {
        const refund = q * MR.INGREDIENTS[m.k].price;
        delete d.items[m.k];
        S.cash += refund;
        S.today.food -= refund;
        S.wk.food -= refund;
        log(S, '把不新鲜的' + MR.INGREDIENTS[m.k].name + '退了，退款 ' + money(refund) + '。今天这样食材可能不够用，可以在「采购」里再下一单', 'info', true);
      } else if (i === 1) {
        delete d.items[m.k];
        S.flags.mealFree = S.staff.length;
        for (const s of S.staff) addMood(S, s, 'meal0', '员工餐是不新鲜的货', -2, 20);
        log(S, '不新鲜的' + MR.INGREDIENTS[m.k].name + '留作今天的员工餐', 'info');
      } else {
        d.fresh = d.fresh || {};
        d.fresh[m.k] = 0.28;
        log(S, '不新鲜的' + MR.INGREDIENTS[m.k].name + '照常入库上菜，今天相关菜的食材分会很低', 'warn');
      }
      d.bad = null;
    }
  };
  function staffMeal(S) {
    for (const s of S.staff) {
      if (s.off) continue;
      if (S.flags.mealFree > 0) {
        S.flags.mealFree--;
        continue;
      }
      let best = null;
      for (const k of ['veg', 'egg', 'rice', 'meat']) {
        if (!sim.stockQty(S, k)) continue;
        const f = sim.stockFresh(S, k).min;
        if (!best || f < best.f) best = { k, f };
      }
      if (!best) addMood(S, s, 'meal', '没吃上员工餐', -8, 20);
      else {
        const f = takeStock(S, best.k, 1);
        S.today.used[best.k]--;
        if (f < 0.3) addMood(S, s, 'meal', '员工餐是临期食材', -3, 20);
        else addMood(S, s, 'meal', '吃了顿像样的员工餐', 3, 20);
      }
    }
  }

  // ============ 一天的开始与结束 ============
  function startDay(S, first) {
    if (!first) {
      S.day++;
      S.minute = C.DAY_START;
      S.clock = (S.day - 1) * 1440 + C.DAY_START;
      _.ageStock(S, 750);
      S.usedYesterday = S.today.used;
      S.today = _.newDayStats();
    }
    if (sim.dow(S) === 0 && !first) S.wk = { startCash: S.cash };
    S.halt = null;
    S.ageAcc = 0;
    S.groups = [];
    S.tickets = [];
    S.flags.mealFree = 0;
    for (const s of S.staff) {
      s.energy = s.energy < 15 && !first ? 85 : 100;
      s.off = false;
      s.forcedN = 0;
      s.flops = 0;
      s.task = null;
      s.path = [];
      s.carry = 0;
      s.think = 0;
      s.mods = s.mods.filter((m) => m.until > S.clock);
    }
    for (const it of S.items) {
      it.user = 0;
      it.heat = null;
      it.g = 0;
      it.fixer = 0;
      it.cleaner = 0;
    }
    if (!first) _.refreshCandidates(S);
    rollEvents(S);
    if (S.autoRestock && !(first && !S.tut.done)) {
      const r = _.restock(S, S.ev.late ? 110 : 0);
      if (r.ok) {
        const d = S.deliveries[S.deliveries.length - 1];
        if (S.ev.late) log(S, '供货商说今天要迟到，货大概 12:20 才到（' + money(r.cost) + '）', 'warn', true);
        else log(S, '早市补货到店，花费 ' + money(r.cost), 'stock');
        if (S.ev.badbatch) {
          const k = ['fish', 'meat', 'veg', 'egg'].find((x) => d.items[x] >= 3);
          if (k) {
            d.bad = k;
            S.modals.push({ type: 'choice', id: 'badbatch', k, title: '这批货不太新鲜', text: '今天到的 ' + d.items[k] + ' 份' + MR.INGREDIENTS[k].name + '一看就不新鲜。供货商站在门口等你说话。', options: [{ label: '退货', desc: '拿回货款，但今天缺这样食材，相关的菜可能要撤' }, { label: '留作员工餐', desc: '不退钱，今天的员工餐有着落，大家会有点嫌弃' }, { label: '照常上菜', desc: '省事，但这批货做出的菜食材分很低，可能翻车' }] });
          }
        }
        // 准时的早市货立刻上架。迟到和待处理的坏货仍留在途中，等时钟或玩家决定。
        if (d && !d.bad && d.at <= S.clock) _.takeDelivery(S, d);
      } else if (r.why === '现金不够进货') log(S, '现金不够，今天没能补货', 'warn', true);
    }
    S.sched.sort((a, b) => a.at - b.at);
    S.flags.saveNow = true;
  }
  _.startDay = startDay;

  function dayHint(S, t, operating) {
    const walks = t.walkFood + t.walkOrder + t.walkQueue;
    let r = 0,
      n = 0;
    for (const id of MR.DISH_ORDER) {
      const m = S.menu[id];
      if (m.unlocked && m.on) {
        r += m.price / sim.fairPrice(S, id);
        n++;
      }
    }
    r = n ? r / n : 1;
    if (walks >= 3) return '等待过久：今天有 ' + walks + ' 桌客人等不及走了。看看后厨哪一截队伍最长，补那一个工位。';
    if (t.waste >= 30 && t.waste >= t.food * 0.2) return '损耗偏高：坏掉、浪费了约 ' + money(t.waste) + ' 的食材。调低补货目标，或者买个冷藏柜。';
    if (r < 0.88) return '定价偏低：满座也赚不到多少，试着把卖得好的菜提一两块。';
    if (r > 1.25) return '定价偏高：点菜的人变少了，降一点或者先把出品分做上去。';
    if (operating < 0) return '客流还撑不起现在的人手和开销，先稳住出品，等口碑涨起来。';
    if (t.dishes && t.scoreSum / t.dishes < 58) return '出品分偏低。点开「评价」看看是哪一项在拖后腿。';
    return '';
  }
  function endDay(S) {
    for (const g of S.groups) if (g.kind === 'guest' && g.dishes.length && g.state !== 'leaving') checkout(S, g, 1);
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
    }
    const quits = [];
    for (const s of S.staff) {
      if (s.owner || s.off) continue;
      if (S.cash >= s.wage) {
        spend(S, s.wage, 'wages');
        s.unpaid = 0;
        addMood(S, s, 'pay', '今天发了工资', 4, 24);
      } else {
        s.unpaid++;
        addMood(S, s, 'unpaid', '被欠薪了', -18, 48);
        log(S, '付不出 ' + s.name + ' 今天的工资', 'warn', true);
      }
    }
    const util = Math.min(Math.max(0, S.cash), 12 + 2 * S.items.filter((it) => MR.ITEMS[it.type].station && !MR.ITEMS[it.type].seats).length);
    spend(S, util, 'util');
    const env = sim.env(S);
    for (const s of S.staff) {
      if (S.spots.length >= 8) addMood(S, s, 'dirty', '店里脏乱', s.trait === 'tidy' ? -12 : -6, 24);
      if (env >= 15) addMood(S, s, 'cozy', '店里布置得舒服', 4, 24);
      if (s.energy < 20) addMood(S, s, 'tired', '连续站了一整天', -9, 22);
      if (s.owner) continue;
      if (sim.mood(s) < 25) s.lowDays++;
      else s.lowDays = 0;
      if (s.lowDays >= 2 || s.unpaid >= 2) quits.push(s);
    }
    for (const s of S.staff) if (s.arch === 'apprentice' && (s.skills.knife >= 55 || s.skills.fire >= 55)) _.award(S, 'apprentice');
    for (const s of quits) {
      S.staff = S.staff.filter((o) => o !== s);
      S.wk.quit = (S.wk.quit || 0) + 1;
      log(S, s.name + (s.unpaid >= 2 ? ' 因为被欠薪' : ' 因为长期心情太差') + '，辞职走了', 'warn', true);
    }
    const t = S.today;
    const operating = t.rev - t.food - t.wages - t.util - t.fines - t.repair - t.other;
    const left = sim.rentLeft(S);
    const rec = Object.assign({}, t, { day: S.day, dow: sim.dow(S), week: sim.week(S), operating, net: operating - t.build, cash: S.cash, rep: S.rep, rent: sim.rent(S), daysLeft: left.days, rentLeft: left.text, bought: S.bought, quits: quits.map((s) => s.name) });
    rec.hint = dayHint(S, t, operating);
    S.days.push(rec);
    if (S.days.length > 35) S.days.shift();
    S.modals.push({ type: 'dayEnd', rec });
    S.halt = 'dayEnd';
  }

  function failCause(S, rent) {
    const w = S.wk;
    const short = rent - S.cash;
    const build = Math.max(0, w.build || 0);
    if (build >= short && build > 0) return '本周在建造和扩建上净花了 ' + money(build) + '，而交租只差 ' + money(short) + '。买东西之前，先看「扣租后结余」。';
    if (w.quit) return '关键的一周里有人辞职，后厨和堂食转不过来。';
    const g = (w.groups || 0) + (w.walk || 0);
    if (g && (w.walk || 0) / g >= 0.2) return '太多客人等不及走掉（本周 ' + w.walk + ' 桌），出餐或点单有一截卡住了。';
    if ((w.waste || 0) >= 0.25 * (w.food || 1)) return '食材损耗太高（本周约 ' + money(w.waste) + '），进的货坏在了架子上。';
    if (w.groups && w.satSum / w.groups < 56) return '出品评分偏低，口碑没涨起来，客人不够多。';
    return '收入的增长没有跑赢每周 +¥' + C.RENT_STEP + ' 的涨租。不扩建，这间店的收入有上限。';
  }

  // 日结弹窗关掉后调用：周日交租，然后进入下一天
  sim.proceed = function (S) {
    if (S.halt !== 'dayEnd') return;
    if (sim.dow(S) === 6) {
      const week = sim.week(S);
      if (!S.bought) {
        const rent = sim.rent(S);
        if (S.cash < rent) {
          S.over = true;
          S.halt = 'over';
          S.modals.push({ type: 'gameOver', day: S.day, week, rep: Math.round(S.repMax), rent, cash: S.cash, short: C.BUYOUT - S.cash, cause: failCause(S, rent), rentPaid: S.rentPaid });
          return;
        }
        const before = S.cash;
        S.cash -= rent;
        S.rentPaid += rent;
        S.weeks.push({ week, rent, net: S.cash - S.wk.startCash, rev: S.wk.rev || 0 });
        _.award(S, 'rent1');
        if (rent >= 1640 && S.cash > 0) _.award(S, 'rent1640');
        S.cleanWeeks = S.wk.bad ? 0 : (S.cleanWeeks || 0) + 1;
        if (S.cleanWeeks >= 2) _.award(S, 'noflop');
        S.modals.push({ type: 'rent', week, rent, before, after: S.cash, next: MR.rentOf(week + 1), net: S.cash - S.wk.startCash });
        log(S, '第 ' + week + ' 周房租 ' + money(rent) + ' 已交。下周涨到 ' + money(MR.rentOf(week + 1)) + '。', 'rent');
      } else S.weeks.push({ week, rent: 0, net: S.cash - S.wk.startCash, rev: S.wk.rev || 0 });
    }
    startDay(S, false);
  };

  // ============ 主循环 ============
  function step(S, h) {
    S.minute += h;
    S.clock += h;
    while (S.sched.length && S.sched[0].at <= S.minute) fire(S, S.sched.shift());
    if (S.deliveries.length) {
      const keep = [];
      for (const d of S.deliveries) {
        if (d.at > S.clock || d.bad) {
          keep.push(d);
          continue;
        }
        for (const k in d.items) addStock(S, k, d.items[k], d.fresh && d.fresh[k]);
        if (d.at > (S.day - 1) * 1440 + C.DAY_START + 1) log(S, '补的货到了', 'stock', true);
      }
      S.deliveries = keep;
    }
    const rate = sim.arrivalRate(S);
    if (rate > 0 && rnd(S) < rate * h) spawnRandom(S);
    S.ageAcc += h;
    if (S.ageAcc >= 10) {
      S.ageAcc -= 10;
      _.ageStock(S, 10);
      for (const s of S.staff) if (s.mods.length) s.mods = s.mods.filter((m) => m.until > S.clock);
    }
    for (const it of S.items) {
      const ht = it.heat;
      if (ht && !ht.done && S.clock >= ht.end) {
        const t = tk(S, ht.t);
        if (!t) it.heat = null;
        else {
          ht.done = true;
          ht.doneAt = S.clock;
          t.stage = 'plate';
        }
      }
    }
    for (let i = S.groups.length - 1; i >= 0; i--) updateGroup(S, S.groups[i], h);
    if (S.groups.some((g) => g.gone)) S.groups = S.groups.filter((g) => !g.gone);
    for (const s of S.staff) updateStaff(S, s, h);
    if (S.minute >= C.DAY_END && (!S.groups.some((g) => g.kind === 'guest') || S.minute >= C.DAY_END + 45)) endDay(S);
  }

  const LABEL = { wash: '洗菜', cut: '切菜', cook: '盯着锅', plate: '摆盘', serve: '上菜', order: '点单', cash: '结账', drink: '调饮', clean: '打扫', repair: '修理', research: '试新菜', rest: '休息' };
  function describe(S, s) {
    const t = s.task;
    if (s.off) return '放假';
    if (!t) return '待命';
    const leg = t.legs[t.i];
    const a = leg.a || {};
    const tt = a.t && tk(S, a.t);
    const dish = tt ? '「' + MR.DISHES[tt.dish].name + '」' : '';
    switch (t.job) {
      case 'wash':
        return '洗' + dish + '的菜';
      case 'cut':
        return '切' + dish + '的料';
      case 'cook':
        return leg.fn === 'cookStart' ? '把' + dish + '下锅' : '盯着' + dish;
      case 'plate':
        return leg.fn === 'takeOff' ? '去起锅' + dish : '给' + dish + '摆盘';
      case 'serve':
        return s.carry ? '端菜上桌' : '去取菜';
      case 'order':
        return '给客人点单';
      case 'cash':
        return '给客人结账';
      case 'drink':
        return '做' + dish;
      case 'clean':
        return leg.fn === 'cleanTable' ? '收拾桌子' : '拖地';
      case 'repair':
        return '修设备';
      case 'research':
        return S.research ? '试做「' + MR.DISHES[S.research.dish].name + '」' : '试新菜';
      case 'rest':
        return t.chair ? '在休息椅上歇着' : '站着歇会儿';
    }
    return LABEL[t.job] || '忙';
  }
  sim.describe = describe;

  function updateStaff(S, s, dt) {
    if (s.off) return;
    const t = s.task;
    if (!t) {
      s.energy = Math.min(100, s.energy + dt * 0.04);
      s.think -= dt;
      if (s.think <= 0) {
        s.think = 0.3;
        const task = pickJob(S, s);
        if (task) startTask(S, s, task);
      }
      return;
    }
    if (t.job === 'rest') s.energy = Math.min(100, s.energy + dt * (t.chair ? 0.6 : 0.32));
    else s.energy = Math.max(0, s.energy - dt * 0.125 * (s.trait === 'diligent' ? 0.75 : 1));
    const leg = t.legs[t.i];
    if (!t.work) {
      if (s.path.length && s._ver !== S._ver && !go(S, s, leg.x, leg.y)) return abortTask(S, s);
      if (s.path.length) moveAlong(s, C.STAFF_SPEED * (s.energy < 25 ? 0.85 : 1) * dt);
      if (!s.path.length) {
        if (Math.abs(s.x - leg.x) > 0.01 || Math.abs(s.y - leg.y) > 0.01) {
          if (!go(S, s, leg.x, leg.y)) abortTask(S, s);
          return;
        }
        t.work = true;
        t.t = 0;
        t.dur = t.job === 'rest' ? leg.dur : leg.dur / spd(S, s, t.job);
        const st = itemById(S, leg.st);
        if (st && Math.abs(st.x - s.x) > 0.1) s.dir = st.x > s.x ? 1 : -1;
      }
    } else {
      t.t += dt;
      if (t.t >= t.dur) {
        H[leg.fn](S, s, leg.a, t);
        if (s.task !== t) return;
        t.i++;
        t.work = false;
        if (t.i >= t.legs.length) endTask(S, s);
        else {
          const n = t.legs[t.i];
          if (!go(S, s, n.x, n.y)) abortTask(S, s);
        }
      }
    }
  }

  // 推进 dt 游戏分钟。有弹窗或已停表时不走。
  sim.tick = function (S, dt) {
    while (dt > 0 && !S.halt && !S.over && !S.modals.length) {
      const h = Math.min(0.25, dt);
      step(S, h);
      dt -= h;
    }
  };
  // 非营业时段且店里没客人：时间流速 ×4
  sim.fastForward = (S) => !sim.inService(S) && !S.groups.some((g) => g.kind === 'guest');

  sim.pipeline = function (S) {
    const p = { wash: 0, cut: 0, cook: 0, heat: 0, plate: 0, ready: 0, mix: 0 };
    for (const t of S.tickets) {
      if (t.stage === 'carry') p.ready++;
      else if (p[t.stage] != null) p[t.stage]++;
    }
    p.order = S.groups.filter((g) => g.state === 'wantOrder').length;
    p.pay = S.groups.filter((g) => g.state === 'wantPay').length;
    p.queue = S.groups.filter((g) => g.state === 'queue').length;
    return p;
  };
})(typeof window !== 'undefined' ? window : globalThis);
