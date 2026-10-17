// ============================================================
// 成片场景：《数学里最温柔的一个词》约 64 秒
// 文案全部在同目录 script.json；这里只负责「哪个预设、什么时候、什么参数、配乐与光带」
// 时间轴（秒）：0–4 钩子 | 4–14 稠密 | 14–22 可数 | 22–28 黎曼 | 28–34 勒贝格 | 34–44 结算 | 44–56 那一层 | 56–64 收尾
// ============================================================
FX.scene({
  name: 'gentlest_word', duration: 64, palette: 'deep_night', seed: 2026,
  post: { bloomStrength: 1.3, bloomThreshold: 0.4, exposure: 1.3, vignette: 0.45, noise: 0.03 },
  shots: [
    { preset: 'chat_bubble_storm',      t: 0,    end: 4.3,  fadeOut: 0.5 },
    { preset: 'dirichlet_field',        t: 3.9,  end: 22.2, fadeIn: 0.6, fadeOut: 0.3, params: { numberStart: 10.2, numberRate: 5.5 } },
    { preset: 'riemann_bars_collapse',  t: 22,   end: 28.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'banknote_sort',          t: 28,   end: 34.2, fadeIn: 0.3, fadeOut: 0.3 },
    { preset: 'bubbles_to_light',       t: 34,   end: 44.2, fadeIn: 0.3, fadeOut: 0.4, params: { counterFreeze: 8.0 } },
    { preset: 'voice_bubble_to_slab',   t: 44,   end: 49.5, fadeIn: 0.2 },
    { preset: 'slab_tower',             t: 49.5, end: 56.4, fadeOut: 0.6 },
    { preset: 'particle_text',          t: 56,   end: 64,   fadeOut: 0.0 },
  ],
  // 每幕至少一次光带扫过
  fx: [
    { t: 1.2,  type: 'sweep', dur: 1.4, angle: -0.6, intensity: 0.18, width: 0.10 },
    { t: 7.0,  type: 'sweep', dur: 1.8, angle: -0.5, intensity: 0.11, width: 0.09 },
    { t: 16.5, type: 'sweep', dur: 1.8, angle: -0.5, intensity: 0.10, width: 0.09 },
    { t: 23.0, type: 'sweep', dur: 1.4, angle: -0.7, intensity: 0.11, width: 0.08 },
    { t: 30.5, type: 'sweep', dur: 1.6, angle: -0.6, intensity: 0.10, width: 0.08 },
    { t: 40.0, type: 'sweep', dur: 1.8, angle: -0.5, intensity: 0.11, width: 0.09, color: '#E8B931' },
    { t: 47.5, type: 'sweep', dur: 1.6, angle: -0.6, intensity: 0.10, width: 0.08, color: '#2F5BEA' },
    { t: 53.0, type: 'sweep', dur: 1.6, angle: -0.6, intensity: 0.09, width: 0.08, color: '#2F5BEA' },
    { t: 59.0, type: 'sweep', dur: 1.8, angle: -0.55, intensity: 0.30, width: 0.10 },
  ],
  // 配乐（numpy 合成的和弦垫 / 低音），音效由各预设的事件产生
  music: { layers: [
    { type: 'pad',   t: 4.0,  end: 22.0, notes: [45, 52, 57],         gain: 0.045, attack: 2.5, release: 1.0 },
    { type: 'drone', t: 22.0, end: 27.8, notes: [33, 34],             gain: 0.06,  attack: 0.8, release: 0.6 },
    { type: 'pad',   t: 28.0, end: 34.0, notes: [45, 52, 57, 59],     gain: 0.05,  attack: 1.2, release: 0.8 },
    { type: 'pad',   t: 34.0, end: 41.9, notes: [45, 52, 57, 64],     gain: 0.06,  attack: 1.5, release: 0.12 },
    { type: 'pad',   t: 42.6, end: 44.0, notes: [57, 64],             gain: 0.04,  attack: 0.4, release: 0.6 },
    { type: 'drone', t: 44.0, end: 56.0, notes: [33, 40],             gain: 0.12,  attack: 2.5, release: 1.5 },
    { type: 'pad',   t: 46.0, end: 56.0, notes: [45, 52, 57],         gain: 0.05,  attack: 2.0, release: 1.5 },
    { type: 'pad',   t: 56.0, end: 60.5, notes: [45, 52, 57, 64, 69], gain: 0.14,  attack: 0.8, release: 3.5 },
  ] },
});
