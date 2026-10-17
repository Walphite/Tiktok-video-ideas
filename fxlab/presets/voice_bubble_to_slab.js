// ============================================================
// 预设 voice_bubble_to_slab：一条标注 60″ 的钴蓝色语音气泡出现，横向展开成板层（宽度对应 60 秒）
// 事件：appear（出现）、expand（展开）
// ============================================================
FX.registerPreset('voice_bubble_to_slab', {
  描述: '钴蓝语音气泡出现，横向展开成板层',
  params: {
    label: '60″',               // 气泡上的时长标注
    appearAt: 0.3, expandAt: 1.9, expandDur: 1.3, // 出现 / 展开时刻与时长（本段秒）
    bubbleW: 320, bubbleH: 76,  // 气泡尺寸
    slabW: 1100, slabH: 54,     // 板层尺寸（宽 = 60 秒）
    cx: 960, slabY: 700,        // 板层中心 x 与底边 y
    blue: '#2F5BEA',
  },
  sounds: {
    appear: { instr: 'chime', track: 'sfx', base: 64, scale: 'pentatonic', decay: 1.2, gain: 0.45 },
    expand: { instr: 'swoosh', track: 'sfx', base: 60, scale: 'chromatic', decay: 1.4, gain: 0.35 },
  },
  init() { return { appeared: false, expanded: false }; },
  step(s, ctx, p) {
    const t = ctx.lt;
    if (!s.appeared && t >= p.appearAt) { s.appeared = true; ctx.emit({ type: 'appear', pitch: 2, vel: 0.8, x: 0.5 }); }
    if (!s.expanded && t >= p.expandAt) { s.expanded = true; ctx.emit({ type: 'expand', pitch: 0, vel: 0.7, x: 0.5 }); }
  },
  // 画板层：其它预设（slab_tower）也复用这个函数保证衔接
  drawSlab(c, p, k, F, label) {
    const w = FX.lerp(p.bubbleW, p.slabW, k), h = FX.lerp(p.bubbleH, p.slabH, k), r = FX.lerp(p.bubbleH * 0.5, 6, k);
    const x = p.cx - w / 2, y = p.slabY - h;
    c.globalAlpha = F; c.fillStyle = p.blue; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.5; c.stroke();
    // 语音气泡的声波图标（三段弧）+ 标注；展开后图标淡出、标注移到右端
    const iconA = 1 - FX.clamp(k * 2, 0, 1);
    if (iconA > 0) { c.globalAlpha = F * iconA; c.strokeStyle = '#FFFFFF'; c.lineWidth = 3; const ix = x + 36, iy = y + h / 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(ix, iy, 8 + i * 9, -0.6, 0.6); c.stroke(); } c.fillStyle = '#FFFFFF'; c.font = `bold 30px ${FX.FONT_SANS}`; c.textBaseline = 'middle'; c.textAlign = 'right'; c.fillText(label, x + w - 26, iy + 1); }
    // 展开后的刻度：0″ … 60″
    const tickA = FX.clamp((k - 0.6) / 0.4, 0, 1);
    if (tickA > 0) { c.globalAlpha = F * tickA * 0.85; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; for (let i = 0; i <= 12; i++) { const tx = x + w * i / 12; c.beginPath(); c.moveTo(tx, y + h); c.lineTo(tx, y + h + (i % 6 === 0 ? 14 : 7)); c.stroke(); }
      c.fillStyle = '#FFFFFF'; c.font = `20px ${FX.FONT_MONO}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText('0″', x, y + h + 36); c.textAlign = 'right'; c.fillText(label, x + w, y + h + 36); }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.globalAlpha = 1;
  },
  draw(s, ctx, p) {
    const t = ctx.lt, F = ctx.fade, c = ctx.layers.bg.world(ctx.cam, ctx.px);
    const pop = FX.prog(t, p.appearAt, p.appearAt + 0.45, 'outBack'); if (pop <= 0) return;
    const k = FX.prog(t, p.expandAt, p.expandAt + p.expandDur, 'inOutQuad');
    c.save(); c.translate(p.cx, p.slabY - p.bubbleH / 2); c.scale(pop, pop); c.translate(-p.cx, -(p.slabY - p.bubbleH / 2));
    this.drawSlab(c, p, k, F, p.label); c.restore();
  },
});
