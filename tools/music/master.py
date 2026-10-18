"""
母带处理 + 无缝循环
------------------------------------------------------------
SoundFont 的问题是超低频几乎没有（20-60Hz 比中频低 30dB），所以补一层合成 sub。
但 sub 必须是「跟着曲子呼吸」的，否则会把整首的起伏抹平（恒定低频 = 恒定响度）。
所以：
  1. 先从音频里估一条慢包络（0.8s 平滑），sub 与空气层都按它缩放
  2. sub 的频率量化到「循环长度内整数个周期」，保证接缝处相位连续
  3. 先折叠尾巴再做 sub，折叠后的长度就是循环长度
"""
import sys, os, wave
import numpy as np

rng = np.random.default_rng(7)


def load(p):
    with wave.open(p, "rb") as w:
        n = w.getnframes()
        d = np.frombuffer(w.readframes(n), dtype="<i2").reshape(-1, 2) / 32768.0
        return d, w.getframerate()


def write(p, x, sr):
    d = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(p, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(d.tobytes())


def rms_db(x):
    return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)


def box_smooth(v, k):
    """O(n) 的滑动平均（cumsum 实现，避免 O(n*k) 的直接卷积）"""
    k = max(1, int(k))
    pad = np.pad(v, (k // 2, k - k // 2 - 1), mode="edge")
    cs = np.cumsum(np.concatenate([[0], pad]))
    return (cs[k:] - cs[:-k]) / k


def slow_env(x, sr, win=0.5, lo=0.25, hi=1.0):
    """从音频本身估一条响度包络，让叠加层跟着曲子呼吸"""
    m = np.abs(x).mean(axis=1)
    e = box_smooth(m, win * sr)
    e = e / (e.max() + 1e-9)
    e = np.clip(e, 0, 1) ** 0.6
    e = lo + (hi - lo) * e
    e = box_smooth(e, 0.25 * sr)
    return e[:, None]


def trim(x, sr, thr=0.004, keep=0.5):
    m = np.abs(x).max(axis=1)
    idx = np.where(m > thr)[0]
    if len(idx) == 0: return x
    return x[: min(len(x), idx[-1] + int(keep * sr))]


def fold(x, sr, xf=1.8):
    """把尾巴叠回开头；返回长度 = n - k，接缝处连续"""
    n = x.shape[0]
    k = min(int(xf * sr), n // 4)
    fi = (np.linspace(0, 1, k) ** 1.35)[:, None]
    fo = (np.linspace(1, 0, k) ** 1.35)[:, None]
    y = x[: n - k].copy()
    y[:k] = x[:k] * fi + x[n - k:] * fo
    return y


def loop_periodic(freq, n, sr):
    """把频率量化成「n/sr 秒内整数个周期」，循环时相位连续"""
    T = n / sr
    cycles = max(1, round(freq * T))
    return cycles / T


def sub_layer(n, sr, env):
    t = np.arange(n) / sr
    out = np.zeros((n, 2))
    for f, g, pan in ((36.71, 1.0, 0.0), (55.0, 0.5, -0.15), (73.42, 0.22, 0.22)):
        fq = loop_periodic(f, n, sr)
        s = np.sin(2 * np.pi * fq * t) + 0.16 * np.sin(2 * np.pi * fq * 2 * t)
        l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
        out[:, 0] += s * g * l
        out[:, 1] += s * g * r
    return out * env * 0.075


def air_layer(n, sr, env):
    x = rng.standard_normal((n, 2))
    S = np.fft.rfft(x, axis=0)
    fr = np.fft.rfftfreq(n, 1 / sr)[:, None]
    S *= (fr / 3000) ** 1.4 / (1 + (fr / 3000) ** 3)
    return np.fft.irfft(S, n, axis=0) * env * 0.009


def normalize(x, peak_db=-1.5):
    p = np.max(np.abs(x))
    return x if p <= 0 else x * (10 ** (peak_db / 20) / p)


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    for name in ("menu", "duel"):
        x, sr = load(os.path.join(src, f"{name}.wav"))
        raw_arc = [rms_db(x[i:i + 4 * sr]) for i in range(0, len(x), 4 * sr)]
        x = trim(x, sr)
        x = normalize(x, -6.0)
        # 轻微高频提亮（SoundFont 2.5k 以上偏暗）
        n0 = x.shape[0]
        S = np.fft.rfft(x, axis=0)
        fr = np.fft.rfftfreq(n0, 1 / sr)[:, None]
        x = np.fft.irfft(S * (1 + 0.5 / (1 + (6000 / np.maximum(fr, 1)) ** 3)), n0, axis=0)
        x = fold(x, sr, 1.8)
        n = x.shape[0]
        env = slow_env(x, sr)
        x = x + sub_layer(n, sr, env) + air_layer(n, sr, env)
        x = normalize(x, -1.5)
        write(os.path.join(dst, f"{name}.wav"), x, sr)
        arc = [rms_db(x[i:i + 4 * sr]) for i in range(0, len(x), 4 * sr)]
        seam = abs(x[0, 0] - x[-1, 0]); local = np.abs(np.diff(x[-400:, 0])).mean()
        print(f"{name}: {n/sr:.1f}s peak=-1.5 rms={rms_db(x):.1f}")
        print("   raw arc :", " ".join(f"{v:.0f}" for v in raw_arc))
        print("   out arc :", " ".join(f"{v:.0f}" for v in arc))
        print(f"   seam={seam:.4f} local={local:.4f}")
