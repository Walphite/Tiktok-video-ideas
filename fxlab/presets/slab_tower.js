// ============================================================
// 预设 slab_tower：板层长出高度，一块块叠成钴蓝色的塔，镜头绕塔旋转半圈
// 伪三维：平行投影，绕竖轴旋转 θ，顶面/侧面按角度明暗
// 事件：layer（每升一层加一个音，逐层上升）、chord（塔成落一个和弦）
// ============================================================
FX.registerPreset('slab_tower', {
  描述: '板层叠成钴蓝塔，镜头绕塔转半圈，每层一个音',
  params: {
    layers: 8,                  // 层数
    firstAt: 0.5, gap: 0.5,     // 第一层落下的时刻与层间隔（本段秒）
    dropDur: 0.35,              // 每层落下用时
    rotStart: 0.8, rotEnd: 6.2, // 旋转半圈的起止时刻
    slabW: 1100, slabH: 54, depth: 160, // 板层宽（60 秒）、高、进深
    cx: 960, slabY: 700,        // 塔底中心（与 voice_bubble_to_slab 一致）
    tilt: 0.26,                 // 俯视程度（0 平视）
    label: '60″',
    blue: '#2F5BEA',
  },
  sounds: {
    layer: { instr: 'pluck', track: 'sfx', base: 45, scale: 'major', decay: 1.1, gain: 0.5 },
    chord: { instr: 'chord', track: 'music', base: 45, scale: 'major', decay: 2.8, gain: 0.6 },
  },
  init() { return { landed: 0, chord: false }; },
  step(s, ctx, p) {
    const t = ctx.lt;
    while (s.landed < p.layers - 1 && t >= p.firstAt + s.landed * p.gap + p.dropDur) { s.landed++; ctx.emit({ type: 'layer', pitch: s.landed + 1, vel: 0.7, x: 0.5 }); ctx.hit({ shake: 3 }); }
    if (!s.chord && s.landed >= p.layers - 1 && t >= p.firstAt + (p.layers - 2) * p.gap + p.dropDur + 0.35) { s.chord = true; ctx.emit({ type: 'chord', notes: [45, 52, 57, 61, 64], vel: 1, x: 0.5 }); ctx.hit({ flash: 0.1, shake: 2 }); }
  },
  draw(s, ctx, p) {
    const t = ctx.lt, F = ctx.fade, c = ctx.layers.bg.world(ctx.cam, ctx.px);
    const th = Math.PI * FX.prog(t, p.rotStart, p.rotEnd, 'inOutSine'); const cs = Math.cos(th), sn = Math.sin(th);
    // 投影：世界 (x 横, y 高, z 进深) → 屏幕
    const P = (x, y, z) => [p.cx + x * cs - z * sn, p.slabY - y + (x * sn + z * cs) * p.tilt];
    const base = FX.hex(p.blue);
    const shade = (k) => FX.rgbCss(base.map(v => FX.clamp(v * k, 0, 1)));
    const hw = p.slabW / 2, hd = p.depth / 2;
    const drawBox = (y0, h, alpha) => {
      // 四个侧面按法线朝向排序，先画背面再画前面；再画顶面
      const faces = [
        { n: [0, 1], pts: [[-hw, hd], [hw, hd]] }, { n: [1, 0], pts: [[hw, hd], [hw, -hd]] }, { n: [0, -1], pts: [[hw, -hd], [-hw, -hd]] }, { n: [-1, 0], pts: [[-hw, -hd], [-hw, hd]] },
      ];
      const facing = (f) => f.n[0] * sn * p.tilt + f.n[1] * cs * p.tilt; // 朝向镜头的程度（近似）
      faces.sort((a, b) => facing(a) - facing(b));
      c.globalAlpha = alpha;
      for (const f of faces) {
        const [a, b] = f.pts; const light = 0.55 + 0.45 * FX.clamp((f.n[0] * cs - f.n[1] * sn) * 0.5 + 0.5, 0, 1);
        const p1 = P(a[0], y0, a[1]), p2 = P(b[0], y0, b[1]), p3 = P(b[0], y0 + h, b[1]), p4 = P(a[0], y0 + h, a[1]);
        c.fillStyle = shade(light * 0.8); c.beginPath(); c.moveTo(...p1); c.lineTo(...p2); c.lineTo(...p3); c.lineTo(...p4); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.stroke();
      }
      const tp = [P(-hw, y0 + h, -hd), P(hw, y0 + h, -hd), P(hw, y0 + h, hd), P(-hw, y0 + h, hd)];
      c.fillStyle = shade(1.25); c.beginPath(); c.moveTo(...tp[0]); for (const q of tp.slice(1)) c.lineTo(...q); c.closePath(); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke();
    };
    for (let i = 0; i < p.layers; i++) {
      let y = i * p.slabH, alpha = F, h = p.slabH;
      if (i > 0) { const t0 = p.firstAt + (i - 1) * p.gap; const k = FX.prog(t, t0, t0 + p.dropDur, 'inQuad'); if (k <= 0) continue; y = i * p.slabH + (1 - k) * 260; alpha = F * Math.min(1, k * 3); const sq = t > t0 + p.dropDur ? 1 - 0.12 * Math.sin(Math.PI * FX.prog(t, t0 + p.dropDur, t0 + p.dropDur + 0.22)) : 1; h = p.slabH * sq; }
      drawBox(y, h, alpha);
    }
    // 宽度标注（60″）与高度标注（分量）
    c.globalAlpha = F * 0.85; c.fillStyle = '#FFFFFF'; c.font = `20px ${FX.FONT_MONO}`; c.textAlign = 'center';
    const lb = P(0, -40, hd); c.fillText(p.label, lb[0], lb[1]); c.textAlign = 'left';
    const hk = FX.prog(t, p.firstAt + 2 * p.gap, p.firstAt + 3 * p.gap); if (hk > 0) { const topY = Math.min(p.layers, s.landed + 1) * p.slabH; const side = th < Math.PI / 2 ? -1 : 1; const a = P(side * (hw + 60), 0, 0), b = P(side * (hw + 60), topY, 0); c.globalAlpha = F * hk * 0.85; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.font = `22px ${FX.FONT_SERIF}`; c.textAlign = side < 0 ? 'right' : 'left'; c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 8; c.fillText('高度 = 分量', b[0] + side * 14, (a[1] + b[1]) / 2 + 8); c.shadowBlur = 0; c.textAlign = 'left'; }
    c.globalAlpha = 1;
  },
});
