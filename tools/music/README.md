# 音乐与音效是怎么来的

## BGM
1. `make_midi.py` —— 用 Python 写 MIDI：4/4、480 ticks/beat，分轨为
   低音提琴 / 大提琴 / 弦乐组 / 合唱 / 定音鼓 / 圆号 / 铜管 / 打击乐。
   起伏来自「分段进场 + CC11 表情自动化 + 高潮前留白」。
2. `fluidsynth` —— 用 **GeneralUser GS** 音色库渲染（自带 reverb/chorus）：
   `ash
   fluidsynth -ni -F menu.wav -r 44100 -g 0.55 \
     -o synth.reverb.active=1 -o synth.reverb.room-size=0.88 \
     -o synth.reverb.level=0.72 -o synth.chorus.active=1 \
     GeneralUser.sf2 menu.mid
   `
3. `master.py` —— 补超低频（频率量化到循环长度内整数周期，保证接缝不断）、
   空气层、轻微提亮、首尾交叉淡化，最后归一化到 -1.5 dBFS。
4. `ffmpeg -c:a libvorbis -q:a 3` 转 OGG。

想改曲子：改 `make_midi.py` 里的 PROG（和弦进行）、各段 velocity、mel 数组（圆号主题），
重跑三步即可，全程不需要任何采样素材。

## 音效
- 打击 / 摩擦类用 Kenney CC0 采样（见 `public/audio/LICENSE.txt`），播放时统一
  降调 6~10%、4.2kHz 低通、压音量，再叠一层正弦身体。
- 选牌 / 金币 / 回合这类音阶性的提示音仍由 `public/js/audio.js` 实时合成——
  采样包里的 UI 音大多是 4~6kHz 的电子提示音，用在这里反而廉价。