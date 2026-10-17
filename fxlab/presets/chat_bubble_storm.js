// ============================================================
// 预设 chat_bubble_storm：数百个灰色聊天气泡从四面涌向镜头，密到没有缝隙
// 只用通用问候语，没有昵称、头像或截图。第一帧就是满屏（初始化时就把纵深填满）
// 事件：ping（气泡掠过镜头时的细碎提示音，像雨）
// ============================================================
FX.registerPreset('chat_bubble_storm', {
  描述: '灰色问候气泡从四面涌向镜头，密不透风',
  params: {
    count: 460,                 // 同时存在的气泡数
    greetings: ['在吗', '早安', '吃了吗', '睡了吗', '在干嘛', '哈喽', '在吗？', '早', '晚安', '忙吗'],
    speed: 1.0,                 // 涌向镜头的速度（纵深单位/秒）
    zNear: 0.22, zFar: 3.2,     // 纵深范围（越小越近越大）
    focal: 520,                 // 透视焦距（越大气泡越大）
    fontSize: 30,               // 文字大小（纵深 1 处）
    bubble: '#8C929E',          // 气泡颜色（灰 = 有理数）
    text: '#161922',            // 文字颜色
    pingEvery: 5,               // 每几个气泡掠过镜头发一次声
    edgeBias: 0.55,             // 气泡出生位置偏向画面边缘的程度（0 居中，1 全在边缘）
  },
  sounds: { ping: { instr: 'rain', track: 'sfx', base: 86, scale: 'pentatonic', decay: 0.1, gain: 0.4 } },
  init(ctx, p) {
    const rng = ctx.rng, items = [];
    const born = (z) => { const a = rng.range(0, Math.PI * 2), r = Math.pow(rng(), 1 - p.edgeBias) * 1.1 + 0.08; return { x: Math.cos(a) * r * 1.45, y: Math.sin(a) * r, z, text: rng.pick(p.greetings), tint: rng.range(-0.06, 0.06), wob: rng.range(0, 6.28) }; };
    for (let i = 0; i < p.count; i++) items.push(born(rng.range(p.zNear, p.zFar)));
    return { items, passed: 0, born };
  },
  step(s, ctx, p) {
    for (const it of s.items) {
      it.z -= p.speed * ctx.dt;
      if (it.z < p.zNear) { Object.assign(it, s.born(p.zFar)); s.passed++; if (s.passed % p.pingEvery === 0) ctx.emit({ type: 'ping', pitch: ctx.rng.int(6), vel: ctx.rng.range(0.3, 0.7), x: FX.clamp(0.5 + it.x * 0.4, 0, 1) }); }
    }
  },
  draw(s, ctx, p) {
    const c = ctx.layers.fg.screen(ctx.px); const base = FX.hex(p.bubble);
    const cx = ctx.vw / 2, cy = ctx.vh / 2; const items = s.items.slice().sort((a, b) => b.z - a.z);
    c.textBaseline = 'middle'; c.textAlign = 'center';
    for (const it of items) {
      const k = p.focal / (it.z * 400); // 透视缩放
      const sx = cx + it.x * p.focal * 0.9 / it.z * 1.2, sy = cy + it.y * p.focal * 0.9 / it.z * 1.2 + Math.sin(ctx.t * 2 + it.wob) * 3;
      const fs = p.fontSize * k; if (fs < 5) continue;
      c.font = `${fs}px ${FX.FONT_SANS}`; const tw = c.measureText(it.text).width; const w = tw + fs * 1.1, h = fs * 1.75, r = fs * 0.45;
      const depth = FX.clamp((p.zFar - it.z) / (p.zFar - p.zNear), 0, 1); // 远处暗一些
      const col = FX.mix([0.25, 0.27, 0.32], base, 0.35 + 0.65 * depth).map(v => FX.clamp(v + it.tint, 0, 1));
      c.globalAlpha = ctx.fade * (0.75 + 0.25 * depth);
      c.fillStyle = FX.rgbCss(col); c.beginPath(); c.roundRect(sx - w / 2, sy - h / 2, w, h, r); c.fill();
      // 小尾巴（左下）
      c.beginPath(); c.moveTo(sx - w / 2 + r * 0.6, sy + h / 2 - 1); c.lineTo(sx - w / 2 - r * 0.35, sy + h / 2 + r * 0.45); c.lineTo(sx - w / 2 + r * 1.3, sy + h / 2 - 1); c.fill();
      c.fillStyle = p.text; c.fillText(it.text, sx, sy + fs * 0.05);
    }
    c.globalAlpha = 1; c.textAlign = 'left';
  },
});
