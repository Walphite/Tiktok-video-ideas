#!/usr/bin/env python3
"""参考视频拆解（只分析，不生成特效）：每秒亮度 / 运动量 / 响度、联系图、k-means 主色、节拍与声音事件。
用法：python3 -I ref_analyze.py <视频> <中间产物目录> <联系图输出目录>
需要 build 目录里已有 small30.rgb（160x90@30fps RGB）与 audio.wav（22.05k 单声道），由命令行 ffmpeg 预先生成。"""
import sys, os, json, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from sklearn.cluster import KMeans
VID, O, SHEETS = sys.argv[1:4]; os.makedirs(SHEETS, exist_ok=True)
W, H = 160, 90; fr = np.fromfile(os.path.join(O, 'small30.rgb'), np.uint8); n = len(fr) // (W * H * 3); fr = fr[:n * W * H * 3].reshape(n, H, W, 3).astype(np.float32); FPS = 30
dur = n / FPS; luma = (0.2126 * fr[..., 0] + 0.7152 * fr[..., 1] + 0.0722 * fr[..., 2]) / 255
sec = int(np.ceil(dur)); out = {'duration_s': round(dur, 2), 'seconds': []}
md = np.concatenate([[0], np.abs(np.diff(luma, axis=0)).mean((1, 2))])  # 帧差（亮度，0..1）
cuts = [float(x) for x in open(os.path.join(O, 'cuts_0.30.txt')).read().split()]
for s in range(sec):
    a, b = s * FPS, min(n, (s + 1) * FPS); m = md[a:b].copy()
    for c in cuts:  # 硬切造成的单帧尖峰不算运动
        i = int(round(c * FPS)) - a
        if 0 <= i < len(m): m[max(0, i - 1):i + 2] = 0
    out['seconds'].append({'t': s, 'luma': round(float(luma[a:b].mean()), 3), 'motion': round(float(m.mean() * 100), 2)})
# ---- 联系图：每秒一帧，16 帧一张（4×4），标注时间 ----
def frame_at(t):
    i = min(n - 1, int(t * FPS)); return Image.fromarray(fr[i].astype(np.uint8))
def hq_frame(t, w=320):
    p = os.path.join(O, f'f_{t:.2f}.png'); subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{t:.3f}', '-i', VID, '-frames:v', '1', '-vf', f'scale={w}:-1', p], check=True); return Image.open(p).convert('RGB')
def sheet(times, path, cols=4):
    ims = [hq_frame(t) for t in times]; w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols; S = Image.new('RGB', (cols * w, rows * (h + 18)), (20, 20, 20)); d = ImageDraw.Draw(S)
    for k, (t, im) in enumerate(zip(times, ims)): x, y = (k % cols) * w, (k // cols) * (h + 18); S.paste(im, (x, y + 18)); d.text((x + 4, y + 3), f'{t:.1f}s', fill=(255, 255, 0))
    S.save(path)
for k in range(4): sheet([k * 16 + i + 0.5 for i in range(16) if k * 16 + i + 0.5 < dur], os.path.join(SHEETS, f'contact_{k + 1}.png'))
# ---- 关键转场：切点前 0.5 秒起每 0.1 秒一帧，共 10 帧 ----
for ci, c in enumerate(cuts): sheet([max(0, c - 0.5 + 0.1 * i) for i in range(10)], os.path.join(SHEETS, f'transition_{ci + 1}_{c:.2f}s.png'), cols=5)
# ---- 镜头区间与 k-means 主色 ----
bounds = [0.0] + cuts + [dur]; shots = []
rng = np.random.RandomState(0)
for i in range(len(bounds) - 1):
    a, b = bounds[i], bounds[i + 1]; ia, ib = int((a + 0.15) * FPS), max(int((a + 0.15) * FPS) + 1, int((b - 0.1) * FPS)); idx = np.linspace(ia, ib - 1, min(24, ib - ia)).astype(int); px = fr[idx].reshape(-1, 3)
    px = px[rng.choice(len(px), min(20000, len(px)), replace=False)]; km = KMeans(5, n_init=4, random_state=0).fit(px); cnt = np.bincount(km.labels_, minlength=5); order = np.argsort(-cnt)
    cols_ = ['#%02X%02X%02X' % tuple(int(v) for v in km.cluster_centers_[j]) for j in order]; share = [round(float(cnt[j] / cnt.sum()), 2) for j in order]
    fgp = px[(0.2126 * px[:, 0] + 0.7152 * px[:, 1] + 0.0722 * px[:, 2]) / 255 > 0.30]  # 前景（亮于背景）像素单独聚 5 色，背景黑会吃掉主色
    fgc = []
    if len(fgp) > 200: kf = KMeans(5, n_init=4, random_state=0).fit(fgp); cf = np.bincount(kf.labels_, minlength=5); fgc = ['#%02X%02X%02X' % tuple(int(v) for v in kf.cluster_centers_[j]) for j in np.argsort(-cf)]
    seg = slice(int(a * FPS), min(n, int(b * FPS))); shots.append({'start': round(a, 2), 'end': round(b, 2), 'len': round(b - a, 2), 'colors': cols_, 'fg_colors': fgc, 'share': share, 'mean_luma': round(float(luma[seg].mean()), 3), 'mean_motion': round(float(md[seg].mean() * 100), 2)})
out['shots'] = shots; out['cuts'] = cuts
# ---- 字幕带变化检测：底部 28% 区域里的亮像素掩码，相似度骤降 = 换一句 ----
band = luma[:, int(H * 0.68):, :] > 0.8; ink = band.mean((1, 2)); chg = []
for i in range(1, n):
    A, B = band[i - 1], band[i]; u = (A | B).sum()
    if u > 30 and (A & B).sum() / u < 0.35: chg.append(i / FPS)
out['bottom_band_ink_by_sec'] = [round(float(ink[s * FPS:(s + 1) * FPS].mean()), 3) for s in range(sec)]; out['bottom_band_changes'] = [round(c, 2) for c in chg]
# ---- 声音 ----
import librosa
y, sr = librosa.load(os.path.join(O, 'audio.wav'), sr=22050); out['audio_rms_db_by_sec'] = [round(float(10 * np.log10((y[s * sr:(s + 1) * sr] ** 2).mean() + 1e-12)), 1) for s in range(int(len(y) / sr))]
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512); tempo, bf = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=512); out['tempo_bpm'] = round(float(np.atleast_1d(tempo)[0]), 1); out['beats'] = [round(float(t), 2) for t in librosa.frames_to_time(bf, sr=sr, hop_length=512)]
on = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=512, units='time', delta=0.25); strg = oenv[librosa.time_to_frames(on, sr=sr, hop_length=512)]; top = np.argsort(-strg)[:25]
out['strong_onsets'] = sorted([[round(float(on[i]), 2), round(float(strg[i]), 1)] for i in top]); out['onset_count'] = int(len(on))
sc = librosa.feature.spectral_centroid(y=y, sr=sr)[0]; out['centroid_hz_by_5s'] = [round(float(sc[int(t * sr / 512):int((t + 5) * sr / 512)].mean())) for t in range(0, int(len(y) / sr), 5)]
json.dump(out, open(os.path.join(O, 'ref01.json'), 'w'), ensure_ascii=False, indent=1); print('ok', n, 'frames', len(cuts), 'cuts')
