const assert=require("node:assert/strict");
const Cards=require("../shared/cards.js");
const {Game}=require("../shared/engine.js");

function game(){
  const g=new Game({players:[{name:"白猫玩家",hero:"白猫"},{name:"对手",hero:"字母"}],first:0});
  g.mulligan(0,[]);g.mulligan(1,[]);
  g.players[0].energy=g.players[0].maxEnergy=10;
  return g;
}
function play(g,id,targets=[]){
  const c=g.clone(Cards.cardDef("白猫",id),"白猫");
  g.players[0].hand.push(c);
  const r=g.playCard(0,c.uid,targets);
  assert.equal(r.ok,true,r.error);
}

{
  const g=game(),o=g.players[1],s=g.players[0];
  const top=o.deck.slice(-2).map(c=>c.name),hp=o.hp;
  play(g,"spark");
  assert.equal(o.hp,hp,"撕掉一页不能有隐藏伤害");
  assert.equal(s.destroyedCards,2);
  assert.deepEqual(s.destroyedLog.map(x=>x.name),top.reverse());
  assert.equal(s.destroyedLog[0].zone,"牌库");
  assert.equal(g.events.filter(e=>e.t==="burn"&&e.destroyed&&e.sourcePi===0&&e.pi===1).length,2,"销毁事件应带有双方视角和卡牌信息");
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  const before=o.deck.length;
  play(g,"courier");
  assert.equal(before-o.deck.length,2,"书页窃贼应销毁 2 张");
  s.energy=10;play(g,"reserve");
  assert.equal(before-o.deck.length,5,"档案拆解者应销毁 3 张");
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  const victim=g.clone(Cards.cardDef("白猫","sentinel"),"字母");
  victim.attack=1;o.board.push(victim);
  play(g,"kitten",[victim.uid]);
  assert.equal(o.board.length,0,"勘误猫应销毁低攻单位");
  assert.equal(s.destroyedLog[0].name,victim.name);
  assert.equal(s.destroyedLog[0].zone,"战场");
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  const low=g.clone(Cards.cardDef("白猫","sentinel"),"字母");low.attack=1;
  const chosen=g.clone(Cards.cardDef("白猫","sentinel"),"字母");chosen.attack=2;
  const ineligible=g.clone(Cards.cardDef("白猫","sentinel"),"字母");ineligible.attack=3;
  o.board.push(low,chosen,ineligible);
  const card=g.clone(Cards.cardDef("白猫","kitten"),"白猫");s.hand.push(card);
  const spec=require("../shared/engine.js").targetSpec(card,s,o);
  assert.deepEqual(spec.eligible,[low.uid,chosen.uid],"只能点选攻击力不超过 2 的敌方单位");
  assert.equal(g.playCard(0,card.uid,[ineligible.uid]).ok,false,"非法目标应被拒绝");
  assert.equal(g.playCard(0,card.uid,[]).ok,false,"有合法目标时需要点选");
  assert.equal(g.playCard(0,card.uid,[chosen.uid]).ok,true);
  assert.deepEqual(o.board.map(u=>u.uid),[low.uid,ineligible.uid],"应销毁玩家点选的单位");
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  o.deck=[];o.armor=0;
  play(g,"surge");
  assert.equal(o.fatigue,1);assert.equal(o.hp,o.maxHp-1);
  s.energy=10;play(g,"rally");
  assert.equal(o.fatigue,3);assert.equal(o.hp,o.maxHp-10,"三次疲劳应分别为 1、3、6 点");
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  o.deck=o.deck.slice(0,2);o.hand=[];
  const names=o.deck.map(c=>c.name);
  play(g,"rally");
  assert.equal(o.deck.length,0);
  assert.equal(o.hand.length,0,"强制抽到的牌应立即销毁");
  assert.deepEqual(s.destroyedLog.map(x=>x.name).sort(),names.sort());
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  o.deck=[];o.armor=0;
  play(g,"guardian");
  assert.equal(o.fatigue,1,"催读官部署时触发疲劳");
  g.endTurn(0);g.endTurn(1);
  assert.equal(o.fatigue,3,"对手正常回合抽牌和催读官回合开始都应触发疲劳");
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  const old=o.hand[0].name;
  o.hand=o.hand.slice(0,1);
  play(g,"editor");
  assert.equal(o.hand[0].effect,"whiteJunk","涂改员应把敌方手牌变成垃圾");
  assert.equal(s.destroyedCards,0,"变形不应算作销毁");
  assert.ok(g.logs.some(x=>x.text.includes(old)&&x.text.includes("垃圾")));
  assert.ok(g.events.some(e=>e.t==="transformCard"&&e.card.name===old&&e.into.name==="垃圾"&&e.zone==="手牌"),"污染事件应包含原牌和新牌");
  g.endTurn(0);o.energy=o.maxEnergy=10;
  const top=o.deck.at(-1).name,before=o.deck.length;
  const junk=o.hand.find(c=>c.effect==="whiteJunk");
  assert.equal(g.playCard(1,junk.uid,[]).ok,true);
  assert.equal(o.deck.length,before-2,"打出垃圾应先销毁牌库顶，再抽 1 张");
  assert.equal(s.destroyedLog.at(-1).name,top);
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  const before=o.deck.length;
  play(g,"pollute");
  assert.equal(o.deck.length,before,"污染牌库不应直接减少牌数");
  assert.equal(o.deck.filter(c=>c.effect==="whiteJunk").length,2);
  assert.equal(s.destroyedCards,0);
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  o.deck=o.deck.slice(0,2);o.hand=[g.clone(Cards.TOKENS.junk,o.hero)];
  g.endTurn(0);o.energy=o.maxEnergy=10;
  const junk=o.hand.find(c=>c.effect==="whiteJunk");
  assert.equal(g.playCard(1,junk.uid,[]).ok,true);
  assert.equal(o.deck.length,0);
  assert.equal(o.fatigue,1,"垃圾销毁最后一张牌后抽牌应触发疲劳");
  assert.equal(s.destroyedCards,1);
}
{
  const g=game(),s=g.players[0];
  s.hp=s.maxHp-10;
  play(g,"medic");
  assert.equal(s.hp,s.maxHp-6);
  s.energy=10;play(g,"mend");
  assert.equal(s.hp,s.maxHp);
  assert.equal(s.armor,2);
}
{
  const deck=Cards.defaultDeck("白猫");
  assert.equal(deck.length,40);
  for(const id of ["editor","pollute","medic","mend","shredstorm","flood"])assert.ok(deck.includes(id),`${id} 应进入默认卡组`);
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  for(const hp of [2,3,5]){
    const u=g.clone(Cards.cardDef("白猫","sentinel"),"字母");
    u.health=u.maxHealth=hp;o.board.push(u);
  }
  play(g,"shredstorm");
  assert.equal(o.board.length,1,"碎稿风暴应对所有敌方单位造成 3 点伤害");
  assert.equal(o.board[0].health,2);
  assert.equal(s.destroyedCards,2,"群伤消灭的单位应计入销毁记录");
}
{
  const g=game(),o=g.players[1],s=g.players[0];
  o.hand=o.deck.splice(0,7);
  const before=o.deck.length;
  play(g,"flood");
  assert.equal(o.hand.length,Cards.MAX_HAND);
  assert.equal(o.hand.filter(c=>c.effect==="whiteJunk").length,3,"成功入手的三张牌应变垃圾");
  assert.equal(o.deck.length,before-5);
  assert.equal(s.destroyedCards,2,"溢出的两张牌应被销毁并计数");
  assert.ok(s.destroyedLog.every(x=>x.zone==="抽牌溢出"));
}
{
  const g=game(),o=g.players[1];
  o.hand=o.deck.splice(0,Cards.MAX_HAND);
  const before=o.deck.length;
  g.draw(o,1);
  assert.equal(o.hand.length,Cards.MAX_HAND);
  assert.equal(o.deck.length,before-1);
  assert.ok(g.logs.some(x=>x.text.includes("手牌已满")&&x.text.includes("被销毁")));
}
console.log("白猫销毁、场面、记录和疲劳测试通过");
