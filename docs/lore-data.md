# 设定数据说明

游戏里的图鉴、以及以后的剧情模式，都读取同一份设定数据：`shared/lore.js`。
原始设定集（作者的设定图鉴网页）存档在 `docs/lore-source.html`，需要整体更新设定时，
用设定集里的 `PEOPLE` 和 `WORLD` 重新生成 `lore.js` 即可。

## 数据结构

```js
DuelLore.PEOPLE    // 人物数组
DuelLore.WORLD     // 世界观原文（Markdown）
DuelLore.TIERS     // 梯队顺序
DuelLore.person(id)// 按 id 取人物
```

每个人物：

| 字段 | 含义 |
|---|---|
| `id` / `name` | 唯一标识（目前等于名字） |
| `look` | 外貌 |
| `bg` | 背景（身份、经历、政治关系、事件） |
| `deck` | 卡组特色（流派、机制、打法） |
| `tag` | 一句话流派标签 |
| `factions` | 势力标签 |
| `tier` | 梯队：顶尖 / 第二 / 第三 / 第四 / 旧大陆 / 未知 |
| `note` | 备注 |

## 与游戏卡牌师的对应

可使用的 8 位卡牌师（苏苏、字母、七星、核弹、猪瘟鱼、八幡、045、下水）的名字
与 `DuelCards.PROFILES` 的键完全一致，所以 `DuelLore.person(heroName)` 可以直接取到档案。

## 做剧情模式时可以复用的东西

- **对手**：剧情关卡可以直接指定 `hero`（卡牌师）和 `deck`（卡牌 id 列表，需通过 `DuelCards.deckError`）。
  规则引擎 `shared/engine.js` 的 `new Game({players:[...]})` 不依赖联机，单机本地即可运行。
- **电脑难度**：`new AIPlayer("easy" | "normal" | "hard")`。
- **特殊规则**：引擎里的 `Game` 是纯数据对象，剧情关卡可以在开局后直接修改玩家状态
  （生命、费用、初始场面），再用 `viewFor` / 现有界面渲染，参考 `test/rules.js` 的写法。
- **进度存档**：可以参考 `public/js/decks.js` 的 localStorage 写法；如果以后加账号，
  再迁移到服务端。
