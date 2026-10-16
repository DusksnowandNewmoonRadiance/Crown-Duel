/* ============================================================
 * 皇冠对决 · 胜率统计器（升级版）
 * 用法：
 *   node winrate.js [N]          完整双向胜率矩阵 + 综合 + AI 诊断 + 峰值
 *   node winrate.js 七星 [N]     只看某个卡牌师对每个人的胜率 + 诊断
 *   N = 每对每个座位的局数，默认 20（越大越稳，噪声约 ±4% 起）
 *
 * 输出：
 *   1) 胜率矩阵（行 vs 列，双向）+ 每行综合胜率
 *   2) AI 行为诊断：统计各角色已知"糖/低效"操作的发生次数
 *   3) 资源/峰值统计：单位峰值、血量最低、下水火炮/饱和/AOE、绘梨衣废料/转化等
 * ============================================================ */
const C=require("./shared/cards.js"),E=require("./shared/engine.js"),{AIPlayer,isLethal}=require("./shared/ai.js");
const heroes=Object.keys(C.PROFILES);

/* ---- cmd 友好对齐：中文按双宽，其余按单宽 ---- */
function cw(s){let w=0;for(const ch of String(s))w+=ch.charCodeAt(0)>255?2:1;return w;}
function pad(s,w){s=String(s);return s+" ".repeat(Math.max(0,w-cw(s)));}

/* ---- 单局模拟：返回 winner + 双方诊断统计 ---- */
function play(a,b,level){
  const g=new E.Game({players:[{name:"A",hero:a},{name:"B",hero:b}]});
  const ai=[new AIPlayer(level||"normal"),new AIPlayer(level||"normal")];
  const st=[mkStat(a),mkStat(b)];
  for(let i=0;i<2;i++){g.mulligan(i,ai[i].mulligan(g,i));st[i].mull=ai[i].mulligan?1:0;}
  // 本回合已攻击单位（用于"浪费攻击/顺序"检测），按玩家索引
  const turnAtk=[new Set(),new Set()];
  let turns=0;
  while(g.phase!=="over"){
    const pi=g.current;turns+=g.turn?g.turn:1;
    const p=g.players[pi],o=g.players[1-pi],me=st[pi],fo=st[1-pi];
    // 峰值：单位数 / 血量
    me.maxBoard=Math.max(me.maxBoard,p.board.length);
    me.minHp=Math.min(me.minHp,p.hp);
    // 下水：火炮峰值 / 饱和 / AOE
    if(me.hero==="下水")me.gunPeak=Math.max(me.gunPeak,p.board.filter(u=>u.gun).length);
    // 绘梨衣：手牌废料峰值
    if(me.hero==="绘梨衣")me.scrapPeak=Math.max(me.scrapPeak,p.hand.filter(x=>x.scrap).length);

    if(g.pending){g.resolvePending(g.pending.pi,ai[g.pending.pi].pickPending(g));continue;}
    const act=ai[pi].next(g,pi);let r;
    if(act.type==="play"){
      const c=p.hand.find(x=>x.uid===act.uid);
      const eff=c&&c.effect;
      // --- 打出前：消耗己方单位的牌，若场上仍有多只(≥2)能攻击却未攻击的单位 → 浪费（lethal 除外）---
      if(c&&/^(consolidate|sacAoe3|fireShip)$/.test(eff||"")){
        const idle=p.board.filter(u=>!u.stun&&u.attack>0&&!turnAtk[pi].has(u.uid)).length;
        if(idle>=2&&!isLethal(p,o))me.wastePreSac++;
      }
      // --- 燃烧弹：敌方没有可收的残血（hp<=3）→ 浪费 ---
      if(c&&eff==="sacAoe3"&&!o.board.some(u=>u.health<=3))me.firebombNoFin++;
      // --- 登船战：己方场面 <3 就打 buff → 浪费 ---
      if(c&&eff==="buffAllCharge"&&p.board.length<3)me.boardingThin++;
      // --- AOE 顺序：本回合己方单位已攻击过再打 AOE → 应先清场再攻击 ---
      if(c&&/^(aoe2|aoe4|choose3x2)$/.test(eff||"")&&turnAtk[pi].size>0)me.aoeLate++;
      r=g.playCard(pi,act.uid,act.targets,act.option);
      // --- 打出后统计 ---
      if(r.ok){
        if(eff==="saturation"){me.sat++;me.satGuns+=p.board.filter(u=>u.gun).length;}
        if(/^(aoe2|aoe4|choose3x2)$/.test(eff||""))me.aoeCnt++;
        if(/^(convert2|convert3)$/.test(eff||""))me.conv++;
      }
      // 策反被拦（空场等）：playError 拒绝
      if(c&&/^(rebel|takeover|rebelLowest|rebelWeakest|over)$/.test(eff||"")&&!r.ok)me.rebelBlocked++;
    }else if(act.type==="attack"){
      const u=p.board.find(x=>x.uid===act.uid);
      const tgt=o.board.find(x=>x.uid===act.target)||null;
      // --- 超人：打脸 vs 解场（核弹）---
      if(u&&u.id==="superman"){
        if(tgt)me.supermanBoard++;else me.supermanFace++;
        // 能斩杀却打单位 → 明显糖操作
        if(tgt&&p.hp&&g.players[pi].energy){/* 仅记录，斩杀判定复杂，用打脸率表达 */}
      }
      r=g.attack(pi,act.uid,act.target);
      if(r.ok&&u)turnAtk[pi].add(u.uid);
    }else r=g.endTurn(pi);
    if(!r.ok){
      if(act.type==="end")g.endTurn(pi);
      else{ai[pi].passed.add(act.uid);ai[pi].plays=99;}
    }
    g.takeEvents();
    if(g.phase==="over")break;
  }
  me.turns=g.turn||0;
  me.games++;
  if(g.winner===0)me.wins++;else if(g.winner===1)me.wins++; // 双方都记（矩阵双向）
  st[0].win0=g.winner===0?1:0;st[1].win0=g.winner===1?1:0;
  return g.winner;
}
function mkStat(hero){return{hero,games:0,wins:0,maxBoard:0,minHp:99,sat:0,satGuns:0,aoeCnt:0,conv:0,gunPeak:0,scrapPeak:0,wastePreSac:0,firebombNoFin:0,boardingThin:0,aoeLate:0,rebelBlocked:0,supermanFace:0,supermanBoard:0,turns:0,mull:0};}

/* ---- 跑某对（双向轮流）---- */
const agg={};heroes.forEach(h=>agg[h]=mkStat(h));
const MATRIX={};
function playOne(a,b,level){
  const g=new E.Game({players:[{name:"A",hero:a},{name:"B",hero:b}]});
  const ai=[new AIPlayer(level||"normal"),new AIPlayer(level||"normal")];
  const st=[mkStat(a),mkStat(b)];
  const turnAtk=[new Set(),new Set()];
  for(let i=0;i<2;i++)g.mulligan(i,ai[i].mulligan(g,i));
  while(g.phase!=="over"){
    const pi=g.current;const p=g.players[pi],o=g.players[1-pi],me=st[pi];
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
      r=g.playCard(pi,act.uid,act.targets,act.option);
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
      r=g.attack(pi,act.uid,act.target);
      if(r.ok&&u)turnAtk[pi].add(u.uid);
    }else r=g.endTurn(pi);
    if(!r.ok){if(act.type==="end")g.endTurn(pi);else{ai[pi].passed.add(act.uid);ai[pi].plays=99;}}
    g.takeEvents();
  }
  st[0].turns=g.turn||0;st[1].turns=g.turn||0;
  st[0].games++;st[1].games++;
  if(g.winner===0)st[0].wins++;else if(g.winner===1)st[1].wins++;
  return{winner:g.winner,turns:g.turn||0,st};
}
function runAll(n){
  // 矩阵 & 聚合
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
function merge(dst,src){for(const k in src){if(k==="hero")continue;
  if(k==="maxBoard"||k==="gunPeak"||k==="scrapPeak")dst[k]=Math.max(dst[k],src[k]);
  else if(k==="minHp")dst[k]=Math.min(dst[k],src[k]);
  else dst[k]+=src[k];}}
function ovl(h,n){return n?Math.round(agg[h].wins/agg[h].games*100):0;}

if(require.main===module){
  const who=process.argv[2],n=parseInt(process.argv[3]||process.argv[2],10)||20;
  const single=who&&!isNaN(+process.argv[3])?who:null;
  console.log(`皇冠对决 · 胜率统计器（每对 ${n} 局/座位，AI=normal，双向轮流先后手）\n`);
  if(single){
    // 单角色：对每个人
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
  }else{
    runAll(n);
    // 矩阵（cmd 友好：中文双宽对齐；表头与数值共用同一列宽，保证行列对齐）
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
  }
}
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
