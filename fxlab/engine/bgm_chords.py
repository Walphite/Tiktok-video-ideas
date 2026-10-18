#!/usr/bin/env python3
"""BGM 和弦估计（每小节一个三和弦）+ 10Hz 色度曲线，供音效选音与自检使用。
用法：python3 -I bgm_chords.py <FLAC> <bgm_analysis.json> <输出 bgm_chords.json>
FLAC 只读（ffmpeg 解码到临时目录）。方法：调音校正后的谐波色度 + 低频根音色度，对 24 个大小三和弦模板打分，
小节边界取自 bgm_analysis.json 的强拍；对调内三和弦给很小的先验加分，再做 Viterbi 平滑，避免单小节误判。"""
import sys, json, subprocess, tempfile, os
import numpy as np, librosa

SRC, ANA, OUT = sys.argv[1:4]
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
ana = json.load(open(ANA, encoding='utf-8')); key = ana['key']; tuning = ana['tuning_semitones']; scale = set(key['scale_pitch_classes'])
with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, 'm.wav'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', SRC, '-vn', '-ac', '1', '-ar', '22050', wav], check=True); y, sr = librosa.load(wav, sr=22050)
hop = 512; h = librosa.effects.harmonic(y)
ch = librosa.feature.chroma_cqt(y=h, sr=sr, hop_length=hop, tuning=tuning)
bass = librosa.feature.chroma_cqt(y=h, sr=sr, hop_length=hop, tuning=tuning, fmin=librosa.note_to_hz('C1'), n_octaves=3)
ft = librosa.frames_to_time(np.arange(ch.shape[1]), sr=sr, hop_length=hop); dur = len(y) / sr
db = [0.0] + [t for t in ana['downbeat_times'] if t > 0.5] + [dur]; bars = [(db[i], db[i + 1]) for i in range(len(db) - 1)]
# 模板：根音 1.0，五音 0.8，三音 0.9
temps = []; names = []
for r in range(12):
    for q, third in (('', 4), ('m', 3)):
        t = np.zeros(12); t[r] = 1.0; t[(r + third) % 12] = 0.9; t[(r + 7) % 12] = 0.8; temps.append(t / np.linalg.norm(t)); names.append((r, q))
diat = set()  # 调内三和弦先验（自然小调 i、III、iv、v、VI、VII 及属 V）
for r in range(12):
    for q, third in (('', 4), ('m', 3)):
        if all(((r + i) % 12) in scale for i in (0, third, 7)): diat.add((r, q))
S = np.zeros((len(bars), 24))
for i, (a, b) in enumerate(bars):
    m = (ft >= a) & (ft < b); c = ch[:, m].mean(1); c = c / (np.linalg.norm(c) + 1e-9); bs = bass[:, m].mean(1); bs = bs / (bs.sum() + 1e-9)
    for k, (r, q) in enumerate(names): S[i, k] = float(temps[k] @ c) + 0.35 * bs[r] + (0.04 if (r, q) in diat else 0)
# Viterbi：保持同一和弦有小幅奖励
stay = 0.03; dp = S[0].copy(); bp = np.zeros((len(bars), 24), int)
for i in range(1, len(bars)):
    nd = np.zeros(24)
    for k in range(24):
        cand = dp + stay * (np.arange(24) == k); j = int(np.argmax(cand)); bp[i, k] = j; nd[k] = cand[j] + S[i, k]
    dp = nd
path = [int(np.argmax(dp))]
for i in range(len(bars) - 1, 0, -1): path.append(bp[i, path[-1]])
path = path[::-1]; out = []
for i, (a, b) in enumerate(bars):
    r, q = names[path[i]]; third = 3 if q == 'm' else 4; order = np.argsort(-S[i]); ru = names[order[1] if order[0] == path[i] else order[0]]
    out.append({'bar': i, 'start': round(a, 3), 'end': round(b, 3), 'name': NAMES[r] + q, 'root_pc': r, 'quality': 'minor' if q == 'm' else 'major', 'pcs': [r, (r + third) % 12, (r + 7) % 12], 'score': round(float(S[i, path[i]]), 3), 'runner_up': NAMES[ru[0]] + ru[1], 'in_key': (r, q) in diat})
step = 0.1; tt = np.arange(0, dur, step); cs = np.array([ch[:, (ft >= t) & (ft < t + step)].mean(1) if ((ft >= t) & (ft < t + step)).any() else np.zeros(12) for t in tt])
json.dump({'file': 'fxlab/assets/Luv4.flac', 'tuning_cents': ana['tuning_cents'], 'key': f"{key['tonic']} {key['mode']}", 'bars': out, 'chroma_step_s': step, 'chroma_pc_order': NAMES, 'chroma': [[round(float(v), 3) for v in row] for row in cs]}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), 'bars'); print(' '.join(f"{c['start']:.0f}:{c['name']}" for c in out[:40]))
