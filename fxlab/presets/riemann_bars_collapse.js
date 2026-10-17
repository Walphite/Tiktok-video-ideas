// ============================================================
// 预设 riemann_bars_collapse：竖直柱子从左到右升起，试图贴合狄利克雷函数，剧烈抖动后塌掉，
// 印章「不可积」重重落下（震屏 + 色差）
// 数学：每个小区间里既有取 1 的无理数也有取 0 的有理数，所以柱子在 0 和 1 之间定不下来
// 事件：rise（柱子升起）、rattle（抖动）、collapse（塌掉）、stamp（印章落下）
// ============================================================
FX.registerPreset('riemann_bars_collapse', {
  描述: '黎曼柱升起、抖动、塌掉，落下「不可积」印章',
  params: {
    barCount: 34,               // 柱子数量
    left: 320, right: 1600,     // 柱子区域左右（设计单位）
    baseY: 780, topY: 420,      // 函数值 0 与 1 对应的屏幕高度
    riseEnd: 2.0,               // 全部升起完成的时刻（本段秒）
    jitterEnd: 3.3,             // 抖动结束时刻
    collapseEnd: 4.2,           // 塌落结束时刻
    stampAt: 4.3,               // 印章落下时刻
    stampText: '不可积',         // 印章文字（可改）
    stampSize: 150,             // 印章字号
    dotRows: 70,                // 函数图像上的点数（上排黄、下排灰）
    amber: '#E8B931', gray: '#8C929E', red: '#E5533D',
  },
  sounds: {
    rise: { instr: 'blip', track: 'sfx', base: 52, scale: 'major', decay: 0.18, gain: 0.16 },
    rattle: { instr: 'tick', track: 'sfx', base: 50, scale: 'chromatic', decay: 0.04, gain: 0.16 },
    collapse: { instr: 'thud', track: 'sfx', base: 38, scale: 'chromatic', decay: 0.6, gain: 0.45 },
    stamp: { instr: 'thud', track: 'sfx', base: 31, scale: 'chromatic', decay: 1.0, gain: 0.65 },
  },
  init(ctx, p) {
    const rng = ctx.rng, bars = [];
    for (let i = 0; i < p.barCount; i++) bars.push({ i, h: 0, target: 1, vy: 0, rot: 0, vrot: 0, fall: 0, risen: false, jit: rng.range(0, 1) });
    const dots = []; for (let i = 0; i < p.dotRows; i++) { dots.push({ u: rng(), top: true, ph: rng.range(0, 6.28) }); dots.push({ u: rng(), top: false, ph: rng.range(0, 6.28) }); }
    return { bars, dots, rattleAcc: 0, collapsed: false, stamped: false };
  },
  step(s, ctx, p) {
    const t = ctx.lt, rng = ctx.rng;
    for (const b of s.bars) {
      const t0 = (b.i / p.barCount) * p.riseEnd;
      if (t < p.riseEnd + 0.3) { // 升起
        const k = FX.prog(t, t0, t0 + 0.35, 'outCubic'); b.h = k; if (!b.risen && k > 0) { b.risen = true; ctx.emit({ type: 'rise', pitch: b.i % 7, vel: 0.5, x: b.i / p.barCount }); }
      } else if (t < p.jitterEnd) { // 抖动：高度在 0 与 1 之间跳
        const freq = FX.lerp(6, 28, FX.prog(t, p.riseEnd, p.jitterEnd)); const ph = Math.floor((t + b.jit) * freq);
        b.h = (ph % 3 === 0) ? 0.05 + rng() * 0.15 : 0.85 + rng() * 0.15; b.rot = (rng() - 0.5) * 0.04 * FX.prog(t, p.riseEnd, p.jitterEnd);
      } else { // 塌落
        if (!s.collapsed) { s.collapsed = true; ctx.emit({ type: 'collapse', pitch: 0, vel: 1, x: 0.5 }); ctx.hit({ shake: 10, ca: 4 }); for (const q of s.bars) { q.vy = rng.range(-1.5, 0.5); q.vrot = rng.range(-3, 3); q.delay = rng.range(0, 0.35); q.t0 = t; } }
        const dtl = Math.max(0, t - b.t0 - b.delay); b.fall = dtl; b.vy += 9 * ctx.dt; b.rot += b.vrot * ctx.dt * FX.clamp(dtl * 4, 0, 1);
      }
    }
    if (t >= p.riseEnd && t < p.jitterEnd) { const k = FX.prog(t, p.riseEnd, p.jitterEnd); s.rattleAcc += FX.lerp(5, 22, k) * ctx.dt; while (s.rattleAcc >= 1) { s.rattleAcc -= 1; ctx.emit({ type: 'rattle', pitch: rng.int(5), vel: 0.3 + 0.6 * k, x: rng() }); } ctx.hit({ shake: 1.5 + 5 * k }); }
    if (!s.stamped && t >= p.stampAt) { s.stamped = true; ctx.emit({ type: 'stamp', pitch: 0, vel: 1, x: 0.5 }); ctx.hit({ shake: 30, ca: 14, flash: 0.22 }); }
  },
  draw(s, ctx, p) {
    const t = ctx.lt, c = ctx.layers.bg.world(ctx.cam, ctx.px), F = ctx.fade, W = p.right - p.left, bw = W / p.barCount;
    // 函数图像：上排黄点（无理数处取 1）、下排灰点（有理数处取 0），两条虚线
    c.lineWidth = 1; c.strokeStyle = ctx.palette.line; c.setLineDash([4, 8]); c.globalAlpha = 0.35 * F;
    c.beginPath(); c.moveTo(p.left - 40, p.topY); c.lineTo(p.right + 40, p.topY); c.stroke(); c.beginPath(); c.moveTo(p.left - 40, p.baseY); c.lineTo(p.right + 40, p.baseY); c.stroke(); c.setLineDash([]);
    c.font = `20px ${FX.FONT_MONO}`; c.fillStyle = ctx.palette.line; c.globalAlpha = 0.6 * F; c.fillText('1', p.left - 70, p.topY + 7); c.fillText('0', p.left - 70, p.baseY + 7);
    const pool = s.pool || (s.pool = new FX.ParticlePool(400)); pool.clear(); const amber = FX.hex(p.amber), gray = FX.hex(p.gray);
    for (const d of s.dots) { const fl = 0.6 + 0.4 * Math.sin(t * 2.5 + d.ph); pool.spawn({ x: p.left + d.u * W, y: d.top ? p.topY : p.baseY, size: d.top ? 13 : 10, color: d.top ? amber : gray, alpha: fl * F * (d.top ? 1 : 0.9), shape: 1 }); }
    ctx.points(pool, 'add');
    // 柱子
    for (const b of s.bars) {
      const x = p.left + b.i * bw + bw * 0.08, w = bw * 0.84, H = (p.baseY - p.topY) * b.h; if (H <= 0.5 && !s.collapsed) continue;
      c.save(); const fy = s.collapsed ? Math.max(0, b.vy * b.fall * 420 + 4.5 * 380 * b.fall * b.fall) : 0;
      const alpha = s.collapsed ? FX.clamp(1 - (b.fall - 0.3) / 0.6, 0, 1) : 1;
      c.translate(x + w / 2, p.baseY + fy); c.rotate(b.rot); c.globalAlpha = 0.9 * F * alpha;
      c.strokeStyle = ctx.palette.line; c.lineWidth = 1.5 / ctx.cam.zoom; c.fillStyle = 'rgba(255,255,255,0.10)';
      const hh = s.collapsed ? (p.baseY - p.topY) * 0.95 : H; c.beginPath(); c.rect(-w / 2, -hh, w, hh); c.fill(); c.stroke(); c.restore();
    }
    // 印章：红色方框 + 粗宋体，从大到小砸下
    if (s.stamped) {
      const k = FX.prog(t, p.stampAt, p.stampAt + 0.16, 'inCubic'); const sc = FX.lerp(2.4, 1, k); const sh = s.pool2 || 0;
      const g = ctx.layers.fg.world(ctx.cam, ctx.px); g.save(); g.translate(960, 600); g.rotate(-0.12); g.scale(sc, sc); g.globalAlpha = F * (0.55 + 0.45 * k);
      g.font = `bold ${p.stampSize}px ${FX.FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; const tw = g.measureText(p.stampText).width;
      g.strokeStyle = p.red; g.lineWidth = 10; g.strokeRect(-tw / 2 - 40, -p.stampSize * 0.68, tw + 80, p.stampSize * 1.36);
      g.fillStyle = p.red; g.fillText(p.stampText, 0, 8); g.restore(); g.textAlign = 'left';
    }
  },
});
