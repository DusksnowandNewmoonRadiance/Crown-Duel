#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
苏苏 · 战斗曲《赤色铁流》—— 生成器
====================================================================
比 tools/music/make_midi.py 更进一步：这里不依赖 fluidsynth + SoundFont
（这台机器上没有），而是用 numpy 直接合成 + 卷积混响 + ffmpeg 母带，
一条命令出成品 OGG。同一份乐谱同时导出一份 .mid，谁有音源库都可以重渲。

为什么是 D 小调 + 大调副歌：
  苏苏的卡组是「俄布海 → 整编 → 一波推进」——个体很小（i 级的 D 小调），
  但会被整编成一个大东西（关系大调 F 的副歌）。整首曲子就是这个动作的音响版。

三个动机：
  · 铁流动机   D-F-A-D 上行四音（第 7 小节、第 60 小节）＝「整编」：多数合成一个
  · 主题 A     铜管进行曲，八分音符低音 ostinato 顶着走（第 8-23 小节）
  · 赤色黎明   副歌，转关系大调 F，高八度铜管 + 合唱（第 24-31 / 40-55 小节）
  · 冬将军     第 32-39 小节，半速、抽掉鼓、钟琴与弦乐颤音

结构（124 BPM，4/4，64 小节 ≈ 2:04）：
  0-7   前奏  定音鼓 / 弦乐 / 军鼓滚奏 → 铁流动机 → 进鼓
  8-23  A     主题两遍，第二遍加铜管与合唱
  24-31 副歌  赤色黎明
  32-39 间奏  冬将军，第 38 小节起推回去
  40-55 副歌 ×2，后半段加「整编」对位
  56-63 尾奏  回到主题，最后一记铁流动机收束

用法：
  python tools/music/susu_theme.py out/susu_mix.wav      # 出混音
  python tools/music/susu_theme.py --midi out/susu.mid   # 顺带导 MIDI
"""
import sys, os, struct
import numpy as np

SR = 44100
BPM = 124.0
TPB = 480                      # ticks / beat
BAR = TPB * 4
SPB = 60.0 / BPM               # 每拍秒数
BARS = 64

PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
      "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def N(s):
    """'A4' -> 69"""
    cut = 2 if len(s) > 2 and s[1] in "#b" else 1
    return 12 * (int(s[cut:]) + 1) + PC[s[:cut]]


def m2f(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


# ======================================================================
# 1. 乐谱
# ======================================================================
EV = []   # dict(part, midi, tick, dur, vel)


def add(part, midi, bar, beat, beats, vel=80):
    EV.append(dict(part=part, midi=int(midi),
                   tick=int(round(bar * BAR + beat * TPB)),
                   dur=int(round(beats * TPB)), vel=int(vel)))


def ch(part, pitches, bar, beat, beats, vel=80):
    for p in pitches:
        add(part, p, bar, beat, beats, vel)


# ---------------------------------------------------------------- 和声
# A7 里那个 C# 是关键：和声小调的升七级，一响就是「苏式」的味道，
# 西方的史诗配乐基本不这么写（他们更爱自然小调 + 大三级）。
CH = {
    "Dm": [N("D4"), N("F4"), N("A4")],
    "Gm": [N("G4"), N("Bb4"), N("D5")],
    "Bb": [N("Bb3"), N("D4"), N("F4")],
    "F":  [N("F3"), N("A3"), N("C4")],
    "C":  [N("C4"), N("E4"), N("G4")],
    "A7": [N("A3"), N("C#4"), N("E4"), N("G4")],
}
ROOT = {"Dm": N("D2"), "Gm": N("G2"), "Bb": N("Bb1"), "F": N("F2"),
        "C": N("C2"), "A7": N("A2")}

# i–i–iv–V–i–VI–V–i：四小节一句，句尾落属和弦再解决，是苏联进行曲最常走的路
VERSE8 = ["Dm", "Dm", "Gm", "A7", "Dm", "Bb", "A7", "Dm"]
CHOR8 = ["F", "C", "Dm", "Bb", "F", "C", "A7", "Dm"]
BRK8 = ["Gm", "Dm", "Bb", "A7", "Gm", "Dm", "A7", "A7"]


def harmony(b):
    if b < 8:
        return "Dm"
    if b < 24:
        return VERSE8[(b - 8) % 8]
    if b < 32:
        return CHOR8[(b - 24) % 8]
    if b < 40:
        return BRK8[(b - 32) % 8]
    if b < 48:
        return CHOR8[(b - 40) % 8]
    return VERSE8[(b - 48) % 8]


# ---------------------------------------------------------------- 旋律
# 写法：附点起句、级进下行、四小节一落；第二遍「同头变尾」抬高一句。
# 每个元组是 (小节内第几拍, 拍数, 音名)，一小节加起来正好 4 拍。
VERSE_MEL = [
    [(0, 1.5, "A4"), (1.5, 0.5, "A4"), (2, 2, "D5")],
    [(0, 1, "F5"), (1, 1, "E5"), (2, 2, "D5")],
    [(0, 1.5, "G5"), (1.5, 0.5, "F5"), (2, 1, "E5"), (3, 1, "D5")],
    [(0, 2, "E5"), (2, 1, "C#5"), (3, 1, "A4")],
    [(0, 1.5, "F5"), (1.5, 0.5, "E5"), (2, 1, "D5"), (3, 1, "C5")],
    [(0, 1.5, "D5"), (1.5, 0.5, "C5"), (2, 2, "Bb4")],
    [(0, 1, "Bb4"), (1, 1, "A4"), (2, 1, "G4"), (3, 1, "A4")],
    [(0, 3, "D5")],
]
VERSE_MEL2 = [
    [(0, 1.5, "A4"), (1.5, 0.5, "A4"), (2, 2, "D5")],
    [(0, 1, "F5"), (1, 1, "A5"), (2, 2, "G5")],
    [(0, 1.5, "F5"), (1.5, 0.5, "E5"), (2, 1, "D5"), (3, 1, "E5")],
    [(0, 2, "C#5"), (2, 1, "E5"), (3, 1, "G5")],
    [(0, 1, "A5"), (1, 1, "G5"), (2, 1, "F5"), (3, 1, "E5")],
    [(0, 1.5, "D5"), (1.5, 0.5, "E5"), (2, 2, "F5")],
    [(0, 1, "E5"), (1, 1, "D5"), (2, 1, "C#5"), (3, 1, "E5")],
    [(0, 3, "D5")],
]
CHOR_MEL = [
    [(0, 1, "C5"), (1, 1, "F5"), (2, 1.5, "A5"), (3.5, 0.5, "G5")],
    [(0, 1, "G5"), (1, 1, "E5"), (2, 2, "C5")],
    [(0, 1, "D5"), (1, 1, "F5"), (2, 1, "A5"), (3, 1, "G5")],
    [(0, 1.5, "F5"), (1.5, 0.5, "D5"), (2, 2, "Bb4")],
    [(0, 1, "C5"), (1, 1, "F5"), (2, 1, "A5"), (3, 1, "C6")],
    [(0, 1, "Bb5"), (1, 1, "A5"), (2, 1, "G5"), (3, 1, "E5")],
    [(0, 1.5, "E5"), (1.5, 0.5, "D5"), (2, 2, "C#5")],
    [(0, 3, "D5")],
]
BRK_MEL = [
    [(0, 2, "G4"), (2, 2, "Bb4")],
    [(0, 2, "A4"), (2, 2, "F4")],
    [(0, 2, "D5"), (2, 2, "C5")],
    [(0, 1, "C#5"), (1, 1, "E5"), (2, 2, "A4")],
]


def melody(lst, bar0, part, vel, octave=0, dur_scale=0.94, bars=8):
    for i in range(bars):
        for (beat, beats, nm) in lst[i % len(lst)]:
            add(part, N(nm) + 12 * octave, bar0 + i, beat, beats * dur_scale, vel)


def build():
    # ---------------- 前奏 0-7：钢琴独奏 4 小节，再一层层加 ----------------
    for b in range(0, 8):
        h = "Dm"
        if b < 4:
            ch("piano", CH[h], b, 0, 1.9, 52)
            ch("piano", [p + 12 for p in CH[h]], b, 2, 1.9, 44)
            add("piano", ROOT[h], b, 0, 1.9, 40)
        else:
            ch("piano", CH[h], b, 0, 1.9, 58)
            ch("piano", [p + 12 for p in CH[h]], b, 2, 1.9, 50)
            add("piano", ROOT[h], b, 0, 1.9, 46)
            ch("strings", [p + 12 for p in CH[h]], b, 0, 3.8, 40 + (b - 4) * 6)
            add("bass", ROOT[h], b, 0, 3.6, 50)
    add("timp", N("D2"), 0, 0, 1.2, 70)
    for i in range(8):                                  # 第 6-7 小节：军鼓滚奏
        add("snare", 0, 6, i * 0.5, 0.2, 26 + i * 3)
    for i in range(16):
        add("snare", 0, 7, i * 0.25, 0.12, 40 + i * 4)
    for i in range(4):
        add("timp", N("D2"), 7, i * 1.0, 0.7, 50 + i * 10)
    ch("brass", [p + 12 for p in CH["Dm"]], 7, 0, 1.4, 86)
    ch("strings", [p + 12 for p in CH["Dm"]], 7, 0, 1.4, 74)
    add("crash", 0, 7, 0, 1.6, 62)
    add("kick", 0, 7, 0, 0.4, 92)

    # ---------------- 主歌 8-23 ----------------
    for b in range(8, 24):
        h = harmony(b)
        c = CH[h]
        r = ROOT[h]
        loud = b >= 16
        # 钢琴：柱式和弦，第一遍轻，第二遍加厚
        for q in range(4):
            ch("piano", c, b, q, 0.95, (50 if not loud else 58) + (6 if q % 2 == 0 else 0))
        add("piano", r, b, 0, 1.9, 44 if not loud else 50)
        # 弦乐铺底
        ch("strings", [p + 12 for p in c], b, 0, 3.8, (46 if not loud else 58))
        if loud:
            ch("strings", [p + 24 for p in c], b, 0, 3.6, 26)
        # 低音：进行曲式的 1、3 拍
        for beat in (0, 2):
            add("pizz", r, b, beat, 0.9, 88 if loud else 80)
        # 鼓：底鼓 1、3，军鼓 2、4（没有踩镲——军乐队没有那种声音）
        for beat in (0, 2):
            add("kick", 0, b, beat, 0.35, 92 if not loud else 100)
        for beat in (1, 3):
            add("snare", 0, b, beat, 0.3, 62 if not loud else 74)
        if b % 2 == 0:
            add("timp", r, b, 0, 0.8, 74 if loud else 58)
        if b in (8, 16):
            add("crash", 0, b, 0, 2.0, 54)
        if b in (15, 23):                              # 句尾军鼓滚奏
            for i in range(8):
                add("snare", 0, b, 2.0 + i * 0.25, 0.16, 44 + i * 6)

    melody(VERSE_MEL, 8, "horn", 100)
    melody(VERSE_MEL, 8, "reed", 62)
    melody(VERSE_MEL2, 16, "horn", 104)
    melody(VERSE_MEL2, 16, "reed", 66)
    melody(VERSE_MEL2, 16, "strings", 52, octave=1)     # 第二遍加一条弦乐高八度

    # ---------------- 副歌 24-31 ----------------
    for b in range(24, 32):
        h = harmony(b)
        c = CH[h]
        r = ROOT[h]
        for q in range(4):
            ch("piano", c, b, q, 0.95, 62)
        add("piano", r, b, 0, 1.9, 56)
        ch("strings", [p + 12 for p in c], b, 0, 3.8, 70)
        ch("strings", [p + 24 for p in c], b, 0, 3.4, 34)
        for beat in (0, 2):
            add("bass", r, b, beat, 0.95, 84)
        add("bass", r + 12, b, 3, 0.9, 70)
        for beat in (0, 2):
            add("kick", 0, b, beat, 0.35, 104)
        for beat in (1, 3):
            add("snare", 0, b, beat, 0.3, 82)
        add("timp", r, b, 0, 0.9, 88)
        if b % 2 == 1:
            add("timp", r, b, 2, 0.8, 70)
        if b in (24, 28):
            add("crash", 0, b, 0, 2.2, 60)
        if b == 31:
            for i in range(8):
                add("snare", 0, b, 2.0 + i * 0.25, 0.16, 50 + i * 6)
    melody(CHOR_MEL, 24, "lead", 104)
    melody(CHOR_MEL, 24, "reed", 70, octave=-1)         # 手风琴低八度加厚
    melody(CHOR_MEL, 24, "strings", 46, octave=1)

    # ---------------- 间奏 32-39：手风琴独奏 + 推回去 ----------------
    for b in range(32, 40):
        h = harmony(b)
        c = CH[h]
        if b < 38:
            ch("piano", c, b, 0, 1.9, 46)
            ch("strings", [p + 12 for p in c], b, 0, 3.8, 40 if b < 36 else 54)
            add("bass", ROOT[h], b, 0, 3.6, 44)
        else:
            ch("piano", c, b, 0, 1.9, 66)
            ch("strings", [p + 12 for p in c], b, 0, 3.8, 76)
            ch("brass", [p + 12 for p in c], b, 0, 1.8, 70)
            for beat in (0, 2):
                add("kick", 0, b, beat, 0.35, 96)
    melody(BRK_MEL, 32, "reed", 88, bars=4)
    for b in range(32, 38):
        add("timp", ROOT[harmony(b)], b, 0, 0.7, 64)
    for i in range(16):
        add("snare", 0, 38, i * 0.25, 0.12, 40 + i * 4)
    for i in range(32):
        add("snare", 0, 39, i * 0.125, 0.1, 46 + i * 2.5)
    add("riser", 0, 38, 0, 7.5, 70)
    add("crash", 0, 39, 0, 1.8, 70)

    # ---------------- 副歌二 40-47：全体上 ----------------
    for b in range(40, 48):
        h = harmony(b)
        c = CH[h]
        r = ROOT[h]
        for q in range(4):
            ch("piano", c, b, q, 0.95, 74)
            ch("piano", [p + 12 for p in c], b, q, 0.9, 54)
        add("piano", r, b, 0, 1.9, 66)
        ch("strings", [p + 12 for p in c], b, 0, 3.8, 88)
        ch("strings", [p + 24 for p in c], b, 0, 3.4, 52)
        ch("brass", [p + 12 for p in c], b, 0, 1.2, 84)
        ch("brass", [p + 12 for p in c], b, 2.0, 0.9, 88)
        ch("choir", [p + 12 for p in c], b, 0, 3.6, 62)
        for beat in (0, 2):
            add("bass", r, b, beat, 0.95, 96)
        add("bass", r + 12, b, 3, 0.9, 84)
        for beat in (0, 2):
            add("kick", 0, b, beat, 0.35, 112)
        for beat in (1, 3):
            add("snare", 0, b, beat, 0.3, 96)
        add("timp", r, b, 0, 0.9, 104)
        if b % 2 == 1:
            add("timp", r, b, 2, 0.8, 88)
        if b in (40, 44, 46):
            add("crash", 0, b, 0, 2.2, 80)
        if b >= 44:
            # 整段滚奏：这是「高潮」真正被顶起来的地方，光加音量是不够的
            for i in range(32):
                add("timp", r, b, i * 0.125, 0.14, 44 + i * 2)
                add("snare", 0, b, i * 0.125, 0.1, 36 + i * 2.2)
            for q in range(4):
                ch("trem", [p + 12 for p in c], b, q, 0.9, 70)
    melody(CHOR_MEL, 40, "lead", 118)
    melody(CHOR_MEL, 40, "lead2", 96, octave=1)      # 小号高八度：音色亮了，高潮才立得住
    melody(CHOR_MEL, 40, "reed", 78, octave=-1)
    melody(CHOR_MEL, 40, "strings", 60, octave=1)
    # 「整编」四音上移一个五度再打一次
    for i, nm in enumerate(["D5", "F5", "A5", "D6"]):
        add("brass", N(nm), 44, 2.0 + i * 0.25, 0.28, 100)
        add("brass", N(nm) + 7, 46, 2.0 + i * 0.25, 0.28, 104)

    # ---------------- 尾奏 48-55：升全音后的再现 ----------------
    for b in range(48, 54):
        h = harmony(b)
        c = CH[h]
        r = ROOT[h]
        for q in range(4):
            ch("piano", c, b, q, 0.95, 80)
        ch("strings", [p + 12 for p in c], b, 0, 3.8, 90)
        ch("brass", [p + 12 for p in c], b, 0, 1.0, 86)
        for beat in (0, 2):
            add("bass", r, b, beat, 0.95, 90)
        for beat in (0, 2):
            add("kick", 0, b, beat, 0.35, 96)
        for beat in (1, 3):
            add("snare", 0, b, beat, 0.3, 80)
        add("timp", r, b, 0, 0.9, 92)
        if b in (48, 52):
            add("crash", 0, b, 0, 2.2, 74)
    melody(VERSE_MEL, 48, "horn", 108)
    melody(VERSE_MEL, 48, "reed", 70)
    melody(VERSE_MEL, 48, "reed", 82, octave=-1)
    melody(VERSE_MEL, 48, "strings", 54, octave=1)
    # 52-53：滚奏 + 弦乐颤音，把最后的和弦顶上去
    for i in range(16):
        add("snare", 0, 52, i * 0.25, 0.12, 60 + i * 3)
        add("timp", ROOT[harmony(52)], 52, i * 0.25, 0.15, 60 + i * 3)
    for q in range(4):
        ch("trem", [p + 12 for p in CH[harmony(53)]], 53, q, 0.9, 82)
    ch("brass", [p + 12 for p in CH[harmony(53)]], 53, 0, 1.9, 92)
    for i in range(16):
        add("snare", 0, 53, i * 0.25, 0.12, 72 + i * 3.5)
    add("timp", ROOT[harmony(53)], 53, 0, 1.9, 102)
    add("crash", 0, 53, 0, 2.0, 72)
    # 54：收束（最后一记）
    for i, nm in enumerate(["D4", "F4", "A4", "D5"]):
        add("brass", N(nm), 54, i * 0.4, 0.35, 108)
        add("reed", N(nm), 54, i * 0.4, 0.35, 80)
    ch("brass", [p + 12 for p in CH["Dm"]], 54, 1.8, 2.1, 112)
    ch("strings", [p + 12 for p in CH["Dm"]], 54, 1.8, 2.1, 96)
    ch("choir", [p + 12 for p in CH["Dm"]], 54, 1.8, 2.1, 80)
    ch("piano", CH["Dm"], 54, 1.8, 2.1, 84)
    add("timp", N("D2"), 54, 0, 2.2, 114)
    add("timp", N("D2"), 54, 1.8, 2.2, 100)
    add("crash", 0, 54, 0, 3.0, 92)
    add("kick", 0, 54, 1.8, 0.6, 106)

    # 最后一段整体升全音：D 小调 → E 小调。这是「高潮」最便宜也最有效的做法：
    # 同样的旋律、同样的配器，只因为高了两个半音，听众就知道「到顶了」。
    for e in EV:
        if e["tick"] >= 40 * BAR:
            e["midi"] += 2


# ======================================================================
# 2. 合成器
# ======================================================================
TBL_N = 4096
_IDX = np.arange(TBL_N + 1, dtype=np.float64)
_TBL = {}


def _profile(kind, k):
    if kind == "dark":
        return 1.0 / k ** 1.55
    if kind == "warm":
        return 1.0 / k ** 1.25
    if kind == "bright":
        return 1.0 / k ** 0.8
    if kind == "brass":
        return (1.0 / k ** 0.85) * (1.0 + 0.55 * np.exp(-((k - 7.0) / 4.0) ** 2))
    if kind == "horn":
        return 1.0 / k ** 1.35
    if kind == "bow":                      # 弦乐：去掉多余的亮，慢起音才像琴弓
        return 1.0 / k ** 1.45
    if kind == "reed":                     # 手风琴/簧片：奇次为主 + 一点簧片共鸣
        a = (1.0 / k ** 1.1) * np.where(k % 2 == 1, 1.0, 0.42)
        return a * (1.0 + 0.35 * np.exp(-((k - 4.0) / 2.6) ** 2))
    if kind == "trump":                    # 小号：亮但不刺，谐波到 8 为止收住
        return (1.0 / k ** 0.95) * (1.0 + 0.5 * np.exp(-((k - 5.0) / 3.0) ** 2))
    if kind == "choir":
        a = 1.0 / k ** 1.25
        for c in (3.0, 5.0, 8.0):
            a = a * (1.0 + 0.85 * np.exp(-((k - c) / 1.15) ** 2))
        return a
    raise KeyError(kind)


def table(kind, cap):
    key = (kind, cap)
    t = _TBL.get(key)
    if t is not None:
        return t
    ph = np.linspace(0.0, 2.0 * np.pi, TBL_N, endpoint=False)
    k = np.arange(1, cap + 1)
    a = _profile(kind, k)
    w = (a[:, None] * np.sin(k[:, None] * ph[None, :])).sum(0)
    w /= (np.max(np.abs(w)) + 1e-9)
    ext = np.concatenate([w, w[:1]])
    _TBL[key] = ext
    return ext


CAPS = [4, 6, 9, 13, 19, 27, 38]


def pick_cap(f):
    top = max(1, int(0.45 * SR / max(20.0, f)))
    best = CAPS[0]
    for c in CAPS:
        if c <= top:
            best = c
    return best


def lookup(kind, cap, phase):
    t = table(kind, cap)
    x = (phase % 1.0) * TBL_N
    return np.interp(x, _IDX, t)


def adsr(n, a, d, s, r):
    """采样数包络：起音 / 衰减到 s / 保持 / 释放"""
    e = np.ones(n)
    na = max(1, int(a * SR))
    if na < n:
        e[:na] = np.linspace(0.0, 1.0, na) ** 0.55
    nd = max(1, int(d * SR))
    if d > 0 and na + nd < n:
        e[na:na + nd] = np.linspace(1.0, s, nd)
        e[na + nd:] = s
    nr = max(1, int(r * SR))
    if nr < n:
        e[-nr:] *= np.linspace(1.0, 0.0, nr) ** 1.6
    return e


def synth_note(spec, f, dur, vel):
    """spec: dict(kind, cap, a, d, s, r, voices, det, vib, vibd, bright, bloom, spread)

    spread = 合奏错位（秒）。真实的弦乐组/合唱不会所有人在同一毫秒起音，
    几毫秒到几十毫秒的错位是「像乐手」和「像合成器」的分界线。
    """
    voices = spec.get("voices", 1)
    spread = spec.get("spread", 0.0)
    n_dur = max(64, int(dur * SR))
    ntot = n_dur + int(spread * SR)
    out = np.zeros(ntot)
    cap = min(pick_cap(f), spec.get("cap", 38))
    kind = spec["kind"]
    det = spec.get("det", 0.0)
    vibd = spec.get("vibd", 0.0)
    for v in range(voices):
        dv = 0.0 if voices == 1 else det * (2.0 * v / (voices - 1) - 1.0)
        rng = np.random.default_rng(hash((round(f, 2), v, spec.get("seed", 0))) & 0xFFFF)
        off = int(spread * SR * (0.35 + 0.65 * rng.random())) if spread else 0
        off = min(off, ntot - 64)
        n = min(n_dur, ntot - off)
        t = np.arange(n) / SR
        ph0 = rng.random()
        freq = f * (1.0 + dv / 1200.0)
        if vibd:
            depth = vibd * np.clip((t - 0.18) / 0.4, 0.0, 1.0)
            freq = freq * (1.0 + depth * np.sin(2 * np.pi * spec.get("vibr", 5.2) * t + ph0 * 6.28))
        phase = ph0 + np.cumsum(freq) / SR
        w = lookup(kind, cap, phase)
        if spec.get("bright") and spec.get("bloom"):
            b = np.clip(t / spec["bloom"], 0.0, 1.0)
            w2 = lookup(kind + "2", cap, phase)
            w = w * (1.0 - b) + w2 * b
        out[off:off + n] += w
    out /= voices
    e = adsr(ntot, spec.get("a", 0.02), spec.get("d", 0.15), spec.get("s", 0.75),
             min(spec.get("r", 0.15), dur * 0.45))
    amp = (vel / 127.0) ** 1.5
    return out * e * amp


# 音色库
SPEC = {
    "bass": dict(kind="warm", a=0.008, d=0.08, s=0.62, r=0.07, voices=2, det=5, gain=0.95),
    "sub": dict(kind="dark", a=0.012, d=0.2, s=0.85, r=0.12, voices=1, cap=4, gain=0.5),
    "celli": dict(kind="warm", a=0.05, d=0.2, s=0.7, r=0.18, voices=3, det=7, vibd=0.004, spread=0.014, gain=0.62),
    "strings": dict(kind="bow", a=0.14, d=0.3, s=0.8, r=0.34, voices=4, det=8, vibd=0.003, spread=0.024, gain=0.62),
    "reed": dict(kind="reed", a=0.022, d=0.12, s=0.86, r=0.1, voices=3, det=11, vibd=0.004, spread=0.006, gain=0.62),
    "pizz": dict(kind="bow", a=0.004, d=0.16, s=0.0, r=0.06, voices=1, cap=16, gain=0.7),
    "choir": dict(kind="choir", a=0.22, d=0.4, s=0.8, r=0.4, voices=3, det=8, vibd=0.006, spread=0.026, gain=0.5),
    "brass": dict(kind="brass", a=0.03, d=0.18, s=0.72, r=0.14, voices=3, det=6, spread=0.012,
                  bright=1, bloom=0.16, gain=0.72),
    "horn": dict(kind="horn", a=0.06, d=0.2, s=0.74, r=0.16, voices=2, det=4, vibd=0.0035, spread=0.01, gain=0.66),
    "lead2": dict(kind="trump", a=0.024, d=0.12, s=0.86, r=0.1, voices=2, det=4, vibd=0.004,
                  spread=0.005, gain=0.66),
    "trem": dict(kind="bow", a=0.06, d=0.2, s=0.8, r=0.2, voices=4, det=10, vibd=0.006, spread=0.02, gain=0.6),
    "lead": dict(kind="trump", a=0.028, d=0.14, s=0.84, r=0.12, voices=2, det=5, vibd=0.004,
                 spread=0.006, gain=0.78),
}
# 铜管的「亮」表：同一谐波数，但斜率更浅
_orig_profile = _profile


def _profile2(kind, k):
    if kind == "brass2":
        return (1.0 / k ** 0.62) * (1.0 + 0.6 * np.exp(-((k - 9.0) / 5.0) ** 2))
    return _profile(kind, k)


def _table2(kind, cap):
    key = (kind, cap)
    t = _TBL.get(key)
    if t is not None:
        return t
    ph = np.linspace(0.0, 2.0 * np.pi, TBL_N, endpoint=False)
    k = np.arange(1, cap + 1)
    a = _profile2(kind, k)
    w = (a[:, None] * np.sin(k[:, None] * ph[None, :])).sum(0)
    w /= (np.max(np.abs(w)) + 1e-9)
    ext = np.concatenate([w, w[:1]])
    _TBL[key] = ext
    return ext


table = _table2   # 统一入口（brass2 走这里）


# ---------------- 打击乐 ----------------
def fir(x, taps):
    return np.convolve(x, taps, mode="same")


def lp_taps(fc, taps=129):
    n = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * fc / SR * n) * np.hamming(taps)
    return h / np.sum(h)


def hp_taps(fc, taps=129):
    h = lp_taps(fc, taps)
    g = -h.copy()
    g[(taps - 1) // 2] += 1.0
    return g


def bp_taps(lo, hi, taps=257):
    h = np.convolve(lp_taps(hi, taps), hp_taps(lo, taps))
    c = len(h) // 2
    return h[c - taps // 2: c + taps // 2 + 1]


def piano_note(f, dur, vel):
    """钢琴：分音越多衰减越快、微微失谐，起音带一点击弦噪声——不靠滤波也像琴。"""
    n = int(min(3.4, dur + 1.1) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 14):
        fk = f * k * (1.0 + 0.00035 * k * k)
        if fk > 0.45 * SR:
            break
        amp = 1.0 / k ** 1.2
        tau = (1.5 / (1.0 + 0.55 * k)) * (200.0 / max(f, 90.0)) ** 0.3
        out += amp * np.sin(2 * np.pi * fk * t + 0.5 * k) * np.exp(-t / max(tau, 0.06))
    rng = np.random.default_rng(int(f) % 89 + 7)
    nh = min(n, int(0.09 * SR))
    th = np.arange(nh) / SR
    ham = np.zeros(n)
    ham[:nh] = fir(rng.standard_normal(nh), bp_taps(800, 3200)) * np.exp(-th * 140)
    out *= np.clip(t / 0.004, 0, 1)
    e = np.ones(n)
    nr = min(n, int(0.15 * SR))
    e[-nr:] = np.linspace(1.0, 0.0, nr)
    return (out * 0.26 + ham * 0.05) * (vel / 127.0) ** 1.5 * e


def drum_kick(vel):
    """心口的「咚」而不是电子鼓的「砰」：起音软一点、低频不往 40 Hz 以下钻。"""
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 56 + 62 * np.exp(-t * 24)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = fir(np.random.default_rng(1).standard_normal(n) * np.exp(-t * 220), bp_taps(900, 3200))
    return np.tanh(1.3 * body) * 0.85 + click * 0.18 * (vel / 127.0)


def drum_snare(vel):
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(2)
    noise = fir(rng.standard_normal(n), bp_taps(900, 3600, 255)) * np.exp(-t * 22)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.6
    return (noise * 0.7 + body) * (vel / 127.0) ** 1.2


def drum_hat(vel):
    """金属化的沙锤，不是白噪声「嘶」——高频噪声是「合成器味」的最大来源。"""
    n = int(0.1 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(3)
    x = fir(rng.standard_normal(n), bp_taps(3000, 8000, 255)) * np.exp(-t * 60)
    ring = np.zeros(n)
    for f0, a in ((6240, .30), (8930, .22), (11200, .12)):
        ring += a * np.sin(2 * np.pi * f0 * t + a * 5)
    y = x * 0.5 + ring * np.exp(-t * 48) * 0.45
    return fir(y, lp_taps(10500, 127)) * (vel / 127.0) ** 1.3


def drum_crash(vel):
    """镲片用「不成谐波比」的分音堆出来，再过 9 kHz 低通——不刺耳。"""
    n = int(2.4 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(4)
    air = fir(rng.standard_normal(n), bp_taps(2200, 9000, 255)) * np.exp(-t * 2.0)
    met = np.zeros(n)
    for f0, a, ph in ((2870, .40, 0.3), (3410, .32, 1.1), (4520, .26, 2.4),
                      (5380, .20, 0.7), (6890, .14, 3.2), (8140, .10, 1.7)):
        met += a * np.sin(2 * np.pi * f0 * t + ph)
    y = air * 0.42 + met * np.exp(-t * 1.7) * 0.55
    return fir(y, lp_taps(8800, 127)) * (vel / 127.0) ** 1.2


def drum_taiko(vel):
    n = int(0.8 * SR)
    t = np.arange(n) / SR
    f = 54 + 70 * np.exp(-t * 12)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    rng = np.random.default_rng(5)
    thud = fir(rng.standard_normal(n), lp_taps(300, 127)) * np.exp(-t * 30)
    return np.tanh(1.5 * body) * 0.85 + thud * 0.5 * (vel / 127.0)


def drum_timp(f, vel):
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    gl = 1.0 + 0.05 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f * gl) / SR) * np.exp(-t * 2.4)
    body += 0.4 * np.sin(2 * np.pi * np.cumsum(f * 1.5 * gl) / SR) * np.exp(-t * 4.0)
    rng = np.random.default_rng(6)
    hit = fir(rng.standard_normal(n), lp_taps(700, 127)) * np.exp(-t * 26)
    return (body * 0.9 + hit * 0.55) * (vel / 127.0) ** 1.25


def bell(f, vel):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.42 * np.sin(2 * np.pi * f * 2.76 * t) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t)
    return x * np.exp(-t * 1.9) * (vel / 127.0) ** 1.2 * 0.5


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    blk = int(0.03 * SR)
    tail = 400
    for s in range(0, n, blk):
        e = min(n, s + blk)
        fc = 320.0 * (7600.0 / 320.0) ** (s / n)
        seg = x[max(0, s - tail):e]
        y = fir(seg, bp_taps(fc * 0.6, fc * 1.8, 257))
        out[s:e] = y[-(e - s):]
    out *= (t / max(t[-1], 1e-9)) ** 2.2
    sw = np.sin(2 * np.pi * np.cumsum(120 * (14 ** (t / max(t[-1], 1e-9)))) / SR) * 0.12 * (t / t[-1]) ** 2
    return out * 0.5 + sw


# ======================================================================
# 3. 混音
# ======================================================================
TOTAL = int(BARS * BAR / TPB * SPB * SR) + int(4.5 * SR)
DRY_L = np.zeros(TOTAL)
DRY_R = np.zeros(TOTAL)
SND_L = np.zeros(TOTAL)
SND_R = np.zeros(TOTAL)

PAN = {"bass": 0.0, "sub": 0.0, "celli": -0.22, "strings": 0.16, "choir": -0.12,
       "brass": 0.12, "horn": -0.18, "lead": 0.0, "lead2": -0.05, "trem": 0.2, "reed": -0.08, "piano": 0.04,
       "pizz": 0.0, "timp": -0.1, "bell": 0.3,
       "kick": 0.0, "snare": 0.02, "hat": 0.24, "crash": -0.2, "taiko": -0.05, "riser": 0.0}
VERB = {"bass": 0.03, "sub": 0.0, "celli": 0.16, "strings": 0.34, "choir": 0.42,
        "brass": 0.24, "horn": 0.3, "lead": 0.26, "lead2": 0.3, "trem": 0.36, "reed": 0.3, "piano": 0.34,
        "pizz": 0.1, "timp": 0.3, "bell": 0.55,
        "kick": 0.02, "snare": 0.22, "hat": 0.06, "crash": 0.4, "taiko": 0.28, "riser": 0.35}
GAIN = {"bass": 0.42, "sub": 0.05, "celli": 0.6, "strings": 0.62, "choir": 0.5,
        "brass": 0.62, "horn": 0.5, "lead": 0.72, "lead2": 0.5, "trem": 0.55, "reed": 0.78, "piano": 0.82,
        "pizz": 0.7, "timp": 0.26, "bell": 0.34,
        "kick": 0.18, "snare": 0.34, "hat": 0.2, "crash": 0.18, "taiko": 0.24, "riser": 0.2}


def pan_gains(p):
    a = (p + 1.0) * np.pi / 4.0
    return np.cos(a), np.sin(a)


DBG_PART = None
DBG = {}


def place(sig, tick, pan_v, verb, gain):
    s0 = max(0, int(tick / TPB * SPB * SR))
    if DBG_PART is not None:
        DBG[DBG_PART] = DBG.get(DBG_PART, 0.0) + float(np.sum((sig * gain) ** 2))
    if s0 >= TOTAL:
        return
    n = min(len(sig), TOTAL - s0)
    if n <= 0:
        return
    gl, gr = pan_gains(pan_v)
    seg = sig[:n] * gain
    DRY_L[s0:s0 + n] += seg * gl
    DRY_R[s0:s0 + n] += seg * gr
    SND_L[s0:s0 + n] += seg * gl * verb
    SND_R[s0:s0 + n] += seg * gr * verb


def section_level(bar):
    """整首的起伏：前奏要真的轻，副歌要真的重。编排写得再对，
    如果每段的力度都一样，听感就是「一条直线」——这是「不好听」最常见的原因。"""
    if bar < 4:
        return 0.52
    if bar < 8:
        return 0.66
    if bar < 16:
        return 0.82
    if bar < 24:
        return 0.98
    if bar < 32:
        return 1.12
    if bar < 40:
        return 0.74
    if bar < 48:
        return 1.18
    if bar < 52:
        return 1.16
    if bar < 54:
        return 1.26
    return 1.22


def render():
    global DBG_PART
    build()
    print(f"  乐谱事件 {len(EV)}")
    rng = np.random.default_rng(11)
    for e in EV:
        p, m, tick, dur, vel = e["part"], e["midi"], e["tick"], e["dur"], e["vel"]
        secs = dur / TPB * SPB
        vel = int(min(127, max(4, vel * section_level(tick // BAR))))
        DBG_PART = p
        if p == "piano":
            place(piano_note(m2f(m), secs, vel), tick + int(rng.integers(-4, 5)),
                  PAN[p], VERB[p], GAIN[p])
        elif p in SPEC:
            spec = SPEC[p]
            sig = synth_note(spec, m2f(m), secs, vel) * SPEC[p]["gain"]
            # 微量人性化：每条音几毫秒的推拉
            jitter = int(rng.integers(-4, 5))
            place(sig, tick + jitter, PAN[p], VERB[p], GAIN[p])
        elif p == "kick":
            place(drum_kick(vel), tick, PAN[p], VERB[p], GAIN[p])
        elif p == "snare":
            place(drum_snare(vel), tick + int(rng.integers(-3, 4)), PAN[p], VERB[p], GAIN[p])
        elif p == "hat":
            place(drum_hat(vel), tick, PAN[p], VERB[p], GAIN[p])
        elif p == "crash":
            place(drum_crash(vel), tick, PAN[p], VERB[p], GAIN[p])
        elif p == "taiko":
            place(drum_taiko(vel), tick, PAN[p], VERB[p], GAIN[p])
        elif p == "timp":
            place(drum_timp(m2f(m), vel), tick, PAN[p], VERB[p], GAIN[p])
        elif p == "bell":
            place(bell(m2f(m), vel), tick, PAN[p], VERB[p], GAIN[p])
        elif p == "riser":
            place(riser(secs), tick, PAN[p], VERB[p], GAIN[p])
    tot = sum(DBG.values()) or 1.0
    print("  声部能量：" + "  ".join(f"{k} {100 * v / tot:.1f}%"
                                     for k, v in sorted(DBG.items(), key=lambda kv: -kv[1])))


def fftconv(x, ir):
    n = len(x) + len(ir) - 1
    nfft = 1 << int(np.ceil(np.log2(n)))
    X = np.fft.rfft(x, nfft)
    Y = np.fft.rfft(ir, nfft)
    return np.fft.irfft(X * Y, nfft)[:len(x)]


def make_ir(dur=2.9, decay=6.9, seed=3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    out = []
    for ch in range(2):
        x = rng.standard_normal(n) * np.exp(-decay * t / dur)
        x = fir(x, lp_taps(6200, 255))
        x[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        x /= np.sqrt(np.sum(x ** 2)) + 1e-9
        out.append(x)
    return out


def master(path):
    print("  混响…")
    irL, irR = make_ir()
    wetL = fftconv(SND_L, irL)[:TOTAL]
    wetR = fftconv(SND_R, irR)[:TOTAL]
    L = DRY_L + wetL * 0.55
    R = DRY_R + wetR * 0.55
    peak = max(np.max(np.abs(L)), np.max(np.abs(R))) + 1e-9
    print(f"  混音峰值 {peak:.3f}")
    L = L / peak * 0.92
    R = R / peak * 0.92
    # 4 点抖动 → 16bit
    dither = (np.random.default_rng(9).random(len(L)) - 0.5) / 32768.0
    data = np.stack([L + dither, R + dither], axis=1)
    pcm = np.clip(data * 32767.0, -32768, 32767).astype("<i2")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + pcm.nbytes))
        f.write(b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 2, SR, SR * 4, 4, 16))
        f.write(b"data")
        f.write(struct.pack("<I", pcm.nbytes))
        f.write(pcm.tobytes())
    print(f"  WAV -> {path}  ({TOTAL / SR:.1f}s)")


# ======================================================================
# 4. MIDI 导出（给有 SoundFont 的人用同一份谱子重渲）
# ======================================================================
GM = {"bass": 43, "sub": 43, "celli": 42, "strings": 48, "choir": 52,
      "brass": 61, "horn": 60, "lead": 56, "lead2": 56, "trem": 44,
      "reed": 21, "piano": 0, "pizz": 45, "timp": 47}
CHAN = {"bass": 0, "sub": 0, "celli": 1, "strings": 2, "choir": 3,
        "brass": 4, "horn": 5, "lead": 6, "lead2": 12, "trem": 13,
        "reed": 8, "piano": 10, "pizz": 11, "timp": 7}
MIX = {  # volume, pan, reverb
    "piano": (104, 60, 58), "reed": (98, 52, 54), "strings": (92, 66, 78),
    "trem": (84, 70, 80), "brass": (92, 58, 62), "horn": (88, 44, 66),
    "lead": (104, 64, 60), "lead2": (86, 60, 64), "choir": (86, 58, 88),
    "pizz": (84, 64, 52), "bass": (84, 64, 40), "timp": (88, 58, 68),
}
DRUM = {"kick": 35, "snare": 38, "hat": 42, "crash": 49, "taiko": 41}


def vlq(n):
    out = bytearray([n & 0x7F])
    n >>= 7
    while n:
        out.insert(0, 0x80 | (n & 0x7F))
        n >>= 7
    return bytes(out)


def write_midi(path, events):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tempo = int(60_000_000 / BPM)
    tracks = []
    # 分轨：每个 part 一条
    parts = {}
    for e in events:
        parts.setdefault(e["part"], []).append(e)
    for part, evs in parts.items():
        ch = 9 if part in DRUM else CHAN.get(part, 8)
        msgs = []
        if part in GM:
            vol, pan, rev = MIX.get(part, (100, 64, 60))
            msgs.append((0, bytes([0xC0 | ch, GM[part]])))
            msgs.append((0, bytes([0xB0 | ch, 7, vol])))
            msgs.append((0, bytes([0xB0 | ch, 10, pan])))
            msgs.append((0, bytes([0xB0 | ch, 91, rev])))
        for e in evs:
            pitch = DRUM[part] if part in DRUM else e["midi"]
            vel = max(1, min(127, e["vel"]))
            msgs.append((e["tick"], bytes([0x90 | ch, pitch & 0x7F, vel])))
            msgs.append((e["tick"] + e["dur"], bytes([0x80 | ch, pitch & 0x7F, 0])))
        msgs.sort(key=lambda x: x[0])
        body = bytearray()
        last = 0
        for tk, m in msgs:
            body += vlq(max(0, tk - last)) + m
            last = tk
        body += vlq(0) + b"\xff\x2f\x00"
        tracks.append(bytes([0x4d, 0x54, 0x72, 0x6b]) + struct.pack(">I", len(body)) + bytes(body))
    head = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks) + 1, TPB)
    t0 = bytearray()
    t0 += vlq(0) + b"\xff\x51\x03" + struct.pack(">I", tempo)[1:]
    t0 += vlq(0) + b"\xff\x58\x04" + bytes([4, 2, 24, 8])
    t0 += vlq(0) + b"\xff\x2f\x00"
    track0 = bytes([0x4d, 0x54, 0x72, 0x6b]) + struct.pack(">I", len(t0)) + bytes(t0)
    with open(path, "wb") as f:
        f.write(head + track0 + b"".join(tracks))
    print(f"  MIDI -> {path}")


if __name__ == "__main__":
    args = sys.argv[1:]
    out = "susu_mix.wav"
    midi = None
    if "--midi" in args:
        i = args.index("--midi")
        midi = args[i + 1]
        del args[i:i + 2]
    if args:
        out = args[0]
    print("《赤色铁流》 · 苏苏战斗曲")
    render()
    if midi:
        write_midi(midi, EV)
    master(out)
