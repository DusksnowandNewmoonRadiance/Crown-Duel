const C=require(__dirname+"/../shared/cards.js"),E=require(__dirname+"/../shared/engine.js"),{AIPlayer}=require(__dirname+"/../shared/ai.js");
const heroes=Object.keys(C.PROFILES);const wins={};heroes.forEach(h=>wins[h]={w:0,g:0});
let games=0,errors=0,stuck=0,draws=0,turnsTotal=0;const N=+process.argv[2]||20;
for(const a of heroes)for(const b of heroes){if(a===b)continue;for(let k=0;k<N;k++){
  const g=new E.Game({players:[{name:"A",hero:a},{name:"B",hero:b}]});
  const ai=[new AIPlayer("normal"),new AIPlayer("hard")];
  try{
    for(let i=0;i<2;i++){const r=g.mulligan(i,ai[i].mulligan(g,i));if(!r.ok)throw new Error(r.error);}
    let steps=0;
    while(g.phase!=="over"&&steps<3000){
      steps++;
      const pi=g.current;
      if(g.pending){const r=g.resolvePending(g.pending.pi,ai[g.pending.pi].pickPending(g));if(!r.ok)throw new Error("pick "+r.error);continue;}
      const act=ai[pi].next(g,pi);let r;
      if(act.type==="play")r=g.playCard(pi,act.uid,act.targets,act.option);
      else if(act.type==="attack")r=g.attack(pi,act.uid,act.target);
      else r=g.endTurn(pi);
      if(!r.ok){ if(act.type==="end")throw new Error("end "+r.error); ai[pi].passed.add(act.uid); ai[pi].plays=99; }
      g.takeEvents();
      for(const p of g.players)for(const u of p.board)if(u.health<=0)throw new Error("dead unit on board");
      g.viewFor(0);g.viewFor(1);
    }
    if(g.phase!=="over"){stuck++;continue;}
    games++;turnsTotal+=g.turn;
    if(g.winner==="draw")draws++;else{wins[g.players[g.winner].hero].w++;}
    wins[a].g++;wins[b].g++;
  }catch(e){errors++;if(errors<5)console.log(a,b,e.stack.split("\n").slice(0,3).join(" | "));}
}}
console.log({games,errors,stuck,draws,avgTurns:(turnsTotal/games).toFixed(1)});
for(const h of heroes)console.log(h,(wins[h].w/wins[h].g*100).toFixed(0)+"%");
