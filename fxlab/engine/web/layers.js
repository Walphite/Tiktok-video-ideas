// ============================================================
// 2D 图层（Canvas2D）：bg（粒子之下，受泛光）、fg（粒子之上，受泛光）、ui（字幕/HUD，不受后期）
// 预设里用 layer.world() 进入世界坐标（跟随镜头），layer.screen() 进入屏幕坐标（设计单位，不跟镜头）
// ============================================================
FX.Layer = class {
  constructor(W, H) { this.W = W; this.H = H; const c = document.createElement('canvas'); c.width = W; c.height = H; this.canvas = c; this.ctx = c.getContext('2d'); this.used = false; this.opacity = 1; }
  clear() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.W, this.H); this.used = false; this.opacity = 1; }
  // 世界坐标：设计单位，跟随镜头（平移/缩放/旋转）
  world(cam, pxScale) {
    const c = this.ctx, z = pxScale * cam.zoom, cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    c.setTransform(z * cs, z * sn, -z * sn, z * cs, this.W / 2 - z * (cs * cam.x - sn * cam.y), this.H / 2 - z * (sn * cam.x + cs * cam.y));
    this.used = true; return c;
  }
  // 屏幕坐标：左上角为原点，单位 = 设计单位（16:9 时宽 1920；9:16 时宽 607.5、高 1080）
  screen(pxScale) { this.ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0); this.used = true; return this.ctx; }
};
