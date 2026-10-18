#!/usr/bin/env python3
"""
皇冠对决 · 原声配乐 (Original Soundtrack) · 作曲源码
------------------------------------------------------------------------------
这是「谱」，不是音频：旋律、和声、对位、配器、力度曲线都写在这里，输出多轨 MIDI，
交给 DAW / MuseScore + 真实音源渲染。改曲就改这个文件（或直接改 MIDI）。

调性：D 小调（自然 / 多利亚），全套围绕三个动机——
  A「皇冠」  上行纯五度 + 级进回落：A4 ─ D5 F5 … 象征「加冕」与「终局」
  B「对决」  重复音起势 + 切分：A A D(附点) …  推动战斗
  C「金钟」  高音区 G–A–D 三音，出现在终止式 / 胜利处，对应视觉里的金色点缀

曲目（4/4）：
  01_main_theme      主题曲 / 主菜单     66 BPM  24 小节  可循环
  02_duel            对局战斗            120 BPM 48 小节  可循环
  03_victory         胜利 stinger        96 BPM   6 小节
  04_defeat          失败 stinger        60 BPM   5 小节

用法： python tools/music/score/crown_duel_suite.py   →  music/midi/*.mid
依赖： pip install mido
"""
import os, random, re
import mido
from mido import Message, MetaMessage, MidiFile, MidiTrack, bpm2tempo

TPB = 480                                 # ticks / beat
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "music", "midi")

# ------------------------------------------------------------------ 记谱工具
_N = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
def midi(name):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", name)
    if not m: raise ValueError(name)
    p = 12 * (int(m.group(3)) + 1) + _N[m.group(1)]
    return p + {"#": 1, "b": -1, "": 0}[m.group(2)]

def parse(line):
    """'A4:2 D5:1 R:1 F5:.5' → [(pitch|None, beats), ...]；和弦用 '+' 连接：'D4+A4+F5:2'"""
    out = []
    for tok in line.split():
        pitch, dur = tok.split(":")
        d = float(dur)
        if pitch == "R": out.append((None, d))
        else: out.append(([midi(p) for p in pitch.split("+")], d))
    return out

# 和声：名称 -> (低音, 中声部上行四音)
CHORD = {
    "Dm":   (38, [57, 62, 65, 69]),
    "Bb":   (34, [58, 62, 65, 70]),
    "Gm":   (43, [58, 62, 67, 70]),
    "A7":   (33, [55, 61, 64, 69]),
    "Asus": (33, [55, 62, 64, 69]),
    "C":    (36, [55, 60, 64, 67]),
    "F":    (41, [57, 60, 65, 69]),
    "Dmaj": (38, [57, 62, 66, 69]),      # 皮卡迪三度（胜利）
    "Em":   (40, [55, 59, 64, 67]),
}
def prog(s): return s.split()

rnd = random.Random(1018)

class Part:
    """一条乐器轨：以「拍」为单位写音符，保存时再转 tick。"""
    def __init__(self, name, channel, program, vol=100, pan=64, reverb=60, chorus=0):
        self.name, self.ch, self.program = name, channel, program
        self.vol, self.pan, self.reverb, self.chorus = vol, pan, reverb, chorus
        self.notes, self.ccs = [], []

    def note(self, pitch, start, dur, vel=80, human=True):
        if pitch is None: return
        jitter = rnd.uniform(-.012, .012) if human else 0
        v = vel + (rnd.randint(-4, 4) if human else 0)
        self.notes.append((max(0, start + jitter), dur * .97 if dur > .2 else dur, int(max(1, min(127, v))), pitch))

    def line(self, start, text, vel=80, shift=0, legato=1.0):
        """写一行旋律（shift 为半音转调，如 -12 = 低八度），返回结束拍位置。"""
        t = start
        for pitch, d in parse(text):
            if pitch:
                for p in pitch:
                    self.note(p + shift, t, d * legato, vel + (6 if t % 1 == 0 and d >= 1 else 0))
            t += d
        return t

    def cc(self, num, val, beat): self.ccs.append((beat, num, int(max(0, min(127, val)))))

    def ramp(self, num, v0, v1, b0, b1, steps=12):
        for i in range(steps + 1):
            self.cc(num, v0 + (v1 - v0) * i / steps, b0 + (b1 - b0) * i / steps)

    def to_track(self):
        tr = MidiTrack()
        tr.append(MetaMessage("track_name", name=self.name, time=0))
        ev = []
        ev.append((0, 0, Message("program_change", channel=self.ch, program=self.program)))
        for n, v in ((7, self.vol), (10, self.pan), (91, self.reverb), (93, self.chorus), (11, 100)):
            ev.append((0, 1, Message("control_change", channel=self.ch, control=n, value=v)))
        for b, n, v in self.ccs:
            ev.append((int(b * TPB), 2, Message("control_change", channel=self.ch, control=n, value=v)))
        for s, d, vel, p in self.notes:
            on = int(s * TPB); off = on + max(10, int(d * TPB))
            ev.append((on, 3, Message("note_on", channel=self.ch, note=p, velocity=vel)))
            ev.append((off, 1, Message("note_off", channel=self.ch, note=p, velocity=0)))
        ev.sort(key=lambda e: (e[0], e[1]))
        last = 0
        for t, _, m in ev:
            tr.append(m.copy(time=t - last)); last = t
        return tr

def save(name, bpm, parts, total_beats, markers=()):
    mid = MidiFile(type=1, ticks_per_beat=TPB)
    meta = MidiTrack()
    meta.append(MetaMessage("track_name", name=name, time=0))
    meta.append(MetaMessage("set_tempo", tempo=bpm2tempo(bpm), time=0))
    meta.append(MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    meta.append(MetaMessage("key_signature", key="Dm", time=0))
    last = 0
    for beat, text in sorted(markers):
        t = int(beat * TPB)
        meta.append(MetaMessage("marker", text=text, time=t - last)); last = t
    meta.append(MetaMessage("end_of_track", time=max(0, int(total_beats * TPB) - last)))
    mid.tracks.append(meta)
    for p in parts: mid.tracks.append(p.to_track())
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".mid")
    mid.save(path)
    return path

# 鼓（GM 通道 10）
KICK, SNARE, RIM, HAT, PHAT, OHAT, RIDE, CRASH, TOMH, TOMM, TOML = 36, 38, 37, 42, 44, 46, 51, 49, 50, 47, 45

def vl(prev, chord, lo, hi):
    """声部连接：在 [lo, hi] 内选和弦音中离上一个音最近的一个（共同音保持，其余级进）"""
    bass, mid = CHORD[chord]
    pcs = {p % 12 for p in [bass] + mid}
    cands = [p for p in range(lo, hi + 1) if p % 12 in pcs]
    if prev is None: prev = (lo + hi) // 2
    return min(cands, key=lambda p: (abs(p - prev), -p))

def low_bass(p):
    """低音提琴实际音域 E1(28) 起，低于则上移一个八度"""
    return p + 12 if p < 28 else p

def arp_bar(part, chord, t, vel=58, pattern="up"):
    """钢琴 / 竖琴 8 分音符琶音：低音 + 四个中声部音"""
    bass, mid = CHORD[chord]
    seq = [bass, mid[0], mid[1], mid[2], mid[3], mid[2], mid[1], mid[2]] if pattern == "up" else \
          [bass, mid[1], mid[3], mid[2], mid[3], mid[1], mid[2], mid[0]]
    for i, p in enumerate(seq):
        accent = 8 if i in (0, 4) else 0
        part.note(p, t + i * .5, .75 if i else 1.5, vel + accent - (6 if i % 2 else 0))

# ============================================================================
#  01 · 主题曲 / 菜单（66 BPM，24 小节，约 87 秒，可循环）
#   Intro 1-4   钢琴单线 + 合成铺底，动机 A 隐约出现
#   A     5-12  大提琴/小提琴奏出动机 A，钢琴琶音，金钟回声
#   B    13-20  小提琴 I 升八度，弦乐全员、点阵 tick 入场（电子层），情绪抬升
#   Outro21-24  回落，终止于属七和弦，无缝接回 Intro
# ============================================================================
def main_theme():
    bpm = 66
    H = ["Dm", "Bb", "Gm", "Asus",
         "Dm", "Bb", "Gm", "A7", "Dm", "Bb", "C", "A7",
         "Bb", "F", "Gm", "Dm", "Bb", "C", "Asus", "A7",
         "Dm", "Bb", "Gm", "A7"]
    n = len(H)
    piano = Part("Piano", 0, 0, 100, 60, 70)
    harp = Part("Harp", 1, 46, 82, 80, 90)
    v1 = Part("Violin I", 2, 40, 96, 48, 80)
    v2 = Part("Violin II", 3, 40, 88, 70, 80)
    vla = Part("Viola", 4, 41, 86, 82, 80)
    vc = Part("Cello", 5, 42, 100, 40, 74)
    cb = Part("Contrabass", 6, 43, 90, 64, 50)
    cel = Part("Celesta (Gold Bell)", 7, 8, 80, 78, 100)
    pad = Part("Synth Pad (warm)", 8, 89, 70, 64, 100, 40)
    pulse = Part("Synth Pulse (halftone)", 10, 81, 52, 54, 70)
    dr = Part("Percussion (ticks)", 9, 0, 72, 64, 40)

    # 渐强曲线：整曲每 4 小节一档（小提琴/中提琴/低弦 CC11 表情）
    arc = [38, 46, 58, 72, 84, 70]           # intro / A / A / B / B / outro
    for seg, val in enumerate(arc):
        b0, b1 = seg * 16, seg * 16 + 16
        for p in (v1, v2, vla, vc, cb, pad):
            p.ramp(11, val - 6, val + 6, b0, b1, 6)

    # ---- 钢琴（全曲）：Intro 稀疏、A 琶音、B 加厚、Outro 回落
    for bar, ch in enumerate(H):
        t = bar * 4
        piano.cc(64, 127, t); piano.cc(64, 0, t + 3.9)           # 每小节踩一次踏板
        if bar < 4:                                              # Intro：每小节只弹低音 + 一个高音
            bass, mid = CHORD[ch]
            piano.note(bass, t, 3.8, 50); piano.note(mid[2] + 12, t + 1.5, 2.4, 44); piano.note(mid[0] + 12, t + 2.5, 1.4, 38)
        else:
            pat = "up" if (bar // 2) % 2 == 0 else "alt"
            arp_bar(piano, ch, t, 56 if bar < 12 else 62, pat)
        if 12 <= bar < 20:                                       # B 段左手八度加厚
            piano.note(CHORD[ch][0] + 12, t, 3.8, 60)

    # ---- 动机 A：Section A（小节 5-12） —— 大提琴 + 小提琴 II 八度叠奏
    A_melody = [
        "A4:2 D5:1 F5:1",      "F5:2 D5:1 Bb4:1",      "D5:1.5 C5:.5 Bb4:1 G4:1", "C#5:2 E5:1 D5:1",
        "A5:2 G5:1 F5:1",      "D5:1 F5:1 Bb5:2",      "G5:1.5 E5:.5 C5:1 E5:1",  "E5:2 C#5:1 A4:1",
    ]
    for i, text in enumerate(A_melody):
        t = (4 + i) * 4
        vc.line(t, text, 76, shift=-12)       # 大提琴低八度奏主旋律
        v2.line(t, text, 56)                  # 小提琴 II 同音（高八度）作呼应层

    # ---- Section B（小节 13-20）：小提琴 I 升八度奏出歌唱性长线，大提琴改为对位
    B_melody = [
        "D6:2 C6:1 Bb5:1",     "A5:2 C6:2",            "Bb5:1.5 A5:.5 G5:1 F5:1", "F5:2 E5:1 D5:1",
        "D6:1 F6:2 D6:1",      "E6:2 G6:1 E6:1",       "D6:3 R:1",                "C#6:1 E6:1 A5:2",
    ]
    for i, text in enumerate(B_melody):
        t = (12 + i) * 4
        v1.line(t, text, 78)
    # B 段大提琴对位：慢速上行 + 根音
    for bar in range(12, 20):
        t = bar * 4; ch = H[bar]; bass, mid = CHORD[ch]
        vc.note(bass + 12, t, 2, 68); vc.note(mid[0], t + 2, 1, 62); vc.note(mid[1], t + 3, 1, 64)

    # ---- 中提琴 / 小提琴 II 长音铺底（Intro 起即入）
    vp = v2p = None
    for bar, ch in enumerate(H):
        t = bar * 4
        vp = vl(vp, ch, 57, 69)                       # 中提琴 A3–A4，最小移动
        vla.note(vp, t, 4.1, 46 + (8 if bar >= 12 else 0))
        if bar >= 12 or bar < 4:                      # 小提琴 II 在 A 段让位给旋律层，其余时间铺长音
            v2p = vl(v2p, ch, 64, 76)
            v2.note(v2p, t, 4.1, 44)
        cb.note(low_bass(CHORD[ch][0] - 12), t, 3.9, 58)

    # ---- 竖琴：A 段后半与 B 段的上行滑奏（每 2 小节一次）
    for bar in range(8, 20, 2):
        t = bar * 4 + 3; bass, mid = CHORD[H[bar]]
        for i, p in enumerate([mid[0] + 12, mid[1] + 12, mid[2] + 12, mid[3] + 12, mid[1] + 24]):
            harp.note(p, t + i * .125, 1.2, 52 + i * 3)

    # ---- 金钟（动机 C）：终止式处，高音三音 G6 A6 D7
    for bar in (7, 11, 15, 19, 23):
        t = bar * 4 + 2
        cel.note(midi("G6"), t, 1.0, 52); cel.note(midi("A6"), t + .5, 1.0, 56); cel.note(midi("D7"), t + 1.0, 2.0, 62)
    # 动机 A 的金钟回声（A 段每 4 小节）
    for bar in (4, 8):
        t = bar * 4 + 2
        for i, p in enumerate(("A5", "D6", "F6")):
            cel.note(midi(p), t + i * .75, 1.2, 42)

    # ---- 合成铺底：全曲长音，B 段升高八度；Intro 淡入
    for bar, ch in enumerate(H):
        t = bar * 4; mid = CHORD[ch][1]
        for k in (0, 1, 2):
            pad.note(mid[k], t - .05, 4.2, 40 + (8 if bar >= 12 else 0), human=False)
    pad.ramp(11, 20, 70, 0, 16)

    # ---- 电子层 ① 点阵脉冲：16 分音符根音，B 段入场（八度摇摆），按「半调」图案起伏
    dots = [1, 0, .4, 0, .65, 0, .3, .25, 1, 0, .4, .2, .65, 0, .3, 0]
    for bar in range(12, 24):
        t = bar * 4; root = CHORD[H[bar]][0] + 24
        for i in range(16):
            if dots[i] > .35:
                pulse.note(root + (12 if i in (6, 7, 14) else 0), t + i * .25, .2, int(24 + 28 * dots[i]) - (6 if bar >= 20 else 0))
    pulse.ramp(74, 40, 110, 12 * 4, 20 * 4)      # CC74 滤波开合：B 段渐开

    # ---- 电子层 ② 打击乐「点」：16 分闭镲 + 小军鼓边击，B 段加轻 kick
    for bar in range(4, 24):
        t = bar * 4
        for i in range(16):
            a = dots[i]
            if a:
                dr.note(HAT, t + i * .25, .1, int(20 + 24 * a) + (6 if bar >= 12 else 0))
        if bar >= 12:
            dr.note(KICK, t, .5, 56)
            if bar % 2: dr.note(KICK, t + 2.5, .4, 44)
            dr.note(RIM, t + 3, .3, 40)
        if bar in (4, 12, 20): dr.note(CRASH, t, 3, 54)
    return save("01_main_theme", bpm, [piano, harp, v1, v2, vla, vc, cb, cel, pad, pulse, dr], n * 4,
                [(0, "Intro"), (16, "A  motif A (Crown)"), (48, "B  strings lift"), (80, "Outro / loop point")])

# ============================================================================
#  02 · 对局战斗（120 BPM，48 小节，约 96 秒，可循环）
#   A  1-8    弦乐 16 分音符 ostinato + 鼓 + 合成低音，动机 B 由钢琴/小提琴 I 奏出
#   A' 9-16   动机 B 升八度，小提琴 II 对位
#   B  17-24  Bb–C–Dm–A 上行紧张段：低弦 8 分推进，铜管感由弦乐 col legno/重音替代
#   C  25-40  高潮：动机 A+B 叠加，全员，鼓加 tom 滚奏
#   Break 41-44  只剩钢琴与 riser，鼓 fill；Return 45-48 回到 A，终于属和弦以便循环
# ============================================================================
def duel():
    bpm = 120
    H = (["Dm", "Bb", "Gm", "A7"] * 4 +                   # A、A'：每小节一个和弦，与动机 B 的一句一小节对齐
         ["Bb", "Bb", "C", "C", "Dm", "Dm", "A7", "A7"] +
         ["Dm", "Bb", "Gm", "A7", "Dm", "Bb", "C", "A7"] * 2 +
         ["Dm", "Dm", "A7", "A7"] +
         ["Dm", "Bb", "Gm", "A7"])
    n = len(H)                                            # 48
    piano = Part("Piano (stabs)", 0, 0, 100, 60, 50)
    v1 = Part("Violin I", 1, 40, 96, 46, 70)
    v2 = Part("Violin II (spiccato)", 2, 40, 90, 70, 70)
    vla = Part("Viola (spiccato)", 3, 41, 90, 82, 66)
    vc = Part("Cello (ostinato)", 4, 42, 104, 38, 60)
    cb = Part("Contrabass", 5, 43, 92, 64, 40)
    cel = Part("Celesta (Gold Bell)", 6, 8, 74, 78, 100)
    pad = Part("Synth Pad", 7, 89, 62, 64, 100, 40)
    bass = Part("Synth Bass (pulse)", 8, 38, 86, 64, 30)
    pulse = Part("Synth Pluck (arp)", 10, 81, 54, 56, 60)
    dr = Part("Drums", 9, 0, 100, 64, 40)
    fx = Part("Riser FX", 11, 95, 70, 64, 100)           # Sweep Pad / FX（riser 用）

    def sec(bar0, bar1, v0, v1_):
        for p in (v1, v2, vla, vc, cb, pad):
            p.ramp(11, v0, v1_, bar0 * 4, bar1 * 4, 8)
    sec(0, 8, 66, 80); sec(8, 16, 78, 92); sec(16, 24, 82, 100); sec(24, 40, 100, 120); sec(40, 44, 70, 40); sec(44, 48, 70, 86)

    # ---- 弦乐 ostinato（16 分音符；每拍 R R 5 R；高潮段改八度跳）
    def ostinato(part, bar, octave, vel, from_bar=0):
        t = bar * 4; ch = H[bar]; b = CHORD[ch][0] + octave
        fifth = b + 7
        for beat in range(4):
            pat = [b, b, fifth, b] if beat % 2 == 0 else [b, fifth, b, b + 12]
            for i, p in enumerate(pat):
                acc = 8 if i == 0 else 0
                part.note(p, t + beat + i * .25, .2, vel + acc - (5 if i == 3 else 0))

    for bar in range(n):
        if 40 <= bar < 44: continue                                 # break 段只留钢琴
        vel = 56 if bar < 16 else (66 if bar < 24 else (78 if bar < 40 else 60))
        ostinato(vc, bar, 12, vel)
        if bar >= 4: ostinato(vla, bar, 24, vel - 8)
        if bar >= 16: ostinato(v2, bar, 36, vel - 14)
        cb.note(low_bass(CHORD[H[bar]][0] - 12), bar * 4, 3.8, 70)

    # ---- 合成低音：8 分音符根音，反拍留白（对应半调点的疏密）
    for bar in range(n):
        if 40 <= bar < 44: continue
        t = bar * 4; r = CHORD[H[bar]][0]
        for s in range(8):
            if s % 4 == 3: continue
            bass.note(r, t + s * .5, .42, 78 if s % 2 == 0 else 54)

    # ---- 钢琴：反拍和弦 stab（2& 4&），高潮段加八度
    for bar in range(n):
        t = bar * 4; ch = H[bar]; bs, mid = CHORD[ch]
        if bar < 8: continue
        for off in (1.5, 3.5):
            for p in (mid[0], mid[1], mid[2]): piano.note(p, t + off, .35, 68 + (10 if bar >= 24 else 0))
        if 24 <= bar < 40:
            for p in (mid[0] + 12, mid[2] + 12): piano.note(p, t, .5, 64)
    # break 段钢琴：慢速下行主和弦 + 动机 A 暗示
    for i, bar in enumerate(range(40, 44)):
        t = bar * 4; ch = H[bar]; bs, mid = CHORD[ch]
        piano.cc(64, 127, t)
        piano.note(bs, t, 4, 66)
        for k, p in enumerate((mid[0], mid[1], mid[2], mid[3])): piano.note(p + (12 if bar >= 42 else 0), t + k * .5, 3.8 - k * .5, 50 + k * 6)
        piano.cc(64, 0, t + 3.95)

    # ---- 动机 B（旋律）：A 段钢琴 + 小提琴 I；A' 升八度；C 段全员叠加动机 A
    B1 = ["A4:.5 A4:.5 D5:1 F5:.5 E5:.5 D5:1", "D5:.5 D5:.5 F5:1 D5:.5 C5:.5 Bb4:1",
          "Bb4:.5 Bb4:.5 D5:1 G5:.5 F5:.5 D5:1", "E5:.5 E5:.5 A5:1 G5:.5 E5:.5 C#5:1"]
    B2 = ["A5:.5 A5:.5 D6:1 F6:.5 E6:.5 D6:1", "D6:.5 D6:.5 F6:1 D6:.5 C6:.5 Bb5:1",
          "Bb5:.5 Bb5:.5 D6:1 G6:.5 F6:.5 D6:1", "E6:.5 E6:.5 A6:1 G6:.5 F6:.5 E6:1"]
    # A（1-8）：小提琴 I 轻奏动机 B（第 1-4 小节第一句）+ 第二句稍变化
    for rep in (0, 1):
        for i, text in enumerate(B1):
            t = (rep * 4 + i) * 4
            if rep == 1 and i == 3: text = "E5:.5 E5:.5 A5:1 G5:.5 F5:.5 E5:1"
            v1.line(t, text, 70 if rep else 58)
            if rep == 1: piano.line(t, text, 60)
    # A'（9-16）：升八度，小提琴 I + 钢琴；小提琴 II 在弱拍补对位和声（三度）
    for rep in (0, 1):
        for i, text in enumerate(B2):
            t = (8 + rep * 4 + i) * 4
            v1.line(t, text, 76)
            piano.line(t, text, 62, shift=-12)
    for bar in range(8, 16):
        t = bar * 4; ch = H[bar]; mid = CHORD[ch][1]
        for off in (.5, 1.5, 2.5, 3.5):
            v2.note(mid[1] + 12, t + off, .4, 56)

    # ---- B 段（17-24）：Bb C Dm A 上行紧张，小提琴 I 长音渐强上行
    BUILD = ["F5:4", "G5:4", "A5:2 Bb5:1 A5:1", "C#6:3 E6:1",
             "Bb5:4", "C6:2 D6:2", "D6:1 E6:1 F6:1 E6:1", "E6:2 C#6:1 E6:1"]
    for i, text in enumerate(BUILD):
        v1.line((16 + i) * 4, text, 62 + i * 3)
    # B 段鼓：军鼓 4 分渐密，最后一小节 16 分滚奏（制造期待）
    # ---- C 段（25-40）：动机 A 与 B 叠加；两遍和声 Dm Bb Gm A7 | Dm Bb C A7
    A_main = ["A5:2 D6:1 F6:1", "F6:2 D6:1 Bb5:1", "D6:1.5 C6:.5 Bb5:1 G5:1", "C#6:2 E6:1 D6:1",
              "A5:2 D6:1 F6:1", "F6:2 D6:1 Bb5:1", "G6:1.5 E6:.5 C6:1 E6:1",     "E6:2 C#6:1 A5:1"]
    for rep in range(2):
        for i, text in enumerate(A_main):
            t = (24 + rep * 8 + i) * 4
            v1.line(t, text, 92)
            piano.line(t, text, 70)
            v2.line(t, text, 70, shift=-12)       # 小提琴 II 低八度同奏（厚度，避免平行四五度）
    # 动机 B 作为大提琴 / 低音的反应（C 段偶数小节）
    for bar in range(24, 40, 2):
        t = bar * 4 + 2
        for i, p in enumerate((midi("A3"), midi("A3"), midi("D4"))):
            vc.note(p, t + i * .5, .45, 90)
    # 金钟：每 4 小节落在小节首拍（动机 C）
    for bar in range(24, 40, 4):
        t = bar * 4
        for i, p in enumerate(("G6", "A6", "D7")): cel.note(midi(p), t + i * .5, 2.0 - i * .4, 58)
    # 电子 arp：全程 16 分，B 段起，C 段更亮
    for bar in range(8, 40):
        t = bar * 4; mid = CHORD[H[bar]][1]
        order = [0, 2, 1, 3, 2, 3, 1, 2] * 2
        for i in range(16):
            if i % 4 == 3 and bar % 2: continue
            pulse.note(mid[order[i] % 4] + 12 + (12 if bar >= 24 and i % 8 >= 6 else 0), t + i * .25, .2, 36 + (14 if bar >= 24 else 0) + (6 if i % 4 == 0 else 0))
    pulse.ramp(74, 40, 120, 8 * 4, 24 * 4, 16)

    # ---- 铺底与 riser
    for bar in range(n):
        if 40 <= bar < 44: continue
        t = bar * 4; mid = CHORD[H[bar]][1]
        for k in (0, 1, 2): pad.note(mid[k], t - .05, 4.2, 38 + (10 if bar >= 24 else 0), human=False)
    fx.ramp(11, 0, 127, 36 * 4, 40 * 4, 16)                         # 高潮后尾段 riser
    for k, p in enumerate((midi("D3"), midi("A3"), midi("D4"), midi("F4"))):
        fx.note(p, 40 * 4, 16, 48)
    fx.ramp(11, 10, 120, 40 * 4, 44 * 4, 16)

    # ---- 鼓
    def groove(bar, density=1, tom=False):
        t = bar * 4
        for off in (0, 2.0) : dr.note(KICK, t + off, .4, 100)
        dr.note(KICK, t + 1.75, .3, 78); dr.note(KICK, t + 3.5, .3, 72)
        dr.note(SNARE, t + 1, .3, 94); dr.note(SNARE, t + 3, .3, 98)
        for i in range(16):
            v = [86, 40, 62, 40, 78, 40, 62, 48, 86, 40, 62, 40, 78, 44, 66, 48][i]
            dr.note(HAT if i % 4 != 3 else OHAT, t + i * .25, .1, int(v * (.8 if density < 1 else 1)))
        if tom and bar % 2 == 1:
            for i, tm in enumerate((TOMH, TOMH, TOMM, TOML)): dr.note(tm, t + 3 + i * .25, .25, 88 + i * 6)
    for bar in range(n):
        if bar < 8:
            t = bar * 4
            for off in (0, 2): dr.note(KICK, t + off, .4, 84)
            dr.note(SNARE, t + 1, .3, 62); dr.note(SNARE, t + 3, .3, 66)
            for i in range(8): dr.note(HAT, t + i * .5, .1, 56 if i % 2 == 0 else 38)
        elif bar < 24: groove(bar, 1)
        elif bar < 40: groove(bar, 1, tom=True)
        elif bar < 44:
            t = bar * 4
            if bar == 43:                                           # 最后一小节 16 分军鼓 crescendo
                for i in range(16): dr.note(SNARE, t + i * .25, .2, 40 + i * 5)
            elif bar == 42:
                for i in range(8): dr.note(SNARE, t + 2 + i * .25, .2, 40 + i * 4)
        else: groove(bar, 1)
    for bar in (8, 16, 24, 32, 44): dr.note(CRASH, bar * 4, 3, 100)
    # B 段最后两小节军鼓渐密
    for bar in (22, 23):
        t = bar * 4
        for i in range(8 if bar == 22 else 16): dr.note(SNARE, t + 2 + i * .25 if bar == 22 else t + i * .25, .2, 56 + i * (3 if bar == 22 else 2))
    return save("02_duel", bpm, [piano, v1, v2, vla, vc, cb, cel, pad, bass, pulse, dr, fx], n * 4,
                [(0, "A  ostinato + motif B"), (32, "A' octave up"), (64, "B  tension build"),
                 (96, "C  climax (motif A + B)"), (160, "Break (piano + riser)"), (176, "Return / loop point")])

# ============================================================================
#  03 · 胜利 stinger（96 BPM，6 小节）：D 大调皮卡迪三度，动机 A 变形为大调
# ============================================================================
def victory():
    bpm = 96
    piano = Part("Piano", 0, 0, 104, 60, 80)
    harp = Part("Harp", 1, 46, 84, 80, 100)
    v1 = Part("Violin I", 2, 40, 100, 46, 90)
    v2 = Part("Violin II", 3, 40, 92, 70, 90)
    vla = Part("Viola", 4, 41, 88, 82, 90)
    vc = Part("Cello", 5, 42, 100, 40, 80)
    cel = Part("Celesta (Gold Bell)", 6, 8, 86, 78, 110)
    dr = Part("Percussion", 9, 0, 90, 64, 50)
    H = ["Dm", "Bb", "Gm", "A7", "Dmaj", "Dmaj"]
    # 动机 A 大调化：A4 D5 F#5 | A5 …（小提琴）
    v1.line(0,  "A4:2 D5:1 F5:1",  74)
    v1.line(4,  "F5:2 D5:1 Bb4:1", 78)
    v1.line(8,  "G5:2 Bb5:1 G5:1", 82)
    v1.line(12, "C#6:2 E6:1 A5:1", 86)
    v1.line(16, "F#5:1 A5:1 D6:2", 94)
    v1.line(20, "F#6:2 D6:2",      98, legato=1.3)
    vla_p = v2_p = None
    for bar, ch in enumerate(H):
        t = bar * 4; bs, mid = CHORD[ch]
        arp_bar(piano, ch, t, 64 + bar * 3, "up")
        vc.note(bs + 12, t, 3.9 if bar < 5 else 8, 80)
        vla_p = vl(vla_p if bar else None, ch, 57, 69); v2_p = vl(v2_p if bar else None, ch, 64, 76)
        vla.note(vla_p, t, 4.1, 58 + bar * 4); v2.note(v2_p, t, 4.1, 56 + bar * 4)
    for bar in (4, 5): harp.line(bar * 4 + 0, "D4:.25 A4:.25 D5:.25 F#5:.25 A5:.25 D6:.25 F#6:.25 A6:.25", 70)
    for i, p in enumerate(("G6", "A6", "D7")): cel.note(midi(p), 16 + i * .75, 4, 70)
    for i, p in enumerate(("F#6", "A6", "D7")): cel.note(midi(p), 20 + i * .75, 4, 74)
    dr.note(CRASH, 16, 6, 100)
    for i in range(8): dr.note(SNARE, 14 + i * .25, .2, 50 + i * 6)
    dr.note(KICK, 16, .5, 100); dr.note(KICK, 20, .5, 90)
    return save("03_victory", bpm, [piano, harp, v1, v2, vla, vc, cel, dr], 6 * 4,
                [(0, "motif A (minor)"), (16, "Picardy -> D major"), (20, "Final")])

# ============================================================================
#  04 · 失败 stinger（60 BPM，5 小节）：动机 A 下行倒影，终止于空五度
# ============================================================================
def defeat():
    bpm = 60
    piano = Part("Piano", 0, 0, 96, 60, 90)
    v1 = Part("Violin I", 1, 40, 84, 46, 100)
    vla = Part("Viola", 2, 41, 82, 82, 100)
    vc = Part("Cello", 3, 42, 100, 40, 90)
    cb = Part("Contrabass", 4, 43, 90, 64, 70)
    pad = Part("Synth Pad (dark)", 5, 89, 66, 64, 110, 30)
    cel = Part("Celesta (Gold Bell)", 6, 8, 70, 78, 110)
    # 动机 A 倒影（上行五度 → 下行五度）：D5 → G4 …
    v1.line(0,  "D5:2 A4:1 F4:1", 70)
    v1.line(4,  "E4:2 D4:1 C4:1", 62)
    v1.line(8,  "Bb3:3 A3:1",    58)
    v1.line(12, "D4:6",          50, legato=1.2)
    harm = ["Dm", "Gm", "Bb", "A7", "Dm"]
    vla_p = None
    for bar, ch in enumerate(harm):
        t = bar * 4; bs, mid = CHORD[ch]
        piano.cc(64, 127, t)
        piano.note(bs, t, 4, 60 - bar * 4)
        for k in range(3): piano.note(mid[k], t + 1 + k * .5, 3 - k * .5, 46 - bar * 3)
        vla_p = vl(vla_p if bar else None, ch, 57, 69)
        vla.note(vla_p, t, 4.2, 50); cb.note(low_bass(bs - 12), t, 4.2, 56)
        pad.note(mid[0], t - .05, 4.2, 40, human=False); pad.note(mid[2], t - .05, 4.2, 38, human=False)
    vc.line(0,  "D3:4 G2:4 Bb2:4 A2:4", 70)
    vc.line(16, "D2:4", 60, legato=1.5)
    cel.note(midi("A6"), 16, 4, 40); cel.note(midi("D6"), 17.5, 4, 34)       # 金钟只剩单音，音量减半
    piano.ramp(11, 90, 30, 0, 20)
    return save("04_defeat", bpm, [piano, v1, vla, vc, cb, pad, cel], 5 * 4 + 2,
                [(0, "motif A inverted"), (16, "open fifth (D-A)")])

if __name__ == "__main__":
    for fn in (main_theme, duel, victory, defeat):
        print(fn())
