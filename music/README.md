# 皇冠对决 · 原声配乐（Original Soundtrack）

这里是**谱**，不是音频。`midi/` 里是四首曲子的多轨 MIDI（旋律、和声、对位、鼓、力度与表情曲线都已写好），
用真实音源渲染后才是成品。曲子本身由 `tools/music/score/crown_duel_suite.py` 生成，改谱改它或直接改 MIDI 都行。

> 关于「真正的配乐」：程序合成再怎么调都是电子味；想要真实的弦乐与钢琴，必须是**好谱 + 真实音源**。
> 这套谱的任务是把音乐本身（旋律、和声、结构、配器）写对，音色交给采样库。

## 曲目

| 文件 | 用途 | 速度 / 长度 | 说明 |
|---|---|---|---|
| `01_main_theme.mid` | 主菜单 / 大厅（可循环） | 66 BPM · 24 小节 · 约 88 s | Intro → A（动机 A）→ B（弦乐升腾）→ Outro 回到 Intro |
| `02_duel.mid` | 对局战斗（可循环） | 120 BPM · 48 小节 · 96 s | A 弦乐 ostinato → A′ 升八度 → B 紧张上行 → C 高潮 → Break → Return |
| `03_victory.mid` | 胜利 stinger | 96 BPM · 6 小节 · 约 17 s | 动机 A 转 D 大调（皮卡迪三度），金钟收尾 |
| `04_defeat.mid` | 失败 stinger | 60 BPM · 5 小节 · 约 22 s | 动机 A 倒影下行，终于空五度 D–A |

## 音乐语言（为什么它们是一套）

调性 **D 小调**（自然小调 / 多利亚色彩，终止式用 C♯ 导音）。三个动机贯穿全套：

- **A「皇冠」** 上行纯五度再级进回落：`A4 ─ D5 F5`。主题曲的主旋律；战斗高潮里与 B 叠加；胜利中变大调；失败中倒影下行。
- **B「对决」** 重复音起势 + 附点：`A A D(附点) F E D`。战斗曲的节奏骨架。
- **C「金钟」** 高音区 `G6 A6 D7` 三音（celesta / 钟琴），只在终止式与高点出现——对应视觉里的**金色**点缀。失败曲里只剩单音。

情绪与视觉对应：深炭底 = 低弦与暗色铺底；点阵 = 16 分音符 tick / 合成脉冲；十字定位 = 钢琴清晰的琶音；叠影 = 小提琴 II 与钢琴对旋律的八度呼应。

## 曲式

**01 主题曲**（和声：`Dm Bb Gm Asus | Dm Bb Gm A7 Dm Bb C A7 | Bb F Gm Dm Bb C Asus A7 | Dm Bb Gm A7`）

| 小节 | 段落 | 内容 |
|---|---|---|
| 1–4 | Intro | 钢琴单线 + 合成铺底淡入 |
| 5–12 | A | 大提琴（低八度）+ 小提琴 II 奏动机 A；钢琴 8 分琶音；竖琴上行滑奏；celesta 回声 |
| 13–20 | B | 小提琴 I 升到高音区唱长线；大提琴对位；合成脉冲 + 点阵 tick + 轻 kick 入场 |
| 21–24 | Outro | 回落，停在 A7，接回小节 1 |

**02 战斗**（A/A′ 每小节一和弦 `Dm Bb Gm A7`；B 段 `Bb C Dm A7`；C 段 `Dm Bb Gm A7 Dm Bb C A7` ×2）

| 小节 | 段落 | 内容 |
|---|---|---|
| 1–8 | A | 大提琴/中提琴 16 分 ostinato、合成低音、鼓；小提琴 I 轻奏动机 B |
| 9–16 | A′ | 动机 B 升八度，小提琴 II 在反拍补和声，钢琴反拍 stab，合成 arp 入场 |
| 17–24 | B | 小提琴长音渐强上行，军鼓渐密，最后一小节 16 分滚奏 |
| 25–40 | C | 动机 A（小提琴 I）+ 钢琴 + 小提琴 II 低八度；tom 滚奏；金钟 |
| 41–44 | Break | 只剩钢琴与 riser，军鼓 fill |
| 45–48 | Return | 回到 A，停在 A7 以便循环 |

## 轨道与建议音源

MIDI 用 GM 音色号做占位，**导入后请替换**为下表的真实音源。每轨已写好 CC7 音量 / CC10 声像 / CC91 混响送出 / CC11 表情（弦乐的渐强都在 CC11 上，音源要响应它）。

| 轨 | GM 占位 | 建议真实音源 | 演奏法 |
|---|---|---|---|
| Piano | 0 | 三角钢琴（柔和、略暗） | 每小节已写延音踏板 CC64 |
| Violin I / II | 40 | 室内乐小提琴 | 主题段 legato；战斗 ostinato 用 spiccato / staccato |
| Viola | 41 | 中提琴 | 长音铺底 / 战斗 spiccato |
| Cello | 42 | 大提琴 | 主题段 legato 旋律；战斗 ostinato 用 staccato |
| Contrabass | 43 | 低音提琴 | 长音；音域已按 E1 以上写 |
| Harp | 46 | 竖琴 | 滑奏已写成 32 分音符上行 |
| Celesta (Gold Bell) | 8 | 钟琴 / celesta | 金色点缀，保持干净清脆 |
| Synth Pad | 89 | 暖色铺底合成器（如 Surge XT 的 pad） | 慢起音，CC11 控制开合 |
| Synth Pulse / Pluck | 81 | 短促 pluck / saw | CC74 已写滤波开合，请映射到合成器的 cutoff |
| Synth Bass | 38 | 干净的 sub + 轻失真 | 8 分音符，反拍留白 |
| Percussion / Drums | 通道 10 | 声学小鼓组 + 电子 tick 叠加 | hat 力度是「半调点阵」的起伏，不要量化压平 |

## 零基础的免费上手路径（你说目前没有音乐软件）

1. **先听个大概（0 分钟）**：Windows 上直接双击 `.mid` 能用系统自带的 GS Wavetable 播放，音色很差，只能听旋律与结构。
2. **想听到像样的声音（免费）**：安装 **MuseScore**（免费，打开 MIDI 就能看谱、改谱、播放，并可下载其免费音源 Muse Sounds）；
   或安装 **REAPER**（有免费试用期）配合免费音源（例如 Spitfire LABS 的钢琴 / 弦乐、BBC Symphony Orchestra Discover）。
   具体下载页与授权请以官网当前说明为准。
3. **渲染循环 BGM**：在 DAW 里把 `01`、`02` 渲染成 WAV，**多渲染 3 秒混响尾巴**，再把尾巴折回开头（或在循环点做 5 ms 交叉淡化），
   转成 OGG 放到 `public/audio/bgm/menu.ogg`、`duel.ogg`。
4. **stinger**：`03`、`04` 渲染后分别命名为 `public/audio/sfx/win.ogg`、`lose.ogg`，`audio.js` 已按这两个名字加载。

## 已接入游戏（当前状态）

`music/preview/*.ogg` 是用 FluidSynth + GeneralUser GS 渲染的试听版，已确认采用：
- `01_main_theme` → `public/audio/bgm/menu.ogg`（按 66 BPM × 96 拍 = 87.27 s 精确裁切，混响尾巴折回开头，5 ms 淡化，可无缝循环）
- `02_duel` → `public/audio/bgm/duel.ogg`（120 BPM × 192 拍 = 96.0 s，同样处理）
- `03_victory` / `04_defeat` → `public/audio/sfx/win.ogg` / `lose.ogg`

重渲染：`tools/music/.bin/` 放 FluidSynth（官方 release 的 win10-x64 包）与 `GeneralUser-GS.sf2`，
`fluidsynth -ni -F out.wav -r 44100 -g 0.6 -o synth.reverb.active=1 -o synth.reverb.room-size=0.7 -o synth.reverb.level=0.6 -o synth.chorus.active=1 GeneralUser-GS.sf2 xx.mid`，
再按上面的长度裁切、折尾巴。以后换成更好的音源（见上节）渲染时，覆盖这四个文件即可。

## 之后可以继续做

- 大厅 / 房间的低强度环境曲（`01` 的 Intro + A 缩减版）、剧情模式（八幡章）的专属主题（可用动机 A 的变奏）。
- 按你听到的感受改谱：节奏太满、旋律不够抓耳、某段情绪不对，直接告诉我哪一首的哪几个小节，我改谱重新生成。
