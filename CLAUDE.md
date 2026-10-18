# fxlab：粒子特效素材库 + 短视频流水线（详见 fxlab/docs/BRIEF.md、DECISIONS.md）
- 结构：fxlab/engine（web 引擎 + render.cjs 渲染 + audio.py 合成）、presets（每特效一个文件，参数在顶部）、scenes/<片名>/{scene.js,script.json}、previews、docs。
- 渲染：无头 Chromium + WebGL(SwiftShader)，逐帧管道送 ffmpeg；画面是帧号的纯函数，随机数固定种子，重跑一致。
- 音画同源：物理先跑出事件日志 events.json，画面闪光与声音都读它；不要为踩拍把声音挪离画面事件。
- 文案一律写进 script.json（含 **强调词**），代码里不写死字幕；数学表述不得改写。
- 迭代只用 540p/24fps 预览，只重渲染受影响的场景，每处最多改一轮；最终才渲 1080p/30fps（分段、可断点续跑）。
- 看图用 engine/contact.py 出联系图，每场景最多 3 帧。
- 调色板：深海夜 / 撞色块；语义色：灰=有理数，黄=无理数，蓝=「那一层」，朱红仅用于印章与冲击。
- 不动引擎改画面时，只改 scenes/ 下的脚本与 script.json。
## 新建一支视频的步骤
1. 在 scenes/ 新建 <片名>/，写 script.json（分镜、字幕、HUD 文案）。
2. 写 scene.js：按时间线调用 presets 里的预设，必要时在 presets/ 新增预设。
3. 用 render.cjs 渲染 540p 预览，看联系图，按幕修一轮。
4. 确认后渲 1080p，输出带音乐与无音乐两版及 sfx/music/mix.wav，提交推送。
