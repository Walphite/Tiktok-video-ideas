// 演示场景：burst_rainbow（8 秒）。文案在同目录 script.json
FX.scene({
  name: 'demo_burst', duration: 8, fps: 24, palette: 'deep_night', seed: 11,
  shots: [
    { preset: 'burst_rainbow', t: 0, end: 8, params: { burstAt: 3.2, count: 20000 } },
  ],
  fx: [{ t: 4.4, type: 'sweep', dur: 1.6, angle: -0.7, intensity: 0.22, width: 0.12 }],
  post: { bloomStrength: 1.6, bloomThreshold: 0.35, exposure: 1.35 },
  music: { layers: [
    { type: 'pad', t: 0, end: 3.4, notes: [40, 47], gain: 0.07, attack: 1.0, release: 0.4 },
    { type: 'pad', t: 3.2, end: 8, notes: [40, 47, 52, 59, 64], gain: 0.16, attack: 0.05, release: 2.5 }
  ] },
});
