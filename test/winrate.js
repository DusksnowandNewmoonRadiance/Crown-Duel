/* 调参用：某个卡牌师对其余所有卡牌师的胜率（双方都是「普通」电脑，轮换先后手）
   用法：node test/winrate.js 七星 40            （每个对手每个座位 40 局）
         node test/winrate.js all 20             （所有卡牌师各自的平均胜率）*/
const C=require("../shared/cards.js"),E=require("../shared/engine.js"),{AIPlayer}=require("../shared/ai.js");
const heroes=Object.keys(C.PROFILES);

function play(a,b,level){
  const g=new E.Game({players:[{name:"A",hero:a},{name:"B",hero:b}]});
  const ai=[new AIPlayer(level||"normal"),new AIPlayer(level||"normal")];
  for(let i=0;i<2;i++)g.mulligan(i,ai[i].mulligan(g,i));
  let steps=0;
  while(g.phase!=="over"&&steps++<3000){
    const pi=g.current;
    if(g.pending){g.resolvePending(g.pending.pi,ai[g.pending.pi].pickPending(g));continue;}
    const a2=ai[pi].next(g,pi);let r;
    if(a2.type==="play")r=g.playCard(pi,a2.uid,a2.targets,a2.option);
    else if(a2.type==="attack")r=g.attack(pi,a2.uid,a2.target);
    else r=g.endTurn(pi);
    if(!r.ok){if(a2.type==="end")break;if(a2.type==="play")ai[pi].plays=99;else ai[pi].passed.add(a2.uid);}
    g.takeEvents();
  }
  return g.winner;
}
function rate(h,n,level){
  let w=0,t=0;const per={};
  for(const o of heroes){
    if(o===h)continue;let ow=0,ot=0;
    for(let k=0;k<n;k++){
      const first=k%2===0;
      const win=first?play(h,o,level):play(o,h,level);
      const mine=first?0:1;
      if(win==="draw"||win===null)continue;
      ot++;if(win===mine)ow++;
    }
    per[o]=ot?Math.round(ow/ot*100):0;w+=ow;t+=ot;
  }
  return{overall:t?Math.round(w/t*100):0,per};
}
module.exports={play,rate,heroes};
if(require.main===module){
  const who=process.argv[2]||"all",n=+process.argv[3]||20;
  if(who==="all")heroes.forEach(h=>console.log(h.padEnd(5),rate(h,n).overall+"%"));
  else{const r=rate(who,n);console.log(who,r.overall+"%",JSON.stringify(r.per));}
}
