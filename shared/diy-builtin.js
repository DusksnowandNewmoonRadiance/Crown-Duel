/* ============================================================
   内置 DIY 角色：苍蓝
   - 来自作者的 Duel 版本：30 血 / 神系召唤 · 抽取神罚 · 后期爆发
   - 本角色是「内置角色」，允许使用私有引擎机制（BUILTIN_EFFECTS），
     玩家上传的角色仍然只能用 31 项通用机制，见 docs/diy-heroes.md
   - 卡表与作者原版一致（41 张），改动请同步 test/diy.js 的断言
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
    style: "神系召唤 · 抽取神罚 · 后期爆发",
    hp: 30,
    color: "#5ab4ff",
    cards: [
      { id:"blueBeliever", name:"苍蓝·信徒", cost:1, kind:"unit", art:"◇", atk:2, hp:1, effect:"believerDeath", text:"亡语：获得 1 点费用。", n:4, limit:4, rarity:"common" },
      { id:"bluePrayer", name:"苍蓝·祷文", cost:1, kind:"spell", art:"✧", effect:"draw1", text:"抽 1 张牌。", n:4, limit:4, rarity:"common" },
      { id:"blueInitiate", name:"苍蓝·见习祭司", cost:2, kind:"unit", art:"◆", atk:1, hp:3, taunt:true, text:"嘲讽。", n:3, limit:3, rarity:"rare" },
      { id:"blueWard", name:"苍蓝·圣盾", cost:2, kind:"spell", art:"⛨", effect:"armor3draw", text:"获得 3 点护甲，抽 1 张牌。", n:3, limit:3, rarity:"rare" },
      { id:"blueHymn", name:"苍蓝·圣歌", cost:2, kind:"spell", art:"♪", effect:"heal3draw", text:"恢复 3 点生命，抽 1 张牌。", n:2, limit:3, rarity:"rare" },
      { id:"blueAcolyte", name:"苍蓝·侍僧", cost:2, kind:"unit", art:"✚", atk:2, hp:2, effect:"draw", text:"部署：抽 1 张牌。", n:3, limit:3, rarity:"rare" },
      { id:"dustStory", name:"尘封故事", cost:2, kind:"spell", art:"❖", effect:"azureDevelop", text:"开发 1 张【苍蓝】牌。", n:2, limit:2, rarity:"special" },
      { id:"azureJudge", name:"神罚者", cost:1, kind:"unit", art:"⚖", atk:1, hp:1, azure:true, effect:"draw", text:"部署：抽 1 张牌。", n:2, limit:2, rarity:"special" },
      { id:"azureSynth", name:"碎质合成", cost:3, kind:"spell", art:"◆", azure:true, effect:"azureSynth", text:"对一个敌方单位造成 4 点伤害，获得 1 点护甲。", n:2, limit:2, rarity:"special" },
      { id:"azureStar", name:"永恒虚星", cost:4, kind:"spell", art:"✦", azure:true, effect:"azureStar", text:"获得 10 点护甲。", n:2, limit:2, rarity:"special" },
      { id:"azureDescend", name:"机械神降", cost:4, kind:"spell", art:"⚙", azure:true, effect:"azureDescend", text:"恢复 5 点生命值，开发你牌库中的 1 张牌。", n:2, limit:2, rarity:"special" },
      { id:"divineWrath", name:"神怒", cost:2, kind:"spell", art:"⚡", effect:"divineWrath", text:"将 2 张【神罚】洗入敌方牌库。", n:2, limit:2, rarity:"special" },
      { id:"blueSeer", name:"苍蓝·预言者", cost:3, kind:"unit", art:"◇", atk:2, hp:4, effect:"draw", text:"部署：抽 1 张牌。", n:2, limit:2, rarity:"special" },
      { id:"blueSanctum", name:"苍蓝·圣堂", cost:3, kind:"unit", art:"▥", atk:2, hp:5, taunt:true, text:"嘲讽。", n:2, limit:2, rarity:"special" },
      { id:"blueSermon", name:"苍蓝·布道", cost:3, kind:"spell", art:"⌘", effect:"draw2", text:"抽 2 张牌。", n:2, limit:2, rarity:"special" },
      { id:"blueVoid", name:"苍蓝·虚空祈愿", cost:4, kind:"spell", art:"✧", effect:"draw3", text:"抽 3 张牌。", n:1, limit:2, rarity:"special" },
      { id:"blueArchon", name:"苍蓝·圣座", cost:5, kind:"unit", art:"♛", atk:5, hp:6, taunt:true, text:"嘲讽。", n:1, limit:2, rarity:"special" },
      { id:"blueApocalypse", name:"苍蓝·终焉", cost:6, kind:"spell", art:"☄", effect:"damage6", text:"对敌方英雄造成 6 点伤害。", n:1, limit:1, rarity:"elite" },
      { id:"divineBarrier", name:"苍蓝·神谕壁垒", cost:3, kind:"spell", art:"⛨", effect:"divineBarrier", text:"获得等同于敌方牌库中【神罚】数量的护甲。", n:2, limit:3, rarity:"rare" },
      { id:"divinePull", name:"苍蓝·圣光牵引", cost:4, kind:"spell", art:"⛓", effect:"divinePull", text:"策反 1 个敌方单位（限一回合，下回合返回），使其获得 +1/+4。", n:2, limit:2, rarity:"special" },
      { id:"divineEcho", name:"苍蓝·神罚共鸣", cost:4, kind:"spell", art:"✹", effect:"divineEcho", text:"将 4 张【神罚】洗入敌方牌库，再将 2 张【神罚】洗入你的牌库。", n:1, limit:1, rarity:"elite" },
      { id:"blueMechEye", name:"苍蓝·机械眼", cost:2, kind:"unit", art:"◉", atk:2, hp:2, taunt:true, effect:"mechEye", text:"嘲讽。在你的回合开始时，随机攻击一个敌方目标（消耗当回合攻击次数）。", n:2, limit:2, rarity:"special" },
      { id:"blueMechWave", name:"苍蓝·机械狂潮", cost:5, kind:"spell", art:"⚙", effect:"summonMechEyeMax", text:"召唤苍蓝机械眼，直到你的战场被填满。", n:1, limit:1, rarity:"elite" },
      { id:"summonMechDef", name:"机动防御", cost:2, kind:"spell", art:"🛡", effect:"summonMechDef", text:"召唤 1 个 2/10 的苍蓝机械眼。在你的下个回合结束时，消灭该单位。", n:2, limit:3, rarity:"rare" },
      { id:"holySmite", name:"圣光惩戒", cost:2, kind:"spell", art:"⚡", effect:"holySmite", text:"对 1 个敌方单位造成 2 点伤害。如果敌方牌库有【神罚】，改为造成 4 点伤害。", n:2, limit:3, rarity:"rare" },
      { id:"mechPriest", name:"机械神甫", cost:3, kind:"unit", art:"✝", atk:2, hp:4, effect:"mechPriest", text:"部署：召唤 1 个【苍蓝机械眼】。", n:2, limit:2, rarity:"special" },
      { id:"ascetic", name:"苦修者", cost:2, kind:"unit", art:"◈", atk:2, hp:2, effect:"ascetic", text:"每当敌方抽到【神罚】，你抽 1 张牌。", n:2, limit:2, rarity:"special" },
      { id:"purgeOrder", name:"净除指令", cost:4, kind:"spell", art:"⚖", effect:"purgeOrder", text:"消灭 1 个敌方单位。将 2 张【神罚】洗入敌方牌库。", n:2, limit:2, rarity:"special" },
      { id:"vaultDeath", name:"不朽堡垒", cost:5, kind:"unit", art:"▤", atk:4, hp:8, taunt:true, effect:"vaultDeath", text:"嘲讽。亡语：将 2 张【神罚】洗入敌方牌库。", n:1, limit:1, rarity:"elite" },
      { id:"punishArrival", name:"神罚降临", cost:6, kind:"spell", art:"☄", effect:"punishArrival", text:"召唤 1 个【圣光巨像】，其攻击力和生命值等于敌方牌库中【神罚】的数量。", n:1, limit:1, rarity:"elite" },
      { id:"beelzebub", name:"贝露佩欧露", cost:80, kind:"unit", art:"👑", atk:999, hp:999, text:"无穷大。敌方每抽 1 张牌，或部署 1 个单位时，此牌如果在你的手牌或牌库中，其费用 -2。", n:1, limit:1, rarity:"elite" },
      { id:"sacrifice", name:"献祭", cost:2, kind:"spell", art:"🩸", effect:"sacrifice", text:"消灭 1 个友方单位，抽 2 张牌。", n:2, limit:3, rarity:"rare" },
      { id:"disaster", name:"妄想天灾", cost:3, kind:"spell", art:"☄", effect:"disaster", text:"抽 1 张牌。本局对战中，你每失去过 1 个费用上限，便获得 2 点临时费用。将等量的【神罚】洗入敌方牌库。", n:1, limit:3, rarity:"rare" },
      { id:"symbiosis", name:"共生", cost:1, kind:"spell", art:"♻", effect:"symbiosis", text:"选择一个友方单位，使其获得\"亡语：获得 2 点费用并抽 1 张牌\"。", n:2, limit:4, rarity:"common" },
      { id:"extremeMission", name:"极限使命", cost:1, kind:"spell", art:"🔪", effect:"extremeMission", text:"将 1 张【无畏伤痛】加入手牌。", n:2, limit:4, rarity:"common" },
      { id:"shatteredImage", name:"破碎映像", cost:2, kind:"spell", art:"🪞", effect:"shatteredImage", text:"开发 1 张你牌库中的牌，失去 1 点费用上限。", n:2, limit:3, rarity:"rare" },
      { id:"lavaFortress", name:"熔岩骑士堡垒", cost:4, kind:"unit", art:"🌋", atk:4, hp:4, effect:"lavaFortress", text:"部署：对所有敌方单位造成 3 点伤害。若在战场最左或最右侧，改为 6 点。", n:2, limit:2, rarity:"special" },
      { id:"wizardThunder", name:"大巫师[雷]", cost:4, kind:"unit", art:"⚡", atk:4, hp:4, effect:"wizardThunder", text:"若友方有【大巫师[火]】，转换成【巫师议会】。", n:2, limit:2, rarity:"special" },
      { id:"wizardFire", name:"大巫师[火]", cost:2, kind:"unit", art:"🔥", atk:2, hp:6, effect:"wizardFire", text:"若友方有【大巫师[雷]】，转换成【巫师议会】。", n:2, limit:2, rarity:"special" },
      { id:"scoutDream", name:"侦察者的梦境", cost:5, kind:"spell", art:"🌌", effect:"scoutDream", text:"从【侦察者】【间谍鬼】【入梦】中开发一张。", n:1, limit:2, rarity:"rare" },
      { id:"warChariot", name:"赤血战车", cost:3, kind:"unit", art:"🛞", atk:3, hp:1, effect:"warChariotDeploy", text:"部署：失去 1 点费用上限。亡语：使你手牌中的所有牌费用 -1。", n:2, limit:2, rarity:"special" },
    ],
    /* 官方推荐卡组：机械眼 + 神罚 + 精英包，AI 与卡组页都用这一套 */
    deck: [
      "blueBeliever", "blueBeliever", "blueBeliever", "blueBeliever", "bluePrayer", "bluePrayer", "bluePrayer", "bluePrayer", "blueInitiate", "blueInitiate", "blueInitiate", "blueWard", "blueWard", "blueWard", "blueHymn", "blueHymn", "blueAcolyte", "blueAcolyte", "blueAcolyte", "dustStory", "dustStory", "azureJudge", "azureJudge", "azureSynth", "azureSynth", "divineWrath", "divineWrath", "blueMechEye", "blueMechEye", "summonMechDef", "summonMechDef", "mechPriest", "mechPriest", "holySmite", "holySmite", "divineBarrier", "divineBarrier", "blueMechWave", "punishArrival", "vaultDeath",
    ],
  };

  return { heroes: [canglan] };
});
