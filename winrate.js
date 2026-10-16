/* ============================================================
 * 皇冠对决 · 胜率统计器（v3 强化版）
 * 用法：
 *   node winrate.js [N]          完整双向胜率矩阵 + 综合 + AI 诊断 + 卡牌/出伤统计
 *   node winrate.js 七星 [N]     只看某个卡牌师对每个人的胜率 + 诊断 + 卡牌统计
 *   N = 每对每个座位的局数，默认 20（越大越稳，噪声约 ±4% 起）
 *
 * 输出：
 *   1) 胜率矩阵（行 vs 列，双向）+ 每行综合胜率
 *   2) AI 行为诊断：统计各角色已知"糖/低效"操作的发生次数
 *   3) 资源/峰值统计：单位峰值、血量最低、下水火炮/饱和/AOE、绘梨衣废料/转化等
 *   4) 卡牌统计：卡牌胜率(打出后对局胜率)、总伤害、场均出伤(出伤效率)
 *   5) 出伤与胜利回合：角色均回合出伤、胜利回合均值/最高/最低
 * ============================================================ */
const C=require("./shared/cards.js"),E=require("./shared/engine.js"),{AIPlayer,isLethal}=require("./shared/ai.js");
const heroes=Object.keys(C.PROFILES);

/* ---- cmd 友好对齐：中文按双宽，其余按单宽 ---- */
function cw(s){let w=0;for(const ch of String(s))w+=ch.charCodeAt(0)>255?2:1;return w;}
function pad(s,w){s=String(s);return s+" ".repeat(Math.max(0,w-cw(s)));}
function cardName(hero,id){
  const t=C.TOKENS[id];if(t&&t.name)return t.name;
  for(const h in C.PROFILES){const c=C.PROFILES[h].cards.find(x=>x.id===id);if(c&&c.name)return c.name;}
  for(const a in C.AWA_CARDS){const c=C.AWA_CARDS[a];if(c&&c.id===id&&c.name)return c.name;}
  return "未知卡牌";
}

function mkStat(hero){return{hero,games:0,wins:0,maxBoard:0,minHp:99,sat:0,satGuns:0,aoeCnt:0,conv:0,gunPeak:0,scrapPeak:0,wastePreSac:0,firebombNoFin:0,boardingThin:0,aoeLate:0,rebelBlocked:0,supermanFace:0,supermanBoard:0,turns:0,mull:0,
  heroDmg:0,unitDmg:0,winTurns:[],cardPlays:{},cardPlayedGames:{},cardWins:{},cardDmg:{},cardAtks:{}};}

/* ---- 跑某对（双向轮流）：单局，返回 winner + 双方统计 ---- */
function playOne(a,b,level){
  const g=new E.Game({players:[{name:"A",hero:a},{name:"B",hero:b}]});
  const ai=[new AIPlayer(level||"normal"),new AIPlayer(level||"normal")];
  const st=[mkStat(a),mkStat(b)];
  // 伤害追踪：包装引擎伤害方法，归因给"当前动作方(curActor)"与"最近打出的卡(curPlayed)"
  let curActor=0;const curPlayed=[];
  const DH=g.damageHero.bind(g),DU=g.damageUnit.bind(g);
  g.damageHero=function(p,n,o={}){
    const res=DH(p,n,o);
    if(!o.self&&!o.fatigue){   // 非自伤/非疲劳 = 对敌方英雄伤害
      const at=curActor;st[at].heroDmg+=n;
      const cid=curPlayed.length?curPlayed[curPlayed.length-1].id:null;
      if(cid)st[at].cardDmg[cid]=(st[at].cardDmg[cid]||0)+n;
    }
    return res;
  };
  g.damageUnit=function(owner,u,n,src,combat){
    const res=DU(owner,u,n,src,combat);
    const cid=curPlayed.length?curPlayed[curPlayed.length-1].id:null;
    const at=cid?curPlayed[curPlayed.length-1].pi:curActor;
    if(at!==owner.idx){   // 受伤的是对方单位
      st[at].unitDmg+=n;
      if(cid)st[at].cardDmg[cid]=(st[at].cardDmg[cid]||0)+n;
    }
    return res;
  };
  const turnAtk=[new Set(),new Set()];
  const playedSet=[new Set(),new Set()];
  for(let i=0;i<2;i++)g.mulligan(i,ai[i].mulligan(g,i));
  while(g.phase!=="over"){
    const pi=g.current;const p=g.players[pi],o=g.players[1-pi],me=st[pi];
    curActor=pi;
    me.maxBoard=Math.max(me.maxBoard,p.board.length);
    me.minHp=Math.min(me.minHp,p.hp);
    if(me.hero==="下水")me.gunPeak=Math.max(me.gunPeak,p.board.filter(u=>u.gun).length);
    if(me.hero==="绘梨衣")me.scrapPeak=Math.max(me.scrapPeak,p.hand.filter(x=>x.scrap).length);
    if(g.pending){g.resolvePending(g.pending.pi,ai[g.pending.pi].pickPending(g));continue;}
    const act=ai[pi].next(g,pi);let r;
    if(act.type==="play"){
      const c=p.hand.find(x=>x.uid===act.uid);const eff=c&&c.effect;
      if(c&&/^(consolidate|sacAoe3|fireShip)$/.test(eff||"")){
        const idle=p.board.filter(u=>!u.stun&&u.attack>0&&!turnAtk[pi].has(u.uid)).length;
        if(idle>=2&&!isLethal(p,o))me.wastePreSac++;
      }
      if(c&&eff==="sacAoe3"&&!o.board.some(u=>u.health<=3))me.firebombNoFin++;
      if(c&&eff==="buffAllCharge"&&p.board.length<3)me.boardingThin++;
      if(c&&/^(aoe2|aoe4|choose3x2)$/.test(eff||"")&&turnAtk[pi].size>0)me.aoeLate++;
      if(c){st[pi].cardPlays[c.id]=(st[pi].cardPlays[c.id]||0)+1;playedSet[pi].add(c.id);curPlayed.push({id:c.id,pi});}
      r=g.playCard(pi,act.uid,act.targets,act.option);
      if(curPlayed.length)curPlayed.pop();
      if(r.ok){
        if(eff==="saturation"){me.sat++;me.satGuns+=p.board.filter(u=>u.gun).length;}
        if(/^(aoe2|aoe4|choose3x2)$/.test(eff||""))me.aoeCnt++;
        if(/^(convert2|convert3)$/.test(eff||""))me.conv++;
      }
      if(c&&/^(rebel|takeover|rebelLowest|rebelWeakest|over)$/.test(eff||"")&&!r.ok)me.rebelBlocked++;
    }else if(act.type==="attack"){
      const u=p.board.find(x=>x.uid===act.uid);
      const tgt=o.board.find(x=>x.uid===act.target)||null;
      if(u&&u.id==="superman"){if(tgt)me.supermanBoard++;else me.supermanFace++;}
      if(u){st[pi].cardAtks[u.id]=(st[pi].cardAtks[u.id]||0)+1;curPlayed.push({id:u.id,pi});}   // 单位攻击伤害归因到该单位卡
      r=g.attack(pi,act.uid,act.target);
      if(curPlayed.length)curPlayed.pop();
      if(r.ok&&u)turnAtk[pi].add(u.uid);
    }else r=g.endTurn(pi);
    if(!r.ok){if(act.type==="end")g.endTurn(pi);else{ai[pi].passed.add(act.uid);ai[pi].plays=99;}}
    g.takeEvents();
  }
  st[0].turns=g.turn||0;st[1].turns=g.turn||0;
  st[0].games++;st[1].games++;
  if(g.winner===0)st[0].wins++;else if(g.winner===1)st[1].wins++;
  // 胜利回合 + 卡牌胜率（含该卡且获胜的局数）
  const wt=g.turn||0;
  if(g.winner===0)st[0].winTurns.push(wt);else if(g.winner===1)st[1].winTurns.push(wt);
  for(const i of[0,1])playedSet[i].forEach(id=>{
    st[i].cardPlayedGames[id]=(st[i].cardPlayedGames[id]||0)+1;
    if(g.winner===i)st[i].cardWins[id]=(st[i].cardWins[id]||0)+1;
  });
  return{winner:g.winner,turns:wt,st};
}
function merge(dst,src){for(const k in src){if(k==="hero")continue;
  if(k==="maxBoard"||k==="gunPeak"||k==="scrapPeak")dst[k]=Math.max(dst[k],src[k]);
  else if(k==="minHp")dst[k]=Math.min(dst[k],src[k]);
  else if(k==="winTurns")dst.winTurns=dst.winTurns.concat(src.winTurns);
  else if(k==="cardPlays"||k==="cardPlayedGames"||k==="cardWins"||k==="cardDmg"||k==="cardAtks")mergeObj(dst[k],src[k]);
  else dst[k]+=src[k];}}
function mergeObj(a,b){for(const k in b){a[k]=(a[k]||0)+b[k];}return a;}

const agg={};heroes.forEach(h=>agg[h]=mkStat(h));
const MATRIX={};
function runAll(n){
  for(const a of heroes)for(const b of heroes){if(a===b)continue;
    MATRIX[a]=MATRIX[a]||{};MATRIX[b]=MATRIX[b]||{};
    if(MATRIX[a][b]!==undefined)continue;
    let aw=0,bw=0;
    const dA=mkStat(a),dB=mkStat(b);
    for(let k=0;k<n;k++){
      const first=k%2===0;
      const r=first?playOne(a,b):playOne(b,a);
      if(r.winner===0){first?aw++:bw++;}
      else if(r.winner===1){first?bw++:aw++;}
      merge(dA,r.st[first?0:1]);merge(dB,r.st[first?1:0]);
    }
    merge(agg[a],dA);merge(agg[b],dB);
    MATRIX[a][b]=Math.round(aw/(aw+bw)*100);MATRIX[b][a]=Math.round(bw/(aw+bw)*100);
  }
}
function ovl(h,n){return n?Math.round(agg[h].wins/agg[h].games*100):0;}

function diag(stats){
  for(const s of stats){
    if(!s.games)continue;
    const lines=[];
    if(s.wastePreSac>0)lines.push(`打消耗己方单位的牌前有单位未攻击(浪费攻击) ${s.wastePreSac} 次`);
    if(s.supermanFace+s.supermanBoard>0){const pct=Math.round(s.supermanFace/(s.supermanFace+s.supermanBoard)*100);lines.push(`超人攻击 打脸${s.supermanFace}/解场${s.supermanBoard}（打脸率${pct}%）`);}
    if(s.firebombNoFin>0)lines.push(`燃烧弹打在没有残血可收的场面(浪费) ${s.firebombNoFin} 次`);
    if(s.boardingThin>0)lines.push(`登船战在场面<3时打(浪费buff) ${s.boardingThin} 次`);
    if(s.aoeLate>0)lines.push(`AOE 在己方单位已攻击后才打(顺序错，应先清场) ${s.aoeLate} 次`);
    if(s.rebelBlocked>0)lines.push(`策反被规则拦截(空场/条件不满足) ${s.rebelBlocked} 次`);
    const avg=s.turns/s.games;
    const gun= s.satGuns/s.sat||0;
    console.log(`[${pad(s.hero,6)}] ${s.games}局 胜${s.wins} 均回合${avg.toFixed(1)} 单位峰值${s.maxBoard} 血量最低${s.minHp}`+(lines.length?"\n     "+lines.join("；"):""));
    if(s.hero==="下水")console.log(`    火炮峰值${s.gunPeak} 饱和${s.sat}次(均${gun.toFixed(1)}火炮/次) AOE${s.aoeCnt}次`);
    if(s.hero==="绘梨衣")console.log(`    废料手牌峰值${s.scrapPeak} 转化${s.conv}次`);
  }
}
/* 卡牌统计 + 出伤/胜利回合 */
function cardBlock(stats){
  console.log("=== 出伤与胜利回合 ===");
  for(const s of stats){
    if(!s.games)continue;
    const ttlDmg=s.heroDmg+s.unitDmg;
    const perTurn=(ttlDmg/Math.max(1,s.turns)).toFixed(1);
    let wr="—";
    if(s.winTurns.length){
      const mn=Math.min(...s.winTurns),mx=Math.max(...s.winTurns);
      const av=(s.winTurns.reduce((x,y)=>x+y,0)/s.winTurns.length).toFixed(1);
      wr=`${av} (${mn}~${mx})`;
    }
    console.log(`  [${pad(s.hero,6)}] 均回合出伤 ${pad(perTurn,5)}/回合  总伤害 ${pad(ttlDmg,4)}  胜利回合 均值${wr}`);
  }
  console.log("\n=== 卡牌统计（按角色 · 打出≥4局才显示 · 按总伤害排序）===");
  for(const s of stats){
    if(!s.games)continue;
    const ids=Object.keys(s.cardPlayedGames).filter(id=>s.cardPlayedGames[id]>=4&&s.cardPlays[id]>0);   // 只统计该角色亲手打出的卡（排除衍生 token/他人召唤的卡）
    if(!ids.length){console.log(`  [${pad(s.hero,6)}] （样本不足）`);continue;}
    ids.sort((x,y)=>(s.cardDmg[y]||0)-(s.cardDmg[x]||0));
    console.log(`  [${pad(s.hero,6)}] 卡牌胜率=打出该卡的对局胜率 · 场均出伤=总伤害/打出次数`);
    ids.slice(0,14).forEach(id=>{
      const nm=cardName(s.hero,id);
      const pg=s.cardPlayedGames[id],pl=s.cardPlays[id];
      const wrate=Math.round((s.cardWins[id]||0)/pg*100);
      const dmg=s.cardDmg[id]||0;
      // 出伤分母 = 打出次数 + 单位攻击次数（token 虽非手牌打出但会多次攻击，避免场均虚高）
      const denom=pl+(s.cardAtks[id]||0);
      const per=denom?(dmg/denom).toFixed(1):"—";
      console.log(`      ${pad(nm,10)} 局${pad(pg,3)}/次${pad(pl,3)} 胜率${pad(wrate+"%",4)} 总伤${pad(dmg,4)} 场均${per}`);
    });
  }
}

if(require.main===module){
  const who=process.argv[2],n=parseInt(process.argv[3]||process.argv[2],10)||20;
  const single=who&&!isNaN(+process.argv[3])?who:null;
  console.log(`皇冠对决 · 胜率统计器 v3（每对 ${n} 局/座位，AI=normal，双向轮流先后手）\n`);
  if(single){
    const dA=mkStat(single),dB=mkStat(single);
    const rows={};
    for(const b of heroes){if(b===single)continue;
      let aw=0,bw=0;
      for(let k=0;k<n;k++){const f=k%2===0;const r=f?playOne(single,b):playOne(b,single);
        if(r.winner===0)f?aw++:bw++;else if(r.winner===1)f?bw++:aw++;
        merge(dA,r.st[f?0:1]);merge(dB,r.st[f?1:0]);
      }
      rows[b]=Math.round(aw/(aw+bw)*100);
      const t=aw+bw;dA.wins+=aw;dA.games+=t;
    }
    console.log(`${single} 对每个卡牌师胜率：`);
    heroes.forEach(h=>{if(h!==single)console.log(`  对 ${pad(h,6)} ${rows[h]}%`);});
    console.log(`综合：${Math.round(dA.wins/dA.games*100)}%（${dA.games} 局）\n`);
    diag([dA]);
    console.log();
    cardBlock([dA]);
  }else{
    runAll(n);
    const colW=7;
    console.log("=== 胜率矩阵（行 vs 列）===");
    console.log(pad("",colW)+heroes.map(h=>pad(h,colW)).join("")+pad("综合",colW));
    for(const a of heroes){
      const line=heroes.map(b=>a===b?pad("—",colW):pad((MATRIX[a][b]||0)+"%",colW)).join("");
      console.log(pad(a,colW)+line+pad(ovl(a,n)+"%",colW));
    }
    console.log("\n=== 综合胜率 ===");
    [...heroes].sort((x,y)=>ovl(y,n)-ovl(x,n)).forEach(h=>console.log(`  ${pad(h,6)} ${pad(ovl(h,n)+"%",5)}  (${agg[h].games} 局)`));
    console.log("\n=== AI 行为诊断（全角色累计）===");
    diag(heroes.map(h=>agg[h]));
    console.log();
    cardBlock(heroes.map(h=>agg[h]));
  }
}
