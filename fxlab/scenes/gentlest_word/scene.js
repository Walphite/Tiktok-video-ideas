// ============================================================
// 成片场景：《数学里最温柔的一个词》约 64 秒
// 文案全部在同目录 script.json（含 labels 段）；这里只负责「哪个预设、什么时候、什么参数、配乐与光带」
// 时间轴（秒）：0–4 钩子 | 4–19 稠密与可数 | 19–24 黎曼 | 24–32 勒贝格（钞票 + 气泡分堆）| 32–42 结算
//               | 42–56 那一层（灰色细线 + 蓝塔）| 56–64 彩虹爆发（固定 56.0）与收尾
// 不改引擎与既有预设：本幕需要的变体都在下面用「包装预设」实现（调用原预设，再叠加画面）
// ============================================================

// ---------- 手机可读：字幕 / HUD / 计数器整体放大约 1.5 倍（只改本片运行时的版面参数）----------
for (const L of Object.values(FX.layouts)) { L.subSize = Math.round(L.subSize * 1.5); L.hudSize = Math.round(L.hudSize * 1.5); L.counterSize = Math.round(L.counterSize * 1.5); }

const LAB = (k) => { const v = ((FX.Runner.script || {}).labels || {})[k]; if (v == null) throw new Error('script.json 缺少 labels.' + k); return v; };

// 字体放大代理：把原预设里 ≤ maxPx 的小字按 f 倍放大（大标题、印章不动）
function bigFont(f, maxPx) {
  const wrap = (c) => new Proxy(c, {
    get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
    set(t, k, v) { if (k === 'font') v = String(v).replace(/(\d+(?:\.\d+)?)px/, (m, n) => (+n <= maxPx ? +n * f : +n) + 'px'); t[k] = v; return true; },
  });
  const lay = (L) => ({ world: (cam, px) => wrap(L.world(cam, px)), screen: (px) => wrap(L.screen(px)) });
  return (ctx) => { const c2 = Object.create(ctx); c2.layers = { bg: lay(ctx.layers.bg), fg: lay(ctx.layers.fg), ui: lay(ctx.layers.ui) }; return c2; };
}

// 聊天气泡轮廓（缩到很小也看得出：描边 + 尾巴）
function chatBubble(c, x, y, w, h, fill, alpha, text, textAlpha, fontPx, textColor) {
  c.globalAlpha = alpha; c.fillStyle = fill; const r = h * 0.45;
  c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, r); c.fill();
  if (h > 8) { c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.6; c.stroke(); c.beginPath(); c.moveTo(x - w / 2 + r * 0.6, y + h / 2 - 1); c.lineTo(x - w / 2 - r * 0.35, y + h / 2 + r * 0.45); c.lineTo(x - w / 2 + r * 1.3, y + h / 2 - 1); c.fill(); }
  if (text && textAlpha > 0.02) { c.globalAlpha = alpha * textAlpha; c.fillStyle = textColor; c.font = `bold ${fontPx}px ${FX.FONT_SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + fontPx * 0.04); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; }
}
const labelText = (c, text, x, y, size, color, alpha, align) => { c.globalAlpha = alpha; c.fillStyle = color; c.font = `bold ${size}px ${FX.FONT_SERIF}`; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = 10; c.fillText(text, x, y); c.shadowBlur = 0; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.globalAlpha = 1; };

// ============================================================
// A1 dirichlet_chat：灰点始终是聊天气泡（缩小有轮廓，放大有字），图例标注
// ============================================================
{
  const base = FX.presets.dirichlet_field, big = bigFont(1.5, 40);
  FX.registerPreset('dirichlet_chat', Object.assign({}, base, {
    描述: '狄利克雷点阵：灰点 = 聊天气泡（带字），黄点 = 其余时间，带图例',
    params: Object.assign({}, base.params, { chatW0: 46, chatW1: 92, textFrom: 62 }),
    init(ctx, p) { return base.init.call(this, big(ctx), p); },
    step(s, ctx, p) { base.step.call(this, s, big(ctx), p); },
    draw(s, ctx, p) {
      const t = ctx.lt, F = ctx.fade, S = s.S, g = FX.clamp(Math.log(S) / Math.log(81), 0, 1), G = LAB('greetings');
      const bw = FX.lerp(p.chatW0, p.chatW1, g), bh = bw * 0.62, c = ctx.layers.bg.world(ctx.cam, ctx.px), cx = ctx.vw / 2;
      for (const q of s.pts) {
        if (!q.gray) continue; const x = cx + (q.u - p.focus) * S * 1920, y = p.axisY + q.dy; if (x < -60 || x > ctx.vw + 60) continue;
        const fl = 0.55 + 0.45 * Math.sin(t * p.flicker + q.ph), a = Math.min(1, fl * FX.clamp((t - q.birth) / 0.5, 0, 1) * F * 1.15);
        chatBubble(c, x, y, bw, bh, p.gray, a, G[Math.floor(q.ph * 100) % G.length], FX.smoothstep(p.textFrom - 8, p.textFrom + 8, bw), bw * 0.3, '#161922');
      }
      c.globalAlpha = 1;
      base.draw.call(this, s, big(ctx), Object.assign({}, p, { gray: 'rgba(0,0,0,0)', bubbleW: bw, bubbleH: bh })); // 坐标轴、编号、黄点
      // 图例（屏幕固定，右侧留 6% 边距）
      const u = ctx.layers.ui.screen(ctx.px), k = FX.prog(t, 0.8, 1.4, 'outCubic') * F, R = ctx.vw * 0.94;
      if (k > 0) {
        const row = (y, text, col, icon) => { u.font = `bold 38px ${FX.FONT_SERIF}`; const w = u.measureText(text).width; labelText(u, text, R, y, 38, '#FFFFFF', k * 0.95, 'right'); icon(R - w - 50, y); };
        row(196, LAB('legend_gray'), p.gray, (x, y) => chatBubble(u, x, y, 52, 32, p.gray, k, null, 0, 0, null));
        row(256, LAB('legend_amber'), p.amber, (x, y) => { u.globalAlpha = k; u.fillStyle = p.amber; u.shadowColor = p.amber; u.shadowBlur = 18; u.beginPath(); u.arc(x, y, 11, 0, 6.283); u.fill(); u.shadowBlur = 0; });
        u.globalAlpha = 1;
      }
    },
  }));
}

// ============================================================
// A2 banknote_chat_sort：钞票按面额分堆（约 2 秒）→ 钞票上移保留 → 灰气泡也按分量分堆
// ============================================================
{
  const base = FX.presets.banknote_sort, big = bigFont(1.8, 40);
  FX.registerPreset('banknote_chat_sort', Object.assign({}, base, {
    描述: '钞票分堆；随后问候气泡摊成贴地细线，60″ 语音气泡立起一摞',
    params: Object.assign({}, base.params, {
      fieldAt: 999, cutSwitchAt: 999, sortStart: 0.4, sortDur: 1.5, // 钞票约 2 秒分好；不再回点阵
      shrinkAt: 3.4, shrinkDur: 0.8, shrinkScale: 0.85, shrinkBaseY: 300, // 钞票堆上移保留
      bubbleAt: 3.9, bubbleSortAt: 4.6, bubbleMove: 0.8, groundY: 660,
      greetN: 34, voiceN: 6, greetX: [260, 860], voiceX: 1580, voiceStep: 50,
    }),
    sounds: Object.assign({}, base.sounds),
    init(ctx, p) {
      const s = base.init.call(this, ctx, p), rng = ctx.rng, G = LAB('greetings'); s.greet = []; s.voice = [];
      for (let i = 0; i < p.greetN; i++) s.greet.push({ i, text: G[i % G.length], x0: rng.range(300, 1620), y0: rng.range(430, 800), x1: FX.lerp(p.greetX[0], p.greetX[1], (i + 0.5) / p.greetN), delay: rng.range(0, 0.7), ph: rng.range(0, 6.28), landed: false });
      for (let k = 0; k < p.voiceN; k++) s.voice.push({ k, x0: rng.range(900, 1700), y0: rng.range(430, 800), delay: rng.range(0, 0.7), ph: rng.range(0, 6.28), landed: false });
      return s;
    },
    step(s, ctx, p) {
      base.step.call(this, s, ctx, p); const t = ctx.lt;
      for (const g of s.greet) if (!g.landed && t >= p.bubbleSortAt + g.delay + p.bubbleMove) { g.landed = true; if (g.i % 3 === 0) ctx.emit({ type: 'land', pitch: g.i % 4, vel: 0.35, x: g.x1 / 1920 }); }
      for (const v of s.voice) if (!v.landed && t >= p.bubbleSortAt + v.delay + p.bubbleMove) { v.landed = true; ctx.emit({ type: 'land', pitch: 5 + v.k, vel: 0.6, x: p.voiceX / 1920 }); }
    },
    draw(s, ctx, p) {
      const t = ctx.lt, F = ctx.fade, bgL = ctx.layers.bg, kS = FX.prog(t, p.shrinkAt, p.shrinkAt + p.shrinkDur, 'inOutQuad');
      const sc = FX.lerp(1, p.shrinkScale, kS), ty = FX.lerp(640, p.shrinkBaseY, kS), ctx2 = big(ctx), w0 = ctx2.layers.bg.world;
      ctx2.layers.bg = { world: (cam, px) => { const c = w0(cam, px); c.save(); c.translate(960, ty); c.scale(sc, sc); c.translate(-960, -640); return c; } };
      base.draw.call(this, s, ctx2, p); bgL.ctx.restore(); // 钞票与面额标注（跟随上移缩放）
      const c = bgL.world(ctx.cam, ctx.px), appear = FX.prog(t, p.bubbleAt, p.bubbleAt + 0.3) * F; if (appear <= 0) return;
      const gy = p.groundY, mv = (d, a, b) => FX.prog(t, p.bubbleSortAt + d, p.bubbleSortAt + d + p.bubbleMove, 'inOutQuad');
      c.globalAlpha = 0.35 * appear * FX.prog(t, p.bubbleSortAt + 0.6, p.bubbleSortAt + 1.4); c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(200, gy + 3); c.lineTo(1760, gy + 3); c.stroke();
      for (const g of s.greet) { // 问候气泡：摊成贴地细线（高度 ≈ 0）
        const k = mv(g.delay), w = FX.lerp(96, 30, k), h = FX.lerp(60, 3, k), x = FX.lerp(g.x0, g.x1, k), y = FX.lerp(g.y0 + Math.sin(t * 2 + g.ph) * 3, gy - 1.5, k) - Math.sin(k * Math.PI) * 40;
        chatBubble(c, x, y, w, h, '#8C929E', appear * 0.95, g.text, 1 - FX.clamp(k * 2.2, 0, 1), 30, '#161922');
      }
      for (const v of s.voice) { // 60″ 语音气泡：立起一摞
        const k = mv(v.delay), w = FX.lerp(150, 200, k), h = FX.lerp(52, 44, k), x = FX.lerp(v.x0, p.voiceX, k), y1 = gy - 22 - v.k * p.voiceStep, y = FX.lerp(v.y0 + Math.sin(t * 2 + v.ph) * 3, y1, k) - Math.sin(k * Math.PI) * 40;
        chatBubble(c, x, y, w, h, p.denominations[2].color, appear, LAB('voice_tag'), 1, 28, '#FFFFFF');
      }
      const lab = FX.prog(t, p.bubbleSortAt + 1.5, p.bubbleSortAt + 2.0) * appear;
      if (lab > 0) { labelText(c, LAB('sort_greet'), (p.greetX[0] + p.greetX[1]) / 2, gy + 54, 36, '#FFFFFF', lab * 0.95); labelText(c, LAB('sort_voice'), p.voiceX, gy + 54, 36, '#FFFFFF', lab * 0.95); }
    },
  }));
}

// ============================================================
// A3 那一层：蓝塔右移，左侧留灰色问候细线与标注
// ============================================================
{
  const vb = FX.presets.voice_bubble_to_slab, st = FX.presets.slab_tower, big = bigFont(1.5, 40), CX = 1190;
  const wrapP = (base, name, extra) => FX.registerPreset(name, Object.assign({}, base, {
    params: Object.assign({}, base.params, { cx: CX }, extra),
    init(ctx, p) { return base.init.call(this, big(ctx), p); },
    step(s, ctx, p) { base.step.call(this, s, big(ctx), p); },
    draw(s, ctx, p) { base.draw.call(this, s, big(ctx), p); },
  }));
  wrapP(vb, 'voice_bubble_right', {});
  wrapP(st, 'slab_tower_right', { rotEnd: 8.0 });
  FX.registerPreset('tower_with_gray_line', {
    描述: '灰色问候层缩成左侧细线（高度 0）并标注；蓝塔上方标注 60″ × 满格',
    params: { x0: 110, x1: 600, y: 700, drawDur: 1.4, towerLabelY: 205, towerTop: 7 },
    init() { return {}; }, step() {},
    draw(s, ctx, p) {
      const t = ctx.lt, F = ctx.fade, c = ctx.layers.bg.world(ctx.cam, ctx.px), k = FX.prog(t, 0.2, 0.2 + p.drawDur, 'outCubic');
      if (k > 0) {
        c.globalAlpha = 0.95 * F; c.strokeStyle = '#8C929E'; c.lineWidth = 4; c.shadowColor = '#8C929E'; c.shadowBlur = 14; c.beginPath(); c.moveTo(p.x0, p.y); c.lineTo(FX.lerp(p.x0, p.x1, k), p.y); c.stroke(); c.shadowBlur = 0;
        for (let x = p.x0; x < FX.lerp(p.x0, p.x1, k); x += 22) chatBubble(c, x + 8, p.y - 2, 20, 3, '#8C929E', 0.9 * F, null, 0, 0, null); // 细线里一个个压扁的气泡
      }
      const a = FX.prog(t, 1.0, 1.6); if (a > 0) labelText(c, LAB('line_zero'), p.x0, p.y - 56, 36, '#FFFFFF', a * F * 0.95, 'left');
      const b = FX.prog(t, 9.2, 9.9); if (b > 0) labelText(c, LAB('tower_full'), 1190, p.towerLabelY, 42, '#8FB0FF', b * F * 0.95);
    },
  });
}

// ============================================================
// A4 字幕垫底：底部很淡的深色渐变（画在 fg 最上层、字幕之下）
// ============================================================
FX.registerPreset('caption_pad', {
  描述: '底部淡深色渐变，托住字幕',
  params: { from: 0.62, alpha: 0.62 },
  init() { return {}; }, step() {},
  draw(s, ctx, p) { const c = ctx.layers.fg.screen(ctx.px), g = c.createLinearGradient(0, ctx.vh * p.from, 0, ctx.vh); g.addColorStop(0, 'rgba(4,6,12,0)'); g.addColorStop(1, `rgba(4,6,12,${p.alpha})`); c.globalAlpha = 1; c.fillStyle = g; c.fillRect(0, ctx.vh * p.from, ctx.vw, ctx.vh * (1 - p.from)); },
});

// ============================================================
// A5' slab_tower_burst：52–56 塔剥落成粒子并变亮；56.0 亮环冲击波扫过，塔碎成粒子（按层高着色）；
// 57.5–58.5 粒子带着彩色收拢成「几乎处处」，再用 1.5 秒过渡到白金色；光带扫过时字面闪一次彩虹
// 时间标记：爆发点 56.0（BURST_T），上升段 53.0–56.0（RISER），写入事件日志 riser_start / riser / riser_end / burst_marker
// ============================================================
const BURST_T = 56.0, RISER_T0 = 53.0, RISER_T1 = 56.0;
{
  const base = FX.presets.slab_tower_right, bu = FX.presets.burst_rainbow, pt = FX.presets.particle_text;
  const LAGS = [2, 4, 6, 8, 10], M = 11;
  FX.registerPreset('slab_tower_burst', Object.assign({}, base, {
    描述: '蓝塔剥落 → 亮环冲击波碎成按层高着色的粒子 → 带拖尾螺旋飞散 → 彩色收拢成大字 → 白金色',
    params: Object.assign({}, base.params, {
      flakeFrom: 52, flakeRate0: 4, flakeRate1: 80, flakeMax: 800, brightMax: 1.7,
      count: 12000, ringDur: 1.8, ringMax: 2000, ringAlpha: 0.5, ringWidth: 120, caBurst: 7,
      hueLo: 0.0, hueHi: 0.78, speed: [350, 1300], drag: 2.4, spin: [0.9, 2.4],
      gatherAt: 57.5, gatherDur: 1.0, goldAt: 58.5, goldDur: 1.5, gold: [1.0, 0.9, 0.66],
      fontSize: 300, textY: 470, subY: 660, subAt: 58.7, sweepT0: 59.0, sweepDur: 1.8, sweepHalf: 150,
      arpRateStart: 3, arpRateEnd: 22, arpDuration: 3.0,
    }),
    sounds: Object.assign({}, base.sounds, { burst: bu.sounds.burst, swoosh: bu.sounds.swoosh, arp: bu.sounds.arp, arrive: pt.sounds.arrive }),
    init(ctx, p) {
      const s = base.init.call(this, ctx, p); s.flk = new FX.ParticlePool(p.flakeMax); s.fa = 0; s.riserIdx = 0; s.riserOn = false; s.burst = false; s.shat = null; s.cap = null; s.arrived = false; s.arpAcc = 0; s.pool2 = new FX.ParticlePool(p.count * (1 + LAGS.length) + 100);
      s.cy0 = p.slabY - p.layers * p.slabH / 2; return s;
    },
    proj(ctx, p) { const th = Math.PI * FX.prog(ctx.lt, p.rotStart, p.rotEnd, 'inOutSine'), cs = Math.cos(th), sn = Math.sin(th); return (x, y, z) => [p.cx + x * cs - z * sn, p.slabY - y + (x * sn + z * cs) * p.tilt]; },
    ringR(tb, p) { return p.ringMax * FX.ease.outCubic(FX.clamp(tb / p.ringDur, 0, 1)); },
    step(s, ctx, p) {
      base.step.call(this, s, ctx, p); const T = ctx.t, dt = ctx.dt, rng = ctx.rng;
      // ---- 时间标记（上升段 / 爆发点），阶段 B 按这些事件对齐 BGM ----
      if (!s.riserOn && T >= RISER_T0) { s.riserOn = true; ctx.emit({ type: 'riser_start', marker: true, x: 0.5 }); }
      while (T < RISER_T1 && T >= RISER_T0 + s.riserIdx * 0.5) { ctx.emit({ type: 'riser', marker: true, pitch: s.riserIdx, vel: 0.3 + 0.7 * (s.riserIdx / 6), x: 0.5 }); s.riserIdx++; }
      // ---- 52 秒起：板层边缘剥落成细小粒子，缓慢飘浮并逐渐增多 ----
      const P = this.proj(ctx, p), hw = p.slabW / 2, hd = p.depth / 2;
      if (T >= p.flakeFrom && T < BURST_T + 2) {
        const k = FX.prog(T, p.flakeFrom, BURST_T); s.fa += FX.lerp(p.flakeRate0, p.flakeRate1, k * k) * dt; const nl = Math.min(p.layers, s.landed + 1);
        while (s.fa >= 1) { s.fa -= 1; const li = rng.int(nl), y = li * p.slabH + rng() * p.slabH; let x, z;
          if (rng() < 0.45) { x = rng.sign() * hw; z = rng.range(-hd, hd); } else { x = rng.range(-hw, hw); z = rng.sign() * hd; }
          const [sx, sy] = P(x, y, z); s.flk.spawn({ x: sx, y: sy, vx: rng.gauss() * 12 + Math.sign(x) * 8, vy: -rng.range(6, 28), size: rng.range(3, 6.5), color: FX.mix([0.18, 0.36, 0.92], [1, 1, 1], rng.range(0, 0.6)), alpha: rng.range(0.6, 1), life: rng.range(2.5, 4.2), shape: 1 }); }
      }
      s.flk.update(dt, { drag: 0.5, fade: 0.4 });
      // ---- 56.0：亮环冲击波 + 塔碎成粒子 ----
      const tb = T - BURST_T;
      if (!s.burst && T >= BURST_T) {
        s.burst = true; ctx.emit({ type: 'burst_marker', marker: true, x: 0.5 }); ctx.emit({ type: 'riser_end', marker: true, x: 0.5 }); ctx.emit({ type: 'burst', pitch: 0, vel: 1, x: 0.5 }); ctx.emit({ type: 'swoosh', pitch: 0, vel: 0.8, x: 0.5 });
        ctx.hit({ ca: p.caBurst }); // 3 帧左右的轻微色差，不闪白
        const n = p.count, H = p.layers * p.slabH, sh = { n, px: new Float32Array(n), py: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), d: new Float32Array(n), rel: new Uint8Array(n), relT: new Float32Array(n), spin: new Float32Array(n), dur: new Float32Array(n), size0: new Float32Array(n), a0: new Float32Array(n), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), gv: new Float32Array(n), hist: new Float32Array(M * n * 2), hi: 0 };
        const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.font = `bold ${p.fontSize}px ${FX.FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LAB('big_text'), 960, p.textY);
        const img = g.getImageData(0, 0, 1920, 1080).data, cand = []; for (let y = 0; y < 1080; y += 2) for (let x = 0; x < 1920; x += 2) if (img[(y * 1920 + x) * 4 + 3] > 128) cand.push(x, y); const nC = cand.length / 2;
        for (let i = 0; i < n; i++) {
          const y = rng() * H, [sx, sy] = P(rng.range(-hw, hw), y, rng.range(-hd, hd)), li = Math.min(p.layers - 1, Math.floor(y / p.slabH)), c = FX.hsv(FX.lerp(p.hueLo, p.hueHi, li / (p.layers - 1)), 0.85, 1); // 色相 = 所在板层高度（低红 → 高紫）
          sh.px[i] = sx; sh.py[i] = sy; sh.d[i] = Math.hypot(sx - p.cx, sy - s.cy0); sh.spin[i] = rng.sign() * rng.range(p.spin[0], p.spin[1]); sh.size0[i] = rng.range(5, 11); sh.a0[i] = rng.range(0.55, 1); sh.r[i] = c[0]; sh.g[i] = c[1]; sh.b[i] = c[2]; sh.gv[i] = rng();
          const j = rng.int(nC); sh.tx[i] = cand[j * 2] + rng.range(-1, 1); sh.ty[i] = cand[j * 2 + 1] + rng.range(-1, 1); sh.dur[i] = p.gatherDur * rng.range(0.8, 1.2);
        }
        s.shat = sh;
      }
      const sh = s.shat; if (!sh) return;
      const R = this.ringR(tb, p), n = sh.n;
      if (T >= p.gatherAt && !s.cap) s.cap = { t: T, x: Float32Array.from(sh.px), y: Float32Array.from(sh.py), vx: Float32Array.from(sh.vx), vy: Float32Array.from(sh.vy) };
      const drag = Math.exp(-p.drag * dt);
      for (let i = 0; i < n; i++) {
        if (!sh.rel[i]) {
          if (R < sh.d[i]) continue; // 亮环还没到：仍是塔的一部分
          sh.rel[i] = 1; sh.relT[i] = T; const a = Math.atan2(sh.py[i] - s.cy0, sh.px[i] - p.cx) + rng.gauss() * 0.45, sp = FX.lerp(p.speed[0], p.speed[1], Math.pow(rng(), 0.8));
          sh.vx[i] = Math.cos(a) * sp; sh.vy[i] = Math.sin(a) * sp; for (let m = 0; m < M; m++) { sh.hist[(m * n + i) * 2] = sh.px[i]; sh.hist[(m * n + i) * 2 + 1] = sh.py[i]; }
        }
        if (!s.cap) { // 飞散：初速快随后减速，速度方向缓缓旋转（螺旋）
          const w = sh.spin[i] * Math.exp(-(T - sh.relT[i]) * 0.9) * dt, cs = Math.cos(w), sn = Math.sin(w), vx = sh.vx[i], vy = sh.vy[i];
          sh.vx[i] = (vx * cs - vy * sn) * drag; sh.vy[i] = (vx * sn + vy * cs) * drag; sh.px[i] += sh.vx[i] * dt; sh.py[i] += sh.vy[i] * dt;
        } else { // 收拢：从当前位置与速度平滑落到字形目标点
          const D = sh.dur[i], u = FX.clamp((T - s.cap.t) / D, 0, 1), u2 = u * u, u3 = u2 * u;
          sh.px[i] = (2 * u3 - 3 * u2 + 1) * s.cap.x[i] + (u3 - 2 * u2 + u) * s.cap.vx[i] * D + (3 * u2 - 2 * u3) * sh.tx[i]; sh.py[i] = (2 * u3 - 3 * u2 + 1) * s.cap.y[i] + (u3 - 2 * u2 + u) * s.cap.vy[i] * D + (3 * u2 - 2 * u3) * sh.ty[i];
        }
        sh.hist[(sh.hi * n + i) * 2] = sh.px[i]; sh.hist[(sh.hi * n + i) * 2 + 1] = sh.py[i];
      }
      sh.hi = (sh.hi + 1) % M;
      // 爆发后的配乐音（沿用 burst_rainbow 的做法：越来越密、音高上升）
      const kA = FX.clamp(tb / p.arpDuration, 0, 1), rate = FX.lerp(p.arpRateStart, p.arpRateEnd, kA) * (tb < p.arpDuration + 1.2 ? 1 : Math.max(0, 1 - (tb - p.arpDuration - 1.2) / 1.5));
      s.arpAcc += rate * dt; while (s.arpAcc >= 1) { s.arpAcc -= 1; ctx.emit({ type: 'arp', pitch: Math.floor(kA * 12) + rng.int(4), vel: 0.5 + 0.5 * kA, x: rng() }); }
      if (!s.arrived && s.cap && T >= s.cap.t + p.gatherDur * 1.1) { s.arrived = true; ctx.emit({ type: 'arrive', pitch: 4, vel: 0.9, x: 0.5 }); }
    },
    draw(s, ctx, p) {
      const T = ctx.t, tb = T - BURST_T, bgL = ctx.layers.bg, c = bgL.world(ctx.cam, ctx.px), R = this.ringR(tb, p);
      // ---- 塔：亮度缓升；亮环扫过之处塔消失（已变成粒子）----
      if (!(tb >= 0 && R > 900)) {
        const bright = 1 + (p.brightMax - 1) * FX.prog(T, p.flakeFrom, BURST_T, 'inQuad');
        c.save(); if (bright > 1.001) c.filter = `brightness(${bright})`;
        if (tb >= 0) { c.beginPath(); c.rect(-4000, -4000, 9000, 9000); c.arc(p.cx, s.cy0, R, 0, 6.2832); c.clip('evenodd'); }
        base.draw.call(this, s, ctx, p); c.restore();
      }
      ctx.points(s.flk, 'add');
      const sh = s.shat;
      if (sh) {
        const pool = s.pool2, n = sh.n, gold = p.gold, g = FX.prog(T, p.goldAt, p.goldAt + p.goldDur, 'inOutSine'), kk = FX.prog(T, p.sweepT0, p.sweepT0 + p.sweepDur), xb = FX.lerp(300, 1620, kk), gather = s.cap ? FX.prog(T, s.cap.t, s.cap.t + p.gatherDur) : 0;
        pool.clear();
        for (let i = 0; i < n; i++) {
          if (!sh.rel[i]) continue; const age = T - sh.relT[i];
          let r = sh.r[i], gg = sh.g[i], b = sh.b[i];
          if (g > 0) { const w = FX.mix(gold, [1, 1, 1], sh.gv[i] * 0.35); r = FX.lerp(r, w[0], g); gg = FX.lerp(gg, w[1], g); b = FX.lerp(b, w[2], g); }
          if (kk > 0 && kk < 1) { const dx = (sh.px[i] - xb) / p.sweepHalf, wgt = Math.exp(-dx * dx) * 0.95; if (wgt > 0.02) { const rb = FX.hsv(FX.clamp((sh.px[i] - 300) / 1320, 0, 1) * p.hueHi, 0.85, 1); r = FX.lerp(r, rb[0], wgt); gg = FX.lerp(gg, rb[1], wgt); b = FX.lerp(b, rb[2], wgt); } }
          const size = FX.lerp(sh.size0[i], 4.5, gather) * (1 - 0.3 * FX.clamp(age / 3, 0, 1) * (1 - gather)), a = sh.a0[i] * (1 - 0.5 * gather * (1 - g)) * (1 + 0.35 * Math.exp(-age * 6)) * (0.9 + 0.1 * Math.sin(T * 3 + i));
          const col = [r, gg, b]; pool.spawn({ x: sh.px[i], y: sh.py[i], size, color: col, alpha: Math.min(1, a), shape: 1 });
          for (let j = 0; j < LAGS.length; j++) { const slot = (sh.hi - 1 - LAGS[j] + 2 * M) % M, hx = sh.hist[(slot * n + i) * 2], hy = sh.hist[(slot * n + i) * 2 + 1]; if (Math.abs(hx - sh.px[i]) + Math.abs(hy - sh.py[i]) < 1.5) break; pool.spawn({ x: hx, y: hy, size: size * (1 - LAGS[j] * 0.06), color: col, alpha: Math.min(1, a) * 0.5 * (1 - LAGS[j] / 11), shape: 1 }); }
        }
        ctx.points(pool, 'add');
      }
      // ---- 亮环冲击波（亮度上限约 50%）----
      if (tb >= 0 && tb < p.ringDur) {
        const f = ctx.layers.fg.world(ctx.cam, ctx.px), k = tb / p.ringDur, al = p.ringAlpha * Math.pow(1 - k, 1.3), gr = f.createRadialGradient(p.cx, s.cy0, Math.max(0, R - p.ringWidth), p.cx, s.cy0, R + 24);
        gr.addColorStop(0, 'rgba(235,240,255,0)'); gr.addColorStop(0.8, `rgba(235,240,255,${al})`); gr.addColorStop(1, 'rgba(235,240,255,0)'); f.fillStyle = gr; f.fillRect(-1000, -1000, 4000, 3000);
      }
      const ks = FX.prog(T, p.subAt, p.subAt + 0.6, 'outCubic');
      if (ks > 0) { const f = ctx.layers.fg.world(ctx.cam, ctx.px); f.globalAlpha = 0.9 * ks; f.fillStyle = FX.rgbCss(p.gold); f.font = `42px ${FX.FONT_MONO}`; f.textAlign = 'center'; f.fillText(LAB('almost').split('').join(' '), 960, p.subY + (1 - ks) * 10); f.textAlign = 'left'; f.globalAlpha = 1; }
    },
  }));
}

FX.scene({
  name: 'gentlest_word', duration: 64, palette: 'deep_night', seed: 2026,
  post: { bloomStrength: 1.3, bloomThreshold: 0.4, exposure: 1.3, vignette: 0.45, noise: 0.03 },
  // 时间标记（阶段 B 按此对齐 BGM）：爆发点固定 56.0 秒；上升段 53.0–56.0 秒（事件日志里有 riser_start / riser / riser_end / burst_marker）
  markers: { burst: BURST_T, riser: { t0: RISER_T0, t1: RISER_T1 } },
  // 镜头：52–56 缓慢推近（偏向塔中心），爆发后回拉到正常取景
  camera(t, cam) {
    const f = t < 52 ? 0 : t < BURST_T ? FX.ease.inOutSine(FX.prog(t, 52, BURST_T)) : 1 - FX.prog(t, BURST_T, 58.5, 'outCubic'); if (f <= 0) return {};
    return { x: FX.lerp(cam.x, 1170, f * 0.8), y: FX.lerp(cam.y, 500, f * 0.8), zoom: cam.zoom * (1 + 0.18 * f) };
  },
  shots: [
    { preset: 'chat_bubble_storm',      t: 0,    end: 4.3,  fadeOut: 0.5 },
    { preset: 'dirichlet_chat',         t: 3.9,  end: 19.3, fadeIn: 0.6, fadeOut: 0.3, params: { zooms: [{ t0: 0.5, t1: 3.4, factor: 9 }, { t0: 3.9, t1: 6.6, factor: 9 }], numberStart: 7.0, numberRate: 5.5, grayRatio: 0.14, density: 260 } },
    { preset: 'riemann_bars_collapse',  t: 19,   end: 24.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'banknote_chat_sort',     t: 24,   end: 32.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'bubbles_to_light',       t: 32,   end: 42.2, fadeIn: 0.3, fadeOut: 0.4, params: { counterFreeze: 8.0 } },
    { preset: 'voice_bubble_right',     t: 42,   end: 47.5, fadeIn: 0.2 },
    { preset: 'slab_tower_burst',       t: 47.5, end: 64 },
    { preset: 'tower_with_gray_line',   t: 42,   end: 56.8, fadeIn: 0.2, fadeOut: 0.8 },
    { preset: 'caption_pad',            t: 0,    end: 64 },
  ],
  // 每幕至少一次光带扫过（爆发前近乎单色，光带都很淡）
  fx: [
    { t: 1.2,  type: 'sweep', dur: 1.4, angle: -0.6, intensity: 0.18, width: 0.10 },
    { t: 7.0,  type: 'sweep', dur: 1.8, angle: -0.5, intensity: 0.11, width: 0.09 },
    { t: 15.0, type: 'sweep', dur: 1.8, angle: -0.5, intensity: 0.10, width: 0.09 },
    { t: 20.0, type: 'sweep', dur: 1.4, angle: -0.7, intensity: 0.11, width: 0.08 },
    { t: 26.5, type: 'sweep', dur: 1.6, angle: -0.6, intensity: 0.10, width: 0.08 },
    { t: 38.0, type: 'sweep', dur: 1.8, angle: -0.5, intensity: 0.11, width: 0.09, color: '#E8B931' },
    { t: 45.0, type: 'sweep', dur: 1.6, angle: -0.6, intensity: 0.10, width: 0.08, color: '#2F5BEA' },
    { t: 51.0, type: 'sweep', dur: 1.6, angle: -0.6, intensity: 0.09, width: 0.08, color: '#2F5BEA' },
    { t: 59.0, type: 'sweep', dur: 1.8, angle: -0.55, intensity: 0.30, width: 0.10 },
  ],
  // 配乐（numpy 合成的和弦垫 / 低音），音效由各预设的事件产生
  music: { layers: [
    { type: 'pad',   t: 4.0,  end: 19.0, notes: [45, 52, 57],         gain: 0.045, attack: 2.5, release: 1.0 },
    { type: 'drone', t: 19.0, end: 23.8, notes: [33, 34],             gain: 0.06,  attack: 0.8, release: 0.6 },
    { type: 'pad',   t: 24.0, end: 32.0, notes: [45, 52, 57, 59],     gain: 0.05,  attack: 1.2, release: 0.8 },
    { type: 'pad',   t: 32.0, end: 39.9, notes: [45, 52, 57, 64],     gain: 0.06,  attack: 1.5, release: 0.12 },
    { type: 'pad',   t: 40.6, end: 42.0, notes: [57, 64],             gain: 0.04,  attack: 0.4, release: 0.6 },
    { type: 'drone', t: 42.0, end: 56.0, notes: [33, 40],             gain: 0.12,  attack: 2.5, release: 1.5 },
    { type: 'pad',   t: 44.0, end: 56.0, notes: [45, 52, 57],         gain: 0.05,  attack: 2.0, release: 1.5 },
    { type: 'pad',   t: 56.0, end: 60.5, notes: [45, 52, 57, 64, 69], gain: 0.14,  attack: 0.8, release: 3.5 },
  ] },
});
