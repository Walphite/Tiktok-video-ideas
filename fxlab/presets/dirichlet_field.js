// ============================================================
// 预设 dirichlet_field：数轴上的点阵——灰色小气泡（有理数）与芥末黄点（无理数）交错闪烁
// 镜头连续放大，密度不变（放大时在可见区间内补点）；后半段灰气泡逐个标上序号（可数）
// 事件：twinkle（放大时高频细碎闪烁，音高随放大上升）、tick（标序号时节拍器式 tick）
// 数学：画面只表现「任意一小段里两种都有」，黄点比灰点更多，不暗示两者一样多
// ============================================================
FX.registerPreset('dirichlet_field', {
  描述: '数轴点阵，连续放大密度不变，之后灰点逐个编号',
  params: {
    axisY: 560,                 // 数轴的屏幕高度
    bandHalf: 170,              // 点在数轴上下散布的半高
    density: 300,               // 可见区域内保持的点数
    grayRatio: 0.36,            // 灰色（有理数）所占比例
    focus: 0.5 + Math.SQRT2 / 1000, // 放大的中心（一个无理数附近）
    zooms: [{ t0: 1.0, t1: 4.8, factor: 9 }, { t0: 5.6, t1: 9.6, factor: 9 }], // 两次连续放大
    numberStart: 10.2,          // 从本段第几秒开始逐个编号
    numberRate: 5.5,            // 每秒编几个
    twinkleRate: 9,             // 放大期间每秒几声闪烁
    bubbleW: 30, bubbleH: 20,   // 灰色小气泡尺寸（屏幕单位，不随放大改变）
    dotSize: 11,                // 黄点大小
    flicker: 2.2,               // 闪烁速度
    gray: '#8C929E', amber: '#E8B931',
  },
  sounds: {
    twinkle: { instr: 'chime', track: 'sfx', base: 81, scale: 'pentatonic', decay: 0.25, gain: 0.16 },
    tick: { instr: 'tick', track: 'sfx', base: 72, scale: 'chromatic', decay: 0.05, gain: 0.35 },
  },
  init(ctx, p) { return { pts: [], S: 1, labeled: 0, nextLabelT: p.numberStart, twAcc: 0, zoomed: false }; },
  scale(t, p) { let S = 1; for (const z of p.zooms) S *= Math.pow(z.factor, FX.prog(t, z.t0, z.t1, 'inOutSine')); return S; },
  step(s, ctx, p) {
    const t = ctx.lt, rng = ctx.rng; s.S = this.scale(t, p);
    const half = 0.5 / s.S * 1.15, lo = p.focus - half, hi = p.focus + half;
    // 剔除看不见的点，补足密度
    s.pts = s.pts.filter(q => q.u >= lo && q.u <= hi);
    while (s.pts.length < p.density) s.pts.push({ u: rng.range(lo, hi), dy: rng.gauss() * p.bandHalf * 0.5, gray: rng() < p.grayRatio, ph: rng.range(0, 6.28), birth: t, label: 0 });
    // 放大期间：闪烁声，音高随放大程度上升
    const zooming = p.zooms.some(z => t >= z.t0 && t <= z.t1);
    if (zooming) { s.twAcc += p.twinkleRate * ctx.dt; while (s.twAcc >= 1) { s.twAcc -= 1; ctx.emit({ type: 'twinkle', pitch: Math.floor(Math.log(s.S) / Math.log(81) * 9) + rng.int(3), vel: rng.range(0.3, 0.7), x: rng() }); } }
    // 编号阶段：按从左到右的顺序给灰点编号
    if (t >= p.numberStart) {
      while (t >= s.nextLabelT) {
        const cand = s.pts.filter(q => q.gray && !q.label).sort((a, b) => a.u - b.u)[0];
        if (!cand) break; s.labeled++; cand.label = s.labeled; cand.labelT = t;
        ctx.emit({ type: 'tick', pitch: 0, vel: 0.5, x: FX.clamp(0.5 + (cand.u - p.focus) * s.S, 0, 1) }); s.nextLabelT += 1 / p.numberRate;
      }
    }
  },
  draw(s, ctx, p) {
    const t = ctx.lt, c = ctx.layers.bg.screen(ctx.px), cx = ctx.vw / 2, S = s.S, F = ctx.fade;
    const X = (u) => cx + (u - p.focus) * S * 1920;
    // 数轴与刻度：刻度间距随放大自动换挡，端点标数值
    c.globalAlpha = 0.5 * F; c.strokeStyle = ctx.palette.line; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, p.axisY); c.lineTo(ctx.vw, p.axisY); c.stroke();
    let step = 1; while (step * S * 1920 > 520) step /= 10; while (step * S * 1920 < 52) step *= 10;
    const digits = Math.max(0, Math.ceil(-Math.log10(step))); c.font = `16px ${FX.FONT_MONO}`; c.fillStyle = ctx.palette.line; c.textAlign = 'center';
    const u0 = Math.floor((p.focus - 0.6 / S) / step) * step;
    for (let u = u0; u <= p.focus + 0.6 / S; u += step) { const x = X(u); if (x < -20 || x > ctx.vw + 20) continue; const major = Math.abs(u / (step * 10) - Math.round(u / (step * 10))) < 1e-9; c.globalAlpha = (major ? 0.7 : 0.35) * F; c.beginPath(); c.moveTo(x, p.axisY - (major ? 14 : 7)); c.lineTo(x, p.axisY + (major ? 14 : 7)); c.stroke(); if (major) c.fillText(u.toFixed(digits), x, p.axisY + 36); }
    c.textAlign = 'left';
    // 点：灰气泡画在 2D 层，黄点走粒子池（有辉光）
    const pool = s.pool || (s.pool = new FX.ParticlePool(1200)); pool.clear(); const amber = FX.hex(p.amber);
    c.fillStyle = p.gray;
    for (const q of s.pts) {
      const x = X(q.u), y = p.axisY + q.dy; if (x < -40 || x > ctx.vw + 40) continue;
      const fl = 0.55 + 0.45 * Math.sin(t * p.flicker + q.ph), born = FX.clamp((t - q.birth) / 0.5, 0, 1), a = fl * born * F;
      if (q.gray) {
        const w = p.bubbleW, h = p.bubbleH; c.globalAlpha = Math.min(1, a * 1.15); c.fillStyle = p.gray;
        c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, h * 0.45); c.fill();
        c.beginPath(); c.moveTo(x - w / 2 + 6, y + h / 2 - 1); c.lineTo(x - w / 2 + 1, y + h / 2 + 5); c.lineTo(x - w / 2 + 12, y + h / 2 - 1); c.fill();
        if (q.label) { const k = FX.clamp((t - q.labelT) / 0.25, 0, 1); c.globalAlpha = F * k; c.fillStyle = '#FFFFFF'; c.font = `bold 20px ${FX.FONT_MONO}`; c.textAlign = 'center'; c.fillText(String(q.label), x, y - h / 2 - 10); c.textAlign = 'left';
          if (k < 1) { c.globalAlpha = F * (1 - k) * 0.8; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 14 + 26 * k, 0, 6.283); c.stroke(); } }
      } else {
        pool.spawn({ x: ctx.sx(x), y: ctx.sy(y), size: p.dotSize * 2.6, color: amber, alpha: a * 0.5, shape: 0 });
        pool.spawn({ x: ctx.sx(x), y: ctx.sy(y), size: p.dotSize * 0.9, color: amber, alpha: a, shape: 1 });
      }
    }
    c.globalAlpha = 1;
    ctx.points(pool, 'add', 'screen'); // 黄点按屏幕坐标画，与数轴对齐
  },
});
