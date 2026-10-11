/* 皇冠对决 · 卡牌数据（浏览器与服务器共用）
   字段：n = 默认卡组张数，limit = 携带上限；gun = 火炮，member = 架子班成员 */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.DuelCards=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";
const MAX_BOARD=6,MAX_HAND=10,ESCAPE_TARGET=25,DECK_SIZE=40,MAX_ENERGY=10;

const PROFILES={
  "苏苏":{faction:"彗星国 · 架子班",style:"苏维埃体系 · 铺场爆发",hp:32,cards:[
    {id:"red",name:"俄罗斯布尔什维克红军",cost:2,kind:"unit",art:"★",atk:2,hp:3,text:"冲锋。",charge:true,n:4,limit:4},
    {id:"latvian",name:"拉脱维亚布尔什维克红军",cost:1,kind:"unit",art:"★",atk:5,hp:5,text:"冲锋。每次攻击后，失去 1 点生命。",charge:true,effect:"selfDamage1",n:1,limit:1},
    {id:"ukr",name:"乌克兰红军",cost:3,kind:"unit",art:"✦",atk:4,hp:3,text:"部署：对 1 个敌方单位造成 4 点伤害。",effect:"choose4",n:2,limit:2},
    {id:"blr",name:"白俄罗斯卫队",cost:4,kind:"unit",art:"◆",atk:5,hp:5,text:"嘲讽。",taunt:true,n:2,limit:2},
    {id:"commissar",name:"苏维埃政委",cost:2,kind:"unit",art:"☭",atk:2,hp:3,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"veteran",name:"红军老兵",cost:5,kind:"unit",art:"▣",atk:6,hp:6,text:"嘲讽。",taunt:true,n:1,limit:2},
    {id:"marshal",name:"炮兵总司令",cost:5,kind:"unit",art:"✚",atk:5,hp:5,text:"部署：对敌方英雄造成 3 点伤害。",effect:"hero3",n:1,limit:1},
    {id:"kazakh",name:"哈萨克布尔什维克红军",cost:5,kind:"unit",art:"☭",atk:1,hp:8,text:"嘲讽。部署：使你的所有【俄布】获得 +2/+2。",taunt:true,effect:"buffRed",n:1,limit:1},
    {id:"tank",name:"红军坦克",cost:4,kind:"unit",art:"▦",atk:4,hp:5,text:"嘲讽。",taunt:true,n:1,limit:2},
    {id:"redguard",name:"赤卫队",cost:1,kind:"unit",art:"⚑",atk:2,hp:1,text:"冲锋。",charge:true,n:2,limit:3},
    {id:"advisor",name:"政委顾问",cost:3,kind:"unit",art:"◇",atk:3,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:1,limit:2},
    {id:"katyusha",name:"喀秋莎火箭炮",cost:4,kind:"unit",art:"✣",atk:4,hp:4,text:"部署：对至多 3 个敌方单位各造成 2 点伤害。",effect:"choose3x2",n:1,limit:1},
    {id:"armoredtrain",name:"装甲列车",cost:6,kind:"unit",art:"▦",atk:7,hp:7,text:"嘲讽。",taunt:true,n:1,limit:1},
    {id:"sniper",name:"红军狙击手",cost:2,kind:"unit",art:"◉",atk:2,hp:2,text:"部署：对 1 个敌方单位造成 2 点伤害。",effect:"choose2",n:2,limit:2},
    {id:"mobilize",name:"红色动员令",cost:1,kind:"spell",art:"☭",text:"召唤 1 个【俄布】。",effect:"summonRed1",n:2,limit:3},
    {id:"october",name:"十月革命",cost:3,kind:"spell",art:"☭",text:"召唤 2 个【俄布】。",effect:"summonRed2",n:3,limit:3},
    {id:"plan",name:"五年计划",cost:2,kind:"spell",art:"⇪",text:"费用上限 +1（本回合即可使用），抽 1 张牌。",effect:"ramp",n:2,limit:2},
    {id:"war",name:"战时共产主义",cost:2,kind:"spell",art:"▣",text:"获得 3 点护甲，抽 1 张牌。",effect:"armor3draw",n:2,limit:2},
    {id:"forward",name:"为了革命的胜利前进",cost:3,kind:"spell",art:"→",text:"使你的所有单位获得 +2/+2。",effect:"buffAll2",n:2,limit:2},
    {id:"artillery",name:"全亚洲炮兵总司令",cost:7,kind:"spell",art:"✣",text:"对敌方英雄和所有敌方单位造成 5 点伤害。",effect:"aoe5",n:1,limit:1},
    {id:"peoplearmy",name:"人民军",cost:8,kind:"spell",art:"☭",text:"用【俄布】填满你的手牌和战场。",effect:"fillRed",n:1,limit:1},
    {id:"reddawn",name:"赤色黎明",cost:4,kind:"spell",art:"✹",text:"对所有敌方单位造成 2 点伤害。你每控制 1 个【俄布】，伤害 +1。",effect:"redDawn",n:1,limit:1},
    {id:"comintern",name:"共产国际",cost:2,kind:"spell",art:"☭",text:"抽 2 张牌。",effect:"draw2",n:2,limit:2},
    {id:"passion",name:"革命热情",cost:1,kind:"spell",art:"✹",text:"使 1 个友方单位获得 +2/+2，抽 1 张牌。",effect:"buffOneDraw",n:1,limit:2},
    {id:"winter",name:"冬将军",cost:4,kind:"spell",art:"❄",text:"使所有敌方单位的攻击力 -2。",effect:"enemyAtkDown",n:1,limit:1}
  ]},
  "字母":{faction:"鸭子系 · 联合政府",style:"新式战法 · 策动叛乱",hp:30,cards:[
    {id:"sentry",name:"卫戍哨兵",cost:1,kind:"unit",art:"盾",atk:1,hp:3,text:"嘲讽。",taunt:true,n:2,limit:3},
    {id:"shadow",name:"影子特工",cost:2,kind:"unit",art:"◇",atk:3,hp:1,text:"冲锋。",charge:true,n:2,limit:3},
    {id:"vanguard",name:"新式先锋",cost:2,kind:"unit",art:"A",atk:3,hp:2,text:"冲锋。",charge:true,n:2,limit:3},
    {id:"outpost",name:"联合政府哨站",cost:2,kind:"unit",art:"▤",atk:2,hp:5,text:"嘲讽。部署：抽 1 张牌。",taunt:true,effect:"draw",n:2,limit:2},
    {id:"commando",name:"突击队员",cost:3,kind:"unit",art:"⚑",atk:4,hp:2,text:"冲锋。",charge:true,n:2,limit:3},
    {id:"duckguard",name:"鸭子联合军",cost:3,kind:"unit",art:"◇",atk:4,hp:3,text:"",flavor:"稳定推进。",n:3,limit:3},
    {id:"tacticsquad",name:"战术小队",cost:3,kind:"unit",art:"▤",atk:3,hp:3,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"armored",name:"装甲突击车",cost:4,kind:"unit",art:"▤",atk:5,hp:4,text:"冲锋。",charge:true,n:2,limit:2},
    {id:"executor",name:"文件执行官",cost:4,kind:"unit",art:"✎",atk:5,hp:5,text:"攻击敌方英雄时，额外造成 1 点伤害。",n:2,limit:2},
    {id:"over",name:"超模单位",cost:5,kind:"unit",art:"⬢",atk:7,hp:7,text:"",flavor:"纯粹的超模数值。",n:2,limit:2},
    {id:"guard",name:"联合政府卫队",cost:6,kind:"unit",art:"◈",atk:8,hp:8,text:"",flavor:"新式战法的顶点。",n:1,limit:1},
    {id:"heavytank",name:"重型坦克",cost:6,kind:"unit",art:"▦",atk:7,hp:7,text:"嘲讽。",taunt:true,n:1,limit:1},
    {id:"order",name:"精准指令",cost:1,kind:"spell",art:"⌁",text:"抽 2 张牌。",effect:"draw2",n:2,limit:3},
    {id:"evasion",name:"战术规避",cost:2,kind:"spell",art:"◌",text:"直到你的下个回合开始，敌方单位无法攻击你的英雄。",effect:"evasion",n:2,limit:2},
    {id:"rebelWeakest",name:"内应接应",cost:2,kind:"spell",art:"⚡",text:"策反生命值最低的敌方单位，抽 1 张牌。",effect:"rebelWeakest",n:2,limit:2},
    {id:"newwar",name:"新式战法",cost:2,kind:"spell",art:"A",text:"使你的所有单位获得 +1/+1。",effect:"buffAll1",n:2,limit:3},
    {id:"rebelLowest",name:"煽动哗变",cost:3,kind:"spell",art:"⚡",text:"策反攻击力最低的敌方单位。",effect:"rebelLowest",n:2,limit:2},
    {id:"disruption",name:"阵型瓦解",cost:3,kind:"spell",art:"⊘",text:"所有敌方单位在下个回合无法攻击。对敌方英雄造成 2 点伤害。",effect:"disruption",n:2,limit:2},
    {id:"wargame",name:"战法推演",cost:3,kind:"spell",art:"⌘",text:"获得 3 点护甲，抽 1 张牌。",effect:"armor3draw",n:1,limit:2},
    {id:"break",name:"直伤突破",cost:3,kind:"spell",art:"⚡",text:"对敌方英雄造成 5 点伤害。",effect:"damage5",n:1,limit:2},
    {id:"rebel",name:"策动叛乱",cost:4,kind:"spell",art:"⚡",text:"策反 1 个敌方单位。",effect:"rebel",n:1,limit:1},
    {id:"takeover",name:"战术接管",cost:4,kind:"spell",art:"⛓",text:"策反攻击力最高的敌方单位。",effect:"takeover",n:1,limit:1},
    {id:"remove",name:"消除限制",cost:4,kind:"spell",art:"⊘",text:"摧毁攻击力最高的敌方单位。",effect:"remove",n:1,limit:1}
  ]},
  "七星":{faction:"彗星国 · 架子班",style:"叠血压槽 · 彗星冲击 OTK",hp:34,cards:[
    {id:"cometWatcher",name:"彗星观察者",cost:2,kind:"unit",art:"👁",atk:1,hp:3,text:"每当你获得 1 张手牌，恢复 2 点生命。",effect:"drawHeal",n:3,limit:3},
    {id:"sentinel",name:"星轨哨兵",cost:2,kind:"unit",art:"盾",atk:1,hp:3,text:"嘲讽。部署：获得 2 点护甲。",taunt:true,effect:"armor2",n:2,limit:3},
    {id:"bulwark",name:"星尘壁垒",cost:3,kind:"unit",art:"▥",atk:2,hp:6,text:"嘲讽。部署：恢复 2 点生命。",taunt:true,effect:"heal2",n:1,limit:2},
    {id:"messenger",name:"彗星信使",cost:2,kind:"unit",art:"◇",atk:2,hp:3,text:"部署：抽 1 张牌，恢复 1 点生命。",effect:"drawHeal1",n:3,limit:3},
    {id:"stardust",name:"星尘哨兵",cost:3,kind:"unit",art:"✦",atk:3,hp:4,text:"部署：获得 2 点护甲。",effect:"armor2",n:2,limit:2},
    {id:"scholar",name:"彗星学者",cost:3,kind:"unit",art:"◇",atk:3,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:1,limit:2},
    {id:"orbitguard",name:"星轨卫兵",cost:4,kind:"unit",art:"▥",atk:4,hp:6,text:"嘲讽。",taunt:true,n:2,limit:2},
    {id:"gravityfield",name:"引力场",cost:5,kind:"unit",art:"◉",atk:4,hp:8,text:"嘲讽。部署：敌方的费用上限 -1。",taunt:true,effect:"energyDown",n:1,limit:1},
    {id:"cometImpact",name:"彗星冲击",cost:4,kind:"spell",art:"☄",text:"如果你的生命值 + 护甲 ≥ 40，对敌方英雄造成 40 点伤害。",effect:"cometImpact",core:true,n:1,limit:1},
    {id:"cometPosition",name:"彗星定位",cost:3,kind:"spell",art:"⌖",text:"从牌库中将【彗星冲击】加入手牌。如果没有，改为抽 2 张牌。",effect:"tutorCometImpact",n:2,limit:2},
    {id:"foresee",name:"占星术",cost:1,kind:"spell",art:"✧",text:"查看牌库顶的 2 张牌，将其中 1 张加入手牌，其余置于牌库底。",effect:"foresee",n:2,limit:3},
    {id:"forecast",name:"七星预报",cost:1,kind:"spell",art:"☼",text:"抽 2 张牌。",effect:"draw2",n:2,limit:2},
    {id:"trace",name:"彗星轨迹",cost:2,kind:"spell",art:"⌁",text:"获得 6 点护甲，抽 2 张牌。",effect:"traceBoost",n:2,limit:2},
    {id:"timeShield",name:"时光护盾",cost:2,kind:"spell",art:"⛨",text:"获得 5 点护甲，恢复 3 点生命。",effect:"timeShield2",n:2,limit:2},
    {id:"nebulaShield",name:"星云护盾",cost:4,kind:"spell",art:"⛨",text:"获得 10 点护甲，抽 2 张牌。",effect:"nebulaShield2",n:1,limit:1},
    {id:"mana",name:"法力压制",cost:2,kind:"spell",art:"-",text:"对敌方英雄造成 2 点伤害，敌方的费用上限 -1。",effect:"manaBurn",n:3,limit:3},
    {id:"gravitywell",name:"引力井",cost:3,kind:"spell",art:"◉",text:"敌方的费用上限 -1，抽 1 张牌。",effect:"energyDownDraw",n:2,limit:2},
    {id:"starClimb",name:"星轨攀升",cost:3,kind:"spell",art:"⇅",text:"你的费用上限 +1（本回合即可使用），敌方的费用上限 -1。",effect:"starClimb",n:2,limit:2},
    {id:"stasis",name:"静滞领域",cost:4,kind:"spell",art:"◌",text:"使所有敌方单位的攻击力 -2。",effect:"enemyAtkDown",n:1,limit:1},
    {id:"timeslow",name:"时间延缓",cost:2,kind:"spell",art:"◌",text:"使所有敌方单位的攻击力 -1。",effect:"enemyAtkDown1",n:2,limit:2},
    {id:"gravityLock",name:"引力锁定",cost:3,kind:"spell",art:"⛓",text:"所有敌方单位在下个回合无法攻击。",effect:"gravityLock",n:1,limit:2},
    {id:"gravityFold",name:"引力折叠",cost:3,kind:"spell",art:"⊘",text:"使敌方当前手牌的费用永久 +1。",effect:"costRaise",n:1,limit:1},
    {id:"cometfall",name:"彗星陨落",cost:6,kind:"spell",art:"☄",text:"对敌方英雄造成 6 点伤害。",effect:"damage6",n:1,limit:1}
  ]},
  "核弹":{faction:"凹槽帝国",style:"禁忌召唤 · Superman 单卡压制",hp:28,cards:[
    {id:"stealth",name:"隐秘行踪",cost:2,kind:"unit",art:"◇",atk:2,hp:5,text:"",flavor:"行踪隐秘迅速。",n:2,limit:2},
    {id:"barrier",name:"隐秘结界",cost:5,kind:"unit",art:"▥",atk:4,hp:9,text:"嘲讽。",taunt:true,n:2,limit:2},
    {id:"teaunit",name:"安静旁观",cost:3,kind:"unit",art:"○",atk:3,hp:4,text:"",flavor:"只是路过看看。",n:2,limit:2},
    {id:"teaboy",name:"红茶侍者",cost:2,kind:"unit",art:"◒",atk:2,hp:3,text:"部署：获得 2 点护甲。",effect:"armor2",n:1,limit:2},
    {id:"crownkeeper",name:"皇冠守护者",cost:4,kind:"unit",art:"♛",atk:4,hp:6,text:"嘲讽。部署：抽 1 张牌。",taunt:true,effect:"draw",n:2,limit:2},
    {id:"superman",name:"超人 SUPERMAN",cost:8,kind:"unit",art:"S",atk:10,hp:10,text:"冲锋。无视嘲讽。每回合可以攻击 2 次。",strikes:2,charge:true,ignoreTaunt:true,n:1,limit:1},
    {id:"refugee",name:"旧大陆难民",cost:1,kind:"unit",art:"◇",atk:1,hp:3,text:"嘲讽。",taunt:true,n:3,limit:3},
    {id:"spy",name:"凹槽密探",cost:3,kind:"unit",art:"◇",atk:3,hp:5,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"crownguard",name:"皇冠卫队",cost:5,kind:"unit",art:"▦",atk:5,hp:8,text:"嘲讽。",taunt:true,n:3,limit:3},
    {id:"forbiddenscholar",name:"禁忌学者",cost:4,kind:"unit",art:"⌬",atk:4,hp:5,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"forbiddenlurker",name:"禁忌潜伏者",cost:3,kind:"unit",art:"◉",atk:3,hp:4,text:"无视嘲讽。",ignoreTaunt:true,n:2,limit:2},
    {id:"phasepiercer",name:"相位穿透者",cost:3,kind:"unit",art:"◈",atk:3,hp:4,text:"无视嘲讽。",ignoreTaunt:true,n:2,limit:2},
    {id:"chronoassassin",name:"时空刺客",cost:4,kind:"unit",art:"✧",atk:5,hp:4,text:"无视嘲讽。",ignoreTaunt:true,n:1,limit:1},
    {id:"ironwall",name:"凹槽铁壁",cost:3,kind:"unit",art:"▥",atk:2,hp:6,text:"嘲讽。",taunt:true,n:1,limit:2},
    {id:"revenge",name:"例行复仇",cost:3,kind:"spell",art:"☄",text:"对敌方英雄造成 7 点伤害。",effect:"damage7",n:2,limit:2},
    {id:"tea",name:"红茶时间",cost:2,kind:"spell",art:"◒",text:"获得 3 点护甲，抽 1 张牌。",effect:"armor3draw",n:1,limit:2},
    {id:"escape",name:"逃亡路线",cost:2,kind:"spell",art:"↗",text:"抽 2 张牌，恢复 2 点生命。",effect:"draw2heal2",n:1,limit:2},
    {id:"filter",name:"禁忌检索",cost:2,kind:"spell",art:"⌕",text:"抽 1 张牌。如果抽到【超人】，其费用 -2。",effect:"filterSuperman",n:2,limit:2},
    {id:"resonance",name:"皇冠共鸣",cost:3,kind:"spell",art:"♛",text:"从牌库中将【超人】加入手牌。如果没有，改为抽 2 张牌。",effect:"tutorSuperman",n:2,limit:2},
    {id:"gaze",name:"皇冠凝视",cost:2,kind:"spell",art:"♛",text:"查看牌库顶的 3 张牌，将其中 1 张加入手牌，其余置于牌库底。",effect:"scry",n:2,limit:2},
    {id:"ritual",name:"皇冠仪式",cost:5,kind:"spell",art:"♛",text:"从牌库中召唤【超人】。",effect:"summonSuperman",n:1,limit:1},
    {id:"forbiddenknowledge",name:"禁忌知识",cost:3,kind:"spell",art:"⌬",text:"抽 3 张牌。",effect:"draw3",n:2,limit:2},
    {id:"whisper",name:"皇冠低语",cost:1,kind:"spell",art:"♛",text:"抽 1 张牌，恢复 2 点生命。",effect:"draw1heal2",n:1,limit:2}
  ]},
  "猪瘟鱼":{faction:"凹槽帝国",style:"偷钱逃跑 · 特殊胜利",hp:30,cards:[
    {id:"assistant",name:"会计助理",cost:1,kind:"unit",art:"◇",atk:1,hp:3,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:3},
    {id:"ledger",name:"财政账本",cost:2,kind:"unit",art:"▤",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"collector",name:"收米专员",cost:2,kind:"unit",art:"$",atk:2,hp:3,text:"部署：偷取 3 元，对敌方英雄造成 1 点伤害。",effect:"steal3hero1",n:1,limit:2},
    {id:"auditor",name:"审计员",cost:2,kind:"unit",art:"▤",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"broker",name:"账房先生",cost:3,kind:"unit",art:"◇",atk:3,hp:4,text:"部署：偷取 2 元。",effect:"steal2",n:1,limit:2},
    {id:"taxman",name:"税官",cost:3,kind:"unit",art:"$",atk:3,hp:5,text:"部署：偷取 4 元。",effect:"steal4",n:2,limit:2},
    {id:"accountant",name:"精算主管",cost:4,kind:"unit",art:"#",atk:4,hp:5,text:"部署：获得 1 点护甲。",effect:"armor1",n:2,limit:2},
    {id:"vault",name:"金库守卫",cost:4,kind:"unit",art:"▦",atk:3,hp:7,text:"嘲讽。部署：获得 2 点护甲。",taunt:true,effect:"armor2",n:2,limit:2},
    {id:"safehouse",name:"软禁室",cost:5,kind:"unit",art:"▣",atk:5,hp:7,text:"嘲讽。",taunt:true,n:2,limit:2},
    {id:"vaultgate",name:"金库大门",cost:6,kind:"unit",art:"▣",atk:6,hp:9,text:"嘲讽。",taunt:true,n:1,limit:1},
    {id:"launderer",name:"洗钱专家",cost:3,kind:"unit",art:"$",atk:3,hp:5,text:"部署：偷取 3 元，抽 1 张牌。",effect:"steal3draw",n:2,limit:2},
    {id:"bribelord",name:"收买要员",cost:4,kind:"unit",art:"▤",atk:4,hp:5,text:"部署：偷取 2 元，获得 2 点护甲。",effect:"steal2armor2",n:1,limit:2},
    {id:"greyincome",name:"灰色收入",cost:1,kind:"spell",art:"$",text:"偷取 3 元。",effect:"steal3",n:2,limit:3},
    {id:"bribe",name:"账外交易",cost:1,kind:"spell",art:"◇",text:"抽 2 张牌，你的英雄受到 1 点伤害，偷取 2 元。",effect:"bribeDraw",n:2,limit:2},
    {id:"steal",name:"人民收米术",cost:2,kind:"spell",art:"$",text:"对敌方英雄造成 3 点伤害，抽 1 张牌，偷取 5 元。",effect:"steal5draw",n:2,limit:2},
    {id:"count",name:"清点现金",cost:2,kind:"spell",art:"+",text:"恢复 3 点生命，抽 1 张牌，偷取 3 元。",effect:"healDrawSteal",n:2,limit:2},
    {id:"taxevasion",name:"偷税漏税",cost:2,kind:"spell",art:"$",text:"对敌方英雄造成 2 点伤害，抽 1 张牌，偷取 4 元。",effect:"hero2drawSteal",n:2,limit:2},
    {id:"launder",name:"洗钱",cost:2,kind:"spell",art:"◇",text:"偷取 4 元。",effect:"steal4",n:2,limit:2},
    {id:"escape",name:"逃跑",cost:3,kind:"spell",art:"↗",text:"如果你已偷取 25 元，立即获胜。否则获得 3 点护甲，对敌方英雄造成 2 点伤害。",effect:"runaway",n:2,limit:2},
    {id:"transfer",name:"资金转移",cost:3,kind:"spell",art:"⇄",text:"抽 2 张牌，获得 2 点护甲，偷取 2 元。",effect:"supplySteal",n:2,limit:2},
    {id:"funding",name:"财政拨款",cost:3,kind:"spell",art:"+",text:"恢复 5 点生命，抽 1 张牌。",effect:"heal5draw",n:1,limit:2},
    {id:"sanction",name:"经济制裁",cost:4,kind:"spell",art:"⚡",text:"对敌方英雄造成 5 点伤害。",effect:"damage5",n:1,limit:2},
    {id:"fakebooks",name:"伪造账目",cost:3,kind:"spell",art:"▤",text:"偷取 4 元，抽 1 张牌。",effect:"steal4draw",n:1,limit:2},
    {id:"vaultfill",name:"金库充盈",cost:5,kind:"spell",art:"♛",text:"抽 3 张牌，获得 3 点护甲，偷取 5 元。",effect:"vaultBurst",n:1,limit:1}
  ]},
  "八幡":{faction:"旧大陆卡兹帝国",style:"海盗体系 · 极速铺场",hp:30,cards:[
    {id:"deckhand",name:"甲板水手",cost:0,kind:"unit",art:"⚓",atk:1,hp:1,text:"冲锋。",charge:true,n:2,limit:3},
    {id:"pirate",name:"小海盗",cost:1,kind:"unit",art:"⚓",atk:2,hp:1,text:"冲锋。",charge:true,n:4,limit:4},
    {id:"stalker",name:"潜行海盗",cost:1,kind:"unit",art:"◉",atk:2,hp:1,text:"无视嘲讽。",ignoreTaunt:true,n:2,limit:3},
    {id:"raider",name:"劫掠者",cost:2,kind:"unit",art:"⚑",atk:3,hp:2,text:"冲锋。",charge:true,n:3,limit:3},
    {id:"ship",name:"海盗船",cost:2,kind:"unit",art:"⌁",atk:2,hp:2,text:"部署：召唤 1 个【小海盗】。",effect:"summonPirate",n:3,limit:3},
    {id:"captain",name:"年轻船长",cost:3,kind:"unit",art:"✦",atk:4,hp:3,text:"无视嘲讽。攻击敌方英雄时，额外造成 1 点伤害。",ignoreTaunt:true,n:2,limit:2},
    {id:"mate",name:"大副",cost:3,kind:"unit",art:"✦",atk:3,hp:3,text:"冲锋。",charge:true,n:1,limit:2},
    {id:"king",name:"海盗王",cost:4,kind:"unit",art:"♛",atk:4,hp:4,text:"部署：使你的所有单位获得 +2/+2。",effect:"buffAll2",n:1,limit:1},
    {id:"helmsman",name:"舵手",cost:1,kind:"unit",art:"◉",atk:1,hp:2,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"gunner",name:"火炮手",cost:2,kind:"unit",art:"✣",atk:2,hp:2,text:"无视嘲讽。部署：对敌方英雄造成 1 点伤害。",ignoreTaunt:true,effect:"hero1",n:2,limit:2},
    {id:"submarine",name:"海盗潜艇",cost:7,kind:"unit",art:"⛴",atk:8,hp:2,text:"冲锋。无视嘲讽。",charge:true,ignoreTaunt:true,n:2,limit:1},
    {id:"fullspeed",name:"全速前进",cost:0,kind:"spell",art:"→",text:"抽 1 张牌。",effect:"draw1",n:2,limit:3},
    {id:"rum",name:"酒馆补给",cost:1,kind:"spell",art:"●",text:"恢复 2 点生命，抽 1 张牌。",effect:"healDraw",n:2,limit:2},
    {id:"raid",name:"劫掠",cost:2,kind:"spell",art:"⚑",text:"你每控制 1 个单位，抽 1 张牌（至少 1 张，至多 3 张）。",effect:"raid",n:2,limit:2},
    {id:"revengepirate",name:"复仇主义",cost:2,kind:"spell",art:"✹",text:"使你的所有单位获得 +1 攻击力，抽 1 张牌。",effect:"pirateBuff",n:2,limit:2},
    {id:"firebomb",name:"燃烧弹",cost:2,kind:"spell",art:"✹",text:"消灭 1 个你的单位，对所有敌方单位造成 3 点伤害。",effect:"sacAoe3",n:2,limit:2},
    {id:"fireship",name:"火船",cost:3,kind:"spell",art:"✹",text:"摧毁你的所有单位。每摧毁 1 个，对所有敌方单位造成 2 点伤害。",effect:"fireShip",n:1,limit:1},
    {id:"broadside",name:"侧舷炮击",cost:3,kind:"spell",art:"✣",text:"对敌方英雄造成等同于你的单位数量的伤害。",effect:"unitDamageHero",n:1,limit:2},
    {id:"finish",name:"海盗大斩杀",cost:4,kind:"spell",art:"☠",text:"对敌方英雄造成等同于你的单位数量 ×2 的伤害。",effect:"finish",n:1,limit:1},
    {id:"boarding",name:"登船战",cost:3,kind:"spell",art:"⚑",text:"使你的所有单位获得 +1/+1，并可在本回合攻击。",effect:"buffAllCharge",n:2,limit:2},
    {id:"jollyroger",name:"海盗旗",cost:2,kind:"spell",art:"☠",text:"抽 2 张牌。",effect:"draw2",n:1,limit:2}
  ]},
  "045":{faction:"普鲁士国 · 架子班",style:"架子班召集 · 成员生成",hp:31,cards:[
    {id:"apprentice",name:"架子班学徒",cost:2,kind:"unit",art:"✦",atk:2,hp:3,text:"部署：抽 1 张牌。",effect:"draw",n:3,limit:3},
    {id:"intel",name:"情报官",cost:2,kind:"unit",art:"◇",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:2,limit:2},
    {id:"advisor",name:"高层顾问",cost:2,kind:"unit",art:"◇",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:3,limit:3},
    {id:"diplomat",name:"外交官",cost:3,kind:"unit",art:"✎",atk:3,hp:5,text:"部署：获得 2 点护甲。",effect:"armor2",n:2,limit:2},
    {id:"researcher",name:"解析员",cost:4,kind:"unit",art:"⌬",atk:4,hp:6,text:"部署：抽 1 张牌，获得 1 点护甲。",effect:"drawArmor",n:1,limit:2},
    {id:"cardmaker",name:"卡片工匠",cost:4,kind:"unit",art:"▦",atk:4,hp:5,text:"部署：抽 2 张牌。",effect:"draw2",n:1,limit:2},
    {id:"blueprint",name:"蓝图制卡师",cost:5,kind:"unit",art:"▦",atk:6,hp:6,text:"嘲讽。",taunt:true,n:1,limit:2},
    {id:"alwei",name:"架子班·阿伟",cost:6,kind:"unit",art:"锤",atk:6,hp:6,text:"部署：抽 2 张牌，使你的所有单位获得 +1/+1。",effect:"alweiDeploy",n:1,limit:1,member:true},
    {id:"qixing",name:"架子班·七星",cost:5,kind:"unit",art:"☄",atk:5,hp:5,text:"部署：敌方的费用上限 -1。",effect:"qixingDeploy",n:1,limit:1,member:true},
    {id:"susu_leader",name:"架子班·苏苏",cost:5,kind:"unit",art:"☭",atk:5,hp:5,text:"部署：召唤 1 个【俄布】。",effect:"susuDeploy",n:1,limit:1,member:true},
    {id:"huiliyi",name:"架子班·绘梨衣",cost:4,kind:"unit",art:"✦",atk:4,hp:4,text:"部署：使 1 个其他友方单位获得 +3/+3。",effect:"huiliyiDeploy",n:1,limit:1,member:true},
    {id:"baimao",name:"架子班·白猫",cost:4,kind:"unit",art:"◇",atk:4,hp:4,text:"部署：本回合获得 3 点额外费用。",effect:"baimaoDeploy",n:1,limit:1,member:true},
    {id:"xiashui",name:"架子班·下水",cost:4,kind:"unit",art:"✚",atk:4,hp:4,text:"部署：对敌方英雄造成 3 点伤害。",effect:"xiashuiDeploy",n:1,limit:1,member:true},
    {id:"yuchun",name:"架子班·愚蠢",cost:3,kind:"unit",art:"☠",atk:3,hp:3,text:"部署：随机弃掉敌方的 1 张手牌。",effect:"yuchunDeploy",n:1,limit:1,member:true},
    {id:"taojin",name:"架子班·淘金",cost:3,kind:"unit",art:"✦",atk:3,hp:3,text:"部署：二选一：对敌方英雄造成 3 点伤害；或恢复 3 点生命。",effect:"taojinDeploy",n:1,limit:1,member:true},
    {id:"namecard",name:"高层名片",cost:2,kind:"spell",art:"▧",text:"使你的所有单位获得 +1/+1。",effect:"buffAll1",n:2,limit:3},
    {id:"develop",name:"开发他人卡组",cost:3,kind:"spell",art:"⌘",text:"抽 2 张牌，获得 2 点护甲。",effect:"develop",n:2,limit:2},
    {id:"adapt",name:"适应性方案",cost:4,kind:"spell",art:"↻",text:"摧毁攻击力最高的敌方单位，恢复 3 点生命。",effect:"adapt",n:2,limit:2},
    {id:"handoff",name:"关系网调度",cost:1,kind:"spell",art:"⇄",text:"抽 1 张牌，获得 1 点护甲。",effect:"handoff",n:2,limit:2},
    {id:"copycrown",name:"复制的皇冠",cost:5,kind:"spell",art:"♛",text:"抽 3 张牌，获得 3 点护甲。",effect:"crown",n:1,limit:1},
    {id:"meeting",name:"高层会议",cost:4,kind:"spell",art:"▧",text:"使你的所有单位获得 +1/+1，抽 1 张牌。",effect:"buffAll1draw",n:2,limit:2},
    {id:"upgrade",name:"卡片升级",cost:2,kind:"spell",art:"⇪",text:"使 1 个友方单位获得 +2/+2，抽 1 张牌。",effect:"buffOneDraw",n:1,limit:2},
    {id:"network",name:"关系网",cost:2,kind:"spell",art:"⇄",text:"抽 2 张牌，获得 1 点护甲。",effect:"draw2armor1",n:2,limit:2},
    {id:"summoncall",name:"架子班召集令",cost:5,kind:"spell",art:"锤",text:"从牌库中随机召唤 1 个架子班成员（触发其部署效果）。如果没有，改为抽 2 张牌。",effect:"summoncall",n:2,limit:2},
    {id:"namecardsummon",name:"名片召唤",cost:3,kind:"spell",art:"▧",text:"从牌库中选择 1 个架子班成员召唤（触发其部署效果）。",effect:"namecardsummon",n:2,limit:2},
    {id:"highcommand",name:"高层指令",cost:4,kind:"spell",art:"♛",text:"使你的所有单位获得 +2/+2。",effect:"highcommand",n:1,limit:2}
  ]},
  "下水":{faction:"架子班 · 鸭子系",style:"火炮体系 · 饱和炮击",hp:34,cards:[
    {id:"smallcannon",name:"小炮组",cost:1,kind:"unit",art:"✚",atk:1,hp:2,text:"部署：抽 1 张牌。",effect:"draw",n:3,limit:3,gun:true},
    {id:"smallgun",name:"轻型炮台",cost:2,kind:"unit",art:"◆",atk:2,hp:3,text:"部署：召唤 1 个【小炮组】。",effect:"copySmallCannon",n:2,limit:3,gun:true},
    {id:"gunner",name:"炮兵班",cost:1,kind:"unit",art:"◆",atk:2,hp:3,text:"无视嘲讽。部署：如果你控制其他火炮，获得 +2/+2。",ignoreTaunt:true,effect:"gunnerBoost",n:3,limit:3,gun:true},
    {id:"cannon",name:"远程火炮",cost:2,kind:"unit",art:"✚",atk:2,hp:3,text:"无视嘲讽。部署：对敌方英雄造成 2 点伤害。",ignoreTaunt:true,effect:"hero2",n:2,limit:3,gun:true},
    {id:"battery",name:"重炮连",cost:3,kind:"unit",art:"▥",atk:3,hp:5,text:"嘲讽。无视嘲讽。部署：使你的所有火炮获得 +1 攻击力。",taunt:true,ignoreTaunt:true,effect:"buffGuns1",n:2,limit:2,gun:true},
    {id:"commander",name:"火力指挥官",cost:3,kind:"unit",art:"★",atk:5,hp:5,text:"嘲讽。无视嘲讽。部署：使你的所有火炮获得 +2 攻击力。",taunt:true,ignoreTaunt:true,effect:"buffGuns2",n:2,limit:2,gun:true},
    {id:"ammo",name:"弹药车",cost:2,kind:"unit",art:"▣",atk:2,hp:4,text:"部署：抽 1 张牌。",effect:"draw",n:1,limit:2},
    {id:"spotter",name:"前沿观察员",cost:1,kind:"unit",art:"◇",atk:2,hp:2,text:"冲锋。",charge:true,n:1,limit:2},
    {id:"howitzer",name:"榴弹炮",cost:4,kind:"unit",art:"✣",atk:4,hp:5,text:"无视嘲讽。",ignoreTaunt:true,n:2,limit:2,gun:true},
    {id:"emplacement",name:"炮兵阵地",cost:5,kind:"unit",art:"▥",atk:4,hp:9,text:"嘲讽。",taunt:true,n:2,limit:2,gun:true},
    {id:"magazine",name:"弹药库",cost:3,kind:"unit",art:"▣",atk:3,hp:6,text:"嘲讽。部署：抽 1 张牌。",taunt:true,effect:"draw",n:2,limit:2},
    {id:"saturation",name:"饱和炮击",cost:3,kind:"spell",art:"▦",text:"你每控制 1 个火炮，对敌方英雄和所有敌方单位造成 2 点伤害。",effect:"saturation",n:4,limit:2},
    {id:"reload",name:"快速装填",cost:1,kind:"spell",art:"↻",text:"本回合使你的所有火炮获得 +3 攻击力，抽 1 张牌。",effect:"reload",n:2,limit:3},
    {id:"supply",name:"炮弹补给",cost:2,kind:"spell",art:"+",text:"抽 2 张牌，获得 2 点护甲。",effect:"supply",n:2,limit:2},
    {id:"cover",name:"火力覆盖",cost:3,kind:"spell",art:"✣",text:"对敌方英雄和所有敌方单位造成 2 点伤害。",effect:"aoe2",n:1,limit:2},
    {id:"volley",name:"齐射",cost:4,kind:"spell",art:"✣",text:"对所有敌方单位造成 4 点伤害。",effect:"aoe4",n:1,limit:2},
    {id:"prepfire",name:"炮火准备",cost:2,kind:"spell",art:"✣",text:"对至多 3 个敌方单位各造成 2 点伤害。",effect:"choose3x2",n:2,limit:2},
    {id:"recon",name:"火力侦察",cost:1,kind:"spell",art:"◇",text:"抽 1 张牌。",effect:"draw1",n:2,limit:2},
    {id:"support",name:"炮兵支援",cost:4,kind:"spell",art:"★",text:"使你的所有火炮获得 +2 攻击力，抽 1 张牌。",effect:"buffGuns2draw",n:2,limit:2},
    {id:"resupply",name:"弹药补充",cost:2,kind:"spell",art:"+",text:"恢复 3 点生命，抽 1 张牌。",effect:"heal3draw",n:1,limit:2},
    {id:"bombardcmd",name:"轰炸指令",cost:5,kind:"spell",art:"☄",text:"对敌方英雄造成 6 点伤害。",effect:"damage6",n:1,limit:2}
  ]},
};

/* 衍生物：不属于任何卡组 */
const TOKENS={
  awaBand:{id:"awaBand",name:"爵士乐队",cost:3,kind:"unit",art:"♪",atk:0,hp:4,owner:"awa",untargetable:true,
    text:"无法被敌方单位攻击。你的单位和法术对敌方造成的伤害 +1（可叠加）。"}
};

/* awa 卡牌：不进卡组编辑器；每局开始时随机替换卡组中的一张 */
const AWA_CARDS={
  苏苏:{id:"awaFreeze",name:"停摆",cost:3,kind:"spell",art:"∅",owner:"awa",text:"直到你的下个回合开始，双方无法抽牌，费用上限和金钱也无法增加。",effect:"awaFreeze"},
  下水:{id:"awaDiscover",name:"选角",cost:1,kind:"spell",art:"※",owner:"awa",text:"从所有单位牌中随机展示 3 张，选择 1 张加入手牌。",effect:"awaDiscover"},
  七星:{id:"awaJazz",name:"即兴演出",cost:3,kind:"spell",art:"♪",owner:"awa",text:"召唤 1 个【爵士乐队】。如果敌方是猪瘟鱼，偷走其全部金钱。",effect:"awaJazz"}
};

const COLORS={苏苏:"#e0664f",字母:"#6fb6dc",七星:"#a98fd9",核弹:"#7cc98a",猪瘟鱼:"#e58aa6",八幡:"#4fc0b0","045":"#dcae62",下水:"#a3b6bf"};

/* 新手引导信息：难度 1~3 */
const HERO_INFO={
  苏苏:{difficulty:1,tip:"大量带「冲锋」的红军，出手就能打。铺满场面后用增益法术一波推进。",title:"红军统帅"},
  字母:{difficulty:2,tip:"冲锋单位抢血，关键时刻用「策反」把对手最强的单位抢过来。",title:"联合政府"},
  七星:{difficulty:3,tip:"堆护甲和生命，当 血量+护甲 ≥ 40 时打出【彗星冲击】直接造成 40 点伤害。",title:"彗星观测者"},
  核弹:{difficulty:2,tip:"用嘲讽单位拖住节奏，找到并召唤【超人】——每回合攻击两次、无视嘲讽。",title:"凹槽帝国"},
  猪瘟鱼:{difficulty:2,tip:"不停偷钱，攒够 25 元后打出【逃跑】直接获胜。偷钱的同时注意保命。",title:"财政大臣"},
  八幡:{difficulty:1,tip:"0~2 费的海盗快速铺场，最后用【海盗大斩杀】按场上单位数打脸。",title:"海盗船长"},
  "045":{difficulty:2,tip:"抽牌拿资源，召唤各具特色的架子班成员，后期用全体增益碾压。",title:"架子班班长"},
  下水:{difficulty:2,tip:"火炮越多越强。场上火炮数量决定【饱和炮击】的伤害。",title:"炮兵指挥"}
};

/* 关键字解释（卡牌预览时展示） */
const KEYWORDS={
  charge:{name:"冲锋",desc:"打出的当回合就可以攻击。"},
  taunt:{name:"嘲讽",desc:"敌方单位必须先攻击带嘲讽的单位。"},
  ignoreTaunt:{name:"无视嘲讽",desc:"攻击时可以绕过嘲讽，直接攻击任意目标。"},
  untargetable:{name:"隐匿",desc:"无法被敌方单位攻击（法术仍可伤害）。"},
  deploy:{name:"部署",desc:"从手牌打出时触发的效果。"},
  rebel:{name:"策反",desc:"把敌方单位抢到你的战场。"},
  core:{name:"核心",desc:"这套卡组的关键胜利手段。"},
  strikes:{name:"连击",desc:"每回合可以攻击多次。"},
  red:{name:"俄布",desc:"【俄罗斯布尔什维克红军】的简称（2 费 2/3 冲锋）。"},
  gun:{name:"火炮",desc:"下水卡组里类型栏标有「火炮」的单位。饱和炮击、炮兵支援等卡牌会按火炮生效。"},
  member:{name:"架子班成员",desc:"045 卡组里类型栏标有「架子班」的单位，可被召集令、名片召唤从牌库召唤。"},
  stealMoney:{name:"偷取金钱",desc:"猪瘟鱼的特殊资源。偷够 25 元后打出【逃跑】即可直接获胜。"}
};

const ALL_CARDS={};
for(const h in PROFILES)PROFILES[h].cards.forEach(c=>{c.hero=h;ALL_CARDS[h+":"+c.id]=c;});

function cardDef(hero,id){
  if(TOKENS[id])return TOKENS[id];
  const p=PROFILES[hero];
  const c=p&&p.cards.find(x=>x.id===id);
  if(c)return c;
  const a=AWA_CARDS[hero];
  if(a&&a.id===id)return a;
  return null;
}

/* 默认卡组：按 n 值铺，严格遵守 limit，不足 40 时按费用从低到高补 */
function defaultDeck(hero){
  const cards=PROFILES[hero].cards,list=[],cnt={};
  const add=id=>{list.push(id);cnt[id]=(cnt[id]||0)+1;};
  cards.forEach(c=>{for(let i=0;i<Math.min(c.n||1,c.limit);i++)if(list.length<DECK_SIZE)add(c.id);});
  const sorted=[...cards].sort((a,b)=>a.cost-b.cost);
  let guard=0;
  while(list.length<DECK_SIZE&&guard++<500){
    const c=sorted.find(x=>(cnt[x.id]||0)<x.limit);
    if(!c)break;add(c.id);
  }
  return list;
}

/* 校验卡组：40 张、id 合法、不超上限。返回 null 表示合法，否则返回原因 */
function deckError(hero,list){
  if(!PROFILES[hero])return "未知卡牌师";
  if(!Array.isArray(list))return "卡组格式错误";
  if(list.length!==DECK_SIZE)return `卡组必须恰好 ${DECK_SIZE} 张`;
  const cnt={};
  for(const id of list){
    const c=PROFILES[hero].cards.find(x=>x.id===id);
    if(!c)return "卡组里有不存在的卡牌";
    cnt[id]=(cnt[id]||0)+1;
    if(cnt[id]>c.limit)return `【${c.name}】最多携带 ${c.limit} 张`;
  }
  return null;
}

return{MAX_BOARD,MAX_HAND,ESCAPE_TARGET,DECK_SIZE,MAX_ENERGY,PROFILES,TOKENS,AWA_CARDS,COLORS,HERO_INFO,KEYWORDS,ALL_CARDS,cardDef,defaultDeck,deckError};
});
