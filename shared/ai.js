/* 皇冠对决 · 电脑对手（单机练习用；服务器也可复用）
   难度：easy / normal / hard
   v2.7.1：角色差异化 AI —— 每个卡牌师按风格出牌（抢血/铺场/策反/攒废料/能量压制），
   并修复一批"过糖"操作：
   - 先让己方单位攻击完，再打整编/燃烧弹/AOE/策反（不浪费攻击次数）
   - 限时单位【超人】必打脸，不解场；高抢血角色优先打脸
   - 字母能用策反/消除限制过墙斩杀
   - 燃烧弹只用来收残血，不敲大哥
   - 绘梨衣攒够废料再转化/爆发；七星观察者+抽牌联动 */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory(require("./cards.js"),require("./engine.js"));
  else root.DuelAI=factory(root.DuelCards,root.DuelEngine);
})(typeof self!=="undefined"?self:this,function(C,E){
"use strict";
const {MAX_BOARD,MAX_HAND,ESCAPE_TARGET}=C;
const {unitValue,heroBonus,gunCount,playError,attackTargets,canAttack,autoTargets,autoOption,bestRegime,redCount}=E;
const SCRAP_SPELLS={convert1:1,scrapSearch:1,convert2:2,convert3:3,scrapStun:1,scrapBlast:1,scrapSweep:1,crownCopy:2};
const REGIME_OF={decreeRus:"rus",decreeUkr:"ukr",decreeBlr:"blr"};

/* 角色风格：aggro=抢血倾向(0~1)；rebelWall=策反过墙；scrapEngine=废料经济；slow=压制慢速 */
const HERO_STYLE={
  核弹:{aggro:.9},
  八幡:{aggro:.9},
  字母:{aggro:.55,rebelWall:true},
  苏苏:{aggro:.45,armorEngine:true},
  绘梨衣:{aggro:.35,scrapEngine:true},
  七星:{aggro:.3,slow:true},
  下水:{aggro:.5},
  猪瘟鱼:{aggro:.3},
  "045":{aggro:.45},
  白猫:{aggro:.3,slow:true}
};

/* 打出前需要先让己方单位攻击的法术：只含"消耗己方单位"的牌（单位攻击完再献祭/整编，避免浪费攻击次数）。
   清场类（AOE/单体伤害）不在此列：正确顺序是先清场、单位再攻击打脸。 */
const PRE_ATTACK=new Set([
  "consolidate","sacAoe3","fireShip"
]);

/* ---- 卡组流派：同一个英雄的两套预设打法不同，按自带 40 张判断 ---- */
const FED_CARDS=new Set(["cometWatcher","sentinel","messenger","bulwark","scholar","orbitguard",
  "gravityfield","starcore","foresee","forecast","mana","timeShield","crystalBreak","gravitywell",
  "starClimb","cardCap","gravityLock","gravityFold","stasis","stasisfield","cometStrike",
  "starlightPray","starlock","cometShackle","cometTrail","starlightEcho","stardustBeacon",
  "cometTutor","tune"]);
/* "blr" = 白俄罗斯铁壁（叠甲解场拖时间）；"federation" = 七星·星联邦流（叠血解场） */
function deckMode(p){
  /* deck 会随着抽牌变短，优先用开局记录的 40 张 */
  const d=(p&&(p.deckAll||p.deck))||[];
  if(d.filter(id=>/^blr/.test(id)).length>=6)return"blr";
  /* 星联邦流有独有的三张牌，衰减流没有 */
  if(d.includes("cometTrail")&&d.includes("starlightEcho")&&d.includes("stardustBeacon"))return"federation";
  return"";
}

const BURN={hero99:99,damage5:5,damage6:6,damage7:7,damage5draw:5,aoe2:2,aoe5:5,manaBurn:2,steal5draw:3,hero2drawSteal:2,hero2:2,hero1:1,hero3:3,steal3hero1:1,xiashuiDeploy:3,disruption:2,
  };
function burnOf(s,c){
  if(c.effect==="whiteFinal")return Math.min(18,4+(s.destroyedCards||0));
  if(c.effect==="whiteStrike")return Math.min(7,2+Math.floor((s.destroyedCards||0)/3));
  if(c.effect==="whiteBurst")return Math.min(10,3+Math.floor((s.destroyedCards||0)/2));
  if(c.effect==="whiteNight")return 5;
  if(c.effect==="runaway")return s.money>=ESCAPE_TARGET?9999:2;
  if(c.effect==="unitDamageHero")return s.board.length;
  if(c.effect==="finish")return s.board.length*2;
  if(c.effect==="saturation")return gunCount(s)*2;
  return BURN[c.effect]||0;
}
function faceReach(s,o){
  let t=0;
  for(const u of s.board){
    if(canAttack(u))continue;
    if(attackTargets(u,o).hero)t+=(u.attack+heroBonus(u))*u.atkLeft;
  }
  return t;
}
/* 无视嘲讽的打脸伤害（用于判断过墙斩杀） */
function faceReachAll(s,o){
  let t=0;
  for(const u of s.board)if(!canAttack(u))t+=(u.attack+heroBonus(u))*u.atkLeft;
  return t;
}
/* 手牌能否拆掉嘲讽墙（策反 / 消除限制 / 摧毁最高攻） */
function canBreakWall(s,o){
  if(!o.board.some(u=>u.taunt))return false;
  return s.hand.some(c=>!playError(c,s,o)&&(/^(rebel|takeover|rebelLowest|rebelWeakest)/.test(c.effect)||c.effect==="removeRestrict"||c.effect==="adapt"));
}
function isLethal(s,o){
  let en=s.energy,dmg=0;
  const burns=s.hand.filter(c=>burnOf(s,c)>0&&!playError(c,s,o)).sort((a,b)=>burnOf(s,b)/(b.cost||1)-burnOf(s,a)/(a.cost||1));
  for(const c of burns)if(c.cost<=en){en-=c.cost;dmg+=burnOf(s,c);}
  if(faceReach(s,o)+dmg>=o.hp+o.armor)return true;
  /* 能拆/策反嘲讽墙时，按"无墙"的伤害判断可否斩杀（字母策动过墙） */
  if(canBreakWall(s,o)&&faceReachAll(s,o)+dmg>=o.hp+o.armor)return true;
  return false;
}
function scoreCard(s,o,c,lethal,stage){
  const e=c.effect,myN=s.board.length,enN=o.board.length,burn=burnOf(s,c);
  /* 同一英雄可能有两套预设（苏苏：俄布海 / 白俄罗斯铁壁），打法按自带卡组走 */
  const mode=deckMode(s);
  /* 剧情·土匪AI：stage0 前期不铺场不打高费 */
  if(stage!==null&&stage===0){
    if(c.cost>1)return-30;
    if(c.kind==="unit")return-12;
  }
  let sc;
  if(c.kind==="unit"){
    sc=c.cost*1.1+(c.attack+c.health)*.45+(c.charge?2.5:0)+(c.ignoreTaunt?1.5:0);
    if(c.taunt)sc+=(s.hp<=14||o.board.some(u=>u.attack>=4))?3:1;
    if(burn)sc+=burn*.6;
    if(/^choose/.test(e))sc+=enN?3:-1;
    if(e==="secondDeploy")sc+=3+(enN?2:0);
    if(e==="thirdDeploy")sc+=3;
    if(/^buff|alwei|huiliyi/.test(e))sc+=myN*1.2;
    if(/energyDown|qixing/.test(e))sc+=1.5;
    if(e==="drawHeal")sc+=4;
    if(e==="decay1")sc+=2.5;
    if(c.id==="superman")sc+=6;
    if(c.id==="redTank"){   // 红军坦克 token：5/4 冲锋，能打脸时高分
      const reach=faceReachAll(s,o)+(c.attack||0)*(c.strikes||1);
      sc+=reach>=o.hp+o.armor?20:2;
    }
    if(e==="copySmallCannon")sc+=gunCount(s)*1.5;
    if(e==="baimaoDeploy")sc-=3;
    if(e==="whiteAsh")sc+=Math.min(5,Math.floor((s.destroyedCards||0)/2))*2;
    if(e==="whiteEngine")sc+=o.deck.length>=4?6:-2;
    if(e==="whiteBoard")sc+=enN?Math.max(...o.board.map(unitValue))*.8:-2;
    if(e==="whiteProof")sc+=o.board.some(u=>u.attack<=2)?5:0;
    if(e==="whiteSentinel")sc+=o.deck.length+o.hand.length?2:0;
    if(e==="whiteMargin")sc+=o.deck.length<=3?5:1;
    if(e==="whiteCorruptHand")sc+=o.hand.filter(x=>x.effect!=="whiteJunk").length?5:-2;
    if(e==="whiteMedic")sc+=Math.min(4,Math.max(0,s.maxHp-s.hp))*1.2;
    if(e==="whiteDeck1"||e==="whiteDeck2"||e==="whiteHand1")sc+=(o.deck.length+o.hand.length)?3:-2;
    if(lethal&&burn>0)sc+=300;
  }else{
    sc=c.cost*.8+1;
    if(burn)sc+=burn*.8;
    if(lethal&&burn>0)sc+=500;
    if(e==="runaway")return s.money>=ESCAPE_TARGET?20000:-8;
    if(e==="whiteJunk")return s.deck.length<=1?-20:-5;
    if(/^(aoe|redDawn)/.test(e)||e==="choose3x2")sc+=enN?enN*3:-100;
    else if(e==="saturation")sc+=gunCount(s)?(enN*2+gunCount(s)*2):-100;
    else if(e==="sacAoe3"){   // 燃烧弹：只在有残血(hp<=3)可收时打，否则不值得牺牲己方单位
      const killable=o.board.filter(u=>u.health<=3).length;
      sc+=killable>=1?killable*4+2:-12;
    }
    else if(e==="fireShip")sc+=(enN>=2&&myN)?enN*2.5-myN*1.5:-100;
    else if(/^enemyAtkDown/.test(e))sc+=enN?o.board.reduce((a,u)=>a+Math.min(u.attack,2),0)*1.3:-100;
    else if(e==="stasisField")sc+=(enN?o.board.reduce((a,u)=>a+Math.min(u.attack,1),0)*1.3:0)+3;
    else if(e==="gravityLock")sc+=enN>=2?4:-100;
    else if(e==="removeRestrict")sc+=3+(o.heroImmune?4:0)+o.board.filter(u=>u.taunt).length*2;
    else if(/^(remove|adapt)/.test(e))sc+=enN?Math.max(...o.board.map(unitValue))*.9:(e==="adapt"?-2:-100);
    else if(/^(rebel|takeover)/.test(e)){
      const top=enN?Math.max(...o.board.map(unitValue)):0;
      const temp=/^(takeover|rebelLowest|rebelWeakest)/.test(e);   // 临时策反：限一回合，价值大减
      sc+=enN?(temp?(top>=5?top*1.0-3:top*.3-6):top*1.1):-100;
      if(!myN)sc-=3;   // 自己空场时更不该急着策反
    }
    else if(/^(buffAll|pirateBuff|highcommand)/.test(e))sc+=myN?myN*2.4:-100;
    else if(/^(buffGuns|reload)/.test(e))sc+=gunCount(s)?gunCount(s)*2.5:-100;
    else if(e==="buffOneDraw")sc+=myN?3:-2;
    else if(/^(summon|fillRed|namecardsummon)/.test(e)&&e!=="summonSuperman")sc+=myN>=MAX_BOARD?-100:(e==="fillRed"?8:3);
    else if(e==="ramp"||e==="starClimb")sc+=s.maxEnergy<7?3:-2;
    else if(e==="whiteBurst")sc+=burn*.9;
    else if(e==="whiteForce1"||e==="whiteForce2")sc+=o.deck.length===0?12+(o.fatigue||0)*3:o.deck.length<=3?6:1;
    else if(e==="whiteDrawJunk5")sc+=o.deck.length===0?18:o.hand.length>=MAX_HAND-3?12:8;
    else if(e==="whiteAoe")sc+=enN?enN*2.5+o.board.filter(u=>u.health<=3).length*2:-100;
    else if(e==="whiteCorruptDeck")sc+=o.deck.filter(x=>x.effect!=="whiteJunk").length>=2?7:0;
    else if(e==="whiteMend")sc+=Math.min(6,Math.max(0,s.maxHp-s.hp))*1.1+2;
    else if(/^white/.test(e)){
      const available=o.deck.length+o.hand.length;
      sc+=available?(e==="whiteNight"?7:e==="whiteConfiscate"?(o.hand.length?7:5):e==="whiteHand1"?5:3):-100;
    }
    else if(/^(manaBurn|energyDownDraw)/.test(e))sc+=2;
    else if(e==="costRaise")sc+=o.handCount!==undefined?(o.handCount>=3?4:-100):(o.hand.length>=3?4:-100);
    else if(/^(unitDamageHero|finish)/.test(e))sc+=myN?myN*1.5:-100;
    else if(/^(filterSuperman|tutorSuperman|scry|foresee)/.test(e))sc+=4;
    else if(/^decay/.test(e))sc+=3+(o.decay||0)*(e==="decayDouble"?1.5:1)+(e==="decay2draw"?1.5:0)-(s.hp<=8?3:0);
    else if(/^lock(Cap|Spell)/.test(e))sc+=((o.handCount!==undefined?o.handCount:o.hand.length)>=3?3.5:-2)+(e==="lockCap1"?1.5:0);
    else if(e==="energyDown2")sc+=o.maxEnergy>=4?3:-3;
    else if(e==="revengeDeath")sc+=myN?myN*1.6:-100;
    else if(e==="artilleryCommand")sc+=enN*2.5+(MAX_BOARD-myN)*1.2;
    else if(e==="developEnemy")sc+=4;
    else if(REGIME_OF[e]){
      const want=bestRegime(s,o);
      sc+=(s.regime===REGIME_OF[e]?-5:2)+(want===REGIME_OF[e]?3:0)+(e==="decreeUkr"?(enN?2:-3):0)+(e==="decreeRus"?(myN>=MAX_BOARD?-4:1):0)
        +((s.regimeChanges||0)<2?2:0);   // 权限需要更换次数
    }
    else if(c.scrap&&!e)sc=(s.board.some(u=>u.effect==="scrapTax"&&u.health>0)?4:(s.hand.length>=9?1:-60));   // 废料留着当原料，手牌快满了才丢
    else if(e==="scrapToUnits"){const k=Math.min(s.hand.filter(x=>x.scrap).length,MAX_BOARD-myN);sc+=k>=2?k*3:-3;}
    else if(e==="scrapSearch")sc+=(s.hand.length>=MAX_HAND-1?-100:5);
    else if(e==="supplyDeck")sc+=(s.hand.length>=MAX_HAND-1||!s.deck.some(x=>x.kind==="unit")?-100:5);
    else if(e==="intelSteal")sc+=(s.hand.length>=MAX_HAND-1||!o.deck.length?-100:6);
    else if(e==="fiveYearPlan"){
      const lose=s.board.filter(u=>u.health<=2).length;
      const hurt=s.board.filter(u=>u.health>2).length+o.board.filter(u=>u.health<u.maxHealth).length;
      sc+=(s.board.length?hurt*1.8-lose*3.5:-100)+(s.hand.length>=7?-4:0);
    }
    else if(e==="convert2"||e==="convert3"||e==="crownCopy")sc+=(s.hand.length>=MAX_HAND-1?-100:6)+(e==="crownCopy"?4:0);
    else if(e==="scrapSummon2")sc+=(MAX_BOARD-myN>=2?4:-100);
    else if(e==="scrapStun")sc+=enN?4:-100;
    else if(e==="scrapBlast"){const k=s.hand.filter(x=>x.scrap).length;sc+=(lethal?30:0)+(k>=4||o.hp<=k*2?k*2:-6);}
    else if(e==="scrapSweep"){const k=s.hand.filter(x=>x.scrap).length;sc+=(s.maxHp-s.hp>=4?Math.min(10,k*2):-8)+(s.hand.length>=9?3:0);}
    else if(e==="neutral")sc+=(s.hp<=12&&enN>=2?6:-6);
    else if(e==="consolidate"){const n=redCount(s);sc+=n>=4?9:n>=3?6:n>=2?1.5:-100;if(s.board.length>=MAX_BOARD&&n<3)sc-=3;}
    else if(e==="intel")sc+=(o.handCount!==undefined?o.handCount:o.hand.length)>=2?3.5:-4;
    else if(e==="awaFreeze")sc+=3;
    else if(e==="awaDiscover")sc+=s.hand.length>=MAX_HAND-1?-100:4;
    else if(e==="awaJazz")sc+=(myN>=MAX_BOARD?-100:5)+((o.hero==="猪瘟鱼"&&o.money>0)?o.money*.4:0);
    else if(e==="summonSuperman")sc+=(s.deck.some(x=>x.id==="superman")&&myN<MAX_BOARD)?14:-100;
    if(/draw|develop|crown|handoff|supply|raid|vaultBurst|traceBoost|nebulaShield2/.test(e))sc+=s.hand.length>=9?-4:2.5;
    if(/steal|Steal|bribeDraw|vaultBurst/.test(e))sc+=3;
    if(/heal|timeShield2/.test(e)){const need=s.maxHp-s.hp;sc+=need>=3?Math.min(need,5)*.8:-3;}
    if(/armor|traceBoost|nebulaShield2|timeShield2/.test(e))sc+=.8;   // 护甲会在自己的下个回合开始时消散，价值较低
    if(e==="evasion")sc+=s.hp<=12&&o.board.length?4:-3;
    if(e==="disruption")sc+=enN?3:0;
    /* 白俄罗斯铁壁：嘲讽站场 → 叠甲 → 拖到 10 费铺开坦克产线 */
    if(/^blr/.test(e)){
      const walls=s.board.filter(u=>u.health>0&&u.taunt).length;
      if(c.kind==="unit"){
        if(e==="blrGarrison"||e==="blrRailway")sc+=2.5;        // 部署即叠甲，稳赚
        else if(e==="blrBastion")sc+=1.5+(walls?1:0);          // 每回合 +1 甲，站得住才值
        else if(e==="blrDeathArmor")sc+=1.5;                   // 亡语甲，被清场时补偿
      }
      else if(e==="blrFortify")sc+=walls>=1?5+walls*1.2:-2;    // 至少 1 个嘲讽才打
      else if(e==="blrArmorWall")sc+=walls>=1?4+walls*1.5:(s.hp<=14?1:-3);
      else if(e==="blrSteelTide"){
        /* 终端：血够厚、场面能撑住才铺产线；被压着打的时候先苟 */
        const threats=o.board.reduce((a,u)=>a+Math.max(0,u.attack),0);
        const safe=s.hp>=10&&(threats<=10||walls>=1);
        sc+=safe?14:-100;
      }
    }
  }
  /* —— 卡组流派修正：白俄罗斯铁壁 = 叠甲解场拖时间；星联邦流 = 叠血解场 —— */
  if(mode==="blr"){
    if(c.taunt)sc+=2;
    if(/^(armor|heal|drawHeal)/.test(e||""))sc+=s.hp<=20?3:1;
    if(e==="blrFortify"||e==="blrArmorWall")sc+=1.5;
    if(c.kind==="unit"&&(c.attack||0)<=2&&(c.health||0)>=4)sc+=1.5;   // 偏防守身材
  }
  if(mode==="federation"){
    if(c.id==="cometWatcher"||e==="drawHeal")sc+=3;                   // 回血引擎
    if(/^(heal2|heal3draw|heal4Draw1|heal5Armor2|healDraw|draw2heal2|draw2heal6|drawHeal1|armor3Draw1|armor3draw)$/.test(e||""))sc+=s.hp<=22?5:2;
    if(/^(aoe2|aoe4|whiteAoe|stunAllDraw|cometStrike)$/.test(e||""))sc+=enN>=2?4:0;
    if(/^(draw1|draw2|draw3|foresee|forecast|cometTutor|tune|reshuffleDraw)$/.test(e||""))sc+=s.hand.length<=5?2.5:1;  // 找牌但别爆牌
    if(c.taunt)sc+=1.5;
    if(e==="cometStrike")sc+=s.hp>40?12:(s.hp>=36?2:0);            // 彗星陨击要血 >40 才能打
    if(/^(heal2|heal3draw|heal4Draw1|heal5Armor2|healDraw|draw2heal2|draw2heal6|draw1heal2|armor3draw|armor3Draw1)$/.test(e||""))sc+=s.hp<44?2.5:0;  // 先把血叠过 40
  }
  /* —— 角色风格修正（叠加在通用打分之上） —— */
  const style=HERO_STYLE[s.hero]||{};
  if(style.scrapEngine){   // 绘梨衣：攒废料，够了才转化/爆发
    const scrapN=s.hand.filter(x=>x.scrap).length;
    if(e==="convert2"||e==="convert3"||e==="crownCopy"){
      const need=SCRAP_SPELLS[e];
      sc+=(scrapN>=need?4+scrapN*.5:-4);
    }
    if(e==="scrapBlast")sc+=(scrapN>=4||lethal)?scrapN*2:scrapN*.5-4;
    if(e==="scrapSweep")sc+=(s.maxHp-s.hp>=6)?scrapN*1.5:-6;
    if(c.id==="scavenger"||c.id==="station"||c.id==="temp")sc+=2;
    if(c.scrap&&!e)sc-=10;
  }
  if(style.slow&&s.hero==="七星"){   // 七星：前期压槽 → 中期观察者+抽牌回血 → 陨击收尾
    const early=(s.turnsStarted||0)<=6;
    const walls=s.board.filter(u=>u.taunt&&u.health>0).length;
    const wN=s.board.filter(u=>u.effect==="drawHeal"&&u.health>0).length;
    /* 压槽家族：前期是主线（+10），后期回归常规 */
    if(/^(manaBurn|energyDown|energyDown2|energyDownDraw|lockCap1|lockCap2|starClimb|crystalBreak|costRaise)/.test(e||""))sc+=early?10:2;
    /* 观察者：没有嘲讽别裸下（残血抢回血例外） */
    if(c.id==="cometWatcher"){
      if(wN)sc+=1;
      else if(walls)sc+=6;
      else sc+=s.hp<=12?2:-12;
    }
    /* 抽牌：中期有观察者才加权，前期压低 */
    if(/draw|foresee|forecast/.test(e||"")){
      if(wN&&!early)sc+=2+wN*2.5;
      else if(early)sc-=3;
    }
    /* 调节：没观察者基本不打；有观察者且手牌够多才高分 */
    if(c.id==="tune"){
      if(!wN)sc-=60;
      else sc+=(s.hand.length>=4?12+wN*6+Math.min(s.hand.length,8)*1.8:-10);
    }
    if(c.effect==="cometStrike")sc+=(s.hp>40?25:-100);   // 彗星陨击：血量(不含甲)>40 才打
    if(/^(heal2|healDraw1|timeShield2|armor3Draw1|heal4Draw1|heal5Armor2)$/.test(e||"")&&s.hp<=44)sc+=early?-1:3;
    if(c.effect==="cometTutor")sc+=s.hand.some(x=>x.id==="cometStrike")?-8:6;
    if(c.id==="starlightPray")sc+=4;
    /* 星核卫士：血厚有墙时留着给高费降费；被压或残血才打 */
    if(c.id==="starcore"){
      const bigFoe=o.board.some(u=>u.health>0&&u.attack>=5);
      sc+=(s.hp<6||bigFoe)?4:(walls&&s.hp>18?-8:2);
    }
    if(e==="stunOneDraw"){   // 星辉锁链：敌方有高攻单位才晕
      const threat=o.board.some(u=>u.health>0&&u.attack>=3);
      sc+=threat?5:o.board.length?0:-10;
    }
    if(e==="stunAllDraw"){   // 彗星枷锁：敌方 2+ 个攻击单位才全体晕
      const n=o.board.filter(u=>u.health>0&&u.attack>=1).length;
      sc+=n>=2?5+(n>=4?2:0):-6;
    }
  }
  if(style.rebelWall&&/^(rebel|takeover|rebelLowest|rebelWeakest)/.test(e)){   // 字母：敌方有嘲讽时策反稍偏拆墙
    const walls=o.board.filter(u=>u.taunt);
    if(walls.length)sc+=Math.min(4,walls.length*2);
  }
  if(style.armorEngine){   // 苏苏·白俄罗斯铁壁：护甲是资源，不是消耗品
    if(/^blr/.test(e)&&e!=="blrSteelTide"&&s.board.some(u=>u.taunt&&u.health>0))sc+=1.5;
  }
  if(s.hero==="核弹"){   // 核弹：积极找超人（直伤抢血由通用 burn 分处理）
    if(c.id==="superman"||e==="summonSuperman"||e==="tutorSuperman"||e==="filterSuperman")sc+=4;
  }
  if(s.hero==="八幡"){   // 八幡：海盗抢血、燃烧弹只收残血、场面够才打 buff/斩杀、破墙卡有嘲讽墙才打
    if(e==="sacAoe3"){
      const killable=o.board.filter(u=>u.health<=3).length;
      const weak=o.board.filter(u=>u.health<=3&&unitValue(u)>=1.5).length;
      sc+=(weak>=1?weak*4+3:(killable>=2?killable*3:-12));   // 无残血可收(值>=1.5)一律不打
    }
    if(e==="pirateDiscover2")sc+=10+(s.hand.length<=5?2:0);   // 发现海盗(新)：发现3张海盗选3次+此后海盗+1/+1，永久增强海盗，非常强
    if(e==="killTough"){   // 破阵者：敌方有"生命>攻击"的单位(尤其嘲讽墙)才下，专杀嘲讽
      const tough=o.board.filter(u=>u.health>u.attack&&u.health>0);
      sc+=tough.length?(tough.some(t=>t.taunt)?tough.length*5+6:tough.length*3):-6;
    }
    if(e==="stripTauntDraw"){   // 恐吓：敌方有嘲讽墙才打；有友方海盗能抽卡更赚
      const wt=o.board.filter(u=>u.taunt&&u.health>0);
      sc+=wt.length?(4+wt[0].health*0.8+(s.board.some(u=>u.health>0&&(u.hero==="八幡"||u.id==="pirateScout"))?2:0)):-10;
    }
    if(e==="stunOrKill"){   // 闷棍：优先已眩晕的可直接杀，其次高威胁单位
      sc+=o.board.some(u=>u.stun>0&&u.health>0)?9:(o.board.filter(u=>u.health>0&&u.attack>=4).length?3:0);
    }
    if(e==="clubberDeploy")sc+=1.5;   // 持棍海盗：1费冲锋铺场 + 送闷棍过墙
    if(e==="luckyCoin")sc+=8;   // 幸运币：0费给1费，必打
    if(e==="stripTaunt")sc+=o.board.some(u=>u.taunt&&u.health>0)?3:0;   // 潜行海盗：有嘲讽墙时部署更有价值
    if(e==="fireShip")sc+=(enN?enN*2:-100)+(o.board.filter(u=>u.health<=2).length*3||0);
    if(e==="buffAllCharge")sc+=(myN>=3?4+myN*1.5:-6);   // 登船战：场面<3 一律不打
    if(e==="finish"||e==="unitDamageHero")sc+=(myN>=3?myN*2.5:(myN>=2?myN*1:-6));   // 斩杀：场面≥3 才打
    if(e==="buffAll2"&&myN<2)sc-=6;   // 海盗王：空场/单单位不打
    if(c.charge)sc+=1;
  }
  if(s.hero==="下水"){   // 下水：火炮铺场（饱和时机已由通用分处理）
    if(c.gun&&myN<MAX_BOARD)sc+=.8;
  }
  if(s.hero==="猪瘟鱼"){   // 猪瘟鱼：离逃跑越近越要偷
    if(/steal/.test(e)||e==="bribeDraw"||e==="vaultBurst")sc+=(s.money/ESCAPE_TARGET)*2.5;
  }
  if(s.hero==="苏苏"){   // 苏苏：俄布越多，集结/整编/战时共产越赚
    if(e==="consolidate"&&redCount(s)>=4)sc+=4;
    if(e==="buffReds1"||e==="buffAll2")sc+=redCount(s)*1.5;
    if(e==="redDraw")sc+=redCount(s)*2;
    // 苏苏应优先铺俄布：偷卡（情报调阅/窃取情报）倾向大幅降低——尤其前期/俄布少时，别傻前期不铺场
    if(e==="intel"||e==="intelSteal"){
      if(s.energy<=6||redCount(s)<2)sc-=30;   // 前期或没俄布场面：几乎不偷，先去铺俄布
      else sc-=12;   // 中后期也保守
    }
  }
  /* 剧情·土匪AI：stage0 前期不铺场不打高费；stage1 中期少铺场少直伤；stage2 后期加速 */
  if(stage===1){
    if(c.kind==="unit")sc-=5;
    if(burn)sc-=burn*.3;
  }
  if(stage===2){
    if(c.kind==="unit")sc+=c.cost*.35;
    if(burn)sc+=burn*.35;
  }
  return sc;
}

class AIPlayer{
  constructor(level){this.level=level||"normal";this.passed=new Set();this.plays=0;this.turnSeen=-1;this.hero=null;this.campaignStyle=null;this.campStage=null;}
  noise(){return this.level==="easy"?6:this.level==="hard"?0:.4;}
  mulligan(game,pi){
    const p=game.players[pi];
    const lim=this.level==="easy"?7:5;
    return p.hand.filter(c=>c.cost>=lim&&!c.core&&c.id!=="superman").map(c=>c.uid);
  }
  pickPending(game){
    const pd=game.pending;if(!pd)return 0;
    if(pd.title==="星核卫士"){   // 星核卫士选 0 费：优先高费/引擎卡（陨击/预言/调节/星光祝福）
      let bi=0,bs=-1;
      pd.cards.forEach((c,i)=>{
        const v=c.cost+(c.id==="cometStrike"?6:0)+(c.id==="cometTutor"?4:0)+(c.id==="tune"?3:0)+(c.id==="starlightPray"?2:0);
        if(v>bs){bs=v;bi=i;}
      });
      return bi;
    }
    return pd.auto;
  }
  /* 出牌目标（角色化）：字母策反/直伤优先嘲讽墙，其余走引擎默认 */
  aiTargets(c,s,o){
    if(c.effect==="buffPirate3"||c.effect==="pirateCommander"){   // 海盗buff：优先高攻击/冲锋单位（434部署时给先锋海盗或最强单位）
      const pool=s.board.filter(u=>u.health>0);
      if(pool.length)return[pool.slice().sort((a,b)=>(b.attack+b.charge*2)-(a.attack+a.charge*2))[0].uid];
    }
    if(this.hero==="字母"&&(c.effect==="rebel"||c.effect==="choose2"||c.effect==="choose4"||c.effect==="choose3x2"||c.effect==="decreeUkr")){
      const pool=o.board.filter(u=>u.health>0);
      if(pool.length){
        const walls=pool.filter(u=>u.taunt);
        const sorted=(walls.length?walls:pool).slice().sort((a,b)=>unitValue(b)-unitValue(a));
        const maxN=c.effect==="choose3x2"?Math.min(3,pool.length):1;
        return sorted.slice(0,maxN).map(u=>u.uid);
      }
    }
    return autoTargets(c,s,o);
  }
  /* 返回下一步动作：{type:"play",uid,targets,option} / {type:"attack",uid,target} / {type:"end"} */
  next(game,pi){
    if(game.turn!==this.turnSeen){this.turnSeen=game.turn;this.passed.clear();this.plays=0;}
    const s=game.players[pi],o=game.players[1-pi];
    this.hero=s.hero;
    /* 剧情·土匪AI 阶段：前期(≤2回合)极弱 → 中期(≤5回合)保守 → 后期提速 */
    if(this.campaignStyle==="bandit1")this.campStage=game.turn<=2?0:game.turn<=5?1:2;
    if(this.plays<12){
      let opts=s.hand.filter(c=>!playError(c,s,o));
      if(this.campStage===0)opts=opts.filter(c=>c.cost<=1);
      if(opts.length){
        const lethal=this.level!=="easy"&&isLethal(s,o);
        /* 0) 过墙斩杀：手上有策反/拆墙牌且能斩杀时，先打它拆墙 */
        if(lethal){
          const breaker=opts.find(c=>/^(rebel|takeover|rebelLowest|rebelWeakest)/.test(c.effect)||c.effect==="removeRestrict");
          if(breaker){
            this.plays++;
            return{type:"play",uid:breaker.uid,targets:this.aiTargets(breaker,s,o),option:autoOption(breaker,s,o)};
          }
        }
        let best=null,bs=-1e9;
        /* AOE 优先：敌方单位多且非斩杀时，先清场再让己方单位打脸（避免先攻击后清场的浪费） */
        if(!lethal){
          const aoe=opts.find(c=>/^(aoe2|aoe4|aoe5|redDawn|choose3x2|saturation)/.test(c.effect)&&o.board.length>=2);
          if(aoe){this.plays++;return{type:"play",uid:aoe.uid,targets:this.aiTargets(aoe,s,o),option:autoOption(aoe,s,o)};}
        }
        for(const c of opts){
          const sc=scoreCard(s,o,c,lethal,this.campStage)+Math.random()*this.noise();
          if(sc>bs){bs=sc;best=c;}
        }
        if(best&&bs>-20){
          /* 需要场面的牌（整编/燃烧弹/策反/AOE）：先让己方单位攻击，避免浪费攻击次数 */
          if(PRE_ATTACK.has(best.effect)&&!lethal&&s.board.some(u=>!canAttack(u)&&u.attack>0)){
            const mv=this.chooseAttack(s,o)||this.forceAttack(s,o);
            if(mv)return mv;
          }
          this.plays++;
          return{type:"play",uid:best.uid,targets:this.aiTargets(best,s,o),option:autoOption(best,s,o)};
        }
      }
    }
    /* 剧情·土匪AI：前期不攻击；中期只解场不打脸 */
    if(this.campStage===0)return{type:"end"};
    const mv=this.chooseAttack(s,o);
    if(mv&&this.campStage===1&&mv.target===null){this.passed.add(mv.unit.uid);return this.next(game,pi);}
    if(mv)return{type:"attack",uid:mv.unit.uid,target:mv.target?mv.target.uid:null};
    return{type:"end"};
  }
  /* 强制攻击：消耗己方单位的牌（整编/燃烧弹/火船）前，即使正常选攻认为"不值"，
   * 也要让攻击力>0且未攻击的单位打一次——这些单位反正要献祭，攻击不浪费。
   * 优先打脸（快攻），其次打能斩杀的单位，兜底打任一目标。 */
  forceAttack(s,o){
    const ready=s.board.filter(u=>!canAttack(u)&&u.attack>0&&!this.passed.has(u.uid));
    if(!ready.length)return null;
    for(const u of ready){
      const v=attackTargets(u,o);
      if(v.hero)return{unit:u,target:null};
    }
    for(const u of ready){
      const v=attackTargets(u,o);
      const kills=v.units.map(id=>o.board.find(x=>x.uid===id)).filter(t=>t&&u.attack>=t.health).sort((x,y)=>unitValue(y)-unitValue(x));
      if(kills.length)return{unit:u,target:kills[0].uid};
    }
    const u=ready[0],v=attackTargets(u,o);
    return{unit:u,target:v.hero?null:(v.units[0]||null)};
  }
  chooseAttack(s,o){
    const style=HERO_STYLE[(s&&s.hero)||this.hero]||{};
    const mode=deckMode(s);
    /* 白俄罗斯铁壁 / 星联邦流：不抢血，优先解场与保住回血引擎 */
    /* 钢铁洪流上线（坦克产线开动）后转为推进；
       白俄罗斯：先解场攒甲，靠坦克反打；星联邦：纯防守拖疲劳 */
    const tideOnline=!!(s&&s.steelTide);
    const tradeFirst=!tideOnline&&(mode==="blr"||mode==="federation");
    const defensive=!tideOnline&&mode==="federation";
    let aggro=style.aggro!==undefined?style.aggro:.5;
    if(mode==="blr")aggro=tideOnline?.8:.35;
    else if(mode==="federation")aggro=tideOnline?.8:.4;
    for(let guard=0;guard<20;guard++){
      const ready=s.board.filter(u=>!canAttack(u)&&!this.passed.has(u.uid));
      if(!ready.length)return null;
      const lethal=faceReach(s,o)>=o.hp+o.armor;
      let best=null;
      for(const u of ready){
        const v=attackTargets(u,o);
        const hd=u.attack+heroBonus(u);
        const wG=u.id==="cometWatcher"?(mode==="federation"?-40:-30):0;   // 保护彗星观察者：不打（留场回血）
        const consider=(t,sc)=>{if(!best||sc>best.score)best={unit:u,target:t,score:sc};};
        if(v.hero){
          let fs=hd*(.5+.9*(1-Math.max(0,o.hp)/o.maxHp))+wG;
          if(lethal)fs+=1000;
          if(u.lifespan>0)fs+=60;                       // 限时单位（超人）：打脸优先，不解场
          if(u.charge&&u.atkLeft>=u.strikes)fs+=aggro*hd*.8;   // 冲锋单位首回合抢血
          fs+=(aggro-.5)*hd*2+(aggro>=.8?hd*1.5:0);     // 角色抢血倾向
          if(aggro>=.85)fs+=hd*1.3;                     // 极致抢血（八幡/核弹）：打脸额外加成
          if(u.taunt&&!lethal&&s.hp<=14)fs-=3;
          if(!o.board.length)fs+=2;
          if(tradeFirst){fs-=2;if(o.board.length)fs-=1;}   // 有场面先清，但别完全不摸脸
          if(this.level==="easy")fs+=3;
          consider(null,fs);
        }
        for(const id of v.units){
          const t=o.board.find(x=>x.uid===id);
          const kills=u.attack>=t.health,dies=t.attack>=u.health;
          let sc=(kills?unitValue(t):unitValue(t)*.12)-(dies?unitValue(u):0)+wG;
          if(kills&&!dies)sc+=3;
          if(!kills&&dies)sc-=4;
          if(t.taunt&&kills)sc+=1.5;
          if(tradeFirst){sc+=1;if(t.attack>=4)sc+=.8;if(kills&&!dies)sc+=.6;}   // 解场优先
          if(this.level==="hard"&&t.id==="awaBand")sc+=4;
          // 极致抢血（八幡/核弹）：不白吃 / 不过墙 / 非自危威胁时，解场大幅降分 → 专注打脸
          // 白吃高值单位、或自己血量不健康/敌方威胁大(攻击高)时仍解场（保场面）
          if(aggro>=.85&&!t.taunt){
            const selfRisk=s.hp<=o.hp||s.hp<=10;
            const threat=t.attack>=4&&(s.hp<=14||t.attack>=s.hp);
            if(!(kills&&!dies)&&!selfRisk&&!threat)sc-=8;
          }
          consider(t,sc+Math.random()*this.noise());
        }
      }
      if(!best)return null;
      if(best.score<-1&&!lethal){this.passed.add(best.unit.uid);continue;}
      return best;
    }
    return null;
  }
}

return{AIPlayer,burnOf,isLethal,deckMode};
});
