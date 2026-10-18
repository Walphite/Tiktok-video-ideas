#!/usr/bin/env python3
"""阶段 B：BGM 窗口选取 + 音效按 BGM 调式重配音高 + 混音（压低 / 响度）+ 换音轨。
用法：python3 -I bgm_mix.py <FLAC> <bgm_analysis.json> <events.json> <无声视频.mp4> <输出目录> <预览视频输出前缀> <bgm_chords.json>
- FLAC 只读；所有结果写入新文件（bgm_trimmed.wav / sfx.wav / mix.wav / 两个 540p 预览）
- 音效时间严格取自 events.json（音画同源），不为踩拍移动；对齐只通过 BGM 窗口起点完成
- bgm_trimmed.wav 只做裁切与淡入淡出（线性），不变速、不变调、不均衡、不滤波
- 压低（3–6 dB，约 150 ms）与响度统一只在 mix.wav 里做
"""
import sys, os, json, math, subprocess, importlib.util, hashlib
import numpy as np, soundfile as sf

FLAC, ANA, EVT, VIDEO, OUTDIR, PREVIEW, CHORDS = sys.argv[1:8]
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

# ---------- B3：音高三层对齐 ----------
# ① 调式：F 小调（见 bgm_analysis.json）；② 调音：所有有音高的音效整体平移 TUNE（-25 cents），与原曲同一调音基准；
# ③ 和弦跟随：音效触发时取 BGM 当下小节的和弦（bgm_chords.json），从和弦音里选最近的音；
# ④ 自检：音级在触发时刻 BGM 色度向量里的能量排名须在前 5，否则重选
CH = json.load(open(CHORDS, encoding='utf-8')); BARS = CH['bars']; CHROMA = np.array(CH['chroma']); CSTEP = CH['chroma_step_s']; PCN = CH['chroma_pc_order']
SC = [m for m in range(24, 120) if m % 12 in PCS]
def hz(m): return A.midi2hz(m + TUNE)
def snap(m): return min(SC, key=lambda s: (abs(s - m), s))
def deg(root, n): return SC[SC.index(root) + n]
def chord_at(ts): return next((b for b in BARS if b['start'] <= ts < b['end']), BARS[-1])
def ranks(ts):  # 触发时刻附近（-0.1~+0.4s）BGM 色度能量排名：pc → 名次（1 = 最强）
    i0, i1 = max(0, int((ts - 0.1) / CSTEP)), max(1, int((ts + 0.4) / CSTEP)); c = CHROMA[i0:i1].mean(0); o = np.argsort(-c); r = np.empty(12, int); r[o] = np.arange(1, 13); return r
def tones(pcs, lo=36, hi=100): return [m for m in range(lo, hi + 1) if m % 12 in pcs]
def softpad(f, decay, vel, rng):  # 柔和延音：慢起音的正弦 + 轻微泛音，无冲击
    n = int(A.SR * decay * 3); t = np.arange(n) / A.SR; ph = 2 * np.pi * f * t
    x = np.sin(ph) + 0.35 * np.sin(2 * ph + 0.4) + 0.12 * np.sin(3 * ph); return x * np.minimum(1, t / 0.09) * np.exp(-t / decay) * 0.45
A.INSTR['softpad'] = softpad
REC = []  # 自检记录：每个有音高的音
def record(ty, t, ts, m, first_pick, how):
    r = ranks(ts); REC.append({'type': ty, 't': round(t, 3), 't_src': round(ts, 3), 'chord': chord_at(ts)['name'], 'midi': int(m), 'note': PCN[m % 12], 'rank': int(r[m % 12]), 'passed': bool(r[m % 12] <= 5),
        'first_pick_rank': int(r[first_pick % 12]), 'first_pick_passed': bool(r[first_pick % 12] <= 5), 'how': how})
def pick_near(ty, t, m0):  # 当下和弦音里离意图音高最近且排名达标的音；不行再退到调内音；最后才放弃
    ts = t + start; ch = chord_at(ts); r = ranks(ts); cand = sorted(tones(ch['pcs'], m0 - 12, m0 + 12), key=lambda m: (abs(m - m0), m)); first = cand[0]
    for m in cand:
        if r[m % 12] <= 5: record(ty, t, ts, m, first, 'chord-tone' if m == first else 'chord-tone(reselected)'); return m
    for m in sorted(tones(PCS, m0 - 12, m0 + 12), key=lambda m: (abs(m - m0), m)):
        if r[m % 12] <= 5: record(ty, t, ts, m, first, 'scale-fallback'); return m
    record(ty, t, ts, first, first, 'FAILED'); return first
def pick_seq(ty, t, prev, up, lo=57, hi=99):  # 逐级上行 / 下行：当下和弦音里紧邻上一个音的下一个（排名达标）
    ts = t + start; ch = chord_at(ts); r = ranks(ts); ts_ = tones(ch['pcs'], 36, 100)
    cand = [m for m in ts_ if m >= lo] if prev is None else ([m for m in ts_ if m > prev] if up else sorted([m for m in ts_ if 48 <= m < prev], reverse=True))
    if prev is None and not up: cand = sorted([m for m in ts_ if m <= lo], reverse=True)
    if not cand: cand = [m for m in ts_ if 48 <= m <= 60 and r[m % 12] <= 5][:1] or [m for m in ts_ if 48 <= m <= 60][:1]; hold = True  # 到达低音下限后停在当下和弦的低音上
    else: hold = False
    first = cand[0]
    for m in cand:
        if r[m % 12] <= 5: record(ty, t, ts, m, first, ('floor-hold' if hold else 'chord-tone') if (m == first or hold) else 'chord-tone(reselected)'); return m
    if not up and prev is not None:  # 下行到头：在当下和弦里找排名达标、不高于上一个音的音，原地延音
        for m in sorted([m for m in ts_ if 48 <= m <= prev], reverse=True):
            if r[m % 12] <= 5: record(ty, t, ts, m, first, 'hold-sustain'); return m
    record(ty, t, ts, first, first, 'FAILED'); return first
F = {2: 41, 3: 53, 4: 65, 5: 77, 6: 89}
PITCHED = {  # 有音高的音效：事件 → 意图音高（原调内音阶设计），再按和弦音 / 自检重选
    'ping': lambda e: deg(F[6], e['pitch']), 'twinkle': lambda e: deg(F[5], e['pitch']), 'rise': lambda e: deg(F[3], e['pitch']), 'collapse': lambda e: snap(38), 'stamp': lambda e: snap(31),
    'extinguish': lambda e: deg(F[5], e['pitch']), 'settle': lambda e: F[5], 'appear': lambda e: deg(F[4], e['pitch']), 'layer': lambda e: deg(F[3], e['pitch'])}
UNPITCHED = {'tick': 72, 'rattle': None, 'land': None, 'expand': F[4]}  # 噪声类：不参与对齐与自检（保持调内音，仅作滤波参考）
OVER = {'layer': {'gain': 0.3}, 'chord': {'instr': 'softpad', 'decay': 2.2, 'gain': 0.35, 'track': 'sfx'}, 'layer_light': {'instr': 'chime', 'decay': 1.8, 'gain': 0.55, 'track': 'sfx'},
        'layer_dust': {'instr': 'softpad', 'decay': 2.6, 'gain': 0.42, 'track': 'sfx'}, 'arrive': {'instr': 'softpad', 'decay': 3.2, 'gain': 0.55, 'track': 'sfx'}}
TRIM = {'ping': 1.8, 'twinkle': 2.5, 'tick': 2.0, 'rise': 2.0, 'rattle': 2.0, 'land': 1.5, 'extinguish': 2.5, 'settle': 1.5, 'collapse': 1.2}  # 细碎音效在 BGM 之上仍听得清
sfx = np.zeros((int(SR * (DUR + 0.05)), 2)); rng = np.random.default_rng(12345); onsets = []; cache = {}; st = {'light': None, 'dust': None}
def voices(e, ty):  # 事件 → MIDI 音列
    if ty in PITCHED: return [pick_near(ty, e['t'], PITCHED[ty](e))]
    if ty == 'layer_light': st['light'] = pick_seq(ty, e['t'], st['light'], True); return [st['light']]  # 50.0–55.5：当下和弦音里逐级上行，55.5 到最高音
    if ty == 'layer_dust':  # 56.0–57.4：柔和延音，当下和弦音里缓慢下行（首音接在点亮序列最高音之下）
        st['dust'] = pick_seq(ty, e['t'], st['dust'] if st['dust'] is not None else min(st['light'] + 1, 80), False); return [st['dust']]
    if ty in ('chord', 'arrive'):  # 当下和弦的三和弦（落在当下的主和弦上）；和弦音排名不达标的音不发（根音保留）
        ts = e['t'] + start; ch = chord_at(ts); r = ranks(ts); ms = [m for m in tones(ch['pcs'], 52, 73)]; ms = [m for m in ms if m % 12 == ch['root_pc'] or r[m % 12] <= 5]
        top = [m for m in tones([ch['root_pc']], 74, 82)][:1] if ty == 'arrive' else []
        for m in ms + top: record(ty, e['t'], ts, m, m, 'chord-voicing')
        return ms + top
    if ty in UNPITCHED: return [snap(UNPITCHED[ty] if UNPITCHED[ty] else deg(F[3], e['pitch']))]
    return None
for e in sorted(ev['events'], key=lambda e: e['t']):
    ty = e['type']
    midis = voices(e, ty)
    if midis is None: continue
    cfg = dict(ev['sounds'].get(ty) or {'instr': 'blip', 'decay': 0.4, 'gain': 0.5}); cfg.update(OVER.get(ty, {}))
    instr = A.INSTR[cfg['instr']]; vel = float(e.get('vel', 1.0)); decay = float(cfg['decay']); x = None
    for m in midis:
        k_ = (cfg['instr'], m, round(decay, 3), round(vel, 1))
        if k_ not in cache or cfg['instr'] in ('tick', 'paper', 'rain'): cache[k_] = instr(hz(m), decay, vel, rng)
        y = cache[k_]
        if x is None: x = y.copy()
        else: k = max(len(x), len(y)); z = np.zeros(k); z[:len(x)] += x; z[:len(y)] += y; x = z
    x = x * cfg.get('gain', 0.5) * TRIM.get(ty, 1.0) * (0.35 + 0.65 * vel) / math.sqrt(len(midis)); A.add_at(sfx, x, e['t'], (float(e.get('x', 0.5)) - 0.5) * 1.4); onsets.append((e['t'], ty))
# 聚字渐强长音：58.0 → 60.0（取 arrive 事件前 2 秒）：当下和弦的根音（F4 附近，带低八度），渐强，字成型瞬间被当下和弦接住
t_arr = [e['t'] for e in ev['events'] if e['type'] == 'arrive'][0]; t_sw = t_arr - 2.0; n = int(2.0 * SR); t = np.arange(n) / SR; ch = chord_at(t_sw + start); r = ranks(t_sw + start)
root = min(tones([ch['root_pc']], 60, 72), key=lambda m: abs(m - 65)); sw_notes = [(root, 1.0), (root - 12, 0.6)]
for m, _ in sw_notes: record('swell', t_sw, t_sw + start, m, m, 'chord-root')
vib = 1 + 0.004 * np.sin(2 * np.pi * 5 * t); sw = np.zeros(n)
for m, amp in sw_notes:
    ph = 2 * np.pi * np.cumsum(hz(m) * vib) / SR; sw += amp * sum(np.sin(k * ph) / k ** 1.4 for k in range(1, 8))
dark = A.lowpass(sw, 900); sw = dark + (A.lowpass(sw, 5000) - dark) * (t / 2.0) ** 1.5
sw = sw * (t / 2.0) ** 2.2 * np.minimum(1, (2.0 - t) / 0.01) * 0.5; A.add_at(sfx, sw, t_sw, 0.0); onsets.append((t_sw, 'swell'))
# 自检汇总
fp = sum(r_['first_pick_passed'] for r_ in REC); fin = sum(r_['passed'] for r_ in REC); fails = [r_ for r_ in REC if not r_['passed']]
by = {}
for r_ in REC: d_ = by.setdefault(r_['type'], {'n': 0, 'passed': 0}); d_['n'] += 1; d_['passed'] += int(r_['passed'])
check = {'total_pitched_notes': len(REC), 'first_pick_pass_rate': round(fp / len(REC), 4), 'final_pass_rate': round(fin / len(REC), 4), 'failed_count': len(fails), 'by_type': by,
         'failed': fails[:50], 'rule': '音级在触发时刻（-0.1~+0.4s）BGM 色度中的能量排名须 ≤ 5'}
json.dump({'summary': {k: v for k, v in check.items() if k != 'failed'}, 'failed': fails, 'notes': REC}, open(os.path.join(os.path.dirname(os.path.abspath(ANA)), 'bgm_pitch_check.json'), 'w', encoding='utf-8'), ensure_ascii=False)
sfx = np.tanh(sfx * 1.5); pk = np.abs(sfx).max(); sfx *= 0.85 / pk  # 软限幅，避免大音量音效压住细碎音效
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
            'light_notes': [r_['midi'] for r_ in REC if r_['type'] == 'layer_light'], 'dust_notes': [r_['midi'] for r_ in REC if r_['type'] == 'layer_dust'], 'pitch_check': {k: v for k, v in check.items() if k != 'failed'}, 'ducking_db': DEPTH, 'loudnorm': {'target_lufs': -16, 'measured_in': j['input_i']}}
ana['window'] = win_info; json.dump(ana, open(ANA, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps(win_info, ensure_ascii=False, indent=1))
