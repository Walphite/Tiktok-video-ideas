// ============================================================
// 预设 particle_text：粒子起飞，拼成大字；下方小字；静止
// 目标点由离屏画布把文字栅格化后采样得到，采样顺序由固定种子决定
// 事件：liftoff（起飞，气声）、arrive（基本成形时一声）
// ============================================================
FX.registerPreset('particle_text', {
  描述: '两万粒子飞起拼成大字',
  params: {
    text: '几乎处处',             // 大字
    subText: 'almost everywhere', // 下方小字
    fontSize: 300,              // 大字字号
    textY: 470,                 // 大字中心高度
    subY: 660,                  // 小字基线高度
    subAt: 3.0,                 // 小字出现时刻（本段秒）
    count: 20000,               // 粒子数
    from: [960, 760, 700, 220], // 起飞区域：中心 x、中心 y、半宽、半高
    flyStart: 0.15, flyDur: 2.0, stagger: 1.0, // 起飞时刻、单粒子飞行时长、错开范围
    colors: [['#FFFFFF', 0.62], ['#E8B931', 0.25], ['#2F5BEA', 0.13]], // 颜色与权重
    size: 5,                    // 粒子大小
    twinkle: 0.35,              // 成形后的闪烁幅度
  },
  sounds: {
    liftoff: { instr: 'swoosh', track: 'sfx', base: 60, scale: 'chromatic', decay: 2.4, gain: 0.4 },
    arrive: { instr: 'chime', track: 'sfx', base: 69, scale: 'pentatonic', decay: 2.0, gain: 0.45 },
  },
  init(ctx, p) {
    const rng = ctx.rng;
    // 文字栅格化 → 目标点
    const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.font = `bold ${p.fontSize}px ${FX.FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.text, 960, p.textY);
    const img = g.getImageData(0, 0, 1920, 1080).data; const cand = [];
    for (let y = 0; y < 1080; y += 2) for (let x = 0; x < 1920; x += 2) if (img[(y * 1920 + x) * 4 + 3] > 128) cand.push(x, y);
    const nC = cand.length / 2; const pool = new FX.ParticlePool(p.count);
    const cols = p.colors.map(([h, w]) => [FX.hex(h), w]); const wsum = cols.reduce((a, c) => a + c[1], 0);
    const pts = [];
    for (let i = 0; i < p.count; i++) {
      const j = rng.int(nC); const tx = cand[j * 2] + rng.range(-1, 1), ty = cand[j * 2 + 1] + rng.range(-1, 1);
      const sx = p.from[0] + rng.gauss() * p.from[2] * 0.5, sy = p.from[1] + rng.gauss() * p.from[3] * 0.5;
      let r = rng() * wsum, col = cols[0][0]; for (const [cc, w] of cols) { if (r < w) { col = cc; break; } r -= w; }
      const delay = p.flyStart + p.stagger * FX.clamp((tx - 400) / 1120, 0, 1) * 0.7 + rng() * p.stagger * 0.3;
      pts.push({ sx, sy, tx, ty, delay, ph: rng.range(0, 6.28), cx: rng.gauss() * 120, cy: rng.gauss() * 80 });
      pool.spawn({ x: sx, y: sy, size: p.size * rng.range(0.7, 1.4), color: col, alpha: 0 });
    }
    return { pts, pool, lifted: false, arrived: false };
  },
  step(s, ctx, p) {
    const t = ctx.lt;
    if (!s.lifted && t >= p.flyStart) { s.lifted = true; ctx.emit({ type: 'liftoff', pitch: 0, vel: 0.8, x: 0.5 }); }
    if (!s.arrived && t >= p.flyStart + p.stagger + p.flyDur * 0.8) { s.arrived = true; ctx.emit({ type: 'arrive', pitch: 4, vel: 0.9, x: 0.5 }); ctx.hit({ flash: 0.08 }); }
    const pool = s.pool;
    for (let i = 0; i < s.pts.length; i++) {
      const q = s.pts[i]; const k = FX.prog(t, q.delay, q.delay + p.flyDur, 'inOutQuad'); const arc = Math.sin(k * Math.PI);
      pool.x[i] = FX.lerp(q.sx, q.tx, k) + q.cx * arc; pool.y[i] = FX.lerp(q.sy, q.ty, k) + q.cy * arc - 160 * arc;
      const vis = FX.clamp((t - q.delay + 0.3) / 0.3, 0, 1); pool.a[i] = vis * (0.75 + p.twinkle * Math.sin(t * 3 + q.ph) * k) * ctx.fade;
    }
  },
  draw(s, ctx, p) {
    const t = ctx.lt; ctx.points(s.pool, 'add');
    const k = FX.prog(t, p.subAt, p.subAt + 0.6, 'outCubic');
    if (k > 0) { const c = ctx.layers.fg.world(ctx.cam, ctx.px); c.globalAlpha = 0.85 * k * ctx.fade; c.fillStyle = ctx.palette.text; c.font = `28px ${FX.FONT_MONO}`; c.textAlign = 'center'; c.fillText(p.subText.split('').join(' '), 960, p.subY + (1 - k) * 10); c.textAlign = 'left'; c.globalAlpha = 1; }
  },
});
