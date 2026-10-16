// ============================================================
// fxlab 引擎核心：公共命名空间、随机数、调色板、数学工具
// 约定：所有随机数都从固定种子派生，重跑结果完全一致
// ============================================================
window.FX = (function () {
  const FX = { presets: {}, version: '0.1' };

  // 注册一个特效预设（presets/ 目录里的文件调用）
  FX.registerPreset = function (name, def) { def.name = name; FX.presets[name] = def; };

  // 字符串 → 整数哈希（用来给每个预设派生独立的随机种子）
  FX.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };

  // 确定性随机数（mulberry32），带常用辅助方法
  FX.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    const next = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (n) => Math.floor(next() * n);
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.sign = () => (next() < 0.5 ? -1 : 1);
    next.gauss = () => { const u = Math.max(next(), 1e-9), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); };
    next.fork = (label) => FX.rng((seed ^ FX.hash(label)) >>> 0);
    return next;
  };

  // 数学工具
  FX.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  FX.lerp = (a, b, t) => a + (b - a) * t;
  FX.smoothstep = (a, b, x) => { const t = FX.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  FX.ease = {
    linear: t => t,
    inQuad: t => t * t, outQuad: t => t * (2 - t), inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    outCubic: t => 1 - Math.pow(1 - t, 3), inCubic: t => t * t * t,
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.0944) + 1),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  // 在 [t0, t1] 内从 0 到 1 的进度，带缓动
  FX.prog = (t, t0, t1, easeName) => (FX.ease[easeName || 'linear'])(FX.clamp((t - t0) / Math.max(1e-6, t1 - t0), 0, 1));

  // 颜色工具：'#RRGGBB' → [r,g,b]（0..1）
  FX.hex = function (h) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  FX.hsv = function (h, s, v) { // h 0..1
    h = ((h % 1) + 1) % 1; const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) { case 0: return [v, t, p]; case 1: return [q, v, p]; case 2: return [p, v, t]; case 3: return [p, q, v]; case 4: return [t, p, v]; default: return [v, p, q]; }
  };
  FX.rgbCss = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a == null ? 1 : a})`;
  FX.mix = (a, b, t) => [FX.lerp(a[0], b[0], t), FX.lerp(a[1], b[1], t), FX.lerp(a[2], b[2], t)];

  // ---------------- 调色板（可切换预设） ----------------
  FX.palettes = {
    // 「深海夜」：深蓝黑底，白色细线，彩虹色爆发；本片用它
    deep_night: {
      name: 'deep_night',
      bg: '#0A0D16', line: '#FFFFFF', text: '#FFFFFF',
      gray: '#8C929E',       // 灰 = 有理数 / 问候气泡
      amber: '#E8B931',      // 芥末黄 = 无理数
      blue: '#2F5BEA',       // 钴蓝 = 「那一层」
      red: '#E5533D',        // 朱红 = 仅用于印章与冲击
      green: '#2E7D5B',
      accent: '#E8B931',     // 字幕关键词默认强调色
      rainbow: (h) => FX.hsv(h, 0.85, 1.0),
    },
    // 「撞色块」：炭灰底，钴蓝 / 朱红 / 芥末黄 / 墨绿 四色块
    color_blocks: {
      name: 'color_blocks',
      bg: '#1E1F22', line: '#F2F0EA', text: '#F2F0EA',
      gray: '#9A9A9A', amber: '#E8B931', blue: '#2F5BEA', red: '#E5533D', green: '#2E7D5B',
      accent: '#E5533D',
      rainbow: (h) => { const c = ['#2F5BEA', '#E5533D', '#E8B931', '#2E7D5B']; return FX.hex(c[Math.floor(((h % 1) + 1) % 1 * 4) % 4]); },
    },
  };

  // ---------------- 版面配置：16:9 与 9:16 ----------------
  // 世界坐标统一用 1920×1080 的「设计单位」；9:16 只改取景与字幕位置，粒子与物理不变
  FX.layouts = {
    '16:9': { aspect: 16 / 9, subSize: 62, subX: 0.08, subY: 0.80, subMaxW: 0.86, hudSize: 22, hudX: 0.045, hudY: 0.075, counterSize: 26, rightMargin: 0.06, camZoom: 1.0 },
    '9:16': { aspect: 9 / 16, subSize: 46, subX: 0.07, subY: 0.74, subMaxW: 0.86, hudSize: 20, hudX: 0.06, hudY: 0.09, counterSize: 22, rightMargin: 0.06, camZoom: 1.0 },
  };

  return FX;
})();
