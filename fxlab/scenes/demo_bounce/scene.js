// 演示场景：bounce_balls（7 秒）。文案在同目录 script.json
FX.scene({
  name: 'demo_bounce', duration: 7, fps: 24, palette: 'deep_night', seed: 7,
  shots: [
    { preset: 'bounce_balls', t: 0, end: 7, params: { circleCount: 5 } },
  ],
  fx: [{ t: 2.0, type: 'sweep', dur: 1.6, angle: -0.6, intensity: 0.3 }],
  // 配乐：一个温暖的低音垫（和碰撞音同调）
  music: { layers: [{ type: 'pad', t: 0, end: 7, notes: [33, 45, 52, 57], gain: 0.14, attack: 1.2, release: 1.5 }] },
});
