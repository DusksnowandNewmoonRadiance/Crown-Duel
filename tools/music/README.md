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

## 音效
- 打击 / 摩擦类用 Kenney CC0 采样，播放时降调 6~10%、4.2kHz 低通、压音量，再叠正弦身体。
- 选牌 / 金币 / 回合等音阶性提示音由 `public/js/audio.js` 实时合成（低通 + 混响）。