/* 皇冠对决 · 规则引擎（浏览器单机与服务器联机共用）
   - 完全同步、无 DOM 依赖；所有随机由 Math.random 产生
   - 所有需要玩家选择的效果都在出牌时就带上目标（targets / option），
     只有依赖隐藏信息的效果（查看牌库顶、发现）才会进入 pending 等待选择 */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory(require("./cards.js"));
  else root.DuelEngine=factory(root.DuelCards);
})(typeof self!=="undefined"?self:this,function(C){
"use strict";
const {MAX_BOARD,MAX_HAND,ESCAPE_TARGET,STEAL_UNIT,DECK_SIZE,MAX_ENERGY,PROFILES,TOKENS,AWA_CARDS,CAMPAIGN_CARDS,CAMPAIGN_UPGRADES}=C;

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ============================================================
   纯规则函数：参数是「玩家对象」，服务器状态和客户端视图都能用
   ============================================================ */
function bandCount(p){return p&&p.board?p.board.filter(u=>u.id==="awaBand"&&u.health>0).length:0;}
/* 政体：加成在「当前政体」或「联邦回合」（苏三世）时生效；代价只在当前政体时生效 */
function hasBonus(p,r){return!!p&&(p.regime===r||!!p.fedTurn);}
function hasCost(p,r){return!!p&&p.regime===r;}
/* 增伤：爵士乐队（所有伤害）、乌克兰政体（部署与法术伤害，不含战斗） */
function boost(src,n,combat){return n>0?n+bandCount(src)+((!combat&&hasBonus(src,"ukr"))?1:0):n;}
/* 白俄罗斯铁壁：卡组里带了足够多的 blr 组件时，开局优先选白俄罗斯（俄罗斯政体拿不到护甲，整套甲牌会哑火） */
function blrPieces(p){
  const cards=((p&&p.deck)||[]).concat((p&&p.hand)||[]);
  return cards.filter(c=>c&&(c.rep==="blr"||/^blr/.test(c.id||""))).length;
}
function bestRegime(me,foe){
  const enAtk=foe.board.reduce((a,u)=>a+(u.health>0?u.attack:0),0);
  if(me.hp<=12||enAtk>=8)return"blr";
  if(blrPieces(me)>=6)return"blr";
  if(foe.board.length>=3)return"ukr";
  return"rus";
}
function redCount(p){return p.board.filter(u=>u.id==="red"&&u.health>0).length;}
function heroBonus(u){return(u.id==="executor"||u.id==="captain")?1:0;}
function gunCount(p){return p.board.filter(u=>u.gun&&u.health>0).length;}
function unitValue(u){return u.attack+u.health*.8+(u.taunt?2:0)+(u.cost||0)*.5;}

function canAttack(u){
  if(!u||u.health<=0)return"单位已阵亡";
  if(u.stun>0)return"该单位被眩晕，本回合无法攻击";
  if(u.atkLeft<=0)return u.fresh?"刚部署的单位下回合才能攻击":"本回合已经攻击过了";
  return null;
}
function attackTargets(u,foe){
  const taunts=foe.board.filter(t=>t.taunt&&!t.untargetable&&t.health>0);
  if(u.ignoreTaunt||!taunts.length)
    return{hero:!foe.heroImmune,units:foe.board.filter(t=>!t.untargetable&&t.health>0).map(t=>t.uid)};
  return{hero:false,units:taunts.map(t=>t.uid)};
}

function eligible(list,min,max,label,side){
  const ids=list.filter(u=>u.health>0).map(u=>u.uid);
  if(!ids.length)return null;
  return{side,min:Math.min(min,ids.length),max:Math.min(max,ids.length),label,eligible:ids};
}
/* 出牌时需要选择的目标 */
function targetSpec(card,me,foe){
  switch(card.effect){
    case"choose4":return eligible(foe.board,1,1,"选择 1 个敌方单位，造成 4 点伤害","foe");
    case"choose2":return eligible(foe.board,1,1,"选择 1 个敌方单位，造成 2 点伤害","foe");
    case"choose3x2":return eligible(foe.board,1,3,"选择 1~3 个敌方单位，各造成 2 点伤害","foe");
    case"rebel":return eligible(foe.board,1,1,"选择 1 个敌方单位策反","foe");
    case"buffOneDraw":return eligible(me.board,1,1,"选择 1 个友方单位 +2/+2","me");
    case"buffPirate3":return eligible(me.board,1,1,"选择 1 个你的单位 +3/+3","me");
    case"pirateCommander":return eligible(me.board,1,1,"选择 1 个你的单位 +3/+3","me");
    case"sacAoe3":return eligible(me.board,1,1,"选择要献祭的己方单位","me");
    case"decreeUkr":return eligible(foe.board,1,1,"选择 1 个敌方单位，造成 2 点伤害","foe");
    case"killTough":return eligible(foe.board.filter(u=>u.health>u.attack&&u.health>0),1,1,"选择 1 个生命值高于攻击力的敌方单位","foe");
    case"stripTaunt":case"stripTauntDraw":return eligible(foe.board.filter(u=>u.taunt&&u.health>0),1,1,"选择 1 个敌方嘲讽单位","foe");
    case"stunOrKill":return eligible(foe.board,1,1,"选择 1 个敌方单位（眩晕或消灭）","foe");
    case"stunOneDraw":return eligible(foe.board,1,1,"选择 1 个敌方单位眩晕","foe");
    case"cpNet":return eligible(foe.board,1,1,"选择 1 个敌方单位，造成 1 点伤害","foe");
    case"diyPull":return eligible(foe.board,1,1,"选择 1 个敌方单位策反并使其获得 +1/+4","foe");
    /* 内置角色·苍蓝 */
    case"azureSynth":return eligible(foe.board,1,1,"选择 1 个敌方单位，造成 4 点伤害","foe");
    case"divinePull":return eligible(foe.board,1,1,"选择 1 个敌方单位策反并使其获得 +1/+4","foe");
    case"dreamCast":return eligible(foe.board,1,1,"选择 1 个敌方单位眩晕","foe");
    case"sacrifice":return eligible(me.board,1,1,"选择 1 个友方单位进行献祭","me");
    case"symbiosis":return eligible(me.board,1,1,"选择 1 个友方单位获得亡语","me");
    case"holySmite":return eligible(foe.board,1,1,"选择 1 个敌方单位，造成 2（或 4）点伤害","foe");
    case"purgeOrder":return eligible(foe.board,1,1,"选择 1 个敌方单位消灭","foe");
  }
  return null;
}
/* 出牌时的二选一 */
function optionSpec(card){
  if(card.effect==="secondDeploy")return{label:"选择政体",options:[
    {id:"rus",label:"俄罗斯 · 新单位冲锋，无法获得护甲"},
    {id:"ukr",label:"乌克兰 · 伤害 +1，新单位生命 -1"},
    {id:"blr",label:"白俄罗斯 · 回合末 +2 护甲，新单位无冲锋"}]};
  return null;
}
/* 能否出这张牌：返回 null 或原因 */
function scrapTax(p){return p&&p.board?p.board.filter(u=>u.effect==="scrapTax"&&u.health>0).length:0;}
function junkTax(p){return p&&p.board?2*p.board.filter(u=>u.effect==="whiteJunkTax"&&u.health>0).length:0;}
/* 实际费用：废品回收站让手牌中的废料费用 +1（视图里的牌已经加过，带 taxed 标记） */
function effCost(card,me,foe){return card.cost+((card.scrap&&!card.taxed)?scrapTax(me):0)+(card.effect==="whiteJunk"&&!card.junkTaxed?junkTax(foe):0);}
/* 能否出这张牌：返回 null 或原因 */
function playError(card,me,foe){
  const cost=effCost(card,me,foe);
  if(cost>me.energy)return`费用不足（需要 ${cost}，当前 ${me.energy}）`;
  if(me.turnCap!=null&&(me.playedTurn||0)>=me.turnCap)return`出牌封锁：本回合最多只能打出 ${me.turnCap} 张牌`;
  if(card.kind==="spell"&&me.noSpell)return"寂静星环：本回合无法打出法术牌";
  if(card.kind==="unit"&&me.board.length>=MAX_BOARD)return`战场已满（最多 ${MAX_BOARD} 个单位）`;
  const e=card.effect;
  if(e==="rebel"&&!foe.board.length)return"敌方没有单位可以策反";
  if(e==="diyPull"&&!foe.board.length)return"敌方没有单位可以策反";
  /* 内置角色·苍蓝 */
  if(e==="azureSynth"&&!foe.board.length)return"敌方没有单位可以攻击";
  if(e==="holySmite"&&!foe.board.length)return"敌方没有单位";
  if(e==="purgeOrder"&&!foe.board.length)return"敌方没有单位";
  if(e==="sacrifice"&&!me.board.length)return"你没有可以献祭的友方单位";
  if(e==="symbiosis"&&!me.board.length)return"你没有友方单位";
  if(e==="divinePull"&&foe.board.length&&me.board.length>=MAX_BOARD)return"你的战场已满，无法接收策反的单位";
  if(e==="stripTauntDraw"&&!foe.board.some(u=>u.taunt&&u.health>0))return"敌方没有嘲讽单位";
  if(e==="stunOrKill"&&!foe.board.length)return"敌方没有单位可以眩晕";
  if(e==="stunOneDraw"&&!foe.board.length)return"敌方没有单位可以眩晕";
  if(e==="cometStrike"&&me.hp<=40)return`彗星陨击需要你的英雄血量高于 40（不含护甲，当前 ${me.hp}）`;
  if(e==="reshuffleDraw"&&!me.hand.length)return"调节：你手牌为空";
  if(/^(rebel|takeover)/.test(e)&&foe.board.length&&me.board.length>=MAX_BOARD)return"你的战场已满，无法接收策反的单位";
  if(e==="sacAoe3"&&!me.board.length)return"你没有可以献祭的单位";
  if(e==="blrSteelTide"&&me.steelTide)return"钢铁洪流：本局已经生效，不需要再打第二张";
  if(card.sealed)return"情报封存：这张牌在本回合无法打出";
  {
    const sc=me.hand.filter(x=>x.scrap&&x.uid!==card.uid).length;
    const need={scrapToUnits:1,convert2:2,convert3:3,scrapStun:1,scrapBlast:1,scrapSweep:1,scrapSearch:1,crownCopy:2}[card.effect];
    if(need&&sc<need)return`需要手牌中至少有 ${need} 张【废料】（目前 ${sc} 张）`;
    if(card.effect==="scrapStun"&&!foe.board.length)return"敌方没有单位可以眩晕";
    // 下面三处加了 me.deck / foe.deck 的判空：
    // 客户端 UI 用的是 pubPlayer（没有 deck 字段），加 && 后 UI 预判会跳过这一层，
    // 真正的规则裁决仍由引擎（playCard）用完整 player 对象执行。
    if(card.effect==="scrapSearch"&&me.deck&&!me.deck.length)return"你的牌库已经空了";
    if(card.effect==="scrapToUnits"&&me.board.length>=MAX_BOARD)return`战场已满（最多 ${MAX_BOARD} 个单位）`;
    if(card.effect==="supplyDeck"&&me.deck&&!me.deck.some(x=>x.kind==="unit"))return"牌库里没有单位牌";
    if(card.effect==="intelSteal"&&foe.deck&&!foe.deck.length)return"敌方牌库已经空了";
    if(card.kind==="spell"&&["whiteDeckDraw","whiteDeck2","whiteDeckArmor","whiteDeck2Draw"].includes(card.effect)&&foe.deck&&!foe.deck.length)return"敌方牌库已经空了";
    if(card.kind==="spell"&&["whiteHand1","whiteConfiscate","whiteNight"].includes(card.effect)&&foe.hand&&!foe.hand.length&&foe.deck&&!foe.deck.length)return"敌方没有可销毁的卡牌";
    if(card.effect==="whiteCorruptDeck"&&foe.deck&&!foe.deck.some(x=>x.effect!=="whiteJunk"))return"敌方牌库没有可污染的卡牌";
  }
  if(e==="consolidate"&&redCount(me)<2)return"整编需要至少 2 个【俄布】";
  if(e==="artilleryCommand"){
    const ch=me.regimeChanges||0;
    if(ch<2)return`权限未满足：本局需要确立或更换过 2 次政体（目前 ${ch} 次）`;
    if(me.board.length<2)return"权限未满足：战场上至少需要 2 个单位";
  }
  return null;
}

/* 自动选择目标（AI 以及「被召唤时触发的部署效果」使用） */
function autoTargets(card,me,foe){
  const spec=targetSpec(card,me,foe);if(!spec)return[];
  const pool=(spec.side==="foe"?foe:me).board.filter(u=>spec.eligible.includes(u.uid));
  const e=card.effect;
  let sorted;
  if(e==="choose4"||e==="choose2"||e==="decreeUkr"){
    const dmg=e==="choose4"?4:2;
    sorted=pool.slice().sort((a,b)=>((b.health<=dmg?10:0)+unitValue(b))-((a.health<=dmg?10:0)+unitValue(a)));
  }else if(e==="choose3x2")sorted=pool.slice().sort((a,b)=>((b.health<=2?10:0)+unitValue(b))-((a.health<=2?10:0)+unitValue(a)));
  else if(e==="rebel")sorted=pool.slice().sort((a,b)=>unitValue(b)-unitValue(a));
  else if(e==="diyPull")sorted=pool.slice().sort((a,b)=>unitValue(b)-unitValue(a));
  else if(e==="sacAoe3")sorted=pool.slice().sort((a,b)=>unitValue(a)-unitValue(b));
  else if(e==="pirateCommander")sorted=pool.slice().sort((a,b)=>((a.id==="pirateScout"?1e6:b.attack))-((b.id==="pirateScout"?1e6:a.attack)));
  else if(e==="killTough")sorted=pool.slice().sort((a,b)=>((b.taunt?10:0)+b.health)-((a.taunt?10:0)+a.health));
  else if(e==="stripTaunt"||e==="stripTauntDraw")sorted=pool.slice().sort((a,b)=>b.health-a.health);
  else if(e==="stunOrKill")sorted=pool.slice().sort((a,b)=>((a.stun>0?10:0)+unitValue(a))-((b.stun>0?10:0)+unitValue(b)));
  else sorted=pool.slice().sort((a,b)=>b.attack-a.attack);
  return sorted.slice(0,spec.max).map(u=>u.uid);
}
function autoOption(card,me,foe){
  if(card.effect==="secondDeploy")return bestRegime(me,foe);
  return null;
}

/* ============================================================
   对局
   ============================================================ */
class Game{
  /* opts.players = [{name, hero, deck:[id×40]}, …]，opts.first 可选
     opts.campaign = 剧情模式配置 {player:0, survive:[6,9,12], events:{...}, boss:"bd_boss", hero:"八幡", ch:"ch1"} */
  constructor(opts){
    this.uid=0;this.events=[];this.logs=[];
    this.campaign=opts.campaign||null;   // 剧情模式（须在 _makePlayer 前设置）
    this.players=opts.players.map((p,i)=>this._makePlayer(i,p));
    this.first=(opts.first===0||opts.first===1)?opts.first:(Math.random()<.5?0:1);
    this.current=this.first;this.turn=0;this.phase="mulligan";
    this.lock=null;this.winner=null;this.reason="";this.pending=null;
    if(this.campaign){this.campaign.seen={};this.campaign.reachedStar=0;this.campaign.canFinish=false;}
    const f=this.players[this.first],s=this.players[1-this.first];
    this._drawRaw(f,4);this._drawRaw(s,5);
    this.note(`对局开始：${f.name}（${f.hero}）先手，${s.name}（${s.hero}）后手`);
    (this.intro||[]).forEach(x=>this.note(`${this.players[x.pi].name} 的【${x.from}】变成了 awa 的【${x.to}】，已洗入牌库`));
  }
  _makePlayer(i,p){
    const prof=PROFILES[p.hero];
    /* 剧情模式跳过 deckError 校验（剧情卡组 30 张、敌方无档案）；普通对局仍严格校验 */
    const deckIds=(p.deck&&(!prof||this.campaign||!C.deckError(p.hero,p.deck)))?p.deck:C.defaultDeck(p.hero);
    const upgrades=p.upgrades||{};
    const deck=shuffle(deckIds.map(id=>{
      const def=(prof&&prof.cards.find(c=>c.id===id))||C.cardDef(p.hero,id);
      return this.clone(def,p.hero,upgrades[id]||0);
    }));
    /* 带有【awa】的卡组：开局时它变成 awa 的一张随机卡牌并洗入牌库 */
    const pool=Object.values(AWA_CARDS);
    this.intro=this.intro||[];
    for(let k=0;k<deck.length;k++){
      if(!deck[k].awaSwap)continue;
      const def=pool[Math.floor(Math.random()*pool.length)];
      this.intro.push({pi:i,from:deck[k].name,to:def.name});
      deck[k]=this.clone(def,p.hero);
    }
    if(this.intro.some(x=>x.pi===i))shuffle(deck);
    const hp=prof?prof.hp:(p.hp||30);
    /* 初始卡组（40 张 id）：AI 用来判断自己带的是哪套预设（同一英雄可能有两套） */
    const deckAll=deckIds.slice();
    return{idx:i,name:p.name||("玩家"+(i+1)),hero:p.hero,hp,maxHp:hp,armor:0,energy:0,maxEnergy:0,
      fatigue:0,deck,deckAll,hand:[],board:[],money:0,destroyedCards:0,destroyedLog:[],heroImmune:false,turnsStarted:0,mulliganDone:false,
      regime:null,regimeChanges:0,fedTurn:false,
      decay:0,turnCap:null,nextCap:null,noSpell:false,nextNoSpell:false,playedTurn:0,steelTide:false,lostMaxEnergy:0,
      stats:{dmg:0,played:0,kills:0}};
  }
  clone(c,hero,upLvl){
    const up=(upLvl&&CAMPAIGN_UPGRADES[c.id]&&CAMPAIGN_UPGRADES[c.id][upLvl])||null;
    const x={uid:++this.uid,id:c.id,hero:c.hero||hero||"",name:up&&up.name?up.name:c.name,cost:c.cost,baseCost:c.cost,kind:c.kind,art:c.art,icon:c.icon,text:c.text,flavor:c.flavor||"",
      effect:c.effect||"",charge:!!(c.charge||(up&&up.charge)),taunt:!!(c.taunt||(up&&up.taunt)),ignoreTaunt:!!c.ignoreTaunt,core:!!c.core,owner:c.owner||"",
      untargetable:!!c.untargetable,gun:!!c.gun,member:!!c.member,rarity:c.rarity||"",fx:c.fx||"",rep:c.rep||"",transfer:c.transfer||"",sealed:false,awaSwap:!!c.awaSwap,onDraw:!!c.onDraw,
      scrap:!!c.scrap,recycle:c.recycle||"",recycleN:c.recycleN||1,upLvl:upLvl||0,upDeployDraw:up&&up.deployDraw||0};
    if(c.kind==="unit"){x.attack=c.atk+(up&&up.atk||0);x.health=c.hp+(up&&up.hp||0);x.maxHealth=c.hp+(up&&up.hp||0);x.strikes=c.strikes||1;x.atkLeft=0;x.stun=0;x.fresh=false;x.deathDmg=0;x.lifespan=c.lifespan||0;}
    return x;
  }
  opp(p){return this.players[1-p.idx];}

  /* ---------- 事件与日志 ---------- */
  emit(ev){this.events.push(ev);}
  takeEvents(){const e=this.events;this.events=[];return e;}
  note(text,p,priv){this.logs.push({text,who:p?p.idx:-1,to:priv&&p?p.idx:-1});if(this.logs.length>120)this.logs.shift();}

  /* ---------- 抽牌 / 手牌 ---------- */
  _drawRaw(p,n){for(let i=0;i<n&&p.deck.length;i++)p.hand.push(p.deck.pop());}
  /* 贝露佩欧露：敌方每抽 1 张牌或部署 1 个单位，存在于手牌/牌库中的它费用 -2 */
  _reduceBeelzebub(p){
    const reduce=(card)=>{
      if(card&&card.id==="beelzebub"&&card.cost>0){
        card.cost=Math.max(0,card.cost-2);
        this.emit({t:"fx",name:"beelzebubCost",pi:p.idx,cost:card.cost});
      }
    };
    p.deck.forEach(reduce);p.hand.forEach(reduce);
  }
  draw(p,n=1,credit=null,label="手牌上限"){
    if(this.lock!==null){if(n>0)this.note("停摆：无法抽牌",p);return;}
    for(let i=0;i<n;i++){
      if(!p.deck.length){p.fatigue++;const dmg=p.fatigue*(p.fatigue+1)/2;this.note(`牌库已空，第 ${p.fatigue} 次疲劳，受到 ${dmg} 点伤害`,p);this.damageHero(p,dmg,{fatigue:true});if(this.phase==="over")break;continue;}
      const card=p.deck.pop();
      /* DIY·神罚：抽到时自动施放（不进手牌） */
      if(card.onDraw){this.note(`【${card.name}】抽到时自动施放`,p);this.cast(p,card,this.opp(p),[],null);this._onEnemySpell(p);if(this.phase==="over")break;continue;}
      if(p.hand.length>=MAX_HAND){this.burn(p,card,credit,label);continue;}
      p.hand.push(card);this._drawHeal(p);
      this._reduceBeelzebub(this.opp(p));
    }
  }
  addToHand(p,card){
    if(p.hand.length>=MAX_HAND)return false;
    // 发现海盗（新）：己方加入手牌的海盗 +1/+1
    if(p.pirateBuff&&card.kind==="unit"&&(card.hero==="八幡"||card.id==="pirateScout")){
      card.attack=(card.attack||0)+1;card.health=(card.health||0)+1;card.maxHealth=(card.maxHealth||0)+1;
    }
    p.hand.push(card);this._drawHeal(p);this._reduceBeelzebub(this.opp(p));return true;
  }
  burn(p,card,credit=null,label="手牌上限"){
    if(credit){this.recordDestroyed(credit,card,"抽牌溢出",label);return;}
    this.emit({t:"burn",pi:p.idx,sourcePi:p.idx,card:pubCard(card),overdraw:true,zone:"抽牌溢出"});
    this.note(`手牌已满，新抽到的【${card.name}】被销毁`,p);
  }
  destroyEnemyCards(s,o,zone,n,label){
    if(this.phase==="over")return 0;
    let count=0;
    for(let i=0;i<n;i++){
      let card=null,from="牌库";
      if((zone==="hand"||zone==="handOrDeck")&&o.hand.length){
        card=o.hand.splice(Math.floor(Math.random()*o.hand.length),1)[0];from="手牌";
      }else if(zone!=="hand"&&o.deck.length)card=o.deck.pop();
      if(!card)break;
      this.recordDestroyed(s,card,from,label);
      count++;
      if(this.phase==="over")break;
    }
    return count;
  }
  recordDestroyed(s,card,zone,label,converted=false){
    s.destroyedCards++;
    s.destroyedLog.push({name:card.name,zone,source:label,converted});
    if(!converted){
      this.emit({t:"burn",pi:this.opp(s).idx,sourcePi:s.idx,card:pubCard(card),destroyed:true,zone,source:label});
      this.note(`${label}：销毁敌方${zone}中的【${card.name}】`,s);
    }
    for(const u of s.board.filter(x=>x.effect==="whiteSentinel"&&x.health>0)){
      u.attack++;u.health+=2;u.maxHealth+=2;
      this.note(`${u.name}：因销毁敌牌获得 +1/+2`,s);
    }
  }
  forcedRead(s,o,n,label){
    for(let i=0;i<n&&this.phase!=="over";i++){
      const before=new Set(o.hand.map(c=>c.uid));
      this.draw(o,1,s,label);
      const drawn=o.hand.find(c=>!before.has(c.uid));
      if(drawn){
        o.hand=o.hand.filter(c=>c!==drawn);
        this.recordDestroyed(s,drawn,"刚抽到的手牌",label);
      }
    }
  }
  corruptEnemyCards(s,o,zone,n,label){
    const cards=zone==="手牌"?o.hand:o.deck;
    let changed=0;
    for(let i=0;i<n;i++){
      const candidates=cards.filter(c=>c.effect!=="whiteJunk");
      if(!candidates.length)break;
      const old=candidates[Math.floor(Math.random()*candidates.length)];
      const at=cards.indexOf(old);
      const into=cards[at]=this.clone(TOKENS.junk,o.hero);
      if(s.board.some(u=>u.effect==="whiteCorruptCredit"&&u.health>0))this.recordDestroyed(s,old,zone,label,true);
      changed++;
      const msg=`${label}：敌方${zone}中的【${old.name}】变成了【垃圾】`;
      this.note(msg,s);
      this.emit({t:"transformCard",pi:o.idx,sourcePi:s.idx,zone,card:pubCard(old),into:pubCard(into)});
    }
    return changed;
  }
  drawAndCorrupt(s,o,n,label){
    for(let i=0;i<n&&this.phase!=="over";i++){
      const before=new Set(o.hand.map(c=>c.uid));
      this.draw(o,1,s,label);
      const drawn=o.hand.find(c=>!before.has(c.uid));
      if(!drawn)continue;
      if(drawn.effect==="whiteJunk")continue;
      const at=o.hand.indexOf(drawn);
      const into=o.hand[at]=this.clone(TOKENS.junk,o.hero);
      if(s.board.some(u=>u.effect==="whiteCorruptCredit"&&u.health>0))this.recordDestroyed(s,drawn,"刚抽到的手牌",label,true);
      const msg=`${label}：敌方新抽到的【${drawn.name}】变成了【垃圾】`;
      this.note(msg,s);
      this.emit({t:"transformCard",pi:o.idx,sourcePi:s.idx,zone:"刚抽到的手牌",card:pubCard(drawn),into:pubCard(into)});
    }
  }
  _drawHeal(p){
    const n=p.board.filter(u=>u.effect==="drawHeal"&&u.health>0).length;
    if(!n)return;this.heal(p,n);this.note(`彗星观察者×${n}：恢复 ${n} 点生命`,p);
  }

  /* ---------- 伤害 / 治疗 ---------- */
  damageHero(p,n,o={}){
    if(this.phase==="over")return;
    if(!o.fatigue&&!o.self&&n>0){const src=this.opp(p);n+=bandCount(src);if(!o.combat&&hasBonus(src,"ukr"))n+=1;}
    if(n<=0)return;
    if(o.fatigue)p.hp-=n;
    else{const blocked=Math.min(p.armor,n);p.armor-=blocked;p.hp-=n-blocked;}
    if(!o.fatigue&&!o.self)this.opp(p).stats.dmg+=n;
    this._checkEnd();
  }
  _onEnemySpell(caster){
    if(this.phase==="over")return;
    const owner=this.opp(caster);
    for(const u of owner.board.filter(x=>x.effect==="whiteSpellPunish"&&x.health>0)){
      this.damageHero(caster,2);
      this.note(`${u.name}：敌方使用法术，对敌方英雄造成 2 点伤害`,owner);
      if(this.phase==="over")break;
    }
  }
  damageUnit(owner,u,n,src,combat){u.health-=boost(src,n,combat);}
  heal(p,n){p.hp+=n;}
  armor(p,n){
    if(n>0&&hasCost(p,"rus")){this.note("俄罗斯政体：无法获得护甲",p);return;}
    p.armor+=n;
  }
  setRegime(p,r){
    const names=C.REGIMES;
    if(p.regime===r){this.note(`政体仍是【${names[r]}】`,p);return;}
    p.regime=r;p.regimeChanges=(p.regimeChanges||0)+1;
    this.note(`${p.name} 的政体变为【${names[r]}】`,p);
    this.emit({t:"fx",name:"regime",pi:p.idx,regime:r});
  }
  /* 单位进入战场：就绪 + 政体对新单位的影响 */
  _enter(p,u){
    this._ready(u);
    if(u.kind!=="unit")return;
    if(hasCost(p,"blr")&&u.charge&&u.id!=="redTank"){u.charge=false;u.atkLeft=0;}
    if(hasBonus(p,"rus")&&!u.charge){u.charge=true;u.atkLeft=u.strikes;}
    if(hasBonus(p,"blr")&&u.taunt){u.attack+=1;u.health+=2;u.maxHealth+=2;}
    if(hasCost(p,"ukr")&&u.health>1){u.health-=1;u.maxHealth=Math.max(1,u.maxHealth-1);}
  }
  steal(p,n){
    if(this.lock!==null){this.note("停摆：无法偷取金钱",p);return;}
    const amt=n*STEAL_UNIT;
    p.money+=amt;this.note(`偷取 ${amt} 元（${p.money} / ${ESCAPE_TARGET}）`,p);
  }
  addDecay(s,o,n){
    o.decay=(o.decay||0)+n;
    this.note(`${o.name} 的英雄获得 ${n} 层【衰减】（共 ${o.decay} 层）`,s);
    this.emit({t:"fx",name:"decayMark",pi:s.idx});
  }
  lockCards(s,o,cap,noSpell){
    if(cap!=null)o.nextCap=Math.min(o.nextCap==null?99:o.nextCap,cap);
    if(noSpell)o.nextNoSpell=true;
    this.note(noSpell?"敌方下个回合无法打出法术牌":`敌方下个回合最多只能打出 ${cap} 张牌`,s);
    this.emit({t:"fx",name:"lock",pi:s.idx});
  }
  gainMax(p,n){
    if(this.lock!==null){this.note("停摆：无法增加费用",p);return false;}
    p.maxEnergy=Math.min(MAX_ENERGY,p.maxEnergy+n);return true;
  }
  loseMax(p,n){p.maxEnergy=Math.max(0,p.maxEnergy-n);p.energy=Math.min(p.energy,p.maxEnergy);p.lostMaxEnergy=(p.lostMaxEnergy||0)+n;}
  cleanup(){
    const triggers=[],souls=[],armorTriggers=[];
    for(const p of this.players){
      const dead=p.board.filter(u=>u.health<=0);
      if(!dead.length)continue;
      p.board=p.board.filter(u=>u.health>0);
      this.opp(p).stats.kills+=dead.length;
      /* 剧情模式：玩家击杀敌方首领 → 对话 */
      if(this.campaign&&p.idx!==this.campaign.player&&!this.campaign.seen.killBoss){
        const bossId=this.campaign.boss;
        if(bossId&&dead.some(u=>u.id===bossId)){
          this.campaign.seen.killBoss=true;
          this.emit({t:"ce",id:"killBoss",text:(this.campaign.events&&this.campaign.events.killBoss)||"敌方首领被击杀了！"});
        }
      }
      dead.forEach(u=>{
        if(u.deathDmg>0)triggers.push([p,u]);
        if(u.transfer||u.recycle)souls.push([p,u]);
        if(u.effect==="blrDeathArmor")armorTriggers.push([p,u]);
        /* 苍蓝·信徒：亡语获得 1 点费用 */
        if(u.effect==="believerDeath"){p.energy+=1;this.note("信徒的亡语：获得 1 点费用",p);}
        /* 共生：获得 2 点费用并抽 1 张牌 */
        if(u.deathEnergyDraw){p.energy+=u.deathEnergyDraw;this.draw(p,1);this.note(`${u.name} 的亡语：获得 2 点费用并抽 1 张牌`,p);}
        /* 不朽堡垒：亡语将 2 张神罚洗入敌方牌库 */
        if(u.effect==="vaultDeath"){
          for(let k=0;k<2;k++)this.opp(p).deck.push(this.clone(TOKENS.divinePunish,this.opp(p).hero));
          shuffle(this.opp(p).deck);
          this.note(`${u.name} 的亡语：将 2 张【神罚】洗入敌方牌库`,p);
        }
        /* 赤血战车：亡语使手牌费用 -1 */
        if(u.id==="warChariot"){
          p.hand.forEach(x=>{x.cost=Math.max(0,x.cost-1);});
          this.note("赤血战车的亡语：手牌中的所有牌费用 -1",p);
        }
      });
    }
    souls.forEach(([p,u])=>{
      const id=u.transfer||u.recycle;
      const def=TOKENS[id]||PROFILES[p.hero].cards.find(x=>x.id===id);
      if(!def)return;
      const times=u.transfer?1:(u.recycleN||1);
      for(let i=0;i<times;i++){
        const card=this.clone(def,p.hero);
        if(this.addToHand(p,card))this.note(u.transfer?`${u.name} 引渡：灵魂转移，【${def.name}】进入手牌`:`${u.name} 回收：【${def.name}】放回手牌`,p);
        else this.burn(p,card);
      }
      if(u.transfer)this.emit({t:"fx",name:"transfer",pi:p.idx});
    });
    triggers.forEach(([p,u])=>{
      this.note(`${u.name} 的亡语：对敌方英雄造成 ${u.deathDmg} 点伤害`,p);
      this.damageHero(this.opp(p),u.deathDmg);
    });
    /* 白俄罗斯民兵：亡语叠 2 点护甲 */
    armorTriggers.forEach(([p,u])=>{
      this.armor(p,2);this.note(`${u.name} 的亡语：获得 2 点护甲`,p);
    });
  }
  _ready(u){u.atkLeft=u.charge?u.strikes:0;u.fresh=true;}
  summon(p,id,n=1){
    let def=TOKENS[id]||PROFILES[p.hero].cards.find(x=>x.id===id);
    if(!def)for(const h in PROFILES){def=PROFILES[h].cards.find(x=>x.id===id);if(def)break;}
    if(!def&&CAMPAIGN_CARDS[id])def=CAMPAIGN_CARDS[id];
    if(!def)return 0;let k=0;
    for(let i=0;i<n&&p.board.length<MAX_BOARD;i++){const u=this.clone(def,p.hero);p.board.push(u);this._enter(p,u);k++;}
    return k;
  }
  takeover(from,to,u,label,temp){
    if(to.board.length>=MAX_BOARD){this.note(`${label}：战场已满，无法策反`,to);return false;}
    from.board=from.board.filter(x=>x!==u);
    this._ready(u);
    u.tempRebel=temp?from.idx:null;   // 临时策反记录原主人（下回合返回）；null=永久策反
    to.board.push(u);
    this.note(`${label}：${u.name} 倒戈加入！${temp?"（限一回合，下回合返回）":""}`,to);
    this.emit({t:"fx",name:"rebel",pi:to.idx,uid:u.uid});
    return true;
  }

  /* ---------- 胜负 ---------- */
  _checkEnd(){
    if(this.phase==="over")return;
    const d0=this.players[0].hp<=0,d1=this.players[1].hp<=0;
    if(!d0&&!d1)return;
    this._finish(d0&&d1?"draw":(d0?1:0),d0&&d1?"双方同归于尽":"击败了对手");
  }
  _finish(winner,reason){
    if(this.phase==="over")return;
    this.phase="over";this.winner=winner;this.reason=reason;this.pending=null;
    this.note(winner==="draw"?"平局！":`${this.players[winner].name} 获胜：${reason}`);
    /* 剧情模式胜利：发出 win 对话事件 */
    if(this.campaign&&this.campaign.player===winner){
      const p=this.players[winner];
      this.emit({t:"ce",id:"win",turns:p.turnsStarted,star:this.campaign.reachedStar||1,text:(this.campaign.events&&this.campaign.events.win)||"胜利！"});
    }
    this.emit({t:"over",winner,reason});
  }
  specialWin(p,reason){this._finish(p.idx,reason);}
  /* 剧情模式：玩家主动结算（撑过目标回合） */
  settleCampaign(pi){
    if(!this.campaign||this.phase==="over")return{ok:false};
    const player=this.campaign.player;
    if(pi!==player)return{ok:false,msg:"只有幸存者可以结算"};
    if(!this.campaign.canFinish)return{ok:false,msg:"还没有撑到最低目标回合"};
    this._finish(player,(this.campaign.events&&this.campaign.events.win)||"守住了！");
    return{ok:true};
  }
  concede(pi){
    if(this.phase==="over")return{ok:false};
    this.note(`${this.players[pi].name} 认输`,this.players[pi]);
    this._finish(1-pi,"对手认输");return{ok:true};
  }
  forfeit(pi,reason){if(this.phase!=="over")this._finish(1-pi,reason);}

  /* ---------- 调度（换牌） ---------- */
  mulligan(pi,uids){
    if(this.phase!=="mulligan")return err("现在不是调度阶段");
    const p=this.players[pi];if(p.mulliganDone)return err("已经确认过了");
    const set=new Set(Array.isArray(uids)?uids:[]);
    const out=p.hand.filter(c=>set.has(c.uid));
    if(out.length){
      p.hand=p.hand.filter(c=>!set.has(c.uid));
      this._drawRaw(p,out.length);
      out.forEach(c=>p.deck.push(c));shuffle(p.deck);
      this.note(`调度：更换了 ${out.length} 张牌`,p);
    }
    p.mulliganDone=true;
    if(this.players.every(x=>x.mulliganDone)){this.phase="play";this._startTurn(this.first);}
    return{ok:true};
  }

  /* ---------- 回合 ---------- */
  _startTurn(pi){
    if(this.phase==="over")return;
    const p=this.players[pi];
    this.current=pi;this.turn++;p.turnsStarted++;
    /* 剧情模式：玩家回合开始判定星级达标 / 低血对话 */
    if(this.campaign&&pi===this.campaign.player){
      const cm=this.campaign;
      const stars=cm.survive||[];
      for(let i=stars.length-1;i>=0;i--){
        if(p.turnsStarted>=stars[i]&&!(cm.seen["star"+(i+1)])){
          cm.seen["star"+(i+1)]=true;cm.reachedStar=Math.max(cm.reachedStar,i+1);cm.canFinish=true;
          this.emit({t:"ce",id:"star"+(i+1),star:i+1,turns:p.turnsStarted,text:(cm.events&&cm.events["star"+(i+1)])||`撑过了 ${stars[i]} 个回合！`});
        }
      }
      if(p.hp<=10&&!cm.seen.lowHp){cm.seen.lowHp=true;this.emit({t:"ce",id:"lowHp",text:(cm.events&&cm.events.lowHp)||"你已岌岌可危！"});}
    }
    if(this.lock===pi){this.lock=null;this.note("停摆结束",p);}
    p.heroImmune=false;
    if(p.armor>0){this.note(`护甲 ${p.armor} 点消散`,p);p.armor=0;}
    p.turnCap=p.nextCap;p.noSpell=p.nextNoSpell;p.nextCap=null;p.nextNoSpell=false;p.playedTurn=0;
    for(const u of p.board){
      if(u.lifespan>0){
        u.lifespan--;
        if(u.lifespan<=0){u.health=0;this.note(`${u.name} 消散了`,p);this.emit({t:"fx",name:"fade",pi,uid:u.uid});}
      }
    }
    /* 临时策反：限一回合，下个回合开始返回原主人（战场满→回手牌，再满→消散） */
    {
      const ret=[];
      for(const u of p.board)if(u.tempRebel!=null&&u.tempRebel!==undefined)ret.push(u);
      for(const u of ret){
        const orig=this.players[u.tempRebel];
        if(orig.board.length<MAX_BOARD){p.board=p.board.filter(x=>x!==u);this._ready(u);orig.board.push(u);this.note(`${u.name} 策反结束，返回了 ${orig.name} 的战场`,p);}
        else if(orig.hand.length<MAX_HAND){p.board=p.board.filter(x=>x!==u);orig.hand.push(u);this.note(`${u.name} 策反结束，${orig.name} 战场已满，返回其手牌`,p);}
        else{u.health=0;this.note(`${u.name} 策反结束，无处可归，消散了`,p);}
      }
    }
    this.cleanup();
    if(p.decay>0){
      this.note(`衰减：${p.name} 受到 ${p.decay} 点伤害`,p);
      this.emit({t:"fx",name:"decay",pi,n:p.decay});
      this.damageHero(p,p.decay,{fatigue:true});
      if(this.phase!=="over"&&p.decay>0)p.decay--;   /* 衰减：每回合开始掉一层 */
    }
    if(this.phase==="over")return;
    /* 钢铁洪流：永久状态，每个自己的回合开始把 1 张【红军坦克】加入手牌（手牌满则跳过） */
    if(p.steelTide){
      const tank=this.clone(TOKENS.redTank,p.hero);
      if(this.addToHand(p,tank))this.note("钢铁洪流：红军坦克进入手牌",p);
      else this.note("钢铁洪流：手牌已满，红军坦克没能进入手牌",p);
    }
    if(this.lock!==null)this.note("停摆：费用上限无法增加",p);
    p.maxEnergy=Math.min(MAX_ENERGY,p.maxEnergy+(this.lock!==null?0:1));
    p.energy=p.maxEnergy;
    for(const u of p.board){
      u.fresh=false;
      if(u.stun>0){u.atkLeft=0;u.stun--;this.note(`${u.name} 被眩晕，本回合无法攻击`,p);}
      else u.atkLeft=u.strikes;
    }
    this.emit({t:"turn",pi});
    /* DIY·机械眼：你的回合开始时随机攻击一个敌方目标（消耗本回合攻击次数） */
    for(const u of p.board){
      if(!(u.effect==="diyMechEye"||u.effect==="mechEye")||u.health<=0||u.atkLeft<=0||u.stun>0)continue;
      if(this.phase==="over")break;
      const foe=this.players[1-pi];
      const tg=foe.board.filter(x=>!x.untargetable&&x.health>0);
      let target=null;
      if(tg.length){if(!(Math.random()<.5))target=tg[Math.floor(Math.random()*tg.length)].uid;}
      else if(foe.heroImmune)continue;
      this.note(`机械眼：${u.name} 自动开火`,p);this.attack(pi,u.uid,target);
    }
    if(!(pi===this.first&&p.turnsStarted===1))this.draw(p,1);
    for(const u of p.board.filter(x=>x.effect==="whiteEngine"&&x.health>0))
      this.destroyEnemyCards(p,this.opp(p),"deck",2,u.name);
    for(const u of p.board.filter(x=>x.effect==="whiteMargin"&&x.health>0&&this.phase!=="over")){
      this.forcedRead(p,this.opp(p),1,u.name);
    }
    if(this.phase==="over")return;
    /* 苏苏开局：自动抽取并自动使用【苏维埃社会主义共和国联盟】——选择一个政体并成为它 */
    if(p.hero==="苏苏"&&p.regime===null&&p.turnsStarted===1){
      const opts=["rus","ukr","blr"].map(r=>({uid:-1,id:r,name:C.REGIMES[r],cost:0,kind:"spell",art:"☭",text:"开局确立此政体，其后新部署单位按其规则结算"}));
      const auto=Math.max(0,["rus","ukr","blr"].indexOf(bestRegime(p,this.opp(p))));
      this._pick(p,"苏维埃社会主义共和国联盟","开局：选择要建立的共和国政体并成为它",opts,auto,card=>{
        this.setRegime(p,card.id);
        this.note(`已建立【${C.REGIMES[card.id]}】政体`,p);
      });
    }
    if(p.hero==="绘梨衣"){
      // 皇冠产出 1→2 张：加快废料积累，支撑转化 / 复制皇冠等消耗（配合转化改进，避免慢热过头）
      let got=0;
      while(got<2&&p.hand.length<MAX_HAND&&this.addToHand(p,this.clone(TOKENS.scrap,p.hero)))got++;
      this.note(got?`皇冠产出：获得 ${got} 张【碎纸】`:"皇冠产出：手牌已满，没有产出",p);
    }
    /* 八幡：海盗的幸运币开局自动抽取（0费，给1费） */
    if(p.hero==="八幡"&&p.turnsStarted===1&&!p.hand.some(x=>x.id==="luckycoin")){
      if(this.addToHand(p,this.clone(PROFILES["八幡"].cards.find(x=>x.id==="luckycoin"),p.hero)))
        this.note("海盗的幸运币：对局开始自动抽取",p);
    }
  }
  _guard(pi){
    if(this.phase==="mulligan")return"请先完成调度";
    if(this.phase==="over")return"对局已结束";
    if(this.current!==pi)return"现在是对手的回合";
    if(this.pending)return"请先完成当前选择";
    return null;
  }
  endTurn(pi){
    const g=this._guard(pi);if(g)return err(g);
    const p=this.players[pi];
    for(const u of p.board){u.fresh=false;if(u.tempAtk){u.attack=Math.max(0,u.attack-u.tempAtk);u.tempAtk=0;}}
    /* 巫师议会：友方回合结束时，敌方所有单位攻击力 -1 */
    if(p.board.some(u=>u.id==="wizardCouncil"&&u.health>0)){
      this.opp(p).board.forEach(u=>{u.attack=Math.max(0,u.attack-1);});
      this.note("巫师议会：敌方所有单位攻击力 -1",p);
    }
    /* 机动防御等限时单位：回合结束时消散 */
    for(const u of p.board){
      if(u.tempTurns>0){u.tempTurns--;if(u.tempTurns<=0){u.health=0;this.note(`${u.name} 的机动掩护结束了，消散了`,p);}}
    }
    if(hasBonus(p,"blr")){this.armor(p,2);this.note("白俄罗斯政体：回合结束，获得 2 点护甲",p);}
    /* 边防哨所：己方回合结束时，只要场上还有嘲讽单位，就再叠 1 点护甲 */
    if(p.board.some(u=>u.health>0&&u.effect==="blrBastion")&&p.board.some(u=>u.health>0&&u.taunt)){
      this.armor(p,1);this.note("边防哨所：回合结束，获得 1 点护甲",p);
    }
    p.fedTurn=false;
    p.hand.forEach(x=>{x.sealed=false;});
    this.emit({t:"endTurn",pi});
    this._startTurn(1-pi);
    return{ok:true};
  }

  /* ---------- 出牌 ---------- */
  playCard(pi,uid,targets,option){
    const g=this._guard(pi);if(g)return err(g);
    const s=this.players[pi],o=this.opp(s);
    const c=s.hand.find(x=>x.uid===uid);if(!c)return err("手牌里没有这张牌");
    const pe=playError(c,s,o);if(pe)return err(pe);
    const spec=targetSpec(c,s,o);
    let picked=[];
    if(spec){
      const list=Array.isArray(targets)?[...new Set(targets)]:[];
      if(list.some(t=>!spec.eligible.includes(t)))return err("目标不合法");
      if(list.length<spec.min||list.length>spec.max)return err(spec.label);
      picked=list;
    }
    const os=optionSpec(c);
    if(os&&!os.options.some(x=>x.id===option))return err("请先做出选择");
    s.energy-=effCost(c,s,o);s.hand=s.hand.filter(x=>x!==c);s.stats.played++;s.playedTurn=(s.playedTurn||0)+1;
    this.emit({t:"play",pi,card:pubCard(c),targets:picked,option:os?option:null});
    if(c.kind==="unit"){
      s.board.push(c);this._enter(s,c);
      this.note(`部署 ${c.name}`,s);
      if(c.id==="superman")this.emit({t:"fx",name:"superman",pi});
      this.deploy(s,c,o,picked,option);
    }else{
      this.note(`施放【${c.name}】`,s);
      this.cast(s,c,o,picked,option);
      this._onEnemySpell(s);
    }
    /* 剧情模式：敌人打出【洗劫村庄】→ 着火对话 */
    if(this.campaign&&pi!==this.campaign.player&&c.id==="bd_burn"&&!this.campaign.seen.enemyBurn){
      this.campaign.seen.enemyBurn=true;
      this.emit({t:"ce",id:"enemyBurn",text:(this.campaign.events&&this.campaign.events.enemyBurn)||"村子着火了！"});
    }
    if(c.scrap)this._onScrapPlayed(s);
    this.cleanup();this._checkEnd();
    return{ok:true};
  }
  _onScrapPlayed(s){
    const tax=scrapTax(s);
    if(tax>0){this.note(`废品回收站：打出废料，抽 ${tax} 张牌`,s);this.draw(s,tax);}
    for(const u of s.board){
      if(u.health<=0)continue;
      if(u.effect==="scrapRage"){u.attack+=1;u.tempAtk=(u.tempAtk||0)+1;this.note(`${u.name}：攻击力 +1`,s);}
      else if(u.effect==="scrapHeal"){this.heal(s,1);this.note(`${u.name}：恢复 1 点生命`,s);}
    }
  }
  /* 弃掉手牌中的废料（all 为 true 时全部），返回弃掉的数量 */
  _discardScrap(s,n,all){
    const list=s.hand.filter(x=>x.scrap);
    const take=all?list:list.slice(0,n);
    s.hand=s.hand.filter(x=>!take.includes(x));
    return take.length;
  }
  /* 转化 N：弃掉 N 张废料，从牌库里发现 1 张中费牌，费用 -（N-1）
     旧规则池是 N+1~N+3，但绘梨衣卡组没有 4~6 费牌，导致「转化 3」几乎转不出牌、
     且转 3 不比转 2 好——出现「转得越多牌效越低」。
     修复：池下限固定为 3（保证能转到 汐/卫队/中立宣言 这类中费好牌），上界放宽到 N+4，
     折扣随 N 增大、选项随 N 增多——转得越多，牌越好、越便宜。 */
  _convert(s,n,label){
    if(s.hand.filter(x=>x.scrap).length<n){this.note(`${label}：手牌中的废料不足 ${n} 张`,s);return;}
    this._discardScrap(s,n,false);
    const lo=3, hi=n===2?5:n+4, disc=n-1, count=n+1;
    const pool=PROFILES[s.hero].cards.filter(x=>!x.awaSwap&&x.cost>=lo&&x.cost<=hi&&!/^(convert|crownCopy)/.test(x.effect||""));
    const opts=shuffle(pool.slice()).slice(0,count).map(x=>{const k=this.clone(x,s.hero);k.cost=Math.max(0,k.cost-disc);return k;});
    if(!opts.length){this.note(`${label}：没有可以转化的牌`,s);return;}
    this.note(`${label}：弃掉 ${n} 张废料`,s);
    const auto=opts.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
    this._pick(s,label,`弃掉了 ${n} 张废料：选择 1 张加入手牌，费用 -${disc}`,opts,auto,card=>{
      if(!this.addToHand(s,card))this.burn(s,card);
      this.note(`${label}：转化出【${card.name}】`,s,true);
      this.emit({t:"fx",name:"convert",pi:s.idx});
    });
  }

  /* ---------- 攻击 ---------- */
  attack(pi,uid,targetUid){
    const g=this._guard(pi);if(g)return err(g);
    const s=this.players[pi],o=this.opp(s);
    const u=s.board.find(x=>x.uid===uid);if(!u)return err("找不到这个单位");
    const ce=canAttack(u);if(ce)return err(ce);
    const v=attackTargets(u,o);
    const t=targetUid==null?null:o.board.find(x=>x.uid===targetUid);
    if(targetUid!=null&&!t)return err("目标不存在");
    if(t?!v.units.includes(t.uid):!v.hero){
      if(!t&&o.heroImmune)return err("敌方英雄处于免疫状态");
      if(t&&t.untargetable)return err("这个单位无法被攻击");
      return err("必须先攻击带嘲讽的单位");
    }
    this.emit({t:"attack",pi,uid,target:t?t.uid:null});
    u.atkLeft--;
    if(!t){
      this.damageHero(o,u.attack+heroBonus(u),{combat:true});
      this.note(`${u.name} 攻击了敌方英雄`,s);
    }else{
      this.damageUnit(o,t,u.attack,s,true);
      this.damageUnit(s,u,t.attack,o,true);
      this.note(`${u.name} 与 ${t.name} 交战`,s);
    }
    if(u.effect==="selfDamage1"&&u.health>0){u.health-=1;this.note(`${u.name} 攻击后生命 -1`,s);}
    this.cleanup();this._checkEnd();
    return{ok:true};
  }

  /* ---------- 等待选择（查看牌库顶 / 发现） ---------- */
  _pick(p,title,hint,cards,auto,onPick){
    if(!cards.length)return;
    this.pending={pi:p.idx,title,hint,cards,auto:clamp(auto|0,0,cards.length-1),onPick};
  }
  resolvePending(pi,index){
    const pd=this.pending;
    if(!pd||pd.pi!==pi)return err("现在没有需要你选择的内容");
    const i=Number(index);
    if(!Number.isInteger(i)||i<0||i>=pd.cards.length)return err("选择无效");
    this.pending=null;
    pd.onPick(pd.cards[i],i);
    this.cleanup();this._checkEnd();
    return{ok:true};
  }

  /* ---------- 部署效果 ---------- */
  deploy(s,c,o,targets,option){
    // 剧情卡升级：部署抽 1
    if(c.upDeployDraw>0)this.draw(s,c.upDeployDraw);
    // 发现海盗：己方海盗此后部署时各抽 1 张牌
    if(s.pirateDeployDraw&&c.kind==="unit"&&(c.hero==="八幡"||c.id==="pirateScout"))this.draw(s,1);
    // 发现海盗（新）：己方此后部署或加入的海盗 +1/+1
    if(s.pirateBuff&&c.kind==="unit"&&(c.hero==="八幡"||c.id==="pirateScout")){c.attack+=1;c.health+=1;c.maxHealth+=1;}
    const T=()=>targets&&targets.length?targets:autoTargets(c,s,o);
    switch(c.effect){
      /* ===== 内置角色·苍蓝（部署） ===== */
      case"mechPriest":
        if(this.summon(s,"blueMechEye",1))this.note("机械神甫：召唤了【苍蓝·机械眼】",s);
        break;
      case"lavaFortress":{
        const idx=s.board.indexOf(c);
        const isEdge=(idx===0||idx===s.board.length-1);
        const dmg=isEdge?6:3;
        o.board.forEach(u=>this.damageUnit(o,u,dmg,s));
        this.note(`熔岩骑士堡垒：造成 ${dmg} 点群体伤害！`,s);
        break;}
      case"wizardThunder":{
        if(s.board.some(u=>u.id==="wizardFire"&&u.health>0&&u!==c)){
          c.health=0;
          const council=this.clone(TOKENS.wizardCouncil,s.hero);
          s.board.push(council);this._enter(s,council);
          this.note("雷与火交织，大巫师[雷]转化成了【巫师议会】！",s);
        }
        break;}
      case"wizardFire":{
        if(s.board.some(u=>u.id==="wizardThunder"&&u.health>0&&u!==c)){
          c.health=0;
          const council=this.clone(TOKENS.wizardCouncil,s.hero);
          s.board.push(council);this._enter(s,council);
          this.note("火与雷交织，大巫师[火]转化成了【巫师议会】！",s);
        }
        break;}
      case"scoutDeploy":c.health-=3;this.note("侦察者：对自身造成 3 点伤害",s);break;
      case"spyGhostDeploy":{
        const pool=o.board.filter(u=>u.cost<=3&&u.health>0);
        if(pool.length){
          pool.sort((a,b)=>unitValue(b)-unitValue(a));
          this.takeover(o,s,pool[0],"间谍鬼策反");
        }else this.note("间谍鬼：敌方没有花费<=3的单位",s);
        break;}
      case"warChariotDeploy":this.loseMax(s,1);this.note("赤血战车：失去 1 点费用上限",s);break;

      case"heal2":this.heal(s,2);break;
      case"heal3":this.heal(s,3);break;
      case"draw":this.draw(s,1);break;
      case"whiteDeck1":this.destroyEnemyCards(s,o,"deck",2,c.name);break;
      case"whiteDeck2":this.destroyEnemyCards(s,o,"deck",3,c.name);break;
      case"whiteHand1":this.destroyEnemyCards(s,o,"handOrDeck",1,c.name);break;
      case"whiteProof":{
        const weak=o.board.filter(u=>u.attack<=2).sort((a,b)=>a.attack-b.attack||a.health-b.health)[0];
        if(weak)this.destroyBoardUnit(s,o,weak,c.name);
        break;
      }
      case"whiteMargin":this.forcedRead(s,o,1,c.name);break;
      case"whiteCorruptHand":this.corruptEnemyCards(s,o,"手牌",1,c.name);break;
      case"whiteMedic":this.heal(s,4);this.note(`${c.name}：恢复 4 点生命`,s);break;
      case"whiteAsh":{
        const n=Math.min(5,Math.floor(s.destroyedCards/2));
        c.attack+=n;c.health+=n;c.maxHealth+=n;
        this.note(`${c.name}：本局已销毁 ${s.destroyedCards} 张敌方卡牌，获得 +${n}/+${n}`,s);
        break;
      }
      case"whiteBoard":{
        const alive=o.board.filter(u=>u.health>0);
        if(alive.length){const highest=Math.max(...alive.map(u=>u.attack));for(const u of alive.filter(x=>x.attack===highest))this.destroyBoardUnit(s,o,u,c.name);}
        break;
      }
      case"whiteFinal":{
        const n=Math.min(18,4+2*s.destroyedCards);
        this.damageHero(o,n);this.note(`${c.name}：本局已销毁 ${s.destroyedCards} 张敌方卡牌，造成 ${n} 点伤害`,s);
        break;
      }
      case"whiteStrike":{
        const n=Math.min(7,2+Math.floor(s.destroyedCards/3));
        this.damageHero(o,n);this.note(`${c.name}：造成 ${n} 点伤害`,s);
        break;
      }
      case"drawHeal1":this.draw(s,1);this.heal(s,1);break;
      case"drawArmor":this.draw(s,1);this.armor(s,1);break;
      case"armor1":this.armor(s,1);break;
      case"armor2":this.armor(s,2);break;
      /* 白俄罗斯铁壁：部署即叠甲 */
      case"blrGarrison":this.armor(s,2);this.note(`${c.name}：部署，获得 2 点护甲`,s);break;
      case"blrRailway":this.armor(s,3);this.note(`${c.name}：部署，获得 3 点护甲`,s);break;
      case"armor3":this.armor(s,3);this.note("海岸防线：获得 3 点护甲",s);break;
      case"hero1":this.damageHero(o,1);break;
      case"hero2":this.damageHero(o,2);break;
      case"hero3":this.damageHero(o,3);break;
      case"hero5":this.damageHero(o,5);this.note("洗劫村庄：对敌方英雄造成 5 点伤害",s);break;
      case"hero99":this.damageHero(o,99);this.note("awa：对敌方英雄造成 99 点伤害",s);break;
      case"draw2":this.draw(s,2);break;
      case"cpNet":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){this.damageUnit(o,t,1,s);this.note(`渔网陷阱：对 ${t.name} 造成 1 点伤害`,s);}
        break;}
      case"cpUprising":if(this.summon(s,"cp_uprising",2))this.note("渔村号角：召唤 2 个起义村民",s);break;
      case"summonPirate":this.summon(s,"pirate",1);break;
      case"summonRandomPirate":{
        const pool=["deckhand","pirate","stalker","raider","mate"];
        const id=pool[Math.floor(Math.random()*pool.length)];
        if(this.summon(s,id,1)){const d=PROFILES["八幡"].cards.find(x=>x.id===id);this.note(`海盗船：召唤了【${d?d.name:"海盗"}】`,s);}
        break;}
      case"summonScout":if(this.summon(s,"pirateScout",1))this.note("海盗统领：召唤了先锋海盗",s);break;
      case"pirateCommander":{
        if(this.summon(s,"pirateScout",1))this.note("海盗统领：召唤了先锋海盗",s);
        if(this.addToHand(s,this.clone(TOKENS.pirateCry,s.hero)))this.note("海盗统领：获得 1 张【海盗战嚎】",s);
        break;}
      case"decay1":this.addDecay(s,o,1);break;
          case"decay2":this.addDecay(s,o,2);break;
          case"decay3":this.addDecay(s,o,3);break;
          case"decay3draw":this.addDecay(s,o,3);this.draw(s,1);break;
      case"copySmallCannon":if(this.summon(s,"smallcannon",1))this.note("轻型炮台复制了一个小炮组",s);break;
      case"buffAll1":this.buffAll(s,1,1);break;
      case"buffAll2":this.buffAll(s,2,2);break;
      case"buffGuns1":s.board.forEach(u=>{if(u.gun)u.attack+=1;});break;
      case"buffGuns2":s.board.forEach(u=>{if(u.gun)u.attack+=2;});break;
      case"gunnerBoost":if(gunCount(s)>1){c.attack+=1;c.health+=1;c.maxHealth+=1;this.note("炮兵班：获得 +1/+1",s);}break;
      case"energyDown":this.loseMax(o,1);this.note("引力场：敌方费用上限 -1",s);break;
      case"choose4":case"choose2":{
        const dmg=c.effect==="choose4"?4:2;
        T().forEach(id=>{const t=o.board.find(u=>u.uid===id);if(t){this.damageUnit(o,t,dmg,s);this.note(`对 ${t.name} 造成 ${dmg} 点伤害`,s);}});
        break;}
      case"choose3x2":{
        const hit=[];T().forEach(id=>{const t=o.board.find(u=>u.uid===id);if(t){this.damageUnit(o,t,2,s);hit.push(t.name);}});
        if(hit.length)this.note(`对 ${hit.join("、")} 各造成 2 点伤害`,s);
        break;}
      case"buffRed":s.board.forEach(u=>{if(u.id==="red"){u.attack+=2;u.health+=2;u.maxHealth+=2;}});this.note("哈萨克红军：所有俄布 +2/+2",s);break;
      case"summonRed1":this.summon(s,"red",1);break;
      case"summonRed2":this.summon(s,"red",2);break;
      case"alweiDeploy":this.draw(s,2);this.buffAll(s,1,1);this.note("阿伟：抽两张牌，全军 +1/+1",s);break;
      case"qixingDeploy":this.loseMax(o,1);this.note("七星：敌方费用上限 -1",s);break;
      case"starCoreZero":{
        // 星核卫士：选择手牌中 1 张牌，其费用变为 0（本局有效）
        if(!s.hand.length){this.note("星核卫士：你没有手牌",s);break;}
        this._pick(s,"星核卫士","选择 1 张手牌，其费用变为 0（本局有效）",s.hand.slice(),0,sel=>{
          sel.cost=0;this.note(`星核卫士：【${sel.name}】的费用变为 0`,s);
        });
        break;}
      case"susuDeploy":{
        const def=PROFILES["苏苏"].cards.find(x=>x.id==="red");
        if(s.board.length<MAX_BOARD){const u=this.clone(def,"苏苏");this._ready(u);s.board.push(u);this.note("苏苏：召唤一个俄布",s);}
        break;}
      case"huiliyiDeploy":{
        // 变废为宝：把手牌里费用最低的牌，变成同一卡牌师费用高 2 的随机牌
        if(!s.hand.length)break;
        let li=0;s.hand.forEach((x,i)=>{if(x.cost<s.hand[li].cost)li=i;});
        const low=s.hand[li];
        let pool=PROFILES[s.hero].cards.filter(x=>x.cost===low.cost+2&&!x.awaSwap);
        if(!pool.length){
          const higher=PROFILES[s.hero].cards.filter(x=>x.cost>low.cost&&!x.awaSwap);
          if(higher.length){const m=Math.min(...higher.map(x=>x.cost));pool=higher.filter(x=>x.cost===m);}
        }
        if(!pool.length)break;
        const def=pool[Math.floor(Math.random()*pool.length)];
        s.hand[li]=this.clone(def,s.hero);
        this.note(`变废为宝：【${low.name}】变成了【${def.name}】`,s);
        break;}
      case"baimaoDeploy":if(this.lock!==null)this.note("停摆：无法增加费用",s);else{s.energy+=3;this.note("白猫：本回合获得 3 点额外费用",s);}break;
      case"xiashuiDeploy":this.damageHero(o,3);this.note("下水：敌方英雄受 3 点伤害",s);break;
      case"yuchunDeploy":{
        let k=0;
        for(let i=o.deck.length-1;i>=0&&k<3;i--,k++)o.deck[i]=this.clone(TOKENS.duck,o.hero);
        if(k)this.note(`变鸭术：敌方牌库顶的 ${k} 张牌变成了【鸭子】`,s);
        break;}
      case"taojinDeploy":{
        // 搞笑 Combo：可能打出无限伤害，也可能抽风
        const r=Math.floor(Math.random()*4);
        if(r===0){this.damageHero(o,6);this.note("淘金：Combo 成功！对敌方英雄造成 6 点伤害",s);}
        else if(r===1){this.damageHero(s,3,{self:true});this.note("淘金：抽风了！自己受到 3 点伤害",s);}
        else if(r===2){this.draw(s,2);this.note("淘金：灵感爆发，抽 2 张牌",s);}
        else{this.heal(o,4);this.note("淘金：抽风了！敌方英雄恢复 4 点生命",s);}
        break;}
      case"steal3hero1":this.steal(s,3);this.damageHero(o,1);break;
      case"steal2":this.steal(s,2);break;
      case"steal3":this.steal(s,3);break;
      case"steal4":this.steal(s,4);break;
      case"steal3draw":this.steal(s,3);this.draw(s,1);break;
      case"steal2armor2":this.steal(s,2);this.armor(s,2);break;
      case"scrapPump":
        if(this._discardScrap(s,1,false)){c.attack+=2;c.health+=2;c.maxHealth+=2;this.note("临时工：弃掉 1 张废料，获得 +2/+2",s);}
        break;
      case"scrapGuard":{
        const k=Math.min(3,s.hand.filter(x=>x.scrap).length);
        if(k){c.attack+=k;c.health+=k;c.maxHealth+=k;this.note(`小怪兽卫队：获得 +${k}/+${k}`,s);}
        break;}
      case"scrapColossus":{
        const k=this._discardScrap(s,0,true);
        if(k){c.attack+=k;c.health+=k;c.maxHealth+=k;this.note(`废料巨像：弃掉 ${k} 张废料，获得 +${k}/+${k}`,s);}
        break;}
      case"costUp1":
        if(o.hand.length){const t=o.hand[Math.floor(Math.random()*o.hand.length)];t.cost+=1;this.note("汐：1 张敌方手牌费用 +1",s);}
        break;
      case"convert2":this._convert(s,2,c.name);break;
      case"secondDeploy":{
        const r=C.REGIMES[option]?option:bestRegime(s,o);
        this.setRegime(s,r);
        const t=o.board.filter(u=>u.health>0).sort((a,b)=>b.attack-a.attack)[0];
        if(t){t.stun=Math.max(t.stun||0,1);t.atkLeft=0;this.note(`苏二世：${t.name} 被眩晕，下个回合无法攻击`,s);}
        break;}
      case"thirdDeploy":
        s.fedTurn=true;
        this.note("苏三世：本回合三种政体的加成同时生效",s);
        this.emit({t:"fx",name:"regime",pi:s.idx,regime:"all"});
        break;
      case"killTough":{
        // 破阵者：消灭 1 个生命值高于攻击力的敌方单位
        const ids=T();
        if(ids.length){const t=o.board.find(u=>u.uid===ids[0]);if(t){t.health=0;this.note(`破阵者：消灭了【${t.name}】`,s);}}
        break;}
      case"stripTaunt":{
        // 潜行海盗：使 1 个敌方单位失去嘲讽
        const ids=T();
        if(ids.length){const t=o.board.find(u=>u.uid===ids[0]);if(t&&t.taunt){t.taunt=false;this.note(`潜行海盗：${t.name} 失去了嘲讽`,s);}}
        break;}
      case"clubberDeploy":
        if(this.addToHand(s,this.clone(TOKENS.stunClub,s.hero)))this.note("持棍海盗：获得 1 张【闷棍】",s);
        break;
    }
  }
  buffAll(s,a,h){s.board.forEach(u=>{u.attack+=a;u.health+=h;u.maxHealth+=h;});}
  aoe(s,o,n){o.board.forEach(u=>this.damageUnit(o,u,n,s));}
  destroyHighest(s,o,label){
    if(!o.board.length)return;
    const t=o.board.slice().sort((a,b)=>b.attack-a.attack)[0];
    t.health=0;
    this.note(`${label}：摧毁了 ${t.name}`,s);
    this.emit({t:"fx",name:"destroy",pi:s.idx,uid:t.uid});
  }
  destroyBoardUnit(s,o,u,label){
    if(!u||u.health<=0)return;
    u.health=0;
    this.recordDestroyed(s,u,"战场",label);
    this.emit({t:"fx",name:"destroy",pi:s.idx,uid:u.uid});
  }
  _summonFromDeck(s,o,pred,label){
    const i=s.deck.findIndex(pred);
    if(i<0||s.board.length>=MAX_BOARD)return null;
    const card=s.deck.splice(i,1)[0];
    s.board.push(card);this._enter(s,card);
    this.note(`${label}：召唤了 ${card.name}`,s);
    return card;
  }

  /* ---------- 法术 ---------- */
  cast(s,c,o,targets,option){
    const fx=(name,extra)=>this.emit(Object.assign({t:"fx",name,pi:s.idx},extra||{}));
    switch(c.effect){
      /* ===== 内置角色·苍蓝（法术） ===== */
      case"scoutDream":{
        const opts=[TOKENS.scout,TOKENS.spyGhost,TOKENS.dream].map(x=>this.clone(x,s.hero));
        this._pick(s,"侦察者的梦境","从 3 张梦境造物中选择 1 张加入手牌",opts,0,card=>{
          if(!this.addToHand(s,card))this.burn(s,card);
          this.note(`侦察者的梦境：获得了【${card.name}】`,s,true);
        });
        break;}
      case"dreamCast":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){t.stun=Math.max(t.stun||0,1);t.atkLeft=0;this.note(`入梦：${t.name} 被眩晕`,s);}
        break;}
      case"sacrifice":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=s.board.find(u=>u.uid===id);
        if(t){t.health=0;this.note(`献祭：消灭了 ${t.name}`,s);}
        this.draw(s,2);
        break;}
      case"disaster":{
        this.draw(s,1);
        const lost=s.lostMaxEnergy||0;
        s.energy+=lost*2;
        for(let k=0;k<lost;k++)o.deck.push(this.clone(TOKENS.divinePunish,o.hero));
        shuffle(o.deck);
        this.note(`妄想天灾：失去 ${lost} 个上限，获得 ${lost*2} 点临时费用，并洗入 ${lost} 张【神罚】`,s);
        break;}
      case"symbiosis":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=s.board.find(u=>u.uid===id);
        if(t){t.deathEnergyDraw=2;this.note(`共生：${t.name} 获得了亡语`,s);}
        break;}
      case"extremeMission":
        if(this.addToHand(s,this.clone(TOKENS.fearless,s.hero)))this.note("极限使命：将【无畏伤痛】加入了手牌",s);
        break;
      case"fearless":{
        s.board.forEach(u=>{u.attack+=2;u.health-=3;if(u.atkLeft<u.strikes&&!u.stun)u.atkLeft=u.strikes;});
        this.cleanup();
        this.note("无畏伤痛：全军 +2/-3，并在本回合即可攻击",s);
        const pool=s.deck.slice();
        if(pool.length){
          const opts=shuffle(pool).slice(0,3).map(x=>this.clone(x,s.hero));
          const auto=opts.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
          this._pick(s,"无畏伤痛","从牌库随机展示的 3 张牌中选择 1 张加入手牌",opts,auto,card=>{
            if(!this.addToHand(s,card))this.burn(s,card);
            this.note(`无畏伤痛：开发了【${card.name}】`,s,true);
          });
        }
        break;}
      case"shatteredImage":{
        this.loseMax(s,1);
        const pool=s.deck.slice();
        if(pool.length){
          const opts=shuffle(pool).slice(0,3).map(x=>this.clone(x,s.hero));
          const auto=opts.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
          this._pick(s,"破碎映像","从牌库随机展示的 3 张牌中选择 1 张",opts,auto,card=>{
            if(!this.addToHand(s,card))this.burn(s,card);
            this.note(`破碎映像：开发了【${card.name}】`,s,true);
          });
        }else this.note("破碎映像：牌库已空，只扣除费用上限",s);
        break;}
      case"divineWrath":{
        o.deck.push(this.clone(TOKENS.divinePunish,o.hero));
        o.deck.push(this.clone(TOKENS.divinePunish,o.hero));
        shuffle(o.deck);
        this.note("神怒：将 2 张【神罚】洗入敌方牌库",s);
        break;}
      case"divineBarrier":{
        let count=0;for(const cx of o.deck)if(cx.id==="divinePunish")count++;
        this.armor(s,count);this.note(`神谕壁垒：获得 ${count} 点护甲`,s);
        break;}
      case"divinePull":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t&&this.takeover(o,s,t,"圣光牵引",true)){
          t.attack+=1;t.health+=4;t.maxHealth+=4;
          this.note(`圣光牵引：${t.name} 获得 +1/+4`,s);
        }
        break;}
      case"divineEcho":{
        for(let k=0;k<4;k++)o.deck.push(this.clone(TOKENS.divinePunish,o.hero));
        for(let k=0;k<2;k++)s.deck.push(this.clone(TOKENS.divinePunish,s.hero));
        shuffle(o.deck);shuffle(s.deck);
        this.note("神罚共鸣：将 4 张【神罚】洗入敌方牌库，2 张洗入你的牌库",s);
        break;}
      case"summonMechEyeMax":{
        let k=0;
        while(s.board.length<MAX_BOARD){if(this.summon(s,"blueMechEye",1))k++;else break;}
        this.note(`机械狂潮：召唤了 ${k} 个【苍蓝·机械眼】`,s);
        break;}
      case"summonMechDef":{
        const k=this.summon(s,"blueMechDef",1);
        if(k){s.board[s.board.length-1].tempTurns=2;this.note("机动防御：召唤了 2/10 的机械眼",s);}
        break;}
      case"holySmite":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){
          let count=0;for(const cx of o.deck)if(cx.id==="divinePunish")count++;
          const dmg=count>0?4:2;
          this.damageUnit(o,t,dmg,s);
          this.note(`圣光惩戒：对 ${t.name} 造成 ${dmg} 点伤害`,s);
        }
        break;}
      case"purgeOrder":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){t.health=0;this.note(`净除指令：消灭了 ${t.name}`,s);}
        for(let k=0;k<2;k++)o.deck.push(this.clone(TOKENS.divinePunish,o.hero));
        shuffle(o.deck);
        this.note("净除指令：将 2 张【神罚】洗入敌方牌库",s);
        break;}
      case"punishArrival":{
        let count=0;for(const cx of o.deck)if(cx.id==="divinePunish")count++;
        if(count>0){
          const u=this.clone(TOKENS.holyColossus,s.hero);
          u.attack=count;u.health=count;u.maxHealth=count;
          s.board.push(u);this._enter(s,u);
          this.note(`神罚降临：召唤了 ${count}/${count} 的圣光巨像`,s);
        }else this.note("神罚降临：敌方牌库没有神罚",s);
        break;}
      case"divinePunish":
        this.damageHero(s,1);
        this.draw(s,1);
        {
          const ascetics=this.opp(s).board.filter(x=>x.effect==="ascetic"&&x.health>0);
          if(ascetics.length>0&&this.phase!=="over"){
            this.draw(this.opp(s),ascetics.length);
            this.note(`苦修者：敌方抽到【神罚】，抽 ${ascetics.length} 张牌`,this.opp(s));
          }
        }
        break;
      case"azureDevelop":{
        const pool=[];
        for(const h in PROFILES)PROFILES[h].cards.forEach(x=>{if(x.azure)pool.push(x);});
        if(!pool.length)break;
        const opts=shuffle(pool.slice()).slice(0,3).map(x=>this.clone(x,s.hero));
        const auto=opts.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
        this._pick(s,"尘封故事","从 3 张【苍蓝】牌中选择 1 张加入手牌",opts,auto,card=>{
          if(!this.addToHand(s,card))this.burn(s,card);
          this.note(`尘封故事：开发出【${card.name}】`,s,true);
        });
        break;}
      case"azureSynth":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){this.damageUnit(o,t,4,s);this.note(`碎质合成：对 ${t.name} 造成 4 点伤害`,s);}
        this.armor(s,1);
        break;}
      case"azureStar":this.armor(s,10);this.note("永恒虚星：获得 10 点护甲",s);break;
      case"azureDescend":{
        this.heal(s,5);
        const pool=s.deck.slice();
        if(!pool.length){this.note("机械神降：牌库为空，只恢复 5 点生命",s);break;}
        const opts=shuffle(pool).slice(0,3);
        const auto=opts.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
        this._pick(s,"机械神降","从牌库随机展示的 3 张牌中选择 1 张复制到手牌",opts,auto,card=>{
          const copy=this.clone(card,s.hero);
          if(!this.addToHand(s,copy))this.burn(s,copy);
          this.note(`机械神降：复制了【${copy.name}】`,s,true);
        });
        this.note("机械神降：恢复 5 点生命值",s);
        break;}

      case"scrapToUnits":{
        const pool=PROFILES[s.hero].cards.filter(x=>x.kind==="unit"&&x.rarity!=="elite"&&!x.awaSwap);
        const names=[];
        while(s.board.length<MAX_BOARD){
          const sc=s.hand.find(x=>x.scrap);if(!sc)break;
          s.hand=s.hand.filter(x=>x!==sc);
          const d=pool[Math.floor(Math.random()*pool.length)];
          const u=this.clone(d,s.hero);s.board.push(u);this._enter(s,u);names.push(d.name);
        }
        this.note(names.length?`以旧换新：废料变成了 ${names.join("、")}`:"以旧换新：没有可以转换的废料",s);
        if(names.length)fx("summonScrap",{n:names.length,title:"以旧换新"});
        break;}
      case"convert2":this._convert(s,2,c.name);break;
      case"convert3":this._convert(s,3,c.name);break;
      case"fiveYearPlan":{
        s.board.forEach(u=>this.damageUnit(s,u,2,s));
        this.cleanup();
        const x=s.board.concat(o.board).filter(u=>u.health>0&&u.health<u.maxHealth).length;
        this.note(`五年计划：我方单位各受 2 点伤害，场上共有 ${x} 个受伤单位`,s);
        if(x>0)this.draw(s,x);
        break;}
      case"supplyDeck":case"scrapSearch":{
        if(this.lock!==null){this.note("停摆：无法抽牌",s);break;}
        if(c.effect==="scrapSearch")this._discardScrap(s,1,false);
        const pool=c.effect==="supplyDeck"?s.deck.filter(x=>x.kind==="unit"):s.deck.slice();
        const opts=shuffle(pool.slice()).slice(0,3);
        if(!opts.length){this.note(`${c.name}：牌库里没有可选的牌`,s);break;}
        const auto=opts.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
        this._pick(s,c.name,"从牌库中选择 1 张加入手牌，其余留在牌库里",opts,auto,card=>{
          const i=s.deck.indexOf(card);if(i>=0)s.deck.splice(i,1);
          if(!this.addToHand(s,card))this.burn(s,card);
          this.note(`${c.name}：取出了【${card.name}】`,s,true);
        });
        break;}
      case"intelSteal":{
        if(this.lock!==null){this.note("停摆：无法抽牌",s);break;}
        const top=[];
        for(let i=o.deck.length-1;i>=0&&top.length<3;i--)top.push(o.deck[i]);
        if(!top.length){this.note("窃取情报：敌方牌库已空",s);break;}
        const auto=top.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
        this._pick(s,"窃取情报","彗星情报网：这是敌方牌库顶的牌。选择 1 张据为己有，它会从敌方牌库中消失",top,auto,card=>{
          const i=o.deck.indexOf(card);if(i>=0)o.deck.splice(i,1);
          const def=C.cardDef(card.hero||o.hero,card.id);
          const mine=def?this.clone(def,card.hero||o.hero):card;
          if(!this.addToHand(s,mine))this.burn(s,mine);
          this.note(`窃取情报：偷来了敌方的【${card.name}】`,s,true);
          this.note("窃取情报：敌方牌库的一张牌被偷走了",o,true);
        });
        break;}
      case"scrapSummon2":{const k=this.summon(s,"scrapUnit",2);this.note(`翻箱倒柜：翻出 ${k} 个废铜烂铁`,s);fx("summonScrap",{n:k,title:"翻箱倒柜"});break;}
      case"scrapStun":{
        this._discardScrap(s,1,false);
        const t=o.board.filter(u=>u.health>0).sort((a,b)=>b.attack-a.attack)[0];
        if(t){t.stun=Math.max(t.stun||0,1);t.atkLeft=0;this.note(`过期卡包：${t.name} 被眩晕`,s);}
        break;}
      case"scrapBlast":{
        const k=this._discardScrap(s,0,true);
        const cap=Math.min(k,4);
        this.note(`废物利用：弃掉 ${k} 张废料，造成 ${cap*2} 点伤害（至多 8 点）`,s);
        if(cap)this.damageHero(o,cap*2);
        break;}
      case"damage5draw":this.damageHero(o,5);this.draw(s,1);break;
      case"scrapSweep":{
        const k=this._discardScrap(s,0,true);
        const h=Math.min(12,k*3);
        this.heal(s,h);this.note(`大扫除：弃掉 ${k} 张废料，恢复 ${h} 点生命`,s);
        break;}
      case"neutral":
        [s,o].forEach(p=>p.board.forEach(u=>{u.stun=Math.max(u.stun||0,1);u.atkLeft=0;}));
        this.armor(s,4);this.note("中立宣言：所有单位眩晕 1 回合，你获得 4 点护甲",s);
        fx("evasion");break;
      case"crownCopy":{
        const k=this._discardScrap(s,0,true);
        const n=Math.min(3,Math.floor(k/2));
        const pool=PROFILES[s.hero].cards.filter(x=>x.rarity==="elite"&&x.id!=="crown"&&!x.awaSwap);
        let got=0;
        for(let i=0;i<n&&pool.length;i++){
          const d=pool[Math.floor(Math.random()*pool.length)];
          if(this.addToHand(s,this.clone(d,s.hero)))got++;
        }
        this.note(`复制皇冠：弃掉 ${k} 张废料，复制出 ${got} 张精英牌`,s);
        break;}
      case"choose3x2":{
        // 法术版（炮火准备）：cast 缺少该分支导致法术打出去空转，这里补上与 deploy 相同的处理
        const list=(targets&&targets.length)?targets:autoTargets(c,s,o);
        const hit=[];list.forEach(id=>{const t=o.board.find(u=>u.uid===id);if(t){this.damageUnit(o,t,2,s);hit.push(t.name);}});
        if(hit.length)this.note(`对 ${hit.join("、")} 各造成 2 点伤害`,s);
        break;}
      case"decreeRus":this.setRegime(s,"rus");this.summon(s,"red",1);fx("summonRed",{n:1});break;
      case"decreeUkr":{
        this.setRegime(s,"ukr");
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){this.damageUnit(o,t,2,s);this.note(`对 ${t.name} 造成 2 点伤害`,s);}
        break;}
      case"decreeBlr":this.setRegime(s,"blr");this.armor(s,2);break;
      case"consolidate":{
        const reds=s.board.filter(u=>u.id==="red"&&u.health>0);
        if(reds.length<2)break;
        const a=reds.reduce((x,u)=>x+u.attack,0),h=reds.reduce((x,u)=>x+u.health,0);
        s.board=s.board.filter(u=>!reds.includes(u));
        if(this.summon(s,"redGuard",1)){
          const g=s.board[s.board.length-1];
          g.attack=a;g.health=h;g.maxHealth=h;
          this.note(`整编：${reds.length} 个俄布合并为【近卫红军】${a}/${h}`,s);
          fx("consolidate");
        }
        break;}
      case"intel":{
        if(!o.hand.length){this.summon(s,"red",1);this.note("情报调阅：敌方没有手牌，一支俄布趁机出击",s);break;}
        const cards=o.hand.slice();
        const auto=cards.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
        this._pick(s,"情报调阅","彗星情报网：这是敌方的手牌。选择 1 张封存，对手在下个回合无法打出它",cards,auto,card=>{
          card.sealed=true;
          this.note(`情报调阅：封存了敌方的【${card.name}】`,s,true);
          this.note("情报调阅：敌方的一张手牌被封存",o,true);
        });
        break;}
      case"summonRed1":this.summon(s,"red",1);fx("summonRed",{n:1});break;
      case"summonRed2":this.summon(s,"red",2);fx("summonRed",{n:2});break;
      case"summonRed1Draw":if(this.summon(s,"red",1)){this.draw(s,1);fx("summonRed",{n:1});}break;
      case"buffReds1":s.board.forEach(u=>{if(u.id==="red"){u.attack+=1;u.health+=1;u.maxHealth+=1;}});this.note("红军集结：所有俄布 +1/+1",s);break;
      case"redDraw":{const n=redCount(s);if(n>0)this.draw(s,n);this.note(`战时共产主义：每控制 1 个俄布抽 1 张，共抽 ${n} 张`,s);break;}
      case"armor3draw":this.armor(s,3);this.draw(s,1);break;
      case"traceBoost":this.armor(s,6);this.draw(s,2);break;
      case"timeShield2":this.armor(s,5);this.heal(s,3);break;
      /* 白俄罗斯铁壁：嘲讽刺数 → 护甲 → 甲换清场 */
      case"blrFortify":{
        const n=s.board.filter(u=>u.health>0&&u.taunt).length*2;
        if(n>0)this.armor(s,n);
        this.note(`筑垒令：${n>0?`获得 ${n} 点护甲`:"没有嘲讽单位，未获得护甲"}`,s);
        break;}
      case"blrArmorWall":{
        const walls=s.board.filter(u=>u.health>0&&u.taunt);
        walls.forEach(u=>{u.attack+=1;u.health+=1;u.maxHealth+=1;});
        this.armor(s,2);
        this.note(`铁壁：${walls.length} 个嘲讽单位 +1/+1，获得 2 点护甲`,s);
        break;}
      case"blrSteelTide":s.steelTide=true;this.note("钢铁洪流：本局你的每个回合开始都会获得 1 张【红军坦克】",s);break;
      case"nebulaShield2":this.armor(s,10);this.draw(s,2);break;
      case"buffPirate3":{
        const list=(targets&&targets.length)?targets:autoTargets(c,s,o);
        let hit=0;
        list.forEach(id=>{const t=s.board.find(u=>u.uid===id);if(t){t.attack+=3;t.health+=3;t.maxHealth+=3;hit++;}});
        if(hit)this.note("海盗战嚎：目标单位 +3/+3",s);
        fx("buff",{n:hit});
        break;}
      case"pirateDiscover2":{
        s.pirateBuff=true;
        this.note("发现海盗：己方此后部署或加入的海盗 +1/+1",s);
        const pool=PROFILES["八幡"].cards.filter(x=>x.kind==="unit");
        let left=3;
        const step=()=>{
          if(left<=0)return;
          const cur=left;
          const top=[...pool].sort(()=>Math.random()-.5).slice(0,3);
          this._pick(s,c.name,`发现海盗（还可选 ${cur} 次）：从 3 张海盗中选择 1 张加入手牌`,top,0,card=>{
            if(!this.addToHand(s,this.clone(card,s.hero)))this.burn(s,card);
            left--;
            step();
          });
        };
        step();
        break;}
      case"stripTauntDraw":{
        // 恐吓：使 1 个敌方单位失去嘲讽；若有友方海盗则抽 1 张
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t&&t.taunt){t.taunt=false;this.note(`恐吓：${t.name} 失去了嘲讽`,s);}
        const hasPirate=s.board.some(u=>u.health>0&&(u.hero==="八幡"||u.id==="pirateScout"));
        if(hasPirate)this.draw(s,1);
        break;}
      case"stunOrKill":{
        // 闷棍：眩晕 1 个敌方单位；若已被眩晕则消灭
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){
          if(t.stun>0){t.health=0;this.note(`闷棍：${t.name} 已被眩晕，直接消灭`,s);}
          else{t.stun=Math.max(t.stun||0,1);t.atkLeft=0;this.note(`闷棍：${t.name} 被眩晕`,s);}
        }
        break;}
      case"luckyCoin":if(this.lock!==null)this.note("停摆：无法增加费用",s);else{s.energy+=1;this.note("海盗的幸运币：获得 1 点费用",s);}break;
      case"cometStrike":{
        // 彗星陨击：英雄血量（不含护甲）高于 42 时，对敌方英雄造成 35 点伤害
        if(s.hp>40){this.damageHero(o,35);this.note("彗星陨击：紫色彗星划过，对敌方英雄造成 35 点伤害！",s);}
        else this.note("彗星陨击：血量不足 40，未能召唤彗星",s);
        break;}
      case"draw2heal6":this.draw(s,2);this.heal(s,6);this.note("星光祝福：抽 2 张牌，恢复 6 点生命",s);break;
      case"armor3Draw1":this.armor(s,3);this.draw(s,1);this.note("彗星尾迹：获得 3 点护甲，抽 1 张牌",s);break;
      case"heal4Draw1":this.heal(s,4);this.draw(s,1);this.note("星辉回响：恢复 4 点生命，抽 1 张牌",s);break;
      case"heal5Armor2":this.heal(s,5);this.armor(s,2);this.note("星尘信标：恢复 5 点生命，获得 2 点护甲",s);break;
      case"stunOneDraw":{
        // 星辉锁链：眩晕 1 个敌方单位（优先最高攻击），抽 1 张牌（联动观察者回血）
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){t.stun=Math.max(t.stun||0,1);t.atkLeft=0;this.note(`星辉锁链：${t.name} 被眩晕，下个回合无法攻击`,s);}
        this.draw(s,1);
        break;}
      case"stunAllDraw":{
        // 彗星枷锁：眩晕所有敌方单位，抽 1 张牌
        const hit=o.board.filter(u=>u.health>0);
        hit.forEach(u=>{u.stun=Math.max(u.stun||0,1);u.atkLeft=0;});
        this.note(`彗星枷锁：${hit.length} 个敌方单位被眩晕，下个回合无法攻击`,s);
        this.draw(s,1);
        break;}
      case"cometTutor":{
        // 彗星预言：从牌库检索彗星陨击；没有则抽 2 张
        const want="cometStrike";
        const ti=s.deck.findIndex(x=>x.id===want);
        if(ti>=0){const card=s.deck.splice(ti,1)[0];if(this.addToHand(s,card))this.note(`彗星预言：检索到【${card.name}】！`,s);else this.burn(s,card);}
        else{this.draw(s,2);this.note("彗星预言：牌库中没有彗星陨击，改为抽 2 张牌",s);}
        break;}
      case"reshuffleDraw":{
        // 调节：手牌全部洗回牌库并洗牌，抽（洗入数+1）张——配合彗星观察者疯狂回血
        const hand=s.hand.slice();
        if(!hand.length){this.note("调节：手牌为空",s);break;}
        s.hand=[];
        s.deck=s.deck.concat(hand);
        shuffle(s.deck);
        this.draw(s,hand.length+1);
        this.note(`调节：将 ${hand.length} 张手牌洗回牌库，抽取 ${hand.length+1} 张牌`,s);
        break;}
      case"buffAll2":case"highcommand":this.buffAll(s,2,2);break;
      case"buffAll1":this.buffAll(s,1,1);break;
      case"buffAll1draw":this.buffAll(s,1,1);this.draw(s,1);break;
      case"buffAllCharge":s.board.forEach(u=>{u.attack+=1;u.health+=1;u.maxHealth+=1;if(u.atkLeft<1&&!u.stun)u.atkLeft=1;});break;
      case"buffOneDraw":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=s.board.find(u=>u.uid===id);
        if(t){t.attack+=2;t.health+=2;t.maxHealth+=2;this.note(`${t.name} +2/+2`,s);}
        this.draw(s,1);break;}
      case"ramp":if(this.gainMax(s,1))s.energy+=1;this.draw(s,1);break;
      case"whiteDeckDraw":this.destroyEnemyCards(s,o,"deck",2,c.name);this.draw(s,1);break;
      case"whiteDeck2":this.destroyEnemyCards(s,o,"deck",3,c.name);break;
      case"whiteForce1":this.destroyEnemyCards(s,o,"deck",2,c.name);this.forcedRead(s,o,1,c.name);break;
      case"whiteForce2":this.forcedRead(s,o,2,c.name);this.armor(s,3);break;
      case"whiteCorruptDeck":this.corruptEnemyCards(s,o,"牌库",2,c.name);break;
      case"whiteDrawJunk5":this.drawAndCorrupt(s,o,5,c.name);break;
      case"whiteJunkBlast":{
        const n=o.hand.filter(x=>x.effect==="whiteJunk").length+o.deck.filter(x=>x.effect==="whiteJunk").length;
        this.damageHero(o,n);this.note(`${c.name}：敌方手牌与牌库共有 ${n} 张【垃圾】，造成 ${n} 点伤害`,s);
        break;
      }
      case"whiteMend":this.heal(s,6);this.armor(s,2);this.note(`${c.name}：恢复 6 点生命，获得 2 点护甲`,s);break;
      case"whiteJunk":this.destroyEnemyCards(o,s,"deck",1,c.name);this.draw(s,1);break;
      case"whiteHand1":this.destroyEnemyCards(s,o,"handOrDeck",1,c.name);break;
      case"whiteConfiscate":{
        const hasHand=o.hand.length>0;
        this.destroyEnemyCards(s,o,hasHand?"hand":"deck",hasHand?1:2,c.name);
        this.draw(s,1);
        break;
      }
      case"whiteDeckArmor":this.destroyEnemyCards(s,o,"deck",1,c.name);this.armor(s,3);break;
      case"whiteDeck2Draw":this.destroyEnemyCards(s,o,"deck",2,c.name);this.draw(s,1);break;
      case"whiteBurst":{
        const n=Math.min(10,3+Math.floor(s.destroyedCards/2));
        this.damageHero(o,n);this.note(`${c.name}：本局已销毁 ${s.destroyedCards} 张敌方卡牌，造成 ${n} 点伤害`,s);
        break;
      }
      case"whiteAoe":{
        let killed=0;
        for(const u of o.board.filter(x=>x.health>0)){
          this.damageUnit(o,u,3,s);
          if(u.health<=0){this.recordDestroyed(s,u,"战场",c.name);killed++;}
        }
        this.note(`${c.name}：对所有敌方单位造成 3 点伤害，消灭 ${killed} 个`,s);
        break;
      }
      case"whiteNight":{
        const n=this.destroyEnemyCards(s,o,"hand",1,c.name)+this.destroyEnemyCards(s,o,"deck",4,c.name);
        if(n&&this.phase!=="over"){this.damageHero(o,n);this.note(`${c.name}：额外造成 ${n} 点伤害`,s);}
        break;
      }
      case"starClimb":if(this.gainMax(s,1))s.energy=Math.min(s.energy+1,s.maxEnergy);this.loseMax(o,1);break;
      case"damage5":this.damageHero(o,5);break;
      case"damage6":this.damageHero(o,6);break;
      case"damage7":this.damageHero(o,7);break;
      case"removeRestrict":{
        o.board.forEach(u=>{u.taunt=false;});o.heroImmune=false;
        this.note("消除限制：敌方单位失去嘲讽，英雄失去免疫",s);
        this.damageHero(o,3);fx("breakthrough");break;}
      case"decay1":this.addDecay(s,o,1);break;
          case"decay2":this.addDecay(s,o,2);break;
          case"decay3":this.addDecay(s,o,3);break;
          case"decay3draw":this.addDecay(s,o,3);this.draw(s,1);break;
      case"decay2draw":this.addDecay(s,o,2);this.draw(s,1);break;
      case"decayDouble":{const n=Math.max(o.decay||0,1);this.addDecay(s,o,n);break;}
      case"energyDown2":this.loseMax(o,2);this.note("敌方的费用上限 -2",s);break;
      case"lockCap2":this.lockCards(s,o,2,false);break;
      case"lockCap1":this.lockCards(s,o,1,false);this.loseMax(o,1);break;
      case"lockSpell":this.lockCards(s,o,null,true);break;
      case"revengeDeath":s.board.forEach(u=>{u.deathDmg=(u.deathDmg||0)+1;});this.draw(s,1);this.note("复仇主义：你的所有单位获得亡语",s);break;
      case"artilleryCommand":{
        this.aoe(s,o,3);
        const k=this.summon(s,"redArtillery",MAX_BOARD);
        this.note(`全亚洲炮兵总司令：召唤 ${k} 个红军炮兵，敌方全场受 3 点伤害`,s);
        fx("artillery");break;}
      case"developEnemy":{
        const top=[];
        for(let i=o.deck.length-1;i>=0&&top.length<3;i--){
          const x=o.deck[i];
          const def=C.cardDef(x.hero||o.hero,x.id);
          if(def)top.push(this.clone(def,x.hero||o.hero));
        }
        if(!top.length){this.draw(s,1);this.note("开发他人卡组：敌方牌库为空，改为抽 1 张牌",s);break;}
        const auto=top.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
        this._pick(s,"开发他人卡组","选择 1 张敌方牌库顶的牌，复制到你的手牌",top,auto,card=>{
          if(!this.addToHand(s,card))this.burn(s,card);
          this.note(`开发他人卡组：复制了【${card.name}】`,s,true);
        });
        break;}
      case"adapt":this.destroyHighest(s,o,"适应性方案");this.heal(s,3);break;
      case"draw1":this.draw(s,1);break;
      case"draw2":this.draw(s,2);break;
      case"draw3":this.draw(s,3);break;
      case"draw1heal2":this.draw(s,1);this.heal(s,2);break;
      case"draw2heal2":this.draw(s,2);this.heal(s,2);break;
      case"draw2armor1":this.draw(s,2);this.armor(s,1);break;
      case"heal5draw":this.heal(s,5);this.draw(s,1);break;
      case"heal3draw":case"healDraw":this.heal(s,c.effect==="healDraw"?2:3);this.draw(s,1);break;
      case"heal3":this.heal(s,3);this.note("篝火：恢复 3 点生命",s);break;
      case"armor3":this.armor(s,3);this.note("海岸防线：获得 3 点护甲",s);break;
      case"hero5":this.damageHero(o,5);this.note("洗劫村庄：对敌方英雄造成 5 点伤害",s);break;
      case"cpNet":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){this.damageUnit(o,t,1,s);this.note(`渔网陷阱：对 ${t.name} 造成 1 点伤害`,s);}
        break;}
      case"cpUprising":if(this.summon(s,"cp_uprising",2))this.note("渔村号角：召唤 2 个起义村民",s);break;
      case"manaBurn":this.damageHero(o,2);this.loseMax(o,1);break;
      case"energyDownDraw":this.loseMax(o,1);this.draw(s,1);break;
      case"enemyAtkDown":o.board.forEach(u=>{u.attack=Math.max(0,u.attack-2);});break;
      case"enemyAtkDown1":o.board.forEach(u=>{u.attack=Math.max(0,u.attack-1);});break;
      case"stasisField":o.board.forEach(u=>{u.attack=Math.max(0,u.attack-1);});this.loseMax(o,1);this.note("静滞领域：敌方全体攻击力 -1，费用上限 -1",s);break;
      case"aoe2":this.aoe(s,o,2);this.damageHero(o,2);break;
      case"aoe4":this.aoe(s,o,4);fx("volley");break;
      case"pirateBuff":s.board.forEach(u=>u.attack+=1);this.draw(s,1);break;
      case"raid":this.draw(s,Math.min(3,Math.max(1,s.board.length)));break;
      case"develop":this.draw(s,2);this.armor(s,2);break;
      case"handoff":this.draw(s,1);this.armor(s,1);break;
      case"crown":this.draw(s,3);this.armor(s,3);break;
      case"saturation":{
        const n=gunCount(s);
        this.note(`饱和炮击：火炮 ×${n}，对英雄造成 ${n*2}、对敌方单位各造成 ${n} 点伤害`,s);
        fx("saturation");
        if(n>0){this.aoe(s,o,n);this.damageHero(o,n*2);}
        break;}
      case"reload":s.board.forEach(u=>{if(u.gun){u.attack+=2;u.tempAtk=(u.tempAtk||0)+2;}});this.draw(s,1);break;
      case"buffGuns2draw":s.board.forEach(u=>{if(u.gun)u.attack+=2;});this.draw(s,1);break;
      case"supply":this.draw(s,2);this.armor(s,2);break;
      case"fillRed":{
        const def=PROFILES["苏苏"].cards.find(x=>x.id==="red");
        let h=0;while(s.hand.length<MAX_HAND){this.addToHand(s,this.clone(def,"苏苏"));h++;}
        const b=this.summon(s,"red",MAX_BOARD);
        this.note(`人民军：手牌追加 ${h} 张俄布，战场补充 ${b} 个俄布`,s);
        fx("peopleArmy");break;}
      case"redDawn":{const n=2+s.board.filter(u=>u.id==="red").length;this.aoe(s,o,n);this.note(`赤色黎明：敌方全场受 ${n} 点伤害`,s);fx("redDawn");break;}
      case"sacAoe3":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=s.board.find(u=>u.uid===id);if(!t)break;
        t.health=0;
        this.aoe(s,o,3);this.note(`献祭 ${t.name}，敌方全场受 3 点伤害`,s);fx("fireBomb");
        break;}
      case"fireShip":{const n=s.board.length;if(n>0){s.board.forEach(u=>{u.health=0;});this.aoe(s,o,n*2);this.note(`火船：摧毁 ${n} 个单位，敌方全场受 ${n*2} 点伤害`,s);fx("fireShip",{n});}break;}
      case"unitDamageHero":{const n=s.board.length;if(n>0)this.damageHero(o,n);break;}
      case"finish":{const n=s.board.length;if(n>0){fx("finish",{dmg:n*2});this.damageHero(o,n*2);}break;}
      case"filterSuperman":{
        if(this.lock!==null){this.note("停摆：无法抽牌",s);break;}
        if(!s.deck.length){this.draw(s,1);break;}
        const d=s.deck.pop();
        if(d.id==="superman"){d.cost=Math.max(0,d.cost-2);this.note("禁忌检索：抽到超人，费用 -2！",s);}
        if(!this.addToHand(s,d))this.burn(s,d);
        break;}
      case"filterSuperman2":{
        if(this.lock!==null){this.note("停摆：无法抽牌",s);break;}
        for(let k=0;k<2;k++){
          if(!s.deck.length){this.draw(s,1);break;}
          const d=s.deck.pop();
          if(d.id==="superman"){d.cost=Math.max(0,d.cost-2);this.note("禁忌检索：抽到超人，费用 -2！",s);}
          if(!this.addToHand(s,d))this.burn(s,d);
        }
        break;}
      case"tutorSuperman":{
        const want="superman";
        const i=s.deck.findIndex(x=>x.id===want);
        if(i>=0){const card=s.deck.splice(i,1)[0];if(this.addToHand(s,card))this.note(`检索到【${card.name}】！`,s);else this.burn(s,card);}
        else{this.draw(s,2);this.note("牌库中没有目标，改为抽两张牌",s);}
        break;}
      case"summonSuperman":
        if(this._summonFromDeck(s,o,x=>x.id==="superman","皇冠仪式"))fx("ritual");
        else this.note("皇冠仪式：牌库中没有超人或战场已满",s);
        break;
      case"steal3":this.steal(s,3);break;
      case"steal4":this.steal(s,4);break;
      case"steal4draw":this.steal(s,4);this.draw(s,1);break;
      case"steal5draw":this.steal(s,10);this.damageHero(o,3);this.draw(s,1);break;   // 人民收米术：偷取 100 元
      case"bribeDraw":this.draw(s,2);this.damageHero(s,1,{self:true});this.steal(s,2);break;
      case"healDrawSteal":this.heal(s,3);this.draw(s,1);this.steal(s,3);break;
      case"hero2drawSteal":this.damageHero(o,2);this.draw(s,1);this.steal(s,4);break;
      case"supplySteal":this.draw(s,2);this.armor(s,2);this.steal(s,2);break;
      case"vaultBurst":this.draw(s,3);this.armor(s,3);this.steal(s,5);break;
      case"runaway":
        if(s.money>=ESCAPE_TARGET){fx("escape");this.specialWin(s,`偷够 ${s.money} 元，成功逃跑！`);}
        else{this.armor(s,3);this.damageHero(o,2);this.note(`逃跑：金钱不足（${s.money}/${ESCAPE_TARGET}）`,s);}
        break;
      case"rebel":{
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);if(t)this.takeover(o,s,t,"策动叛乱");   // 永久策反
        break;}
      case"takeover":if(o.board.length)this.takeover(o,s,o.board.slice().sort((a,b)=>b.attack-a.attack)[0],"战术接管",true);break;
      /* ---- DIY 白名单：神罚体系 ---- */
      case"diyPunishCast":this.damageHero(s,1,{self:true});this.note("【神罚】降临：你的英雄受到 1 点伤害",s);this.draw(s,1);break;
      case"diyBarrier":{let n=0;for(const cx of o.deck)if(cx.id==="diyPunish")n++;this.armor(s,n);this.note(`神谕壁垒：获得 ${n} 点护甲`,s);break;}
      case"diyEcho":{for(let k=0;k<4;k++)o.deck.push(this.clone(TOKENS.diyPunish,o.hero));for(let k=0;k<2;k++)s.deck.push(this.clone(TOKENS.diyPunish,s.hero));this.note("神罚共鸣：4 张【神罚】洗入敌方牌库，2 张洗入你的牌库",s);break;}
      case"diyPull":{const id=(targets&&targets[0])||autoTargets(c,s,o)[0];const tg=o.board.find(u=>u.uid===id);if(tg&&this.takeover(o,s,tg,"圣光牵引",true)){tg.attack+=1;tg.health+=4;tg.maxHealth+=4;this.note(`圣光牵引：${tg.name} 获得 +1/+4`,s);}break;}
      case"rebelLowest":if(o.board.length)this.takeover(o,s,o.board.slice().sort((a,b)=>a.attack-b.attack)[0],"煽动哗变",true);break;
      case"rebelWeakest":if(o.board.length)this.takeover(o,s,o.board.slice().sort((a,b)=>a.health-b.health)[0],"内应接应",true);this.draw(s,1);break;
      case"disruption":o.board.forEach(u=>{u.stun=Math.max(u.stun,1);u.atkLeft=0;});this.damageHero(o,2);fx("gravityLock");break;
      case"gravityLock":o.board.forEach(u=>{u.stun=Math.max(u.stun,1);u.atkLeft=0;});fx("gravityLock");break;
      case"evasion":s.heroImmune=true;fx("evasion");break;
      case"costRaise":if(o.hand.length){o.hand.forEach(x=>{x.cost+=1;});this.note(`引力折叠：敌方 ${o.hand.length} 张手牌费用 +1`,s);fx("costRaise");}break;
      case"summoncall":{
        const card=this._summonFromDeck(s,o,x=>x.member,"架子班召集令");
        if(card)this.deploy(s,card,o,null,null);else this.draw(s,2);
        break;}
      case"namecardsummon":{
        const cands=s.deck.filter(x=>x.member);
        if(!cands.length||s.board.length>=MAX_BOARD){this.note("名片召唤：牌库中没有成员或战场已满",s);break;}
        const auto=cands.reduce((bi,x,i,a)=>unitValue(x)>unitValue(a[bi])?i:bi,0);
        this._pick(s,"名片召唤","选择一位架子班成员直接召唤到战场",cands.slice(),auto,card=>{
          const i=s.deck.indexOf(card);if(i<0||s.board.length>=MAX_BOARD)return;
          s.deck.splice(i,1);s.board.push(card);this._enter(s,card);
          this.note(`名片召唤：召唤了 ${card.name}`,s);
          this.deploy(s,card,o,null,null);
        });
        break;}
      case"scry":case"foresee":{
        const n=c.effect==="scry"?3:2,top=[];
        for(let i=0;i<n&&s.deck.length;i++)top.push(s.deck.pop());
        if(!top.length){this.draw(s,1);break;}
        if(this.lock!==null){top.reverse().forEach(x=>s.deck.push(x));this.note("停摆：无法抽牌",s);break;}
        const want=c.effect==="scry"?"superman":null;
        let auto=want?top.findIndex(x=>x.id===want):-1;
        if(auto<0)auto=top.reduce((bi,x,i,a)=>x.cost>a[bi].cost?i:bi,0);
        this._pick(s,c.name,"选择一张加入手牌，其余放回牌库底",top,auto,card=>{
          if(!this.addToHand(s,card))this.burn(s,card);
          // 注释里写的是「放回牌库底」，但原代码用了 unshift（插到牌库顶）——
          // 改成 push，真正放回牌库底部。
          top.filter(x=>x!==card).forEach(x=>s.deck.push(x));
          this.note(`${c.name}：选择了【${card.name}】`,s,true);
        });
        break;}
      case"awaDiscover":{
        fx("awaDiscover");
        const pool=[];
        for(const h in PROFILES)PROFILES[h].cards.forEach(x=>{if(x.kind==="unit"&&!x.awaSwap)pool.push(x);});
        const opts=shuffle(pool).slice(0,3).map(x=>this.clone(x,x.hero));
        const auto=opts.reduce((bi,x,i,a)=>(unitValue(x)+(x.charge?2:0))>(unitValue(a[bi])+(a[bi].charge?2:0))?i:bi,0);
        this._pick(s,"选角","从 3 个单位中选择 1 个加入手牌（其余消失）",opts,auto,card=>{
          if(this.addToHand(s,card))this.note(`选角：选中了【${card.name}】`,s);
          else this.burn(s,card);
        });
        break;}
      case"awaJazz":{
        if(this.summon(s,"awaBand",1))this.note("即兴演出：爵士乐队入场",s);
        else this.note("即兴演出：战场已满",s);
        if(o.hero==="猪瘟鱼"){
          if(this.lock!==null)this.note("停摆：无法偷取金钱",s);
          else if(o.money>0){const m=o.money;o.money=0;s.money+=m;this.note(`即兴演出：偷走了对手全部 ${m} 元`,s);}
        }
        fx("awaJazz");break;}
      case"awaFreeze":this.lock=s.idx;this.note("停摆：双方无法抽牌、增加费用或金钱，直到施放者的下个回合",s);fx("awaFreeze");break;
    }
  }

  /* ---------- 视图（隐藏对手手牌与牌库） ---------- */
  viewFor(pi){
    const me=this.players[pi],foe=this.players[1-pi];
    const pd=this.pending;
    return{
      you:pi,phase:this.phase,myTurn:this.current===pi,turn:this.turn,first:this.first===pi,
      lock:this.lock===null?null:(this.lock===pi?"me":"foe"),
      winner:this.winner===null?null:(this.winner==="draw"?"draw":(this.winner===pi?"me":"foe")),
      reason:this.reason,
      intro:(this.intro||[]).map(x=>({who:x.pi===pi?"me":"foe",from:x.from,to:x.to})),
      me:pubPlayer(me,true,foe),foe:pubPlayer(foe,false,me),
      pending:pd&&pd.pi===pi?{title:pd.title,hint:pd.hint,cards:pd.cards.map(pubCard)}:null,
      foePending:!!(pd&&pd.pi!==pi),
      mulligan:this.phase==="mulligan"?{done:me.mulliganDone,foeDone:foe.mulliganDone}:null,
      log:this.logs.filter(l=>l.to<0||l.to===pi).slice(-60).map(l=>({text:l.text,who:l.who<0?"sys":(l.who===pi?"me":"foe")}))
    };
  }
  eventsFor(events,pi){
    return events.filter(e=>e.to===undefined||e.to===pi);
  }
}

function pubCard(c){
  const x={uid:c.uid,id:c.id,hero:c.hero,name:c.name,cost:c.cost,baseCost:c.baseCost,kind:c.kind,art:c.art,icon:c.icon,text:c.text,flavor:c.flavor||"",effect:c.effect,
    charge:c.charge,taunt:c.taunt,ignoreTaunt:c.ignoreTaunt,core:c.core,owner:c.owner,untargetable:c.untargetable,gun:c.gun,member:c.member,rarity:c.rarity,fx:c.fx,rep:c.rep||"",transfer:c.transfer||"",sealed:!!c.sealed,scrap:!!c.scrap,recycle:c.recycle||""};
  if(c.kind==="unit"){x.attack=c.attack;x.health=c.health;x.maxHealth=c.maxHealth;x.strikes=c.strikes;x.atkLeft=c.atkLeft;x.stun=c.stun;x.fresh=c.fresh;x.tempAtk=c.tempAtk||0;x.deathDmg=c.deathDmg||0;x.lifespan=c.lifespan||0;}
  else if(c.lifespan)x.lifespan=c.lifespan;
  return x;
}
function pubPlayer(p,full,opponent){
  return{name:p.name,hero:p.hero,hp:p.hp,maxHp:p.maxHp,armor:p.armor,energy:p.energy,maxEnergy:p.maxEnergy,money:p.money,
    heroImmune:p.heroImmune,turnsStarted:p.turnsStarted,fatigue:p.fatigue,deckCount:p.deck.length,handCount:p.hand.length,destroyedCards:p.destroyedCards||0,destroyedLog:p.destroyedLog||[],
    regime:p.regime||null,regimeChanges:p.regimeChanges||0,fedTurn:!!p.fedTurn,
    decay:p.decay||0,turnCap:p.turnCap==null?null:p.turnCap,playedTurn:p.playedTurn||0,noSpell:!!p.noSpell,
    nextCap:p.nextCap==null?null:p.nextCap,nextNoSpell:!!p.nextNoSpell,
    hand:full?p.hand.map(c=>{const x=pubCard(c);if(c.scrap){const t=scrapTax(p);if(t){x.cost+=t;x.taxed=true;}}if(c.effect==="whiteJunk"){const t=junkTax(opponent);if(t){x.cost+=t;x.junkTaxed=true;}}return x;}):p.hand.map(c=>({uid:c.uid,back:true,costUp:c.cost>c.baseCost||(c.effect==="whiteJunk"&&junkTax(opponent)>0)})),
    board:p.board.map(pubCard),stats:p.stats};
}
function err(msg){return{ok:false,error:msg};}

return{Game,effCost,scrapTax,shuffle,bandCount,boost,bestRegime,redCount,hasBonus,hasCost,heroBonus,gunCount,unitValue,canAttack,attackTargets,targetSpec,optionSpec,playError,autoTargets,autoOption,pubCard};
});
