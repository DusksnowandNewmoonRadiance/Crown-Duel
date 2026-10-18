# 音乐与音效

## 当前方案：「蓝图」主题（v3.4）
`blueprint_audio.py` —— 纯 numpy/scipy 离线合成，**无需 fluidsynth / ffmpeg / 采样库**，用 soundfile 直接写 OGG。

```bash
pip install numpy scipy soundfile
python tools/music/blueprint_audio.py              # 全部（21 个音效 + 2 首 BGM）
python tools/music/blueprint_audio.py --only sfx   # 只重做音效
python tools/music/blueprint_audio.py --only bgm   # 只重做 BGM
python tools/music/blueprint_audio.py --name hit   # 只重做某一个
```

声音设定对应视觉：D 多利亚调式；马林巴 / FM 拨奏 + 玻璃钟（金色点缀）；16 分 tick 噪点 = 半调点阵；
乒乓延迟 = 镜像倒影；UI 提示音是干净的 sine 双音 + 极短混响 = 十字定位。
- `menu.ogg`：32 s / 60 BPM / 8 小节，Dm–Bb–Gm–A，稀疏马林巴 + 软 kick + 点阵 tick。
- `duel.ogg`：34 s / 112 BPM / 16 小节，sub 脉冲 + kick/clap + 16 分琶音拨奏，每 4 小节金钟 + riser。
- BGM 尾巴混响折回开头并做 5 ms 微淡化，循环无缝。
- 改曲：改脚本里 `CH`（和弦表）、`render_menu / render_duel` 的 `prog` 与各层电平后重跑。
- 音效相对电平在各 `fx_*` 的 `finalize(..., peak_db)`：提示音 -8~-10 dB，打击 -3~-5 dB。

## 旧方案（v3.2，已弃用）
`make_midi.py` + `master.py`：写 MIDI → fluidsynth + GeneralUser GS 渲染 → 补低频 / 无缝循环 → ffmpeg 转 OGG。
音效曾使用 Kenney CC0 采样。两个脚本保留作参考，不再被产物引用。

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
