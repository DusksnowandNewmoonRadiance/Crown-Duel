/* 网页 Worker 与终端共用 winrate.js，并验证参数会进入模拟。 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"..");
function worker(){
  const messages=[];
  const context=vm.createContext({console,Math,setTimeout,clearTimeout});
  context.self=context;
  context.postMessage=message=>messages.push(message);
  context.importScripts=(...urls)=>urls.forEach(url=>{
    const file=path.join(root,url.startsWith("/js/")?"public"+url:url.slice(1));
    vm.runInContext(fs.readFileSync(file,"utf8"),context,{filename:file});
  });
  vm.runInContext(fs.readFileSync(path.join(root,"public/js/winrate-worker.js"),"utf8"),context);
  return{context,messages};
}
async function run(options){
  const w=worker();
  await w.context.onmessage({data:{type:"start",options}});
  const error=w.messages.find(m=>m.type==="error");if(error)throw Error(error.message);
  return{result:w.messages.find(m=>m.type==="done").result,progress:w.messages.filter(m=>m.type==="progress")};
}
(async()=>{
  const C=require("../shared/cards.js"),W=require("../winrate.js");
  assert.equal(W.heroes.length,Object.keys(C.PROFILES).length);
  assert.equal(W.pickDeck("七星",{preset:"默认"}).preset,"默认");
  assert.equal(W.pickDeck("七星",{preset:"衰减流"}).preset,"衰减流");
  assert.deepEqual(W.playOne("七星","白猫",{decks:["衰减流","毁稿疲劳"],ai:["easy","hard"]}).presets,["衰减流","毁稿疲劳"]);
  const base={games:2,minSample:1,heroA:"七星",heroB:"白猫",deckA:"衰减流",deckB:"毁稿疲劳",
    aiA:"easy",aiB:"hard",first:"b"};
  const match=await run({...base,mode:"match"});
  assert.equal(match.result.total,2);assert.equal(match.result.pairs.length,1);
  assert.equal(match.result.pairs[0].winsA+match.result.pairs[0].winsB+match.result.pairs[0].draws,2);
  assert.equal(match.result.stats.A.games,2);assert.equal(match.result.stats.B.games,2);
  for(const key of ["A","B"]){
    const points=match.result.history[key];
    assert.equal(points[0].game,1);
    assert.equal(points.at(-1).game,match.result.stats[key].games);
    assert.equal(points.at(-1).winRate,match.result.stats[key].winRate);
  }
  assert.ok(match.result.presets.some(p=>p.hero==="七星"&&p.preset==="衰减流"&&p.games===2));
  assert.ok(match.result.presets.some(p=>p.hero==="白猫"&&p.preset==="毁稿疲劳"&&p.games===2));
  assert.ok(match.progress.length>0);
  const hero=await run({...base,mode:"hero",games:1,decks:{七星:"默认",白猫:"毁稿疲劳"}});
  assert.equal(hero.result.pairs.length,W.heroes.length-1);
  assert.equal(hero.result.stats["七星"].games,W.heroes.length-1);
  assert.equal(hero.result.history["七星"].at(-1).game,W.heroes.length-1);
  const all=await run({...base,mode:"all",games:1,decks:{七星:"星联邦流"}});
  assert.equal(all.result.pairs.length,W.heroes.length*(W.heroes.length-1)/2);
  assert.equal(all.result.stats["七星"].games,W.heroes.length-1);
  assert.equal(all.result.history["七星"].at(-1).winRate,all.result.stats["七星"].winRate);
  console.log("WINRATE WEB TEST PASSED");
})().catch(e=>{console.error(e);process.exitCode=1;});
