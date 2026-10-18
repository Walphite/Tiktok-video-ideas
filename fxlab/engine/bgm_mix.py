#!/usr/bin/env python3
"""阶段 B：BGM 窗口选取 + 音效按 BGM 调式重配音高 + 混音（压低 / 响度）+ 换音轨。
用法：python3 -I bgm_mix.py <FLAC> <bgm_analysis.json> <events.json> <无声视频.mp4> <输出目录> <预览视频输出前缀> <bgm_chords.json> [full|samples]
- FLAC 只读；所有结果写入新文件（bgm_trimmed.wav / sfx.wav / mix.wav / 两个 540p 预览）
- 音效时间严格取自 events.json（音画同源），不为踩拍移动；对齐只通过 BGM 窗口起点完成
- bgm_trimmed.wav 只做裁切与淡入淡出（线性），不变速、不变调、不均衡、不滤波
- 压低（3–6 dB，约 150 ms）与响度统一只在 mix.wav 里做
"""
import sys, os, json, math, subprocess, importlib.util, hashlib
import numpy as np, soundfile as sf

FLAC, ANA, EVT, VIDEO, OUTDIR, PREVIEW, CHORDS = sys.argv[1:8]; MODE = sys.argv[8] if len(sys.argv) > 8 else 'full'  # full：写全片；samples：只写小样与指标，不覆盖全片文件
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
if MODE == 'full': sf.write(os.path.join(OUTDIR, 'bgm_trimmed.wav'), tr, SR, subtype='PCM_24')

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

# ====================== 音效合成（只决定「哪些画面事件发声」，不移动任何音效的时间）======================
N = int(DUR * SR); sfx_t = np.zeros((N + SR, 2)); sfx_l = np.zeros((N + SR, 2)); trig = []  # sfx_t：细碎音效（软限幅）；sfx_l：线性音效（点亮 / 化尘 / 聚字 / 滑音，音量关系须精确）；trig：真实发声
GROW_DB, LIGHT_P0 = 1.5, 0.12   # 点亮序列：每层比上一层大 1.5 dB，首层峰值 0.12
def render(instr_name, midis, decay, vel=1.0):  # 合成一个（和弦）音，归一到峰值 1
    x = None
    for m in midis:
        y = A.INSTR[instr_name](hz(m), decay, vel, rng)
        if x is None: x = y.copy()
        else: k = max(len(x), len(y)); z = np.zeros(k); z[:len(x)] += x; z[:len(y)] += y; x = z
    return x / (np.abs(x).max() + 1e-12)
evs = sorted(ev['events'], key=lambda e: e['t']); ext = [e for e in evs if e['type'] == 'extinguish']; keep_ext = set()
for k in range(math.ceil(ext[0]['t']), int(ext[-1]['t']) + 1):  # 熄灭段：每秒最多 1 个单音，取离整秒最近的熄灭事件
    c = min(ext, key=lambda e: abs(e['t'] - k))
    if abs(c['t'] - k) <= 0.35: keep_ext.add(id(c))
last_ping = -9.0; n_light = 0
for e in evs:
    ty, t = e['type'], e['t']
    if ty == 'ping':
        if t - last_ping < 0.26: continue  # 钩子段每秒 ≤ 4 个
        last_ping = t
    if ty == 'extinguish' and id(e) not in keep_ext: continue
    midis = voices(e, ty)
    if midis is None: continue
    cfg = dict(ev['sounds'].get(ty) or {'instr': 'blip', 'decay': 0.4, 'gain': 0.5}); cfg.update(OVER.get(ty, {})); vel = float(e.get('vel', 1.0)); pan = (float(e.get('x', 0.5)) - 0.5) * 1.4
    if ty == 'layer_light': A.add_at(sfx_l, render('chime', midis, 1.8) * LIGHT_P0 * 10 ** (GROW_DB * n_light / 20), t, 0.0); n_light += 1   # 清晰起音 + 逐层 +1.5 dB
    elif ty == 'layer_dust': A.add_at(sfx_l, render('softpad', midis, 2.6) * 0.30, t, 0.0)
    elif ty == 'chord': A.add_at(sfx_l, render('softpad', midis, 2.2) * 0.16, t, 0.0)
    elif ty == 'arrive': A.add_at(sfx_l, render('softpad', midis, 3.2) * 0.55, t, 0.0)
    else:
        instr = A.INSTR[cfg['instr']]; decay = float(cfg['decay']); x = None
        for m in midis:
            k_ = (cfg['instr'], m, round(decay, 3), round(vel, 1))
            if k_ not in cache or cfg['instr'] in ('tick', 'paper', 'rain'): cache[k_] = instr(hz(m), decay, vel, rng)
            y = cache[k_]
            if x is None: x = y.copy()
            else: k = max(len(x), len(y)); z = np.zeros(k); z[:len(x)] += x; z[:len(y)] += y; x = z
        A.add_at(sfx_t, x * cfg.get('gain', 0.5) * TRIM.get(ty, 1.0) * (0.35 + 0.65 * vel) / math.sqrt(len(midis)), t, pan)
    trig.append((t, ty))
# 熄灭段的「一次整体下行滑音」：从第一个到最后一个熄灭事件，高音（当下和弦音）滑到低音（当下和弦音）
t0g, t1g = ext[0]['t'], ext[-1]['t']; mh, ml = pick_near('glide_start', t0g, 84), pick_near('glide_end', t1g, 58); D_ = t1g - t0g; tg = np.arange(int(D_ * SR)) / SR
ph = 2 * np.pi * np.cumsum(hz(mh) * (hz(ml) / hz(mh)) ** (tg / D_)) / SR
A.add_at(sfx_l, (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.minimum(1, tg / 0.4) ** 2 * np.minimum(1, (D_ - tg) / 1.0) ** 2 * 0.2, t0g, 0.0); trig.append((t0g, 'glide'))
# 聚字渐强长音：58.0 → 60.0（取 arrive 事件前 2 秒）：当下和弦的根音（F4 附近，带低八度），渐强，字成型瞬间被当下和弦接住
t_arr = [e['t'] for e in ev['events'] if e['type'] == 'arrive'][0]; t_sw = t_arr - 2.0; n = int(2.0 * SR); t = np.arange(n) / SR; ch = chord_at(t_sw + start); r = ranks(t_sw + start)
root = min(tones([ch['root_pc']], 60, 72), key=lambda m: abs(m - 65)); sw_notes = [(root, 1.0), (root - 12, 0.6)]
for m, _ in sw_notes: record('swell', t_sw, t_sw + start, m, m, 'chord-root')
vib = 1 + 0.004 * np.sin(2 * np.pi * 5 * t); sw = np.zeros(n)
for m, amp in sw_notes:
    ph = 2 * np.pi * np.cumsum(hz(m) * vib) / SR; sw += amp * sum(np.sin(k * ph) / k ** 1.4 for k in range(1, 8))
dark = A.lowpass(sw, 900); sw = dark + (A.lowpass(sw, 5000) - dark) * (t / 2.0) ** 1.5
sw = sw * (t / 2.0) ** 2.2 * np.minimum(1, (2.0 - t) / 0.01); A.add_at(sfx_l, sw / np.abs(sw).max() * 0.40, t_sw, 0.0); trig.append((t_sw, 'swell'))
# 音高自检汇总
fp = sum(r_['first_pick_passed'] for r_ in REC); fin = sum(r_['passed'] for r_ in REC); fails = [r_ for r_ in REC if not r_['passed']]; by = {}
for r_ in REC: d_ = by.setdefault(r_['type'], {'n': 0, 'passed': 0}); d_['n'] += 1; d_['passed'] += int(r_['passed'])
check = {'total_pitched_notes': len(REC), 'first_pick_pass_rate': round(fp / len(REC), 4), 'final_pass_rate': round(fin / len(REC), 4), 'failed_count': len(fails), 'by_type': by, 'failed': fails[:50], 'rule': '音级在触发时刻（-0.1~+0.4s）BGM 色度中的能量排名须 ≤ 5'}
sfx0 = (0.9 * np.tanh(1.5 * sfx_t) + sfx_l)[:N]

# ====================== 混音（只在 mix 里：压低 + 分段电平 + 统一响度）======================
DEPTH = {'minor': 3.0, 'mid': 4.5, 'major': 6.0}; CLASS = {'collapse': 'major', 'stamp': 'major', 'chord': 'major', 'arrive': 'major', 'swell': 'mid', 'layer': 'mid', 'layer_light': 'mid', 'layer_dust': 'mid', 'settle': 'mid', 'appear': 'mid', 'expand': 'mid'}
KR = 1000; g = np.zeros(int(DUR * KR) + 400)
for t0, ty in trig:
    d = DEPTH[CLASS.get(ty, 'minor')]; i0 = int(t0 * KR); prof = np.concatenate([np.linspace(0, d, 16), np.full(30, d), d * np.linspace(1, 0, 105)[1:]])  # 起 15ms + 持 30ms + 落约 105ms ≈ 150ms
    seg_ = g[i0:i0 + len(prof)]; g[i0:i0 + len(seg_)] = np.maximum(seg_, prof[:len(seg_)])
duck = 10 ** (-np.interp(np.arange(N) / SR, np.arange(len(g)) / KR, g) / 20); bgm_d = tr * duck[:, None] * 0.8
def rms_db(x, a, b): s_ = x[int(a * SR):int(b * SR)]; return 10 * np.log10((s_ ** 2).mean() + 1e-12)
def peak_db(x, a, b): return 20 * np.log10(np.abs(x[int(a * SR):int(b * SR)]).max() + 1e-12)
def curve_of(x, win=1.0, hop=0.1):  # 1 秒窗短时 RMS（dB），窗口中心时间
    m = (x ** 2).mean(1); cs = np.concatenate([[0], np.cumsum(m)]); w = int(win * SR); idx = np.arange(0, len(m) - w, int(hop * SR)); return (idx + w / 2) / SR, 10 * np.log10((cs[idx + w] - cs[idx]) / w + 1e-12)
# 分段目标电平（相对 56–60 高潮，dB）；5–9 秒再额外降 2.5 dB
SECT = [[0, 4.5, -5.0], [4.5, 19.0, -5.0], [19.0, 21.5, -5.5], [21.5, 25.0, -6.5], [25.0, 32.0, -5.0], [32.0, 42.0, -6.0], [42.0, 50.0, -6.0], [50.0, 55.5, -7.0], [56.0, 60.2, 0.0], [60.2, 64.0, -3.0]]; DIP = (5.0, 9.0, -2.5)
ts_ = np.arange(N) / SR
def build_M(unity, rels):
    S_c = rms_db(unity, 56.0, 60.0); pts = []
    for (a, b, _), rel in zip(SECT, rels):
        v = (S_c + rel) - rms_db(unity, a, b); pts += [(max(a + 0.2, 0.0) if a > 0 else 0.0, v), (b - 0.2 if b < DUR else DUR, v)]
    xs, ys = zip(*pts); mdb = np.interp(ts_, xs, ys); dip = np.interp(ts_, [DIP[0] - 0.5, DIP[0], DIP[1], DIP[1] + 0.5], [0, DIP[2], DIP[2], 0]); return mdb, dip
def solve(gs_f):
    rels = [s_[2] for s_ in SECT]; sfx_s = sfx0.copy(); a_, b_ = int(32.0 * SR), int(38.6 * SR)
    gs = np.ones(N); gs[a_:b_] = gs_f; rr = int(0.15 * SR); gs[a_ - rr:a_] = np.linspace(1, gs_f, rr); gs[b_:b_ + rr] = np.linspace(gs_f, 1, rr); sfx_s = sfx_s * gs[:, None]; unity = bgm_d + sfx_s
    for it in range(12):
        mdb, dip = build_M(unity, rels); M = 10 ** ((mdb + dip) / 20); mixu = unity * M[:, None]; ct, cv = curve_of(mixu); sc = rms_db(mixu, 56, 60); ch_ = False
        dlt = -7.0 - (rms_db(mixu, 50, 55) - sc)  # 50–55 须比 56–60 低 7 dB（要求 6–8）
        if abs(dlt) > 0.15: rels[7] += dlt; ch_ = True
        d22 = (rms_db(mixu, 22, 25) - sc) - (-5.5)  # 22–25 印章段须比 56–60 低 ≥4 dB（取 5.5 dB 余量）
        if d22 > 0: rels[3] -= d22; ch_ = True
        top = cv[(ct >= 56) & (ct <= 60)].max()
        for k, (a, b, _) in enumerate(SECT):
            if k == 8: continue
            pk = cv[(ct >= a) & (ct <= b)].max()
            if pk > top - 1.5: rels[k] -= (pk - top + 1.5); ch_ = True
        if not ch_: break
    return rels, sfx_s, mixu, M
# 32–37 秒：音效比 BGM 低 ≥12 dB（取 13 dB 余量），峰值 ≤ -10 dBFS
gs_f = 10 ** ((-13.0 - (rms_db(sfx0, 32, 37) - rms_db(bgm_d, 32, 37))) / 20)
rels, sfx_s, mixu, M = solve(gs_f)
tmp = os.path.join(OUTDIR, '_mix_raw.wav'); os.makedirs(OUTDIR, exist_ok=True); sf.write(tmp, mixu, SR, subtype='PCM_24')
eb = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr; I_ = float(eb.rsplit('I:', 1)[1].split('LUFS')[0]); os.remove(tmp)
gfin = min(10 ** ((-16.0 - I_) / 20), 10 ** (-1.0 / 20) / np.abs(mixu).max())
bgm_out = bgm_d * M[:, None] * gfin; sfx_out = sfx_s * M[:, None] * gfin; mix = bgm_out + sfx_out
if peak_db(sfx_out, 32, 37) > -10.0:  # 兜底：峰值超限则整段再降
    f2 = 10 ** ((-10.5 - peak_db(sfx_out, 32, 37)) / 20); rels, sfx_s, mixu, M = solve(gs_f * f2); gfin = min(10 ** ((-16.0 - I_) / 20), 10 ** (-1.0 / 20) / np.abs(mixu).max()); bgm_out = bgm_d * M[:, None] * gfin; sfx_out = sfx_s * M[:, None] * gfin; mix = bgm_out + sfx_out

# ====================== 指标与验收 ======================
SEGS = [(0, 4), (4, 20), (20, 35), (35, 40), (40, 56), (56, 64)]
def trig_stats(a, b):
    ts_l = [t for t, _ in trig if a <= t < b]; bins = [sum(1 for t in ts_l if a + i <= t < a + i + 1) for i in range(int(math.ceil(b - a)))]; return len(ts_l), round(len(ts_l) / (b - a), 2), max(bins) if bins else 0
seg_rep = []
for a, b in SEGS:
    n_, mean_, mx_ = trig_stats(a, b); seg_rep.append({'segment': f'{a}-{b}s', 'sfx_minus_bgm_db': round(rms_db(sfx_out, a, b) - rms_db(bgm_out, a, b), 1), 'triggers': n_, 'triggers_per_s_mean': mean_, 'triggers_per_s_max_bin': mx_,
        'sfx_peak_dbfs': round(peak_db(sfx_out, a, b), 1), 'mix_rms_db': round(rms_db(mix, a, b), 1)})
ct, cv = curve_of(mix); tmax = float(ct[np.argmax(cv)]); top_in = cv[(ct >= 56) & (ct <= 60)].max(); top_out = cv[(ct < 56) | (ct > 60)].max()
import librosa
on = librosa.onset.onset_detect(y=sfx_out.mean(1).astype(np.float32), sr=SR, hop_length=256, units='time', backtrack=False, delta=0.02)
on5056 = [round(float(t), 2) for t in on if 50.0 <= t < 56.0]; cover = [bool(any(w0 <= t < w0 + 1 for t in on5056)) for w0 in np.arange(50.0, 55.01, 0.25)]
lt_peaks = [round(float(20 * np.log10(LIGHT_P0 * 10 ** (GROW_DB * k / 20))), 1) for k in range(8)]
metrics = {'segments': seg_rep, 'integrated_lufs': round(I_ + 20 * np.log10(gfin), 2), 'mix_peak_dbfs': round(peak_db(mix, 0, DUR), 2),
    'req1_32_37': {'sfx_minus_bgm_db': round(rms_db(sfx_out, 32, 37) - rms_db(bgm_out, 32, 37), 1), 'sfx_peak_dbfs': round(peak_db(sfx_out, 32, 37), 1), 'triggers_per_s_bins': trig_stats(32, 37)[2], 'pass': bool(rms_db(sfx_out, 32, 37) - rms_db(bgm_out, 32, 37) <= -12 and peak_db(sfx_out, 32, 37) <= -10 and trig_stats(32, 37)[2] <= 3)},
    'req2_stamp_22_25_vs_climax_db': round(rms_db(mix, 22, 25) - rms_db(mix, 56, 60), 1),
    'req3': {'climax_56_60_minus_50_55_db': round(rms_db(mix, 56, 60) - rms_db(mix, 50, 55), 1), 'rms_peak_time_s': round(tmax, 1), 'peak_in_56_60': bool(56 <= tmax <= 60), 'margin_over_best_outside_db': round(float(top_in - top_out), 1)},
    'req4_light': {'designed_peak_dbfs_per_layer(pre-mix)': lt_peaks, 'onsets_detected_50_56': on5056, 'every_second_has_onset': bool(all(cover)), 'trigger_times': [round(t, 3) for t, ty in trig if ty in ('layer_light', 'layer') and 50 <= t < 56], 'light_times': [round(t, 3) for t, ty in trig if ty == 'layer_light']},
    'req5': {'triggers_0_3_bins': [trig_stats(i, i + 1)[2] for i in range(3)], 'rms_5_9_db': round(rms_db(mix, 5, 9), 1), 'rms_0_4_db': round(rms_db(mix, 0, 4), 1), 'rms_9_20_db': round(rms_db(mix, 9, 20), 1), 'dip_applied_db': DIP[2]},
    'pitch_check': {k: v for k, v in check.items() if k != 'failed'}, 'pitch_failed': fails, 'section_rel_db': [round(r_, 2) for r_ in rels], 'sfx_gate_32_38_factor': round(float(gs_f), 4)}
if MODE == 'samples':
    sd = os.path.join(OUTDIR, 'samples'); os.makedirs(sd, exist_ok=True)
    for tag, a, b in (('A_28-43s', 28, 43), ('B_49-64s', 49, 64)):
        for nm, x in (('仅BGM', bgm_out), ('仅音效', sfx_out), ('混音', mix)): sf.write(os.path.join(sd, f'小样{tag}_{nm}.wav'), x[int(a * SR):int(b * SR)], SR, subtype='PCM_24')
    json.dump(metrics, open(os.path.join(sd, 'metrics.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print(json.dumps({k: metrics[k] for k in metrics if k not in ('pitch_failed',)}, ensure_ascii=False, indent=1)); sys.exit(0)
sf.write(os.path.join(OUTDIR, 'sfx.wav'), sfx_out, SR, subtype='PCM_24'); sf.write(os.path.join(OUTDIR, 'mix.wav'), mix, SR, subtype='PCM_24'); mix_path = os.path.join(OUTDIR, 'mix.wav')
json.dump({'summary': {k: v for k, v in check.items() if k != 'failed'}, 'failed': fails, 'notes': REC}, open(os.path.join(os.path.dirname(os.path.abspath(ANA)), 'bgm_pitch_check.json'), 'w', encoding='utf-8'), ensure_ascii=False)
def mux(wav, out): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', VIDEO, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], check=True)
mux(mix_path, PREVIEW + '.mp4'); mux(os.path.join(OUTDIR, 'sfx.wav'), PREVIEW + '_仅音效.mp4')
x = tr.mean(1); nfft, hop = 1024, 64; win = np.hanning(nfft); prev = None; fl = []
for i in range(int(55.5 * SR), int(56.5 * SR), hop):
    m = np.abs(np.fft.rfft(x[i:i + nfft] * win)); fl.append((float(np.maximum(m - prev, 0).sum()) if prev is not None else 0.0, (i + nfft / 2) / SR)); prev = m
att = max(fl)[1]; dbs = np.array(ana['downbeat_times']) - start; near = float(dbs[np.argmin(np.abs(dbs - T_DUST))])
win_info = {'start_s': round(start, 4), 'end_s': round(start + DUR, 4), 'attack_in_source_s': round(t_attack, 4), 'chosen_uplift': best, 'strongest_uplift_overall': strongest, 'strongest_overall_feasible': bool(strongest['feasible']), 'attack_in_trimmed_s': round(att, 4), 'attack_error_ms': round((att - T_DUST) * 1000, 1),
            'nearest_downbeat_in_trimmed_s': round(near, 4), 'downbeat_error_ms': round((near - T_DUST) * 1000, 1), 'fade_in_s': FADE_IN, 'fade_out_s': FADE_OUT, 'pitch_scale': {'tonic': key['tonic'], 'mode': key['mode'], 'notes': key['scale_names'], 'tuning_semitones': TUNE, 'main_chord': key['main_chord']},
            'pitch_check': {k: v for k, v in check.items() if k != 'failed'}, 'ducking_db': DEPTH, 'mix_metrics': metrics}
ana['window'] = win_info; json.dump(ana, open(ANA, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps(metrics, ensure_ascii=False, indent=1))
