// 基准：用无头 Chromium 渲染 2 万粒子 + 辉光，测每帧耗时，并把帧送进 ffmpeg
const { spawnSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const OUT = process.argv[2] || path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await pw.chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--hide-scrollbars'] });
  const results = {};
  for (const [W, H] of [[960, 540], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(__dirname, 'bench.html'));
    const renderer = await page.evaluate(([w, h]) => window.setup(w, h), [W, H]);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', '30', '-i', '-', '-vf', 'vflip', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(OUT, `bench_${H}p.mp4`)]);
    const draw = [], read = [], shot = [], total = [];
    for (let f = 0; f < 30; f++) {
      const t0 = Date.now();
      const d = await page.evaluate(f => window.renderFrame(f), f); draw.push(d);
      const t1 = Date.now();
      const b64 = await page.evaluate(() => window.readRaw()); const buf = Buffer.from(b64, 'base64');
      const t2 = Date.now(); read.push(t2 - t1);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f < 5) { const s0 = Date.now(); await page.screenshot({ type: 'png', path: path.join(OUT, `shot_${H}p_${f}.png`) }); shot.push(Date.now() - s0); }
      total.push(Date.now() - t0);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0);
    results[`${H}p`] = { renderer, draw_ms: avg(draw), readback_ms: avg(read), png_screenshot_ms: avg(shot), total_ms_per_frame: avg(total) };
    console.log(`${W}x${H}`, results[`${H}p`]);
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'bench.json'), JSON.stringify(results, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
