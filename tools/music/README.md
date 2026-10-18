# 音乐与音效

## BGM
1. `make_midi.py` —— 用 Python 写 MIDI（4/4、480 ticks/beat），分轨为低音提琴 / 大提琴 /
   弦乐组 / 合唱 / 定音鼓 / 圆号 / 铜管 / 打击乐。起伏来自「分段进场 + CC11 表情自动化 +
   高潮前留白」。
2. `fluidsynth` —— 用 GeneralUser GS 渲染：
   `ash
   fluidsynth -ni -F menu.wav -r 44100 -g 0.55 \
     -o synth.reverb.active=1 -o synth.reverb.room-size=0.88 \
     -o synth.reverb.level=0.72 -o synth.chorus.active=1 \
     GeneralUser.sf2 menu.mid
   `
3. `master.py` —— 补超低频（频率量化到循环长度内整数周期，接缝不断）、空气层、轻微提亮、
   首尾交叉淡化，归一化到 -1.5 dBFS。
4. `ffmpeg -c:a libvorbis -q:a 3` 转 OGG。

改曲子：改 `make_midi.py` 里的 PROG（和弦进行）、各段 velocity、`mel`（圆号主题），重跑三步。

## 苏苏 · 战斗曲《赤色铁流》

`public/audio/bgm/susu.ogg`（1:55，D 小调（和声小调）→ 高潮升全音到 E 小调 / 120 BPM）。
苏苏参战（自己用或对手用）时由 `public/js/game-ui.js` 切到这首。

**成品是 fluidsynth + SoundFont 渲的**（和本目录另外两首同一条链路），
`susu_theme.py` 里的 numpy 合成只作兜底/离线试听。

```
# 1. 出 MIDI
python -c "import sys;sys.path.insert(0,'tools/music');import susu_theme as T;T.build();T.write_midi('tools/music/susu.mid',T.EV)"
# 2. 真音源渲染
fluidsynth -ni -F .tmp/susu_gm.wav -r 44100 -g 0.45 MuseScore_General.sf3 tools/music/susu.mid
# 3. 母带（静态增益 + alimiter，别用 loudnorm）
ffmpeg -y -i .tmp/susu_gm.wav -af "…见 docs/susu-battle-theme.md…" -c:a libvorbis -q:a 4 public/audio/bgm/susu.ogg
```

- **写法**：苏联军旅歌那一套——和声小调的升七级（`A7` 里的 C#）、四小节一句落属和弦、
  附点起句、同头变尾。不是史诗配乐，所以没有踩镲、没有失真、没有锯齿波。
- **高潮**：第 40 小节起整体升两个半音（Dm → Em），配小号高八度、全奏、32 分滚奏、
  颤音弦乐、52–53 小节「断—砸」。只有音量变化的段落不叫高潮。
- **音色**：全部走 GM 采样（钢琴 / 圆号 / 手风琴 / 小号 / 弦乐 / 颤音弦乐 / 合唱 /
  拨弦低音 / 定音鼓 / 军鼓 / 底鼓），推子在同文件 `MIX`（CC7/CC10/CC91 写进 MIDI）。
- **力度**：`section_level()` 按小节给整段乘系数（前奏 0.52 → 高潮 1.18/1.26），
  只管「起伏」，别和 `MIX` / `GAIN`（配器推子）混。
- **母带**：静态增益 + `alimiter`（记得 `level=disabled`），**不要用 `loudnorm`**——
  它会把段落起伏压平。成品 I≈-15 LUFS / TP≈-1.5 dBFS / LRA≈16.7 LU。
- **改曲子**：`VERSE_MEL` / `VERSE_MEL2` / `CHOR_MEL` / `BRK_MEL` 是旋律表，
  格式 `(小节内第几拍, 拍数, 音名)`；`VERSE8` / `CHOR8` / `BRK8` 是和声进行；
  升调在 `build()` 末尾；段落区间也在 `build()` 里。

歌词与结构说明见 `docs/susu-battle-theme.md`。

## 音效
- 打击 / 摩擦类用 Kenney CC0 采样，播放时降调 6~10%、4.2kHz 低通、压音量，再叠正弦身体。
- 选牌 / 金币 / 回合等音阶性提示音由 `public/js/audio.js` 实时合成（低通 + 混响）。