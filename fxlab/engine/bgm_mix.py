#!/usr/bin/env python3
"""阶段 B：BGM 窗口选取 + 音效按 BGM 调式重配音高 + 混音（压低 / 响度）+ 换音轨。
用法：python3 -I bgm_mix.py <FLAC> <bgm_analysis.json> <events.json> <无声视频.mp4> <输出目录> <预览视频输出前缀>
- FLAC 只读；所有结果写入新文件（bgm_trimmed.wav / sfx.wav / mix.wav / 两个 540p 预览）
- 音效时间严格取自 events.json（音画同源），不为踩拍移动；对齐只通过 BGM 窗口起点完成
- bgm_trimmed.wav 只做裁切与淡入淡出（线性），不变速、不变调、不均衡、不滤波
- 压低（3–6 dB，约 150 ms）与响度统一只在 mix.wav 里做
"""
import sys, os, json, math, subprocess, importlib.util, hashlib
import numpy as np, soundfile as sf

FLAC, ANA, EVT, VIDEO, OUTDIR, PREVIEW = sys.argv[1:7]
SR = 48000; FADE_IN, FADE_OUT, DUR = 1.5, 3.0, 64.0; T_DUST = 56.0
spec = importlib.util.spec_from_file_location('fxaudio', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'audio.py')); A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)
ana = json.load(open(ANA, encoding='utf-8')); ev = json.load(open(EVT, encoding='utf-8'))
key = ana['key']; TUNE = ana['tuning_semitones']; PCS = set(key['scale_pitch_classes'])
os.makedirs(OUTDIR, exist_ok=True)

# ---------- 读取 FLAC（ffmpeg 直接解码，只读）----------
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', FLAC, '-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
bgm = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64); total = len(bgm) / SR

# ---------- B2：自动搜索起点 ----------
# 上扬 = 能量上升段里最强的一次起音。窗口 [s, s+64] 要落在曲内 → 上扬时刻必须在 [56, 总长-8]
def flux_peak(center, half=0.25):
    i0, i1 = int((center - half) * SR), int((center + half) * SR); x = bgm[i0 - 2048:i1 + 2048].mean(1); n, hop = 1024, 64; win = np.hanning(n); prev = None; best = (0, center)
    for i in range(0, len(x) - n, hop):
        m = np.abs(np.fft.rfft(x[i:i + n] * win)); f = float(np.maximum(m - prev, 0).sum()) if prev is not None else 0.0; prev = m; t = (i0 - 2048 + i + n / 2) / SR
        if i0 / SR <= t <= i1 / SR and f > best[0]: best = (f, t)
    return best[1]
cands = []
for c in ana['uplift_candidates']:
    c = dict(c); c['feasible'] = bool(56.0 <= c['onset_peak'] <= total - 8.0); cands.append(c)
best = max([c for c in cands if c['feasible']], key=lambda c: c['rise_db']); strongest = max(cands, key=lambda c: c['rise_db'])
t_attack = flux_peak(best['onset_peak']); start = t_attack - T_DUST
i_start = int(round(start * SR)); seg = bgm[i_start:i_start + int(DUR * SR)].copy(); assert len(seg) == int(DUR * SR)
tr = seg.copy(); n_in, n_out = int(FADE_IN * SR), int(FADE_OUT * SR)
tr[:n_in] *= np.linspace(0, 1, n_in)[:, None]; tr[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
sf.write(os.path.join(OUTDIR, 'bgm_trimmed.wav'), tr, SR, subtype='PCM_24')

# ---------- B3：音高取自 BGM 调式音阶（F 小调，音分偏移 TUNE）----------
SC = [m for m in range(24, 120) if m % 12 in PCS]
def deg(root, n): return SC[SC.index(root) + n]
def hz(m): return A.midi2hz(m + TUNE)
def snap(m): return min(SC, key=lambda s: (abs(s - m), s))
F = {2: 41, 3: 53, 4: 65, 5: 77, 6: 89}  # 主音 F 在各八度的 MIDI 号
TRIAD = [F[3], F[3] + 7, F[4], F[4] + 3, F[4] + 7]  # 主和弦 Fm：F3 C4 F4 Ab4 C5
assert all(m % 12 in PCS for m in TRIAD) and key['main_chord'] == 'Fm'
DUST_ARP = [F[5], F[5] - 5, F[4] + 3, F[4], F[4] - 5, F[3] + 3, F[3], F[3] - 5]  # F5 C5 Ab4 F4 C4 Ab3 F3 C3：Fm 琶音缓慢下行，首音接上点亮序列的最高音
def softpad(f, decay, vel, rng):  # 柔和延音：慢起音的正弦 + 轻微泛音，无冲击
    n = int(A.SR * decay * 3); t = np.arange(n) / A.SR; ph = 2 * np.pi * f * t
    x = np.sin(ph) + 0.35 * np.sin(2 * ph + 0.4) + 0.12 * np.sin(3 * ph); return x * np.minimum(1, t / 0.09) * np.exp(-t / decay) * 0.45
A.INSTR['softpad'] = softpad
P = {  # 事件类型 → (MIDI 音列, 覆盖配置)
    'ping': lambda e: ([deg(F[6], e['pitch'])], {}), 'twinkle': lambda e: ([deg(F[5], e['pitch'])], {}), 'tick': lambda e: ([72], {}),
    'rise': lambda e: ([deg(F[3], e['pitch'])], {}), 'rattle': lambda e: ([deg(F[3], e['pitch'])], {}), 'collapse': lambda e: ([snap(38)], {}), 'stamp': lambda e: ([snap(31)], {}),
    'land': lambda e: ([deg(F[4], e['pitch'] % 7)], {}), 'extinguish': lambda e: ([deg(F[5], e['pitch'])], {}), 'settle': lambda e: ([F[5]], {}),
    'appear': lambda e: ([deg(F[4], e['pitch'])], {}), 'expand': lambda e: ([F[4]], {}), 'layer': lambda e: ([deg(F[3], e['pitch'])], {'gain': 0.3}),
    'chord': lambda e: (TRIAD, {'instr': 'softpad', 'decay': 2.2, 'gain': 0.35, 'track': 'sfx'}),
    'layer_light': lambda e: ([deg(F[4], e['pitch'])], {'instr': 'chime', 'decay': 1.8, 'gain': 0.55, 'track': 'sfx'}),  # 50.0–55.5 沿音阶逐级上行，55.5 到最高音 F5
    'layer_dust': lambda e: ([DUST_ARP[e['pitch']]], {'instr': 'softpad', 'decay': 2.6, 'gain': 0.42, 'track': 'sfx'}),  # 56.0–57.4 柔和延音 + 缓慢下行琶音
    'arrive': lambda e: (TRIAD + [F[5]], {'instr': 'softpad', 'decay': 3.2, 'gain': 0.55, 'track': 'sfx'}),  # 字成型：落在 Fm 主和弦
}
TRIM = {'ping': 1.8, 'twinkle': 2.5, 'tick': 2.0, 'rise': 2.0, 'rattle': 2.0, 'land': 1.5, 'extinguish': 2.5, 'settle': 1.5, 'collapse': 1.2}  # 细碎音效在 BGM 之上仍听得清
sfx = np.zeros((int(SR * (DUR + 0.05)), 2)); rng = np.random.default_rng(12345); onsets = []; cache = {}
for e in ev['events']:
    if e['type'] not in P: continue
    cfg0 = ev['sounds'].get(e['type']); midis, over = P[e['type']](e); cfg = dict(cfg0 or {'instr': 'blip', 'decay': 0.4, 'gain': 0.5}); cfg.update(over)
    instr = A.INSTR[cfg['instr']]; vel = float(e.get('vel', 1.0)); decay = float(cfg['decay']); x = None
    for m in midis:
        k_ = (cfg['instr'], m, round(decay, 3), round(vel, 1))
        if k_ not in cache or cfg['instr'] in ('tick', 'paper', 'rain'): cache[k_] = instr(hz(m), decay, vel, rng)
        y = cache[k_]
        if x is None: x = y.copy()
        else: k = max(len(x), len(y)); z = np.zeros(k); z[:len(x)] += x; z[:len(y)] += y; x = z
    x = x * cfg.get('gain', 0.5) * TRIM.get(e['type'], 1.0) * (0.35 + 0.65 * vel) / math.sqrt(len(midis)); A.add_at(sfx, x, e['t'], (float(e.get('x', 0.5)) - 0.5) * 1.4); onsets.append((e['t'], e['type']))
# 聚字渐强长音：58.0 → 60.0（取 arrive 事件前 2 秒），单音 F4（带八度 F3），音量与亮度逐渐增强，字成型瞬间被主和弦接住
t_arr = [e['t'] for e in ev['events'] if e['type'] == 'arrive'][0]; t_sw = t_arr - 2.0; n = int(2.0 * SR); t = np.arange(n) / SR
vib = 1 + 0.004 * np.sin(2 * np.pi * 5 * t); sw = np.zeros(n)
for m, amp in ((F[4], 1.0), (F[3], 0.6)):
    ph = 2 * np.pi * np.cumsum(hz(m) * vib) / SR; sw += amp * sum(np.sin(k * ph) / k ** 1.4 for k in range(1, 8))
dark = A.lowpass(sw, 900); sw = dark + (A.lowpass(sw, 5000) - dark) * (t / 2.0) ** 1.5
sw = sw * (t / 2.0) ** 2.2 * np.minimum(1, (2.0 - t) / 0.01) * 0.5; A.add_at(sfx, sw, t_sw, 0.0); onsets.append((t_sw, 'swell'))
sfx = np.tanh(sfx * 1.5); pk = np.abs(sfx).max(); sfx *= 0.85 / pk;  # 软限幅，避免大音量音效压住细碎音效
sfx = sfx[:int(DUR * SR)]
sf.write(os.path.join(OUTDIR, 'sfx.wav'), sfx, SR, subtype='PCM_16')

# ---------- B5：混音（只在 mix.wav 里：BGM 压低 + 统一响度）----------
DEPTH = {'minor': 3.0, 'mid': 4.5, 'major': 6.0}; CLASS = {'collapse': 'major', 'stamp': 'major', 'chord': 'major', 'arrive': 'major', 'swell': 'mid', 'layer': 'mid', 'layer_light': 'mid', 'layer_dust': 'mid', 'settle': 'mid', 'appear': 'mid', 'expand': 'mid'}
KR = 1000; g = np.zeros(int(DUR * KR) + 400)  # 压低量（dB，正数 = 压低），1 kHz 分辨率
for t0, ty in onsets:
    d = DEPTH[CLASS.get(ty, 'minor')]; i0 = int(t0 * KR)
    prof = np.concatenate([np.linspace(0, d, 16), np.full(30, d), d * np.linspace(1, 0, 105)[1:]])  # 起 15ms + 持 30ms + 落约 105ms ≈ 150ms
    seg_ = g[i0:i0 + len(prof)]; g[i0:i0 + len(seg_)] = np.maximum(seg_, prof[:len(seg_)])
gain = 10 ** (-np.interp(np.arange(int(DUR * SR)) / SR, np.arange(len(g)) / KR, g) / 20)
mix_raw = tr * gain[:, None] * 0.8 + sfx * 0.9
tmp = os.path.join(OUTDIR, '_mix_raw.wav'); sf.write(tmp, mix_raw, SR, subtype='PCM_24')
st = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr; j = json.loads(st[st.rindex('{'):])
af = f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true"
mix_path = os.path.join(OUTDIR, 'mix.wav'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', af, '-ar', str(SR), '-c:a', 'pcm_s24le', mix_path], check=True); os.remove(tmp)

# ---------- B6：换音轨的 540p 预览 + 仅音效版 ----------
def mux(wav, out): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', VIDEO, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], check=True)
mux(mix_path, PREVIEW + '.mp4'); mux(os.path.join(OUTDIR, 'sfx.wav'), PREVIEW + '_仅音效.mp4')

# ---------- 验证：在裁切后的 BGM 里独立找 56.0 附近的最强起音与最近强拍 ----------
x = tr.mean(1); nfft, hop = 1024, 64; win = np.hanning(nfft); prev = None; fl = []
for i in range(int(55.5 * SR), int(56.5 * SR), hop):
    m = np.abs(np.fft.rfft(x[i:i + nfft] * win)); fl.append((float(np.maximum(m - prev, 0).sum()) if prev is not None else 0.0, (i + nfft / 2) / SR)); prev = m
att = max(fl)[1]; dbs = np.array(ana['downbeat_times']) - start; near = float(dbs[np.argmin(np.abs(dbs - T_DUST))])
win_info = {'start_s': round(start, 4), 'end_s': round(start + DUR, 4), 'attack_in_source_s': round(t_attack, 4), 'chosen_uplift': best, 'strongest_uplift_overall': strongest,
            'strongest_overall_feasible': bool(strongest['feasible']), 'attack_in_trimmed_s': round(att, 4), 'attack_error_ms': round((att - T_DUST) * 1000, 1),
            'nearest_downbeat_in_trimmed_s': round(near, 4), 'downbeat_error_ms': round((near - T_DUST) * 1000, 1), 'fade_in_s': FADE_IN, 'fade_out_s': FADE_OUT,
            'pitch_scale': {'tonic': key['tonic'], 'mode': key['mode'], 'notes': key['scale_names'], 'tuning_semitones': TUNE, 'main_chord': key['main_chord']},
            'light_notes_midi': [deg(F[4], i) for i in range(8)], 'dust_arpeggio_midi': DUST_ARP, 'ducking_db': DEPTH, 'loudnorm': {'target_lufs': -16, 'measured_in': j['input_i']}}
ana['window'] = win_info; json.dump(ana, open(ANA, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps(win_info, ensure_ascii=False, indent=1))
