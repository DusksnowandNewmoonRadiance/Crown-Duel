/* 皇冠对决 · 电脑对手（单机练习用；服务器也可复用）
   难度：easy / normal / hard */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory(require("./cards.js"),require("./engine.js"));
  else root.DuelAI=factory(root.DuelCards,root.DuelEngine);
})(typeof self!=="undefined"?self:this,function(C,E){
"use strict";
const {MAX_BOARD,MAX_HAND,ESCAPE_TARGET}=C;
const {unitValue,heroBonus,gunCount,playError,attackTargets,canAttack,autoTargets,autoOption,bestRegime,redCount}=E;
const SCRAP_SPELLS={convert1:1,scrapSearch:1,convert2:2,convert3:3,scrapStun:1,scrapBlast:1,scrapSweep:1,crownCopy:2};
const REGIME_OF={decreeRus:"rus",decreeUkr:"ukr",decreeBlr:"blr"};

const BURN={hero99:99,damage5:5,damage6:6,damage7:7,aoe2:2,aoe5:5,manaBurn:2,steal5draw:3,hero2drawSteal:2,hero2:2,hero1:1,hero3:3,steal3hero1:1,xiashuiDeploy:3,disruption:2};
function burnOf(s,c){
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
function isLethal(s,o){
  let en=s.energy,dmg=0;
  const burns=s.hand.filter(c=>burnOf(s,c)>0&&!playError(c,s,o)).sort((a,b)=>burnOf(s,b)/(b.cost||1)-burnOf(s,a)/(a.cost||1));
  for(const c of burns)if(c.cost<=en){en-=c.cost;dmg+=burnOf(s,c);}
  return faceReach(s,o)+dmg>=o.hp+o.armor;
}
function scoreCard(s,o,c,lethal){
  const e=c.effect,myN=s.board.length,enN=o.board.length,burn=burnOf(s,c);
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
    if(e==="copySmallCannon")sc+=gunCount(s)*1.5;
    if(e==="baimaoDeploy")sc-=3;
    if(lethal&&burn>0)sc+=300;
  }else{
    sc=c.cost*.8+1;
    if(burn)sc+=burn*.8;
    if(lethal&&burn>0)sc+=500;
    if(e==="runaway")return s.money>=ESCAPE_TARGET?20000:-8;
    if(/^(aoe|redDawn)/.test(e)||e==="choose3x2")sc+=enN?enN*3:-100;
    else if(e==="saturation")sc+=gunCount(s)?(enN*2+gunCount(s)*2):-100;
    else if(e==="sacAoe3")sc+=(enN&&myN)?enN*3-2:-100;
    else if(e==="fireShip")sc+=(enN>=2&&myN)?enN*2.5-myN*1.5:-100;
    else if(/^enemyAtkDown/.test(e))sc+=enN?o.board.reduce((a,u)=>a+Math.min(u.attack,2),0)*1.3:-100;
    else if(e==="gravityLock")sc+=enN>=2?4:-100;
    else if(e==="removeRestrict")sc+=3+(o.heroImmune?4:0)+o.board.filter(u=>u.taunt).length*2;
    else if(/^(remove|adapt)/.test(e))sc+=enN?Math.max(...o.board.map(unitValue))*.9:(e==="adapt"?-2:-100);
    else if(/^(rebel|takeover)/.test(e))sc+=enN?Math.max(...o.board.map(unitValue))*1.1:-100;
    else if(/^(buffAll|pirateBuff|highcommand)/.test(e))sc+=myN?myN*2.4:-100;
    else if(/^(buffGuns|reload)/.test(e))sc+=gunCount(s)?gunCount(s)*2.5:-100;
    else if(e==="buffOneDraw")sc+=myN?3:-2;
    else if(/^(summon|fillRed|namecardsummon)/.test(e)&&e!=="summonSuperman")sc+=myN>=MAX_BOARD?-100:(e==="fillRed"?8:3);
    else if(e==="ramp"||e==="starClimb")sc+=s.maxEnergy<7?3:-2;
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
  }
  return sc;
}

class AIPlayer{
  constructor(level){this.level=level||"normal";this.passed=new Set();this.plays=0;this.turnSeen=-1;}
  noise(){return this.level==="easy"?6:this.level==="hard"?0:.4;}
  mulligan(game,pi){
    const p=game.players[pi];
    const lim=this.level==="easy"?7:5;
    return p.hand.filter(c=>c.cost>=lim&&!c.core&&c.id!=="superman").map(c=>c.uid);
  }
  pickPending(game){return game.pending?game.pending.auto:0;}
  /* 返回下一步动作：{type:"play",uid,targets,option} / {type:"attack",uid,target} / {type:"end"} */
  next(game,pi){
    if(game.turn!==this.turnSeen){this.turnSeen=game.turn;this.passed.clear();this.plays=0;}
    const s=game.players[pi],o=game.players[1-pi];
    if(this.plays<12){
      const opts=s.hand.filter(c=>!playError(c,s,o));
      if(opts.length){
        const lethal=this.level!=="easy"&&isLethal(s,o);
        let best=null,bs=-1e9;
        for(const c of opts){
          const sc=scoreCard(s,o,c,lethal)+Math.random()*this.noise();
          if(sc>bs){bs=sc;best=c;}
        }
        if(best&&bs>-20){
          this.plays++;
          return{type:"play",uid:best.uid,targets:autoTargets(best,s,o),option:autoOption(best,s,o)};
        }
      }
    }
    const mv=this.chooseAttack(s,o);
    if(mv)return{type:"attack",uid:mv.unit.uid,target:mv.target?mv.target.uid:null};
    return{type:"end"};
  }
  chooseAttack(s,o){
    for(let guard=0;guard<20;guard++){
      const ready=s.board.filter(u=>!canAttack(u)&&!this.passed.has(u.uid));
      if(!ready.length)return null;
      const lethal=faceReach(s,o)>=o.hp+o.armor;
      let best=null;
      for(const u of ready){
        const v=attackTargets(u,o);
        const hd=u.attack+heroBonus(u);
        const consider=(t,sc)=>{if(!best||sc>best.score)best={unit:u,target:t,score:sc};};
        if(v.hero){
          let fs=hd*(.5+.9*(1-Math.max(0,o.hp)/o.maxHp));
          if(lethal)fs+=1000;
          if(u.taunt&&!lethal&&s.hp<=14)fs-=3;
          if(!o.board.length)fs+=2;
          if(this.level==="easy")fs+=3;
          consider(null,fs);
        }
        for(const id of v.units){
          const t=o.board.find(x=>x.uid===id);
          const kills=u.attack>=t.health,dies=t.attack>=u.health;
          let sc=(kills?unitValue(t):unitValue(t)*.12)-(dies?unitValue(u):0);
          if(kills&&!dies)sc+=3;
          if(!kills&&dies)sc-=4;
          if(t.taunt&&kills)sc+=1.5;
          if(this.level==="hard"&&t.id==="awaBand")sc+=4;
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

return{AIPlayer,burnOf,isLethal};
});
