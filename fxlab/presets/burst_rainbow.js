// ============================================================
// 预设 burst_rainbow：前半克制（黑底、白色细线、很少的点），某一瞬间 2 万粒子炸开成彩虹色
// 事件：tick（爆发前越来越密的倒数）、burst（爆发瞬间）、arp（爆发后越来越密、音高上升的音，走配乐轨）
// ============================================================
FX.registerPreset('burst_rainbow', {
  描述: '克制的线与点 → 一瞬间两万粒子炸开成彩虹',
  params: {
    count: 20000,            // 爆发粒子数
    burstAt: 3.0,            // 爆发时刻（相对本预设开始，秒）
    center: [960, 540],      // 爆发中心
    speedMin: 180,           // 粒子初速度范围（设计单位/秒）
    speedMax: 1400,
    drag: 0.75,              // 阻力（越大停得越快）
    swirl: 0.35,             // 旋转卷曲强度
    sizeMin: 5, sizeMax: 15, // 粒子大小
    life: 6,                 // 粒子寿命（秒）
    hueShift: 0.0,           // 色相偏移（0..1）
    dotCount: 14,            // 爆发前漂浮的白点数
    lineCount: 3,            // 爆发前的白色细线数
    tickFirst: 0.55,         // 倒数第一次 tick 的间隔（秒），之后按比例缩短
    tickRatio: 0.82,
    arpRateStart: 3,         // 爆发后配乐音符密度：起始每秒几个
    arpRateEnd: 22,          // 结束每秒几个
    arpDuration: 3.0,        // 密度上升持续时间
    shake: 22,               // 爆发震屏
  },
  sounds: {
    tick: { instr: 'tick', track: 'sfx', base: 69, scale: 'chromatic', decay: 0.05, gain: 0.35 },
    burst: { instr: 'thud', track: 'sfx', base: 36, scale: 'chromatic', decay: 0.8, gain: 0.9 },
    swoosh: { instr: 'swoosh', track: 'sfx', base: 60, scale: 'chromatic', decay: 2.2, gain: 0.5 },
    arp: { instr: 'blip', track: 'music', base: 64, scale: 'pentatonic', decay: 0.5, gain: 0.32 },
  },
  init(ctx, p) {
    const rng = ctx.rng; const dots = []; for (let i = 0; i < p.dotCount; i++) dots.push({ x: rng.range(100, ctx.W - 100), y: rng.range(100, ctx.H - 100), ph: rng.range(0, 6.28), sp: rng.range(6, 18) });
    const lines = []; for (let i = 0; i < p.lineCount; i++) lines.push({ y: rng.range(0.2, 0.8) * ctx.H, x0: rng.range(0, 0.3) * ctx.W, x1: rng.range(0.7, 1.0) * ctx.W });
    // 倒数 tick 的时间表（从爆发时刻往前倒推）
    const ticks = []; let gap = p.tickFirst, tt = p.burstAt; while (tt > 0.2 && ticks.length < 40) { ticks.unshift(tt - gap); tt -= gap; gap *= p.tickRatio; }
    return { dots, lines, ticks, tickIdx: 0, burst: false, pool: new FX.ParticlePool(p.count + 200), ringR: 0, arpAcc: 0, arpIdx: 0 };
  },
  step(s, ctx, p) {
    const t = ctx.lt, rng = ctx.rng;
    // 倒数 tick（音高逐个上升）
    while (s.tickIdx < s.ticks.length && t >= s.ticks[s.tickIdx]) { ctx.emit({ type: 'tick', pitch: s.tickIdx, vel: 0.4 + 0.6 * s.tickIdx / s.ticks.length, x: 0.5 }); ctx.hit({ shake: 0.6 }); s.tickIdx++; }
    // 爆发
    if (!s.burst && t >= p.burstAt) {
      s.burst = true; const [cx, cy] = p.center;
      for (let i = 0; i < p.count; i++) {
        const a = rng.range(0, Math.PI * 2), sp = p.speedMin + (p.speedMax - p.speedMin) * Math.pow(rng(), 0.7);
        const hue = (a / (Math.PI * 2) + p.hueShift + rng.gauss() * 0.02) % 1; const col = ctx.palette.rainbow(hue);
        const r0 = rng.range(0, 14);
        s.pool.spawn({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: p.life * rng.range(0.6, 1), size: rng.range(p.sizeMin, p.sizeMax), color: col, alpha: rng.range(0.5, 1) });
      }
      ctx.emit({ type: 'burst', pitch: 0, vel: 1, x: 0.5 }); ctx.emit({ type: 'swoosh', pitch: 0, vel: 0.8, x: 0.5 });
      ctx.hit({ shake: p.shake, ca: 14, flash: 0.9 });
    }
    if (s.burst) {
      const tb = t - p.burstAt; s.ringR = 180 + 1400 * (1 - Math.exp(-tb * 1.6));
      // 卷曲：给每个粒子一点切向加速度
      const [cx, cy] = p.center, pool = s.pool, dt = ctx.dt, sw = p.swirl;
      for (let i = 0; i < pool.n; i++) { const dx = pool.x[i] - cx, dy = pool.y[i] - cy, d = Math.hypot(dx, dy) + 1; pool.vx[i] += (-dy / d) * sw * 400 * dt; pool.vy[i] += (dx / d) * sw * 400 * dt; }
      pool.update(dt, { drag: p.drag, fade: 0.35, shrink: 0.5 });
      // 配乐：越来越密、音高上升的音（事件走 music 轨）
      const k = FX.clamp(tb / p.arpDuration, 0, 1); const rate = FX.lerp(p.arpRateStart, p.arpRateEnd, k) * (tb < p.arpDuration + 1.2 ? 1 : Math.max(0, 1 - (tb - p.arpDuration - 1.2) / 1.5));
      s.arpAcc += rate * dt;
      while (s.arpAcc >= 1) { s.arpAcc -= 1; const pitch = Math.floor(k * 12) + rng.int(4); ctx.emit({ type: 'arp', pitch, vel: 0.5 + 0.5 * k, x: rng() }); s.arpIdx++; }
    }
  },
  draw(s, ctx, p) {
    const t = ctx.lt; const c = ctx.layers.bg.world(ctx.cam, ctx.px); const line = ctx.palette.line;
    const pre = s.burst ? Math.max(0, 1 - (t - p.burstAt) / 0.9) : 1; // 爆发后线与点淡出
    if (pre > 0) {
      c.globalAlpha = 0.5 * pre; c.strokeStyle = line; c.lineWidth = 1.2 / ctx.cam.zoom;
      for (const l of s.lines) { c.beginPath(); c.moveTo(l.x0, l.y); c.lineTo(l.x1, l.y); c.stroke(); }
      // 中心小圆环随倒数收紧，表现张力
      const k = FX.clamp(t / p.burstAt, 0, 1); const r = 90 - 60 * k * k; c.globalAlpha = (0.35 + 0.5 * k) * pre; c.lineWidth = (1.2 + 1.5 * k) / ctx.cam.zoom; c.beginPath(); c.arc(p.center[0], p.center[1], r, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
      const dp = s.dotPool || (s.dotPool = new FX.ParticlePool(64)); dp.clear();
      for (const d of s.dots) dp.spawn({ x: d.x + Math.sin(t * 0.5 + d.ph) * d.sp, y: d.y + Math.cos(t * 0.4 + d.ph) * d.sp, size: 5, color: [1, 1, 1], alpha: 0.8 * pre, shape: 1 });
      ctx.points(dp, 'alpha');
    }
    if (s.burst) {
      ctx.points(s.pool, 'add');
      // 冲击波圆环（细线，快速扩散淡出）
      const tb = t - p.burstAt; if (tb < 1.2) { c.globalAlpha = 0.6 * (1 - tb / 1.2); c.strokeStyle = line; c.lineWidth = 2.5 / ctx.cam.zoom; c.beginPath(); c.arc(p.center[0], p.center[1], s.ringR, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    }
  },
});
