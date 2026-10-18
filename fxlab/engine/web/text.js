// ============================================================
// 字幕与 HUD：全部文案来自 script.json，代码里不写死任何字幕
// script.json 结构：
//   { "subtitles": [{ "t": 0, "end": 2.2, "text": "一条都**没有分量**。", "color": "#E8B931"(可选) }],
//     "hud": [{ "t": 4, "end": 22, "label": "DIRICHLET · 1829" }],
//     "counter": [{ "t": 14, "end": 22, "text": "μ(ℚ∩[0,1]) = 0" }],
//     "corner": [{ "t": 62, "end": 64, "text": "测度论笔记 · 01" }] }
// 字幕：粗宋体，白色，居左偏下；**关键词** 用强调色；数学符号回退到 DejaVu
// ============================================================
FX.FONT_SERIF = '"Noto Serif CJK SC", "Noto Serif SC", "WenQuanYi Zen Hei", "DejaVu Serif", serif';
FX.FONT_MONO = '"DejaVu Sans Mono", "Noto Sans Mono CJK SC", monospace';
FX.FONT_SANS = '"DejaVu Sans", "WenQuanYi Zen Hei", sans-serif';

FX.Text = {
  // 解析 **强调** 标记 → [{text, em}]
  parse(s) { const out = []; const parts = String(s).split('**'); parts.forEach((p, i) => { if (p) out.push({ text: p, em: i % 2 === 1 }); }); return out; },
  // 按宽度换行（逐字，中文友好）
  wrap(ctx, runs, maxW) {
    const lines = [[]]; let w = 0;
    for (const r of runs) for (const ch of r.text) {
      const cw = ctx.measureText(ch).width;
      if (w + cw > maxW && lines[lines.length - 1].length) { lines.push([]); w = 0; }
      const line = lines[lines.length - 1]; const last = line[line.length - 1];
      if (last && last.em === r.em) last.text += ch; else line.push({ text: ch, em: r.em });
      w += cw;
    }
    return lines;
  },
  // 字幕出现/消失的透明度与上浮（纯函数）
  env(t, t0, t1, fadeIn, fadeOut) { const a = FX.clamp((t - t0) / fadeIn, 0, 1), b = FX.clamp((t1 - t) / fadeOut, 0, 1); return Math.min(FX.ease.outCubic(a), b); },

  // ---- 三层字幕（script.json 的 subtitles 里写 "layer"）----
  // headline：上部居中，字高 8% 画面高；center：屏幕中央关键词，字高 12%，强调色外发光（可选 frame 发光线框、scrim 暗带）；bottom：底部居中，字高 5%
  // 没有 layer 字段的字幕仍走上面的旧样式（居左偏下）
  LAYERS: { headline: { h: 0.08, y: 0.19, fadeIn: 0.3 }, center: { h: 0.12, y: 0.5, fadeIn: 0.12 }, bottom: { h: 0.05, y: 0.82, fadeIn: 0.25 } },
  drawLayer(c, s, t, lay, vw, vh, palette) {
    const L = this.LAYERS[s.layer]; if (!L) return;
    const k = this.env(t, s.t, s.end, s.fadeIn == null ? L.fadeIn : Math.max(s.fadeIn, 1e-3), 0.18); if (k <= 0) return;
    const size = (s.size || vh * L.h) * (lay.aspect < 1 ? 0.62 : 1); c.font = `bold ${size}px ${FX.FONT_SERIF}`; c.textBaseline = 'alphabetic';
    const lines = this.wrap(c, this.parse(s.text), vw * 0.9), lh = size * 1.28, emColor = s.color || palette.accent, isC = s.layer === 'center';
    const base = vh * (s.y == null ? L.y : s.y) + (isC ? size * 0.35 : 0), y0 = base - (lines.length - 1) * lh + (s.layer === 'bottom' ? (1 - k) * 10 : 0);
    const widths = lines.map(line => line.reduce((a, r) => a + c.measureText(r.text).width, 0)), W = Math.max(...widths);
    c.save(); c.globalAlpha = k;
    if (isC && s.scrim) { const g = c.createLinearGradient(0, base - size * 1.3, 0, base + size * 0.6); g.addColorStop(0, 'rgba(5,7,12,0)'); g.addColorStop(0.5, 'rgba(5,7,12,0.62)'); g.addColorStop(1, 'rgba(5,7,12,0)'); c.fillStyle = g; c.fillRect(0, base - size * 1.3, vw, size * 1.9); }
    if (isC && s.stamp) { const sc = FX.lerp(1.4, 1, FX.ease.outCubic(FX.clamp((t - s.t) / 0.16, 0, 1))), cy = base - (lines.length - 1) * lh / 2 - size * 0.3; c.translate(vw / 2, cy); c.scale(sc, sc); c.translate(-vw / 2, -cy); }
    if (isC && s.frame) { const pad = size * 0.45, top = y0 - size * 0.95 - pad * 0.4, bot = base + size * 0.3 + pad * 0.4; c.strokeStyle = emColor; c.lineWidth = Math.max(3, size * 0.035); c.shadowColor = emColor; c.shadowBlur = size * 0.3; c.strokeRect(vw / 2 - W / 2 - pad, top, W + pad * 2, bot - top); c.shadowBlur = 0; }
    lines.forEach((line, li) => {
      let x = vw / 2 - widths[li] / 2; const y = y0 + li * lh;
      for (const r of line) {
        if (isC) { c.shadowColor = emColor; c.shadowBlur = size * 0.28; c.fillStyle = emColor; }
        else { c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = size * 0.25; c.shadowOffsetY = size * 0.04; c.fillStyle = r.em ? emColor : palette.text; }
        c.fillText(r.text, x, y); x += c.measureText(r.text).width;
      }
    });
    c.restore();
  },

  drawAll(ui, script, t, lay, vw, vh, palette, pxScale) {
    if (!script) return;
    const c = ui.screen(pxScale);
    // ---- 字幕 ----
    for (const s of (script.subtitles || [])) {
      if (t < s.t || t > s.end) continue;
      if (s.layer) { this.drawLayer(c, s, t, lay, vw, vh, palette); continue; } // 三层字幕：headline / center / bottom
      const k = this.env(t, s.t, s.end, s.fadeIn == null ? 0.28 : Math.max(s.fadeIn, 1e-3), 0.18); if (k <= 0) continue;
      const size = s.size || lay.subSize; c.font = `bold ${size}px ${FX.FONT_SERIF}`; c.textBaseline = 'alphabetic';
      const runs = this.parse(s.text); const lines = this.wrap(c, runs, vw * lay.subMaxW);
      const lh = size * 1.35; const x0 = vw * lay.subX; let y = vh * lay.subY - (lines.length - 1) * lh + (1 - k) * 14;
      const emColor = s.color || palette.accent;
      c.globalAlpha = k;
      for (const line of lines) {
        let x = x0;
        for (const r of line) {
          c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = size * 0.25; c.shadowOffsetY = size * 0.04;
          c.fillStyle = r.em ? emColor : palette.text; c.fillText(r.text, x, y); x += c.measureText(r.text).width;
        }
        y += lh;
      }
      c.shadowBlur = 0; c.shadowOffsetY = 0; c.globalAlpha = 1;
    }
    // ---- HUD：左上角小号英文大写 + 左侧细竖线 ----
    for (const h of (script.hud || [])) {
      if (t < h.t || t > h.end) continue; const k = this.env(t, h.t, h.end, 0.4, 0.3);
      c.globalAlpha = k * 0.9; c.font = `${lay.hudSize}px ${FX.FONT_SANS}`; c.textBaseline = 'middle'; c.fillStyle = palette.text;
      const x = vw * lay.hudX, y = vh * lay.hudY; c.fillRect(x - 18, y - lay.hudSize * 0.9, 1.5, lay.hudSize * 1.8);
      c.fillText(String(h.label).toUpperCase().split('').join(' '), x, y); c.globalAlpha = 1;
    }
    // ---- 右上角等宽计数器（右侧留 6% 边距）----
    const counters = (script.counter || []).filter(x => t >= x.t && t <= x.end);
    const dyn = FX.Runner.hud.counter; // 预设动态写入的计数器
    const ctext = dyn != null ? dyn : (counters.length ? counters[counters.length - 1].text : null);
    if (ctext != null) {
      const k = counters.length && dyn == null ? this.env(t, counters[counters.length - 1].t, counters[counters.length - 1].end, 0.3, 0.3) : 1;
      c.globalAlpha = k * 0.95; c.font = `${lay.counterSize}px ${FX.FONT_MONO}`; c.textBaseline = 'middle'; c.textAlign = 'right'; c.fillStyle = palette.text;
      c.fillText(String(ctext), vw * (1 - lay.rightMargin), vh * lay.hudY); c.textAlign = 'left'; c.globalAlpha = 1;
    }
    // ---- 角落小字（如「测度论笔记 · 01」）----
    for (const s of (script.corner || [])) {
      if (t < s.t || t > s.end) continue; const k = this.env(t, s.t, s.end, 0.4, 0.3);
      // pos：tl 左上（默认）/ tr 右上 / bl 左下 / br 右下；font：serif（默认）/ mono
      const pos = s.pos || 'tl', size = s.size || lay.hudSize + 2;
      c.globalAlpha = k * (s.alpha == null ? 0.85 : s.alpha); c.font = `${size}px ${s.font === 'mono' ? FX.FONT_MONO : FX.FONT_SERIF}`; c.textBaseline = 'middle'; c.fillStyle = s.color || palette.text;
      c.textAlign = pos.endsWith('r') ? 'right' : 'left';
      const x = pos.endsWith('r') ? vw * (1 - lay.rightMargin) : vw * lay.hudX, y = pos.startsWith('b') ? vh * (1 - lay.hudY) : vh * lay.hudY;
      c.fillText(s.text, x, y); c.textAlign = 'left'; c.globalAlpha = 1;
    }
  },
};
