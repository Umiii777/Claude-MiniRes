/* 一间小馆 · 启动、主循环、输入 */
(function () {
  'use strict';
  const MR = window.MR;
  const UI = MR.ui;
  const sim = MR.sim;
  const R = MR.render;
  const C = MR.C;
  const SEC_PER_MIN = 0.4; // 1× 时，一游戏分钟 = 0.4 秒
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv');
  R.init(cv);

  function layout() {
    const st = $('#stage');
    R.resize(st.clientWidth, st.clientHeight);
    // 竖着拿的小屏：提示横屏
    $('#rotate').hidden = !(window.innerHeight > window.innerWidth && window.innerWidth < 700) || !!UI.flags.rotateOk;
  }
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('#stage'));

  // ---------- 主循环 ----------
  let last = performance.now();
  let hudT = 0,
    sheetT = 0,
    holding = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const S = UI.S;
    if (S) {
      if (UI.speed > 0 && !UI.modal && !S.over) {
        let g = (dt * UI.speed) / SEC_PER_MIN;
        if (sim.fastForward(S)) g *= 4;
        sim.tick(S, g);
      }
      if (S.flags.saveNow) {
        S.flags.saveNow = false;
        UI.save();
      }
      UI.pump();
      R.draw(S, { place: UI.place, sel: UI.sel }, dt);
      hudT += dt;
      if (hudT > 0.12) {
        hudT = 0;
        UI.hud();
        UI.coach();
        UI.refreshPop();
      }
      sheetT += dt;
      if (sheetT > 0.6 && !holding) {
        sheetT = 0;
        UI.renderSheet();
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------- 输入 ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    UI.act(el.dataset.act, el.dataset);
    sheetT = 0;
  });
  // 手指按在面板上时不重绘，免得按钮在按下和抬起之间被换掉
  const sheet = $('#sheet');
  sheet.addEventListener('pointerdown', () => (holding = true));
  window.addEventListener('pointerup', () => setTimeout(() => (holding = false), 80));
  window.addEventListener('pointercancel', () => (holding = false));

  function tileOf(e) {
    const r = cv.getBoundingClientRect();
    const T = r.width / C.COLS;
    return { fx: (e.clientX - r.left) / T, fy: (e.clientY - r.top) / T };
  }
  // 工作表格子：右键反向切换
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('[data-act="prioCycle"]');
    if (!el) return;
    e.preventDefault();
    UI.act('prioCycle', Object.assign({}, el.dataset, { dir: '-1' }));
  });
  let down = null;
  cv.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointerup', (e) => {
    if (!down || !UI.S) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 12) return;
    const p = tileOf(e);
    UI.tapTile(p.fx, p.fy);
    UI.hud();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!UI.place || e.pointerType !== 'mouse') return;
    const p = tileOf(e);
    const tx = Math.floor(p.fx),
      ty = Math.floor(p.fy);
    if (tx !== UI.place.cx || ty !== UI.place.cy) UI.placeAt(tx, ty, true);
  });
  window.addEventListener('keydown', (e) => {
    if (!UI.S || e.target.tagName === 'INPUT') return;
    if (e.key === ' ') {
      e.preventDefault();
      UI.setSpeed(UI.speed ? 0 : UI.lastSpeed);
    } else if (e.key === 'Escape') {
      if (UI.place) UI.cancelPlace();
      else if (UI.sel) UI.hidePop();
      else if (UI.sheet) UI.close();
    } else if (e.key === 'r' || e.key === 'R') UI.act('rotate');
    else if (['1', '2', '3', '4'].includes(e.key)) UI.setSpeed([1, 2, 4, 8][Number(e.key) - 1]);
    UI.hud();
  });

  // ---------- 启动 ----------
  function start(data) {
    // 页面里写死的 emoji 代号换成图标
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (!/^(SCRIPT|STYLE)$/.test(walker.currentNode.parentNode.tagName)) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const raw = n.nodeValue.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      const h = MR.icons.iconize(raw);
      if (h === raw) continue;
      const span = document.createElement('span');
      span.innerHTML = h;
      n.replaceWith(...span.childNodes);
    }
    for (const el of document.querySelectorAll('[title]')) el.title = MR.icons.strip(el.title);
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    if (data && data.save) {
      try {
        const S = sim.restore(data.save);
        if (!S.over) UI.begin(S);
      } catch (e) {
        /* 快照坏了就回到开场 */
      }
    }
    if (!UI.S && UI.loadSave()) $('#btn-continue').hidden = false;
    requestAnimationFrame(frame);
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => (UI.S && !UI.S.over ? { save: sim.serialize(UI.S) } : {}));
  if (hot && hot.ready) hot.ready(start);
  else start((hot && hot.data) || {});
})();
