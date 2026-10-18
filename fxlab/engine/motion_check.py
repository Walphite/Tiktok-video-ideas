#!/usr/bin/env python3
"""每秒平均亮度与运动量（相邻帧亮度差均值 ×100）——与 ref_analyze.py 同一方法：160×90、30fps、剔除切点前后单帧尖峰。
用法：python3 -I motion_check.py <视频> <起秒> <止秒> [切点秒,...]"""
import sys, subprocess, numpy as np
v, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]); cuts = [float(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else []
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', v, '-vf', 'scale=160:90,format=rgb24', '-r', '30', '-an', '-f', 'rawvideo', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, 90, 160, 3).astype(np.float32) / 255; luma = (0.2126 * fr[..., 0] + 0.7152 * fr[..., 1] + 0.0722 * fr[..., 2])
md = np.concatenate([[0], np.abs(np.diff(luma, axis=0)).mean((1, 2))])
for c in cuts:
    i = int(round(c * 30)); md[max(0, i - 1):i + 6] = 0   # 切点 + 闪白尾部不算运动
for s in range(int(a), int(b)): print(f'{s}-{s+1}s  luma {luma[s*30:(s+1)*30].mean():.3f}  motion {md[s*30:(s+1)*30].mean()*100:.2f}')
