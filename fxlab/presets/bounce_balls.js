// ============================================================
// 预设 bounce_balls：一个小球在多个大圆体之间弹射，每次碰撞触发一个音
// 画面：白色细线圆环（深海夜），小球带辉光与拖尾，碰撞时圆环闪亮 + 火花 + 轻微震屏
// 声音：每个大圆对应音阶里的一个音（事件 hit），碰到画面边缘是低一些的 tick（事件 wall）
// ============================================================
FX.registerPreset('bounce_balls', {
  描述: '小球在多个大圆体之间弹射，每次碰撞触发一个音',
  params: {
    circleCount: 5,          // 大圆数量
    radiusMin: 110,          // 大圆半径范围（设计单位，画面宽 1920）
    radiusMax: 210,
    ballRadius: 9,           // 小球半径
    speed: 820,              // 小球速度（设计单位/秒，恒定）
    sparkCount: 26,          // 每次碰撞的火花数
    trailLife: 0.55,         // 拖尾停留时间（秒）
    lineWidth: 1.6,          // 圆环线宽
    margin: 120,             // 大圆离画面边缘的最小距离
    ballColor: '#FFFFFF',    // 小球颜色
    sparkColor: '#E8B931',   // 火花颜色（深海夜里用芥末黄）
    flashShake: 5,           // 碰撞震屏幅度
  },
  sounds: {
    hit: { instr: 'pluck', track: 'sfx', base: 57, scale: 'pentatonic', decay: 0.9, gain: 0.55 },
    wall: { instr: 'tick', track: 'sfx', base: 45, scale: 'pentatonic', decay: 0.08, gain: 0.25 },
  },
  init(ctx, p) {
    const rng = ctx.rng, circles = [];
    // 随机放置互不重叠的大圆（拒绝采样，确定性）
    for (let tries = 0; tries < 4000 && circles.length < p.circleCount; tries++) {
      const r = rng.range(p.radiusMin, p.radiusMax), x = rng.range(p.margin + r, ctx.W - p.margin - r), y = rng.range(p.margin + r, ctx.H - p.margin - r);
      if (circles.every(c => Math.hypot(c.x - x, c.y - y) > c.r + r + 70)) circles.push({ x, y, r, flash: 0, pulse: 0 });
    }
    // 小球放在一个空位
    let bx = ctx.W / 2, by = ctx.H / 2;
    for (let tries = 0; tries < 2000; tries++) { bx = rng.range(200, ctx.W - 200); by = rng.range(200, ctx.H - 200); if (circles.every(c => Math.hypot(c.x - bx, c.y - by) > c.r + 60)) break; }
    const ang = rng.range(0, Math.PI * 2);
    return { circles, ball: { x: bx, y: by, vx: Math.cos(ang) * p.speed, vy: Math.sin(ang) * p.speed }, pool: new FX.ParticlePool(4000), trailAcc: 0 };
  },
  step(s, ctx, p) {
    const sub = 6, dt = ctx.dt / sub, b = s.ball, col = FX.hex(p.sparkColor);
    for (const c of s.circles) { c.flash *= Math.pow(0.08, ctx.dt); c.pulse *= Math.pow(0.05, ctx.dt); }
    for (let k = 0; k < sub; k++) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      // 与大圆碰撞：沿法线反射，并弹出圆外
      s.circles.forEach((c, idx) => {
        const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy), minD = c.r + p.ballRadius;
        if (d < minD) {
          const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.x = c.x + nx * minD; b.y = c.y + ny * minD;
            c.flash = 1; c.pulse = 1;
            ctx.emit({ type: 'hit', pitch: idx, vel: FX.clamp(-dot / p.speed, 0.3, 1), x: b.x / ctx.W, obj: idx });
            ctx.hit({ shake: p.flashShake, ca: 2.5, flash: 0.06 });
            for (let i = 0; i < p.sparkCount; i++) { const a = Math.atan2(ny, nx) + ctx.rng.gauss() * 0.6, v = ctx.rng.range(120, 520); s.pool.spawn({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: ctx.rng.range(0.25, 0.7), size: ctx.rng.range(4, 10), color: col, alpha: 0.9 }); }
          }
        }
      });
      // 与画面边缘碰撞
      const R = p.ballRadius; let wall = false;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); wall = true; } if (b.x > ctx.W - R) { b.x = ctx.W - R; b.vx = -Math.abs(b.vx); wall = true; }
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); wall = true; } if (b.y > ctx.H - R) { b.y = ctx.H - R; b.vy = -Math.abs(b.vy); wall = true; }
      if (wall) { ctx.emit({ type: 'wall', pitch: 0, vel: 0.6, x: b.x / ctx.W }); ctx.hit({ shake: 1.5 }); }
      // 拖尾
      s.pool.spawn({ x: b.x, y: b.y, life: p.trailLife, size: p.ballRadius * 2.2, color: [1, 1, 1], alpha: 0.35, shape: 0 });
    }
    s.pool.update(ctx.dt, { drag: 1.8, fade: 0.6, shrink: 0.8 });
  },
  draw(s, ctx, p) {
    const c = ctx.layers.bg.world(ctx.cam, ctx.px); const line = ctx.palette.line;
    c.lineWidth = p.lineWidth / ctx.cam.zoom;
    for (const ci of s.circles) {
      const r = ci.r * (1 + 0.025 * ci.pulse);
      c.beginPath(); c.arc(ci.x, ci.y, r, 0, Math.PI * 2); c.strokeStyle = line; c.globalAlpha = 0.55 + 0.45 * ci.flash; c.stroke();
      if (ci.flash > 0.02) { c.beginPath(); c.arc(ci.x, ci.y, r, 0, Math.PI * 2); c.fillStyle = line; c.globalAlpha = 0.18 * ci.flash; c.fill(); }
    }
    c.globalAlpha = 1;
    // 粒子：拖尾与火花（辉光叠加）
    ctx.points(s.pool, 'add');
    // 小球本体：实心圆 + 光晕
    const ballPool = s.ballPool || (s.ballPool = new FX.ParticlePool(2)); ballPool.clear();
    const bc = FX.hex(p.ballColor);
    ballPool.spawn({ x: s.ball.x, y: s.ball.y, size: p.ballRadius * 6, color: bc, alpha: 0.6, shape: 0 });
    ballPool.spawn({ x: s.ball.x, y: s.ball.y, size: p.ballRadius * 2, color: bc, alpha: 1, shape: 1 });
    ctx.points(ballPool, 'add');
  },
});
