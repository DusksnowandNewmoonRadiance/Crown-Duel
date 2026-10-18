"""
用 MIDI 写曲子，再交给 fluidsynth + SoundFont 渲染成真乐器音频。
------------------------------------------------------------
为什么不用程序化合成：加法合成做不出「弦乐的揉弦」「铜管的爆发」「定音鼓的鼓腔」，
怎么写都像电子琴。GM 音色库里的 String Ensemble / Choir / Timpani / French Horn
是真实采样，写对音符就自然「宏大」。

结构靠三样东西做出起伏：
  1. 分层进场：低音 → 弦乐 → 合唱 → 定音鼓 → 铜管 → 圆号旋律
  2. CC11（表情）自动化：同一层在段落间做 35 → 105 的渐强
  3. 留白：进入高潮前抽掉一整小节

输出 menu.mid / duel.mid（4/4，480 ticks/beat）
"""
import sys, os
import mido
from mido import Message, MidiFile, MidiTrack, MetaMessage, bpm2tempo

TICKS = 480
BAR = TICKS * 4

# GM 音色
INST = {
    "bass":   (0, 43),   # Contrabass
    "celli":  (1, 42),   # Cello
    "str":    (2, 48),   # String Ensemble 1
    "str2":   (3, 49),   # String Ensemble 2
    "choir":  (4, 52),   # Choir Aahs
    "timp":   (5, 47),   # Timpani
    "horn":   (6, 60),   # French Horn
    "brass":  (7, 61),   # Brass Section
    "perc":   (9, 0),    # 打击乐通道
}

NOTE = {"C": 0, "D": 2, "Eb": 3, "E": 4, "F": 5, "G": 7, "A": 9, "Bb": 10, "B": 11}
def n(name, octv):
    return 12 * (octv + 1) + NOTE[name]

#  i–VI–III–VII：Dm – Bb – F – C
PROG = [
    dict(root="D",  chord=[("D", 3), ("F", 3), ("A", 3)], bass=("D", 2)),
    dict(root="Bb", chord=[("Bb", 3), ("D", 4), ("F", 3)], bass=("Bb", 1)),
    dict(root="F",  chord=[("F", 3), ("A", 3), ("C", 4)], bass=("F", 2)),
    dict(root="C",  chord=[("C", 4), ("E", 3), ("G", 3)], bass=("C", 2)),
]


class Score:
    def __init__(self, bpm):
        self.ev = []
        self.bpm = bpm
        self.seq = 0

    def _add(self, tick, msg):
        self.seq += 1
        self.ev.append((max(0, int(tick)), self.seq, msg))

    def prog(self, ch, program):
        self._add(0, Message("program_change", channel=ch, program=program))

    def cc(self, ch, num, val, tick):
        self._add(tick, Message("control_change", channel=ch, control=num, value=int(max(0, min(127, val)))))

    def note(self, ch, pitch, start, dur, vel=80):
        self._add(start, Message("note_on", channel=ch, note=int(pitch), velocity=int(max(1, min(127, vel)))))
        self._add(start + max(8, int(dur)), Message("note_off", channel=ch, note=int(pitch), velocity=0))

    def chord(self, ch, pitches, start, dur, vel=80):
        for p in pitches:
            self.note(ch, p, start, dur, vel)

    def save(self, path):
        mid = MidiFile(type=1)
        mid.ticks_per_beat = TICKS
        # tempo 轨
        meta = MidiTrack(); mid.tracks.append(meta)
        meta.append(MetaMessage("set_tempo", tempo=bpm2tempo(self.bpm), time=0))
        meta.append(MetaMessage("time_signature", numerator=4, denominator=4, time=0))
        meta.append(MetaMessage("track_name", name="score", time=0))
        # 按通道分轨（便于调试，也避免 delta 计算错乱）
        chans = {}
        for tick, seq, msg in sorted(self.ev, key=lambda e: (e[0], e[1])):
            chans.setdefault(msg.channel, []).append((tick, msg))
        for ch, events in sorted(chans.items()):
            tr = MidiTrack(); mid.tracks.append(tr)
            tr.append(MetaMessage("track_name", name=f"ch{ch}", time=0))
            last = 0
            for tick, msg in events:
                tr.append(msg.copy(time=tick - last))
                last = tick
        mid.save(path)
        return path


def ramp(sc, ch, v0, v1, tick0, tick1, steps=16):
    for i in range(steps + 1):
        t = tick0 + (tick1 - tick0) * i / steps
        v = v0 + (v1 - v0) * i / steps
        sc.cc(ch, 11, v, int(t))


def build_menu():
    bpm = 62
    sc = Score(bpm)
    for k, (ch, pr) in INST.items():
        sc.prog(ch, pr)
    # 通道音量/混响送出
    for k, (ch, pr) in INST.items():
        vol = {"bass": 92, "celli": 70, "str": 95, "str2": 82, "choir": 78,
               "timp": 96, "horn": 84, "brass": 86, "perc": 88}[k]
        rev = {"bass": 30, "celli": 70, "str": 96, "str2": 104, "choir": 110,
               "timp": 88, "horn": 96, "brass": 92, "perc": 80}[k]
        sc.cc(ch, 7, vol, 0)
        sc.cc(ch, 91, rev, 0)
        sc.cc(ch, 11, 40, 0)

    ch = {k: v[0] for k, v in INST.items()}
    bar = BAR
    bars = 12
    chord_of = lambda i: PROG[(i // 2) % 4]

    for b in range(bars):
        t0 = b * bar
        c = chord_of(b)
        pitches = [n(nm, oc) for nm, oc in c["chord"]]
        # ---- 弦乐：整段持续，长短按小节
        vel = 58 if b < 2 else (52 if b < 4 else (58 if b < 6 else (30 if b == 6 else (78 if b < 9 else (92 if b < 11 else 56)))))
        sc.chord(ch["str"], pitches, t0, bar * 0.98, vel)
        if b >= 2:   # 高八度弦乐
            sc.chord(ch["str2"], [p + 12 for p in pitches], t0, bar * 0.9, vel - 10)
        if b >= 4 and b != 6:
            sc.chord(ch["choir"], [p + 12 for p in pitches[1:]], t0, bar * 0.95, vel - 16)
        # ---- 低音：前段长音，B 段起改成四分音符脉冲
        if b < 4:
            sc.note(ch["bass"], n(*c["bass"]), t0, bar * 0.95, 50 if b < 2 else 62)
        elif b != 6:
            for q in range(4):
                sc.note(ch["bass"], n(*c["bass"]), t0 + q * TICKS, TICKS * 0.8, 74)
        # ---- 定音鼓
        if b >= 4 and b != 6:
            hits = [0] if b < 7 else [0, 2 * TICKS]
            for h in hits:
                sc.note(ch["timp"], n("D", 2), t0 + h, TICKS * 0.9, 86 if b >= 7 else 70)
            if b >= 9:
                sc.note(ch["timp"], n("A", 2), t0 + 3 * TICKS + 240, TICKS * 0.5, 72)
        # ---- 铜管 swell（2 小节一次，只在高潮段）
        if b in (7, 9):
            sc.chord(ch["brass"], [p + 12 for p in pitches], t0, bar * 1.9, 62)
            ramp(sc, ch["brass"], 40, 96, t0, t0 + bar * 2)
        # ---- 段落重音
        if b in (4, 7, 9):
            sc.note(ch["perc"], 49, t0, TICKS * 2, 78)     # crash
            sc.note(ch["perc"], 47, t0, TICKS, 84)         # low tom
        # ---- 留白小节
        if b == 6:
            sc.cc(ch["str"], 11, 26, t0)
            sc.cc(ch["str2"], 11, 20, t0)

    # 表情自动化：情绪曲线
    ramp(sc, ch["str"], 56, 70, 0, 4 * bar)
    ramp(sc, ch["str"], 66, 84, 4 * bar, 7 * bar)
    ramp(sc, ch["str"], 26, 96, 7 * bar, 9 * bar)
    ramp(sc, ch["str"], 96, 104, 9 * bar, 11 * bar)
    ramp(sc, ch["str"], 104, 40, 11 * bar, 12 * bar)
    ramp(sc, ch["str2"], 30, 70, 2 * bar, 7 * bar)
    ramp(sc, ch["str2"], 20, 94, 7 * bar, 9 * bar)
    ramp(sc, ch["choir"], 34, 78, 4 * bar, 9 * bar)
    ramp(sc, ch["choir"], 78, 30, 11 * bar, 12 * bar)

    # ---- 圆号主题：只在高潮段（第 9-11 小节）
    mel = [("D", 4, 0, 2), ("F", 4, 2, 1), ("G", 4, 3, 1),
           ("A", 4, 4, 2), ("G", 4, 6, 1), ("F", 4, 7, 1),
           ("E", 4, 8, 2), ("D", 4, 10, 1), ("C", 4, 11, 1)]
    for nm, oc, beat_, dur in mel:
        sc.note(ch["horn"], n(nm, oc), 8 * bar + beat_ * TICKS, dur * TICKS * 0.95, 82)
    return sc


def build_duel():
    bpm = 100
    sc = Score(bpm)
    for k, (ch, pr) in INST.items():
        sc.prog(ch, pr)
    for k, (ch, pr) in INST.items():
        vol = {"bass": 96, "celli": 74, "str": 98, "str2": 80, "choir": 74,
               "timp": 100, "horn": 84, "brass": 90, "perc": 90}[k]
        sc.cc(ch, 7, vol, 0)
        sc.cc(ch, 91, 84, 0)
        sc.cc(ch, 11, 70, 0)

    ch = {k: v[0] for k, v in INST.items()}
    bar = BAR
    bars = 16
    chord_of = lambda i: PROG[(i // 2) % 4]

    for b in range(bars):
        t0 = b * bar
        c = chord_of(b)
        pitches = [n(nm, oc) for nm, oc in c["chord"]]
        rest = b == 9
        peak = 13 <= b <= 14
        intro = b < 4
        build = 4 <= b < 8
        full = 10 <= b <= 12
        vel = 40 if rest else (96 if peak else (88 if full else (74 if build else 62)))
        loud = 66 if intro else (78 if build else (92 if full else (104 if peak else 50)))
        # 弦乐短促和弦（每拍一次，像弦乐组拉弓）——前 4 小节弦乐不进，留给低音
        if (not rest) and (not intro):
            for q in range(4):
                sc.chord(ch["str"], pitches, t0 + q * TICKS, TICKS * 0.55, vel)
            sc.chord(ch["str2"], [p + 12 for p in pitches], t0, bar * 0.9, vel - 12)
        # 低音八分音符 ostinato
        if not rest:
            for e in range(8):
                sc.note(ch["bass"], n(*c["bass"]), t0 + e * TICKS // 2, TICKS * 0.42, loud)
        # 定音鼓
        if not rest:
            hits = [0, 2 * TICKS] if not peak else [0, TICKS + 240, 2 * TICKS, 3 * TICKS + 240]
            for h in hits:
                sc.note(ch["timp"], n("D", 2), t0 + h, TICKS * 0.8, 92)
        # 铜管和弦
        if (b >= 6) and (not rest):
            sc.chord(ch["brass"], [p + 12 for p in pitches], t0, TICKS * 1.2, 84 if peak else (72 if full else 52))
        # 合唱
        if peak:
            sc.chord(ch["choir"], [p + 12 for p in pitches], t0, bar * 0.95, 66)
        if b in (6, 9, 13):
            sc.note(ch["perc"], 49, t0, TICKS * 2, 96)
            sc.note(ch["perc"], 35, t0, TICKS, 92)
    # 圆号：高音长音，只在 10-13 小节
    for i, (nm, oc) in enumerate([("D", 4), ("F", 4), ("A", 4), ("G", 4)]):
        sc.note(ch["horn"], n(nm, oc), (10 + i) * bar, bar * 0.95, 88)
    # 结尾 turnaround：抽掉鼓，留弦乐与低音
    for b in (14, 15):
        sc.cc(ch["timp"], 7, 0, b * bar)
        sc.cc(ch["brass"], 7, 40, b * bar)
    return sc


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    for name, fn in (("menu", build_menu), ("duel", build_duel)):
        p = os.path.join(out, f"{name}.mid")
        fn().save(p)
        mid = MidiFile(p)
        print(f"{name}.mid  {mid.length:.1f}s  tracks={len(mid.tracks)}  -> {p}")
