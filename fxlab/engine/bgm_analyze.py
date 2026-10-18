#!/usr/bin/env python3
"""BGM 分析：用 ffmpeg 直接读取 FLAC（只读），输出速度、节拍、调式、能量曲线、段落、最强上扬。
用法：python3 -I bgm_analyze.py <flac> <输出 json>
原文件只读，不写回；解码结果放在临时目录。"""
import sys, json, subprocess, tempfile, os
import numpy as np, librosa

SRC, OUT = sys.argv[1], sys.argv[2]
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])  # Krumhansl-Kessler
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
SCALE_IV = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10]}

with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, 'mono.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', SRC, '-vn', '-ac', '1', '-ar', '22050', wav], check=True)
    y, sr = librosa.load(wav, sr=22050, mono=True)
dur = len(y) / sr
hop = 512
# ---- 速度与节拍 ----
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo, beat_frames = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, tightness=120)
tempo = float(np.atleast_1d(tempo)[0]); beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
# 小节首拍（强拍）：在 4 个相位里选低频能量 + onset 最强的一个
S = np.abs(librosa.stft(y, hop_length=hop)); low = S[:12].sum(0)
bs = np.array([oenv[f] / (oenv.max() + 1e-9) + low[f] / (low.max() + 1e-9) for f in beat_frames])
phase = int(np.argmax([bs[p::4].mean() for p in range(4)])); downbeats = beats[phase::4]
# ---- 调式 ----
chroma = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(y), sr=sr, hop_length=hop).mean(1)
scores = []
for m, prof in (('major', MAJOR), ('minor', MINOR)):
    for k in range(12): scores.append((float(np.corrcoef(chroma, np.roll(prof, k))[0, 1]), k, m))
allsc = {(k, m): sc for sc, k, m in scores}
scores.sort(reverse=True); r, tonic, mode = scores[0]
def rel(k, m): return ((k + 3) % 12, 'major') if m == 'minor' else ((k + 9) % 12, 'minor')  # 相对大小调
def cand(sc, k, m): rk, rm = rel(k, m); return {'key': f'{NAMES[k]} {m}', 'r': round(sc, 3), 'relative': f'{NAMES[rk]} {rm}', 'relative_r': round(allsc[(rk, rm)], 3)}
scale_pcs = [(tonic + i) % 12 for i in SCALE_IV[mode]]
triad_iv = [0, 4, 7] if mode == 'major' else [0, 3, 7]
triad_pcs = [(tonic + i) % 12 for i in triad_iv]
tri_scores = {}
for k in range(12):
    for m, iv in (('major', [0, 4, 7]), ('minor', [0, 3, 7])): tri_scores[NAMES[k] + ('' if m == 'major' else 'm')] = float(chroma[[(k + i) % 12 for i in iv]].sum())
main_chord = max(tri_scores, key=tri_scores.get)  # 受贝斯根音影响，仅供参考；主和弦取主音三和弦
tuning = float(librosa.estimate_tuning(y=y, sr=sr, resolution=0.01))  # 相对 A4=440Hz 的偏移（半音）
# ---- 能量曲线与段落 ----
rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]; t_rms = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
edb = 20 * np.log10(rms + 1e-6); step = 0.25; tt = np.arange(0, dur - 0.5, step); E = np.array([edb[(t_rms >= t) & (t_rms < t + step)].mean() for t in tt])
Es = np.convolve(E, np.ones(3) / 3, mode='same')
def mean_rng(a, b): i0, i1 = int(a / step), int(b / step); return Es[max(0, i0):max(1, i1)].mean() if i1 > i0 else Es[max(0, i0)]
rise = np.array([mean_rng(t, t + 3) - mean_rng(t - 4, t) if t >= 4 and t + 3 < dur else -99 for t in tt])
# 上扬时刻 = 能量上升段里 onset 最强的那一拍（落在强拍上）
def snap_down(t): return float(downbeats[np.argmin(np.abs(downbeats - t))])
cands = []
for i in np.argsort(-rise)[:400]:
    t = float(tt[i])
    if all(abs(t - c['rise_start']) > 6 for c in cands): cands.append({'rise_start': round(t, 3), 'rise_db': round(float(rise[i]), 2)})
    if len(cands) >= 8: break
for c in cands:
    seg = (t_rms >= c['rise_start'] - 1) & (t_rms <= c['rise_start'] + 4); oi = librosa.time_to_frames(c['rise_start'], sr=sr, hop_length=hop)
    w0, w1 = int(max(0, oi - 43)), int(min(len(oenv), oi + 130)); peak_t = float(librosa.frames_to_time(w0 + int(np.argmax(oenv[w0:w1])), sr=sr, hop_length=hop))
    c['onset_peak'] = round(peak_t, 3); c['strong_beat'] = round(snap_down(peak_t), 3)
fe = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13); cs = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
feat = librosa.util.normalize(np.vstack([librosa.util.normalize(fe, axis=1), librosa.util.normalize(cs, axis=1)]), axis=1)
nseg = 8; bounds = librosa.segment.agglomerative(feat, nseg); btimes = librosa.frames_to_time(bounds, sr=sr, hop_length=hop).tolist() + [dur]
segs = [{'start': round(btimes[i], 2), 'end': round(btimes[i + 1], 2), 'mean_db': round(float(np.mean(E[(tt >= btimes[i]) & (tt < btimes[i + 1])])), 2)} for i in range(nseg)]
res = {
    'tuning_semitones': round(tuning, 2), 'tuning_cents': round(tuning * 100, 1), 'tuning_note': 'BGM 比标准音高低约 %d 音分；音效频率按此偏移，避免与 BGM 打架' % round(tuning * 100),
    'file': 'fxlab/assets/Luv4.flac', 'duration_s': round(dur, 3),
    'tempo_bpm': round(tempo, 2), 'beat_times': [round(float(b), 3) for b in beats], 'downbeat_times': [round(float(b), 3) for b in downbeats], 'downbeat_phase': phase,
    'key': {'tonic': NAMES[tonic], 'tonic_pc': int(tonic), 'mode': mode, 'confidence_r': round(r, 3), 'scale_pitch_classes': scale_pcs, 'scale_names': [NAMES[p] for p in scale_pcs],
            'tonic_triad_pcs': triad_pcs, 'tonic_triad': NAMES[tonic] + ('' if mode == 'major' else 'm'), 'main_chord': NAMES[tonic] + ('' if mode == 'major' else 'm'), 'best_triad_by_chroma': main_chord, 'runner_up_keys': [f'{NAMES[k]} {m} ({s:.2f})' for s, k, m in scores[1:4]],
            'candidates': [cand(sc, k, m) for sc, k, m in scores[:6]], 'margin_over_runner_up': round(scores[0][0] - scores[1][0], 3),
            'note': '相对大小调含相同的七个音；主音由低频根音与终止感判断（贝斯根音 F 最强）'},
    'energy_db': {'step_s': step, 'values': [round(float(v), 2) for v in E]},
    'segments': segs, 'uplift_candidates': cands,
}
json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps({k: res[k] for k in ('duration_s', 'tempo_bpm', 'key', 'segments', 'uplift_candidates')}, ensure_ascii=False, indent=1)); print('beats', len(beats), 'first downbeats', res['downbeat_times'][:5])
