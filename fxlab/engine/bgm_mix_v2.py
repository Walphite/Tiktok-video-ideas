#!/usr/bin/env python3
"""V2 音频：音乐为主。BGM 窗口按「化尘开始 = 最强上扬」对齐；只保留 6 处关键时刻的音效；混音不做分段电平；
音高仍按「调式 → -25 cents → 当下和弦 → 色度前 5 自检」；化尘前（18U–21U）可选对 BGM 做缓慢低通（只在 mix 里做）。
用法：python3 -I bgm_mix_v2.py <FLAC> <bgm_analysis.json> <events.json> <无声视频.mp4> <输出目录> <预览视频输出前缀> <bgm_chords.json>
- FLAC 只读；bgm_trimmed.wav 只做裁切与淡入淡出（线性），不变速、不变调、不均衡、不滤波
- 输出：bgm_trimmed.wav / sfx.wav / mix.wav（不带低通）/ samples/ 下 56–71 秒带与不带低通的 15 秒小样 / 带声预览 / 仅音效预览
"""
import sys, os, re, json, math, subprocess, importlib.util
import numpy as np, soundfile as sf
from scipy.signal import butter, lfilter

FLAC, ANA, EVT, VIDEO, OUTDIR, PREVIEW, CHORDS = sys.argv[1:8]
SR = 48000; FADE_IN, FADE_OUT = 1.5, 3.0; TARGET_LUFS = -10.5; TP_LIMIT_DB = -1.2; DUCK_DB = 2.0; U = 3.188261
spec = importlib.util.spec_from_file_location('fxaudio', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'audio.py')); A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)
ana = json.load(open(ANA, encoding='utf-8')); ev = json.load(open(EVT, encoding='utf-8')); key = ana['key']; TUNE = ana['tuning_semitones']; PCS = set(key['scale_pitch_classes'])
DUR = ev['duration']; N = int(DUR * SR); EV = sorted(ev['events'], key=lambda e: e['t']); T_DUST = [e['t'] for e in EV if e['type'] == 'dust_start'][0]
os.makedirs(OUTDIR, exist_ok=True); os.makedirs(os.path.join(OUTDIR, 'samples'), exist_ok=True)

# ---------- 读取 FLAC（ffmpeg 直接解码，只读）----------
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', FLAC, '-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
bgm = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64); total = len(bgm) / SR

# ---------- BGM 窗口：化尘开始 = 可行候选里最强的上扬 ----------
def flux_peak(center, half=0.25):
    i0, i1 = int((center - half) * SR), int((center + half) * SR); x = bgm[i0 - 2048:i1 + 2048].mean(1); n, hop = 1024, 64; win = np.hanning(n); prev = None; best = (0, center)
    for i in range(0, len(x) - n, hop):
        m = np.abs(np.fft.rfft(x[i:i + n] * win)); f = float(np.maximum(m - prev, 0).sum()) if prev is not None else 0.0; prev = m; t = (i0 - 2048 + i + n / 2) / SR
        if i0 / SR <= t <= i1 / SR and f > best[0]: best = (f, t)
    return best[1]
cands = [dict(c, feasible=bool(c['onset_peak'] >= T_DUST and c['onset_peak'] - T_DUST + DUR <= total)) for c in ana['uplift_candidates']]
best = max([c for c in cands if c['feasible']], key=lambda c: c['rise_db']); strongest = max(cands, key=lambda c: c['rise_db'])
t_attack = flux_peak(best['onset_peak']); start = t_attack - T_DUST
i_start = int(round(start * SR)); tr = bgm[i_start:i_start + N].copy(); assert len(tr) == N
tr[:int(FADE_IN * SR)] *= np.linspace(0, 1, int(FADE_IN * SR))[:, None]; tr[-int(FADE_OUT * SR):] *= np.linspace(1, 0, int(FADE_OUT * SR))[:, None]
sf.write(os.path.join(OUTDIR, 'bgm_trimmed.wav'), tr, SR, subtype='PCM_24')

# ---------- 音高：调式 → -25 cents → 当下和弦 → 色度前 5 自检 ----------
CH = json.load(open(CHORDS, encoding='utf-8')); BARS = CH['bars']; CHROMA = np.array(CH['chroma']); CSTEP = CH['chroma_step_s']; PCN = CH['chroma_pc_order']
SC = [m for m in range(24, 120) if m % 12 in PCS]
def hz(m): return A.midi2hz(m + TUNE)
def chord_at(ts): return next((b for b in BARS if b['start'] <= ts < b['end']), BARS[-1])
def ranks(ts):
    i0, i1 = max(0, int((ts - 0.1) / CSTEP)), max(1, int((ts + 0.4) / CSTEP)); c = CHROMA[i0:i1].mean(0); o = np.argsort(-c); r = np.empty(12, int); r[o] = np.arange(1, 13); return r
def tones(pcs, lo=36, hi=100): return [m for m in range(lo, hi + 1) if m % 12 in pcs]
def softpad(f, decay, vel, rng):
    n = int(A.SR * decay * 3); t = np.arange(n) / A.SR; ph = 2 * np.pi * f * t
    x = np.sin(ph) + 0.35 * np.sin(2 * ph + 0.4) + 0.12 * np.sin(3 * ph); return x * np.minimum(1, t / 0.09) * np.exp(-t / decay) * 0.45
A.INSTR['softpad'] = softpad; rng = np.random.default_rng(12345)
REC = []
def record(ty, t, ts, m, first, how):
    r = ranks(ts); REC.append({'moment': ty, 't': round(t, 3), 't_src': round(ts, 3), 'chord': chord_at(ts)['name'], 'midi': int(m), 'note': PCN[m % 12], 'rank': int(r[m % 12]), 'passed': bool(r[m % 12] <= 5), 'first_pick_rank': int(r[first % 12]), 'first_pick_passed': bool(r[first % 12] <= 5), 'how': how})
def pick_near(ty, t, m0):
    ts = t + start; ch = chord_at(ts); r = ranks(ts); cand = sorted(tones(ch['pcs'], m0 - 12, m0 + 12), key=lambda m: (abs(m - m0), m)); first = cand[0]
    for m in cand:
        if r[m % 12] <= 5: record(ty, t, ts, m, first, 'chord-tone' if m == first else 'chord-tone(reselected)'); return m
    for m in sorted(tones(PCS, m0 - 12, m0 + 12), key=lambda m: (abs(m - m0), m)):
        if r[m % 12] <= 5: record(ty, t, ts, m, first, 'scale-fallback'); return m
    record(ty, t, ts, first, first, 'FAILED'); return first
def pick_up(ty, t, prev, lo=57):
    ts = t + start; ch = chord_at(ts); r = ranks(ts); ts_ = tones(ch['pcs'], 36, 100); cand = [m for m in ts_ if m >= lo] if prev is None else [m for m in ts_ if m > prev]; first = cand[0]
    for m in cand:
        if r[m % 12] <= 5: record(ty, t, ts, m, first, 'chord-tone' if m == first else 'chord-tone(reselected)'); return m
    record(ty, t, ts, first, first, 'FAILED'); return first
def chord_voicing(ty, t, lo, hi, only=None, top_root=False):  # 当下和弦的音；排名不达标的和弦音不发（根音保留）
    ts = t + start; ch = chord_at(ts); r = ranks(ts); pcs = ch['pcs'] if only is None else [ch['pcs'][i] for i in only]
    ms = [m for m in tones(pcs, lo, hi) if m % 12 == ch['root_pc'] or r[m % 12] <= 5]
    if top_root: ms += [m for m in tones([ch['root_pc']], hi + 1, hi + 9)][:1]
    for m in ms: record(ty, t, ts, m, m, 'chord-voicing')
    return ms
def render(instr, midis, decay):
    x = None
    for m in midis:
        y = A.INSTR[instr](hz(m), decay, 1.0, rng)
        if x is None: x = y.copy()
        else: k = max(len(x), len(y)); z = np.zeros(k); z[:len(x)] += x; z[:len(y)] += y; x = z
    return x / (np.abs(x).max() + 1e-12)

# ---------- 6 处关键时刻（其余画面事件一律不发声）----------
sfx = np.zeros((N + SR, 2)); trig = []
def put(w, t, name): A.add_at(sfx, w, t, 0.0); trig.append((t, name))
t_cut = [e['t'] for e in EV if e['type'] == 'cut_marker' and e.get('kind') == 'flash'][0]; m = pick_near('cut_2U', t_cut, 41); put(render('thud', [m], 0.5) * 0.32, t_cut, 'cut_2U')                 # ① 2U 切点
t_st = [e['t'] for e in EV if e['type'] == 'stamp'][0]; m = pick_near('stamp', t_st, 41); put(render('thud', [m], 0.9) * 0.36, t_st, 'stamp')                                       # ② 印章落下
t_dip = [e['t'] for e in EV if e['type'] == 'cut_marker' and e.get('kind') == 'dip_to_black'][0]; put(render('softpad', chord_voicing('dip_15U', t_dip, 48, 64, only=[0, 2]), 2.2) * 0.16, t_dip, 'dip_15U')   # ③ 15U 渐黑
prev = None
for k, e in enumerate([e for e in EV if e['type'] == 'layer_light']):                                                                                                                  # ④ 塔逐层点亮：8 个音沿当下和弦音上行，每层 +1.5 dB
    prev = pick_up('lights', e['t'], prev); put(render('chime', [prev], 1.8) * 0.10 * 10 ** (1.5 * k / 20), e['t'], 'light')
put(render('softpad', chord_voicing('dust_start', T_DUST, 52, 73), 3.0) * 0.28, T_DUST, 'dust_start')                                                                                 # ⑤ 化尘开始
t_arr = [e['t'] for e in EV if e['type'] == 'arrive'][0]; t_sw = t_arr - 2.0; n = int(2.0 * SR); tt = np.arange(n) / SR; ch = chord_at(t_sw + start)                                       # ⑥ 聚字成型：渐强长音 + 当下和弦
root = min(tones([ch['root_pc']], 60, 72), key=lambda x: abs(x - 65)); [record('swell', t_sw, t_sw + start, x, x, 'chord-root') for x in (root, root - 12)]
vib = 1 + 0.004 * np.sin(2 * np.pi * 5 * tt); sw = np.zeros(n)
for mm, amp in ((root, 1.0), (root - 12, 0.6)): ph = 2 * np.pi * np.cumsum(hz(mm) * vib) / SR; sw += amp * sum(np.sin(k * ph) / k ** 1.4 for k in range(1, 8))
dark = A.lowpass(sw, 900); sw = dark + (A.lowpass(sw, 5000) - dark) * (tt / 2.0) ** 1.5; sw = sw * (tt / 2.0) ** 2.2 * np.minimum(1, (2.0 - tt) / 0.01); put(sw / np.abs(sw).max() * 0.36, t_sw, 'swell')
put(render('softpad', chord_voicing('arrive', t_arr, 52, 73, top_root=True), 3.2) * 0.5, t_arr, 'arrive')
sfx = sfx[:N]
fp = sum(r['first_pick_passed'] for r in REC); fin = sum(r['passed'] for r in REC); fails = [r for r in REC if not r['passed']]
check = {'moments': 6, 'total_pitched_notes': len(REC), 'first_pick_pass_rate': round(fp / len(REC), 4), 'final_pass_rate': round(fin / len(REC), 4), 'failed': fails}
json.dump({'summary': {k: v for k, v in check.items() if k != 'failed'}, 'failed': fails, 'notes': REC}, open(os.path.join(os.path.dirname(os.path.abspath(ANA)), 'bgm_pitch_check.json'), 'w', encoding='utf-8'), ensure_ascii=False)

# ---------- 混音：BGM 最多压低 2 dB（约 150 ms），无分段电平 ----------
KR = 1000; g = np.zeros(int(DUR * KR) + 400)
for t0, _ in trig:
    i0 = int(t0 * KR); prof = np.concatenate([np.linspace(0, DUCK_DB, 16), np.full(30, DUCK_DB), DUCK_DB * np.linspace(1, 0, 105)[1:]]); seg = g[i0:i0 + len(prof)]; g[i0:i0 + len(seg)] = np.maximum(seg, prof[:len(seg)])
duck = 10 ** (-np.interp(np.arange(N) / SR, np.arange(len(g)) / KR, g) / 20); bgm_d = tr * duck[:, None]
def lowpass_variant(x, t0, t1, open_t, fc0=16000.0, fc1=700.0, release=0.15):  # t0→t1 对数线性降到 fc1，open_t 起 release 秒内打开
    cs = [16000, 9000, 5000, 2800, 1600, 900, 600]; a, b = int((t0 - 0.2) * SR), int((open_t + release + 0.3) * SR); seg = x[a:b]; vers = []
    for fc in cs: bb, aa = butter(2, fc / (SR / 2)); vers.append(np.stack([lfilter(bb, aa, seg[:, c]) for c in range(2)], 1))
    tt = (np.arange(b - a) + a) / SR; fct = np.where(tt < open_t, fc0 * (fc1 / fc0) ** np.clip((tt - t0) / (t1 - t0), 0, 1), fc1 * (fc0 / fc1) ** np.clip((tt - open_t) / release, 0, 1)); lc = np.log(np.array(cs)); out = np.zeros_like(seg)
    pos = np.interp(np.log(np.clip(fct, cs[-1], cs[0])), lc[::-1], np.arange(len(cs))[::-1]); i0 = np.floor(pos).astype(int).clip(0, len(cs) - 2); w = (pos - i0)[:, None]
    for j in range(len(cs) - 1): m = (i0 == j); out[m] = vers[j][m] * (1 - w[m]) + vers[j + 1][m] * w[m]
    y = x.copy(); y[a:b] = out; return y
LP0, LP1 = T_DUST - 3 * U, T_DUST   # 18U → 21U
bgm_lp = lowpass_variant(bgm_d, LP0, LP1, T_DUST)
def measure(wav):
    s = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr; tail = s[s.rindex('Summary:'):]
    f = lambda pat: float(re.search(pat, tail).group(1)); return {'lufs': f(r'I:\s+(-?[\d.]+) LUFS'), 'lra': f(r'LRA:\s+(-?[\d.]+) LU'), 'true_peak': f(r'Peak:\s+(-?[\d.]+) dBFS')}
def limiter(x, gain, limit):
    tmp = os.path.join(OUTDIR, '_t_in.wav'); out = os.path.join(OUTDIR, '_t_out.wav'); sf.write(tmp, x * gain, SR, subtype='FLOAT')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', f'alimiter=limit={limit}:attack=3:release=80:level=disabled', '-c:a', 'pcm_f32le', out], check=True); y, _ = sf.read(out); os.remove(tmp); os.remove(out); return y
def finalize(mix_raw, ref=None):  # 线性增益到目标响度 + 真峰值限幅；ref 给定时沿用同一增益与限幅设置
    if ref: return limiter(mix_raw, ref['gain'], ref['limit']), ref
    gain = 10 ** ((TARGET_LUFS - measure_arr(mix_raw)['lufs']) / 20); limit = 0.80
    for it in range(6):
        y = limiter(mix_raw, gain, limit); sf.write(os.path.join(OUTDIR, '_m.wav'), y, SR, subtype='PCM_24'); m = measure(os.path.join(OUTDIR, '_m.wav'))
        if m['true_peak'] > TP_LIMIT_DB + 0.05: limit *= 10 ** (-(m['true_peak'] - TP_LIMIT_DB + 0.1) / 20); continue
        if abs(m['lufs'] - TARGET_LUFS) < 0.25: break
        gain *= 10 ** ((TARGET_LUFS - m['lufs']) / 20)
    os.remove(os.path.join(OUTDIR, '_m.wav')); return y, {'gain': gain, 'limit': limit}
def measure_arr(x): p = os.path.join(OUTDIR, '_a.wav'); sf.write(p, x, SR, subtype='FLOAT'); r = measure(p); os.remove(p); return r
mix_a, fin_a = finalize(bgm_d + sfx); mix_b, _ = finalize(bgm_lp + sfx, fin_a)
sf.write(os.path.join(OUTDIR, 'mix.wav'), mix_a, SR, subtype='PCM_24'); sf.write(os.path.join(OUTDIR, 'sfx.wav'), sfx * fin_a['gain'], SR, subtype='PCM_24')
S0, S1 = int(56 * SR), int(71 * SR); sd = os.path.join(OUTDIR, 'samples')
sf.write(os.path.join(sd, '小样_56-71s_不带低通.wav'), mix_a[S0:S1], SR, subtype='PCM_24'); sf.write(os.path.join(sd, '小样_56-71s_带低通.wav'), mix_b[S0:S1], SR, subtype='PCM_24')
final = measure(os.path.join(OUTDIR, 'mix.wav'))
def mux(wav, out): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', VIDEO, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], check=True)
mux(os.path.join(OUTDIR, 'mix.wav'), PREVIEW + '.mp4'); mux(os.path.join(OUTDIR, 'sfx.wav'), PREVIEW + '_仅音效.mp4')

# ---------- 验证 ----------
def rms_db(x, a, b): s_ = x[int(a * SR):int(b * SR)]; return round(10 * np.log10((s_ ** 2).mean() + 1e-12), 1)
x = mix_a.mean(1); nfft, hop = 1024, 64; win = np.hanning(nfft); prv = None; fl = []
for i in range(int((T_DUST - 0.6) * SR), int((T_DUST + 0.6) * SR), hop):
    mm = np.abs(np.fft.rfft(x[i:i + nfft] * win)); fl.append((float(np.maximum(mm - prv, 0).sum()) if prv is not None else 0.0, (i + nfft / 2) / SR)); prv = mm
att_mix = max(fl)[1]; dbs = np.array(ana['downbeat_times']) - start; near = float(dbs[np.argmin(np.abs(dbs - T_DUST))])
metrics = {'window': {'start_s': round(start, 4), 'end_s': round(start + DUR, 4), 'attack_in_source_s': round(t_attack, 4), 'chosen_uplift': best, 'strongest_uplift_overall': strongest, 'strongest_overall_feasible': bool(strongest['feasible'])},
    'dust_start_video_s': round(T_DUST, 4), 'attack_in_final_mix_s': round(att_mix, 4), 'attack_error_ms': round((att_mix - T_DUST) * 1000, 1), 'attack_error_vs_scene_marker_ms': round((att_mix - 66.9530) * 1000, 1),
    'nearest_downbeat_s': round(near, 4), 'downbeat_error_ms': round((near - T_DUST) * 1000, 1),
    'loudness': {**final, 'target_lufs': TARGET_LUFS, 'limiter': fin_a, 'ducking_db_max': DUCK_DB}, 'rms_db': {'58-66s(低谷)': rms_db(mix_a, 58, 66), '67-71s(上扬后)': rms_db(mix_a, 67, 71), '0-20s': rms_db(mix_a, 0, 20)},
    'lowpass': {'from_s': round(LP0, 3), 'open_s': round(LP1, 3), 'cutoff_hz': '16000→700（对数线性）→ 21U 起 0.15 秒内打开'}, 'triggers': [(round(t, 3), n_) for t, n_ in trig], 'pitch_check': {k: v for k, v in check.items() if k != 'failed'}, 'pitch_failed': [(f['moment'], f['t'], f['note'], f['rank']) for f in fails]}
ana['window'] = metrics; json.dump(ana, open(ANA, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps(metrics, ensure_ascii=False, indent=1))
