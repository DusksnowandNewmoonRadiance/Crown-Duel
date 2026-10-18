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


DM = [N("D3"), N("F3"), N("A3")]
Bb = [N("Bb2"), N("D3"), N("F3")]
FM = [N("F3"), N("A3"), N("C4")]
CM = [N("C3"), N("E3"), N("G3")]
CHORD = {"Dm": DM, "Bb": Bb, "F": FM, "C": CM}
ROOT = {"Dm": N("D2"), "Bb": N("Bb1"), "F": N("F2"), "C": N("C2")}


def harmony(b):
    if b < 8:
        return "Dm"
    if b < 24:
        return ["Dm", "Bb", "F", "C"][b % 4]
    if b < 32:
        return ["F", "C", "Dm", "Bb"][b % 4]
    if b < 40:
        return ["Dm", "Dm", "Bb", "Bb", "F", "F", "C", "C"][b - 32]
    if b < 56:
        return ["F", "C", "Dm", "Bb"][b % 4]
    return ["Dm", "Bb", "F", "C", "Dm", "Dm", "Dm", "Dm"][b - 56]


# ---- 主题 A（圆号，第 8-15 / 16-23 小节；尾奏 56-63 再用一次）
A_MEL = [
    # (bar, beat, beats, note)
    (0, 0.0, 1.0, "A4"), (0, 1.0, 0.5, "A4"), (0, 1.5, 0.5, "D5"), (0, 2.0, 2.0, "F5"),
    (1, 0.0, 1.0, "F5"), (1, 1.0, 0.5, "E5"), (1, 1.5, 0.5, "D5"), (1, 2.0, 2.0, "D5"),
    (2, 0.0, 1.0, "C5"), (2, 1.0, 0.5, "D5"), (2, 1.5, 0.5, "E5"), (2, 2.0, 2.0, "F5"),
    (3, 0.0, 2.0, "E5"), (3, 2.0, 1.0, "D5"), (3, 3.0, 1.0, "A4"),
]
A_MEL2 = [
    (0, 0.0, 1.0, "A4"), (0, 1.0, 0.5, "A4"), (0, 1.5, 0.5, "D5"), (0, 2.0, 1.0, "F5"), (0, 3.0, 1.0, "A5"),
    (1, 0.0, 1.0, "G5"), (1, 1.0, 0.5, "F5"), (1, 1.5, 0.5, "E5"), (1, 2.0, 2.0, "D5"),
    (2, 0.0, 1.0, "C5"), (2, 1.0, 0.5, "D5"), (2, 1.5, 0.5, "E5"), (2, 2.0, 2.0, "G5"),
    (3, 0.0, 1.0, "F5"), (3, 1.0, 1.0, "E5"), (3, 2.0, 0.5, "D5"), (3, 2.5, 1.5, "C5"),
]

# ---- 副歌（赤色黎明），第 24-31 小节，关系大调 F
B_MEL = [
    (0, 0.0, 0.5, "A5"), (0, 0.5, 0.5, "A5"), (0, 1.0, 1.0, "G5"), (0, 2.0, 1.0, "F5"), (0, 3.0, 1.0, "C5"),
    (1, 0.0, 0.5, "E5"), (1, 0.5, 0.5, "E5"), (1, 1.0, 1.0, "D5"), (1, 2.0, 1.0, "C5"), (1, 3.0, 1.0, "G4"),
    (2, 0.0, 0.5, "A4"), (2, 0.5, 0.5, "D5"), (2, 1.0, 2.0, "F5"), (2, 3.0, 1.0, "E5"),
    (3, 0.0, 2.0, "D5"), (3, 2.0, 1.0, "C5"), (3, 3.0, 1.0, "Bb4"),
    (4, 0.0, 0.5, "A5"), (4, 0.5, 0.5, "A5"), (4, 1.0, 1.0, "G5"), (4, 2.0, 1.0, "F5"), (4, 3.0, 1.0, "C5"),
    (5, 0.0, 1.0, "G5"), (5, 1.0, 1.0, "E5"), (5, 2.0, 2.0, "C5"),
    (6, 0.0, 1.0, "D5"), (6, 1.0, 1.0, "F5"), (6, 2.0, 1.5, "A5"), (6, 3.5, 0.5, "G5"),
    (7, 0.0, 1.0, "F5"), (7, 1.0, 1.0, "E5"), (7, 2.0, 1.0, "D5"), (7, 3.0, 1.0, "C5"),
]


def melody(lst, bar0, part, vel, octave=0, dur_scale=0.92):
    for (b, beat, beats, nm) in lst:
        add(part, N(nm) + 12 * octave, bar0 + b, beat, beats * dur_scale, vel)


def build():
    ev_before = len(EV)

    # ---------------- 前奏 0-7 ----------------
    for b in range(0, 8):
        c = CHORD["Dm"]
        if b < 6:
            ch("strings", c, b, 0, 3.9, 34 + b * 5)
        if 2 <= b < 6:
            ch("choir", [p + 12 for p in c], b, 0, 3.8, 22 + (b - 2) * 6)
        if b < 6:
            add("bass", ROOT["Dm"], b, 0, 3.8, 52 if b < 2 else 62)
            add("sub", ROOT["Dm"] - 12, b, 0, 3.8, 40)
    # 定音鼓
    add("timp", ROOT["Dm"], 0, 0, 1.2, 88)
    for beat in (0, 2):
        add("timp", ROOT["Dm"], 4, beat, 1.0, 92)
    for i in range(16):                       # 第 6 小节滚奏
        add("timp", ROOT["Dm"], 6, i * 0.25, 0.5, 30 + i * 4)
    # 太鼓 / 军鼓
    add("taiko", 0, 1, 0, 0.6, 72)
    add("taiko", 0, 3, 2, 0.6, 78)
    for i in range(8):
        add("snare", 0, 2, i * 0.5, 0.3, 18 + i * 3)
    for i in range(16):
        add("snare", 0, 5, i * 0.25, 0.2, 24 + i * 4)
    # 低音铜管：第 4-5 小节八分推进
    for b in (4, 5):
        for e in range(8):
            add("brass", N("D3"), b, e * 0.5, 0.42, 58 + (e % 2) * 8)
    # 第 7 小节：铁流动机 + 全体落地
    ch("brass", [p + 12 for p in CHORD["Dm"]], 7, 0, 2.0, 104)
    ch("strings", [p + 12 for p in CHORD["Dm"]], 7, 0, 2.0, 96)
    ch("choir", [p + 12 for p in CHORD["Dm"]], 7, 0, 2.0, 80)
    for i, nm in enumerate(["D4", "F4", "A4", "D5"]):
        add("horn", N(nm), 7, 2.0 + i * 0.25, 0.28, 92)
        add("brass", N(nm) - 12, 7, 2.0 + i * 0.25, 0.28, 74)
    add("crash", 0, 7, 0, 2.0, 96)
    add("timp", ROOT["Dm"], 7, 0, 1.4, 104)
    for i in range(16):                       # 进的过门
        add("snare", 0, 7, 2.0 + i * 0.125, 0.12, 40 + i * 5)
    add("kick", 0, 7, 0, 0.4, 108)
    add("riser", 0, 6, 0, 8.0, 80)

    # ---------------- A 0-23（主题两遍） ----------------
    for b in range(8, 24):
        c, r = CHORD[harmony(b)], ROOT[harmony(b)]
        loud = b >= 16
        # 低音八分 ostinato
        for e in range(8):
            add("bass", r if e % 4 != 3 else r + 12, b, e * 0.5, 0.44, (80 if e % 2 == 0 else 66) + (6 if loud else 0))
        add("sub", r - 12, b, 0, 1.9, 46 if loud else 40)
        # 大提琴：四分音符脉冲
        for q in range(4):
            add("celli", c[0], b, q, 0.4, 52 + (8 if q % 2 == 0 else 0) + (8 if loud else 0))
        # 弦乐：进行曲式短和弦
        for q in range(4):
            ch("strings", c, b, q, 0.42, (66 if q % 2 == 0 else 52) + (12 if loud else 0))
        # 铜管：整小节长音 + 强拍
        ch("brass", [p + 12 for p in c], b, 0, 1.4, 56 + (12 if loud else 0))
        ch("brass", [p + 12 for p in c], b, 2.0, 0.8, 62 + (12 if loud else 0))
        if b >= 12:
            ch("choir", [p + 12 for p in c], b, 0, 3.8, 30 + (b - 12) * 3)
        # 鼓
        for beat in (0, 2):
            add("kick", 0, b, beat, 0.35, 100 if not loud else 108)
        for beat in (1, 3):
            add("snare", 0, b, beat, 0.3, 78 if not loud else 88)
        for i in range(8):
            add("hat", 0, b, i * 0.5, 0.12, 34 if i % 2 else 44)
        if b % 2 == 0:
            add("taiko", 0, b, 0, 0.5, 76)
        if b in (8, 16):
            add("crash", 0, b, 0, 2.2, 88)
        if b in (15, 23):                     # 段尾过门
            for i in range(8):
                add("snare", 0, b, 2.0 + i * 0.25, 0.16, 50 + i * 7)

    melody(A_MEL, 8, "horn", 86)
    melody(A_MEL2, 16, "brass", 92)
    melody(A_MEL2, 16, "horn", 70, octave=-1)
    for (b, beat, beats, nm) in A_MEL:
        ch("strings", [N(nm) - 12, N(nm) - 8], 8 + b, beat, beats * 0.9, 52)

    # ---------------- 副歌 24-31 ----------------
    for b in range(24, 32):
        c, r = CHORD[harmony(b)], ROOT[harmony(b)]
        for e in range(8):
            add("bass", r if e % 2 == 0 else r + 12, b, e * 0.5, 0.44, 86 if e % 2 == 0 else 70)
        add("sub", r - 12, b, 0, 1.9, 54)
        for q in range(4):
            add("celli", c[0], b, q, 0.45, 62)
        ch("strings", c, b, 0, 3.8, 78)
        ch("strings", [p + 12 for p in c], b, 0, 3.6, 54)
        ch("choir", [p + 12 for p in c], b, 0, 3.7, 66)
        ch("brass", [p + 12 for p in c], b, 0.5, 0.5, 74)
        ch("brass", [p + 12 for p in c], b, 2.5, 0.5, 74)
        for beat in (0, 2):
            add("kick", 0, b, beat, 0.35, 110)
        add("kick", 0, b, 3.5, 0.3, 88)
        for beat in (1, 3):
            add("snare", 0, b, beat, 0.3, 96)
        for i in range(16):
            add("hat", 0, b, i * 0.25, 0.1, 30 if i % 2 else 42)
        add("timp", ROOT[harmony(b)], b, 0, 0.9, 96)
        if b % 2 == 1:
            add("timp", ROOT[harmony(b)], b, 2, 0.8, 80)
        if b in (24, 28):
            add("crash", 0, b, 0, 2.4, 100)
    melody(B_MEL, 24, "brass", 100)
    melody(B_MEL, 24, "horn", 72, octave=-1)

    # ---------------- 间奏 32-39（冬将军） ----------------
    for b in range(32, 40):
        h = harmony(b)
        c = CHORD[h]
        ch("strings", [p + 12 for p in c], b, 0, 3.9, 46 if b < 36 else 60)
        ch("choir", [p + 12 for p in c], b, 0, 3.8, 34)
        add("sub", ROOT[h] - 12, b, 0, 3.8, 40)
        if b < 36:
            add("bass", ROOT[h], b, 0, 3.6, 44)
    # 钟琴动机（冰）
    for (b, beat, beats, nm) in [(32, 0, 2, "D5"), (32, 2, 2, "A5"),
                                 (33, 1, 1, "F5"), (33, 2, 2, "E5"),
                                 (34, 0, 2, "Bb4"), (34, 2, 2, "F5"),
                                 (35, 1, 1, "D5"), (35, 2, 2, "C5"),
                                 (36, 0, 1, "A5"), (36, 1, 1, "G5"), (36, 2, 1, "F5"), (36, 3, 1, "E5")]:
        add("bell", N(nm), b, beat, beats * 0.95, 64)
    # 心跳
    for b in range(32, 38):
        add("taiko", 0, b, 0, 0.5, 84)
        add("taiko", 0, b, 2, 0.4, 60)
    # 第 36 小节起推回去
    for b in (36, 37):
        for e in range(8):
            add("bass", ROOT[harmony(b)], b, e * 0.5, 0.4, 58 + e * 3)
        for q in range(4):
            add("kick", 0, b, q, 0.3, 76 + q * 6)
    for i in range(32):
        add("snare", 0, 38, i * 0.125, 0.1, 36 + i * 3)
    for i in range(16):
        add("snare", 0, 39, i * 0.25, 0.12, 60 + i * 4)
    ch("brass", [p + 12 for p in CHORD["Bb"]], 38, 0, 3.5, 66)
    ch("brass", [p + 12 for p in CHORD["Bb"]], 39, 0, 2.0, 78)
    add("riser", 0, 38, 0, 8.0, 84)
    add("timp", ROOT["Bb"], 39, 0, 1.0, 96)
    add("crash", 0, 39, 0, 2.0, 84)

    # ---------------- 副歌二 40-55 ----------------
    for b in range(40, 56):
        c, r = CHORD[harmony(b)], ROOT[harmony(b)]
        big = b >= 48
        for e in range(8):
            add("bass", r if e % 2 == 0 else r + 12, b, e * 0.5, 0.44, (88 if e % 2 == 0 else 72) + (6 if big else 0))
        add("sub", r - 12, b, 0, 1.9, 56)
        for q in range(4):
            add("celli", c[0], b, q, 0.45, 64 + (6 if big else 0))
        ch("strings", c, b, 0, 3.8, 82)
        ch("strings", [p + 12 for p in c], b, 0, 3.6, 58 + (8 if big else 0))
        if big:
            ch("strings", [p + 24 for p in c], b, 0, 3.4, 34)
        ch("choir", [p + 12 for p in c], b, 0, 3.7, 70)
        if big:
            ch("choir", [p + 24 for p in c], b, 0, 3.6, 40)
        ch("brass", [p + 12 for p in c], b, 0.5, 0.5, 78)
        ch("brass", [p + 12 for p in c], b, 2.5, 0.5, 78)
        for beat in (0, 1, 2, 3):
            add("kick", 0, b, beat, 0.3, 104 if beat % 2 == 0 else 84)
        add("kick", 0, b, 2.5, 0.28, 80)
        for beat in (1, 3):
            add("snare", 0, b, beat, 0.3, 98)
        for i in range(16):
            add("hat", 0, b, i * 0.25, 0.1, 32 if i % 2 else 44)
        add("timp", r, b, 0, 0.9, 98)
        if b % 2 == 1:
            add("timp", r, b, 2, 0.8, 82)
        if b in (40, 44, 48, 52):
            add("crash", 0, b, 0, 2.4, 100)
        if b in (47, 55):
            for i in range(8):
                add("snare", 0, b, 2.0 + i * 0.25, 0.16, 56 + i * 7)
    melody(B_MEL, 40, "brass", 104)
    melody(B_MEL, 40, "horn", 76, octave=-1)
    # 后半段对位：铁流动机（多数合成一个）
    for (b0, v) in ((48, 96), (52, 104)):
        for i, nm in enumerate(["D4", "F4", "A4", "D5"]):
            add("brass", N(nm) + 12, b0, i * 0.5, 0.42, v)
            add("horn", N(nm), b0, i * 0.5, 0.42, v - 20)
    # 第 55 小节收回副歌旋律，接到尾奏
    melody(B_MEL[4:8], 52, "strings", 74, octave=1)

    # ---------------- 尾奏 56-63 ----------------
    for b in range(56, 64):
        h = harmony(b)
        c, r = CHORD[h], ROOT[h]
        if b < 60:
            for e in range(8):
                add("bass", r if e % 2 == 0 else r + 12, b, e * 0.5, 0.44, 84)
            add("sub", r - 12, b, 0, 1.9, 48)
            for q in range(4):
                add("celli", c[0], b, q, 0.42, 58)
            for q in range(4):
                ch("strings", c, b, q, 0.4, 64 if q % 2 == 0 else 50)
            ch("brass", [p + 12 for p in c], b, 0, 1.5, 60)
            for beat in (0, 2):
                add("kick", 0, b, beat, 0.35, 94)
            for beat in (1, 3):
                add("snare", 0, b, beat, 0.3, 70)
            for i in range(8):
                add("hat", 0, b, i * 0.5, 0.1, 34)
            if b in (56, 58):
                add("crash", 0, b, 0, 2.2, 76)
    melody(A_MEL, 56, "horn", 84)
    # 收束：铁流动机 + Dm 长音
    for i, nm in enumerate(["D4", "F4", "A4", "D5"]):
        add("brass", N(nm), 60, i * 0.4, 0.35, 106)
        add("horn", N(nm) + 12, 60, i * 0.4, 0.35, 88)
    ch("brass", [p + 12 for p in DM], 60, 2.0, 2.0, 110)
    ch("strings", [p + 12 for p in DM], 60, 2.0, 2.0, 100)
    ch("choir", [p for p in DM], 60, 2.0, 2.0, 84)
    add("timp", ROOT["Dm"], 60, 0, 2.0, 110)
    add("timp", ROOT["Dm"], 60, 2.0, 2.5, 96)
    add("crash", 0, 60, 0, 3.0, 104)
    for b in (61, 62):
        ch("strings", [p + 12 for p in DM], b, 0, 1.9, 70 - (b - 61) * 14)
        ch("choir", [p for p in DM], b, 0, 1.9, 52 - (b - 61) * 12)
    add("bell", N("D6"), 61, 0, 3.0, 60)
    add("bell", N("A5"), 62, 0, 2.5, 46)
    add("kick", 0, 63, 0, 0.6, 70)

    return EV


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
    """spec: dict(kind, cap, a, d, s, r, voices, det, vib, vibd, bright, bloom)"""
    n = max(64, int(dur * SR))
    t = np.arange(n) / SR
    out = np.zeros(n)
    cap = min(pick_cap(f), spec.get("cap", 38))
    kind = spec["kind"]
    voices = spec.get("voices", 1)
    det = spec.get("det", 0.0)
    vibd = spec.get("vibd", 0.0)
    for v in range(voices):
        dv = 0.0 if voices == 1 else det * (2.0 * v / (voices - 1) - 1.0)
        rng = np.random.default_rng(hash((round(f, 2), v, spec.get("seed", 0))) & 0xFFFF)
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
        out += w
    out /= voices
    e = adsr(n, spec.get("a", 0.02), spec.get("d", 0.15), spec.get("s", 0.75),
             min(spec.get("r", 0.15), dur * 0.45))
    amp = (vel / 127.0) ** 1.5
    return out * e * amp


# 音色库
SPEC = {
    "bass": dict(kind="warm", a=0.008, d=0.08, s=0.62, r=0.07, voices=2, det=5, gain=0.95),
    "sub": dict(kind="dark", a=0.012, d=0.2, s=0.85, r=0.12, voices=1, cap=4, gain=0.5),
    "celli": dict(kind="warm", a=0.05, d=0.2, s=0.7, r=0.18, voices=3, det=7, vibd=0.004, gain=0.62),
    "strings": dict(kind="warm", a=0.09, d=0.3, s=0.78, r=0.28, voices=4, det=9, vibd=0.003, gain=0.6),
    "choir": dict(kind="choir", a=0.22, d=0.4, s=0.8, r=0.4, voices=3, det=8, vibd=0.006, gain=0.5),
    "brass": dict(kind="brass", a=0.03, d=0.18, s=0.72, r=0.14, voices=3, det=6,
                  bright=1, bloom=0.16, gain=0.72),
    "horn": dict(kind="horn", a=0.06, d=0.2, s=0.74, r=0.16, voices=2, det=4, vibd=0.0035, gain=0.66),
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


def drum_kick(vel):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 46 + 90 * np.exp(-t * 26)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
    click = fir(np.random.default_rng(1).standard_normal(n) * np.exp(-t * 260), hp_taps(1800))
    return np.tanh(1.7 * body) * 0.9 + click * 0.35 * (vel / 127.0)


def drum_snare(vel):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(2)
    noise = fir(rng.standard_normal(n), bp_taps(1200, 5200)) * np.exp(-t * 20)
    body = np.sin(2 * np.pi * 186 * t) * np.exp(-t * 34) * 0.5
    return (noise * 0.9 + body) * (vel / 127.0) ** 1.2


def drum_hat(vel):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(3)
    x = fir(rng.standard_normal(n), hp_taps(7200, 95)) * np.exp(-t * 90)
    return x * (vel / 127.0) ** 1.3


def drum_crash(vel):
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(4)
    x = fir(rng.standard_normal(n), hp_taps(4200, 255)) * np.exp(-t * 1.7)
    met = np.zeros(n)
    for f0, a in ((3170, .5), (4430, .35), (5910, .25), (7420, .18)):
        met += a * np.sin(2 * np.pi * f0 * t + a * 3)
    return (x * 0.9 + met * 0.25 * np.exp(-t * 2.2)) * (vel / 127.0) ** 1.2


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

PAN = {"bass": 0.0, "sub": 0.0, "celli": -0.22, "strings": 0.18, "choir": -0.12,
       "brass": 0.12, "horn": -0.18, "timp": -0.1, "bell": 0.3,
       "kick": 0.0, "snare": 0.02, "hat": 0.24, "crash": -0.2, "taiko": -0.05, "riser": 0.0}
VERB = {"bass": 0.03, "sub": 0.0, "celli": 0.16, "strings": 0.3, "choir": 0.42,
        "brass": 0.24, "horn": 0.3, "timp": 0.3, "bell": 0.55,
        "kick": 0.02, "snare": 0.22, "hat": 0.06, "crash": 0.4, "taiko": 0.28, "riser": 0.35}
GAIN = {"bass": 0.44, "sub": 0.08, "celli": 0.58, "strings": 0.78, "choir": 0.62,
        "brass": 0.82, "horn": 0.62, "timp": 0.3, "bell": 0.36,
        "kick": 0.22, "snare": 0.5, "hat": 0.52, "crash": 0.5, "taiko": 0.28, "riser": 0.3}


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


def render():
    global DBG_PART
    build()
    print(f"  乐谱事件 {len(EV)}")
    rng = np.random.default_rng(11)
    for e in EV:
        p, m, tick, dur, vel = e["part"], e["midi"], e["tick"], e["dur"], e["vel"]
        secs = dur / TPB * SPB
        DBG_PART = p
        if p in SPEC:
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
      "brass": 61, "horn": 60, "timp": 47}
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
        ch = 9 if part in DRUM else min(15, list(GM).index(part) if part in GM else 0)
        if part in DRUM:
            ch = 9
        msgs = []
        if part in GM:
            msgs.append((0, bytes([0xC0 | ch, GM[part]])))
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
