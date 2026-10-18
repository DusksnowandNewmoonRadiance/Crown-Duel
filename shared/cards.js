/* 皇冠对决 · 卡牌数据（浏览器与服务器共用）
   字段：n = 默认卡组张数，limit = 携带上限；gun = 火炮，member = 架子班成员 */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.DuelCards=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";
const MAX_BOARD=6,MAX_HAND=10,ESCAPE_TARGET=300,STEAL_UNIT=10,DECK_SIZE=40,MAX_ENERGY=10;

/* 稀有度：决定携带上限。普通 4 张 / 稀有 3 张 / 特殊 2 张 / 精英 1 张。
   特殊卡里一部分带有通用出牌特效（fx，可重复）；每张精英都有自己的出牌特效（见 shared/cardfx.js） */
const RARITY={
  common:{id:"common",name:"普通",limit:4,order:0},
  rare:{id:"rare",name:"稀有",limit:3,order:1},
  special:{id:"special",name:"特殊",limit:2,order:2},
  elite:{id:"elite",name:"精英",limit:1,order:3}
};
const RARITY_ORDER=["common","rare","special","elite"];

const PROFILES={
  "苏苏":{faction:"彗星国 · 架子班 · 鸭子系",style:"苏维埃体系 · 俄布海 · 整编爆发",hp:35,cards:[
    /* 单位：俄布海核心，统一归入俄罗斯政体（开局经【苏维埃社会主义共和国联盟】确立政体） */
    {id:"red",name:"俄罗斯布尔什维克红军",cost:2,kind:"unit",art:"★",atk:2,hp:2,text:"",rep:"rus",n:4,limit:4,rarity:"common"},
    {id:"redguard",name:"赤卫队",cost:1,kind:"unit",art:"⚑",atk:2,hp:1,text:"冲锋。",charge:true,rep:"rus",n:2,limit:3,rarity:"rare"},
    {id:"commissar",name:"苏维埃政委",cost:2,kind:"unit",art:"☭",atk:2,hp:3,text:"回收：被消灭时，把 1 张【红色动员令】放回你的手牌。",flavor:"人倒下了，命令还要传下去。",recycle:"mobilize",rep:"rus",n:2,limit:3,rarity:"rare"},
    {id:"redcharge",name:"红色突击队",cost:2,kind:"unit",art:"▶",atk:2,hp:2,text:"冲锋。",charge:true,rep:"rus",n:3,limit:4,rarity:"common"},
    {id:"redOfficer",name:"红场指挥官",cost:3,kind:"unit",art:"☭",atk:3,hp:3,text:"部署：召唤 1 个【俄布】。",effect:"summonRed1",rep:"rus",n:2,limit:2,rarity:"special",fx:"sp_strike"},
    {id:"redheavy",name:"红色重型步兵",cost:4,kind:"unit",art:"▦",atk:4,hp:5,text:"",rep:"rus",n:2,limit:2,rarity:"special"},
    {id:"kazakh",name:"哈萨克布尔什维克红军",cost:5,kind:"unit",art:"★",atk:1,hp:8,text:"嘲讽。部署：使你的所有【俄布】获得 +2/+2。",taunt:true,effect:"buffRed",rep:"rus",n:1,limit:1,rarity:"elite"},
    /* 法术：俄布生成 / 增益 / 过牌 */
    {id:"mobilize",name:"红色动员令",cost:1,kind:"spell",art:"☭",text:"召唤 1 个【俄布】。",effect:"summonRed1",n:2,limit:3,rarity:"rare"},
    {id:"vanguard",name:"先锋动员",cost:2,kind:"spell",art:"☭",text:"召唤 1 个【俄布】。抽 1 张牌。",effect:"summonRed1Draw",n:2,limit:3,rarity:"rare"},
    {id:"october",name:"十月革命",cost:3,kind:"spell",art:"☭",text:"召唤 2 个【俄布】。",effect:"summonRed2",n:3,limit:3,rarity:"rare"},
    {id:"consolidate",name:"整编令",cost:3,kind:"spell",art:"▣",text:"整编：消灭你所有的【俄布】（至少 2 个），召唤 1 个【近卫红军】，攻击力和生命值等于它们的总和。",effect:"consolidate",n:2,limit:3,rarity:"rare"},
    {id:"rally",name:"红军集结",cost:2,kind:"spell",art:"☭",text:"使你的所有【俄布】获得 +1/+1。",effect:"buffReds1",n:2,limit:3,rarity:"rare"},
    {id:"forward",name:"为了革命的胜利前进",cost:3,kind:"spell",art:"→",text:"使你的所有单位获得 +2/+2。",effect:"buffAll2",n:2,limit:2,rarity:"special",fx:"sp_bless"},
    {id:"warcom",name:"战时共产主义",cost:2,kind:"spell",art:"⇪",text:"你每控制 1 个【俄布】，抽 1 张牌。",flavor:"为了计划，总要有人付出代价。",effect:"redDraw",n:2,limit:2,rarity:"special"},
    {id:"supply",name:"后勤补给",cost:1,kind:"spell",art:"▣",text:"补给：从你的牌库中随机展示 3 张单位牌，选择 1 张加入手牌。",effect:"supplyDeck",n:2,limit:2,rarity:"special"},
    {id:"intel",name:"情报调阅",cost:2,kind:"spell",art:"◎",text:"情报：查看敌方手牌，选择 1 张封存——对手在下个回合无法打出它。若敌方没有手牌，改为召唤 1 个【俄布】。",effect:"intel",n:2,limit:2,rarity:"special"},
    {id:"intelSteal",name:"窃取情报",cost:2,kind:"spell",art:"◎",text:"情报：查看敌方牌库顶的 3 张牌，选择 1 张加入你的手牌，它会从敌方牌库中移除。",effect:"intelSteal",n:2,limit:2,rarity:"special"},
    {id:"winter",name:"冬将军",cost:4,kind:"spell",art:"❄",text:"使所有敌方单位的攻击力 -2。",effect:"enemyAtkDown",n:1,limit:1,rarity:"elite"},
    {id:"reddawn",name:"赤色黎明",cost:4,kind:"spell",art:"✹",text:"对所有敌方单位造成 2 点伤害。你每控制 1 个【俄布】，伤害 +1。",effect:"redDawn",n:1,limit:1,rarity:"elite"},
    {id:"peoplearmy",name:"人民军",cost:8,kind:"spell",art:"☭",text:"用【俄布】填满你的手牌和战场。",effect:"fillRed",n:1,limit:1,rarity:"elite"},
    {id:"awaSwap",name:"终局突袭",cost:0,kind:"unit",art:"?",atk:20,hp:20,text:"",charge:true,effect:"hero99",awaSwap:true,n:0,limit:1,rarity:"elite"},
    /* ============ 白俄罗斯铁壁（第二套卡组专用：极防 + 拖时间，不吃俄布体系） ============ */
    /* 单位：廉价嘲讽墙，铺满前期 */
    {id:"blrConscript",name:"白俄罗斯民兵",cost:1,kind:"unit",art:"▤",atk:1,hp:2,text:"嘲讽。亡语：获得 2 点护甲。",flavor:"明斯克郊外的防线，从民兵开始。",taunt:true,effect:"blrDeathArmor",rep:"blr",n:0,limit:4,rarity:"common"},
    {id:"blrTrench",name:"战壕",cost:2,kind:"unit",art:"▥",atk:0,hp:5,text:"嘲讽。",flavor:"一条战壕能拖住一个师。",taunt:true,rep:"blr",n:0,limit:4,rarity:"common"},
    {id:"blrGarrison",name:"明斯克卫戍军",cost:2,kind:"unit",art:"⛨",atk:2,hp:4,text:"嘲讽。部署：获得 2 点护甲。",taunt:true,effect:"blrGarrison",rep:"blr",n:0,limit:4,rarity:"common"},
    {id:"blrBastion",name:"边防哨所",cost:3,kind:"unit",art:"▥",atk:0,hp:6,text:"嘲讽。你的回合结束时，若你控制至少 1 个嘲讽单位，获得 1 点护甲。",flavor:"哨所还在，防线就没断。",taunt:true,effect:"blrBastion",rep:"blr",n:0,limit:4,rarity:"common"},
    {id:"blrRailway",name:"装甲列车",cost:5,kind:"unit",art:"▦",atk:4,hp:6,text:"嘲讽。部署：获得 3 点护甲。",taunt:true,effect:"blrRailway",rep:"blr",n:0,limit:2,rarity:"special"},
    /* 法术：叠甲 / 加固 / 清场 */
    {id:"blrRepair",name:"抢修列车",cost:3,kind:"spell",art:"⚒",text:"获得 3 点护甲，抽 1 张牌。",flavor:"铁轨通了，防线就还在。",effect:"armor3draw",rep:"blr",n:0,limit:4,rarity:"common"},
    {id:"blrFortify",name:"筑垒令",cost:2,kind:"spell",art:"⛨",text:"获得 2 点护甲 × 你的嘲讽单位数。",flavor:"每一条街都要变成工事。",effect:"blrFortify",rep:"blr",n:0,limit:3,rarity:"rare"},
    {id:"blrArmorWall",name:"铁壁",cost:3,kind:"spell",art:"▨",text:"使你的所有嘲讽单位获得 +1/+1，获得 2 点护甲。",effect:"blrArmorWall",rep:"blr",n:0,limit:3,rarity:"rare"},
    /* 终端：10 费永久状态，此后每个自己的回合开始固定产出 1 张【红军坦克】 */
    {id:"blrSteelTide",name:"钢铁洪流",cost:10,kind:"spell",art:"✹",text:"本局永久生效：你的每个回合开始时，将 1 张【红军坦克】加入你的手牌。",flavor:"铁轨修好了，洪流就停不下来。",effect:"blrSteelTide",rep:"blr",n:0,limit:1,rarity:"elite"}
  ]},
  "字母":{faction:"鸭子系 · 联合政府",style:"新式战法 · 超模铺场 · 直伤突破",hp:30,cards:[
    {id:"sentry",name:"卫戍哨兵",cost:1,kind:"unit",art:"盾",atk:1,hp:3,text:"嘲讽。",taunt:true,n:2,limit:3,rarity:"rare"},
    {id:"shadow",name:"影子特工",cost:2,kind:"unit",art:"◇",atk:3,hp:1,text:"冲锋。",charge:true,n:2,limit:3,rarity:"rare"},
    {id:"vanguard",name:"新式先锋",cost:2,kind:"unit",art:"A",atk:3,hp:2,text:"冲锋。",charge:true,n:2,limit:3,rarity:"rare"},
    {id:"outpost",name:"联合政府哨站",cost:2,kind:"unit",art:"▤",atk:2,hp:5,text:"嘲讽。部署：抽 1 张牌。",taunt:true,effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"commando",name:"突击队员",cost:3,kind:"unit",art:"⚑",atk:4,hp:2,text:"冲锋。",charge:true,n:2,limit:3,rarity:"rare"},
    {id:"duckguard",name:"鸭子联合军",cost:3,kind:"unit",art:"◇",atk:4,hp:3,text:"",flavor:"稳定推进。",n:3,limit:3,rarity:"rare"},
    {id:"tacticsquad",name:"战术小队",cost:3,kind:"unit",art:"▤",atk:3,hp:3,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"armored",name:"装甲突击车",cost:4,kind:"unit",art:"▤",atk:5,hp:4,text:"冲锋。",charge:true,n:2,limit:2,rarity:"special"},
    {id:"executor",name:"文件执行官",cost:4,kind:"unit",art:"✎",atk:5,hp:5,text:"攻击敌方英雄时，额外造成 1 点伤害。",n:2,limit:2,rarity:"special"},
    {id:"over",name:"超模单位",cost:5,kind:"unit",art:"⬢",atk:7,hp:7,text:"",flavor:"纯粹的超模数值。",n:2,limit:2,rarity:"special"},
    {id:"guard",name:"联合政府卫队",cost:6,kind:"unit",art:"◈",atk:8,hp:8,text:"",flavor:"新式战法的顶点。",n:1,limit:1,rarity:"elite"},
    {id:"heavytank",name:"重型坦克",cost:6,kind:"unit",art:"▦",atk:7,hp:7,text:"嘲讽。",taunt:true,n:1,limit:1,rarity:"elite"},
    {id:"order",name:"精准指令",cost:1,kind:"spell",art:"⌁",text:"抽 2 张牌。",effect:"draw2",n:2,limit:3,rarity:"rare"},
    {id:"evasion",name:"战术规避",cost:2,kind:"spell",art:"◌",text:"直到你的下个回合开始，敌方单位无法攻击你的英雄。",effect:"evasion",n:2,limit:2,rarity:"special"},
    {id:"rebelWeakest",name:"内应接应",cost:2,kind:"spell",art:"⚡",text:"策反生命值最低的敌方单位（限一回合，下回合返回），抽 1 张牌。",effect:"rebelWeakest",n:2,limit:2,rarity:"special"},
    {id:"newwar",name:"新式战法",cost:2,kind:"spell",art:"A",text:"使你的所有单位获得 +1/+1。",effect:"buffAll1",n:2,limit:3,rarity:"rare"},
    {id:"rebelLowest",name:"煽动哗变",cost:3,kind:"spell",art:"⚡",text:"策反攻击力最低的敌方单位（限一回合，下回合返回）。",effect:"rebelLowest",n:2,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"disruption",name:"阵型瓦解",cost:3,kind:"spell",art:"⊘",text:"所有敌方单位在下个回合无法攻击。对敌方英雄造成 2 点伤害。",effect:"disruption",n:2,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"wargame",name:"战法推演",cost:3,kind:"spell",art:"⌘",text:"获得 3 点护甲，抽 1 张牌。",effect:"armor3draw",n:1,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"break",name:"直伤突破",cost:3,kind:"spell",art:"⚡",text:"对敌方英雄造成 5 点伤害。",effect:"damage5",n:1,limit:2,rarity:"special",fx:"sp_strike"},
    {id:"rebel",name:"策动叛乱",cost:5,kind:"spell",art:"⚡",text:"策反 1 个敌方单位（永久）。",effect:"rebel",n:1,limit:1,rarity:"elite"},
    {id:"takeover",name:"战术接管",cost:4,kind:"spell",art:"⛓",text:"策反攻击力最高的敌方单位（限一回合，下回合返回）。",effect:"takeover",n:1,limit:1,rarity:"elite"},
    {id:"remove",name:"消除限制",cost:4,kind:"spell",art:"⊘",text:"所有敌方单位失去嘲讽，敌方英雄失去免疫，对敌方英雄造成 3 点伤害。",effect:"removeRestrict",n:1,limit:1,rarity:"elite"}
  ]},
  "七星":{faction:"彗星国 · 架子班",style:"法力压制 · 出牌封锁 · 慢节奏斩杀",hp:34,cards:[
    {id:"cometWatcher",name:"彗星观察者",cost:2,kind:"unit",art:"👁",atk:1,hp:3,text:"每当你获得 1 张手牌，恢复 1 点生命。",effect:"drawHeal",n:2,limit:3,rarity:"rare"},
    {id:"sentinel",name:"星轨哨兵",cost:2,kind:"unit",art:"盾",atk:1,hp:3,text:"嘲讽。部署：获得 2 点护甲。",taunt:true,effect:"armor2",n:2,limit:3,rarity:"rare"},
    {id:"messenger",name:"彗星信使",cost:2,kind:"unit",art:"◇",atk:2,hp:3,text:"部署：抽 1 张牌，恢复 1 点生命。",effect:"drawHeal1",n:2,limit:3,rarity:"rare"},
    {id:"bulwark",name:"星尘壁垒",cost:3,kind:"unit",art:"▥",atk:2,hp:6,text:"嘲讽。部署：恢复 2 点生命。",taunt:true,effect:"heal2",n:1,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"scholar",name:"彗星学者",cost:3,kind:"unit",art:"◇",atk:3,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:1,limit:2,rarity:"special"},
    {id:"eclipser",name:"星蚀观测员",cost:2,kind:"unit",art:"◐",atk:2,hp:4,text:"部署：敌方英雄获得 1 层【衰减】。",effect:"decay1",n:3,limit:3,rarity:"rare"},
    {id:"orbitguard",name:"星轨卫兵",cost:4,kind:"unit",art:"▥",atk:4,hp:6,text:"嘲讽。",taunt:true,n:2,limit:2,rarity:"special"},
    {id:"gravityfield",name:"引力场",cost:5,kind:"unit",art:"◉",atk:4,hp:8,text:"嘲讽。部署：敌方的费用上限 -1。",taunt:true,effect:"energyDown",n:1,limit:1,rarity:"elite"},
    {id:"foresee",name:"占星术",cost:1,kind:"spell",art:"✧",text:"查看牌库顶的 2 张牌，将其中 1 张加入手牌，其余置于牌库底。",effect:"foresee",n:2,limit:3,rarity:"rare"},
    {id:"forecast",name:"七星预报",cost:1,kind:"spell",art:"☼",text:"抽 2 张牌。",effect:"draw2",n:1,limit:2,rarity:"special"},
    {id:"mana",name:"法力压制",cost:2,kind:"spell",art:"-",text:"对敌方英雄造成 2 点伤害，敌方的费用上限 -1。",effect:"manaBurn",n:3,limit:3,rarity:"rare"},
    {id:"eclipse",name:"星蚀",cost:1,kind:"spell",art:"◐",text:"敌方英雄获得 1 层【衰减】。",effect:"decay1",n:3,limit:3,rarity:"rare"},
    {id:"timeShield",name:"时光护盾",cost:2,kind:"spell",art:"⛨",text:"获得 5 点护甲，恢复 3 点生命。",effect:"timeShield2",n:1,limit:2,rarity:"special"},
    {id:"timeslow",name:"时间延缓",cost:2,kind:"spell",art:"◌",text:"使所有敌方单位的攻击力 -1。",effect:"enemyAtkDown1",n:1,limit:3,rarity:"rare"},
    {id:"crystalBreak",name:"水晶崩解",cost:3,kind:"spell",art:"⬡",text:"敌方的费用上限 -2。",effect:"energyDown2",n:2,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"gravitywell",name:"引力井",cost:3,kind:"spell",art:"◉",text:"敌方的费用上限 -1，抽 1 张牌。",effect:"energyDownDraw",n:2,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"starClimb",name:"星轨攀升",cost:3,kind:"spell",art:"⇅",text:"你的费用上限 +1（本回合即可使用），敌方的费用上限 -1。",effect:"starClimb",n:1,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"cardCap",name:"星域封锁",cost:3,kind:"spell",art:"⛓",text:"敌方在下个回合最多只能打出 2 张牌。",effect:"lockCap2",n:2,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"gravityLock",name:"引力锁定",cost:3,kind:"spell",art:"⛓",text:"所有敌方单位在下个回合无法攻击。",effect:"gravityLock",n:1,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"gravityFold",name:"引力折叠",cost:3,kind:"spell",art:"⊘",text:"使敌方当前手牌的费用永久 +1。",effect:"costRaise",n:1,limit:1,rarity:"elite"},
    {id:"stasis",name:"静滞领域",cost:4,kind:"spell",art:"◌",text:"使所有敌方单位的攻击力 -2。",effect:"enemyAtkDown",n:1,limit:1,rarity:"elite"},
    {id:"silence",name:"寂静星环",cost:4,kind:"spell",art:"◌",text:"敌方在下个回合无法打出法术牌。",effect:"lockSpell",n:1,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"withering",name:"凋零彗尾",cost:4,kind:"spell",art:"☄",text:"敌方英雄获得 2 层【衰减】，抽 1 张牌。",effect:"decay2draw",n:1,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"doomsday",name:"终焉倒计时",cost:5,kind:"spell",art:"⌛",text:"使敌方英雄的【衰减】层数翻倍（至少 +1 层）。",effect:"decayDouble",n:1,limit:1,rarity:"elite"},
    {id:"stasisfield",name:"凝滞时空",cost:6,kind:"spell",art:"❖",text:"敌方在下个回合最多只能打出 1 张牌，敌方的费用上限 -1。",effect:"lockCap1",n:1,limit:1,rarity:"elite"},
    {id:"cometfall",name:"彗星陨落",cost:6,kind:"spell",art:"☄",text:"对敌方英雄造成 6 点伤害。",effect:"damage6",n:1,limit:1,rarity:"elite"},
    {id:"starlightPray",name:"星光祝福",cost:3,kind:"spell",art:"✶",text:"抽 2 张牌，恢复 6 点生命。",effect:"draw2heal6",n:0,limit:1,rarity:"elite"},
    {id:"cometTrail",name:"彗星尾迹",cost:2,kind:"spell",art:"✦",text:"获得 3 点护甲，抽 1 张牌。",effect:"armor3Draw1",n:0,limit:3,rarity:"rare"},
    {id:"starlightEcho",name:"星辉回响",cost:2,kind:"spell",art:"✧",text:"恢复 4 点生命，抽 1 张牌。",effect:"heal4Draw1",n:0,limit:3,rarity:"rare"},
    {id:"stardustBeacon",name:"星尘信标",cost:3,kind:"spell",art:"✦",text:"恢复 5 点生命，获得 2 点护甲。",effect:"heal5Armor2",n:0,limit:3,rarity:"rare"},
    {id:"starlock",name:"星辉锁链",cost:2,kind:"spell",art:"🔗",text:"眩晕 1 个敌方单位，使其下个回合无法攻击，抽 1 张牌。",effect:"stunOneDraw",n:0,limit:3,rarity:"rare"},
    {id:"cometShackle",name:"彗星枷锁",cost:4,kind:"spell",art:"⛓",text:"眩晕所有敌方单位，使它们下个回合无法攻击，抽 1 张牌。",effect:"stunAllDraw",n:0,limit:2,rarity:"special"},
    {id:"cometTutor",name:"彗星预言",cost:3,kind:"spell",art:"☄",text:"从牌库中将【彗星陨击】加入手牌。如果没有，改为抽 2 张牌。",effect:"cometTutor",n:0,limit:2,rarity:"special",fx:"sp_insight"},
    {id:"starcore",name:"星核卫士",cost:5,kind:"unit",art:"▥",atk:3,hp:12,text:"嘲讽。部署：选择你手牌中的 1 张牌，其费用变为 0。",taunt:true,effect:"starCoreZero",n:0,limit:1,rarity:"elite"},
    {id:"tune",name:"调节",cost:2,kind:"spell",art:"⇄",text:"将你的手牌全部洗入牌库并洗牌，然后抽取等同于洗入数量 +1 的牌。",effect:"reshuffleDraw",n:0,limit:4,rarity:"common"},
    {id:"cometStrike",name:"彗星陨击",cost:8,kind:"spell",art:"☄",text:"如果你的英雄血量（不含护甲）高于 40，对敌方英雄造成 40 点伤害。",effect:"cometStrike",n:0,limit:1,rarity:"elite"}
  ]},
  "核弹":{faction:"凹槽帝国",style:"禁忌召唤 · 超强单卡",hp:30,cards:[
    {id:"refugee",name:"旧大陆难民",cost:1,kind:"unit",art:"◇",atk:1,hp:3,text:"嘲讽。",taunt:true,n:3,limit:3,rarity:"rare"},
    {id:"teaboy",name:"红茶侍者",cost:2,kind:"unit",art:"◒",atk:2,hp:3,text:"部署：获得 2 点护甲。",effect:"armor2",n:2,limit:2,rarity:"special"},
    {id:"stealth",name:"隐秘行踪",cost:2,kind:"unit",art:"◇",atk:2,hp:5,text:"",flavor:"行踪隐秘迅速。",n:2,limit:3,rarity:"rare"},
    {id:"teaunit",name:"安静旁观",cost:3,kind:"unit",art:"○",atk:3,hp:4,text:"",flavor:"只是路过看看。",n:1,limit:2,rarity:"special"},
    {id:"spy",name:"凹槽密探",cost:3,kind:"unit",art:"◇",atk:3,hp:5,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"ironwall",name:"凹槽铁壁",cost:3,kind:"unit",art:"▥",atk:2,hp:6,text:"嘲讽。",taunt:true,n:2,limit:2,rarity:"special"},
    {id:"phasepiercer",name:"相位穿透者",cost:3,kind:"unit",art:"◈",atk:3,hp:4,text:"无视嘲讽。",ignoreTaunt:true,n:1,limit:2,rarity:"special"},
    {id:"crownkeeper",name:"皇冠守护者",cost:4,kind:"unit",art:"♛",atk:4,hp:6,text:"嘲讽。部署：抽 1 张牌。",taunt:true,effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"barrier",name:"隐秘结界",cost:5,kind:"unit",art:"▥",atk:4,hp:9,text:"嘲讽。",taunt:true,n:2,limit:2,rarity:"special"},
    {id:"crownguard",name:"皇冠卫队",cost:5,kind:"unit",art:"▦",atk:5,hp:8,text:"嘲讽。",taunt:true,n:2,limit:3,rarity:"rare"},
    {id:"superman",name:"超人 SUPERMAN",cost:3,kind:"unit",art:"S",atk:10,hp:10,text:"冲锋。无视嘲讽。每回合可以攻击 2 次。限时：在你的下个回合开始时消散。",strikes:2,charge:true,ignoreTaunt:true,lifespan:1,n:1,limit:1,rarity:"elite"},
    {id:"whisper",name:"皇冠低语",cost:1,kind:"spell",art:"♛",text:"抽 1 张牌，恢复 2 点生命。",effect:"draw1heal2",n:3,limit:3,rarity:"rare"},
    {id:"tea",name:"红茶时间",cost:2,kind:"spell",art:"◒",text:"获得 3 点护甲，抽 1 张牌。",effect:"armor3draw",n:2,limit:2,rarity:"special"},
    {id:"escape",name:"逃亡路线",cost:2,kind:"spell",art:"↗",text:"抽 2 张牌，恢复 2 点生命。",effect:"draw2heal2",n:2,limit:2,rarity:"special"},
    {id:"vanish",name:"销声匿迹",cost:2,kind:"spell",art:"◌",text:"直到你的下个回合开始，敌方单位无法攻击你的英雄。",effect:"evasion",n:2,limit:3,rarity:"rare"},
    {id:"filter",name:"禁忌检索",cost:2,kind:"spell",art:"⌕",text:"抽 2 张牌。如果抽到【超人】，其费用 -2。",effect:"filterSuperman2",n:2,limit:2,rarity:"special"},
    {id:"airstrike",name:"凹槽突袭",cost:4,kind:"spell",art:"☄",text:"对敌方英雄造成 5 点伤害，抽 1 张牌。",effect:"damage5draw",n:2,limit:2,rarity:"special"},
    {id:"gaze",name:"皇冠凝视",cost:2,kind:"spell",art:"♛",text:"查看牌库顶的 3 张牌，将其中 1 张加入手牌，其余置于牌库底。",effect:"scry",n:2,limit:2,rarity:"special"},
    {id:"ritual",name:"皇冠仪式",cost:2,kind:"spell",art:"♛",text:"从牌库中召唤【超人】。",effect:"summonSuperman",n:1,limit:1,rarity:"elite"},
    {id:"revenge",name:"例行复仇",cost:3,kind:"spell",art:"☄",text:"对敌方英雄造成 7 点伤害。",effect:"damage7",n:2,limit:2,rarity:"special",fx:"sp_strike"},
    {id:"resonance",name:"皇冠共鸣",cost:3,kind:"spell",art:"♛",text:"从牌库中将【超人】加入手牌。如果没有，改为抽 2 张牌。",effect:"tutorSuperman",n:2,limit:2,rarity:"special",fx:"sp_insight"},
    {id:"retreat",name:"战略撤离",cost:3,kind:"spell",art:"↗",text:"恢复 5 点生命，抽 1 张牌。",effect:"heal5draw",n:1,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"forbiddenknowledge",name:"禁忌知识",cost:3,kind:"spell",art:"⌬",text:"抽 3 张牌。",effect:"draw3",n:1,limit:2,rarity:"special",fx:"sp_insight"}
  ]},
  "猪瘟鱼":{faction:"凹槽帝国",style:"偷钱逃跑 · 特殊胜利",hp:30,cards:[
    {id:"assistant",name:"会计助理",cost:1,kind:"unit",art:"◇",atk:1,hp:3,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:3,rarity:"rare"},
    {id:"ledger",name:"财政账本",cost:2,kind:"unit",art:"▤",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"collector",name:"收米专员",cost:2,kind:"unit",art:"$",atk:2,hp:3,text:"部署：偷取 30 元，对敌方英雄造成 1 点伤害。",effect:"steal3hero1",n:1,limit:3,rarity:"rare"},
    {id:"auditor",name:"审计员",cost:2,kind:"unit",art:"▤",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"broker",name:"账房先生",cost:3,kind:"unit",art:"◇",atk:3,hp:4,text:"部署：偷取 20 元。",effect:"steal2",n:1,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"vaultguard",name:"金库护卫",cost:2,kind:"unit",art:"▥",atk:1,hp:4,text:"嘲讽。部署：偷取 20 元。",taunt:true,effect:"steal2",n:2,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"taxman",name:"税官",cost:3,kind:"unit",art:"$",atk:3,hp:5,text:"部署：偷取 40 元。",effect:"steal4",n:2,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"accountant",name:"精算主管",cost:4,kind:"unit",art:"#",atk:4,hp:5,text:"部署：获得 1 点护甲。",effect:"armor1",n:2,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"vault",name:"金库守卫",cost:4,kind:"unit",art:"▦",atk:3,hp:7,text:"嘲讽。部署：获得 2 点护甲。",taunt:true,effect:"armor2",n:2,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"safehouse",name:"软禁室",cost:5,kind:"unit",art:"▣",atk:5,hp:7,text:"嘲讽。",taunt:true,n:2,limit:2,rarity:"special"},
    {id:"vaultgate",name:"金库大门",cost:6,kind:"unit",art:"▣",atk:6,hp:9,text:"嘲讽。",taunt:true,n:1,limit:1,rarity:"elite"},
    {id:"launderer",name:"洗钱专家",cost:3,kind:"unit",art:"$",atk:3,hp:5,text:"部署：偷取 30 元，抽 1 张牌。",effect:"steal3draw",n:2,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"bribelord",name:"收买要员",cost:4,kind:"unit",art:"▤",atk:4,hp:5,text:"部署：偷取 20 元，获得 2 点护甲。",effect:"steal2armor2",n:1,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"greyincome",name:"灰色收入",cost:1,kind:"spell",art:"$",text:"偷取 40 元。",effect:"steal4",n:2,limit:3,rarity:"rare"},
    {id:"bribe",name:"账外交易",cost:1,kind:"spell",art:"◇",text:"抽 2 张牌，你的英雄受到 1 点伤害，偷取 20 元。",effect:"bribeDraw",n:2,limit:3,rarity:"rare"},
    {id:"steal",name:"人民收米术",cost:2,kind:"spell",art:"$",text:"对敌方英雄造成 3 点伤害，抽 1 张牌，偷取 100 元。",effect:"steal5draw",n:2,limit:2,rarity:"special"},
    {id:"count",name:"清点现金",cost:2,kind:"spell",art:"+",text:"恢复 3 点生命，抽 1 张牌，偷取 30 元。",effect:"healDrawSteal",n:2,limit:2,rarity:"special"},
    {id:"taxevasion",name:"偷税漏税",cost:2,kind:"spell",art:"$",text:"对敌方英雄造成 2 点伤害，抽 1 张牌，偷取 40 元。",effect:"hero2drawSteal",n:2,limit:2,rarity:"special"},
    {id:"launder",name:"洗钱",cost:2,kind:"spell",art:"◇",text:"偷取 40 元。",effect:"steal4",n:2,limit:2,rarity:"special"},
    {id:"escape",name:"逃跑",cost:3,kind:"spell",art:"↗",text:"如果你已偷取 300 元，立即获胜。否则获得 3 点护甲，对敌方英雄造成 2 点伤害。",effect:"runaway",n:2,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"transfer",name:"资金转移",cost:3,kind:"spell",art:"⇄",text:"抽 2 张牌，获得 2 点护甲，偷取 20 元。",effect:"supplySteal",n:2,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"funding",name:"财政拨款",cost:3,kind:"spell",art:"+",text:"恢复 5 点生命，抽 1 张牌。",effect:"heal5draw",n:1,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"sanction",name:"经济制裁",cost:4,kind:"spell",art:"⚡",text:"对敌方英雄造成 5 点伤害。",effect:"damage5",n:1,limit:2,rarity:"special",fx:"sp_strike"},
    {id:"fakebooks",name:"伪造账目",cost:3,kind:"spell",art:"▤",text:"偷取 40 元，抽 1 张牌。",effect:"steal4draw",n:1,limit:2,rarity:"special",fx:"sp_coin"},
    {id:"vaultfill",name:"金库充盈",cost:5,kind:"spell",art:"♛",text:"抽 3 张牌，获得 3 点护甲，偷取 50 元。",effect:"vaultBurst",n:1,limit:1,rarity:"elite"}
  ]},
  "八幡":{faction:"旧大陆卡兹帝国",style:"海盗体系 · 极速铺场",hp:30,cards:[
    {id:"deckhand",name:"甲板水手",cost:0,kind:"unit",art:"⚓",atk:1,hp:2,text:"冲锋。",charge:true,n:2,limit:3,rarity:"rare"},
    {id:"pirate",name:"小海盗",cost:1,kind:"unit",art:"⚓",atk:2,hp:2,text:"冲锋。",charge:true,n:4,limit:4,rarity:"common"},
    {id:"stalker",name:"潜行海盗",cost:1,kind:"unit",art:"◉",atk:2,hp:2,text:"部署：使 1 个敌方单位失去嘲讽。",effect:"stripTaunt",n:2,limit:3,rarity:"rare"},
    {id:"raider",name:"劫掠者",cost:2,kind:"unit",art:"⚑",atk:3,hp:3,text:"冲锋。",charge:true,n:3,limit:3,rarity:"rare"},
    {id:"ship",name:"海盗船",cost:2,kind:"unit",art:"⌁",atk:2,hp:2,text:"部署：随机召唤 1 个海盗。",effect:"summonRandomPirate",n:3,limit:3,rarity:"rare"},
    {id:"captain",name:"年轻船长",cost:3,kind:"unit",art:"✦",atk:4,hp:4,text:"攻击敌方英雄时，额外造成 1 点伤害。",n:2,limit:2,rarity:"special"},
    {id:"pirateWarlord",name:"海盗统领",cost:4,kind:"unit",art:"♜",atk:3,hp:4,text:"冲锋。部署：召唤 1 个【先锋海盗】，并将 1 张【海盗战嚎】加入你的手牌。",charge:true,effect:"pirateCommander",n:2,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"wallbreaker",name:"破阵者",cost:3,kind:"unit",art:"⛨",atk:2,hp:2,text:"冲锋。部署：消灭 1 个生命值高于攻击力的敌方单位。",charge:true,effect:"killTough",n:1,limit:1,rarity:"elite"},
    {id:"clubber",name:"持棍海盗",cost:1,kind:"unit",art:"⚒",atk:1,hp:1,text:"冲锋。部署：将 1 张【闷棍】加入你的手牌。",charge:true,effect:"clubberDeploy",n:2,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"king",name:"海盗王",cost:4,kind:"unit",art:"♛",atk:4,hp:4,text:"部署：使你的所有单位获得 +2/+2。",effect:"buffAll2",n:1,limit:1,rarity:"elite"},
    {id:"helmsman",name:"舵手",cost:1,kind:"unit",art:"◉",atk:1,hp:2,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:3,rarity:"rare"},
    {id:"gunner",name:"火炮手",cost:2,kind:"unit",art:"✣",atk:2,hp:2,text:"部署：对敌方英雄造成 1 点伤害。",effect:"hero1",n:1,limit:2,rarity:"special"},
    {id:"rum",name:"酒馆补给",cost:1,kind:"spell",art:"●",text:"恢复 2 点生命，抽 1 张牌。",effect:"healDraw",n:2,limit:3,rarity:"rare"},
    {id:"intimidate",name:"恐吓",cost:1,kind:"spell",art:"⚑",text:"使 1 个敌方单位失去嘲讽。如果你有友方海盗，抽 1 张牌。",effect:"stripTauntDraw",n:2,limit:2,rarity:"special",fx:"sp_bind"},
    {id:"raid",name:"劫掠",cost:2,kind:"spell",art:"⚑",text:"你每控制 1 个单位，抽 1 张牌（至少 1 张，至多 3 张）。",effect:"raid",n:2,limit:2,rarity:"special"},
    {id:"revengepirate",name:"复仇主义",cost:2,kind:"spell",art:"✹",text:"使你的所有单位获得【亡语：对敌方英雄造成 1 点伤害】，抽 1 张牌。",effect:"revengeDeath",n:1,limit:2,rarity:"special"},
    {id:"firebomb",name:"燃烧弹",cost:2,kind:"spell",art:"✹",text:"消灭 1 个你的单位，对所有敌方单位造成 3 点伤害。",effect:"sacAoe3",n:2,limit:2,rarity:"special"},
    {id:"fireship",name:"火船",cost:3,kind:"spell",art:"✹",text:"摧毁你的所有单位。每摧毁 1 个，对所有敌方单位造成 2 点伤害。",effect:"fireShip",n:1,limit:1,rarity:"elite"},
    {id:"finish",name:"海盗大斩杀",cost:4,kind:"spell",art:"☠",text:"对敌方英雄造成等同于你的单位数量 ×2 的伤害。",effect:"finish",n:1,limit:1,rarity:"elite"},
    {id:"boarding",name:"登船战",cost:3,kind:"spell",art:"⚑",text:"使你的所有单位获得 +1/+1，并可在本回合攻击。",effect:"buffAllCharge",n:2,limit:2,rarity:"special",fx:"sp_bless"},
    {id:"pirateDiscover",name:"发现海盗",cost:3,kind:"spell",art:"◎",text:"发现 3 次：每次从 3 张随机的海盗牌中选择 1 张加入手牌；并使你的所有海盗在部署或加入手牌时获得 +1/+1。",effect:"pirateDiscover2",n:1,limit:1,rarity:"elite"},
    {id:"luckycoin",name:"海盗的幸运币",cost:0,kind:"spell",art:"₿",text:"获得 1 点费用。对局开始时自动抽取。",effect:"luckyCoin",n:1,limit:1,core:true,rarity:"elite"}
  ]},
  "045":{faction:"普鲁士国 · 架子班",style:"高层名片 · 开发他人卡组",hp:31,cards:[
    {id:"contact",name:"联络员",cost:1,kind:"unit",art:"◇",atk:1,hp:2,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:3,rarity:"rare"},
    {id:"apprentice",name:"架子班学徒",cost:2,kind:"unit",art:"✦",atk:2,hp:3,text:"部署：抽 1 张牌。",effect:"draw",n:3,limit:3,rarity:"rare"},
    {id:"intel",name:"情报官",cost:2,kind:"unit",art:"◇",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"advisor",name:"高层顾问",cost:2,kind:"unit",art:"◇",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:3,limit:3,rarity:"rare"},
    {id:"diplomat",name:"外交官",cost:3,kind:"unit",art:"✎",atk:3,hp:5,text:"部署：获得 2 点护甲。",effect:"armor2",n:2,limit:2,rarity:"special",fx:"sp_guard"},
    {id:"researcher",name:"解析员",cost:4,kind:"unit",art:"⌬",atk:4,hp:6,text:"部署：抽 1 张牌，获得 1 点护甲。",effect:"drawArmor",n:1,limit:2,rarity:"special",fx:"sp_insight"},
    {id:"cardmaker",name:"卡片工匠",cost:4,kind:"unit",art:"▦",atk:4,hp:5,text:"部署：抽 2 张牌。",effect:"draw2",n:1,limit:2,rarity:"special",fx:"sp_insight"},
    {id:"blueprint",name:"蓝图制卡师",cost:5,kind:"unit",art:"▦",atk:6,hp:6,text:"嘲讽。",taunt:true,n:1,limit:2,rarity:"special"},
    {id:"alwei",name:"架子班·阿伟",cost:6,kind:"unit",art:"锤",atk:6,hp:6,text:"部署：抽 2 张牌，使你的所有单位获得 +1/+1。",effect:"alweiDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"qixing",name:"架子班·七星",cost:5,kind:"unit",art:"☄",atk:5,hp:5,text:"部署：敌方的费用上限 -1。",effect:"qixingDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"susu_leader",name:"架子班·苏苏",cost:5,kind:"unit",art:"☭",atk:5,hp:5,text:"部署：召唤 1 个【俄布】。",effect:"susuDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"huiliyi",name:"架子班·绘梨衣",cost:4,kind:"unit",art:"✦",atk:4,hp:4,text:"部署：将你手牌中费用最低的 1 张牌，变成同一卡牌师的、费用高 2 的随机牌。",effect:"huiliyiDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"baimao",name:"架子班·白猫",cost:4,kind:"unit",art:"◇",atk:4,hp:4,text:"部署：本回合获得 3 点额外费用。",effect:"baimaoDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"xiashui",name:"架子班·下水",cost:4,kind:"unit",art:"✚",atk:4,hp:4,text:"部署：对敌方英雄造成 3 点伤害。",effect:"xiashuiDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"yuchun",name:"架子班·愚蠢",cost:3,kind:"unit",art:"☠",atk:3,hp:3,text:"部署：将敌方牌库顶的 3 张牌变成【鸭子】。",effect:"yuchunDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"taojin",name:"架子班·淘金",cost:3,kind:"unit",art:"✦",atk:3,hp:3,text:"部署：随机触发 1 种效果：对敌方英雄造成 6 点伤害 / 你的英雄受到 3 点伤害 / 抽 2 张牌 / 敌方英雄恢复 4 点生命。",effect:"taojinDeploy",n:1,limit:1,member:true,rarity:"elite"},
    {id:"namecard",name:"高层名片",cost:2,kind:"spell",art:"▧",text:"使你的所有单位获得 +1/+1。",effect:"buffAll1",n:2,limit:3,rarity:"rare"},
    {id:"develop",name:"开发他人卡组",cost:2,kind:"spell",art:"⌘",text:"查看敌方牌库顶的 3 张牌，选择 1 张的复制加入你的手牌。",effect:"developEnemy",n:2,limit:2,rarity:"special",fx:"sp_insight"},
    {id:"adapt",name:"适应性方案",cost:4,kind:"spell",art:"↻",text:"摧毁攻击力最高的敌方单位，恢复 3 点生命。",effect:"adapt",n:2,limit:2,rarity:"special",fx:"sp_strike"},
    {id:"handoff",name:"关系网调度",cost:1,kind:"spell",art:"⇄",text:"抽 1 张牌，获得 1 点护甲。",effect:"handoff",n:2,limit:3,rarity:"rare"},
    {id:"copycrown",name:"复制的皇冠",cost:5,kind:"spell",art:"♛",text:"抽 3 张牌，获得 3 点护甲。",effect:"crown",n:1,limit:1,rarity:"elite"},
    {id:"meeting",name:"高层会议",cost:4,kind:"spell",art:"▧",text:"使你的所有单位获得 +1/+1，抽 1 张牌。",effect:"buffAll1draw",n:2,limit:2,rarity:"special",fx:"sp_bless"},
    {id:"upgrade",name:"卡片升级",cost:2,kind:"spell",art:"⇪",text:"使 1 个友方单位获得 +2/+2，抽 1 张牌。",effect:"buffOneDraw",n:1,limit:2,rarity:"special"},
    {id:"network",name:"关系网",cost:2,kind:"spell",art:"⇄",text:"抽 2 张牌，获得 1 点护甲。",effect:"draw2armor1",n:2,limit:2,rarity:"special"},
    {id:"summoncall",name:"架子班召集令",cost:5,kind:"spell",art:"锤",text:"从牌库中随机召唤 1 个架子班成员（触发其部署效果）。如果没有，改为抽 2 张牌。",effect:"summoncall",n:2,limit:2,rarity:"special",fx:"sp_insight"},
    {id:"namecardsummon",name:"名片召唤",cost:3,kind:"spell",art:"▧",text:"从牌库中选择 1 个架子班成员召唤（触发其部署效果）。",effect:"namecardsummon",n:2,limit:2,rarity:"special",fx:"sp_insight"},
    {id:"highcommand",name:"高层指令",cost:4,kind:"spell",art:"♛",text:"使你的所有单位获得 +2/+2。",effect:"highcommand",n:1,limit:2,rarity:"special",fx:"sp_bless"}
  ]},
  "下水":{faction:"架子班 · 鸭子系",style:"火炮体系 · 饱和炮击",hp:34,cards:[
    {id:"smallcannon",name:"小炮组",cost:1,kind:"unit",art:"✚",atk:1,hp:1,text:"部署：抽 1 张牌。",effect:"draw",n:3,limit:3,gun:true,rarity:"rare"},
    {id:"smallgun",name:"轻型炮台",cost:3,kind:"unit",art:"◆",atk:2,hp:3,text:"部署：召唤 1 个【小炮组】。",effect:"copySmallCannon",n:2,limit:3,gun:true,rarity:"rare"},
    {id:"gunner",name:"炮兵班",cost:2,kind:"unit",art:"◆",atk:2,hp:2,text:"无视嘲讽。部署：如果你控制其他火炮，获得 +1/+1。",ignoreTaunt:true,effect:"gunnerBoost",n:3,limit:3,gun:true,rarity:"rare"},
    {id:"cannon",name:"远程火炮",cost:2,kind:"unit",art:"✚",atk:2,hp:2,text:"无视嘲讽。部署：对敌方英雄造成 1 点伤害。",ignoreTaunt:true,effect:"hero1",n:2,limit:3,gun:true,rarity:"rare"},
    {id:"battery",name:"重炮连",cost:3,kind:"unit",art:"▥",atk:2,hp:3,text:"嘲讽。无视嘲讽。部署：使你的所有火炮获得 +1 攻击力。",taunt:true,ignoreTaunt:true,effect:"buffGuns1",n:2,limit:2,gun:true,rarity:"special",fx:"sp_bless"},
    {id:"commander",name:"火力指挥官",cost:4,kind:"unit",art:"★",atk:3,hp:3,text:"嘲讽。无视嘲讽。部署：使你的所有火炮获得 +1 攻击力。",taunt:true,ignoreTaunt:true,effect:"buffGuns1",n:2,limit:2,gun:true,rarity:"special",fx:"sp_bless"},
    {id:"ammo",name:"弹药车",cost:2,kind:"unit",art:"▣",atk:2,hp:2,text:"部署：抽 1 张牌。",effect:"draw",n:1,limit:2,rarity:"special"},
    {id:"spotter",name:"前沿观察员",cost:2,kind:"unit",art:"◇",atk:2,hp:1,text:"冲锋。",charge:true,n:1,limit:2,rarity:"special"},
    {id:"howitzer",name:"榴弹炮",cost:4,kind:"unit",art:"✣",atk:3,hp:4,text:"无视嘲讽。",ignoreTaunt:true,n:2,limit:2,gun:true,rarity:"special"},
    {id:"emplacement",name:"炮兵阵地",cost:5,kind:"unit",art:"▥",atk:4,hp:7,text:"嘲讽。",taunt:true,n:2,limit:2,gun:true,rarity:"special"},
    {id:"magazine",name:"弹药库",cost:3,kind:"unit",art:"▣",atk:3,hp:5,text:"嘲讽。部署：抽 1 张牌。",taunt:true,effect:"draw",n:2,limit:2,rarity:"special"},
    {id:"saturation",name:"饱和炮击",cost:6,kind:"spell",art:"▦",text:"你每控制 1 个火炮，对敌方英雄和所有敌方单位造成 2 点伤害。",effect:"saturation",n:4,limit:4,rarity:"common"},
    {id:"reload",name:"快速装填",cost:1,kind:"spell",art:"↻",text:"本回合使你的所有火炮获得 +2 攻击力，抽 1 张牌。",effect:"reload",n:2,limit:3,rarity:"rare"},
    {id:"supply",name:"炮弹补给",cost:2,kind:"spell",art:"+",text:"抽 2 张牌，获得 2 点护甲。",effect:"supply",n:2,limit:2,rarity:"special"},
    {id:"cover",name:"火力覆盖",cost:4,kind:"spell",art:"✣",text:"对敌方英雄和所有敌方单位造成 2 点伤害。",effect:"aoe2",n:1,limit:2,rarity:"special",fx:"sp_storm"},
    {id:"volley",name:"齐射",cost:5,kind:"spell",art:"✣",text:"对所有敌方单位造成 4 点伤害。",effect:"aoe4",n:1,limit:2,rarity:"special",fx:"sp_storm"},
    {id:"prepfire",name:"炮火准备",cost:2,kind:"spell",art:"✣",text:"对至多 3 个敌方单位各造成 2 点伤害。",effect:"choose3x2",n:2,limit:2,rarity:"special"},
    {id:"recon",name:"火力侦察",cost:1,kind:"spell",art:"◇",text:"抽 1 张牌。",effect:"draw1",n:2,limit:2,rarity:"special"},
    {id:"support",name:"炮兵支援",cost:4,kind:"spell",art:"★",text:"使你的所有火炮获得 +2 攻击力，抽 1 张牌。",effect:"buffGuns2draw",n:2,limit:2,rarity:"special",fx:"sp_bless"},
    {id:"resupply",name:"弹药补充",cost:2,kind:"spell",art:"+",text:"恢复 3 点生命，抽 1 张牌。",effect:"heal3draw",n:1,limit:2,rarity:"special"},
    {id:"bombardcmd",name:"轰炸指令",cost:5,kind:"spell",art:"☄",text:"对敌方英雄造成 6 点伤害。",effect:"damage6",n:1,limit:2,rarity:"special",fx:"sp_strike"}
  ]},
  "绘梨衣":{faction:"小怪兽国 · 架子班",style:"劣质资源转化 · 慢热",hp:34,passive:"皇冠产出：每个回合开始，你的手牌获得 2 张【碎纸】。",cards:[
    {id:"scavenger",name:"拾荒者",cost:1,kind:"unit",art:"♻",atk:2,hp:2,text:"回收：被消灭时，把 1 张【碎纸】放回你的手牌。",recycle:"scrap",n:3,limit:4,rarity:"common"},
    {id:"station",name:"废品回收站",cost:2,kind:"unit",art:"♲",atk:1,hp:4,text:"你手牌中的【废料】费用 +1。每当你打出 1 张【废料】，抽 1 张牌。",flavor:"什么都收，什么都不扔。",effect:"scrapTax",n:2,limit:2,rarity:"special"},
    {id:"temp",name:"临时工",cost:1,kind:"unit",art:"✂",atk:2,hp:2,text:"部署：弃掉手牌中的 1 张【废料】，获得 +2/+2。",effect:"scrapPump",n:3,limit:4,rarity:"common"},
    {id:"fortress",name:"废料堡垒",cost:2,kind:"unit",art:"▤",atk:2,hp:5,text:"嘲讽。",taunt:true,n:4,limit:4,rarity:"common"},
    {id:"corner",name:"角落里的小怪兽",cost:2,kind:"unit",art:"☻",atk:3,hp:4,text:"每当你打出 1 张【废料】，获得 +1 攻击，持续到回合结束。",effect:"scrapRage",n:2,limit:3,rarity:"rare"},
    {id:"shredder",name:"碎纸机",cost:2,kind:"unit",art:"▥",atk:2,hp:4,text:"每当你打出 1 张【废料】，恢复 1 点生命。",effect:"scrapHeal",n:2,limit:3,rarity:"rare"},
    {id:"xi",name:"汐",cost:3,kind:"unit",art:"◇",atk:3,hp:4,text:"嘲讽。部署：使 1 张随机敌方手牌的费用 +1。",flavor:"名誉性质的职位，也有实权。",taunt:true,effect:"costUp1",n:2,limit:2,rarity:"special"},
    {id:"guard",name:"小怪兽卫队",cost:3,kind:"unit",art:"✦",atk:4,hp:4,text:"部署：你手牌中每有 1 张【废料】，获得 +1/+1（至多 +3）。",effect:"scrapGuard",n:2,limit:2,rarity:"special"},
    {id:"eriyi",name:"绘梨衣",cost:3,kind:"unit",art:"♛",atk:4,hp:4,text:"部署：转化 2。",flavor:"蜷缩在杂乱房间的角落里，用最差的牌打出最好的效果。",effect:"convert2",n:1,limit:1,rarity:"elite"},
    {id:"colossus",name:"废料巨像",cost:5,kind:"unit",art:"▦",atk:4,hp:4,text:"部署：弃掉手牌中所有【废料】，每张使其获得 +1/+1。",effect:"scrapColossus",n:1,limit:1,rarity:"elite"},
    {id:"rummage",name:"翻箱倒柜",cost:3,kind:"spell",art:"▣",text:"召唤 2 个【废铜烂铁】。",effect:"scrapSummon2",n:3,limit:3,rarity:"rare"},
    {id:"trade",name:"以旧换新",cost:1,kind:"spell",art:"⇄",text:"弃掉手牌中所有【废料】，每张随机召唤 1 个你的单位（不含精英，战场已满时停止）。",effect:"scrapToUnits",n:2,limit:2,rarity:"special"},
    {id:"upcycle",name:"变废为宝",cost:0,kind:"spell",art:"♻",text:"转化 2。",effect:"convert2",n:3,limit:3,rarity:"rare"},
    {id:"stocktake",name:"清点库存",cost:1,kind:"spell",art:"▤",text:"弃掉手牌中的 1 张【废料】，从你的牌库中随机展示 3 张牌，选择 1 张加入手牌。",effect:"scrapSearch",n:2,limit:2,rarity:"special"},
    {id:"remelt",name:"回炉重造",cost:1,kind:"spell",art:"♺",text:"转化 3。",effect:"convert3",n:2,limit:2,rarity:"special"},
    {id:"expired",name:"过期卡包",cost:0,kind:"spell",art:"✉",text:"弃掉手牌中的 1 张【废料】，使攻击力最高的敌方单位眩晕 1 回合。",effect:"scrapStun",n:1,limit:2,rarity:"special"},
    {id:"recycle",name:"废物利用",cost:1,kind:"spell",art:"☄",text:"弃掉手牌中所有【废料】，每张对敌方英雄造成 2 点伤害。",effect:"scrapBlast",n:2,limit:2,rarity:"special"},
    {id:"sweep",name:"大扫除",cost:1,kind:"spell",art:"✧",text:"弃掉手牌中所有【废料】，每张恢复 3 点生命（至多 12 点）。",effect:"scrapSweep",n:1,limit:2,rarity:"special"},
    {id:"neutral",name:"中立宣言",cost:3,kind:"spell",art:"⚐",text:"所有单位眩晕 1 回合，你获得 4 点护甲。",flavor:"小怪兽宣布中立。",effect:"neutral",n:1,limit:1,rarity:"elite"},
    {id:"crown",name:"复制皇冠",cost:5,kind:"spell",art:"♛",text:"弃掉手牌中所有【废料】（至少 2 张），每 2 张获得 1 张随机的精英牌（至多 3 张）。",effect:"crownCopy",n:1,limit:1,rarity:"elite"}
  ]},
  白猫:{faction:"彗星国 · 架子班",style:"销毁敌牌 · 疲劳审判",hp:48,cards:[
    {id:"kitten",name:"勘误猫",cost:1,kind:"unit",art:"◇",atk:2,hp:2,text:"部署：消灭一名攻击力不超过 2 的敌方单位（优先攻击力最低者），计入已销毁卡牌。",effect:"whiteProof",n:3,limit:4,rarity:"common"},
    {id:"sentinel",name:"卷宗守卫",cost:2,kind:"unit",art:"◈",atk:2,hp:3,text:"嘲讽。每当你销毁一张敌方卡牌，获得 +1/+1。",taunt:true,effect:"whiteSentinel",n:2,limit:4,rarity:"common"},
    {id:"courier",name:"书页窃贼",cost:2,kind:"unit",art:"✦",atk:2,hp:2,text:"部署：销毁敌方牌库顶的 2 张牌。",effect:"whiteDeck1",n:2,limit:3,rarity:"rare"},
    {id:"leaper",name:"断章猎手",cost:3,kind:"unit",art:"✧",atk:3,hp:2,text:"冲锋。部署：对敌方英雄造成 2 点伤害；本局每销毁 3 张敌方卡牌，伤害 +1（至多 7 点）。",charge:true,effect:"whiteStrike",n:2,limit:3,rarity:"rare"},
    {id:"guardian",name:"页边催读官",cost:4,kind:"unit",art:"◆",atk:3,hp:6,text:"嘲讽。部署及你的回合开始时：强制对手抽 1 张牌，立即销毁抽到的牌；牌库为空则触发疲劳。",taunt:true,effect:"whiteMargin",n:2,limit:2,rarity:"special"},
    {id:"ash",name:"灰烬化身",cost:4,kind:"unit",art:"♢",atk:3,hp:4,text:"部署：本局每销毁 2 张敌方卡牌，获得 +1/+1（至多 +5/+5）。",effect:"whiteAsh",n:2,limit:2,rarity:"special"},
    {id:"engine",name:"碎页机关",cost:4,kind:"unit",art:"▤",atk:1,hp:5,text:"你的回合开始时，销毁敌方牌库顶的 2 张牌。",effect:"whiteEngine",n:2,limit:2,rarity:"special"},
    {id:"reserve",name:"档案拆解者",cost:5,kind:"unit",art:"✩",atk:5,hp:5,text:"部署：销毁敌方牌库顶的 3 张牌。",effect:"whiteDeck2",n:1,limit:2,rarity:"special"},
    {id:"inspector",name:"禁书搜查官",cost:5,kind:"unit",art:"◎",atk:5,hp:4,text:"部署：随机销毁敌方手牌的 1 张牌；若其手牌为空，改为销毁牌库顶的 1 张牌。",effect:"whiteHand1",n:1,limit:2,rarity:"special"},
    {id:"editor",name:"涂改员",cost:3,kind:"unit",art:"✎",atk:3,hp:3,text:"部署：随机将敌方手牌中的 1 张非垃圾牌变成【垃圾】。",effect:"whiteCorruptHand",n:2,limit:3,rarity:"rare"},
    {id:"medic",name:"纸缝医师",cost:3,kind:"unit",art:"✚",atk:2,hp:4,text:"部署：你的英雄恢复 4 点生命。",effect:"whiteMedic",n:2,limit:2,rarity:"special"},
    {id:"meteor",name:"终稿裁决",cost:7,kind:"unit",art:"☄",atk:6,hp:6,text:"部署：消灭攻击力最高的敌方单位，计入已销毁卡牌。",effect:"whiteBoard",n:1,limit:1,rarity:"elite"},
    {id:"sovereign",name:"白猫·空白终章",cost:6,kind:"unit",art:"♛",atk:6,hp:6,text:"部署：对敌方英雄造成 4 点伤害；本局每销毁 1 张敌方卡牌，伤害 +1（至多 18 点）。",effect:"whiteFinal",n:1,limit:1,rarity:"elite"},
    {id:"spark",name:"撕掉一页",cost:1,kind:"spell",art:"✦",text:"销毁敌方牌库顶的 2 张牌，抽 1 张牌。",effect:"whiteDeckDraw",n:4,limit:4,rarity:"common"},
    {id:"surge",name:"强制翻页",cost:2,kind:"spell",art:"⇧",text:"销毁敌方牌库顶的 2 张牌，再强制对手抽 1 张并销毁抽到的牌；牌库为空则触发疲劳。",effect:"whiteForce1",n:2,limit:3,rarity:"rare"},
    {id:"insight",name:"没收手稿",cost:2,kind:"spell",art:"◎",text:"随机销毁敌方手牌的 1 张牌；若其手牌为空，改为销毁牌库顶的 2 张牌。抽 1 张牌。",effect:"whiteConfiscate",n:1,limit:2,rarity:"special"},
    {id:"rally",name:"末页催读",cost:3,kind:"spell",art:"✧",text:"强制对手抽 2 张牌并销毁抽到的牌；牌库为空时每次抽牌触发疲劳。你获得 3 点护甲。",effect:"whiteForce2",n:1,limit:3,rarity:"rare"},
    {id:"shelter",name:"缺页追击",cost:4,kind:"spell",art:"◈",text:"对敌方英雄造成 3 点伤害；本局每销毁 2 张敌方卡牌，伤害 +1（至多 10 点）。",effect:"whiteBurst",n:1,limit:2,rarity:"special",fx:"sp_strike"},
    {id:"pollute",name:"废稿雨",cost:4,kind:"spell",art:"☣",text:"随机将敌方牌库中的 2 张非垃圾牌变成【垃圾】。",effect:"whiteCorruptDeck",n:2,limit:2,rarity:"special"},
    {id:"mend",name:"修补书脊",cost:3,kind:"spell",art:"✥",text:"你的英雄恢复 6 点生命，并获得 2 点护甲。",effect:"whiteMend",n:2,limit:2,rarity:"special"},
    {id:"shredstorm",name:"碎稿风暴",cost:4,kind:"spell",art:"❖",text:"对所有敌方单位造成 3 点伤害；因此被消灭的单位计入已销毁卡牌。",effect:"whiteAoe",n:2,limit:2,rarity:"special",fx:"sp_storm"},
    {id:"flood",name:"垃圾洪流",cost:6,kind:"spell",art:"▧",text:"敌方抽 5 张牌，将成功进入手牌的牌全部变成【垃圾】；手牌已满时，新抽到的牌直接销毁。牌库为空则触发疲劳。",effect:"whiteDrawJunk5",n:1,limit:2,rarity:"special"},
    {id:"night",name:"全卷焚尽",cost:6,kind:"spell",art:"♨",text:"随机销毁敌方手牌的 1 张牌，再销毁其牌库顶的 4 张牌；每销毁一张，额外造成 1 点伤害。",effect:"whiteNight",n:1,limit:1,rarity:"elite"}
  ]}
};

/* 衍生物：不属于任何卡组 */
const TOKENS={
  /* DIY 白名单·神罚：抽到时自动施放（自伤 1 + 抽 1），由「神罚共鸣」洗入牌库 */
  diyPunish:{id:"diyPunish",name:"神罚",cost:0,kind:"spell",art:"⚡",text:"抽到时自动施放：你的英雄受到 1 点伤害，抽 1 张牌。",effect:"diyPunishCast",onDraw:true,owner:"DIY",rarity:"common"},
  awaBand:{id:"awaBand",name:"爵士乐队",cost:3,kind:"unit",art:"♪",atk:0,hp:4,owner:"awa",untargetable:true,text:"无法被敌方单位攻击。你的单位和法术对敌方造成的伤害 +1（可叠加）。"},
  redGuard:{id:"redGuard",name:"近卫红军",cost:0,kind:"unit",art:"★",atk:0,hp:1,charge:true,rep:"rus",text:"冲锋。整编的产物：属性等于被整编的【俄布】之和。"},
  /* 钢铁洪流的产物：只存在于手牌，不进任何卡池 / 默认卡组 */
  redTank:{id:"redTank",name:"红军坦克",cost:2,kind:"unit",art:"▰",atk:5,hp:4,charge:true,rep:"blr",text:"冲锋。"},
  second:{id:"second",name:"苏二世",cost:4,kind:"unit",art:"Ⅱ",atk:3,hp:5,effect:"secondDeploy",transfer:"third",text:"部署：选择一个政体，并使攻击力最高的敌方单位眩晕 1 回合。引渡：被消灭时，把【苏三世】置入你的手牌。",flavor:"自行引渡至德德，逐渐正常化。",rep:"rus"},
  third:{id:"third",name:"苏三世",cost:6,kind:"unit",art:"Ⅲ",atk:6,hp:6,charge:true,effect:"thirdDeploy",text:"冲锋。部署：本回合三种政体的加成同时生效（代价不生效）。",flavor:"人脉威望达到顶峰。",rep:"rus"},
  scrap:{id:"scrap",name:"碎纸",cost:0,kind:"spell",art:"▫",text:"废料。没有任何效果。",scrap:true},
  scrapUnit:{id:"scrapUnit",name:"废铜烂铁",cost:0,kind:"unit",art:"▪",atk:2,hp:1,scrap:true,recycle:"scrap",text:"废料。回收：被消灭时，把 1 张【碎纸】放回你的手牌。"},
  redArtillery:{id:"redArtillery",name:"红军炮兵",cost:2,kind:"unit",art:"✣",atk:3,hp:2,ignoreTaunt:true,text:"无视嘲讽。"},
  pirateScout:{id:"pirateScout",name:"先锋海盗",cost:2,kind:"unit",art:"⚓",atk:2,hp:2,charge:true,text:"冲锋。"},
  pirateCry:{id:"pirateCry",name:"海盗战嚎",cost:1,kind:"spell",art:"♬",text:"选择一个你的单位，使其 +3/+3。",effect:"buffPirate3",fx:"sp_bless"},
  stunClub:{id:"stunClub",name:"闷棍",cost:1,kind:"spell",art:"⚒",text:"眩晕 1 个敌方单位。如果它已经被眩晕，改为将其消灭。",effect:"stunOrKill",fx:"sp_bind"},
  duck:{id:"duck",name:"鸭子",cost:1,kind:"unit",art:"鸭",atk:1,hp:1,text:"",flavor:"嘎。"},
  junk:{id:"junk",name:"垃圾",cost:1,kind:"spell",art:"▧",text:"打出：销毁你牌库顶的 1 张牌，然后抽 1 张牌。",effect:"whiteJunk"}
};

/* awa 卡牌：不进卡组编辑器。只有携带苏苏的【awa】时，开局会变成其中随机一张并洗入牌库 */
const AWA_CARDS={
  苏苏:{id:"awaFreeze",name:"停摆",cost:3,kind:"spell",art:"∅",owner:"awa",rarity:"elite",text:"直到你的下个回合开始，双方无法抽牌，费用上限和金钱也无法增加。",effect:"awaFreeze"},
  下水:{id:"awaDiscover",name:"选角",cost:1,kind:"spell",art:"※",owner:"awa",rarity:"elite",text:"从所有单位牌中随机展示 3 张，选择 1 张加入手牌。",effect:"awaDiscover"},
  七星:{id:"awaJazz",name:"即兴演出",cost:3,kind:"spell",art:"♪",owner:"awa",rarity:"elite",text:"召唤 1 个【爵士乐队】。如果敌方是猪瘟鱼，偷走其全部金钱。",effect:"awaJazz"}
};

const REGIMES={rus:"俄罗斯",ukr:"乌克兰",blr:"白俄罗斯"};
const COLORS={绘梨衣:"#a8c97a",苏苏:"#e0664f",字母:"#6fb6dc",七星:"#a98fd9",核弹:"#7cc98a",猪瘟鱼:"#e58aa6",八幡:"#4fc0b0","045":"#dcae62",下水:"#a3b6bf",白猫:"#d9e7f5"};

/* 新手引导信息：难度 1~3 */
const HERO_INFO={
  绘梨衣:{difficulty:3,title:"小怪兽国 · 架子班",tip:"每个回合开始你会得到一张【碎纸】——它们是废料，也是原料。前期靠废料单位撑住，攒够废料后用【变废为宝】【回炉重造】换成真正的好牌，或者一口气打成伤害和生命。手牌上限只有 10 张，别让废料把手牌塞满。"},
  苏苏:{difficulty:2,title:"架子班 · 彗星高层",tip:"开局自动打出【苏维埃社会主义共和国联盟】，选择一个政体成为它——俄布海通常选【俄罗斯】（新单位部署即可攻击）。铺满【俄布】后用【整编令】【红军集结】和增益一波推进，靠【战时共产主义】补牌。也可以走白俄罗斯铁壁：嘲讽站场、回合末叠甲，再用【钢铁洪流】把护甲换成清场。怕群伤清场，注意别一次铺太满。"},
  字母:{difficulty:2,title:"新式战法领袖",tip:"超模单位压场，用【消除限制】撕掉嘲讽和免疫后直伤突破；关键时刻策反对手最强的单位。"},
  七星:{difficulty:3,title:"彗星国领袖",tip:"不急着赢：压低对手的费用上限、封锁出牌，再用【衰减】一层一层磨死对手。"},
  核弹:{difficulty:2,title:"凹槽皇帝",tip:"卡组很薄，靠防御和逃跑撑住，找到【超人】后一击决胜——它每回合攻击两次，但只存在到你的下个回合开始。"},
  猪瘟鱼:{difficulty:2,title:"凹槽财政部长",tip:"不停偷钱，攒够 300 元后打出【逃跑】直接获胜。偷钱的同时注意保命。"},
  八幡:{difficulty:1,title:"OCC 冠军 · 八幡军区",tip:"海盗快速铺场，再用【复仇主义】让它们死后反伤；最后用【海盗大斩杀】按场上单位数打脸。"},
  "045":{difficulty:2,title:"普鲁士国领袖",tip:"高层名片调用资源，【开发他人卡组】复制对手牌库里的好牌，召唤各具特色的架子班成员。"},
  下水:{difficulty:2,title:"架子班 · 炮兵",tip:"火炮越多越强。携带 4 张【饱和炮击】，场上火炮数量决定每次覆盖的伤害。"},
  白猫:{difficulty:3,title:"彗星高层 · 架子班",tip:"用【撕掉一页】压缩敌方牌库；【涂改员】【废稿雨】【垃圾洪流】把对手的牌变成【垃圾】，满手牌时再抽到的牌会被销毁。【碎稿风暴】清理敌方战场，【纸缝医师】【修补书脊】帮你撑到疲劳阶段。"}
};

/* 关键字解释（卡牌预览时展示） */
const KEYWORDS={
  charge:{name:"冲锋",desc:"打出的当回合就可以攻击。"},
  taunt:{name:"嘲讽",desc:"敌方单位必须先攻击带嘲讽的单位。"},
  ignoreTaunt:{name:"无视嘲讽",desc:"攻击时可以绕过嘲讽，直接攻击任意目标。"},
  untargetable:{name:"隐匿",desc:"无法被敌方单位攻击（法术仍可伤害）。"},
  deploy:{name:"部署",desc:"从手牌打出时触发的效果。"},
  rebel:{name:"策反",desc:"把敌方单位抢到你的战场。绝大多数策反只持续到你的下个回合开始（限一回合）；【策动叛乱】为永久策反。"},
  core:{name:"核心",desc:"这套卡组的关键胜利手段。"},
  strikes:{name:"连击",desc:"每回合可以攻击多次。"},
  armor:{name:"护甲",desc:"先于生命值吸收伤害。在你的下个回合开始时清空，所以主要用来抵挡对手回合的攻击。"},
  decay:{name:"衰减",desc:"每个回合开始时，受到等同于【衰减】层数的伤害，可以叠加，无法被护甲抵挡。"},
  deathrattle:{name:"亡语",desc:"这个单位被消灭时触发的效果。"},
  fleeting:{name:"限时",desc:"只存在到你的下个回合开始，之后会消散。"},
  lockCards:{name:"出牌封锁",desc:"在被封锁的回合里，限制能打出的牌数或牌的类型。"},
  red:{name:"俄布",desc:"【俄罗斯布尔什维克红军】的简称（2 费 2/2）。"},
  gun:{name:"火炮",desc:"下水卡组里类型栏标有「火炮」的单位。饱和炮击、炮兵支援等卡牌会按火炮生效。"},
  member:{name:"架子班成员",desc:"045 卡组里类型栏标有「架子班」的单位，可被召集令、名片召唤从牌库召唤。"},
  scrap:{name:"废料",desc:"没有直接用处的低质量卡牌，是【转化】等效果的原料。它们也会占用手牌位置（上限 10 张）。"},
  convert:{name:"转化",desc:"转化 N：弃掉手牌中的 N 张【废料】，从费用为 N+1 到 N+3 的牌里发现 1 张，它的费用 -1。"},
  supply:{name:"补给",desc:"从你的牌库里随机展示 3 张牌，选择 1 张加入手牌；没选中的留在牌库里。"},
  recycle:{name:"回收",desc:"这个单位被消灭时，把卡面上写明的牌放回你的手牌（手牌已满则弃置）。"},
  regime:{name:"政体",desc:"苏苏特有的状态，同一时间只有一种：俄罗斯（新单位获得冲锋，但你无法获得护甲）；乌克兰（你的部署伤害和法术伤害 +1，但新单位生命 -1）；白俄罗斯（回合结束时获得 2 点护甲、新嘲讽单位 +0/+1，但新单位失去冲锋）。"},
  transfer:{name:"引渡",desc:"亡语的一种：这个单位被消灭时，灵魂转移到下一世——把对应的牌置入你的手牌（手牌已满则弃置）。"},
  consolidate:{name:"整编",desc:"消灭你所有的【俄布】，合并成一个攻击力和生命值等于它们总和的单位。"},
  permission:{name:"权限",desc:"打出这张牌需要先满足条件，条件不满足时无法打出。"},
  intel:{name:"情报",desc:"查看敌方手牌，并对其中 1 张施加影响。"},
  stealMoney:{name:"偷取金钱",desc:"猪瘟鱼的特殊资源。偷够 300 元后打出【逃跑】即可直接获胜。"},
  destroyCard:{name:"销毁",desc:"把指定的牌从手牌、牌库或战场移出本局对战。白猫销毁的敌牌会计入她的销毁数量；销毁时可在战斗记录中查看牌名。"},
  pollute:{name:"污染",desc:"把敌方手牌或牌库中的非垃圾牌直接变成【垃圾】，卡牌数量不变。"},
  junk:{name:"垃圾",desc:"1 费法术。打出时销毁自己牌库顶的一张牌，然后抽一张；牌库为空时抽牌会触发疲劳。"},
  fatigue:{name:"疲劳",desc:"牌库为空时每次尝试抽牌都会受到伤害：第 1 次 1 点、第 2 次 3 点、第 3 次 6 点，此后按 1+2+…+次数累加。"},
  overdraw:{name:"手牌上限",desc:"手牌最多 10 张。手牌已满时继续抽牌，新抽到的牌会被销毁，无法进入手牌。"}
};

const ALL_CARDS={};
for(const h in PROFILES)PROFILES[h].cards.forEach(c=>{c.hero=h;ALL_CARDS[h+":"+c.id]=c;});

function cardDef(hero,id){
  if(TOKENS[id])return TOKENS[id];
  const p=PROFILES[hero];
  const c=p&&p.cards.find(x=>x.id===id);
  if(c)return c;
  for(const h in AWA_CARDS)if(AWA_CARDS[h].id===id)return AWA_CARDS[h];
  if(CAMPAIGN_CARDS[id])return CAMPAIGN_CARDS[id];
  return null;
}

/* 默认卡组：按 n 值铺，严格遵守 limit，不足 40 时按费用从低到高补 */
function defaultDeck(hero){
  const cards=PROFILES[hero].cards,list=[],cnt={};
  const add=id=>{list.push(id);cnt[id]=(cnt[id]||0)+1;};
  cards.forEach(c=>{for(let i=0;i<Math.min(c.n===undefined?1:c.n,c.limit);i++)if(list.length<DECK_SIZE)add(c.id);});
  const sorted=[...cards].sort((a,b)=>a.cost-b.cost);
  let guard=0;
  while(list.length<DECK_SIZE&&guard++<500){
    const c=sorted.find(x=>(cnt[x.id]||0)<x.limit);
    if(!c)break;add(c.id);
  }
  return list;
}

/* ---- 预设卡组：只有七星保留两套（衰减流 / 星联邦流），其余卡牌师只保留官方推荐那一套 ---- */
/* 第二套卡组优先装入主题牌，再按官方推荐卡组补足 40 张，始终遵守携带上限。 */
/* 其余卡牌师的第二套预设（政委整编 / 策反突破 / 皇冠潜行 / 金库控制 / 火船炮击 /
   情报开发 / 覆盖轰炸 / 回收巨像 / 污染审判）实测 35%~46%，尚未成型，已撤下。
   本函数目前无人调用，保留给以后重新设计第二套卡组时使用。 */
function focusedDeck(hero,focus){
  const pool=PROFILES[hero].cards,list=[],count={};
  const add=id=>{
    const c=pool.find(x=>x.id===id);
    if(!c||list.length>=DECK_SIZE||(count[id]||0)>=c.limit)return false;
    list.push(id);count[id]=(count[id]||0)+1;return true;
  };
  for(const id of focus){
    const c=pool.find(x=>x.id===id);
    if(!c)continue;
    for(let i=0;i<c.limit;i++)add(id);
  }
  for(const id of defaultDeck(hero))add(id);
  for(const c of pool)while(add(c.id)){}
  return list;
}
const DECK_PRESETS={
  "苏苏":{
    /* 原体系：俄布海（吃俄罗斯政体的冲锋 + 整编 + 俄布增益） */
    "俄布海":defaultDeck("苏苏"),
    /* 第二套：白俄罗斯铁壁——极防 + 拖时间，几乎全是 blr 组件，只有极少数不吃俄布的通用牌。
       不打俄布体系（没有 red / redguard / redcharge / 整编 / 俄布增益），
       唯一制胜点是 10 费【钢铁洪流】：此后每个自己的回合开始固定产 1 张【红军坦克】。 */
    "白俄罗斯铁壁":[
      "blrConscript","blrConscript","blrConscript","blrConscript",
      "blrTrench","blrTrench","blrTrench","blrTrench",
      "blrGarrison","blrGarrison","blrGarrison","blrGarrison",
      "blrBastion","blrBastion","blrBastion","blrBastion",
      "blrRailway","blrRailway",
      "blrRepair","blrRepair","blrRepair","blrRepair",
      "blrFortify","blrFortify","blrFortify",
      "blrArmorWall","blrArmorWall","blrArmorWall",
      "blrSteelTide",
      "forward","forward","winter","intel","intel","intelSteal","intelSteal","supply","supply","redheavy","redheavy"
    ]
  },
  "字母":{"新式铺场":defaultDeck("字母")},
  "七星":{
    "衰减流":defaultDeck("七星"),
    "星联邦流":[
      "cometWatcher","cometWatcher","sentinel","sentinel","messenger","messenger","messenger",
      "bulwark","bulwark","scholar","orbitguard","orbitguard","gravityfield","starcore",
      "foresee","forecast","mana","mana","mana","timeShield","timeShield",
      "crystalBreak","gravitywell","starClimb","cardCap","gravityLock","gravityFold","stasis",
      "stasisfield","cometStrike","starlightPray","starlock","cometShackle",
      "cometTrail","starlightEcho","stardustBeacon",
      "cometTutor","cometTutor","cometWatcher","tune"
    ]
  },
  "核弹":{"禁忌召唤":defaultDeck("核弹")},
  "猪瘟鱼":{"偷钱逃跑":defaultDeck("猪瘟鱼")},
  "八幡":{"海盗速攻":defaultDeck("八幡")},
  "045":{"架子班召集":defaultDeck("045")},
  "下水":{"火炮阵地":defaultDeck("下水")},
  "绘梨衣":{"废料转化":defaultDeck("绘梨衣")},
  "白猫":{"毁稿疲劳":defaultDeck("白猫")}
};
/* 该卡牌师的预设卡组列表 */
function presets(hero){return DECK_PRESETS[hero]||null;}
/* 按名称取预设卡组 */
function presetDeck(hero,name){const ps=DECK_PRESETS[hero];return ps&&ps[name]?ps[name]:null;}
/* AI 用卡组：有预设时随机选一套，否则默认卡组 */
function aiDeck(hero){
  const ps=DECK_PRESETS[hero];if(!ps)return defaultDeck(hero);
  const keys=Object.keys(ps);return ps[keys[Math.floor(Math.random()*keys.length)]];
}

/* ============================================================
   剧情模式（Campaign）：剧情专属卡 / 升级 / 初始卡组 / 关卡配置
   - campaignOnly 的卡不进普通卡池、图鉴与卡组编辑器
   ============================================================ */
const CAMPAIGN_CARDS={
  /* ---- 八幡 · 渔村弱卡（带 4/3 张） ---- */
  cp_villager:{id:"cp_villager",name:"村民",cost:1,kind:"unit",art:"👤",atk:1,hp:1,text:"",campaignOnly:true,rarity:"common",hero:"八幡"},
  cp_fisher:{id:"cp_fisher",name:"渔夫",cost:2,kind:"unit",art:"🎣",atk:2,hp:2,text:"",campaignOnly:true,rarity:"common",hero:"八幡"},
  cp_fisherwoman:{id:"cp_fisherwoman",name:"渔妇",cost:2,kind:"unit",art:"🐟",atk:1,hp:2,text:"",campaignOnly:true,rarity:"common",hero:"八幡"},
  cp_net:{id:"cp_net",name:"渔网陷阱",cost:1,kind:"spell",art:"🕸",text:"对 1 个敌方单位造成 1 点伤害。",effect:"cpNet",campaignOnly:true,rarity:"common",hero:"八幡"},
  cp_guard:{id:"cp_guard",name:"渔民守卫",cost:2,kind:"unit",art:"🛡",atk:1,hp:3,text:"嘲讽。",taunt:true,campaignOnly:true,rarity:"rare",hero:"八幡"},
  cp_watcher:{id:"cp_watcher",name:"灯塔守望员",cost:3,kind:"unit",art:"🗼",atk:2,hp:3,text:"部署：抽 1 张牌。",effect:"draw",campaignOnly:true,rarity:"rare",hero:"八幡"},
  cp_tinker:{id:"cp_tinker",name:"修补匠",cost:3,kind:"unit",art:"🔨",atk:2,hp:3,text:"嘲讽。",taunt:true,campaignOnly:true,rarity:"rare",hero:"八幡"},
  cp_drum:{id:"cp_drum",name:"战鼓",cost:1,kind:"spell",art:"🥁",text:"抽 1 张牌。",effect:"draw",campaignOnly:true,rarity:"common",hero:"八幡"},
  cp_campfire:{id:"cp_campfire",name:"篝火",cost:2,kind:"spell",art:"🔥",text:"恢复 3 点生命。",effect:"heal3",campaignOnly:true,rarity:"common",hero:"八幡"},
  cp_coast:{id:"cp_coast",name:"海岸防线",cost:3,kind:"spell",art:"🌊",text:"获得 3 点护甲。",effect:"armor3",campaignOnly:true,rarity:"rare",hero:"八幡"},
  cp_wall:{id:"cp_wall",name:"沙袋墙",cost:2,kind:"unit",art:"🧱",atk:0,hp:5,text:"嘲讽。",taunt:true,campaignOnly:true,rarity:"common",hero:"八幡"},
  cp_hut:{id:"cp_hut",name:"渔村小屋",cost:1,kind:"unit",art:"🏠",atk:0,hp:3,text:"嘲讽。",taunt:true,campaignOnly:true,rarity:"common",hero:"八幡"},
  /* ---- 首通奖励池（special · 限 2 张） ---- */
  cp_villageHorn:{id:"cp_villageHorn",name:"渔村号角",cost:3,kind:"spell",art:"📯",text:"召唤 2 个 2/1 冲锋【起义村民】。",effect:"cpUprising",campaignOnly:true,rarity:"special",hero:"八幡"},
  cp_militiaCaptain:{id:"cp_militiaCaptain",name:"民兵队长",cost:4,kind:"unit",art:"⚔",atk:3,hp:3,text:"嘲讽。部署：你的所有单位获得 +1/+1。",taunt:true,effect:"buffAll1",campaignOnly:true,rarity:"special",hero:"八幡"},
  /* ---- 衍生物 ---- */
  cp_uprising:{id:"cp_uprising",name:"起义村民",cost:0,kind:"unit",art:"✊",atk:2,hp:1,text:"冲锋。",charge:true,campaignOnly:true,rarity:"common",hero:"八幡"},
  /* ---- 第一关敌人：土匪（前期弱 · 后期提速） ---- */
  bd_thug:{id:"bd_thug",name:"土匪喽啰",cost:1,kind:"unit",art:"🥷",atk:1,hp:1,text:"",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_mugger:{id:"bd_mugger",name:"拦路贼",cost:1,kind:"unit",art:"🗡",atk:1,hp:2,text:"",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_raider:{id:"bd_raider",name:"劫掠者",cost:2,kind:"unit",art:"⚔",atk:2,hp:1,text:"冲锋。",charge:true,campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_rogue:{id:"bd_rogue",name:"恶棍",cost:2,kind:"unit",art:"🔪",atk:2,hp:2,text:"",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_scout:{id:"bd_scout",name:"侦察兵",cost:2,kind:"unit",art:"👁",atk:1,hp:2,text:"",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_brute:{id:"bd_brute",name:"土匪打手",cost:3,kind:"unit",art:"💪",atk:3,hp:3,text:"",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_marauder:{id:"bd_marauder",name:"掠夺者",cost:3,kind:"unit",art:"🏹",atk:2,hp:4,text:"",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_arson:{id:"bd_arson",name:"放火犯",cost:4,kind:"unit",art:"🔥",atk:4,hp:3,text:"冲锋。",charge:true,campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_boss:{id:"bd_boss",name:"土匪头目",cost:5,kind:"unit",art:"👑",atk:5,hp:5,text:"嘲讽。",taunt:true,campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_torch:{id:"bd_torch",name:"火把",cost:1,kind:"spell",art:"🕯",text:"对敌方英雄造成 1 点伤害。",effect:"hero1",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_rob:{id:"bd_rob",name:"抢劫",cost:2,kind:"spell",art:"💰",text:"对敌方英雄造成 2 点伤害。",effect:"hero2",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_levy:{id:"bd_levy",name:"强征",cost:3,kind:"spell",art:"⚖",text:"对敌方英雄造成 3 点伤害。",effect:"hero3",campaignOnly:true,rarity:"common",hero:"土匪"},
  bd_burn:{id:"bd_burn",name:"洗劫村庄",cost:5,kind:"spell",art:"🏚",text:"对敌方英雄造成 5 点伤害。",effect:"hero5",campaignOnly:true,rarity:"common",hero:"土匪"}
};
/* 剧情专属卡升级阶梯：+1/+1 → 冲锋 → 嘲讽 → 部署抽 1 */
const CAMPAIGN_UPGRADES={
  cp_villager:[
    {cost:0,name:"村民",desc:"1费 1/1"},
    {cost:60,name:"武装村民",atk:1,hp:1,desc:"1费 2/2"},
    {cost:90,name:"冲锋村民",charge:true,desc:"1费 2/2 冲锋"},
    {cost:120,name:"捍卫村民",taunt:true,desc:"1费 2/2 冲锋 嘲讽"},
    {cost:150,name:"老兵村民",deployDraw:1,desc:"1费 2/2 冲锋 嘲讽 部署抽1"}
  ],
  cp_fisher:[
    {cost:0,name:"渔夫",desc:"2费 2/2"},
    {cost:80,name:"勇武渔夫",atk:1,hp:1,desc:"2费 3/3"},
    {cost:120,name:"冲锋渔夫",charge:true,desc:"2费 3/3 冲锋"},
    {cost:160,name:"捍卫渔夫",taunt:true,desc:"2费 3/3 冲锋 嘲讽"},
    {cost:200,name:"老兵渔夫",deployDraw:1,desc:"2费 3/3 冲锋 嘲讽 部署抽1"}
  ]
};
/* 三个存档位各自的初始弱卡组（30 张，全部剧情专属） */
const CAMPAIGN_INITIAL_DECKS={
  "八幡":[
    ["cp_villager","cp_villager","cp_villager","cp_villager","cp_fisher","cp_fisher","cp_fisher","cp_fisher",
     "cp_fisherwoman","cp_fisherwoman","cp_fisherwoman","cp_fisherwoman","cp_net","cp_net","cp_net","cp_net",
     "cp_guard","cp_guard","cp_guard","cp_watcher","cp_watcher","cp_watcher","cp_tinker","cp_tinker","cp_tinker",
     "cp_campfire","cp_campfire","cp_campfire","cp_coast","cp_coast"],
    ["cp_villager","cp_villager","cp_villager","cp_villager","cp_fisher","cp_fisher","cp_fisher","cp_fisher",
     "cp_fisherwoman","cp_fisherwoman","cp_fisherwoman","cp_fisherwoman","cp_hut","cp_guard","cp_guard","cp_guard",
     "cp_tinker","cp_tinker","cp_tinker","cp_wall","cp_wall","cp_net","cp_net","cp_net","cp_net",
     "cp_coast","cp_coast","cp_campfire","cp_campfire","cp_campfire"],
    ["cp_villager","cp_villager","cp_villager","cp_villager","cp_fisher","cp_fisher","cp_fisher","cp_fisher",
     "cp_fisherwoman","cp_fisherwoman","cp_fisherwoman","cp_fisherwoman","cp_net","cp_net","cp_net","cp_net",
     "cp_drum","cp_drum","cp_drum","cp_guard","cp_guard","cp_guard","cp_tinker","cp_tinker","cp_tinker",
     "cp_campfire","cp_campfire","cp_campfire","cp_coast","cp_coast"]
  ]
};
/* 敌人（土匪）40 张：前期小卒多、后期强卡提速 */
const BANDIT_DECK=[
  "bd_thug","bd_thug","bd_thug","bd_thug","bd_mugger","bd_mugger","bd_mugger","bd_mugger",
  "bd_raider","bd_raider","bd_raider","bd_raider","bd_rogue","bd_rogue","bd_rogue","bd_rogue",
  "bd_scout","bd_scout","bd_scout","bd_scout","bd_brute","bd_brute","bd_brute","bd_marauder","bd_marauder","bd_marauder",
  "bd_arson","bd_arson","bd_arson","bd_boss","bd_boss","bd_torch","bd_torch","bd_torch","bd_torch",
  "bd_rob","bd_rob","bd_rob","bd_rob","bd_levy","bd_levy","bd_levy","bd_burn","bd_burn"
];
/* 关卡配置：intro=AVG 开场；survive=星级所需玩家回合数；rewards=星级金币；rewardPool=首通随机卡 */
const CAMPAIGNS={
  "八幡":{
    intro:[
      "潮水拍打着渔村的栈桥，远处的地平线冒起了黑烟。",
      "「村子……快跑啊！土匪来了！」",
      "八幡从睡梦中惊醒，抓起船桨冲出家门。",
      "村口的渔民们握紧了鱼叉——今晚，他们要为家园而战。",
      "撑过土匪的攻势，守住渔村！"
    ],
    chapters:{
      ch1:{
        title:"渔村烽烟",
        enemy:{hero:"土匪",deck:BANDIT_DECK,ai:"bandit1",hp:30},
        survive:[6,9,12],
        rewards:{1:100,2:150,3:250},
        rewardPool:["cp_villageHorn","cp_militiaCaptain"],
        events:{
          star1:"「撑住！第一波攻势退了——」渔民们喘着粗气，互相搀扶。",
          star2:"「居然撑了这么久……乡亲们，说不定咱们能赢！」",
          star3:"「天快亮了。土匪们开始撤退——渔村，守住了！」",
          killBoss:"「土匪头目倒下了！土匪们慌了神——」",
          enemyBurn:"「村子着火了！快扑灭它——」",
          lowHp:"「八幡，你还能站起来吗……？」",
          win:"土匪们丢下火把，逃进了夜色。渔村的灯火，重新亮了起来。"
        }
      }
    }
  }
};
function campaignOf(hero){return CAMPAIGNS[hero]||null;}
function campaignInitialDeck(hero,slot){const d=CAMPAIGN_INITIAL_DECKS[hero];return d&&d[slot]?d[slot]:null;}
function campaignUpgradePath(hero,cardId){return CAMPAIGN_UPGRADES[cardId]||null;}
function rarityLimit(card){return card&&RARITY[card.rarity]?RARITY[card.rarity].limit:card?card.limit||4:0;}

/* 校验卡组：40 张、id 合法、不超上限。返回 null 表示合法，否则返回原因 */
function deckError(hero,list){
  if(!PROFILES[hero])return "未知卡牌师";
  if(!Array.isArray(list))return "卡组格式错误";
  if(list.length!==DECK_SIZE)return `卡组必须恰好 ${DECK_SIZE} 张`;
  const cnt={};
  for(const id of list){
    const c=PROFILES[hero].cards.find(x=>x.id===id);
    if(!c)return "卡组里有不存在的卡牌";
    if(c.campaignOnly)return "剧情专属卡不能在普通卡组中使用";
    cnt[id]=(cnt[id]||0)+1;
    if(cnt[id]>c.limit)return `【${c.name}】最多携带 ${c.limit} 张`;
  }
  return null;
}

/* ============================================================
   数值热更新：overrides = { "卡牌师:卡牌id": {cost, atk, hp, limit, n, name, text, flavor} }
   每次应用都先恢复原始数值，因此删除某条覆盖即可还原
   ============================================================ */
const PATCHABLE={cost:"num",atk:"num",hp:"num",limit:"num",n:"num",name:"str",text:"str",flavor:"str",rarity:"rarity"};
const BASE={};
for(const h in PROFILES)PROFILES[h].cards.forEach(c=>{const b={};for(const k in PATCHABLE)if(c[k]!==undefined)b[k]=c[k];BASE[h+":"+c.id]=b;});
function findCard(key){
  const i=String(key).lastIndexOf(":");if(i<0)return null;
  const h=key.slice(0,i),id=key.slice(i+1);
  return PROFILES[h]?PROFILES[h].cards.find(c=>c.id===id)||null:null;
}
/* 校验覆盖表，返回错误列表（空数组表示合法） */
function checkOverrides(map){
  const errs=[];
  if(!map||typeof map!=="object"||Array.isArray(map))return["数值表必须是一个对象 { \"卡牌师:卡牌id\": {...} }"];
  for(const key in map){
    const c=findCard(key);if(!c){errs.push(`找不到卡牌：${key}`);continue;}
    const o=map[key];if(!o||typeof o!=="object"){errs.push(`${key}：必须是对象`);continue;}
    for(const f in o){
      const t=PATCHABLE[f];
      if(!t){errs.push(`${key}：不支持修改字段「${f}」`);continue;}
      if(t==="num"&&!(Number.isInteger(o[f])&&o[f]>=0&&o[f]<=99))errs.push(`${key}.${f}：必须是 0~99 的整数`);
      if(t==="str"&&!(typeof o[f]==="string"&&o[f].length<=120))errs.push(`${key}.${f}：必须是 120 字以内的文字`);
      // 后台把 name 改成空串会产生「有费用、无名字」的坏卡，这里堵住。
      if(f==="name"&&(typeof o[f]!=="string"||!o[f].trim()))errs.push(`${key}.name：名称不能为空`);
      if(t==="rarity"&&!RARITY[o[f]])errs.push(`${key}.rarity：必须是 common / rare / special / elite 之一`);
      if((f==="atk"||f==="hp")&&c.kind!=="unit")errs.push(`${key}：法术牌没有 ${f}`);
      if(f==="hp"&&o[f]<1)errs.push(`${key}.hp：生命值至少为 1`);
      if(f==="limit"&&o[f]<1)errs.push(`${key}.limit：携带上限至少为 1`);
    }
  }
  for(const h in PROFILES){
    let sum=0;PROFILES[h].cards.forEach(c=>{
      // DIY 角色不在 BASE 里（BASE 只收录原版卡），这里要兜底，否则后台热更新会 500
      const o=map[h+":"+c.id]||{},base=BASE[h+":"+c.id]||{};
      sum+=o.limit!==undefined?o.limit:(RARITY[o.rarity]?RARITY[o.rarity].limit:(base.limit!==undefined?base.limit:c.limit));
    });
    if(sum<DECK_SIZE)errs.push(`${h}：所有卡牌的携带上限加起来只有 ${sum}，不足 ${DECK_SIZE} 张`);
  }
  return errs;
}
let overridesRev="";
function applyOverrides(map,rev){
  for(const key in BASE){const c=findCard(key);if(!c)continue;for(const k in PATCHABLE)delete c[k];Object.assign(c,BASE[key]);}
  for(const key in (map||{})){
    const c=findCard(key);if(!c)continue;
    const o=map[key];Object.assign(c,o);
    if(o.rarity&&RARITY[o.rarity]&&o.limit===undefined){c.limit=RARITY[o.rarity].limit;if(c.n>c.limit)c.n=c.limit;}
  }
  overridesRev=rev||"";
}

return{REGIMES,RARITY,RARITY_ORDER,MAX_BOARD,MAX_HAND,ESCAPE_TARGET,STEAL_UNIT,DECK_SIZE,MAX_ENERGY,PROFILES,TOKENS,AWA_CARDS,COLORS,HERO_INFO,KEYWORDS,ALL_CARDS,cardDef,defaultDeck,deckError,
  DECK_PRESETS,presets,presetDeck,aiDeck,
  CAMPAIGN_CARDS,CAMPAIGNS,CAMPAIGN_UPGRADES,campaignOf,campaignInitialDeck,campaignUpgradePath,rarityLimit,
  PATCHABLE,checkOverrides,applyOverrides,baseOf:key=>BASE[key],get overridesRev(){return overridesRev;}};
});
