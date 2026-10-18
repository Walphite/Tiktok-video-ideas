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
// A5 burst_to_text：复用 burst_rainbow —— 56.0 秒爆发（亮度突增 + 色差，色相 = 出射角），约 1 秒后收拢成「几乎处处」
// ============================================================
{
  const bu = FX.presets.burst_rainbow, pt = FX.presets.particle_text, big = bigFont(1.5, 40);
  FX.registerPreset('burst_to_text', {
    描述: '彩虹爆发（沿用 burst_rainbow）约 1 秒后收拢成大字，下方小字',
    params: Object.assign({}, bu.params, {
      burstAt: 0.5, life: 40, lineCount: 2, dotCount: 8, tickFirst: 0.25, shake: 24, caBurst: 28, flashBurst: 1.0,
      gather: 0.6, gatherDur: 1.0, fontSize: 300, textY: 470, subY: 660, subAfter: 1.9, tint: 0.8, keepRainbow: 0.18,
    }),
    sounds: Object.assign({}, bu.sounds, { arrive: pt.sounds.arrive }),
    init(ctx, p) {
      const s = bu.init.call(bu, ctx, p), rng = ctx.rng;
      const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.font = `bold ${p.fontSize}px ${FX.FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LAB('big_text'), 960, p.textY);
      const img = g.getImageData(0, 0, 1920, 1080).data, cand = []; for (let y = 0; y < 1080; y += 2) for (let x = 0; x < 1920; x += 2) if (img[(y * 1920 + x) * 4 + 3] > 128) cand.push(x, y);
      const nC = cand.length / 2; s.tx = new Float32Array(p.count); s.ty = new Float32Array(p.count); s.dur = new Float32Array(p.count); s.keep = new Uint8Array(p.count); s.ph = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) { const j = rng.int(nC); s.tx[i] = cand[j * 2] + rng.range(-1, 1); s.ty[i] = cand[j * 2 + 1] + rng.range(-1, 1); s.dur[i] = p.gatherDur * rng.range(0.8, 1.2); s.keep[i] = rng() < p.keepRainbow ? 1 : 0; s.ph[i] = rng.range(0, 6.28); }
      s.cap = null; s.arrived = false; return s;
    },
    step(s, ctx, p) {
      const was = s.burst; bu.step.call(bu, s, ctx, p); const t = ctx.lt, tb = t - p.burstAt;
      if (!was && s.burst) ctx.hit({ ca: p.caBurst, flash: p.flashBurst }); // 爆发瞬间：亮度突增 + 色差
      if (!s.burst || tb < p.gather) return; const pool = s.pool, n = pool.n;
      if (!s.cap) { s.cap = { t0: tb, x: Float32Array.from(pool.x.subarray(0, n)), y: Float32Array.from(pool.y.subarray(0, n)), vx: Float32Array.from(pool.vx.subarray(0, n)), vy: Float32Array.from(pool.vy.subarray(0, n)), r: Float32Array.from(pool.r.subarray(0, n)), g: Float32Array.from(pool.g.subarray(0, n)), b: Float32Array.from(pool.b.subarray(0, n)) }; }
      const C = s.cap;
      for (let i = 0; i < n; i++) {
        const D = s.dur[i], u = FX.clamp((tb - C.t0) / D, 0, 1), u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2;
        pool.x[i] = h00 * C.x[i] + h10 * C.vx[i] * D + h01 * s.tx[i]; pool.y[i] = h00 * C.y[i] + h10 * C.vy[i] * D + h01 * s.ty[i];
        pool.vx[i] = 0; pool.vy[i] = 0; const m = s.keep[i] ? 0 : h01 * p.tint; // 大多数粒子从彩虹褪成近白，少量保留彩色
        pool.r[i] = FX.lerp(C.r[i], 1, m); pool.g[i] = FX.lerp(C.g[i], 1, m); pool.b[i] = FX.lerp(C.b[i], 1, m);
        pool.size[i] = FX.lerp(pool.size0[i], 4.5, h01); pool.a[i] = pool.a0[i] * (0.85 + 0.2 * Math.sin(t * 3 + s.ph[i]) * u);
      }
      if (!s.arrived && tb >= C.t0 + p.gatherDur * 1.1) { s.arrived = true; ctx.emit({ type: 'arrive', pitch: 4, vel: 0.9, x: 0.5 }); ctx.hit({ flash: 0.08 }); }
    },
    draw(s, ctx, p) {
      bu.draw.call(bu, s, ctx, p);
      const k = FX.prog(ctx.lt - p.burstAt, p.subAfter, p.subAfter + 0.6, 'outCubic'); if (k <= 0) return;
      const c = ctx.layers.fg.world(ctx.cam, ctx.px); c.globalAlpha = 0.9 * k; c.fillStyle = ctx.palette.text; c.font = `42px ${FX.FONT_MONO}`; c.textAlign = 'center'; c.fillText(LAB('almost').split('').join(' '), 960, p.subY + (1 - k) * 10); c.textAlign = 'left'; c.globalAlpha = 1;
    },
  });
}

FX.scene({
  name: 'gentlest_word', duration: 64, palette: 'deep_night', seed: 2026,
  post: { bloomStrength: 1.3, bloomThreshold: 0.4, exposure: 1.3, vignette: 0.45, noise: 0.03 },
  shots: [
    { preset: 'chat_bubble_storm',      t: 0,    end: 4.3,  fadeOut: 0.5 },
    { preset: 'dirichlet_chat',         t: 3.9,  end: 19.3, fadeIn: 0.6, fadeOut: 0.3, params: { zooms: [{ t0: 0.5, t1: 3.4, factor: 9 }, { t0: 3.9, t1: 6.6, factor: 9 }], numberStart: 7.0, numberRate: 5.5, grayRatio: 0.14, density: 260 } },
    { preset: 'riemann_bars_collapse',  t: 19,   end: 24.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'banknote_chat_sort',     t: 24,   end: 32.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'bubbles_to_light',       t: 32,   end: 42.2, fadeIn: 0.3, fadeOut: 0.4, params: { counterFreeze: 8.0 } },
    { preset: 'voice_bubble_right',     t: 42,   end: 47.5, fadeIn: 0.2 },
    { preset: 'slab_tower_right',       t: 47.5, end: 56.3, fadeOut: 0.9 },
    { preset: 'tower_with_gray_line',   t: 42,   end: 56.3, fadeIn: 0.2, fadeOut: 0.9 },
    { preset: 'burst_to_text',          t: 55.5, end: 64,   fadeOut: 0.0 },
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
