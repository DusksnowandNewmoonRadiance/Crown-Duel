/* 皇冠对决 · 规则引擎（浏览器单机与服务器联机共用）
   - 完全同步、无 DOM 依赖；所有随机由 Math.random 产生
   - 所有需要玩家选择的效果都在出牌时就带上目标（targets / option），
     只有依赖隐藏信息的效果（查看牌库顶、发现）才会进入 pending 等待选择 */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory(require("./cards.js"));
  else root.DuelEngine=factory(root.DuelCards);
})(typeof self!=="undefined"?self:this,function(C){
"use strict";
const {MAX_BOARD,MAX_HAND,ESCAPE_TARGET,STEAL_UNIT,DECK_SIZE,MAX_ENERGY,PROFILES,TOKENS,AWA_CARDS}=C;

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
function bestRegime(me,foe){
  const enAtk=foe.board.reduce((a,u)=>a+(u.health>0?u.attack:0),0);
  if(me.hp<=12||enAtk>=8)return"blr";
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
    case"stunOne":return eligible(foe.board,1,1,"选择 1 个敌方单位眩晕","foe");
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
/* 实际费用：废品回收站让手牌中的废料费用 +1（视图里的牌已经加过，带 taxed 标记） */
function effCost(card,me){return card.cost+((card.scrap&&!card.taxed)?scrapTax(me):0);}
/* 能否出这张牌：返回 null 或原因 */
function playError(card,me,foe){
  const cost=effCost(card,me);
  if(cost>me.energy)return`费用不足（需要 ${cost}，当前 ${me.energy}）`;
  if(me.turnCap!=null&&(me.playedTurn||0)>=me.turnCap)return`出牌封锁：本回合最多只能打出 ${me.turnCap} 张牌`;
  if(card.kind==="spell"&&me.noSpell)return"寂静星环：本回合无法打出法术牌";
  if(card.kind==="unit"&&me.board.length>=MAX_BOARD)return`战场已满（最多 ${MAX_BOARD} 个单位）`;
  const e=card.effect;
  if(e==="rebel"&&!foe.board.length)return"敌方没有单位可以策反";
  if(e==="stripTauntDraw"&&!foe.board.some(u=>u.taunt&&u.health>0))return"敌方没有嘲讽单位";
  if(e==="stunOrKill"&&!foe.board.length)return"敌方没有单位可以眩晕";
  if(e==="stunOne"&&!foe.board.length)return"敌方没有单位可以眩晕";
  if(e==="cometStrike"&&me.hp<=40)return`彗星陨击需要你的英雄血量高于 40（不含护甲，当前 ${me.hp}）`;
  if(e==="reshuffleDraw"&&!me.hand.length)return"调节：你手牌为空";
  if(/^(rebel|takeover)/.test(e)&&foe.board.length&&me.board.length>=MAX_BOARD)return"你的战场已满，无法接收策反的单位";
  if(e==="sacAoe3"&&!me.board.length)return"你没有可以献祭的单位";
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
  /* opts.players = [{name, hero, deck:[id×40]}, …]，opts.first 可选 */
  constructor(opts){
    this.uid=0;this.events=[];this.logs=[];
    this.players=opts.players.map((p,i)=>this._makePlayer(i,p));
    this.first=(opts.first===0||opts.first===1)?opts.first:(Math.random()<.5?0:1);
    this.current=this.first;this.turn=0;this.phase="mulligan";
    this.lock=null;this.winner=null;this.reason="";this.pending=null;
    const f=this.players[this.first],s=this.players[1-this.first];
    this._drawRaw(f,4);this._drawRaw(s,5);
    this.note(`对局开始：${f.name}（${f.hero}）先手，${s.name}（${s.hero}）后手`);
    (this.intro||[]).forEach(x=>this.note(`${this.players[x.pi].name} 的【${x.from}】变成了 awa 的【${x.to}】，已洗入牌库`));
  }
  _makePlayer(i,p){
    const prof=PROFILES[p.hero];
    const deckIds=(p.deck&&!C.deckError(p.hero,p.deck))?p.deck:C.defaultDeck(p.hero);
    const deck=shuffle(deckIds.map(id=>this.clone(prof.cards.find(c=>c.id===id),p.hero)));
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
    return{idx:i,name:p.name||("玩家"+(i+1)),hero:p.hero,hp:prof.hp,maxHp:prof.hp,armor:0,energy:0,maxEnergy:0,
      fatigue:0,deck,hand:[],board:[],money:0,heroImmune:false,turnsStarted:0,mulliganDone:false,
      regime:null,regimeChanges:0,fedTurn:false,
      decay:0,turnCap:null,nextCap:null,noSpell:false,nextNoSpell:false,playedTurn:0,
      stats:{dmg:0,played:0,kills:0}};
  }
  clone(c,hero){
    const x={uid:++this.uid,id:c.id,hero:c.hero||hero||"",name:c.name,cost:c.cost,baseCost:c.cost,kind:c.kind,art:c.art,text:c.text,flavor:c.flavor||"",
      effect:c.effect||"",charge:!!c.charge,taunt:!!c.taunt,ignoreTaunt:!!c.ignoreTaunt,core:!!c.core,owner:c.owner||"",
      untargetable:!!c.untargetable,gun:!!c.gun,member:!!c.member,rarity:c.rarity||"",fx:c.fx||"",rep:c.rep||"",transfer:c.transfer||"",sealed:false,awaSwap:!!c.awaSwap,
      scrap:!!c.scrap,recycle:c.recycle||"",recycleN:c.recycleN||1};
    if(c.kind==="unit"){x.attack=c.atk;x.health=c.hp;x.maxHealth=c.hp;x.strikes=c.strikes||1;x.atkLeft=0;x.stun=0;x.fresh=false;x.deathDmg=0;x.lifespan=c.lifespan||0;}
    return x;
  }
  opp(p){return this.players[1-p.idx];}

  /* ---------- 事件与日志 ---------- */
  emit(ev){this.events.push(ev);}
  takeEvents(){const e=this.events;this.events=[];return e;}
  note(text,p,priv){this.logs.push({text,who:p?p.idx:-1,to:priv&&p?p.idx:-1});if(this.logs.length>120)this.logs.shift();}

  /* ---------- 抽牌 / 手牌 ---------- */
  _drawRaw(p,n){for(let i=0;i<n&&p.deck.length;i++)p.hand.push(p.deck.pop());}
  draw(p,n=1){
    if(this.lock!==null){if(n>0)this.note("停摆：无法抽牌",p);return;}
    for(let i=0;i<n;i++){
      if(!p.deck.length){p.fatigue++;this.note(`牌库已空，疲劳伤害 ${p.fatigue}`,p);this.damageHero(p,p.fatigue,{fatigue:true});continue;}
      const card=p.deck.pop();
      if(p.hand.length>=MAX_HAND){this.burn(p,card);continue;}
      p.hand.push(card);this._drawHeal(p);
    }
  }
  addToHand(p,card){
    if(p.hand.length>=MAX_HAND)return false;
    // 发现海盗（新）：己方加入手牌的海盗 +1/+1
    if(p.pirateBuff&&card.kind==="unit"&&(card.hero==="八幡"||card.id==="pirateScout")){
      card.attack=(card.attack||0)+1;card.health=(card.health||0)+1;card.maxHealth=(card.maxHealth||0)+1;
    }
    p.hand.push(card);this._drawHeal(p);return true;
  }
  burn(p,card){this.emit({t:"burn",pi:p.idx,card:pubCard(card)});this.note(`手牌已满，【${card.name}】被弃置`,p);}
  _drawHeal(p){
    const n=p.board.filter(u=>u.effect==="drawHeal"&&u.health>0).length;
    if(!n)return;this.heal(p,2*n);this.note(`彗星观察者×${n}：恢复 ${2*n} 点生命`,p);
  }

  /* ---------- 伤害 / 治疗 ---------- */
  damageHero(p,n,o={}){
    if(this.phase==="over")return;
    if(!o.fatigue&&!o.self&&n>0){const src=this.opp(p);n+=bandCount(src);if(!o.combat&&hasBonus(src,"ukr"))n+=1;}
    if(n<=0)return;
    const blocked=Math.min(p.armor,n);p.armor-=blocked;p.hp-=n-blocked;
    if(!o.fatigue&&!o.self)this.opp(p).stats.dmg+=n;
    this._checkEnd();
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
    if(hasCost(p,"blr")&&u.charge){u.charge=false;u.atkLeft=0;}
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
  loseMax(p,n){p.maxEnergy=Math.max(0,p.maxEnergy-n);p.energy=Math.min(p.energy,p.maxEnergy);}
  cleanup(){
    const triggers=[],souls=[];
    for(const p of this.players){
      const dead=p.board.filter(u=>u.health<=0);
      if(!dead.length)continue;
      p.board=p.board.filter(u=>u.health>0);
      this.opp(p).stats.kills+=dead.length;
      dead.forEach(u=>{if(u.deathDmg>0)triggers.push([p,u]);if(u.transfer||u.recycle)souls.push([p,u]);});
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
  }
  _ready(u){u.atkLeft=u.charge?u.strikes:0;u.fresh=true;}
  summon(p,id,n=1){
    let def=TOKENS[id]||PROFILES[p.hero].cards.find(x=>x.id===id);
    if(!def)for(const h in PROFILES){def=PROFILES[h].cards.find(x=>x.id===id);if(def)break;}
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
    this.emit({t:"over",winner,reason});
  }
  specialWin(p,reason){this._finish(p.idx,reason);}
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
    }
    if(this.phase==="over")return;
    if(this.lock!==null)this.note("停摆：费用上限无法增加",p);
    p.maxEnergy=Math.min(MAX_ENERGY,p.maxEnergy+(this.lock!==null?0:1));
    p.energy=p.maxEnergy;
    for(const u of p.board){
      u.fresh=false;
      if(u.stun>0){u.atkLeft=0;u.stun--;this.note(`${u.name} 被眩晕，本回合无法攻击`,p);}
      else u.atkLeft=u.strikes;
    }
    this.emit({t:"turn",pi});
    if(!(pi===this.first&&p.turnsStarted===1))this.draw(p,1);
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
    if(hasBonus(p,"blr")){this.armor(p,2);this.note("白俄罗斯政体：回合结束，获得 2 点护甲",p);}
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
    s.energy-=effCost(c,s);s.hand=s.hand.filter(x=>x!==c);s.stats.played++;s.playedTurn=(s.playedTurn||0)+1;
    this.emit({t:"play",pi,card:pubCard(c),targets:picked,option:os?option:null});
    if(c.kind==="unit"){
      s.board.push(c);this._enter(s,c);
      this.note(`部署 ${c.name}`,s);
      if(c.id==="superman")this.emit({t:"fx",name:"superman",pi});
      this.deploy(s,c,o,picked,option);
    }else{
      this.note(`施放【${c.name}】`,s);
      this.cast(s,c,o,picked,option);
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
    // 发现海盗：己方海盗此后部署时各抽 1 张牌
    if(s.pirateDeployDraw&&c.kind==="unit"&&(c.hero==="八幡"||c.id==="pirateScout"))this.draw(s,1);
    // 发现海盗（新）：己方此后部署或加入的海盗 +1/+1
    if(s.pirateBuff&&c.kind==="unit"&&(c.hero==="八幡"||c.id==="pirateScout")){c.attack+=1;c.health+=1;c.maxHealth+=1;}
    const T=()=>targets&&targets.length?targets:autoTargets(c,s,o);
    switch(c.effect){
      case"heal2":this.heal(s,2);break;
      case"heal3":this.heal(s,3);break;
      case"draw":this.draw(s,1);break;
      case"drawHeal1":this.draw(s,1);this.heal(s,1);break;
      case"drawArmor":this.draw(s,1);this.armor(s,1);break;
      case"armor1":this.armor(s,1);break;
      case"armor2":this.armor(s,2);break;
      case"hero1":this.damageHero(o,1);break;
      case"hero2":this.damageHero(o,2);break;
      case"hero3":this.damageHero(o,3);break;
      case"hero99":this.damageHero(o,99);this.note("awa：对敌方英雄造成 99 点伤害",s);break;
      case"draw2":this.draw(s,2);break;
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
        this.note(`废物利用：弃掉 ${k} 张废料，造成 ${k*2} 点伤害`,s);
        if(k)this.damageHero(o,k*2);
        break;}
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
        // 彗星陨击：英雄血量（不含护甲）高于 40 时，对敌方英雄造成 40 点伤害
        if(s.hp>40){this.damageHero(o,40);this.note("彗星陨击：紫色彗星划过，对敌方英雄造成 40 点伤害！",s);}
        else this.note("彗星陨击：血量不足 40，未能召唤彗星",s);
        break;}
      case"draw2heal6":this.draw(s,2);this.heal(s,6);this.note("星光祝福：抽 2 张牌，恢复 6 点生命",s);break;
      case"armor3Draw1":this.armor(s,3);this.draw(s,1);this.note("彗星尾迹：获得 3 点护甲，抽 1 张牌",s);break;
      case"heal4Draw1":this.heal(s,4);this.draw(s,1);this.note("星辉回响：恢复 4 点生命，抽 1 张牌",s);break;
      case"heal5Armor2":this.heal(s,5);this.armor(s,2);this.note("星尘信标：恢复 5 点生命，获得 2 点护甲",s);break;
      case"stunOne":{
        // 星辉锁链：眩晕 1 个敌方单位（优先最高攻击）
        const id=(targets&&targets[0])||autoTargets(c,s,o)[0];
        const t=o.board.find(u=>u.uid===id);
        if(t){t.stun=Math.max(t.stun||0,1);t.atkLeft=0;this.note(`星辉锁链：${t.name} 被眩晕，下个回合无法攻击`,s);}
        break;}
      case"stunAll":{
        // 彗星枷锁：眩晕所有敌方单位
        const hit=o.board.filter(u=>u.health>0);
        hit.forEach(u=>{u.stun=Math.max(u.stun||0,1);u.atkLeft=0;});
        this.note(`彗星枷锁：${hit.length} 个敌方单位被眩晕，下个回合无法攻击`,s);
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
      case"starClimb":if(this.gainMax(s,1))s.energy=Math.min(s.energy+1,s.maxEnergy);this.loseMax(o,1);break;
      case"damage5":this.damageHero(o,5);break;
      case"damage6":this.damageHero(o,6);break;
      case"damage7":this.damageHero(o,7);break;
      case"removeRestrict":{
        o.board.forEach(u=>{u.taunt=false;});o.heroImmune=false;
        this.note("消除限制：敌方单位失去嘲讽，英雄失去免疫",s);
        this.damageHero(o,3);fx("breakthrough");break;}
      case"decay1":this.addDecay(s,o,1);break;
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
      case"manaBurn":this.damageHero(o,2);this.loseMax(o,1);break;
      case"energyDownDraw":this.loseMax(o,1);this.draw(s,1);break;
      case"enemyAtkDown":o.board.forEach(u=>{u.attack=Math.max(0,u.attack-2);});break;
      case"enemyAtkDown1":o.board.forEach(u=>{u.attack=Math.max(0,u.attack-1);});break;
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
      me:pubPlayer(me,true),foe:pubPlayer(foe,false),
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
  const x={uid:c.uid,id:c.id,hero:c.hero,name:c.name,cost:c.cost,baseCost:c.baseCost,kind:c.kind,art:c.art,text:c.text,flavor:c.flavor||"",effect:c.effect,
    charge:c.charge,taunt:c.taunt,ignoreTaunt:c.ignoreTaunt,core:c.core,owner:c.owner,untargetable:c.untargetable,gun:c.gun,member:c.member,rarity:c.rarity,fx:c.fx,rep:c.rep||"",transfer:c.transfer||"",sealed:!!c.sealed,scrap:!!c.scrap,recycle:c.recycle||""};
  if(c.kind==="unit"){x.attack=c.attack;x.health=c.health;x.maxHealth=c.maxHealth;x.strikes=c.strikes;x.atkLeft=c.atkLeft;x.stun=c.stun;x.fresh=c.fresh;x.tempAtk=c.tempAtk||0;x.deathDmg=c.deathDmg||0;x.lifespan=c.lifespan||0;}
  else if(c.lifespan)x.lifespan=c.lifespan;
  return x;
}
function pubPlayer(p,full){
  return{name:p.name,hero:p.hero,hp:p.hp,maxHp:p.maxHp,armor:p.armor,energy:p.energy,maxEnergy:p.maxEnergy,money:p.money,
    heroImmune:p.heroImmune,turnsStarted:p.turnsStarted,fatigue:p.fatigue,deckCount:p.deck.length,handCount:p.hand.length,
    regime:p.regime||null,regimeChanges:p.regimeChanges||0,fedTurn:!!p.fedTurn,
    decay:p.decay||0,turnCap:p.turnCap==null?null:p.turnCap,playedTurn:p.playedTurn||0,noSpell:!!p.noSpell,
    nextCap:p.nextCap==null?null:p.nextCap,nextNoSpell:!!p.nextNoSpell,
    hand:full?p.hand.map(c=>{const x=pubCard(c);if(c.scrap){const t=scrapTax(p);if(t){x.cost+=t;x.taxed=true;}}return x;}):p.hand.map(c=>({uid:c.uid,back:true,costUp:c.cost>c.baseCost})),
    board:p.board.map(pubCard),stats:p.stats};
}
function err(msg){return{ok:false,error:msg};}

return{Game,effCost,scrapTax,shuffle,bandCount,boost,bestRegime,redCount,hasBonus,hasCost,heroBonus,gunCount,unitValue,canAttack,attackTargets,targetSpec,optionSpec,playError,autoTargets,autoOption,pubCard};
});
