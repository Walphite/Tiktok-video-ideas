# ============================================================
# fxlab 声音合成：读事件日志 events.json，用 numpy 合成 sfx.wav / music.wav / mix.wav
# 用法：python3 audio.py events.json 输出目录
# 音画同源：所有音都来自模拟产生的事件（时间、音高序号、强度、横向位置 → 声像）
# 事件 → 乐器 的映射写在 events.json 的 sounds 里（来自预设默认值 + 场景覆盖）：
#   "hit": {"instr": "pluck", "track": "sfx", "base": 57, "scale": "pentatonic", "decay": 0.9, "gain": 0.55}
# 配乐层（music.layers）：pad（和弦垫）、drone（低音）；也可以由事件走 music 轨
# ============================================================
import sys, json, math, wave
import numpy as np
from scipy.signal import lfilter, butter

SR = 48000
SCALES = {
    'pentatonic': [0, 2, 4, 7, 9], 'minor_pent': [0, 3, 5, 7, 10], 'major': [0, 2, 4, 5, 7, 9, 11],
    'minor': [0, 2, 3, 5, 7, 8, 10], 'lydian': [0, 2, 4, 6, 7, 9, 11], 'chromatic': list(range(12)), 'whole': [0, 2, 4, 6, 8, 10],
}
def midi2hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def scale_midi(base, scale, idx):
    s = SCALES.get(scale, SCALES['pentatonic']); o, k = divmod(int(idx), len(s)); return base + 12 * o + s[k]
def env_exp(n, decay, attack=0.003):
    t = np.arange(n) / SR; e = np.exp(-t / max(decay, 1e-3)); a = np.minimum(1, t / max(attack, 1e-4)); return e * a
def lowpass(x, fc, order=2):
    fc = min(max(fc, 30), SR * 0.45); b, a = butter(order, fc / (SR / 2)); return lfilter(b, a, x)
def highpass(x, fc, order=2):
    fc = min(max(fc, 30), SR * 0.45); b, a = butter(order, fc / (SR / 2), btype='high'); return lfilter(b, a, x)

# ---------------- 乐器 ----------------
def blip(f, decay, vel):  # 干净的正弦点音
    n = int(SR * decay * 5); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * env_exp(n, decay) * 0.6
def pluck(f, decay, vel):  # 拨弦感：多泛音，高泛音衰减更快
    n = int(SR * decay * 4); t = np.arange(n) / SR; out = np.zeros(n)
    for k in range(1, 7):
        out += np.sin(2 * np.pi * f * k * t + 0.3 * k) / k * np.exp(-t / (decay / (1 + 0.8 * (k - 1))))
    out *= np.minimum(1, t / 0.002); return lowpass(out, 1200 + 6000 * vel) * 0.5
def chime(f, decay, vel):  # 钟片：非整数泛音
    n = int(SR * decay * 4); t = np.arange(n) / SR; out = np.zeros(n)
    for k, amp in ((1, 1), (2.76, 0.5), (5.4, 0.25), (8.9, 0.12)):
        out += amp * np.sin(2 * np.pi * f * k * t) * np.exp(-t / (decay / (1 + 0.5 * k)))
    return out * np.minimum(1, t / 0.002) * 0.45
def tick(f, decay, vel, rng):  # 节拍器式短噪声点击，带一点音高
    n = int(SR * max(decay, 0.02) * 4); t = np.arange(n) / SR
    x = rng.standard_normal(n) * np.exp(-t / (decay * 0.5)) + 0.6 * np.sin(2 * np.pi * f * t) * np.exp(-t / (decay * 0.8))
    return highpass(lowpass(x, min(f * 4, 12000)), 600) * 0.7
def rain(f, decay, vel, rng):  # 很轻的高频提示音（像雨）
    n = int(SR * 0.12); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.018) + 0.3 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t / 0.01)) * 0.5
def thud(f, decay, vel, rng):  # 钝响：音高下滑的低音 + 噪声冲击 + 轻微失真
    n = int(SR * decay * 3); t = np.arange(n) / SR
    fi = f * 4 * np.exp(-t / 0.08) + f; ph = 2 * np.pi * np.cumsum(fi) / SR
    x = np.sin(ph) * np.exp(-t / decay) + 0.8 * rng.standard_normal(n) * np.exp(-t / 0.035)
    x = np.tanh(x * 2.5) * 0.8; return lowpass(x, 900)
def swoosh(f, decay, vel, rng):  # 噪声扫频：爆发后的空气感
    n = int(SR * decay); t = np.arange(n) / SR
    x = rng.standard_normal(n); x = lowpass(x, 3000); x = highpass(x, 300)
    e = np.sin(np.pi * np.minimum(1, t / decay)) ** 2 * np.exp(-t / (decay * 0.7)); return x * e * 0.5
def paper(f, decay, vel, rng):  # 纸张沙沙
    n = int(SR * decay * 2); t = np.arange(n) / SR
    x = rng.standard_normal(n) * (0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(40, 90) * t)); x = highpass(lowpass(x, 6000), 1500)
    return x * np.exp(-t / decay) * np.minimum(1, t / 0.01) * 0.5
def extinguish(f, decay, vel, rng):  # 熄灭：音高下行的短音
    n = int(SR * decay * 3); t = np.arange(n) / SR
    fi = f * (1 + 0.6 * np.exp(-t / (decay * 0.6))); ph = 2 * np.pi * np.cumsum(fi) / SR
    return np.sin(ph) * np.exp(-t / decay) * 0.5
def chord_pad(notes, dur, attack, release, gain, rng):  # 和弦垫：每个音 3 个微失谐的锯齿波 + 低通
    n = int(SR * (dur + release)); t = np.arange(n) / SR; out = np.zeros(n)
    for m in notes:
        for det in (-0.4, 0, 0.4):
            f = midi2hz(m + det / 12); ph = 2 * np.pi * f * t + rng.uniform(0, 6.28)
            saw = (ph / np.pi) % 2 - 1; out += (saw * 0.35 + np.sin(ph) * 0.65)
    out = lowpass(out, 500 + 400 * (1 - np.exp(-1))); out = lowpass(out, 900)
    a = np.minimum(1, t / max(attack, 0.01)); r = np.ones(n); i0 = int(SR * dur); r[i0:] = np.exp(-(t[i0:] - dur) / max(release, 0.01)) if n > i0 else 1
    # 轻微颤动
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.3 * t)
    return out * a * r * trem * gain / max(1, len(notes))
def drone(notes, dur, attack, release, gain, rng):
    n = int(SR * (dur + release)); t = np.arange(n) / SR; out = np.zeros(n)
    for m in notes:
        f = midi2hz(m); out += np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.17 * t)) + 0.2 * np.sin(2 * np.pi * f * 3 * t)
    a = np.minimum(1, t / max(attack, 0.01)); r = np.ones(n); i0 = int(SR * dur); r[i0:] = np.exp(-(t[i0:] - dur) / max(release, 0.01))
    return out * a * r * gain / max(1, len(notes))

def chordpad(f, decay, vel, rng):  # 短和弦垫：单音版本，和弦由 notes 列表叠加
    n = int(SR * decay * 3); t = np.arange(n) / SR
    ph = 2 * np.pi * f * t; x = np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * ((ph / np.pi) % 2 - 1)
    x = lowpass(x, 1800); a = np.minimum(1, t / 0.04); return x * a * np.exp(-t / decay) * 0.4
INSTR = {'chord': chordpad, 'blip': lambda f, d, v, r: blip(f, d, v), 'pluck': lambda f, d, v, r: pluck(f, d, v), 'chime': lambda f, d, v, r: chime(f, d, v),
         'tick': tick, 'rain': rain, 'thud': thud, 'swoosh': swoosh, 'paper': paper, 'extinguish': extinguish}

def add_at(buf, x, t, pan):  # 把单声道片段叠加到立体声缓冲，pan ∈ [-1, 1]
    i0 = int(t * SR); n = min(len(x), buf.shape[0] - i0)
    if n <= 0: return
    l = math.cos((pan + 1) * math.pi / 4); r = math.sin((pan + 1) * math.pi / 4)
    buf[i0:i0 + n, 0] += x[:n] * l; buf[i0:i0 + n, 1] += x[:n] * r

def main():
    src, outdir = sys.argv[1], sys.argv[2]
    d = json.load(open(src, encoding='utf-8')); dur = d['duration']; N = int(SR * (dur + 0.05))
    tracks = {'sfx': np.zeros((N, 2)), 'music': np.zeros((N, 2))}
    sounds = d.get('sounds', {}); rng = np.random.default_rng(12345)
    cache = {}
    for ev in d['events']:
        cfg = sounds.get(ev['type'])
        if not cfg: continue
        instr = INSTR.get(cfg.get('instr', 'blip'), INSTR['blip'])
        vel = float(ev.get('vel', 1.0)); decay = float(cfg.get('decay', 0.3)) * float(ev.get('decayMul', 1.0))
        midis = ev.get('notes') or [ev.get('midi', scale_midi(cfg.get('base', 60), cfg.get('scale', 'pentatonic'), ev.get('pitch', 0)))]
        x = None
        for midi in midis:
            key = (cfg.get('instr'), round(midi, 2), round(decay, 3), round(vel, 1))
            if key not in cache or cfg.get('instr') in ('tick', 'paper', 'rain'):  # 噪声类乐器每次不同
                cache[key] = instr(midi2hz(midi), decay, vel, rng)
            y = cache[key]
            if x is None: x = y.copy()
            else:
                m = max(len(x), len(y)); z = np.zeros(m); z[:len(x)] += x; z[:len(y)] += y; x = z
        x = x * cfg.get('gain', 0.5) * (0.35 + 0.65 * vel) / math.sqrt(len(midis))
        add_at(tracks[cfg.get('track', 'sfx')], x, ev['t'], (float(ev.get('x', 0.5)) - 0.5) * 1.4)
    music = d.get('music') or {}
    for layer in music.get('layers', []):
        kind = layer.get('type', 'pad'); fn = chord_pad if kind == 'pad' else drone
        x = fn(layer['notes'], layer['end'] - layer['t'], layer.get('attack', 1), layer.get('release', 1), layer.get('gain', 0.15), rng)
        add_at(tracks['music'], x, layer['t'], layer.get('pan', 0))
    def finish(buf, peak=0.85):
        buf = np.tanh(buf * 1.1); m = np.abs(buf).max()
        return buf / m * peak if m > peak else buf
    sfx = finish(tracks['sfx']); mus = finish(tracks['music'], 0.6); mix = finish(sfx + mus, 0.9)
    for name, b in (('sfx', sfx), ('music', mus), ('mix', mix)):
        with wave.open(f'{outdir}/{name}.wav', 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(b, -1, 1) * 32767).astype('<i2').tobytes())
    print(f'声音合成完成：{len(d["events"])} 个事件 → sfx.wav / music.wav / mix.wav（{dur}s）')
if __name__ == '__main__': main()
