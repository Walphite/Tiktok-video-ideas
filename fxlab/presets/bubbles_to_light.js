// ============================================================
// 预设 bubbles_to_light：灰色气泡逐个缩成光点熄灭；琥珀色点保留并铺满；计数器滚动定格在「∫ = 1」
// 事件：extinguish（熄灭音，逐个下行）、settle（定格）
// 数学：有理数集测度为零，所以灰气泡「一分不占」；无理数处取 1，积分等于 1
// ============================================================
FX.registerPreset('bubbles_to_light', {
  描述: '灰气泡逐个熄灭，黄点铺满，计数器定格在 ∫ = 1',
  params: {
    grayCount: 120,             // 灰气泡数量
    amberStart: 260,            // 开始时的黄点数
    amberEnd: 1100,             // 铺满时的黄点数
    extinguishStart: 0.6,       // 第一个熄灭的时刻（本段秒）
    extinguishEnd: 6.4,         // 最后一个熄灭的时刻
    counterStart: 1.5,          // 计数器开始滚动
    counterFreeze: 8.0,         // 计数器定格时刻（之后约 0.5 秒静默由场景音乐留空）
    counterText: '∫ = 1',        // 定格文字
    silence: 0.55,              // 定格后先静默多久，再落一声定音
    bubbleW: 34, bubbleH: 22,
    amber: '#E8B931', gray: '#8C929E',
  },
  sounds: {
    extinguish: { instr: 'extinguish', track: 'sfx', base: 86, scale: 'pentatonic', decay: 0.22, gain: 0.3 },
    settle: { instr: 'chime', track: 'sfx', base: 69, scale: 'pentatonic', decay: 1.6, gain: 0.5 },
  },
  init(ctx, p) {
    const rng = ctx.rng; const grays = [], ambers = [];
    for (let i = 0; i < p.grayCount; i++) grays.push({ x: rng.range(120, 1800), y: rng.range(140, 940), ph: rng.range(0, 6.28), order: i });
    // 熄灭顺序打乱，但音高按顺序下行
    const order = grays.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((gi, k) => { grays[gi].tOff = p.extinguishStart + (p.extinguishEnd - p.extinguishStart) * Math.pow(k / (p.grayCount - 1), 0.85); grays[gi].rank = k; });
    for (let i = 0; i < p.amberEnd; i++) ambers.push({ x: rng.range(60, 1860), y: rng.range(80, 1000), ph: rng.range(0, 6.28), vx: rng.gauss() * 6, vy: rng.gauss() * 6, born: i < p.amberStart ? -1 : p.extinguishStart + (p.extinguishEnd + 0.8 - p.extinguishStart) * (i - p.amberStart) / (p.amberEnd - p.amberStart) });
    return { grays, ambers, settled: false, nextOff: 0 };
  },
  step(s, ctx, p) {
    const t = ctx.lt;
    for (const g of s.grays) if (!g.done && t >= g.tOff) { g.done = true; ctx.emit({ type: 'extinguish', pitch: Math.max(0, 9 - Math.floor(g.rank / p.grayCount * 10)), vel: 0.5, x: g.x / 1920 }); }
    for (const a of s.ambers) { a.x += a.vx * ctx.dt; a.y += a.vy * ctx.dt; }
    // 计数器：从 0 滚到 1，定格
    if (t >= p.counterStart && t < p.counterFreeze) { const k = FX.prog(t, p.counterStart, p.counterFreeze, 'outQuad'); const v = k * 0.999; ctx.hud.counter = `∫ = ${v.toFixed(3)}`; }
    else if (t >= p.counterFreeze) { ctx.hud.counter = p.counterText; if (!s.settled && t >= p.counterFreeze + p.silence) { s.settled = true; ctx.emit({ type: 'settle', pitch: 4, vel: 0.8, x: 0.5 }); ctx.hit({ flash: 0.12 }); } }
    else ctx.hud.counter = null;
    if (ctx.fade <= 0.01 && t > p.counterFreeze) ctx.hud.counter = null;
  },
  draw(s, ctx, p) {
    const t = ctx.lt, F = ctx.fade, c = ctx.layers.bg.world(ctx.cam, ctx.px);
    const pool = s.pool || (s.pool = new FX.ParticlePool(p.amberEnd * 2 + p.grayCount * 2)); pool.clear(); const amber = FX.hex(p.amber);
    for (const a of s.ambers) { const born = a.born < 0 ? 1 : FX.prog(t, a.born, a.born + 0.6, 'outCubic'); if (born <= 0) continue; const fl = 0.6 + 0.4 * Math.sin(t * 2 + a.ph); pool.spawn({ x: a.x, y: a.y, size: 24, color: amber, alpha: 0.35 * fl * born * F, shape: 0 }); pool.spawn({ x: a.x, y: a.y, size: 8, color: amber, alpha: fl * born * F, shape: 1 }); }
    c.fillStyle = p.gray;
    for (const g of s.grays) {
      const k = FX.prog(t, g.tOff, g.tOff + 0.45); // 0 完整 → 1 熄灭
      if (k >= 1) continue; const w = p.bubbleW * (1 - k * 0.92), h = p.bubbleH * (1 - k * 0.92);
      c.globalAlpha = F * (0.85 - 0.5 * k); c.beginPath(); c.roundRect(g.x - w / 2, g.y - h / 2, w, h, h * 0.45); c.fill();
      if (k > 0) { pool.spawn({ x: g.x, y: g.y, size: 40 * Math.sin(k * Math.PI), color: [1, 1, 1], alpha: 0.9 * F * Math.sin(k * Math.PI), shape: 0 }); }
    }
    c.globalAlpha = 1; ctx.points(pool, 'add');
  },
});
