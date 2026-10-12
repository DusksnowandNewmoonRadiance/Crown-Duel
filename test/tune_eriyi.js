/* 绘梨衣调参：node test/tune_eriyi.js [每个对手局数] —— 各方案互相对比胜率 */
const C=require("../shared/cards.js"),E=require("../shared/engine.js"),{AIPlayer}=require("../shared/ai.js");
const N=+process.argv[2]||24;
const P=C.PROFILES["绘梨衣"];
const card=id=>P.cards.find(c=>c.id===id);
const origTok=JSON.stringify(C.TOKENS.scrapUnit);
const orig=JSON.parse(JSON.stringify(P));
function reset(){Object.assign(C.TOKENS.scrapUnit,JSON.parse(origTok));P.hp=orig.hp;P.cards.forEach((c,i)=>Object.assign(c,JSON.parse(JSON.stringify(orig.cards[i]))));}
const V={
  base:()=>{},
  hp34:()=>{P.hp=34;},
  stats:()=>{P.hp=34;card("scavenger").atk=2;card("corner").atk=3;card("corner").hp=4;card("fortress").atk=2;card("fortress").hp=7;card("xi").atk=3;card("guard").atk=5;card("guard").hp=5;card("shredder").atk=2;},
  statsCheap:()=>{V.stats();card("guard").cost=3;card("fortress").cost=2;card("xi").cost=2;card("temp").cost=1;},
  powerful:()=>{V.stats();card("fortress").cost=2;card("guard").cost=3;card("temp").cost=1;card("eriyi").cost=3;card("colossus").cost=5;card("sweep").text="弃掉手牌中所有【废料】，每张恢复 3 点生命（至多 12 点）。";},
  p2:()=>{V.powerful();C.TOKENS.scrapUnit.atk=2;C.TOKENS.scrapUnit.hp=2;card("upcycle").cost=0;card("rummage").cost=0;},
  p3:()=>{V.p2();card("neutral").cost=3;card("remelt").cost=1;card("expired").cost=0;card("recycle").cost=1;card("sweep").cost=1;},
  p4:()=>{V.p3();P.hp=38;card("scavenger").hp=3;card("corner").hp=5;card("shredder").hp=5;},
};
function play(a,b){
  const g=new E.Game({players:[{name:"A",hero:a},{name:"B",hero:b}]});
  const ai=[new AIPlayer("normal"),new AIPlayer("normal")];
  for(let i=0;i<2;i++)g.mulligan(i,ai[i].mulligan(g,i));
  let st=0;
  while(g.phase!=="over"&&st++<3000){
    const pi=g.current;
    if(g.pending){g.resolvePending(g.pending.pi,ai[g.pending.pi].pickPending(g));continue;}
    const x=ai[pi].next(g,pi);let r;
    if(x.type==="play")r=g.playCard(pi,x.uid,x.targets,x.option);
    else if(x.type==="attack")r=g.attack(pi,x.uid,x.target);else r=g.endTurn(pi);
    if(!r.ok){if(x.type==="end")break;if(x.type==="play")ai[pi].plays=99;else ai[pi].passed.add(x.uid);}
    g.takeEvents();
  }
  return g.winner;
}
const foes=Object.keys(C.PROFILES).filter(h=>h!=="绘梨衣");
const only=process.argv[3]?process.argv[3].split(","):Object.keys(V);
for(const name of only){
  reset();V[name]();
  let w=0,t=0;const per={};
  for(const f of foes){let fw=0;for(let k=0;k<N;k++){const first=k%2===0;const win=first?play("绘梨衣",f):play(f,"绘梨衣");const me=first?"me":"foe";if(win===(first?0:1)){w++;fw++;}t++;}per[f]=Math.round(fw/N*100);}
  console.log(name.padEnd(12),Math.round(w/t*100)+"%",JSON.stringify(per));
}
reset();
