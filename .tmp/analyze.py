# -*- coding: utf-8 -*-
"""看一眼渲染出来的东西：响度曲线 + 频谱图，纯诊断用，不属于成品链路。"""
import sys, wave
import numpy as np
from PIL import Image, ImageDraw

path = sys.argv[1] if len(sys.argv) > 1 else ".tmp/susu_mix.wav"
png = sys.argv[2] if len(sys.argv) > 2 else ".tmp/susu_spectrum.png"

with wave.open(path, "rb") as w:
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    raw = w.readframes(n)
x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
x = x.reshape(-1, ch).mean(1)
print(f"sr={sr} ch={ch} len={len(x)/sr:.1f}s  peak={np.max(np.abs(x)):.3f}  "
      f"rms={20*np.log10(np.sqrt(np.mean(x**2))+1e-9):.1f} dBFS")

# 每 0.5s 的 RMS，看结构
win = int(0.5 * sr)
nb = len(x) // win
r = np.array([np.sqrt(np.mean(x[i*win:(i+1)*win]**2)) for i in range(nb)])
db = 20*np.log10(r+1e-9)
print("每 0.5s 的 RMS(dBFS)：")
print(" ".join(f"{v:.0f}" for v in db[::2]))

# 频段能量
X = np.abs(np.fft.rfft(x[::4]))
f = np.fft.rfftfreq(len(x[::4]), 1/(sr/4))
tot = np.sum(X**2)+1e-9
for lo, hi in [(20, 60), (60, 150), (150, 400), (400, 1000), (1000, 3000), (3000, 8000), (8000, 16000)]:
    m = (f >= lo) & (f < hi)
    print(f"  {lo:>5}-{hi:<5} Hz : {100*np.sum(X[m]**2)/tot:5.1f}%")

# 频谱图（对数频率）
H, W = 360, 1200
hop = max(1, len(x) // W)
nfft = 2048
frames = []
for i in range(W):
    s = i * hop
    seg = x[s:s+nfft]
    if len(seg) < nfft:
        seg = np.pad(seg, (0, nfft-len(seg)))
    frames.append(np.abs(np.fft.rfft(seg*np.hanning(nfft))))
S = np.array(frames).T  # freq x time
fl = np.fft.rfftfreq(nfft, 1/sr)
# 对数频率映射到 0..H
flog = np.logspace(np.log10(30), np.log10(sr/2), H)
idx = np.searchsorted(fl, flog)
img = 20*np.log10(S[idx, :]+1e-9)
img = np.clip((img - img.max() + 80) / 80, 0, 1)
rgb = (np.stack([img**0.8, img**1.2, img**0.6], -1) * 255).astype(np.uint8)
rgb = rgb[::-1]
im = Image.fromarray(rgb).resize((W, H))
d = ImageDraw.Draw(im)
for b in range(0, 65, 4):
    t = b*4*60/124.0
    px = int(t/ (len(x)/sr) * W)
    d.line([(px, 0), (px, H)], fill=(90, 255, 90), width=1)
    d.text((px+2, 2), str(b), fill=(200, 255, 200))
im.save(png)
print("图 ->", png)
