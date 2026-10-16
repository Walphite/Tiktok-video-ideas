// ============================================================
// WebGL 渲染器：粒子点精灵 + 2D 图层合成 + 后期（泛光、色差、震屏、光带、噪点、暗角）
// 世界坐标 = 1920×1080 设计单位；镜头 {x,y,zoom,rot}；输出像素 = 设计单位 × pxScale
// ============================================================
FX.GL = class {
  constructor(canvas, W, H) {
    this.W = W; this.H = H; this.canvas = canvas; canvas.width = W; canvas.height = H;
    const gl = this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL 不可用');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const QVS = `attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}`;
    // 粒子：点精灵。shape 0 = 柔和光晕，1 = 实心圆，2 = 圆环
    this.pPoints = this._prog(`
      attribute vec2 p;attribute float s;attribute vec4 c;attribute float sh;
      uniform vec4 cam; uniform vec2 rot; uniform vec2 view; uniform float px;
      varying vec4 vc; varying float vsh;
      void main(){ vec2 d=p-cam.xy; vec2 q=vec2(d.x*rot.x-d.y*rot.y, d.x*rot.y+d.y*rot.x)*cam.z;
        gl_Position=vec4(q.x/(view.x*0.5), -q.y/(view.y*0.5), 0., 1.);
        gl_PointSize=max(1.0, s*cam.z*px); vc=c; vsh=sh; }`,
      `precision mediump float; varying vec4 vc; varying float vsh;
      void main(){ vec2 d=gl_PointCoord-0.5; float r2=dot(d,d)*4.0; float a;
        if(vsh<0.5){ a=exp(-r2*3.0)*(1.0-smoothstep(0.7,1.0,r2)); }
        else if(vsh<1.5){ a=1.0-smoothstep(0.80,1.0,r2); }
        else { float r=sqrt(r2); a=(1.0-smoothstep(0.86,1.0,r))*smoothstep(0.62,0.76,r); }
        a*=vc.a; gl_FragColor=vec4(vc.rgb*a, a); }`);
    // 2D 图层贴图（预乘透明度）
    this.pTex = this._prog(QVS, `precision mediump float;varying vec2 uv;uniform sampler2D t;uniform float op;void main(){vec4 c=texture2D(t,vec2(uv.x,1.0-uv.y));gl_FragColor=c*op;}`);
    // 泛光：亮度提取（降采样）
    this.pBright = this._prog(QVS, `precision mediump float;varying vec2 uv;uniform sampler2D t;uniform float th;void main(){vec3 c=texture2D(t,uv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(th,th+0.5,l),1.);}`);
    this.pBlur = this._prog(QVS, `precision mediump float;varying vec2 uv;uniform sampler2D t;uniform vec2 dir;void main(){vec3 s=texture2D(t,uv).rgb*0.227;
      s+=(texture2D(t,uv+dir).rgb+texture2D(t,uv-dir).rgb)*0.195; s+=(texture2D(t,uv+dir*2.).rgb+texture2D(t,uv-dir*2.).rgb)*0.122;
      s+=(texture2D(t,uv+dir*3.).rgb+texture2D(t,uv-dir*3.).rgb)*0.054; s+=(texture2D(t,uv+dir*4.).rgb+texture2D(t,uv-dir*4.).rgb)*0.016; gl_FragColor=vec4(s,1.);}`);
    // 合成：场景 + 泛光，色差、震屏、光带、闪白、曝光、暗角、噪点
    this.pComp = this._prog(QVS, `precision highp float;varying vec2 uv;uniform sampler2D sc;uniform sampler2D bl;uniform vec2 res;uniform float fr;
      uniform float bloomStr;uniform float ca;uniform vec2 shake;uniform float flash;uniform vec4 sweep;uniform vec3 sweepCol;uniform float exposure;uniform float vig;uniform float noise;
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){ vec2 u=uv+shake/res; vec2 dir=(u-0.5)*ca/res;
        vec3 c; c.r=texture2D(sc,u+dir).r; c.g=texture2D(sc,u).g; c.b=texture2D(sc,u-dir).b;
        vec3 b; b.r=texture2D(bl,u+dir*2.).r; b.g=texture2D(bl,u).g; b.b=texture2D(bl,u-dir*2.).b; c+=b*bloomStr;
        float asp=res.x/res.y; vec2 q=vec2((u.x-0.5)*asp,u.y-0.5); float d=dot(q,vec2(cos(sweep.w),sin(sweep.w)));
        float band=exp(-pow((d-sweep.x)/max(sweep.y,1e-4),2.0))*sweep.z; c+=sweepCol*band; c+=vec3(flash);
        c=1.0-exp(-c*exposure);
        float r=length((u-0.5)*vec2(asp,1.0))*1.2; c*=1.0-vig*smoothstep(0.45,1.25,r);
        c+=(hash(uv*res+fr*0.37)-0.5)*noise; gl_FragColor=vec4(c,1.);}`);
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.pbuf = gl.createBuffer();
    this.fScene = this._fbo(W, H); this.fA = this._fbo(W >> 2, H >> 2); this.fB = this._fbo(W >> 2, H >> 2);
    this.layerTex = {};
  }
  _sh(type, src) { const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src); return s; }
  _prog(vs, fs) { const gl = this.gl, p = gl.createProgram(); gl.attachShader(p, this._sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, this._sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p.u = {}; p.loc = (n) => (p.u[n] == null ? (p.u[n] = gl.getUniformLocation(p, n)) : p.u[n]); return p; }
  _tex(w, h) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  _fbo(w, h) { const gl = this.gl, t = this._tex(w, h), f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; }
  _quad(p) { const gl = this.gl; gl.useProgram(p); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); const l = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

  // 开始一帧：绑定场景缓冲并清成背景色
  begin(bg) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fScene.f); gl.viewport(0, 0, this.W, this.H); gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  // 把一张 2D 画布叠到场景上（预乘透明度）
  drawLayer(canvasEl, key, opacity) {
    const gl = this.gl; let t = this.layerTex[key]; if (!t) { t = this.layerTex[key] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasEl); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(this.pTex); gl.uniform1i(this.pTex.loc('t'), 0); gl.uniform1f(this.pTex.loc('op'), opacity == null ? 1 : opacity); this._quad(this.pTex); gl.disable(gl.BLEND);
  }
  // 画粒子池。blend: 'add'（默认，发光叠加）或 'alpha'
  drawPoints(pool, cam, view, pxScale, blend) {
    const n = pool.pack(); if (!n) return; const gl = this.gl, p = this.pPoints;
    gl.enable(gl.BLEND); if (blend === 'alpha') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(p); gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf); gl.bufferData(gl.ARRAY_BUFFER, pool.buf.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    const S = 32; const at = (nm, sz, off) => { const l = gl.getAttribLocation(p, nm); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, S, off); };
    at('p', 2, 0); at('s', 1, 8); at('c', 4, 12); at('sh', 1, 28);
    gl.uniform4f(p.loc('cam'), cam.x, cam.y, cam.zoom, 0); gl.uniform2f(p.loc('rot'), Math.cos(cam.rot), Math.sin(cam.rot)); gl.uniform2f(p.loc('view'), view.vw, view.vh); gl.uniform1f(p.loc('px'), pxScale);
    gl.drawArrays(gl.POINTS, 0, n); gl.disable(gl.BLEND);
  }
  // 后期合成到屏幕
  compose(post, frame) {
    const gl = this.gl, W = this.W, H = this.H;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fA.f); gl.viewport(0, 0, this.fA.w, this.fA.h); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fScene.t);
    gl.useProgram(this.pBright); gl.uniform1i(this.pBright.loc('t'), 0); gl.uniform1f(this.pBright.loc('th'), post.bloomThreshold); this._quad(this.pBright);
    const rad = post.bloomRadius;
    for (let k = 0; k < post.bloomPasses; k++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fB.f); gl.bindTexture(gl.TEXTURE_2D, this.fA.t); gl.useProgram(this.pBlur); gl.uniform1i(this.pBlur.loc('t'), 0); gl.uniform2f(this.pBlur.loc('dir'), rad * (k + 1) / this.fA.w, 0); this._quad(this.pBlur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fA.f); gl.bindTexture(gl.TEXTURE_2D, this.fB.t); gl.useProgram(this.pBlur); gl.uniform2f(this.pBlur.loc('dir'), 0, rad * (k + 1) / this.fA.h); this._quad(this.pBlur);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); const p = this.pComp; gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fScene.t); gl.uniform1i(p.loc('sc'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fA.t); gl.uniform1i(p.loc('bl'), 1);
    gl.uniform2f(p.loc('res'), W, H); gl.uniform1f(p.loc('fr'), frame); gl.uniform1f(p.loc('bloomStr'), post.bloomStrength);
    gl.uniform1f(p.loc('ca'), post.ca * W / 1920); gl.uniform2f(p.loc('shake'), post.shakeX * W / 1920, post.shakeY * W / 1920); gl.uniform1f(p.loc('flash'), post.flash);
    gl.uniform4f(p.loc('sweep'), post.sweepPos, post.sweepWidth, post.sweepIntensity, post.sweepAngle); gl.uniform3f(p.loc('sweepCol'), post.sweepColor[0], post.sweepColor[1], post.sweepColor[2]);
    gl.uniform1f(p.loc('exposure'), post.exposure); gl.uniform1f(p.loc('vig'), post.vignette); gl.uniform1f(p.loc('noise'), post.noise);
    this._quad(p);
  }
  // 字幕 / HUD 图层画在后期之上（不受泛光与震屏影响）
  drawUI(canvasEl) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H); this.drawLayer(canvasEl, 'ui', 1); }
  // 读回整帧像素（RGBA，自下而上），以 base64 返回给 Node
  readB64() {
    const gl = this.gl, W = this.W, H = this.H, px = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = ''; const CH = 0x8000; for (let i = 0; i < px.length; i += CH) s += String.fromCharCode.apply(null, px.subarray(i, i + CH)); return btoa(s);
  }
};
