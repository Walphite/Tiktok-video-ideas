// ============================================================
// 时间线与运行器：把场景脚本（shots）、预设、字幕、后期、镜头串起来
// 关键约定：
//   - 模拟按固定步长顺序推进；seek(f) 从头重算到第 f 帧，所以任何一帧都可复现
//   - simulate() 只跑物理不画图，产出事件日志（音画同源）；声音脚本只读这份日志
//   - 每个预设拿到独立的随机数生成器（种子 = 场景种子 ^ 预设名）
// ============================================================
FX.Runner = {
  hud: { counter: null },
  setup(o) {
    this.W = o.W; this.H = o.H; this.fps = o.fps; this.layoutName = o.layout || '16:9'; this.lay = FX.layouts[this.layoutName];
    this.pxScale = this.layoutName === '9:16' ? this.H / 1080 : this.W / 1920;
    this.vw = this.W / this.pxScale; this.vh = this.H / this.pxScale; // 可视区域（设计单位）
    this.gl = new FX.GL(document.getElementById('c'), this.W, this.H);
    this.layers = { bg: new FX.Layer(this.W, this.H), fg: new FX.Layer(this.W, this.H), ui: new FX.Layer(this.W, this.H) };
    return this.gl.renderer;
  },
  load(scene, script) {
    this.scene = scene; this.script = script || {}; this.palette = FX.palettes[scene.palette || 'deep_night'];
    this.duration = scene.duration; this.nFrames = Math.ceil(scene.duration * this.fps);
    this.seed = scene.seed == null ? 1 : scene.seed; this.reset();
  },
  defaultPost() {
    const p = this.scene.post || {};
    return { bloomThreshold: p.bloomThreshold == null ? 0.45 : p.bloomThreshold, bloomStrength: p.bloomStrength == null ? 1.1 : p.bloomStrength, bloomRadius: p.bloomRadius == null ? 1.6 : p.bloomRadius, bloomPasses: p.bloomPasses == null ? 3 : p.bloomPasses,
      exposure: p.exposure == null ? 1.25 : p.exposure, vignette: p.vignette == null ? 0.45 : p.vignette, noise: p.noise == null ? 0.035 : p.noise,
      ca: 0, shakeX: 0, shakeY: 0, flash: 0, shakeAmp: 0, caAmp: 0, sweepPos: -9, sweepWidth: 0.1, sweepIntensity: 0, sweepAngle: 0, sweepColor: [1, 1, 1] };
  },
  reset() {
    this.frame = -1; this.t = 0; this.events = []; this.hud.counter = null;
    this.cam = { x: 960, y: 540, zoom: this.lay.camZoom, rot: 0 };
    this.post = this.defaultPost(); this.shotState = new Map(); this.shakeRng = FX.rng(this.seed ^ 0x5151);
  },
  // 预设可调用的接口（ctx）
  makeCtx(shot, lt, dt, rng) {
    const R = this;
    return {
      t: R.t, lt, dt, frame: R.frame, fps: R.fps, rng, W: 1920, H: 1080, vw: R.vw, vh: R.vh, px: R.pxScale,
      palette: R.palette, cam: R.cam, layers: R.layers, layout: R.layoutName, hud: R.hud, sceneDuration: R.duration,
      shotDuration: shot.end - shot.t,
      emit(ev) { ev.t = +(R.t).toFixed(4); ev.shot = shot.preset; if (ev.x == null) ev.x = 0.5; R.events.push(ev); },
      // 冲击：震屏幅度（设计像素）、色差（像素）、闪白（0..1）
      hit(o) { R.post.shakeAmp = Math.max(R.post.shakeAmp, o.shake || 0); R.post.caAmp = Math.max(R.post.caAmp, o.ca || 0); R.post.flash = Math.max(R.post.flash, o.flash || 0); },
      // 画粒子池（在 2D 图层 bg 之上、fg 之下）
      points(pool, blend) { R.pointDraws.push({ pool, blend: blend || 'add' }); },
    };
  },
  activeShots() { return this.scene.shots.filter(s => this.t >= s.t && this.t < s.end + 1e-6); },
  // 推进一帧的模拟（不画图）
  step() {
    this.frame++; this.t = this.frame / this.fps; const dt = 1 / this.fps;
    // 默认镜头：缓慢漂移（纯函数）
    const dr = this.scene.cameraDrift == null ? 1 : this.scene.cameraDrift;
    this.cam.x = 960 + Math.sin(this.t * 0.21) * 14 * dr; this.cam.y = 540 + Math.cos(this.t * 0.17) * 9 * dr;
    this.cam.zoom = this.lay.camZoom * (1 + 0.025 * Math.sin(this.t * 0.13 + 1) * dr); this.cam.rot = 0.004 * Math.sin(this.t * 0.11) * dr;
    if (this.scene.camera) Object.assign(this.cam, this.scene.camera(this.t, this.cam));
    // 后期的脉冲量衰减
    const P = this.post; P.shakeAmp *= 0.82; P.caAmp *= 0.72; P.flash *= 0.75;
    if (P.shakeAmp < 0.05) P.shakeAmp = 0; if (P.caAmp < 0.05) P.caAmp = 0; if (P.flash < 0.003) P.flash = 0;
    // 预设
    for (const shot of this.activeShots()) {
      let st = this.shotState.get(shot);
      const def = FX.presets[shot.preset]; if (!def) throw new Error('未知预设: ' + shot.preset);
      if (!st) {
        const rng = FX.rng((this.seed ^ FX.hash(shot.preset + '#' + shot.t)) >>> 0);
        const params = Object.assign({}, def.params, shot.params || {});
        st = { rng, params, state: null }; const ctx = this.makeCtx(shot, 0, dt, rng); st.state = def.init(ctx, params) || {}; this.shotState.set(shot, st);
      }
      const ctx = this.makeCtx(shot, this.t - shot.t, dt, st.rng); def.step(st.state, ctx, st.params);
    }
    // 光带：场景级 fx 列表（纯函数）
    P.sweepIntensity = 0;
    for (const f of (this.scene.fx || [])) {
      if (f.type !== 'sweep' || this.t < f.t || this.t > f.t + f.dur) continue;
      const k = (this.t - f.t) / f.dur; P.sweepPos = -1.1 + 2.2 * k; P.sweepWidth = f.width == null ? 0.08 : f.width; P.sweepAngle = f.angle == null ? -0.5 : f.angle;
      P.sweepIntensity = (f.intensity == null ? 0.35 : f.intensity) * Math.sin(Math.PI * k); P.sweepColor = f.color ? FX.hex(f.color) : [1, 1, 1];
    }
    // 震屏：用帧号派生的随机偏移
    const r1 = this.shakeRng(), r2 = this.shakeRng();
    P.shakeX = P.shakeAmp * (r1 * 2 - 1); P.shakeY = P.shakeAmp * (r2 * 2 - 1); P.ca = P.caAmp;
  },
  draw() {
    const G = this.gl, L = this.layers; for (const k in L) L[k].clear(); this.pointDraws = []; const dt = 1 / this.fps;
    for (const shot of this.activeShots()) { const st = this.shotState.get(shot); if (!st) continue; const def = FX.presets[shot.preset]; def.draw(st.state, this.makeCtx(shot, this.t - shot.t, dt, st.rng), st.params); }
    G.begin(FX.hex(this.palette.bg));
    if (L.bg.used) G.drawLayer(L.bg.canvas, 'bg', L.bg.opacity);
    for (const d of this.pointDraws) G.drawPoints(d.pool, this.cam, { vw: this.vw, vh: this.vh }, this.pxScale, d.blend);
    if (L.fg.used) G.drawLayer(L.fg.canvas, 'fg', L.fg.opacity);
    G.compose(this.post, this.frame);
    FX.Text.drawAll(L.ui, this.script, this.t, this.lay, this.vw, this.vh, this.palette, this.pxScale);
    if (L.ui.used) G.drawUI(L.ui.canvas);
  },
  // 渲染第 f 帧（必要时从头重算），返回 base64 像素
  renderFrame(f) {
    if (f <= this.frame) this.reset();
    while (this.frame < f - 1) this.step();
    this.step(); this.draw(); return this.gl.readB64();
  },
  // 只跑模拟，产出事件日志 + 声音配置
  simulate() {
    this.reset(); for (let f = 0; f < this.nFrames; f++) this.step();
    const sounds = {}; for (const shot of this.scene.shots) Object.assign(sounds, FX.presets[shot.preset].sounds || {}); Object.assign(sounds, this.scene.sounds || {});
    const out = { fps: this.fps, duration: this.duration, events: this.events, sounds, music: this.scene.music || null };
    this.reset(); return out;
  },
};
// 场景脚本调用 FX.scene({...}) 注册
FX.scene = function (def) { FX.currentScene = def; };
