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

  drawAll(ui, script, t, lay, vw, vh, palette, pxScale) {
    if (!script) return;
    const c = ui.screen(pxScale);
    // ---- 字幕 ----
    for (const s of (script.subtitles || [])) {
      if (t < s.t || t > s.end) continue;
      const k = this.env(t, s.t, s.end, 0.28, 0.18); if (k <= 0) continue;
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
      c.globalAlpha = k * 0.85; c.font = `${lay.hudSize + 2}px ${FX.FONT_SERIF}`; c.textBaseline = 'middle'; c.fillStyle = palette.text;
      c.fillText(s.text, vw * lay.hudX, vh * lay.hudY); c.globalAlpha = 1;
    }
  },
};
