#!/usr/bin/env node
// ============================================================
// fxlab 渲染器（命令行）
// 用法：node fxlab/engine/render.cjs <场景目录> [选项]
//   --final          最终渲染 1920×1080 30fps（默认预览 960×540 24fps）
//   --layout 9:16    竖版（只改取景与字幕位置）
//   --out <文件>     输出 mp4 路径（默认 场景目录/out/<场景名>_<540p|1080p>.mp4）
//   --stills 1,3,5   只渲染这几个时刻的关键帧，拼成联系图 build/.../contact.png，不出视频
//   --seg 240        每段帧数（分段渲染，已完成的段会自动跳过 = 断点续跑）
//   --sim            只跑模拟，产出 events.json
//   --no-audio       不合成声音
//   --both           额外输出「_无音乐」版本（只含音效）
// 流程：模拟 → events.json → 分段渲染帧 → ffmpeg 拼接 → audio.py 合成 → 混流
// ============================================================
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }

const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const sceneDir = path.resolve(argv.find(a => !a.startsWith('--') && !argv.includes('--' + a) && fs.existsSync(a)) || '');
if (!sceneDir || !fs.existsSync(path.join(sceneDir, 'scene.js'))) { console.error('请提供包含 scene.js 的场景目录'); process.exit(1); }
const FINAL = flag('--final'), LAYOUT = opt('--layout', '16:9'), SEG = +opt('--seg', 240);
const ROOT = path.resolve(__dirname, '..');
const sceneName = path.basename(sceneDir);
const W0 = FINAL ? 1920 : 960, H0 = FINAL ? 1080 : 540; const [W, H] = LAYOUT === '9:16' ? [H0, W0] : [W0, H0]; const FPS = FINAL ? 30 : 24;
const tag = `${FINAL ? '1080p' : '540p'}_${LAYOUT.replace(':', 'x')}`;
const build = path.join(ROOT, 'build', sceneName, tag); fs.mkdirSync(build, { recursive: true });
const outFile = path.resolve(opt('--out', path.join(sceneDir, 'out', `${sceneName}_${FINAL ? '1080p' : '540p'}${LAYOUT === '9:16' ? '_9x16' : ''}.mp4`)));
const script = fs.existsSync(path.join(sceneDir, 'script.json')) ? JSON.parse(fs.readFileSync(path.join(sceneDir, 'script.json'), 'utf8')) : {};
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('页面错误:', e.message); });
  await page.goto('file://' + path.join(__dirname, 'web', 'index.html'));
  for (const f of fs.readdirSync(path.join(ROOT, 'presets')).filter(f => f.endsWith('.js')).sort()) await page.addScriptTag({ path: path.join(ROOT, 'presets', f) });
  await page.addScriptTag({ path: path.join(sceneDir, 'scene.js') });
  const fontOk = await page.evaluate(() => window.__fontsReady);
  const info = await page.evaluate(([W, H, FPS, LAYOUT, script]) => { const r = FX.Runner.setup({ W, H, fps: FPS, layout: LAYOUT }); FX.Runner.load(FX.currentScene, script); return { renderer: r, n: FX.Runner.nFrames, dur: FX.Runner.duration }; }, [W, H, FPS, LAYOUT, script]);
  log(`场景 ${sceneName}  ${W}×${H} @${FPS}fps  ${info.n} 帧 / ${info.dur}s  字体:${fontOk ? 'OK' : '缺失'}  GL: ${info.renderer.slice(0, 40)}`);
  return { page, n: info.n, dur: info.dur };
}
function ffmpegSeg(file) {
  const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-vf', 'vflip', '-c:v', 'libx264', '-preset', FINAL ? 'slow' : 'veryfast', '-crf', FINAL ? '16' : '20', '-pix_fmt', 'yuv420p', '-g', String(FPS), file];
  return spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
}
async function renderRange(page, a, b, onFrame) {
  for (let f = a; f < b; f++) { const b64 = await page.evaluate(f => FX.Runner.renderFrame(f), f); await onFrame(Buffer.from(b64, 'base64'), f); }
}
function run(cmd, args) { const r = spawnSync(cmd, args, { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`${cmd} 失败`); }

(async () => {
  const browser = await pw.chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--hide-scrollbars', '--font-render-hinting=none'] });
  const { page, n, dur } = await openPage(browser);
  // ---- 关键帧联系图 ----
  if (opt('--stills')) {
    const times = opt('--stills').split(',').map(Number); const files = [];
    for (const t of times) { const f = Math.min(n - 1, Math.round(t * FPS)); await page.evaluate(f => FX.Runner.renderFrame(f), f); const file = path.join(build, `still_${t}s.png`); await page.screenshot({ path: file }); files.push(file); }
    const contact = path.join(build, 'contact.png'); run('python3', [path.join(__dirname, 'contact.py'), contact, ...files]); log('联系图:', contact);
    await browser.close(); return;
  }
  // ---- 模拟 → 事件日志 ----
  const t0 = Date.now(); const ev = await page.evaluate(() => FX.Runner.simulate()); fs.writeFileSync(path.join(build, 'events.json'), JSON.stringify(ev));
  log(`模拟完成：${ev.events.length} 个事件（${((Date.now() - t0) / 1000).toFixed(1)}s）→ ${path.join(build, 'events.json')}`);
  if (flag('--sim')) { await browser.close(); return; }
  // ---- 分段渲染（已存在的段跳过）----
  const segs = []; for (let a = 0; a < n; a += SEG) segs.push([a, Math.min(n, a + SEG)]);
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i], file = path.join(build, `seg_${String(i).padStart(3, '0')}.mp4`), tmp = file + '.part.mp4';
    if (fs.existsSync(file)) { log(`段 ${i + 1}/${segs.length} 已存在，跳过`); continue; }
    const ts = Date.now(); const ff = ffmpegSeg(tmp);
    await renderRange(page, a, b, async (buf) => { if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); });
    ff.stdin.end(); await new Promise(r => ff.on('close', r)); fs.renameSync(tmp, file);
    log(`段 ${i + 1}/${segs.length} 帧 ${a}-${b - 1} 完成，${((Date.now() - ts) / (b - a)) | 0} ms/帧`);
  }
  await browser.close();
  // ---- 拼接 ----
  const list = path.join(build, 'segs.txt'); fs.writeFileSync(list, segs.map((_, i) => `file 'seg_${String(i).padStart(3, '0')}.mp4'`).join('\n'));
  const silent = path.join(build, 'video_silent.mp4'); run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (flag('--no-audio')) { fs.copyFileSync(silent, outFile); log('输出（无声）:', outFile); return; }
  // ---- 声音：numpy 合成 sfx / music / mix ----
  run('python3', ['-I', path.join(__dirname, 'audio.py'), path.join(build, 'events.json'), build]);
  const mux = (wav, out) => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out]);
  mux(path.join(build, 'mix.wav'), outFile); log('输出:', outFile);
  if (flag('--both')) { const o2 = outFile.replace(/\.mp4$/, '_无音乐.mp4'); mux(path.join(build, 'sfx.wav'), o2); log('输出（无音乐）:', o2); }
  if (flag('--both')) for (const w of ['sfx.wav', 'music.wav', 'mix.wav']) fs.copyFileSync(path.join(build, w), path.join(path.dirname(outFile), w));
})().catch(e => { console.error(e); process.exit(1); });
