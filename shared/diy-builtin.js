/* ============================================================
   内置 DIY 角色：苍蓝
   - 来自作者的 Duel 版本（30 血 / 神系召唤 · 抽牌续航 · 后期爆发）
   - 原版用了 5 个专属引擎机制（神罚洗抽、机械眼随机攻击等），
     DIY 沙盒只能用通用机制拼装，因此这里是「同一套壳、通用机制复刻」：
     低费信徒撑场 + 大量抽牌 + 嘲讽圣堂 + 终焉直伤 + 治疗护甲拖后期
   - 数值已按 DIY 强度标尺压过（DIY 池独立，不参与原版匹配）
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DuelDiyBuiltin = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const canglan = {
    schema: 1,
    name: "苍蓝",
    faction: "神谕诸国 · 架子班",
    style: "神系召唤 · 抽牌续航 · 后期爆发",
    hp: 30,
    color: "#5ab4ff",
    cards: [
      { id: "blue_believer", name: "苍蓝·信徒", cost: 1, kind: "unit", atk: 2, hp: 1, text: "", art: "◇", n: 4, limit: 4 },
      { id: "blue_prayer", name: "苍蓝·祷文", cost: 1, kind: "spell", effect: "draw1", text: "抽 1 张牌。", art: "✧", n: 4, limit: 4 },
      { id: "blue_initiate", name: "苍蓝·见习祭司", cost: 2, kind: "unit", atk: 1, hp: 3, taunt: true, text: "嘲讽。", art: "◆", n: 4, limit: 4 },
      { id: "blue_ward", name: "苍蓝·圣盾", cost: 2, kind: "spell", effect: "armor3draw", text: "获得 3 点护甲，抽 1 张牌。", art: "⛨", n: 3, limit: 4 },
      { id: "blue_hymn", name: "苍蓝·圣歌", cost: 2, kind: "spell", effect: "heal3draw", text: "恢复 3 点生命，抽 1 张牌。", art: "♪", n: 3, limit: 4 },
      { id: "blue_acolyte", name: "苍蓝·侍僧", cost: 2, kind: "unit", atk: 2, hp: 2, effect: "draw1", text: "部署：抽 1 张牌。", art: "✚", n: 3, limit: 4 },
      { id: "blue_seer", name: "苍蓝·预言者", cost: 3, kind: "unit", atk: 2, hp: 4, effect: "draw1", text: "部署：抽 1 张牌。", art: "◇", n: 3, limit: 4 },
      { id: "blue_sanctum", name: "苍蓝·圣堂", cost: 3, kind: "unit", atk: 2, hp: 5, taunt: true, text: "嘲讽。", art: "▥", n: 3, limit: 4 },
      { id: "blue_sermon", name: "苍蓝·布道", cost: 3, kind: "spell", effect: "draw2", text: "抽 2 张牌。", art: "⌘", n: 2, limit: 4 },
      { id: "blue_barrier", name: "苍蓝·神谕壁垒", cost: 3, kind: "spell", effect: "armor2", text: "获得 2 点护甲。", art: "⛨", n: 2, limit: 4 },
      { id: "blue_void", name: "苍蓝·虚空祈愿", cost: 4, kind: "spell", effect: "draw3", text: "抽 3 张牌。", art: "✧", n: 1, limit: 4 },
      { id: "blue_archon", name: "苍蓝·圣座", cost: 5, kind: "unit", atk: 5, hp: 6, taunt: true, text: "嘲讽。", art: "♛", n: 2, limit: 4 },
      { id: "blue_apocalypse", name: "苍蓝·终焉", cost: 6, kind: "spell", effect: "damage6", text: "对敌方英雄造成 6 点伤害。", art: "☄", n: 1, limit: 2 },
      { id: "blue_mech_eye", name: "苍蓝·机械眼", cost: 2, kind: "unit", atk: 2, hp: 2, taunt: true, text: "嘲讽。", art: "◉", n: 2, limit: 4 },
    ],
  };

  return { heroes: [canglan] };
});
