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
