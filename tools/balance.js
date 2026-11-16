/* 无界面数值测试：用几种机器人策略跑整局，检查策划案里的数值关系。
 * 用法：node tools/balance.js [局数] */
globalThis.MR = {};
require('../js/data.js');
require('../js/sim-core.js');
require('../js/sim-run.js');
const MR = globalThis.MR;
const sim = MR.sim;

function autoPlace(S, type) {
  const def = MR.ITEMS[type];
  if (S.cash < def.price) return false;
  const ys = [];
  for (let y = 0; y < MR.C.ROWS; y++) ys.push(y);
  for (const rot of [0, 1])
    for (const y of ys)
      for (let x = 0; x < MR.C.COLS; x++) {
        // 桌子之间留一格过道
        if (def.seats && (y % 2 === 0 || (x % 4 !== 0 && !rot))) continue;
        if (sim.canPlace(S, type, x, y, rot).ok) return sim.place(S, type, x, y, rot).ok;
      }
  for (const rot of [0, 1])
    for (const y of ys)
      for (let x = 0; x < MR.C.COLS; x++) if (sim.canPlace(S, type, x, y, rot).ok) return sim.place(S, type, x, y, rot).ok;
  return false;
}
const count = (S, type) => S.items.filter((i) => i.type === type).length;
const safe = (S, price, buf) => S.bought || S.cash - price >= sim.rent(S) * (buf || 1.3);

const strategies = {
  idle() {},
  spender(S) {
    for (const t of ['sink', 'table2', 'board', 'wok', 'pass', 'fridge', 'counter', 'table4', 'aquarium', 'painting', 'drinkbar', 'table2', 'lamp']) {
      if (S.day > 1 && S.cash > MR.ITEMS[t].price + 60 && count(S, t) < 3) autoPlace(S, t);
    }
  },
  smart(S) {
    const staffN = S.staff.length - 1;
    const rent = sim.rent(S);
    const buy = (type, max, buf) => {
      if (count(S, type) >= max) return true;
      if (!safe(S, MR.ITEMS[type].price, buf || 1.25)) return false;
      autoPlace(S, type);
      return false;
    };
    const hire = (arch, n, buf) => {
      if (S.staff.filter((s) => s.arch === arch && !s.owner).length >= n) return true;
      const i = S.candidates.findIndex((c) => c.arch === arch);
      if (i >= 0 && S.cash > rent * buf) sim.hire(S, i);
      return false;
    };
    const research = (id) => {
      if (S.menu[id].unlocked) return true;
      if (!S.research && safe(S, MR.DISHES[id].research.cost, 1.5)) sim.startResearch(S, id);
      return false;
    };
    const upgrade = (type, tier) => {
      let all = true;
      for (const it of S.items) {
        if (it.type !== type || it.tier >= tier) continue;
        all = false;
        const u = sim.upgradeCost(S, it);
        if (u && !u.locked && safe(S, u.cost, 1.6)) sim.upgradeItem(S, it.id);
      }
      return all;
    };
    // 一步一步来：前一项没完成就不做后面的
    const plan = [
      () => S.day >= 2 && buy('sink', 1, 1.6),
      () => buy('table2', 3, 1.5),
      () => buy('pass', 1, 1.4),
      () => upgrade('wok', 1),
      () => buy('plant', 2),
      () => upgrade('board', 1),
      () => hire('waiter', 1, 1.8),
      () => buy('table2', 4),
      () => buy('board', 2),
      () => buy('wok', 2),
      () => hire('helper', 1, 1.8),
      () => buy('fridge', 1),
      () => buy('lamp', 1),
      () => upgrade('wok', 1),
      () => buy('counter', 1),
      () => buy('table4', 1),
      () => buy('pot', 1) && research('eggsoup'),
      () => hire('chef', 2, 2),
      () => research('braised'),
      () => buy('painting', 1),
      () => buy('restchair', 1),
      () => buy('table4', 2),
      () => upgrade('board', 1),
      () => buy('drinkbar', 1) && research('lemontea'),
      () => hire('waiter', 2, 2),
      () => sim.qrOpen(S) && (S.qr || (safe(S, 900, 1.6) && sim.buyQR(S).ok)),
      () => buy('wok', 3) && buy('board', 3),
      () => buy('table2', 5),
      () => research('beef'),
      () => buy('aquarium', 1),
      () => upgrade('wok', 2) && upgrade('board', 2),
    ];
    for (const step of plan) if (!step()) break;
    sim.suggestTargets(S);
    for (const k of MR.ING_ORDER) S.targets[k] = Math.max(S.targets[k], k === 'fish' ? 0 : 6);
    for (const id of MR.DISH_ORDER) if (S.menu[id].unlocked) sim.setPrice(S, id, sim.fairPrice(S, id) * 1.04);
    if (sim.canBuyout(S).ok) sim.buyout(S);
  },
};

function run(name, seed, maxWeeks, verbose) {
  const S = sim.newGame({ seed, noTutorial: true, story: process.env.STORY || 'calm' });
  const strat = strategies[name];
  const weekly = [];
  let wkStart = S.cash;
  while (!S.over && !S.bought && sim.week(S) <= maxWeeks) {
    strat(S);
    if (S.bought) break;
    let guard = 0;
    while (!S.halt && !S.over && guard++ < 5000) {
      sim.tick(S, 5);
      while (S.modals.length && S.modals[0].type === 'choice') sim.choose(S, S.modals.shift(), 0);
    }
    const rec = S.modals.find((m) => m.type === 'dayEnd').rec;
    if (verbose) console.log(`  d${rec.day} rev ${rec.rev} food ${rec.food} wage ${rec.wages} op ${rec.operating} build ${rec.build} dishes ${rec.dishes} avg ${(rec.scoreSum / (rec.dishes || 1)).toFixed(0)} grp ${rec.groups} walk ${rec.walkQueue}/${rec.walkOrder}/${rec.walkFood} turned ${rec.turned} sat ${(rec.satSum/(rec.satN||1)).toFixed(0)} staff ${S.staff.length-1} rep ${rec.rep.toFixed(1)} cash ${rec.cash}`);
    S.modals.length = 0;
    const wasSunday = sim.dow(S) === 6;
    const cashBeforeRent = S.cash;
    sim.proceed(S);
    if (wasSunday) {
      weekly.push({ week: weekly.length + 1, profit: cashBeforeRent - wkStart, cash: S.cash, rep: S.rep, staff: S.staff.length - 1, seats: sim.seats(S) });
      wkStart = S.cash;
    }
    S.modals = S.modals.filter((m) => m.type === 'choice' || m.type === 'gameOver');
    while (S.modals.length && S.modals[0].type === 'choice') sim.choose(S, S.modals.shift(), 0);
    S.fx.length = 0;
  }
  return { S, weekly };
}

module.exports = { MR, sim, strategies, run, autoPlace };
if (require.main === module) {
const N = parseInt(process.argv[2] || '6', 10);
const only = process.argv[3];
for (const name of Object.keys(strategies)) {
  if (only && only !== name) continue;
  console.log('== ' + name + ' ==');
  const ends = [];
  for (let i = 0; i < N; i++) {
    const { S, weekly } = run(name, 1000 + i * 77, 30, N === 1);
    ends.push(S.bought ? 'BUY@w' + sim.week(S) : S.over ? 'DEAD@w' + sim.week(S) : 'alive');
    if (i < 2 || N === 1) console.log(weekly.map((w) => `w${w.week}:${w.profit >= 0 ? '+' : ''}${Math.round(w.profit)}(¥${Math.round(w.cash)},r${Math.round(w.rep)},s${w.staff},${w.seats}座)`).join(' '));
  }
  console.log(ends.join('  '));
}
}
