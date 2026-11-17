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
    steel: '#d3dde1',
    steelDark: '#9fb0b7',
    stove: '#5a504c',
    woodItem: '#d3a062',
    woodDark: '#a8703c',
    table: '#f0c27a',
    stool: '#e2573f',
    stoolDark: '#b93f2b',
    white: '#f7f9f8',
    ink: '#4b3329',
    good: '#5fa65a',
    warn: '#f6b93b',
    bad: '#e2573f',
    skin: '#f8d3b0',
  };
  const APRON = ['#e2573f', '#4f9fd0', '#f6b93b', '#9a7fd0', '#3f9c8f', '#e88aa8'];
  const GUEST_HUES = ['#8fb2d6', '#d9a36b', '#8fc7a6', '#d99ab0', '#a9a6e0', '#e0c06a'];
  const TIER_COL = { god: '#b84fc9', great: '#3f9c8f', good: '#4f9fd0', ok: '#9a8f86', bad: '#e2573f' };
  const INK = '#4b3329';
  const DISP = '"ZCOOL KuaiLe","YouYuan","Yuanti SC",' + '"PingFang SC","Microsoft YaHei","WenQuanYi Zen Hei",sans-serif';
  let OUT = true; // 是否给色块描边
  const LW = () => Math.max(1.2, T * 0.04);
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
  // 所有色块统一描一圈深棕边，凑出手绘贴纸的感觉；半透明和太小的不描
  function fillRR(x, y, w, h, r, c) {
    ctx.fillStyle = c;
    rr(x, y, w, h, r);
    ctx.fill();
    if (OUT && c[0] === '#' && Math.min(w, h) > T * 0.13) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW();
      ctx.stroke();
    }
  }
  function circle(x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
    if (OUT && c[0] === '#' && r > T * 0.075) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW();
      ctx.stroke();
    }
  }
  function icon(name, cx, cy, size) {
    const im = MR.icons.image(name);
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, cx - size / 2, cy - size / 2, size, size);
  }
  function text(s, x, y, size, c, align, weight) {
    ctx.font = (weight || 600) + ' ' + Math.round(size) + 'px ' + FONT;
    ctx.fillStyle = c;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  // 贴纸气泡：文字版
  function badge(s, cx, cy, size, bg, fg) {
    size = Math.max(size, 11);
    ctx.font = '700 ' + Math.round(size * 0.82) + 'px ' + FONT;
    const w = Math.max(size * 1.25, ctx.measureText(s).width + size * 0.6);
    ctx.fillStyle = bg;
    rr(cx - w / 2, cy - size * 0.66, w, size * 1.32, size * 0.66);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW();
    ctx.stroke();
    text(s, cx, cy + size * 0.04, size * 0.82, fg, 'center', 700);
  }
  // 贴纸气泡：图标（可带一小段字），底下带个小尖
  function bubble(name, txt, cx, cy, size, bg) {
    size = Math.max(size, 13);
    ctx.font = '700 ' + Math.round(size * 0.7) + 'px ' + FONT;
    const tw = txt ? ctx.measureText(txt).width + size * 0.2 : 0;
    const w = size * 1.3 + tw;
    ctx.fillStyle = bg;
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, cy + size * 0.6);
    ctx.lineTo(cx, cy + size * 0.92);
    ctx.lineTo(cx + size * 0.2, cy + size * 0.6);
    ctx.fill();
    ctx.stroke();
    rr(cx - w / 2, cy - size * 0.66, w, size * 1.32, size * 0.5);
    ctx.fill();
    ctx.stroke();
    icon(name, cx - w / 2 + size * 0.65, cy, size);
    if (txt) text(txt, cx + w / 2 - tw / 2 - size * 0.2, cy + size * 0.04, size * 0.7, INK, 'center', 700);
  }

  // ---------- 地面与墙 ----------
  const night = (S) => Math.max(0, Math.min(1, (S.minute - 1050) / 120));
  function line(x1, y1, x2, y2, c, w) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function drawFloor(S) {
    const nt = night(S);
    OUT = false;
    for (let y = 0; y < C.ROWS; y++)
      for (let x = 0; x < C.COLS; x++) {
        const px = x * T,
          py = y * T;
        if (y === C.STREET_Y) {
          ctx.fillStyle = '#d8ccb6';
          ctx.fillRect(px, py, T, T * 0.42);
          line(px + T * (x % 2 ? 0.3 : 0.7), py, px + T * (x % 2 ? 0.3 : 0.7), py + T * 0.42, 'rgba(75,51,41,0.18)', 1);
          ctx.fillStyle = '#b9ad98';
          ctx.fillRect(px, py + T * 0.42, T, T * 0.08);
          ctx.fillStyle = '#5c6270';
          ctx.fillRect(px, py + T * 0.5, T, T * 0.5);
          ctx.fillStyle = '#f2c14e';
          ctx.fillRect(px + T * 0.15, py + T * 0.78, T * 0.5, T * 0.05);
          continue;
        }
        const z = sim.zoneAt(x, y);
        if (z) {
          if (z.kind === 'kitchen') {
            ctx.fillStyle = (x + y) % 2 ? '#fdf6e6' : '#c4e6da';
            ctx.fillRect(px, py, T, T);
            ctx.strokeStyle = 'rgba(75,51,41,0.13)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, py + 0.5, T, T);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(px + T * 0.1, py + T * 0.1, T * 0.22, T * 0.06);
          } else {
            ctx.fillStyle = y % 2 ? '#efca90' : '#e7bd80';
            ctx.fillRect(px, py, T, T);
            const sx = px + ((x + (y % 2 ? 0 : 1)) % 2 ? T * 0.5 : 0);
            line(px, py + T - 0.5, px + T, py + T - 0.5, 'rgba(75,51,41,0.22)', 1);
            line(sx + 0.5, py, sx + 0.5, py + T, 'rgba(75,51,41,0.18)', 1);
            const k = (x * 7 + y * 13) % 5;
            line(px + T * (0.15 + k * 0.1), py + T * 0.35, px + T * (0.45 + k * 0.1), py + T * 0.35, 'rgba(255,255,255,0.28)', Math.max(1, T * 0.03));
            line(px + T * (0.5 - k * 0.06), py + T * 0.7, px + T * (0.75 - k * 0.06), py + T * 0.7, 'rgba(150,95,40,0.22)', Math.max(1, T * 0.03));
          }
        } else if (sim.isDoor(x, y)) {
          if (y === C.DOOR.y) {
            ctx.fillStyle = '#e7bd80';
            ctx.fillRect(px, py, T, T);
            OUT = true;
            fillRR(px + T * 0.1, py + T * 0.2, T * 0.8, T * 0.62, T * 0.08, '#d9573f');
            OUT = false;
            for (let i = 1; i < 4; i++) line(px + T * 0.1 + i * T * 0.2, py + T * 0.26, px + T * 0.1 + i * T * 0.2, py + T * 0.76, 'rgba(255,240,210,0.6)', Math.max(1, T * 0.04));
          } else {
            ctx.fillStyle = '#e9dcc0';
            ctx.fillRect(px, py, T, T);
            line(px, py + T * 0.5, px + T, py + T * 0.5, 'rgba(75,51,41,0.15)', 1);
          }
        } else {
          // 墙：木墙裙
          ctx.fillStyle = '#3f8478';
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = '#5bab9b';
          ctx.fillRect(px, py, T, T * 0.3);
          ctx.fillStyle = '#2b5f58';
          ctx.fillRect(px, py + T * 0.86, T, T * 0.14);
          line(px + T * 0.5, py + T * 0.3, px + T * 0.5, py + T * 0.86, 'rgba(20,50,45,0.35)', 1);
          line(px, py + T * 0.3, px + T, py + T * 0.3, INK, LW());
          line(px, py + 0.5, px + T, py + 0.5, INK, LW());
          line(px, py + T - 0.5, px + T, py + T - 0.5, INK, LW());
          if (y === C.DOOR.y && Math.abs(x - C.DOOR.x) > 1 && x % 2 === 0) {
            // 临街的窗：白天映着天，晚上透出灯
            OUT = true;
            fillRR(px + T * 0.1, py + T * 0.36, T * 0.8, T * 0.46, T * 0.06, '#fff6e3');
            OUT = false;
            ctx.fillStyle = nt > 0.3 ? '#ffd98a' : '#bfe6f2';
            ctx.fillRect(px + T * 0.17, py + T * 0.42, T * 0.66, T * 0.34);
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillRect(px + T * 0.22, py + T * 0.46, T * 0.1, T * 0.2);
            line(px + T * 0.5, py + T * 0.42, px + T * 0.5, py + T * 0.76, INK, LW());
          }
        }
      }
    OUT = true;
    // 区域边缘描一圈
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW();
    for (const z of MR.ZONES) ctx.strokeRect(z.x0 * T, z.y0 * T, (z.x1 - z.x0 + 1) * T, (z.y1 - z.y0 + 1) * T);
    // 门口的条纹雨棚和招牌
    const dx = (C.DOOR.x + 0.5) * T,
      dy = C.DOOR.y * T;
    const aw = T * 2.6,
      n = 8;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#fff6e3' : '#e2573f';
      ctx.beginPath();
      ctx.moveTo(dx - aw / 2 + (aw / n) * i, dy + T * 0.86);
      ctx.lineTo(dx - aw / 2 + (aw / n) * (i + 1), dy + T * 0.86);
      ctx.lineTo(dx - aw * 0.58 + ((aw * 1.16) / n) * (i + 1), dy + T * 1.2);
      ctx.lineTo(dx - aw * 0.58 + ((aw * 1.16) / n) * i, dy + T * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW();
      ctx.stroke();
    }
    fillRR(dx - T * 1.25, dy + T * 0.06, T * 2.5, T * 0.62, T * 0.14, '#e2573f');
    ctx.font = '400 ' + Math.round(T * 0.42) + 'px ' + DISP;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#b93f2b';
    ctx.fillText('一间小馆', dx, dy + T * 0.42);
    ctx.fillStyle = '#fff6e3';
    ctx.fillText('一间小馆', dx, dy + T * 0.38);
    // 未解锁区域：盖着防尘布，挂一块牌子
    for (const z of MR.ZONES) {
      if (S.zones[z.id]) continue;
      const x = z.x0 * T,
        y = z.y0 * T,
        w = (z.x1 - z.x0 + 1) * T,
        h = (z.y1 - z.y0 + 1) * T;
      ctx.fillStyle = 'rgba(38,58,62,0.88)';
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,246,227,0.06)';
      ctx.lineWidth = T * 0.22;
      for (let i = -h; i < w; i += T * 0.8) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + h);
        ctx.lineTo(x + i + h, y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.setLineDash([T * 0.22, T * 0.16]);
      ctx.strokeStyle = 'rgba(255,246,227,0.5)';
      ctx.lineWidth = Math.max(1.5, T * 0.05);
      rr(x + T * 0.18, y + T * 0.18, w - T * 0.36, h - T * 0.36, T * 0.2);
      ctx.stroke();
      ctx.setLineDash([]);
      const cx = x + w / 2,
        cy = y + h / 2;
      const tw = Math.min(w - T * 0.6, T * 2.9);
      fillRR(cx - tw / 2, cy - T * 0.62, tw, T * 1.24, T * 0.2, '#fff6e3');
      icon('lock', cx - tw / 2 + T * 0.42, cy - T * 0.24, T * 0.5);
      ctx.font = '400 ' + Math.round(T * 0.34) + 'px ' + DISP;
      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.fillText(z.name, cx - tw / 2 + T * 0.74, cy - T * 0.24);
      fillRR(cx - tw / 2 + T * 0.2, cy + T * 0.08, tw - T * 0.4, T * 0.4, T * 0.2, '#f6b93b');
      text(sim.money(z.price), cx, cy + T * 0.29, T * 0.28, INK, 'center', 700);
    }
  }
  // 暖光：吊灯的光斑、傍晚压暗、四角暗角
  function drawLight(S) {
    const W = C.COLS * T,
      H = C.ROWS * T;
    const nt = night(S);
    if (nt > 0) {
      ctx.fillStyle = 'rgba(30,28,74,' + 0.3 * nt + ')';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'lighter';
    const pool = (cx, cy, r, a) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,196,110,' + a + ')');
      g.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    const a = 0.06 + 0.2 * nt;
    for (const z of MR.ZONES) {
      if (!S.zones[z.id]) continue;
      const cy = ((z.y0 + z.y1 + 1) / 2) * T;
      for (let x = z.x0 + 1.5; x < z.x1 + 1; x += 3) pool(x * T, cy, T * 2.6, a);
    }
    for (const it of S.items) if (it.type === 'lamp') pool((it.x + 0.5) * T, (it.y + 0.4) * T, T * 1.8, 0.1 + 0.25 * nt);
    if (nt > 0.3) pool((C.DOOR.x + 0.5) * T, (C.DOOR.y + 1) * T, T * 2.2, 0.22 * nt);
    ctx.globalCompositeOperation = 'source-over';
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
    v.addColorStop(0, 'rgba(40,20,10,0)');
    v.addColorStop(1, 'rgba(40,20,10,' + (0.22 + 0.12 * nt) + ')');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
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
    if (!def.seats) {
      ctx.fillStyle = 'rgba(60,35,20,0.2)';
      rr(px + T * 0.1, py + T * 0.16, T * 0.9, T * 0.88, T * 0.14);
      ctx.fill();
    }
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
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW();
    ctx.stroke();
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
      bubble(MR.icons.nameOf(MR.ICON[t.job] || MR.ICON.rest), null, p.cx, by - T * 0.06, T * 0.32, t.forced ? '#f6b93b' : '#fff6e3');
      if (t.work && t.dur > 0.6) {
        const w = T * 0.56;
        fillRR(p.cx - w / 2, by + T * 0.2, w, T * 0.07, 2, 'rgba(0,0,0,0.35)');
        fillRR(p.cx - w / 2, by + T * 0.2, w * Math.min(1, t.t / t.dur), T * 0.07, 2, '#3aa26b');
      }
    }
    const nm = s.owner ? '店主' : s.name;
    ctx.font = '400 ' + Math.round(Math.max(11, T * 0.23)) + 'px ' + DISP;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2.5, T * 0.07);
    ctx.strokeStyle = '#fff6e3';
    ctx.lineJoin = 'round';
    ctx.strokeText(nm, p.cx, p.cy + T * 0.6);
    ctx.fillStyle = INK;
    ctx.fillText(nm, p.cx, p.cy + T * 0.6);
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
    let ic = null,
      txt = null,
      bar = false;
    if (g.kind === 'visitor') ic = g.vtype === 'inspector' ? 'search' : 'house';
    else if (g.state === 'queue') {
      ic = 'hourglass';
      bar = true;
    } else if (g.state === 'wantOrder') {
      ic = 'hand';
      bar = true;
    } else if (g.state === 'waitFood') {
      ic = 'noodle';
      txt = g.served + '/' + g.orders;
      bar = true;
    } else if (g.state === 'wantPay') {
      ic = 'coin';
      bar = true;
    } else if (g.state === 'browse') ic = 'book';
    if (g.type === 'critic' && !ic) ic = 'pen';
    if (ic) {
      const f = bar ? Math.max(0, g.pat / g.patMax) : 1;
      bubble(ic, txt, top.cx, by - T * 0.06, T * 0.3, !bar || f > 0.5 ? '#fff6e3' : f > 0.25 ? '#ffe08a' : '#ffb3a6');
      if (bar) {
        const w = T * 0.6;
        fillRR(top.cx - w / 2, by + T * 0.26, w, T * 0.1, T * 0.05, '#fff6e3');
        OUT = false;
        fillRR(top.cx - w / 2, by + T * 0.26, w * f, T * 0.1, T * 0.05, f > 0.5 ? PAL.good : f > 0.25 ? PAL.warn : PAL.bad);
        OUT = true;
      }
    }
    if (g.reg) icon('heart', top.cx + T * 0.34, top.cy - T * 0.16, T * 0.3);
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
        badge(f.text, cx, cy, T * 0.34, '#f6b93b', INK);
        for (let j = 0; j < f.stars; j++) icon('star', cx + (j - (f.stars - 1) / 2) * T * 0.24, cy + T * 0.42, T * 0.26);
      } else if (f.k === 'angry') {
        badge('走了!', cx, cy, T * 0.32, PAL.bad, '#fff');
      } else if (f.k === 'say') {
        badge(f.text, cx, cy, T * 0.3, '#fff6e3', INK);
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
    drawLight(S);
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
