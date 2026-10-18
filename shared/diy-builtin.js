/* ============================================================
   内置 DIY 角色：苍蓝
   - 来自作者的 Duel 版本（30 血 / 神系召唤 · 抽牌续航 · 后期爆发）
   - 神罚体系用 DIY 白名单里的通用机制复刻：
     神罚（抽到自动：自伤 1 + 抽 1）、神谕壁垒（按敌方神罚数叠甲）、
     神罚共鸣（往两边牌库塞神罚）、圣光牵引（临时策反 +1/+4）、机械眼（回合开始自动开火）
   - 其余位置用通用机制（抽牌 / 嘲讽 / 直伤）补足 40 张
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
    style: "神系召唤 · 神罚侵蚀 · 抽牌续航",
    hp: 30,
    color: "#5ab4ff",
    cards: [
      { id: "blue_believer", name: "苍蓝·信徒", cost: 1, kind: "unit", atk: 2, hp: 1, text: "", art: "◇", n: 4, limit: 4 },
      { id: "blue_prayer", name: "苍蓝·祷文", cost: 1, kind: "spell", effect: "draw1", text: "抽 1 张牌。", art: "✧", n: 4, limit: 4 },
      { id: "blue_initiate", name: "苍蓝·见习祭司", cost: 2, kind: "unit", atk: 1, hp: 3, taunt: true, text: "嘲讽。", art: "◆", n: 4, limit: 4 },
      { id: "blue_ward", name: "苍蓝·圣盾", cost: 2, kind: "spell", effect: "armor3draw", text: "获得 3 点护甲，抽 1 张牌。", art: "⛨", n: 4, limit: 4 },
      { id: "blue_hymn", name: "苍蓝·圣歌", cost: 2, kind: "spell", effect: "heal3draw", text: "恢复 3 点生命，抽 1 张牌。", art: "♪", n: 4, limit: 4 },
      { id: "blue_acolyte", name: "苍蓝·侍僧", cost: 2, kind: "unit", atk: 2, hp: 2, effect: "draw1", text: "部署：抽 1 张牌。", art: "✚", n: 4, limit: 4 },
      { id: "blue_mech_eye", name: "苍蓝·机械眼", cost: 2, kind: "unit", atk: 2, hp: 2, taunt: true, effect: "diyMechEye", text: "嘲讽。在你的回合开始时，随机攻击一个敌方目标。", art: "◉", n: 4, limit: 4 },
      { id: "blue_story", name: "尘封故事", cost: 2, kind: "spell", effect: "draw2", text: "抽 2 张牌。", art: "❖", n: 3, limit: 4 },
      { id: "blue_seer", name: "苍蓝·预言者", cost: 3, kind: "unit", atk: 2, hp: 4, effect: "draw1", text: "部署：抽 1 张牌。", art: "◇", n: 3, limit: 4 },
      { id: "blue_sanctum", name: "苍蓝·圣堂", cost: 3, kind: "unit", atk: 2, hp: 5, taunt: true, text: "嘲讽。", art: "▥", n: 3, limit: 4 },
      { id: "blue_barrier", name: "苍蓝·神谕壁垒", cost: 3, kind: "spell", effect: "diyBarrier", text: "获得等同于敌方牌库中【神罚】数量的护甲。", art: "⛨", n: 3, limit: 4 },
      { id: "blue_sermon", name: "苍蓝·布道", cost: 3, kind: "spell", effect: "draw2", text: "抽 2 张牌。", art: "⌘", n: 2, limit: 4 },
      { id: "blue_void", name: "苍蓝·虚空祈愿", cost: 4, kind: "spell", effect: "draw3", text: "抽 3 张牌。", art: "✧", n: 1, limit: 4 },
      { id: "blue_pull", name: "苍蓝·圣光牵引", cost: 4, kind: "spell", effect: "diyPull", text: "策反 1 个敌方单位（下回合返回），使其获得 +1/+4。", art: "⛓", n: 2, limit: 4 },
      { id: "blue_echo", name: "苍蓝·神罚共鸣", cost: 4, kind: "spell", effect: "diyEcho", text: "将 4 张【神罚】洗入敌方牌库，再将 2 张洗入你的牌库。", art: "✹", n: 2, limit: 2 },
      { id: "blue_archon", name: "苍蓝·圣座", cost: 5, kind: "unit", atk: 5, hp: 6, taunt: true, text: "嘲讽。", art: "♛", n: 2, limit: 4 },
      { id: "blue_apocalypse", name: "苍蓝·终焉", cost: 6, kind: "spell", effect: "damage6", text: "对敌方英雄造成 6 点伤害。", art: "☄", n: 1, limit: 2 },
    ],
  };

  return { heroes: [canglan] };
});
