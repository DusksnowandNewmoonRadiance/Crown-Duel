"""
宏大向 BGM 离线渲染器
------------------------------------------------------------
不依赖任何采样库，用加法合成 + FFT 混响把「管弦感」堆出来：
  · 低音弦乐：加法锯齿 + 谐波滚降（相当于低通），慢起音
  · 合唱 pad：带共振峰加权的谐波，走大混响
  · 定音鼓：下滑正弦 + 噪声瞬态
  · 低音铜管：滤波扫频做的 swell
  · 长混响 + 软限幅，最后首尾交叉淡化做成无缝 loop
输出 32kHz 立体声 WAV，交给 ffmpeg 转 OGG。
"""
import numpy as np, sys, wave, os

SR = 32000
rng = np.random.default_rng(20261018)


# ---------------------------------------------------------------- 基础
def t_axis(n):
    return np.arange(n) / SR


def env_adsr(n, a, d, s, r):
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    S = max(0, n - A - D - R)
    parts = []
    if A: parts.append(np.linspace(0, 1, A, endpoint=False))
    if D: parts.append(np.linspace(1, s, D, endpoint=False))
    parts.append(np.full(S, s))
    if R: parts.append(np.linspace(s, 0, R))
    e = np.concatenate(parts) if parts else np.zeros(0)
    if len(e) < n: e = np.pad(e, (0, n - len(e)))
    return e[:n]


def add_saw(f0, n, bright=0.45, vib=0.0, phase=0.0):
    """加法锯齿：bright 控制谐波衰减速度（0=几乎纯正弦，1=接近明亮锯齿）"""
    t = t_axis(n)
    out = np.zeros(n)
    kmax = min(48, int(SR * 0.45 / max(f0, 1)))
    K = 2.0 + 20.0 * bright
    for k in range(1, kmax + 1):
        amp = (1.0 / k) * np.exp(-k / K)
        if amp < 1e-4: break
        f = f0 * k
        out += amp * np.sin(2 * np.pi * f * t + phase * k)
    return out


def add_choir(f0, n, phase=0.0):
    """人声感：在 700Hz / 1200Hz 附近抬两个共振峰"""
    t = t_axis(n)
    out = np.zeros(n)
    kmax = min(30, int(SR * 0.45 / max(f0, 1)))
    for k in range(1, kmax + 1):
        f = f0 * k
        if f > SR * 0.45: break
        amp = 1.0 / k
        for fc, bw, g in ((700, 260, 2.6), (1180, 340, 1.7)):
            amp += g / k * np.exp(-((f - fc) ** 2) / (2 * bw ** 2))
        out += amp * np.sin(2 * np.pi * f * t + phase * k)
    return out


def timpani(dur=0.9, f0=68, f1=44):
    n = int(dur * SR)
    t = t_axis(n)
    f = f1 + (f0 - f1) * np.exp(-t * 9)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.2)
    noise = rng.standard_normal(n) * np.exp(-t * 26)
    # 一阶低通（人耳判定为「鼓皮」而不是「沙锤」）
    lp, a = np.zeros(n), 0.22
    acc = 0.0
    for i in range(n):
        acc += a * (noise[i] - acc)
        lp[i] = acc
    return body * 0.9 + lp * 1.5


def boom(dur=1.6, f0=52):
    n = int(dur * SR)
    t = t_axis(n)
    f = f0 * (1 + 1.8 * np.exp(-t * 12))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)


def riser(dur, f_lo=180, f_hi=6000):
    n = int(dur * SR)
    t = t_axis(n)
    x = rng.standard_normal(n)
    # 频域扫频：把噪声整形成随时间的带通，用短时分帧实现
    out = np.zeros(n)
    frame = 2048
    for i in range(0, n, frame):
        seg = x[i:i + frame]
        if len(seg) < 8: break
        k = i / max(1, n - 1)
        fc = f_lo * (f_hi / f_lo) ** k
        S = np.fft.rfft(seg)
        freqs = np.fft.rfftfreq(len(seg), 1 / SR)
        mask = np.exp(-((freqs - fc) ** 2) / (2 * (fc * 0.55) ** 2))
        out[i:i + len(seg)] = np.fft.irfft(S * mask, len(seg))
    return out * np.linspace(0.15, 1.0, n) ** 2


# ---------------------------------------------------------------- 混音工具
def place(buf, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[0]: return
    j = min(buf.shape[0], i + len(sig))
    seg = sig[: j - i]
    # 等功率声像
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[i:j, 0] += seg * gain * l
    buf[i:j, 1] += seg * gain * r


def reverb(x, seconds=3.0, decay=2.6, predelay=0.025, wet=0.42):
    n = x.shape[0]
    L = int((seconds + predelay) * SR)
    t = t_axis(L)
    ir = rng.standard_normal((L, 2)) * np.exp(-t / (seconds / decay))[:, None]
    pre = int(predelay * SR)
    ir[:pre] = 0
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
    N = 1 << int(np.ceil(np.log2(n + L)))
    Y = np.fft.irfft(np.fft.rfft(x, N, axis=0) * np.fft.rfft(ir, N, axis=0), N, axis=0)[:n]
    return x * (1 - wet) + Y * wet * 2.2


def soft_limit(x, drive=1.15):
    return np.tanh(x * drive) / np.tanh(drive)


def normalize(x, peak_db=-1.5):
    p = np.max(np.abs(x)) or 1.0
    return x * (10 ** (peak_db / 20) / p)


# ---------------------------------------------------------------- 编曲
NOTES = {"D": 38.89, "E": 43.65, "F": 43.65 * 2 ** (1 / 12), "G": 49.0,
         "A": 55.0, "Bb": 58.27, "C": 65.41, "D2": 73.42, "F2": 87.31, "A2": 110.0}


def hz(name, octave_shift=0):
    base = {"D": 36.71, "E": 41.20, "F": 43.65, "G": 49.00, "A": 55.00,
            "Bb": 58.27, "C": 65.41, "D3": 73.42, "F3": 87.31, "A3": 110.0}[name]
    return base * (2 ** octave_shift)


#  i–VI–III–VII：Dm – Bb – F – C，史诗最常见的进行
PROG = [
    ("D", ["D", "F", "A"], "D3"),
    ("Bb", ["Bb", "D", "F"], "D3"),
    ("F", ["F", "A", "C"], "F3"),
    ("C", ["C", "E", "G"], "A3"),
]


def render(theme):
    if theme == "menu":
        bpm, bars = 68, 8
        dens, drive = 0.55, 0.95
    else:
        bpm, bars = 96, 16
        dens, drive = 1.0, 1.15

    beat = 60.0 / bpm
    bar = beat * 4
    total = bars * bar
    tail = 4.0
    n = int((total + tail) * SR)
    buf = np.zeros((n, 2))

    # ---- 持续低音：整段的「地基」
    for f, g in ((hz("D"), 0.17), (hz("A"), 0.10)):
        d = add_saw(f, n, bright=0.22) * 0.5 + np.sin(2 * np.pi * f * 0.5 * t_axis(n)) * 0.25
        lfo = 1 + 0.12 * np.sin(2 * np.pi * 0.07 * t_axis(n))
        place(buf, d * lfo, 0, g)

    # ---- 和声：低音弦乐 + 合唱 pad，两小节换一次和弦
    for b in range(bars):
        root, chord, lead = PROG[(b // 2) % 4]
        t0 = b * bar
        dur = bar
        low = 0.55 + 0.45 * (b / bars)          # 越到后面越厚
        for i, nm in enumerate(chord):
            f = hz(nm, 1) * (1 if i else 0.5)
            sig = add_saw(f, int((dur + 2.2) * SR), bright=0.70) * env_adsr(int((dur + 2.2) * SR), 1.1, 0.6, 0.85, 2.0)
            place(buf, sig, t0, 0.15 * low, pan=(-0.45 + 0.45 * i))
            # 高两个八度：中频支撑（没有这层，整段会闷在低频里）
            mid = add_saw(f * 4, int((dur + 2.0) * SR), bright=0.62) * env_adsr(int((dur + 2.0) * SR), 1.3, 0.5, 0.8, 1.8)
            place(buf, mid, t0 + 0.05, 0.085 * low, pan=(0.5 - 0.35 * i))
            # 高三个八度：只给空气感，压得很低
            air = add_saw(f * 8, int((dur + 1.6) * SR), bright=0.8) * env_adsr(int((dur + 1.6) * SR), 1.6, 0.4, 0.7, 1.4)
            place(buf, air, t0 + 0.1, 0.022 * low, pan=(-0.3 + 0.3 * i))
            if dens > 0.6:
                ch = add_choir(f * 2, int((dur + 2.4) * SR)) * env_adsr(int((dur + 2.4) * SR), 0.9, 0.8, 0.8, 2.2)
                place(buf, ch, t0 + 0.12, 0.05 * low, pan=(0.4 - 0.4 * i))

    # ---- 空气床：极轻的高频噪声，给「大厅」的空间感
    airbed = rng.standard_normal((n, 2)) * 0.006
    S = np.fft.rfft(airbed, axis=0)
    fr = np.fft.rfftfreq(n, 1 / SR)[:, None]
    S *= (fr / 2500) ** 1.5 / (1 + (fr / 2500) ** 3)
    buf += np.fft.irfft(S, n, axis=0)

    # ---- 定音鼓：menu 从第 5 小节进，duel 每小节都有
    for b in range(bars):
        if theme == "menu" and b < 4: continue
        t0 = b * bar
        hits = [0.0, 2 * beat] if theme == "menu" else [0.0, 1.5 * beat, 2 * beat, 3.5 * beat]
        for h in hits:
            place(buf, timpani(), t0 + h, 0.30 if theme == "menu" else 0.34, pan=-0.1)
            if dens > 0.6:
                place(buf, timpani(0.6, 96, 70), t0 + h + 0.02, 0.10, pan=0.25)

    # ---- 低音铜管 swell：每 4 小节一次，从小节第 3 拍推上来
    for b in range(0, bars, 4):
        t0 = b * bar + 2 * beat
        dur = 2 * bar
        f = hz(PROG[(b // 2) % 4][2], 1) * 0.5
        nn = int(dur * SR)
        sw = add_saw(f, nn, bright=0.78) * env_adsr(nn, dur * 0.55, dur * 0.1, 0.9, dur * 0.35)
        place(buf, sw, t0, 0.12, pan=0.0)

    # ---- 进入 loop 前的 riser + boom（每段的最后一小节）
    for b in range(bars - 1, bars):
        t0 = b * bar + 2 * beat
        place(buf, riser(bar * 0.5), t0, 0.09, pan=0.0)
    if theme == "duel":
        for b in range(3, bars, 4):
            place(buf, boom(), b * bar, 0.22)
            place(buf, riser(bar * 0.4), (b - 1) * bar + 2 * beat, 0.06)

    # ---- 后期
    mix = reverb(buf, seconds=3.2, decay=2.4, wet=0.40 if theme == "menu" else 0.32)
    # 轻微高通，去掉 30Hz 以下的浑浊
    S = np.fft.rfft(mix, axis=0)
    fr = np.fft.rfftfreq(mix.shape[0], 1 / SR)[:, None]
    S *= 1 / (1 + (34 / np.maximum(fr, 1)) ** 4)
    mix = np.fft.irfft(S, mix.shape[0], axis=0)
    mix = soft_limit(mix, drive)

    # ---- 无缝 loop：把尾巴叠回开头
    m = int(total * SR)
    t2 = int(tail * SR)
    head = mix[:t2].copy()
    tailseg = mix[m:m + t2]
    fi = (np.linspace(0, 1, t2) ** 1.2)[:, None]   # 开头淡入
    fo = (np.linspace(1, 0, t2) ** 1.2)[:, None]   # 尾巴淡出
    mix[:t2] = head * fi + tailseg * fo
    mix = normalize(mix[:m], -1.5)
    return mix


def write_wav(path, x):
    data = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    for theme in ("menu", "duel"):
        x = render(theme)
        p = os.path.join(out, f"{theme}.wav")
        write_wav(p, x)
        peak = 20 * np.log10(np.max(np.abs(x)) + 1e-9)
        rms = 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)
        print(f"{theme}: {len(x)/SR:.1f}s  peak={peak:.1f}dBFS  rms={rms:.1f}dBFS  -> {p}")
