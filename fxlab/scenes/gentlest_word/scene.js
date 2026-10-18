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
        const k = mv(g.delay), w = FX.lerp(96, 34, k), h = FX.lerp(60, 16, k), x = FX.lerp(g.x0, g.x1, k), y = FX.lerp(g.y0 + Math.sin(t * 2 + g.ph) * 3, gy - 8, k) - Math.sin(k * Math.PI) * 40;
        chatBubble(c, x, y, w, h, '#8C929E', appear * 0.95, g.text, 1 - FX.clamp(k * 2.2, 0, 1), 30, '#161922');
      }
      for (const v of s.voice) { // 60″ 语音气泡：立起一摞
        const k = mv(v.delay), w = FX.lerp(150, 200, k), h = FX.lerp(52, 44, k), x = FX.lerp(v.x0, p.voiceX, k), y1 = gy - 22 - v.k * p.voiceStep, y = FX.lerp(v.y0 + Math.sin(t * 2 + v.ph) * 3, y1, k) - Math.sin(k * Math.PI) * 40;
        chatBubble(c, x, y, w, h, p.denominations[2].color, appear, LAB('voice_tag'), 1, 28, '#FFFFFF');
      }
      const lab = FX.prog(t, p.bubbleSortAt + 1.5, p.bubbleSortAt + 2.0) * appear;
      if (lab > 0) { labelText(c, LAB('sort_greet'), (p.greetX[0] + p.greetX[1]) / 2, gy + 54, 36, '#FFFFFF', lab * 0.95); labelText(c, LAB('sort_count'), (p.greetX[0] + p.greetX[1]) / 2, gy - 48, 40, '#C9CED8', lab * 0.95); labelText(c, LAB('sort_voice'), p.voiceX, gy + 54, 36, '#FFFFFF', lab * 0.95); }
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
  draw(s, ctx, p) { const c = ctx.layers.fg.screen(ctx.px), g = c.createLinearGradient(0, ctx.vh * p.from, 0, ctx.vh); g.addColorStop(0, 'rgba(4,6,12,0)'); g.addColorStop(1, `rgba(4,6,12,${p.alpha})`); c.globalAlpha = ctx.fade; c.fillStyle = g; c.fillRect(0, ctx.vh * p.from, ctx.vw, ctx.vh * (1 - p.from)); },
});

// ============================================================
// 收尾段 slab_tower_finale（44–64 秒）
//   50–56 塔逐层点亮为光谱色（低暖红橙 → 高冷青紫），每层上浮并泛光，节奏逐层加快（每层一个事件标记 layer_light）
//   56.0 化尘开始：塔从顶层起逐层碎成发光粒子，保留层色，萤火般缓慢上飘（不爆炸、不白闪、不加环）
//   58–60 粒子带短拖尾沿弧线汇聚成「几乎处处」；60.0 起约 1.5 秒过渡成白金色，留极淡彩边；光带扫过时整行字闪一次彩虹渐变
//   镜头不推近：塔只做 ±8° 的极缓横向环绕；整体亮度压在 60% 以内（见 lumCap）
// ============================================================
const DUST_T = 56.0, LIGHT_T = [300, 309, 316, 321, 325, 328, 331, 333].map(v => v / 6); // 50.0 … 55.5，落在 1/6 秒网格上（24fps 与 30fps 都精确对齐）
{
  const base = FX.presets.slab_tower_right, pt = FX.presets.particle_text, big = bigFont(1.5, 40);
  const specColor = (i, n, v) => FX.hsv(FX.lerp(0.02, 0.76, i / (n - 1)), 0.78, v);
  FX.registerPreset('slab_tower_finale', Object.assign({}, base, {
    描述: '塔逐层点亮 → 逐层化尘上飘 → 弧线汇聚成大字 → 白金色',
    params: Object.assign({}, base.params, {
      orbitBase: 0.2, orbitAmp: 0.14, orbitPeriod: 14, orbitFrom: 48.3, // 斜侧视角中心约 11°，±8° 缓慢环绕
      litDur: 0.45, lift: 14, dustPer: 1700, dissolveGap: 0.2, dissolveDur: 0.45,
      gatherAt: 58.0, gatherDelay: 0.4, gatherDur: [1.2, 1.6], bow: 70,
      goldAt: 60.0, goldDur: 1.5, gold: [1.0, 0.9, 0.66], fringe: 0.1,
      fontSize: 300, textY: 470, subY: 660, subAt: 60.2, sweepT0: 60.4, sweepDur: 1.8, sweepHalf: 230,
      lumFrom: 46, lumTo: 50, exposure: 0.82, bloom: 0.9,
    }),
    sounds: Object.assign({}, base.sounds, { arrive: pt.sounds.arrive }),
    init(ctx, p) {
      const s = base.init.call(this, ctx, p), rng = ctx.rng, L = p.layers, n = L * p.dustPer, cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.font = `bold ${p.fontSize}px ${FX.FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LAB('big_text'), 960, p.textY);
      const img = g.getImageData(0, 0, 1920, 1080).data, cand = []; for (let y = 0; y < 1080; y += 2) for (let x = 0; x < 1920; x += 2) if (img[(y * 1920 + x) * 4 + 3] > 128) cand.push(x, y); const nC = cand.length / 2;
      const F32 = () => new Float32Array(n), d = { n, u: F32(), v: F32(), w: F32(), x0: F32(), y0: F32(), vy: F32(), ph: F32(), dly: F32(), size: F32(), a0: F32(), tx: F32(), ty: F32(), gd: F32(), gdur: F32(), bow: F32(), gv: F32(), on: new Uint8Array(n) };
      for (let i = 0; i < n; i++) { d.u[i] = rng.range(-1, 1); d.v[i] = rng(); d.w[i] = rng.range(-1, 1); d.vy[i] = rng.range(18, 55); d.ph[i] = rng.range(0, 6.28); d.dly[i] = rng.range(0, p.dissolveDur); d.size[i] = rng.range(3.5, 7); d.a0[i] = rng.range(0.32, 0.62); const j = rng.int(nC); d.tx[i] = cand[j * 2] + rng.range(-1, 1); d.ty[i] = cand[j * 2 + 1] + rng.range(-1, 1); d.gd[i] = rng.range(0, p.gatherDelay); d.gdur[i] = rng.range(p.gatherDur[0], p.gatherDur[1]); d.bow[i] = rng.sign() * rng.range(0.3, 1) * p.bow; d.gv[i] = rng(); }
      s.dust = d; s.lit = new Uint8Array(L); s.dis = new Uint8Array(L); s.arrived = false; s.pool2 = new FX.ParticlePool(n * 5 + 100); s.dustMark = false; s.cy0 = p.slabY - L * p.slabH / 2; return s;
    },
    dissolveT(i, p) { return DUST_T + (p.layers - 1 - i) * p.dissolveGap; },
    theta(T, p) { const k = FX.prog(T, p.orbitFrom, p.orbitFrom + 2.7, 'inOutSine'); return p.orbitBase * k + p.orbitAmp * Math.sin(2 * Math.PI * (T - p.orbitFrom) / p.orbitPeriod) * FX.prog(T, p.orbitFrom, p.orbitFrom + 2.7); },
    proj(T, p) { const th = this.theta(T, p), cs = Math.cos(th), sn = Math.sin(th); return (x, y, z) => [p.cx + x * cs - z * sn, p.slabY - y + (x * sn + z * cs) * p.tilt]; },
    layerColor(i, p, v) { return specColor(i, p.layers, v); },
    step(s, ctx, p) {
      base.step.call(this, s, ctx, p); const T = ctx.t, d = s.dust, L = p.layers;
      // 整体亮度上限：50 秒起压低曝光与泛光（只在本段生效，前面不动）
      const lk = FX.prog(T, p.lumFrom, p.lumTo), P = FX.Runner.post; if (lk > 0) { P.exposure = FX.lerp(1.3, p.exposure, lk); P.bloomStrength = FX.lerp(1.3, p.bloom, lk); }
      // 事件标记：每层点亮一个 layer_light（阶段 B 让音阶逐级上行）；56.0 化尘开始 dust_start；每层化尘一个 layer_dust
      for (let i = 0; i < L; i++) {
        if (!s.lit[i] && T >= LIGHT_T[i]) { s.lit[i] = 1; ctx.emit({ type: 'layer_light', marker: true, pitch: i, vel: 0.5 + 0.5 * i / (L - 1), x: 0.5 }); }
        if (!s.dis[i] && T >= this.dissolveT(i, p)) {
          s.dis[i] = 1; ctx.emit({ type: 'layer_dust', marker: true, pitch: L - 1 - i, x: 0.5 }); const P2 = this.proj(T, p), hw = p.slabW / 2, hd = p.depth / 2;
          for (let k = i * p.dustPer; k < (i + 1) * p.dustPer; k++) { const [sx, sy] = P2(d.u[k] * hw, (i + d.v[k]) * p.slabH, d.w[k] * hd); d.x0[k] = sx; d.y0[k] = sy; d.on[k] = 1; }
        }
      }
      if (!s.dustMark && T >= DUST_T) { s.dustMark = true; ctx.emit({ type: 'dust_start', marker: true, x: 0.5 }); }
      if (!s.arrived && T >= p.goldAt) { s.arrived = true; ctx.emit({ type: 'arrive', pitch: 4, vel: 0.9, x: 0.5 }); }
    },
    // 粒子在时刻 T 的位置（解析式：先萤火上飘，再沿弧线汇聚）。返回 [x, y, u]，u 为聚字进度
    pos(d, i, T, ts, p) {
      const tl = Math.max(0, T - ts), wob = 10, fx = d.x0[i] + Math.sin(T * 0.9 + d.ph[i]) * wob, fy = d.y0[i] - d.vy[i] * tl, Tg = p.gatherAt + d.gd[i];
      if (T <= Tg) return [fx, fy, 0];
      const D = d.gdur[i], u = FX.clamp((T - Tg) / D, 0, 1), sx = d.x0[i] + Math.sin(Tg * 0.9 + d.ph[i]) * wob, sy = d.y0[i] - d.vy[i] * Math.max(0, Tg - ts), vx = Math.cos(Tg * 0.9 + d.ph[i]) * wob * 0.9, vy = -d.vy[i];
      const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = 3 * u2 - 2 * u3, ex = d.tx[i] - sx, ey = d.ty[i] - sy, el = Math.hypot(ex, ey) + 1e-6, bw = Math.sin(Math.PI * u) * d.bow[i];
      return [h00 * sx + h10 * vx * D + h01 * d.tx[i] - ey / el * bw, h00 * sy + h10 * vy * D + h01 * d.ty[i] + ex / el * bw, u];
    },
    draw(s, ctx, p) {
      const T = ctx.t, F = ctx.fade, lt = ctx.lt, L = p.layers, c = big(ctx).layers.bg.world(ctx.cam, ctx.px), th = this.theta(T, p), cs = Math.cos(th), sn = Math.sin(th);
      const Pj = (x, y, z) => [p.cx + x * cs - z * sn, p.slabY - y + (x * sn + z * cs) * p.tilt], hw = p.slabW / 2, hd = p.depth / 2, blue = FX.hex(p.blue);
      const css = (col, k) => FX.rgbCss(col.map(v => FX.clamp(v * k, 0, 1)));
      const drawBox = (y0, h, alpha, col, glow) => {
        const faces = [{ n: [0, 1], pts: [[-hw, hd], [hw, hd]] }, { n: [1, 0], pts: [[hw, hd], [hw, -hd]] }, { n: [0, -1], pts: [[hw, -hd], [-hw, -hd]] }, { n: [-1, 0], pts: [[-hw, -hd], [-hw, hd]] }];
        faces.sort((a, b) => (a.n[0] * sn + a.n[1] * cs) * p.tilt - (b.n[0] * sn + b.n[1] * cs) * p.tilt); c.globalAlpha = alpha;
        if (glow > 0) { c.shadowColor = css(col, 1); c.shadowBlur = 26 * ctx.px * glow; }
        for (const f of faces) {
          const [a, b] = f.pts, light = 0.55 + 0.45 * FX.clamp((f.n[0] * cs - f.n[1] * sn) * 0.5 + 0.5, 0, 1), p1 = Pj(a[0], y0, a[1]), p2 = Pj(b[0], y0, b[1]), p3 = Pj(b[0], y0 + h, b[1]), p4 = Pj(a[0], y0 + h, a[1]);
          c.fillStyle = css(col, light * 0.8); c.beginPath(); c.moveTo(...p1); c.lineTo(...p2); c.lineTo(...p3); c.lineTo(...p4); c.closePath(); c.fill(); c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.stroke();
        }
        const tp = [Pj(-hw, y0 + h, -hd), Pj(hw, y0 + h, -hd), Pj(hw, y0 + h, hd), Pj(-hw, y0 + h, hd)]; c.fillStyle = css(col, 1.25); c.beginPath(); c.moveTo(...tp[0]); for (const q of tp.slice(1)) c.lineTo(...q); c.closePath(); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke();
      };
      let topY = 0, any = false;
      for (let i = 0; i < L; i++) {
        let y = i * p.slabH, alpha = F, h = p.slabH;
        if (i > 0) { const t0 = p.firstAt + (i - 1) * p.gap, k = FX.prog(lt, t0, t0 + p.dropDur, 'inQuad'); if (k <= 0) continue; y = i * p.slabH + (1 - k) * 260; alpha = F * Math.min(1, k * 3); const sq = lt > t0 + p.dropDur ? 1 - 0.12 * Math.sin(Math.PI * FX.prog(lt, t0 + p.dropDur, t0 + p.dropDur + 0.22)) : 1; h = p.slabH * sq; }
        const dk = FX.prog(T, this.dissolveT(i, p), this.dissolveT(i, p) + p.dissolveDur); if (dk >= 1) continue; any = true; topY = Math.max(topY, (i + 1) * p.slabH);
        const litK = FX.prog(T, LIGHT_T[i], LIGHT_T[i] + p.litDur, 'outCubic'), lift = p.lift * Math.sin(Math.PI * FX.prog(T, LIGHT_T[i], LIGHT_T[i] + 0.6)), col = FX.mix(blue, this.layerColor(i, p, 0.62), litK);
        drawBox(y + lift + dk * 8, h, alpha * (1 - dk), col, litK * (1 - dk) * (1 - FX.prog(T, LIGHT_T[i] + 0.5, LIGHT_T[i] + 1.4) * 0.5));
      }
      // 宽度标注（60″）与高度标注（分量），塔化尘后淡出
      const lab = 1 - FX.prog(T, DUST_T, DUST_T + 0.6);
      if (lab > 0 && any) {
        c.globalAlpha = F * 0.85 * lab; c.fillStyle = '#FFFFFF'; c.font = `30px ${FX.FONT_MONO}`; c.textAlign = 'center'; const lb = Pj(0, -40, hd); c.fillText(p.label, lb[0], lb[1]); c.textAlign = 'left';
        const hk = FX.prog(lt, p.firstAt + 2 * p.gap, p.firstAt + 3 * p.gap); if (hk > 0) { const side = th < Math.PI / 2 ? -1 : 1, a = Pj(side * (hw + 60), 0, 0), b = Pj(side * (hw + 60), Math.min(L, s.landed + 1) * p.slabH, 0); c.globalAlpha = F * hk * 0.85 * lab; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.font = `33px ${FX.FONT_SERIF}`; c.textAlign = side < 0 ? 'right' : 'left'; c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 8; c.fillText('高度 = 分量', b[0] + side * 14, (a[1] + b[1]) / 2 + 8); c.shadowBlur = 0; c.textAlign = 'left'; }
      }
      c.globalAlpha = 1;
      // ---- 粒子：萤火上飘 → 汇聚成字 ----
      const d = s.dust; if (T < DUST_T) return;
      const pool = s.pool2, g = FX.prog(T, p.goldAt, p.goldAt + p.goldDur, 'inOutSine'), kk = FX.prog(T, p.sweepT0, p.sweepT0 + p.sweepDur), xb = FX.lerp(300, 1620, kk), dtf = ctx.dt; pool.clear();
      for (let i = 0; i < d.n; i++) {
        if (!d.on[i]) continue; const li = Math.floor(i / p.dustPer), ts = this.dissolveT(li, p), vis = FX.prog(T, ts + d.dly[i], ts + d.dly[i] + 0.3); if (vis <= 0) continue;
        const [x, y, u] = this.pos(d, i, T, ts, p); let col = this.layerColor(li, p, 1);
        if (g > 0) { const w = FX.mix(p.gold, [1, 1, 1], d.gv[i] * 0.35); col = FX.mix(col, w, g); }
        if (kk > 0 && kk < 1) { const dx = (x - xb) / p.sweepHalf, wgt = Math.exp(-dx * dx) * 0.95; if (wgt > 0.02) col = FX.mix(col, FX.hsv(FX.clamp(0.5 + (x - xb) / (2 * p.sweepHalf), 0, 1) * 0.76, 0.9, 1), wgt); }
        const a = d.a0[i] * vis * (0.85 + 0.15 * Math.sin(T * 3 + d.ph[i])), size = d.size[i] * (1 - 0.35 * u);
        pool.spawn({ x, y, size, color: col, alpha: a, shape: 1 });
        if (i % 4 === 0) pool.spawn({ x, y, size: size * 3.2, color: this.layerColor(li, p, 1), alpha: p.fringe * vis * (u > 0.99 ? 1 : 0.7), shape: 0 }); // 柔光 / 极淡彩边
        if (u > 0 && u < 1) for (const lag of [2, 4, 6]) { const q = this.pos(d, i, T - lag * dtf, ts, p); pool.spawn({ x: q[0], y: q[1], size: size * (1 - lag * 0.1), color: col, alpha: a * 0.45 * (1 - lag / 8), shape: 1 }); }
      }
      ctx.points(pool, 'add');
      const ks = FX.prog(T, p.subAt, p.subAt + 0.6, 'outCubic');
      if (ks > 0) { const f = ctx.layers.fg.world(ctx.cam, ctx.px); f.globalAlpha = 0.8 * ks; f.fillStyle = FX.rgbCss(p.gold); f.font = `42px ${FX.FONT_MONO}`; f.textAlign = 'center'; f.fillText(LAB('almost').split('').join(' '), 960, p.subY + (1 - ks) * 10); f.textAlign = 'left'; f.globalAlpha = 1; }
    },
  }));
}

FX.scene({
  name: 'gentlest_word', duration: 64, palette: 'deep_night', seed: 2026,
  post: { bloomStrength: 1.3, bloomThreshold: 0.4, exposure: 1.3, vignette: 0.45, noise: 0.03 },
  // 时间标记（阶段 B 按此对齐 BGM）：56.0 秒 = 化尘开始；50.0–56.0 秒逐层点亮，每层一个 layer_light 事件（时刻见 light.times）
  markers: { dust_start: DUST_T, light: { t0: 50.0, t1: 56.0, times: LIGHT_T } },
  shots: [
    { preset: 'chat_bubble_storm',      t: 0,    end: 4.3,  fadeOut: 0.5 },
    { preset: 'dirichlet_chat',         t: 3.9,  end: 19.3, fadeIn: 0.6, fadeOut: 0.3, params: { zooms: [{ t0: 0.5, t1: 3.4, factor: 9 }, { t0: 3.9, t1: 6.6, factor: 9 }], numberStart: 7.0, numberRate: 5.5, grayRatio: 0.14, density: 260 } },
    { preset: 'riemann_bars_collapse',  t: 19,   end: 24.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'banknote_chat_sort',     t: 24,   end: 32.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'bubbles_to_light',       t: 32,   end: 42.2, fadeIn: 0.3, fadeOut: 0.4, params: { counterFreeze: 8.0 } },
    { preset: 'voice_bubble_right',     t: 42,   end: 47.5, fadeIn: 0.2 },
    { preset: 'slab_tower_finale',      t: 47.5, end: 64 },
    { preset: 'tower_with_gray_line',   t: 42,   end: 58.6, fadeIn: 0.2, fadeOut: 0.6 },
    { preset: 'caption_pad',            t: 0,    end: 4.4, fadeOut: 0.4, params: { from: 0.42, alpha: 0.9 } }, // 钩子段字幕垫底更深
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
    { t: 60.4, type: 'sweep', dur: 1.8, angle: -0.55, intensity: 0.16, width: 0.10 },
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
