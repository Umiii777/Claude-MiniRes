/* 一间小馆 · 画面（Canvas 2D，俯视小店）
 * 状态主要靠画面：订单在哪个工位排队、谁在做什么、设备是否快坏、座位空还是满。 */
(function (root) {
  'use strict';
  const MR = root.MR;
  const C = MR.C;
  const sim = MR.sim;
  const R = (MR.render = {});

  const PAL = {
    kitchenA: '#eef2ef',
    kitchenB: '#dfe7e3',
    woodA: '#e6cda3',
    woodB: '#dfc394',
    street: '#aeb5b4',
    streetLine: '#c5cbca',
    wall: '#2c6a58',
    wallTop: '#3d8a73',
    wallDark: '#1f4d40',
    steel: '#b8c3c6',
    steelDark: '#8a979b',
    stove: '#3a4144',
    woodItem: '#c2935a',
    woodDark: '#9a6f3c',
    table: '#d9ab6c',
    stool: '#d4483b',
    stoolDark: '#a8342a',
    white: '#f7f9f8',
    ink: '#1c2b27',
    good: '#3aa26b',
    warn: '#d99a1c',
    bad: '#d2463a',
    skin: '#f0c9a4',
  };
  const APRON = ['#c5382c', '#2f7fb5', '#d9951a', '#7a5fb0', '#2e9a78', '#c15a8a'];
  const GUEST_HUES = ['#7d8fa3', '#9c8468', '#6f9a86', '#a37b8f', '#8a8fb8', '#b08a5c'];
  const TIER_COL = { god: '#b5179e', great: '#1f8a5b', good: '#2f7fb5', ok: '#7b8794', bad: '#d2463a' };
  R.TIER_COL = TIER_COL;
  const FONT = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei","Noto Sans SC","WenQuanYi Zen Hei","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  let cv, ctx, T = 32, dpr = 1;
  const parts = []; // 飘字、烟等
  let clock = 0;

  R.init = function (canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
  };
  R.resize = function (w, h) {
    dpr = Math.min(3, root.devicePixelRatio || 1);
    T = Math.max(16, Math.floor(Math.min(w / C.COLS, h / C.ROWS)));
    cv.style.width = T * C.COLS + 'px';
    cv.style.height = T * C.ROWS + 'px';
    cv.width = Math.round(T * C.COLS * dpr);
    cv.height = Math.round(T * C.ROWS * dpr);
    return T;
  };
  R.tile = () => T;

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function fillRR(x, y, w, h, r, c) {
    ctx.fillStyle = c;
    rr(x, y, w, h, r);
    ctx.fill();
  }
  function circle(x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }
  function text(s, x, y, size, c, align, weight) {
    ctx.font = (weight || 600) + ' ' + Math.round(size) + 'px ' + FONT;
    ctx.fillStyle = c;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function badge(s, cx, cy, size, bg, fg) {
    size = Math.max(size, 11);
    ctx.font = '700 ' + Math.round(size * 0.82) + 'px ' + FONT;
    const w = Math.max(size * 1.25, ctx.measureText(s).width + size * 0.5);
    fillRR(cx - w / 2, cy - size * 0.62, w, size * 1.24, size * 0.4, bg);
    text(s, cx, cy + size * 0.04, size * 0.82, fg, 'center', 700);
  }

  // ---------- 地面与墙 ----------
  function drawFloor(S) {
    for (let y = 0; y < C.ROWS; y++)
      for (let x = 0; x < C.COLS; x++) {
        const px = x * T,
          py = y * T;
        if (y === C.STREET_Y) {
          ctx.fillStyle = PAL.street;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = PAL.streetLine;
          ctx.fillRect(px + T * 0.1, py + T * 0.48, T * 0.8, T * 0.04);
          continue;
        }
        const z = sim.zoneAt(x, y);
        if (z) {
          if (z.kind === 'kitchen') ctx.fillStyle = (x + y) % 2 ? PAL.kitchenA : PAL.kitchenB;
          else ctx.fillStyle = y % 2 ? PAL.woodA : PAL.woodB;
          ctx.fillRect(px, py, T, T);
          if (z.kind === 'dining') {
            ctx.fillStyle = 'rgba(120,80,30,0.10)';
            ctx.fillRect(px + ((x * 7 + y * 3) % 5) * T * 0.2, py, 1, T);
          }
        } else if (sim.isDoor(x, y)) {
          ctx.fillStyle = y === C.DOOR.y ? '#cdb891' : PAL.kitchenB;
          ctx.fillRect(px, py, T, T);
        } else {
          // 墙
          ctx.fillStyle = PAL.wall;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = PAL.wallTop;
          ctx.fillRect(px, py, T, T * 0.28);
          ctx.fillStyle = PAL.wallDark;
          ctx.fillRect(px, py + T * 0.9, T, T * 0.1);
          if (y === C.DOOR.y && x !== C.DOOR.x && x % 2 === 1) {
            // 临街的窗
            fillRR(px + T * 0.12, py + T * 0.36, T * 0.76, T * 0.44, 2, '#bfe1e6');
            ctx.fillStyle = PAL.wallDark;
            ctx.fillRect(px + T * 0.49, py + T * 0.36, T * 0.03, T * 0.44);
          }
        }
      }
    // 招牌
    const sx = (C.DOOR.x + 0.5) * T;
    fillRR(sx - T * 1.05, C.DOOR.y * T - T * 0.16, T * 2.1, T * 0.42, T * 0.08, '#b22f25');
    text('一间小馆', sx, C.DOOR.y * T + T * 0.06, T * 0.3, '#ffe9c2', 'center', 700);
    // 未解锁区域
    for (const z of MR.ZONES) {
      if (S.zones[z.id]) continue;
      const x = z.x0 * T,
        y = z.y0 * T,
        w = (z.x1 - z.x0 + 1) * T,
        h = (z.y1 - z.y0 + 1) * T;
      ctx.fillStyle = 'rgba(28,43,39,0.62)';
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = T * 0.18;
      for (let i = -h; i < w; i += T * 0.7) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + h);
        ctx.lineTo(x + i + h, y);
        ctx.stroke();
      }
      ctx.restore();
      text(z.name, x + w / 2, y + h / 2 - T * 0.24, T * 0.36, '#e9f2ee', 'center', 700);
      text('解锁 ' + sim.money(z.price), x + w / 2, y + h / 2 + T * 0.22, T * 0.3, '#ffd98a', 'center', 600);
    }
  }

  // ---------- 物品 ----------
  function stoveBase(px, py, hot) {
    fillRR(px + T * 0.06, py + T * 0.06, T * 0.88, T * 0.88, T * 0.12, PAL.stove);
    if (hot) {
      const f = 0.5 + 0.5 * Math.sin(clock * 9 + px);
      circle(px + T * 0.5, py + T * 0.5, T * (0.36 + 0.03 * f), 'rgba(255,140,40,0.55)');
    }
  }
  function steam(px, py) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, T * 0.05);
    for (let i = 0; i < 3; i++) {
      const ph = (clock * 1.3 + i * 0.33) % 1;
      const x = px + T * (0.32 + i * 0.18);
      const y = py + T * (0.3 - ph * 0.45);
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + T * 0.08, y - T * 0.08, x, y - T * 0.16);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const DRAW = {
    table2(it) {
      drawTable(it);
    },
    table4(it) {
      drawTable(it);
    },
    counter(it, px, py) {
      fillRR(px + T * 0.05, py + T * 0.14, T * 0.9, T * 0.72, T * 0.1, PAL.woodDark);
      fillRR(px + T * 0.1, py + T * 0.18, T * 0.8, T * 0.5, T * 0.08, PAL.woodItem);
      fillRR(px + T * 0.3, py + T * 0.24, T * 0.4, T * 0.3, T * 0.05, '#2b3436');
      fillRR(px + T * 0.35, py + T * 0.28, T * 0.3, T * 0.12, 2, '#9fe3c8');
      text('¥', px + T * 0.5, py + T * 0.74, T * 0.24, '#fff3d6', 'center', 700);
    },
    waitchair(it, px, py) {
      fillRR(px + T * 0.1, py + T * 0.34, T * 0.8, T * 0.36, T * 0.1, '#5a8fb0');
      fillRR(px + T * 0.1, py + T * 0.2, T * 0.8, T * 0.18, T * 0.08, '#467a9b');
    },
    sink(it, px, py) {
      fillRR(px + T * 0.06, py + T * 0.08, T * 0.88, T * 0.84, T * 0.1, PAL.steel);
      fillRR(px + T * 0.16, py + T * 0.3, T * 0.68, T * 0.5, T * 0.1, it.user ? '#7cc6e6' : '#93a3a8');
      ctx.strokeStyle = PAL.steelDark;
      ctx.lineWidth = T * 0.07;
      ctx.beginPath();
      ctx.moveTo(px + T * 0.5, py + T * 0.12);
      ctx.lineTo(px + T * 0.5, py + T * 0.36);
      ctx.stroke();
    },
    board(it, px, py) {
      fillRR(px + T * 0.06, py + T * 0.1, T * 0.88, T * 0.8, T * 0.1, PAL.steel);
      fillRR(px + T * 0.14, py + T * 0.2, T * 0.56, T * 0.6, T * 0.08, it.tier === 2 ? '#8b5a2b' : it.tier === 1 ? '#b98045' : '#d7b07a');
      fillRR(px + T * 0.74, py + T * 0.2, T * 0.1, T * 0.42, 2, '#e9eef0');
      fillRR(px + T * 0.75, py + T * 0.62, T * 0.08, T * 0.2, 2, '#3a2a20');
    },
    wok(it, px, py) {
      const hot = !!it.user || !!it.heat;
      stoveBase(px, py, hot);
      circle(px + T * 0.5, py + T * 0.5, T * 0.33, '#191d1f');
      circle(px + T * 0.5, py + T * 0.5, T * 0.26, hot ? '#6b4a2a' : '#2a3033');
      fillRR(px + T * 0.78, py + T * 0.46, T * 0.2, T * 0.08, 2, '#5b4636');
      if (hot) steam(px, py);
    },
    pan(it, px, py) {
      const hot = !!it.user || !!it.heat;
      stoveBase(px, py, hot);
      circle(px + T * 0.46, py + T * 0.5, T * 0.28, '#23282a');
      circle(px + T * 0.46, py + T * 0.5, T * 0.22, hot ? '#c9a15a' : '#3a4144');
      fillRR(px + T * 0.7, py + T * 0.46, T * 0.28, T * 0.08, 2, '#23282a');
      if (hot) steam(px, py);
    },
    pot(it, px, py) {
      const hot = !!it.heat || !!it.user;
      stoveBase(px, py, hot);
      fillRR(px + T * 0.1, py + T * 0.42, T * 0.8, T * 0.14, T * 0.06, '#8a979b');
      circle(px + T * 0.5, py + T * 0.5, T * 0.3, '#aab6ba');
      circle(px + T * 0.5, py + T * 0.5, T * 0.22, hot ? '#d8734a' : '#8a979b');
      if (hot) steam(px, py);
    },
    steamer(it, px, py) {
      const hot = !!it.heat || !!it.user;
      stoveBase(px, py, hot);
      circle(px + T * 0.5, py + T * 0.5, T * 0.34, '#b88a4a');
      circle(px + T * 0.5, py + T * 0.5, T * 0.26, '#d9b77a');
      circle(px + T * 0.5, py + T * 0.5, T * 0.12, '#b88a4a');
      if (hot) steam(px, py);
    },
    fryer(it, px, py) {
      const hot = !!it.heat || !!it.user;
      fillRR(px + T * 0.1, py + T * 0.08, T * 0.8, T * 0.84, T * 0.18, '#2b3033');
      circle(px + T * 0.5, py + T * 0.56, T * 0.22, hot ? '#f0a23c' : '#555d61');
      fillRR(px + T * 0.3, py + T * 0.16, T * 0.4, T * 0.1, 2, hot ? '#7ef0a8' : '#6b7478');
    },
    oven(it, px, py) {
      const hot = !!it.heat || !!it.user;
      fillRR(px + T * 0.08, py + T * 0.12, T * 0.84, T * 0.76, T * 0.1, '#d9dee0');
      fillRR(px + T * 0.16, py + T * 0.3, T * 0.68, T * 0.46, T * 0.06, hot ? '#f0a23c' : '#48535a');
      circle(px + T * 0.24, py + T * 0.21, T * 0.04, '#48535a');
      circle(px + T * 0.4, py + T * 0.21, T * 0.04, '#48535a');
    },
    pass(it, px, py) {
      fillRR(px + T * 0.04, py + T * 0.14, T * 0.92, T * 0.72, T * 0.08, PAL.steel);
      fillRR(px + T * 0.04, py + T * 0.14, T * 0.92, T * 0.12, T * 0.06, PAL.steelDark);
      circle(px + T * 0.76, py + T * 0.58, T * 0.1, '#d9951a');
      circle(px + T * 0.76, py + T * 0.56, T * 0.035, '#8a5a0c');
    },
    shelf(it, px, py) {
      fillRR(px + T * 0.06, py + T * 0.06, T * 0.88, T * 0.88, T * 0.06, '#8a623a');
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#a97c4c';
        ctx.fillRect(px + T * 0.12, py + T * (0.14 + i * 0.26), T * 0.76, T * 0.2);
      }
      fillRR(px + T * 0.16, py + T * 0.16, T * 0.22, T * 0.16, 2, '#7fb069');
      fillRR(px + T * 0.46, py + T * 0.16, T * 0.3, T * 0.16, 2, '#e3d7b0');
      fillRR(px + T * 0.2, py + T * 0.42, T * 0.3, T * 0.16, 2, '#d98a5f');
      fillRR(px + T * 0.56, py + T * 0.68, T * 0.24, T * 0.16, 2, '#e6e2c8');
    },
    fridge(it, px, py) {
      fillRR(px + T * 0.1, py + T * 0.04, T * 0.8, T * 0.92, T * 0.1, '#e8f0f3');
      ctx.fillStyle = '#b9c9cf';
      ctx.fillRect(px + T * 0.1, py + T * 0.42, T * 0.8, T * 0.04);
      fillRR(px + T * 0.74, py + T * 0.14, T * 0.06, T * 0.2, 2, '#8fa3ab');
      fillRR(px + T * 0.74, py + T * 0.54, T * 0.06, T * 0.24, 2, '#8fa3ab');
    },
    freezer(it, px, py) {
      fillRR(px + T * 0.06, py + T * 0.16, T * 0.88, T * 0.7, T * 0.1, '#cfe6f2');
      fillRR(px + T * 0.12, py + T * 0.22, T * 0.76, T * 0.3, T * 0.06, '#9fd0ea');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, T * 0.04);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(px + T * 0.5 - Math.cos(a) * T * 0.1, py + T * 0.37 - Math.sin(a) * T * 0.1);
        ctx.lineTo(px + T * 0.5 + Math.cos(a) * T * 0.1, py + T * 0.37 + Math.sin(a) * T * 0.1);
        ctx.stroke();
      }
    },
    drinkbar(it, px, py) {
      fillRR(px + T * 0.05, py + T * 0.14, T * 0.9, T * 0.74, T * 0.1, '#6b4a3a');
      fillRR(px + T * 0.1, py + T * 0.18, T * 0.8, T * 0.44, T * 0.08, '#8a6450');
      fillRR(px + T * 0.18, py + T * 0.24, T * 0.16, T * 0.28, 2, '#f1e3b4');
      fillRR(px + T * 0.42, py + T * 0.24, T * 0.16, T * 0.28, 2, '#bfe1e6');
      fillRR(px + T * 0.66, py + T * 0.24, T * 0.16, T * 0.28, 2, '#e9a36a');
    },
    restchair(it, px, py) {
      fillRR(px + T * 0.14, py + T * 0.3, T * 0.72, T * 0.5, T * 0.14, '#4f9a8c');
      fillRR(px + T * 0.14, py + T * 0.14, T * 0.72, T * 0.24, T * 0.1, '#3d8073');
    },
    plant(it, px, py) {
      fillRR(px + T * 0.32, py + T * 0.56, T * 0.36, T * 0.32, T * 0.06, '#b5653a');
      circle(px + T * 0.5, py + T * 0.4, T * 0.24, '#3e9a5c');
      circle(px + T * 0.36, py + T * 0.48, T * 0.16, '#57b06f');
      circle(px + T * 0.64, py + T * 0.46, T * 0.16, '#2f8850');
    },
    lamp(it, px, py) {
      circle(px + T * 0.5, py + T * 0.5, T * 0.46, 'rgba(255,214,120,0.28)');
      fillRR(px + T * 0.47, py + T * 0.4, T * 0.06, T * 0.46, 2, '#5b4636');
      fillRR(px + T * 0.3, py + T * 0.16, T * 0.4, T * 0.28, T * 0.08, '#f4d27a');
    },
    painting(it, px, py) {
      fillRR(px + T * 0.14, py + T * 0.12, T * 0.72, T * 0.6, T * 0.04, '#6b4a2a');
      fillRR(px + T * 0.2, py + T * 0.18, T * 0.6, T * 0.48, 2, '#e9e2c8');
      circle(px + T * 0.42, py + T * 0.38, T * 0.1, '#c5382c');
      fillRR(px + T * 0.26, py + T * 0.5, T * 0.48, T * 0.1, 2, '#3e7a8c');
      fillRR(px + T * 0.46, py + T * 0.72, T * 0.08, T * 0.18, 2, '#6b4a2a');
    },
    aquarium(it, px, py) {
      fillRR(px + T * 0.06, py + T * 0.18, T * 0.88, T * 0.66, T * 0.08, '#2b4a57');
      fillRR(px + T * 0.1, py + T * 0.22, T * 0.8, T * 0.5, T * 0.06, '#5fb7d6');
      const fxp = px + T * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(clock * 0.8 + px)));
      circle(fxp, py + T * 0.46, T * 0.07, '#f08a3c');
      circle(px + T * 0.3, py + T * 0.6, T * 0.05, '#f4d27a');
    },
  };
  function drawTable(it) {
    const cells = sim.cellsOf(it.type, it.x, it.y, it.rot);
    const tabs = cells.filter((c) => c.k === 2);
    const x0 = Math.min(...tabs.map((c) => c.x)),
      y0 = Math.min(...tabs.map((c) => c.y)),
      x1 = Math.max(...tabs.map((c) => c.x)),
      y1 = Math.max(...tabs.map((c) => c.y));
    for (const c of cells) {
      if (c.k !== 3) continue;
      circle((c.x + 0.5) * T, (c.y + 0.5) * T, T * 0.27, PAL.stoolDark);
      circle((c.x + 0.5) * T, (c.y + 0.47) * T, T * 0.24, PAL.stool);
    }
    fillRR(x0 * T + T * 0.06, y0 * T + T * 0.06, (x1 - x0 + 1) * T - T * 0.12, (y1 - y0 + 1) * T - T * 0.12, T * 0.12, '#b98a4e');
    fillRR(x0 * T + T * 0.1, y0 * T + T * 0.08, (x1 - x0 + 1) * T - T * 0.2, (y1 - y0 + 1) * T - T * 0.22, T * 0.1, PAL.table);
    if (it.dirty) {
      const cx = ((x0 + x1 + 1) / 2) * T,
        cy = ((y0 + y1 + 1) / 2) * T;
      circle(cx - T * 0.12, cy, T * 0.13, '#f7f9f8');
      circle(cx - T * 0.12, cy, T * 0.08, '#b9a78a');
      circle(cx + T * 0.16, cy - T * 0.06, T * 0.09, '#f7f9f8');
      fillRR(cx + T * 0.02, cy + T * 0.12, T * 0.2, T * 0.05, 2, '#a8946f');
    }
  }
  function drawItem(S, it, counts) {
    const def = MR.ITEMS[it.type];
    const px = it.x * T,
      py = it.y * T;
    DRAW[it.type](it, px, py);
    if (def.label) {
      const s = T * 0.3;
      fillRR(px + T * 0.04, py + T - s - T * 0.04, s, s, s * 0.3, 'rgba(20,32,29,0.82)');
      text(def.label, px + T * 0.04 + s / 2, py + T - s / 2 - T * 0.03, s * 0.72, '#fff', 'center', 700);
    }
    if (def.tiers && it.tier > 0) for (let i = 0; i < it.tier; i++) circle(px + T * (0.86 - i * 0.14), py + T * 0.9, T * 0.05, '#ffd24a');
    if (def.wear && (it.dur < 60 || it.broken)) {
      const w = T * 0.8;
      fillRR(px + T * 0.1, py + T * 0.02, w, T * 0.09, 2, 'rgba(0,0,0,0.45)');
      fillRR(px + T * 0.1, py + T * 0.02, (w * it.dur) / 100, T * 0.09, 2, it.dur < 30 ? PAL.bad : PAL.warn);
    }
    if (it.broken) {
      ctx.strokeStyle = PAL.bad;
      ctx.lineWidth = T * 0.1;
      ctx.beginPath();
      ctx.moveTo(px + T * 0.2, py + T * 0.2);
      ctx.lineTo(px + T * 0.8, py + T * 0.8);
      ctx.moveTo(px + T * 0.8, py + T * 0.2);
      ctx.lineTo(px + T * 0.2, py + T * 0.8);
      ctx.stroke();
    }
    // 不用人守的锅：进度环；熟了没人起锅就闪红
    if (it.heat) {
      const h = it.heat;
      const cx = px + T * 0.5,
        cy = py + T * 0.5;
      if (!h.done) {
        const p = (S.clock - h.start) / (h.end - h.start);
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = T * 0.09;
        ctx.beginPath();
        ctx.arc(cx, cy, T * 0.4, -1.5708, -1.5708 + 6.2832 * Math.max(0, Math.min(1, p)));
        ctx.stroke();
      } else {
        const over = S.clock - h.doneAt;
        const flash = over > 1.5 && Math.sin(clock * 12) > 0;
        badge(over > 1.5 ? '糊!' : '好了', cx, py + T * 0.12, T * 0.3, flash ? PAL.bad : over > 1.5 ? '#8a2a20' : PAL.good, '#fff');
      }
    }
    // 工位前排着几单
    const n = counts[it.id];
    if (n) badge(String(n), px + T * 0.84, py + T * 0.16, T * 0.3, n >= 3 ? PAL.bad : PAL.warn, '#fff');
  }

  // 每个工位上堆着的订单数
  function stationCounts(S) {
    const out = {};
    const stage = { wash: 'sink', cut: 'board', plate: 'pass', mix: 'drinkbar' };
    const byType = {};
    for (const it of S.items) {
      const st = MR.ITEMS[it.type].station;
      if (st) (byType[st] = byType[st] || []).push(it);
    }
    const first = (st) => (byType[st] && byType[st][0]) || null;
    for (const t of S.tickets) {
      if (t.claimed && t.stage !== 'carry') continue;
      let it = null;
      if (t.stage === 'ready') it = S.items.find((o) => o.id === t.loc);
      else if (t.stage === 'cook') it = first(MR.DISHES[t.dish].station);
      else if (t.stage === 'wash') it = first('sink') || first('shelf');
      else if (t.stage === 'plate') it = first('pass') || S.items.find((o) => o.id === t.loc);
      else if (stage[t.stage]) it = first(stage[t.stage]) || first('shelf');
      if (it) out[it.id] = (out[it.id] || 0) + 1;
    }
    return out;
  }

  // ---------- 人 ----------
  // 表情：happy / ok / meh / sad / angry / tired / eat
  function staffFace(s) {
    const m = sim.mood(s);
    if (m < 20) return 'angry';
    if (s.energy < 25) return 'tired';
    return m >= 70 ? 'happy' : m >= 50 ? 'ok' : m >= 35 ? 'meh' : 'sad';
  }
  R.staffFace = staffFace;
  function guestFace(g) {
    if (g.kind === 'visitor') return 'meh';
    if (g.state === 'eating') return 'eat';
    if (g.state === 'leaving' || g.state === 'toCounter') return g.sat == null ? 'ok' : g.sat >= 75 ? 'happy' : g.sat >= 55 ? 'ok' : g.sat >= 40 ? 'meh' : g.sat > 0 ? 'sad' : 'angry';
    if (g.state === 'queue' || g.state === 'wantOrder' || g.state === 'waitFood' || g.state === 'wantPay') {
      const f = g.pat / g.patMax;
      return f > 0.6 ? 'ok' : f > 0.35 ? 'meh' : f > 0.15 ? 'sad' : 'angry';
    }
    return 'ok';
  }
  function drawFace(cx, cy, r, mood, seed) {
    const ex = r * 0.42,
      ey = cy + r * 0.05,
      my = cy + r * 0.5;
    const lw = Math.max(1, r * 0.13);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a211c';
    ctx.fillStyle = '#2a211c';
    if (mood === 'angry') circle(cx, cy + r * 0.1, r * 0.98, 'rgba(225,70,50,0.28)');
    if (mood === 'happy' || mood === 'eat') {
      circle(cx - ex * 1.35, my - r * 0.12, r * 0.17, 'rgba(240,110,100,0.5)');
      circle(cx + ex * 1.35, my - r * 0.12, r * 0.17, 'rgba(240,110,100,0.5)');
    }
    ctx.fillStyle = '#2a211c';
    const blink = (clock * 0.6 + seed * 0.37) % 3 < 0.09;
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex;
      ctx.beginPath();
      if (mood === 'happy' || mood === 'eat') {
        ctx.arc(x, ey + r * 0.08, r * 0.17, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else if (mood === 'tired' || blink) {
        ctx.moveTo(x - r * 0.16, ey);
        ctx.lineTo(x + r * 0.16, ey);
        ctx.stroke();
      } else {
        ctx.arc(x, ey, r * 0.1, 0, 6.2832);
        ctx.fill();
      }
      if (mood === 'sad' || mood === 'angry') {
        const k = mood === 'angry' ? 1 : -1; // 怒：眉头向内压；丧：眉尾下垂
        ctx.beginPath();
        ctx.moveTo(x - sx * r * 0.22, ey - r * (k > 0 ? 0.2 : 0.36));
        ctx.lineTo(x + sx * r * 0.22, ey - r * (k > 0 ? 0.4 : 0.22));
        ctx.stroke();
      }
    }
    ctx.beginPath();
    if (mood === 'happy') ctx.arc(cx, my - r * 0.16, r * 0.26, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood === 'ok') ctx.arc(cx, my - r * 0.2, r * 0.2, 0.25 * Math.PI, 0.75 * Math.PI);
    else if (mood === 'meh') {
      ctx.moveTo(cx - r * 0.16, my);
      ctx.lineTo(cx + r * 0.16, my);
    } else if (mood === 'sad' || mood === 'angry') ctx.arc(cx, my + r * 0.2, r * 0.22, 1.2 * Math.PI, 1.8 * Math.PI);
    else if (mood === 'tired') ctx.ellipse(cx, my, r * 0.1, r * 0.13, 0, 0, 6.2832);
    else if (mood === 'eat') ctx.ellipse(cx, my - r * 0.02, r * 0.13, r * (0.07 + 0.07 * Math.abs(Math.sin(clock * 7 + seed))), 0, 0, 6.2832);
    if (mood === 'tired' || mood === 'eat') ctx.fill();
    else ctx.stroke();
    if (mood === 'tired' || mood === 'sad') {
      // 汗滴
      ctx.fillStyle = '#7cc6ee';
      ctx.beginPath();
      const dx = cx + r * 0.95,
        dy = cy - r * 0.35 + ((clock * 0.8 + seed) % 1) * r * 0.3;
      ctx.moveTo(dx, dy - r * 0.2);
      ctx.quadraticCurveTo(dx + r * 0.16, dy + r * 0.08, dx, dy + r * 0.12);
      ctx.quadraticCurveTo(dx - r * 0.16, dy + r * 0.08, dx, dy - r * 0.2);
      ctx.fill();
    }
  }
  const HAIR = ['#2a2320', '#4a3626', '#1c1c1c', '#6b4a2a', '#7a7a7a', '#3b2a4a'];
  // 大头小身子的小人。返回头顶坐标，给头顶气泡用。
  function person(x, y, opt) {
    const cx = (x + 0.5) * T,
      by = (y + 0.5) * T;
    const s = (opt.scale || 1) * T;
    const seed = opt.seed || 0;
    const bob = opt.walk ? Math.abs(Math.sin(clock * 11 + seed)) * s * 0.05 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, by + s * 0.4, s * 0.26, s * 0.08, 0, 0, 6.2832);
    ctx.fill();
    // 脚
    const step = opt.walk ? Math.sin(clock * 11 + seed) * s * 0.06 : 0;
    fillRR(cx - s * 0.15, by + s * 0.3 + step, s * 0.12, s * 0.1, s * 0.04, '#3a3230');
    fillRR(cx + s * 0.03, by + s * 0.3 - step, s * 0.12, s * 0.1, s * 0.04, '#3a3230');
    // 身体
    fillRR(cx - s * 0.2, by + s * 0.02 - bob, s * 0.4, s * 0.32, s * 0.13, opt.body);
    if (opt.apron) {
      fillRR(cx - s * 0.13, by + s * 0.1 - bob, s * 0.26, s * 0.24, s * 0.05, '#f7f9f8');
      ctx.fillStyle = opt.body;
      ctx.fillRect(cx - s * 0.05, by + s * 0.2 - bob, s * 0.1, s * 0.06);
    }
    // 头
    const hy = by - s * 0.14 - bob,
      hr = s * 0.25;
    circle(cx, hy, hr, opt.skin || PAL.skin);
    const hair = opt.hair || HAIR[seed % HAIR.length];
    ctx.fillStyle = hair;
    const style = opt.hat ? 0 : seed % 3;
    ctx.beginPath();
    ctx.arc(cx, hy - hr * 0.08, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(cx, hy - hr * (style === 1 ? 0.2 : 0.55), cx - hr * 1.02, hy - hr * 0.14);
    ctx.fill();
    if (style === 2) {
      circle(cx - hr * 0.95, hy + hr * 0.25, hr * 0.3, hair);
      circle(cx + hr * 0.95, hy + hr * 0.25, hr * 0.3, hair);
    }
    if (opt.hat === 'chef') {
      fillRR(cx - hr * 0.8, hy - hr * 1.75, hr * 1.6, hr * 0.95, hr * 0.4, '#ffffff');
      fillRR(cx - hr * 0.72, hy - hr * 1.02, hr * 1.44, hr * 0.3, 2, '#e3e8ea');
    } else if (opt.hat === 'band') {
      fillRR(cx - hr * 1.0, hy - hr * 0.72, hr * 2.0, hr * 0.3, 2, '#c5382c');
      circle(cx + hr * 0.95, hy - hr * 0.5, hr * 0.2, '#c5382c');
    } else if (opt.hat === 'cap') {
      fillRR(cx - hr * 1.0, hy - hr * 1.15, hr * 2.0, hr * 0.62, hr * 0.3, opt.hatColor || '#23323a');
      fillRR(cx - hr * 0.3, hy - hr * 0.68, hr * 1.5, hr * 0.2, 2, opt.hatColor || '#23323a');
    }
    drawFace(cx, hy, hr, opt.face || 'ok', seed);
    return { cx, cy: by - bob, top: hy - hr * (opt.hat === 'chef' ? 1.9 : 1.25) };
  }
  function staffLook(s) {
    const kitchen = s.arch === 'chef' || s.arch === 'helper';
    return { body: APRON[s.color % APRON.length], apron: true, hat: s.owner ? 'band' : kitchen ? 'chef' : null, seed: s.id, face: staffFace(s) };
  }
  function drawStaff(S, s, sel) {
    if (s.off) return;
    const t = s.task;
    const look = staffLook(s);
    look.walk = t && !t.work && s.path.length > 0;
    if (sel) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = Math.max(2, T * 0.07);
      ctx.beginPath();
      ctx.ellipse((s.x + 0.5) * T, (s.y + 0.9) * T, T * 0.36, T * 0.14, 0, 0, 6.2832);
      ctx.stroke();
    }
    const p = person(s.x, s.y, look);
    if (s.carry) {
      circle(p.cx + s.dir * T * 0.3, p.cy + T * 0.16, T * 0.14, '#ffffff');
      circle(p.cx + s.dir * T * 0.3, p.cy + T * 0.16, T * 0.09, '#e08a4a');
    }
    const by = p.top - T * 0.14;
    if (t) {
      const icon = t.job === 'rest' ? MR.ICON.rest : MR.ICON[t.job] || '…';
      badge(icon, p.cx, by, T * 0.3, t.forced ? '#ffd24a' : 'rgba(255,255,255,0.95)', PAL.ink);
      if (t.work && t.dur > 0.6) {
        const w = T * 0.56;
        fillRR(p.cx - w / 2, by + T * 0.2, w, T * 0.07, 2, 'rgba(0,0,0,0.35)');
        fillRR(p.cx - w / 2, by + T * 0.2, w * Math.min(1, t.t / t.dur), T * 0.07, 2, '#3aa26b');
      }
    }
    text(s.owner ? '店主' : s.name, p.cx, p.cy + T * 0.56, Math.max(10, T * 0.2), 'rgba(20,32,29,0.9)', 'center', 700);
  }
  function drawGroup(S, g, sel) {
    const tp = MR.GUEST_TYPES[g.type] || MR.GUEST_TYPES.passerby;
    const n = g.m.length;
    const seated = g.state !== 'queue' && g.state !== 'leaving' && g.state !== 'toCounter' && g.state !== 'vin' && g.state !== 'vstay' && !g.atCounter;
    const face = guestFace(g);
    let top = null;
    g.m.forEach((m, i) => {
      const off = seated ? 0 : (i - (n - 1) / 2) * 0.3;
      const body = g.kind === 'visitor' ? (g.vtype === 'inspector' ? '#34495a' : '#6b4a8a') : g.type === 'regular' || g.type === 'critic' ? tp.color : GUEST_HUES[(g.hue + i) % GUEST_HUES.length];
      const p = person(m.x + off, m.y - (seated && !m.path.length ? 0.12 : 0), { body, face, seed: g.id + i * 7, walk: m.path.length > 0 && m.delay <= 0, scale: g.type === 'family' && i === n - 1 ? 0.7 : 0.9, hat: g.kind === 'visitor' ? 'cap' : null, hatColor: g.vtype === 'landlord' ? '#3a2a20' : '#23323a' });
      if (i === 0) top = p;
    });
    if (!top) return;
    if (sel) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = Math.max(2, T * 0.06);
      ctx.beginPath();
      ctx.arc(top.cx, top.cy, T * 0.46, 0, 6.2832);
      ctx.stroke();
    }
    const by = top.top - T * 0.12;
    let icon = null,
      bar = false;
    if (g.kind === 'visitor') icon = g.vtype === 'inspector' ? '🔍' : '🏠';
    else if (g.state === 'queue') {
      icon = '⏳';
      bar = true;
    } else if (g.state === 'wantOrder') {
      icon = '🙋';
      bar = true;
    } else if (g.state === 'waitFood') {
      icon = '🍜' + g.served + '/' + g.orders;
      bar = true;
    } else if (g.state === 'wantPay') {
      icon = '💰';
      bar = true;
    } else if (g.state === 'browse') icon = '📖';
    if (g.type === 'critic' && !icon) icon = '✍️';
    if (icon) {
      const f = bar ? Math.max(0, g.pat / g.patMax) : 1;
      badge(icon, top.cx, by, T * 0.26, !bar || f > 0.5 ? 'rgba(255,255,255,0.95)' : f > 0.25 ? '#ffe2a8' : '#ffb7ae', PAL.ink);
      if (bar) {
        const w = T * 0.56;
        fillRR(top.cx - w / 2, by + T * 0.18, w, T * 0.07, 2, 'rgba(0,0,0,0.35)');
        fillRR(top.cx - w / 2, by + T * 0.18, w * f, T * 0.07, 2, f > 0.5 ? PAL.good : f > 0.25 ? PAL.warn : PAL.bad);
      }
    }
    if (g.reg) text('❤', top.cx + T * 0.3, top.cy - T * 0.1, T * 0.22, '#e0483a');
  }

  // 给界面用的小图：把物品 / 人画到离屏画布上
  const iconCache = {};
  function offscreen(size, fn) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const keep = [ctx, T];
    ctx = c.getContext('2d');
    T = size;
    try {
      fn();
    } finally {
      ctx = keep[0];
      T = keep[1];
    }
    return c.toDataURL();
  }
  R.itemIcon = function (type, tier) {
    const k = type + (tier || 0);
    if (!iconCache[k]) {
      const cells = sim.cellsOf(type, 0, 0, 0);
      const w = Math.max(...cells.map((c) => c.x)) + 1,
        h = Math.max(...cells.map((c) => c.y)) + 1;
      const n = Math.max(w, h);
      iconCache[k] = offscreen(96, () => {
        T = 96 / n;
        ctx.translate(((n - w) * T) / 2, ((n - h) * T) / 2);
        DRAW[type]({ id: -1, type, x: 0, y: 0, rot: 0, tier: tier || 0, dur: 100 }, 0, 0);
      });
    }
    return iconCache[k];
  };
  R.staffIcon = function (s) {
    const look = staffLook(s);
    const k = 'p' + s.id + look.face + look.hat + s.color;
    if (!iconCache[k])
      iconCache[k] = offscreen(96, () => {
        T = 110;
        ctx.translate(-7, 6);
        look.seed = s.id;
        const c0 = clock;
        clock = 1;
        person(0, 0, look);
        clock = c0;
      });
    return iconCache[k];
  };
  R.guestIcon = function (seed, face, body) {
    const k = 'g' + (seed % 6) + face + body;
    if (!iconCache[k])
      iconCache[k] = offscreen(96, () => {
        T = 110;
        ctx.translate(-7, 6);
        const c0 = clock;
        clock = 1;
        person(0, 0, { body, face, seed });
        clock = c0;
      });
    return iconCache[k];
  };

  // ---------- 特效 ----------
  function pullFx(S) {
    while (S.fx.length) {
      const f = S.fx.shift();
      f.age = 0;
      f.life = f.k === 'score' ? 2.2 : f.k === 'pay' ? 1.8 : f.k === 'say' ? 2.4 : 1.4;
      parts.push(f);
    }
  }
  function drawFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const f = parts[i];
      f.age += dt;
      if (f.age >= f.life) {
        parts.splice(i, 1);
        continue;
      }
      const u = f.age / f.life;
      const cx = (f.x + 0.5) * T,
        cy = (f.y + 0.5) * T - T * (0.5 + u * 0.7);
      ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      if (f.k === 'score') {
        const tn = MR.TIERS.find((t) => t.key === f.tier).name;
        badge(f.total + ' ' + tn, cx, cy, T * 0.34, TIER_COL[f.tier], '#fff');
      } else if (f.k === 'pay') {
        badge(f.text, cx, cy, T * 0.32, '#1c2b27', '#ffe08a');
        text('★'.repeat(f.stars), cx, cy + T * 0.36, T * 0.24, '#ffb300', 'center', 700);
      } else if (f.k === 'angry') {
        badge('走了!', cx, cy, T * 0.32, PAL.bad, '#fff');
      } else if (f.k === 'say') {
        badge(f.text, cx, cy, T * 0.3, '#ffffff', PAL.ink);
      } else if (f.k === 'smoke') {
        for (let j = 0; j < 4; j++) circle(cx + Math.sin(j * 2 + f.age * 3) * T * 0.2, cy + T * 0.4 - j * T * 0.12, T * (0.12 + u * 0.1), 'rgba(60,60,60,0.5)');
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawWeather(S) {
    if (S.ev && S.ev.weather === 'rain') {
      ctx.strokeStyle = 'rgba(120,160,190,0.55)';
      ctx.lineWidth = Math.max(1, T * 0.04);
      const y0 = C.STREET_Y * T;
      for (let i = 0; i < 46; i++) {
        const x = ((i * 53.7 + clock * 90) % (C.COLS * T + 40)) - 20;
        const y = y0 + ((i * 31.3 + clock * 260) % T);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - T * 0.08, y + T * 0.22);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,60,80,0.12)';
      ctx.fillRect(0, y0, C.COLS * T, T);
    }
    if (S.ev && S.ev.festival) {
      const y = C.STREET_Y * T + T * 0.12;
      ctx.strokeStyle = '#7a2a20';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(C.COLS * T, y);
      ctx.stroke();
      for (let i = 0; i < C.COLS * 2; i++) {
        const x = (i + 0.5) * T * 0.5;
        if (x > (C.DOOR.x - 0.6) * T && x < (C.DOOR.x + 1.6) * T) continue;
        fillRR(x - T * 0.07, y + Math.sin(clock * 2 + i) * 1.5, T * 0.14, T * 0.18, T * 0.06, i % 2 ? '#e0483a' : '#f0a23c');
      }
    }
  }

  // ---------- 一帧 ----------
  R.draw = function (S, view, dt) {
    clock += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, C.COLS * T, C.ROWS * T);
    drawFloor(S);
    // 污渍
    for (const sp of S.spots) {
      const cx = (sp.x + 0.5) * T,
        cy = (sp.y + 0.6) * T;
      circle(cx, cy, T * 0.17, 'rgba(96,74,48,0.5)');
      circle(cx + T * 0.16, cy - T * 0.1, T * 0.08, 'rgba(96,74,48,0.45)');
      circle(cx - T * 0.14, cy + T * 0.1, T * 0.06, 'rgba(96,74,48,0.4)');
    }
    const counts = stationCounts(S);
    const items = S.items.slice().sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (view.place && view.place.moveId === it.id) continue;
      drawItem(S, it, counts);
      if (view.sel && view.sel.kind === 'item' && view.sel.id === it.id) {
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = Math.max(2, T * 0.08);
        for (const c of sim.cellsOf(it.type, it.x, it.y, it.rot)) ctx.strokeRect(c.x * T + 1, c.y * T + 1, T - 2, T - 2);
      }
    }
    // 人按 y 排序
    const ppl = [];
    for (const s of S.staff) ppl.push({ y: s.y, s });
    for (const g of S.groups) ppl.push({ y: g.m[0] ? g.m[0].y : 0, g });
    ppl.sort((a, b) => a.y - b.y);
    for (const p of ppl) {
      if (p.s) drawStaff(S, p.s, view.sel && view.sel.kind === 'staff' && view.sel.id === p.s.id);
      else drawGroup(S, p.g, view.sel && view.sel.kind === 'group' && view.sel.id === p.g.id);
    }
    drawWeather(S);
    pullFx(S);
    drawFx(dt);
    // 放置预览：绿色可放、红色不可放
    if (view.place) {
      const pl = view.place;
      if (pl.x != null) {
        const cells = sim.cellsOf(pl.type, pl.x, pl.y, pl.rot);
        ctx.globalAlpha = 0.75;
        const ghost = { id: -1, type: pl.type, x: pl.x, y: pl.y, rot: pl.rot, tier: pl.tier || 0, dur: 100 };
        if (cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < C.COLS && c.y < C.ROWS)) DRAW[pl.type](ghost, pl.x * T, pl.y * T);
        ctx.globalAlpha = 1;
        for (const c of cells) {
          ctx.fillStyle = pl.ok ? 'rgba(58,162,107,0.38)' : 'rgba(210,70,58,0.42)';
          ctx.fillRect(c.x * T, c.y * T, T, T);
          ctx.strokeStyle = pl.ok ? '#2a8a58' : '#b3362b';
          ctx.lineWidth = 2;
          ctx.strokeRect(c.x * T + 1, c.y * T + 1, T - 2, T - 2);
        }
      }
      // 提示哪些地面能用
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      const def = MR.ITEMS[pl.type];
      for (const z of MR.ZONES) {
        if (!S.zones[z.id] || (def.zone !== 'any' && def.zone !== z.kind)) continue;
        ctx.fillRect(z.x0 * T, z.y0 * T, (z.x1 - z.x0 + 1) * T, (z.y1 - z.y0 + 1) * T);
      }
    }
    // 夜色
    if (S.minute > 1110) {
      ctx.fillStyle = 'rgba(20,30,70,' + Math.min(0.16, (S.minute - 1110) / 1200) + ')';
      ctx.fillRect(0, C.STREET_Y * T, C.COLS * T, T);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
