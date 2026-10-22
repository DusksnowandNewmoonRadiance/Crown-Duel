/* 胜率测试在独立线程运行，复用 winrate.js 的对局与统计逻辑。 */
importScripts("/shared/cards.js","/shared/engine.js","/shared/ai.js","/js/winrate-core.js");
const W=self.DuelWinrate;

function rate(w,d,g){return g?Math.round((w+d/2)/g*100):null;}
function report(s,minSample){
  const cards=Object.keys(s.cardPlayedGames).filter(id=>s.cardPlayedGames[id]>=minSample&&s.cardPlays[id]>0)
    .map(id=>{
      const games=s.cardPlayedGames[id],plays=s.cardPlays[id],damage=s.cardDmg[id]||0,attacks=s.cardAtks[id]||0;
      return{name:W.cardName(s.hero,id),id,games,plays,wins:s.cardWins[id]||0,
        winRate:Math.round((s.cardWins[id]||0)/games*100),damage,
        damagePerUse:Math.round(damage/Math.max(1,plays+attacks)*10)/10};
    }).sort((a,b)=>b.damage-a.damage||b.plays-a.plays);
  const winTurns=s.winTurns;
  return{hero:s.hero,games:s.games,wins:s.wins,draws:s.draws,winRate:rate(s.wins,s.draws,s.games),
    avgTurns:s.games?Math.round(s.turns/s.games*10)/10:0,maxBoard:s.maxBoard,minHp:s.minHp,
    heroDmg:s.heroDmg,unitDmg:s.unitDmg,damagePerTurn:s.turns?Math.round((s.heroDmg+s.unitDmg)/s.turns*10)/10:0,
    winTurnAvg:winTurns.length?Math.round(winTurns.reduce((a,b)=>a+b,0)/winTurns.length*10)/10:null,
    winTurnMin:winTurns.length?Math.min(...winTurns):null,winTurnMax:winTurns.length?Math.max(...winTurns):null,
    sat:s.sat,satGuns:s.satGuns,aoeCnt:s.aoeCnt,conv:s.conv,gunPeak:s.gunPeak,scrapPeak:s.scrapPeak,
    wastePreSac:s.wastePreSac,firebombNoFin:s.firebombNoFin,boardingThin:s.boardingThin,
    aoeLate:s.aoeLate,rebelBlocked:s.rebelBlocked,supermanFace:s.supermanFace,supermanBoard:s.supermanBoard,cards};
}

self.onmessage=async({data})=>{
  if(!data||data.type!=="start")return;
  try{
    const o=data.options||{},heroes=W.heroes;
    if(!["all","hero","match"].includes(o.mode)||!Number.isInteger(o.games)||o.games<1||o.games>1000)throw Error("测试参数无效");
    if(o.mode!=="all"&&!heroes.includes(o.heroA))throw Error("请选择卡牌师");
    if(o.mode==="match"&&!heroes.includes(o.heroB))throw Error("请选择对手");
    const plans=[];
    if(o.mode==="all")for(let i=0;i<heroes.length;i++)for(let j=i+1;j<heroes.length;j++)plans.push([heroes[i],heroes[j]]);
    else if(o.mode==="hero")heroes.filter(h=>h!==o.heroA).forEach(h=>plans.push([o.heroA,h]));
    else plans.push([o.heroA,o.heroB]);
    const total=plans.length*o.games,pairs=[],stats={},presetStats={},history={},tallies={};
    const sampleStep=Math.max(1,Math.ceil((o.mode==="match"?o.games:(heroes.length-1)*o.games)/200));
    const getStat=(key,hero)=>stats[key]||(stats[key]=W.mkStat(hero));
    function record(key,won,draw){
      const t=tallies[key]||(tallies[key]={games:0,wins:0,draws:0});
      t.games++;if(won)t.wins++;if(draw)t.draws++;
      if(t.games===1||t.games%sampleStep===0)(history[key]||(history[key]=[])).push({game:t.games,winRate:rate(t.wins,t.draws,t.games)});
    }
    function countPreset(hero,preset,foe,won,draw){
      const key=[hero,preset,foe].join("\u0000");
      const row=presetStats[key]||(presetStats[key]={hero,preset,foe,games:0,wins:0,draws:0});
      row.games++;if(won)row.wins++;if(draw)row.draws++;
    }
    let done=0;
    for(const [a,b] of plans){
      let winsA=0,winsB=0,draws=0;
      for(let k=0;k<o.games;k++){
        const first=o.first==="a"?true:o.first==="b"?false:o.first==="random"?Math.random()<.5:k%2===0;
        const deckA=o.mode==="match"?o.deckA:o.decks&&o.decks[a];
        const deckB=o.mode==="match"?o.deckB:o.decks&&o.decks[b];
        const aiA=o.aiA||"normal",aiB=o.aiB||"normal";
        const r=W.playOne(first?a:b,first?b:a,{decks:first?[deckA,deckB]:[deckB,deckA],ai:first?[aiA,aiB]:[aiB,aiA]});
        const ia=first?0:1,ib=1-ia;
        if(r.winner===ia)winsA++;else if(r.winner===ib)winsB++;else draws++;
        const isDraw=r.winner!==ia&&r.winner!==ib;
        record(o.mode==="match"?"A":a,r.winner===ia,isDraw);
        record(o.mode==="match"?"B":b,r.winner===ib,isDraw);
        countPreset(a,r.presets[ia],b,r.winner===ia,r.winner!==ia&&r.winner!==ib);
        countPreset(b,r.presets[ib],a,r.winner===ib,r.winner!==ia&&r.winner!==ib);
        W.merge(getStat(o.mode==="match"?"A":a,a),r.st[ia]);
        W.merge(getStat(o.mode==="match"?"B":b,b),r.st[ib]);
        done++;
        if(done%5===0||done===total){self.postMessage({type:"progress",done,total,a,b});await new Promise(resolve=>setTimeout(resolve,0));}
      }
      pairs.push({a,b,winsA,winsB,draws,games:o.games,rateA:rate(winsA,draws,o.games),rateB:rate(winsB,draws,o.games)});
    }
    const reports={};for(const key in stats){
      reports[key]=report(stats[key],o.minSample||1);
      const t=tallies[key],points=history[key]||(history[key]=[]);
      if(t&&(!points.length||points[points.length-1].game!==t.games))points.push({game:t.games,winRate:rate(t.wins,t.draws,t.games)});
    }
    const presets=Object.values(presetStats).map(row=>({...row,winRate:rate(row.wins,row.draws,row.games)}));
    self.postMessage({type:"done",result:{mode:o.mode,pairs,stats:reports,presets,history,total,gamesPerPair:o.games}});
  }catch(e){self.postMessage({type:"error",message:e&&e.message||String(e)});}
};
