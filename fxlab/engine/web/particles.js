// ============================================================
// 粒子池：用定长数组存粒子，避免每帧分配内存
// 每个粒子：位置、速度、寿命、大小、颜色、透明度、形状（0 光晕 / 1 实心圆 / 2 圆环）
// ============================================================
FX.ParticlePool = class {
  constructor(max) {
    this.max = max; this.n = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.size0 = new Float32Array(max);
    this.r = new Float32Array(max); this.g = new Float32Array(max); this.b = new Float32Array(max);
    this.a = new Float32Array(max); this.a0 = new Float32Array(max);
    this.shape = new Float32Array(max);
    this.tag = new Float32Array(max); // 预设自用的标记
    this.buf = new Float32Array(max * 8); // 给 WebGL 的交错缓冲：x,y,size,r,g,b,a,shape
  }
  // 生成一个粒子，返回下标（池满则返回 -1）
  spawn(o) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.x[i] = o.x; this.y[i] = o.y; this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
    this.life[i] = o.life == null ? 1e9 : o.life; this.maxLife[i] = this.life[i];
    this.size[i] = o.size || 4; this.size0[i] = this.size[i];
    const c = o.color || [1, 1, 1]; this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
    this.a[i] = o.alpha == null ? 1 : o.alpha; this.a0[i] = this.a[i];
    this.shape[i] = o.shape || 0; this.tag[i] = o.tag || 0;
    return i;
  }
  kill(i) { // 用最后一个粒子覆盖，保证数组紧凑
    const j = --this.n; if (i === j) return;
    for (const k of ['x', 'y', 'vx', 'vy', 'life', 'maxLife', 'size', 'size0', 'r', 'g', 'b', 'a', 'a0', 'shape', 'tag']) this[k][i] = this[k][j];
  }
  clear() { this.n = 0; }
  // 默认积分：阻力 + 重力 + 寿命衰减；fade: 末尾淡出比例；shrink: 末尾缩小比例
  update(dt, o) {
    o = o || {}; const drag = Math.exp(-(o.drag || 0) * dt), gx = o.gx || 0, gy = o.gy || 0, fade = o.fade == null ? 0.3 : o.fade, shrink = o.shrink == null ? 0 : o.shrink;
    for (let i = 0; i < this.n; i++) {
      this.vx[i] = this.vx[i] * drag + gx * dt; this.vy[i] = this.vy[i] * drag + gy * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.life[i] -= dt;
      const k = this.maxLife[i] > 1e8 ? 1 : Math.max(0, this.life[i] / this.maxLife[i]);
      if (fade > 0) this.a[i] = this.a0[i] * Math.min(1, k / fade);
      if (shrink > 0) this.size[i] = this.size0[i] * (1 - shrink * (1 - k));
    }
    for (let i = this.n - 1; i >= 0; i--) if (this.life[i] <= 0) this.kill(i);
  }
  // 打包成 WebGL 交错缓冲
  pack() {
    const b = this.buf; let o = 0;
    for (let i = 0; i < this.n; i++) { b[o++] = this.x[i]; b[o++] = this.y[i]; b[o++] = this.size[i]; b[o++] = this.r[i]; b[o++] = this.g[i]; b[o++] = this.b[i]; b[o++] = this.a[i]; b[o++] = this.shape[i]; }
    return this.n;
  }
};
