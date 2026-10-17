// ============================================================
// 预设 banknote_sort：乱序钞票色块按面额分成几摞（勒贝格「数钱」的比喻），
// 然后回到点阵，切法由竖切变成横切
// 事件：land（钞票落到摞上，纸张沙沙声）、cut（切线出现）
// ============================================================
FX.registerPreset('banknote_sort', {
  描述: '乱序钞票按面额归堆，再回到点阵，竖切变横切',
  params: {
    denominations: [            // 面额与颜色（朱红留给印章，不用）
      { value: 1, color: '#8C929E' }, { value: 5, color: '#2E7D5B' }, { value: 10, color: '#2F5BEA' }, { value: 20, color: '#E8B931' },
    ],
    noteCount: 32,              // 钞票张数
    noteW: 150, noteH: 72,      // 钞票尺寸
    sortStart: 0.5, sortDur: 2.0, // 归堆的开始时刻与时长（本段秒）
    stackY: 640,                // 各摞的底部高度
    stackGap: 7,                // 摞内每张的叠放偏移
    fieldAt: 3.0,               // 钞票收起、点阵出现的时刻
    cutSwitchAt: 4.3,           // 竖切 → 横切 的时刻
    left: 320, right: 1600, baseY: 780, topY: 420, // 点阵区域（与黎曼段一致）
    vCuts: 12, hCuts: 4,        // 竖切线数、横切线数
    amber: '#E8B931', gray: '#8C929E',
  },
  sounds: {
    land: { instr: 'paper', track: 'sfx', base: 60, scale: 'chromatic', decay: 0.12, gain: 0.5 },
    cut: { instr: 'blip', track: 'sfx', base: 76, scale: 'pentatonic', decay: 0.15, gain: 0.18 },
  },
  init(ctx, p) {
    const rng = ctx.rng, notes = []; const nd = p.denominations.length;
    const stackX = (k) => 960 + (k - (nd - 1) / 2) * 300;
    const counts = new Array(nd).fill(0);
    for (let i = 0; i < p.noteCount; i++) {
      const d = rng.int(nd); const idx = counts[d]++;
      notes.push({ d, x0: rng.range(300, 1620), y0: rng.range(260, 860), r0: rng.range(-0.5, 0.5), x1: stackX(d) + rng.range(-3, 3), y1: p.stackY - idx * p.stackGap, r1: rng.range(-0.04, 0.04), delay: rng.range(0, 0.9), landed: false, order: i });
    }
    const dots = []; for (let i = 0; i < 60; i++) { dots.push({ u: rng(), top: true, ph: rng.range(0, 6.28) }); dots.push({ u: rng(), top: false, ph: rng.range(0, 6.28) }); }
    return { notes, dots, cutEmitted: 0, stackX, counts };
  },
  step(s, ctx, p) {
    const t = ctx.lt;
    for (const n of s.notes) { const k = FX.prog(t, p.sortStart + n.delay, p.sortStart + n.delay + 0.7); if (!n.landed && k >= 1) { n.landed = true; ctx.emit({ type: 'land', pitch: n.d * 2, vel: 0.6, x: n.x1 / 1920 }); } }
    const cutsNow = t < p.cutSwitchAt ? Math.floor(FX.prog(t, p.fieldAt + 0.3, p.fieldAt + 1.1) * p.vCuts) : p.vCuts + Math.floor(FX.prog(t, p.cutSwitchAt, p.cutSwitchAt + 0.8) * p.hCuts);
    while (s.cutEmitted < cutsNow) { s.cutEmitted++; ctx.emit({ type: 'cut', pitch: s.cutEmitted % 6, vel: 0.4, x: 0.5 }); }
  },
  draw(s, ctx, p) {
    const t = ctx.lt, F = ctx.fade, c = ctx.layers.bg.world(ctx.cam, ctx.px);
    const notesK = 1 - FX.prog(t, p.fieldAt, p.fieldAt + 0.6, 'inCubic'); // 钞票整体淡出
    if (notesK > 0) {
      const appear = FX.prog(t, 0, 0.4, 'outCubic');
      for (const n of s.notes) {
        const k = FX.prog(t, p.sortStart + n.delay, p.sortStart + n.delay + 0.7, 'inOutQuad');
        const x = FX.lerp(n.x0, n.x1, k), y = FX.lerp(n.y0, n.y1, k) - Math.sin(k * Math.PI) * 60, r = FX.lerp(n.r0, n.r1, k);
        c.save(); c.translate(x, y); c.rotate(r); c.globalAlpha = F * appear * notesK; const col = p.denominations[n.d].color;
        c.fillStyle = col; c.fillRect(-p.noteW / 2, -p.noteH / 2, p.noteW, p.noteH);
        c.strokeStyle = 'rgba(10,13,22,0.7)'; c.lineWidth = 2; c.strokeRect(-p.noteW / 2, -p.noteH / 2, p.noteW, p.noteH);
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.strokeRect(-p.noteW / 2 + 8, -p.noteH / 2 + 8, p.noteW - 16, p.noteH - 16);
        c.fillStyle = 'rgba(10,13,22,0.85)'; c.font = `bold 30px ${FX.FONT_SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(p.denominations[n.d].value), 0, 1); c.restore();
      }
      // 每摞下方的面额标签
      const lab = FX.prog(t, p.sortStart + p.sortDur * 0.7, p.sortStart + p.sortDur + 0.3) * notesK;
      if (lab > 0) { c.globalAlpha = F * lab * 0.8; c.fillStyle = ctx.palette.line; c.font = `22px ${FX.FONT_MONO}`; c.textAlign = 'center'; p.denominations.forEach((d, k) => { c.fillText(`${d.value} × ${s.counts[k]}`, s.stackX(k), p.stackY + 60); }); }
      c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.globalAlpha = 1;
    }
    // 点阵（函数图像）与切线
    const fieldK = FX.prog(t, p.fieldAt, p.fieldAt + 0.8, 'outCubic');
    if (fieldK > 0) {
      const W = p.right - p.left; const pool = s.pool || (s.pool = new FX.ParticlePool(300)); pool.clear(); const amber = FX.hex(p.amber), gray = FX.hex(p.gray);
      for (const d of s.dots) { const fl = 0.6 + 0.4 * Math.sin(t * 2.5 + d.ph); pool.spawn({ x: p.left + d.u * W, y: d.top ? p.topY : p.baseY, size: d.top ? 13 : 10, color: d.top ? amber : gray, alpha: fl * F * fieldK * (d.top ? 1 : 0.9), shape: 1 }); }
      ctx.points(pool, 'add');
      c.strokeStyle = ctx.palette.line; c.lineWidth = 1.2 / ctx.cam.zoom;
      // 竖切：黎曼的切法（按 x 分段）
      const vK = t < p.cutSwitchAt ? 1 : 1 - FX.prog(t, p.cutSwitchAt, p.cutSwitchAt + 0.5);
      const vN = Math.floor(FX.prog(t, p.fieldAt + 0.3, p.fieldAt + 1.1) * p.vCuts);
      for (let i = 0; i <= vN && i <= p.vCuts; i++) { const x = p.left + (i / p.vCuts) * W; c.globalAlpha = 0.5 * F * fieldK * vK; c.beginPath(); c.moveTo(x, p.topY - 30); c.lineTo(x, p.baseY + 30); c.stroke(); }
      // 横切：勒贝格的切法（按函数值分层）
      if (t >= p.cutSwitchAt) {
        const hN = Math.floor(FX.prog(t, p.cutSwitchAt, p.cutSwitchAt + 0.8) * p.hCuts);
        for (let i = 1; i <= hN && i <= p.hCuts; i++) { const y = p.baseY - (i / p.hCuts) * (p.baseY - p.topY); c.globalAlpha = 0.55 * F * fieldK; c.beginPath(); c.moveTo(p.left - 40, y); c.lineTo(p.right + 40, y); c.stroke(); }
        c.globalAlpha = 0.6 * F * fieldK * FX.prog(t, p.cutSwitchAt + 0.6, p.cutSwitchAt + 1.0); c.fillStyle = ctx.palette.line; c.font = `20px ${FX.FONT_MONO}`; c.fillText('t', p.right + 56, p.topY + 7);
      }
      c.globalAlpha = 1;
    }
  },
});
