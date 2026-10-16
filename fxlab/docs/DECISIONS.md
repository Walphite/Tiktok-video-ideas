# 技术选型与基准结果（阶段 0）

## 机器情况（云端容器，2026-10-16）
| 项目 | 结果 |
|---|---|
| CPU | 4 核，内存 15 GB |
| GPU | 无（无 nvidia-smi，无 /dev/dri） |
| Node | v22.22.0（全局已装 playwright 1.56.1） |
| Python | 3.13，numpy 2.5.3，Pillow 12.3（可用 pip 装 scipy 等） |
| ffmpeg | 6.1.1，带 libx264 / aac |
| Chromium | Playwright 自带的 Chromium（/opt/pw-browsers），无头模式下 WebGL 走 SwiftShader 软件渲染 |
| 字体 | 容器原本只有文泉驿正黑 + DejaVu；已下载 Noto Serif CJK SC Bold 到 fxlab/assets/fonts/ 并注册到系统字体 |

## 基准测试（fxlab/bench/，2 万个带辉光粒子，每帧更新，含泛光 + 噪点 + 暗角后期）
| 分辨率 | 每帧总耗时 | 其中 WebGL 绘制 | 其中读回像素 | 备注 |
|---|---|---|---|---|
| 960×540 | ≈ 0.20 秒 | ≈ 0.15 秒（含软件光栅） | 读回已计入 | 用 PNG 截图则 0.24 秒 |
| 1920×1080 | ≈ 0.57 秒 | ≈ 0.44 秒 | 读回已计入 | 用 PNG 截图则 0.74 秒 |

折算：64 秒成片，540p/24fps 预览 ≈ 1536 帧 ≈ 5 分钟；1080p/30fps 成片 ≈ 1920 帧 ≈ 18–20 分钟（分段跑，支持断点续跑）。

## 决定
1. **采用首选方案**：无头 Chromium + WebGL，确定性逐帧步进（画面只由帧号 + 固定随机种子决定），每帧读回原始像素直接管道送进 ffmpeg（不走 PNG，省 30%）。
2. **不需要降粒子数**：1080p 每帧 0.57 秒，远低于 3 秒的红线，2 万粒子 + 辉光按原设计保留。
3. 无头 Chromium 启动参数固定为 `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`，这样在任何没有 GPU 的机器上结果一致。
4. 声音用 Python numpy 合成（已就绪），不需要额外依赖。
5. **在你自己电脑上渲染是否更合适**：不必要。云端 1080p 约 20 分钟一支，可接受。若你的电脑有独立显卡，同一套代码跑起来会快 5–10 倍，但画面因 GPU 浮点差异可能有肉眼不可见的微小差别；预览和定稿都在云端做即可，结果可复现。

## 已知限制
- SwiftShader 是软件渲染，粒子数翻倍到 4 万时 1080p 预计约 1 秒/帧，仍可接受；超过 10 万需改方案（GPU 实例或分层渲染）。
- 容器闲置会被回收，所以每个阶段的产物都要提交到仓库。

## 阶段 1：引擎结构（已验证整条音画管线）
| 文件 | 作用 |
|---|---|
| engine/web/core.js | 公共工具：固定种子随机数、调色板（深海夜 / 撞色块）、16:9 与 9:16 版面、缓动 |
| engine/web/particles.js | 粒子池（定长数组，2 万粒子不产生垃圾内存） |
| engine/web/gl.js | WebGL：点精灵粒子（光晕 / 实心 / 圆环）、2D 图层合成、后期（泛光、色差、震屏、光带、闪白、暗角、噪点） |
| engine/web/layers.js | 三层 2D 画布：bg（粒子下）、fg（粒子上）、ui（字幕/HUD，不受后期） |
| engine/web/text.js | 字幕与 HUD，全部读 script.json；**关键词** 用强调色；粗宋体 Noto Serif CJK |
| engine/web/runner.js | 时间线：按固定步长顺序推进，`simulate()` 只跑物理产出事件日志，`renderFrame(f)` 可从头重算任意帧 |
| engine/render.cjs | 命令行：模拟 → 分段渲染（已完成的段自动跳过 = 断点续跑）→ 拼接 → 调 audio.py → 混流 |
| engine/audio.py | numpy 合成：读事件日志，按「事件类型 → 乐器」映射出声，分轨 sfx / music / mix |
| engine/contact.py | 关键帧联系图 |

音画同源的做法：预设在物理里 `ctx.emit({type, pitch, vel, x})` 记一条事件，画面在同一时刻闪光/火花，声音脚本读同一份 events.json 在同一时间点出声，不会有先后误差。
预览 540p 实测约 0.13 秒/帧（带字幕与 2D 图层），7 秒片段连声音约 25 秒出片。
依赖新增：scipy（音频滤波）。
