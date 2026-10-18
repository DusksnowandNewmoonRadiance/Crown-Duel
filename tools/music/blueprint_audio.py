#!/usr/bin/env python3
"""
皇冠对决 · 「蓝图」主题音频渲染器
------------------------------------------------------------------------------
纯 numpy/scipy 离线合成，不依赖采样库、不依赖 fluidsynth/ffmpeg；
用 soundfile 直接写 OGG Vorbis。输出：
  public/audio/sfx/*.ogg   21 个音效（点击、选牌、出牌、命中、治疗……）
  public/audio/bgm/*.ogg   menu / duel 两首无缝循环

声音设定（对应视觉：深炭底 / 半调点阵 / 十字定位 / 金色手写体 / 十六进制标注）
  · 冷色、克制、精确：D 多利亚调式，短促的马林巴/FM 拨奏 + 玻璃钟点缀（对应「金色」）
  · 「点阵」：高频短促 tick（对应半调点），16 分音符噪点当律动
  · 「定位」：UI 提示音是干净的 sine 双音 + 极短混响，像十字准星锁定
  · 「叠影」：乒乓延迟 + 反向铺底，模拟镜像倒影
  · 低频只用 sub 与软鼓，不堆厚度——留给对局里的重击音效

用法：  python tools/music/blueprint_audio.py [--only sfx|bgm]
依赖：  pip install numpy scipy soundfile
"""
import argparse, os, sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_SFX = os.path.join(ROOT, "public", "audio", "sfx")
OUT_BGM = os.path.join(ROOT, "public", "audio", "bgm")
rng = np.random.default_rng(20261018)

# ------------------------------------------------------------------ 基础工具
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def T(sec): return np.arange(int(SR * sec)) / SR
def silence(sec): return np.zeros((2, int(SR * sec)))

def lp(x, fc, order=2): return sosfilt(butter(order, min(fc, SR * .45), "low", fs=SR, output="sos"), x)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, min(hi, SR * .45)], "band", fs=SR, output="sos"), x)

def adsr(n, a=.004, d=.1, s=.0, r=.05):
    """指数风格包络，n 为样本数。s 为持续电平（0 = 纯衰减）。"""
    t = np.arange(n) / SR
    env = np.where(t < a, t / max(a, 1e-6), 1.0)
    env = env * (s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4)))
    rl = int(r * SR)
    if rl > 0 and rl < n:
        env[-rl:] *= np.linspace(1, 0, rl)
    return env

def sine(f, sec, ph=0.0):
    return np.sin(2 * np.pi * f * T(sec) + ph)

def saw(f, sec):
    ph = (f * T(sec)) % 1.0
    return 2 * ph - 1

def noise(sec): return rng.uniform(-1, 1, int(SR * sec))

def stereo(sig, pan=0.0, gain=1.0):
    """单声道 → 立体声（等功率声像，pan -1..1）"""
    a = (pan + 1) * np.pi / 4
    return np.stack([sig * np.cos(a) * gain, sig * np.sin(a) * gain])

def place(buf, sig, t, pan=0.0, gain=1.0):
    """把单声道/立体声片段叠加到 buf 的 t 秒处（自动裁剪）"""
    if sig.ndim == 1: sig = stereo(sig, pan, gain)
    elif gain != 1.0: sig = sig * gain
    i = int(round(t * SR))
    if i < 0:
        sig = sig[:, -i:]
        i = 0
    if i >= buf.shape[1] or sig.shape[1] == 0: return
    n = min(sig.shape[1], buf.shape[1] - i)
    if n > 0: buf[:, i:i + n] += sig[:, :n]

def pad_to(sig, sec):
    n = int(SR * sec)
    if sig.ndim == 1: return np.pad(sig, (0, max(0, n - len(sig))))[:n]
    return np.pad(sig, ((0, 0), (0, max(0, n - sig.shape[1]))))[:, :n]

def make_ir(sec=1.8, decay=3.2, dark=6000, predelay=.012, seed=1):
    r = np.random.default_rng(seed)
    n = int(SR * sec)
    out = []
    for _ in range(2):
        x = r.uniform(-1, 1, n)
        t = np.arange(n) / SR
        x *= np.exp(-t * decay)
        x = lp(x, dark)
        x = np.concatenate([np.zeros(int(predelay * SR)), x])
        out.append(x)
    ir = np.stack(out)
    return ir / np.sqrt((ir ** 2).sum() / 2)

def reverb(x, wet=.2, **kw):
    ir = make_ir(**kw)
    n = x.shape[1]
    w = np.stack([fftconvolve(x[c], ir[c])[:n + ir.shape[1]] for c in range(2)])
    w = pad_to(w, (n + ir.shape[1]) / SR)
    d = np.pad(x, ((0, 0), (0, w.shape[1] - n)))
    return d * (1 - wet * .5) + w * wet * .28

def reverb_loop(x, wet=.25, **kw):
    """循环用混响：把尾巴折回开头，保证无缝。"""
    y = reverb(x, wet, **kw)
    n = x.shape[1]
    out = y[:, :n].copy()
    tail = y[:, n:]
    k = 0
    while k < tail.shape[1]:
        m = min(n, tail.shape[1] - k)
        out[:, :m] += tail[:, k:k + m]
        k += n
    return out

def pingpong(x, delay, fb=.38, taps=5, lpf=3800):
    """乒乓延迟：每次反弹换声道并变暗，对应「镜像倒影」"""
    n = x.shape[1]
    out = x.copy()
    cur = x
    d = int(delay * SR)
    for k in range(taps):
        cur = lp(cur[::-1], lpf) * fb  # 换声道（行反转）
        sh = np.zeros_like(cur)
        sh[:, d:] = cur[:, :n - d]
        cur = sh
        out += cur
    return out

def crush(x, bits=6, hold=1):
    """比特压缩 + 采样保持 → 数字 / 故障质感"""
    q = 2 ** bits
    y = np.round(x * q) / q
    if hold > 1:
        y = np.repeat(y[::hold], hold)[:len(x)]
    return y

def softclip(x, drive=1.0): return np.tanh(x * drive) / np.tanh(drive)

def finalize(x, peak_db=-1.5, fade_in=.002, fade_out=.01, clip=False):
    if clip: x = softclip(x, 1.4)
    p = np.abs(x).max() + 1e-9
    x = x / p * 10 ** (peak_db / 20)
    fi, fo = int(fade_in * SR), int(fade_out * SR)
    if fi: x[:, :fi] *= np.linspace(0, 1, fi)
    if fo: x[:, -fo:] *= np.linspace(1, 0, fo)
    return x

def trim(x, thr=2e-3, tail=.03):
    """裁掉混响尾巴里听不见的静音（-54 dB 以下）"""
    idx = np.where(np.abs(x).max(axis=0) > thr)[0]
    end = min(x.shape[1], (idx[-1] if len(idx) else 0) + int(tail * SR))
    x = x[:, :end].copy()
    f = min(end, int(tail * SR))
    x[:, -f:] *= np.linspace(1, 0, f)
    return x

def write_ogg(path, x, q=.55):
    import soundfile as sf
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = x.T.astype(np.float32)
    # 长音频一次性写入会让 libsndfile 的 vorbis 编码器栈溢出，分块写
    with sf.SoundFile(path, "w", samplerate=SR, channels=2, format="OGG", subtype="VORBIS") as f:
        for i in range(0, len(data), 16384):
            f.write(data[i:i + 16384])
    return os.path.getsize(path)

# ------------------------------------------------------------------ 音色
def mallet(f, sec=.9, bright=3.0, decay=.28):
    """FM 马林巴：调制比 4，调制指数随时间快速衰减 → 木质敲击"""
    t = T(sec)
    idx = bright * np.exp(-t * 18)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 4.0 * t))
    y *= np.exp(-t / decay)
    y += .25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / (decay * .5))
    return y * np.minimum(1, t / .002)

def bell(f, sec=2.2, decay=.9):
    """玻璃钟：非整数泛音（金色手写体的听觉对应）"""
    t = T(sec)
    parts = [(1.0, 1.0, 1.0), (2.76, .5, .6), (5.40, .28, .35), (8.93, .14, .2)]
    y = np.zeros_like(t)
    for ratio, amp, dk in parts:
        y += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (decay * dk))
    return y * np.minimum(1, t / .003)

def pluck(f, sec=.4, cut=3200, decay=.12):
    """锯齿拨奏：滤波后过包络，干净短促"""
    y = lp(saw(f, sec) * .6 + sine(f, sec) * .5, cut)
    return y * adsr(len(y), .002, decay, 0, .02)

def pad_voice(f, sec, cut=1100):
    """三重失谐锯齿 + 正弦，慢起慢落"""
    y = sum(saw(f * (1 + d), sec) for d in (-.0045, 0, .0048)) / 3 * .5 + sine(f, sec) * .4
    y = lp(y, cut)
    n = len(y)
    a = min(1.4, sec * .35)
    env = np.minimum(1, np.arange(n) / SR / a) * np.minimum(1, (n - np.arange(n)) / SR / a)
    return y * env

def sub(f, sec, decay=None):
    t = T(sec)
    y = np.sin(2 * np.pi * f * t) + .18 * np.sin(2 * np.pi * f * 2 * t)
    env = adsr(len(t), .006, decay if decay else sec, 0, .03) if decay else np.minimum(1, t / .01) * np.minimum(1, (sec - t) / .03)
    return y * env

def kick(sec=.32, f0=130, f1=42, click=.35):
    t = T(sec)
    ph = 2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t * 32)) / SR
    y = np.sin(ph) * np.exp(-t * 9)
    y += click * bp(noise(sec), 1800, 6000) * np.exp(-t * 90)
    return y

def tick(sec=.05, lo=4200, hi=11000, decay=900):
    """半调点 → 高频短噪点"""
    t = T(sec)
    return bp(noise(sec), lo, hi) * np.exp(-t * decay)

def clap(sec=.22):
    y = np.zeros(int(SR * sec))
    for k, off in enumerate((0, .011, .023)):
        seg = bp(noise(.12), 1400, 5200) * np.exp(-T(.12) * (60 if k < 2 else 26))
        i = int(off * SR)
        y[i:i + len(seg)] += seg[:len(y) - i]
    return y * .8

def blip(f, sec=.07, shape="sine", cut=6000):
    y = sine(f, sec) if shape == "sine" else lp(saw(f, sec), cut) * .6
    return y * adsr(len(y), .001, sec * .38, 0, .01)

def swell(sec, lo=300, hi=7000, rev=False):
    """噪声扫频；rev=True 做成反向（先扫后收）"""
    n = int(SR * sec)
    x = noise(sec)
    out = np.zeros(n)
    steps = 24
    for i in range(steps):
        a, b = i * n // steps, (i + 1) * n // steps
        fc = lo * (hi / lo) ** (i / (steps - 1))
        out[a:b] = bp(x[a:b], fc * .7, fc * 1.4, 1)
    env = (np.arange(n) / n) ** 2.2
    if rev: env = env[::-1]
    return out * env

# ------------------------------------------------------------------ 音效
def fx_click():
    b = silence(.18)
    place(b, blip(1480, .05) * .55, 0)
    place(b, tick(.012, 5000, 12000, 1200) * .6, 0)
    place(b, blip(740, .06) * .35, .0)
    return finalize(reverb(b, .12, sec=.4, decay=9), -9)

def fx_select():
    b = silence(.34)
    place(b, blip(988, .09) * .6, 0, -.15)
    place(b, blip(1480, .12) * .55, .055, .15)
    place(b, mallet(1976, .25, 1.2, .08) * .22, .055, .15)
    return finalize(reverb(b, .22, sec=.8, decay=6), -8)

def fx_pick():
    b = silence(.5)
    place(b, mallet(1318, .3, 1.8, .1) * .6, 0, -.2)
    place(b, mallet(1760, .35, 1.8, .12) * .55, .06, .2)
    place(b, bell(2637, .5, .22) * .22, .06)
    return finalize(reverb(b, .28, sec=1.0, decay=5), -7)

def fx_draw():
    b = silence(.3)
    sw = swell(.17, 1800, 9000) * .5
    place(b, sw, 0, -.3)
    place(b, tick(.02, 6000, 12000, 1000) * .7, .16, .3)
    place(b, blip(2200, .04) * .25, .165, .3)
    return finalize(reverb(b, .1, sec=.4, decay=9), -10)

def fx_play():
    b = silence(.7)
    place(b, kick(.28, 160, 58, .5) * .9, 0)
    place(b, tick(.05, 3000, 9000, 420) * .55, 0)
    place(b, mallet(392, .5, 2.4, .16) * .4, .0)
    place(b, mallet(587, .5, 2.4, .14) * .28, .03, .1)
    return finalize(reverb(b, .22, sec=.9, decay=5), -5, clip=True)

def fx_spell():
    b = silence(1.2)
    place(b, swell(.55, 500, 8000) * .5, 0, -.2)
    for i, m in enumerate((74, 77, 81, 86)):   # D4 F4 A4 D5 上行琶音 = 蓝图扫描线
        place(b, mallet(mtof(m), .6, 2.2, .18) * .38, .22 + i * .075, -.3 + i * .2)
    place(b, bell(mtof(93), 1.0, .5) * .3, .52, .2)
    b = pingpong(b, .18, .32, 3)
    return finalize(reverb(b, .38, sec=1.6, decay=3.4), -6)

def fx_swing():
    b = silence(.34)
    n = int(SR * .22)
    x = noise(.22)
    out = np.zeros(n)
    steps = 16
    for i in range(steps):
        a, e = i * n // steps, (i + 1) * n // steps
        fc = 5200 * (700 / 5200) ** (i / (steps - 1))
        out[a:e] = bp(x[a:e], fc * .65, fc * 1.5, 1)
    env = np.sin(np.pi * np.arange(n) / n) ** 1.3
    place(b, out * env * .9, 0, -.5)
    pan = np.linspace(-.6, .6, n)
    st = np.stack([out * env * (1 - pan) / 2, out * env * (1 + pan) / 2])
    b = silence(.34); place(b, st, 0)
    return finalize(reverb(b, .12, sec=.5, decay=8), -8)

def fx_hit():
    b = silence(.6)
    place(b, kick(.3, 210, 50, .9) * 1.0, 0)
    place(b, bp(noise(.18), 700, 4200) * np.exp(-T(.18) * 28) * .8, 0)
    place(b, crush(sine(180, .12) * np.exp(-T(.12) * 30), 5, 3) * .35, .0)
    return finalize(reverb(b, .16, sec=.7, decay=7), -3, clip=True)

def fx_heal():
    b = silence(1.1)
    for i, m in enumerate((74, 81, 86, 90)):   # D A D F# 上行，亮而轻
        place(b, bell(mtof(m), .9, .35) * .3, i * .09, -.35 + i * .23)
    place(b, lp(swell(.7, 1200, 9000), 7000) * .22, 0)
    b = pingpong(b, .21, .3, 3, 5200)
    return finalize(reverb(b, .42, sec=1.8, decay=3.0), -7)

def fx_die():
    b = silence(1.0)
    t = T(.7)
    ph = 2 * np.pi * np.cumsum(220 * np.exp(-t * 3.2) + 38) / SR
    y = crush(np.sin(ph) * np.exp(-t * 4.2), 6, 2) * .75
    place(b, y, 0)
    place(b, lp(noise(.5), 1800) * np.exp(-T(.5) * 9) * .5, 0)
    place(b, kick(.3, 120, 38, .2) * .7, 0)
    return finalize(reverb(b, .24, sec=1.1, decay=4.2), -4, clip=True)

def fx_turn():
    b = silence(.8)
    place(b, mallet(mtof(74), .6, 1.6, .2) * .55, 0, -.2)
    place(b, mallet(mtof(81), .7, 1.6, .22) * .5, .11, .2)
    place(b, bell(mtof(86), .8, .3) * .2, .11)
    return finalize(reverb(b, .3, sec=1.1, decay=4.6), -7)

def fx_enemy():
    b = silence(.8)
    place(b, mallet(mtof(69), .5, 2.2, .14) * .55, 0, .2)
    place(b, mallet(mtof(65), .6, 2.2, .18) * .55, .12, -.2)     # A → F 下行小二：对手回合的「警示」
    place(b, sub(mtof(38), .5, .25) * .5, .0)
    return finalize(reverb(b, .26, sec=1.0, decay=5), -7)

def fx_coin():
    b = silence(.6)
    place(b, bell(mtof(91), .5, .12) * .45, 0, -.2)
    place(b, bell(mtof(98), .6, .16) * .4, .07, .2)
    place(b, tick(.02, 7000, 13000, 1100) * .4, 0)
    return finalize(reverb(b, .2, sec=.8, decay=6), -8)

def fx_error():
    b = silence(.4)
    place(b, crush(blip(165, .16, "saw", 1400), 5, 2) * .6, 0)
    place(b, crush(blip(155, .16, "saw", 1100), 5, 2) * .5, .11)
    return finalize(reverb(b, .1, sec=.4, decay=9), -9)

def fx_tick():
    b = silence(.1)
    place(b, tick(.03, 5500, 13000, 1300) * .8, 0)
    place(b, blip(2093, .03) * .15, 0)
    return finalize(b, -14)

def fx_core():
    b = silence(2.0)
    place(b, kick(.5, 110, 36, .15) * .8, 0)
    place(b, sub(mtof(26), 1.4, 1.1) * .45, 0)
    for i, m in enumerate((62, 69, 74, 81, 86)):   # D 多利亚堆叠
        place(b, pad_voice(mtof(m), 1.6, 2400) * .16, .02 * i, -.4 + .2 * i)
    place(b, bell(mtof(98), 1.8, .8) * .28, .1)
    place(b, swell(.5, 400, 9000) * .35, 0)
    return finalize(reverb(b, .45, sec=2.4, decay=2.6), -4, clip=True)

def fx_satur():
    b = silence(1.6)
    for k in range(3):
        o = k * .14
        place(b, kick(.4, 150 - k * 14, 42, .6) * (.95 - k * .1), o)
        place(b, bp(noise(.4), 400 + k * 200, 3200) * np.exp(-T(.4) * 8) * .6, o)
    for i, m in enumerate((38, 45, 50, 57)):
        place(b, crush(pluck(mtof(m), .7, 1500, .3), 6, 2) * .45, .42 + i * .07, 0)
    return finalize(reverb(b, .3, sec=1.6, decay=3.4), -3, clip=True)

def fx_win():
    b = silence(2.4)
    seq = [(74, 0), (78, .13), (81, .26), (86, .39), (90, .52), (93, .7)]  # D F# A D F# A 上行大三
    for m, o in seq:
        place(b, mallet(mtof(m), .9, 2.0, .3) * .45, o, np.clip((m - 80) / 25, -.5, .5))
    place(b, bell(mtof(98), 2.0, 1.0) * .35, .7)
    place(b, sub(mtof(38), 1.8, 1.4) * .4, 0)
    for m in (62, 66, 69, 74):
        place(b, pad_voice(mtof(m), 1.8, 2600) * .15, .5)
    b = pingpong(b, .22, .34, 4, 5500)
    return finalize(reverb(b, .42, sec=2.2, decay=2.8), -4)

def fx_lose():
    b = silence(2.4)
    for i, m in enumerate((74, 70, 65, 62)):    # D Bb F D 下行小调
        place(b, mallet(mtof(m), 1.0, 1.2, .38) * .4, i * .24, 0)
    place(b, sub(mtof(31), 2.0, 1.6) * .5, .5)
    for m in (50, 53, 57):
        place(b, pad_voice(mtof(m), 2.0, 900) * .18, .45)
    place(b, lp(swell(1.4, 6000, 300, False), 2500) * .15, .5)
    return finalize(reverb(b, .4, sec=2.2, decay=2.6), -5)

def fx_emote():
    b = silence(.4)
    place(b, blip(1175, .08) * .5, 0, -.3)
    place(b, blip(1568, .1) * .45, .06, .3)
    place(b, blip(2093, .12) * .3, .12, 0)
    return finalize(reverb(b, .22, sec=.7, decay=6), -9)

def fx_match():
    b = silence(1.4)
    for i, m in enumerate((74, 81, 86)):
        place(b, mallet(mtof(m), .8, 2.0, .26) * .45, i * .11, -.25 + .25 * i)
    place(b, bell(mtof(93), 1.2, .6) * .3, .22)
    place(b, kick(.25, 120, 50, .3) * .5, .0)
    b = pingpong(b, .17, .3, 3)
    return finalize(reverb(b, .35, sec=1.6, decay=3.4), -6)

SFX = dict(click=fx_click, select=fx_select, pick=fx_pick, draw=fx_draw, play=fx_play, spell=fx_spell,
           swing=fx_swing, hit=fx_hit, heal=fx_heal, die=fx_die, turn=fx_turn, enemy=fx_enemy, coin=fx_coin,
           error=fx_error, tick=fx_tick, core=fx_core, satur=fx_satur, win=fx_win, lose=fx_lose,
           emote=fx_emote, match=fx_match)

# ------------------------------------------------------------------ BGM
# D 多利亚；每个和弦 = (低音 MIDI, 铺底和弦 MIDI 列表, 琶音候选 MIDI)
CH = {
    "Dm":  (38, [50, 57, 62, 65, 69], [62, 65, 69, 72, 74, 77]),
    "Bb":  (34, [46, 53, 58, 62, 65], [58, 62, 65, 70, 74, 77]),
    "Gm":  (43, [43, 55, 58, 62, 67], [58, 62, 67, 70, 74, 79]),
    "A":   (33, [45, 52, 57, 61, 64], [57, 61, 64, 69, 73, 76]),
    "C":   (36, [48, 55, 60, 64, 67], [60, 64, 67, 72, 76, 79]),
}

def render_menu():
    bpm = 60
    beat = 60 / bpm
    bars = 8
    total = bars * 4 * beat           # 32 s
    prog = ["Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "A", "A"]
    buf = silence(total + 2.5)
    mel = silence(total + 2.5)
    for bi, name in enumerate(prog):
        root, chord, arp = CH[name]
        t0 = bi * 4 * beat
        place(buf, sub(mtof(root), 4 * beat + .15, None) * .34, t0, 0)
        for k, m in enumerate(chord):
            place(buf, pad_voice(mtof(m), 4 * beat + 1.2, 900 + 160 * k) * .10, t0, -.45 + .22 * k)
        # 稀疏马林巴：8 分音符网格，约 45% 命中，顶部「开口」音
        g = np.random.default_rng(100 + bi)
        for s in range(8):
            if g.random() < .5 or s == 0:
                m = int(g.choice(arp)) + (12 if g.random() < .25 else 0)
                vel = .26 + .16 * g.random()
                place(mel, mallet(mtof(m), 1.0, 2.0, .3) * vel, t0 + s * beat / 2, g.uniform(-.55, .55))
        # 每 2 小节一枚「金色」玻璃钟
        if bi % 2 == 0:
            place(buf, bell(mtof(arp[-1] + 12), 3.0, 1.1) * .13, t0 + beat * 2.5, .25)
    # 半调点阵：16 分音符 tick，幅度按固定「点阵图案」起伏
    pat = np.array([1, 0, .35, 0, .6, 0, .3, .2, 1, 0, .35, .15, .6, 0, .3, 0]) * .5
    for i in range(int(total / (beat / 4))):
        a = pat[i % 16]
        if a > .12:
            place(buf, tick(.04, 5000 + 1200 * (i % 3), 12500, 1100) * a * .1, i * beat / 4, np.sin(i * .9) * .5)
    # 软 kick：每小节第 1 拍，轻
    for bi in range(bars):
        place(buf, kick(.4, 90, 40, .05) * .3, bi * 4 * beat)
    # 反向铺底：最后一小节收尾，回到开头（环形无缝）
    place(buf, swell(4 * beat * .9, 500, 7000) * .12, (bars - 1) * 4 * beat)
    mel = pingpong(mel, beat * .75, .42, 6, 3400)
    mix = buf + mel
    mix = reverb_loop_fold(mix, total, wet=.5, sec=2.8, decay=2.2)
    return finalize(mix, -2.0, fade_in=.0, fade_out=.0)

def render_duel():
    bpm = 112
    beat = 60 / bpm
    bars = 16
    total = bars * 4 * beat           # ≈ 34.3 s
    prog = ["Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "A", "A",
            "Dm", "Dm", "Bb", "Bb", "C", "C", "A", "A"]
    buf = silence(total + 2.5)
    mel = silence(total + 2.5)
    s16 = beat / 4
    for bi, name in enumerate(prog):
        root, chord, arp = CH[name]
        t0 = bi * 4 * beat
        # 铺底
        for k, m in enumerate(chord[:4]):
            place(buf, pad_voice(mtof(m), 4 * beat + .6, 1500) * .07, t0, -.4 + .27 * k)
        # sub 脉冲：8 分音符，反拍留白
        for s in range(8):
            if s % 4 != 3:
                place(buf, sub(mtof(root), beat * .46, beat * .22) * (.46 if s % 2 == 0 else .3), t0 + s * beat / 2)
        # kick：1、2.75、3 拍
        for off, v in ((0, 1), (1.75, .55), (2.0, .9), (3.5, .4)):
            place(buf, kick(.34, 135, 42, .35) * .55 * v, t0 + off * beat)
        # clap：2、4 拍
        for off in (1, 3):
            place(buf, clap() * .13, t0 + off * beat, .1)
        # 16 分 hat 点阵：反拍偏亮
        for s in range(16):
            a = [.5, .16, .28, .16, .6, .16, .28, .24, .5, .16, .28, .16, .6, .22, .3, .2][s]
            place(buf, tick(.035, 6000, 13000, 1200) * a * .12, t0 + s * s16, np.sin(s * 1.3) * .4)
        # 琶音拨奏：16 分，按「十字准星」图案取音，每 4 小节换一次力度
        g = np.random.default_rng(300 + bi)
        order = [0, 2, 4, 2, 1, 3, 5, 3, 0, 4, 2, 4, 1, 5, 3, 5] if bi % 2 == 0 else [5, 3, 1, 3, 4, 2, 0, 2, 5, 1, 3, 1, 4, 0, 2, 0]
        lift = .75 if bi < 4 else 1.0
        for s in range(16):
            if s % 4 == 3 and g.random() < .6:
                continue
            m = arp[order[s] % len(arp)]
            vel = (.2 if s % 4 == 0 else .13) * lift
            place(mel, pluck(mtof(m), .3, 2600 + 700 * (s % 4 == 0), .1) * vel, t0 + s * s16, np.sin(s * .8) * .5)
        # 每 4 小节一次金钟 + 反向 riser
        if bi % 4 == 0:
            place(buf, bell(mtof(arp[-1] + 12), 3.0, 1.0) * .12, t0 + beat * 2, .3)
        if bi % 4 == 3:
            place(buf, swell(beat * 3, 600, 9000) * .12, t0 + beat)
    mel = pingpong(mel, beat * .75, .36, 5, 4200)
    mix = buf + mel
    mix = reverb_loop_fold(mix, total, wet=.34, sec=1.8, decay=3.0)
    return finalize(softclip(mix, 1.1), -2.0, fade_in=.0, fade_out=.0)

def reverb_loop_fold(x, total, wet, **kw):
    """对 total+tail 长度的素材做混响，再把超出 total 的部分折回开头，得到可无缝循环的片段。"""
    y = reverb(x, wet, **kw)
    n = int(total * SR)
    out = y[:, :n].copy()
    k = n
    while k < y.shape[1]:
        m = min(n, y.shape[1] - k)
        out[:, :m] += y[:, k:k + m]
        k += n
    # 5 ms 微淡入淡出：环形接缝处的瞬态不会咔哒
    f = int(.005 * SR)
    out[:, :f] *= np.linspace(0, 1, f)
    out[:, -f:] *= np.linspace(1, 0, f)
    return out

# ------------------------------------------------------------------ 入口
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["sfx", "bgm"])
    ap.add_argument("--name")
    a = ap.parse_args()
    if a.only != "bgm":
        for n, fn in SFX.items():
            if a.name and a.name != n: continue
            x = trim(fn())
            sz = write_ogg(os.path.join(OUT_SFX, n + ".ogg"), x)
            print(f"sfx/{n}.ogg  {x.shape[1] / SR:.2f}s  {sz // 1024} KB")
    if a.only != "sfx":
        for n, fn in (("menu", render_menu), ("duel", render_duel)):
            if a.name and a.name != n: continue
            x = fn()
            sz = write_ogg(os.path.join(OUT_BGM, n + ".ogg"), x)
            print(f"bgm/{n}.ogg  {x.shape[1] / SR:.1f}s  {sz // 1024} KB")

if __name__ == "__main__":
    sys.exit(main())
