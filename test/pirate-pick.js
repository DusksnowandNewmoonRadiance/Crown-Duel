const assert=require("node:assert/strict");
const C=require("../shared/cards.js"),{Game}=require("../shared/engine.js");

const g=new Game({players:[{name:"海盗",hero:"八幡"},{name:"对手",hero:"苏苏"}],first:0});
g.mulligan(0,[]);g.mulligan(1,[]);
const p=g.players[0];p.energy=p.maxEnergy=10;
const discover=g.clone(C.cardDef("八幡","pirateDiscover"),"八幡");
p.hand.push(discover);
assert.equal(g.playCard(0,discover.uid,[]).ok,true);
for(let choice=0;choice<3;choice++){
  const options=g.viewFor(0).pending.cards;
  assert.equal(options.length,3);
  for(const card of options){
    assert.equal(card.kind,"unit");
    assert.equal(Number.isFinite(card.attack),true,`${card.name} 的攻击力应可显示`);
    assert.equal(Number.isFinite(card.health),true,`${card.name} 的生命值应可显示`);
    assert.equal(Number.isFinite(card.maxHealth),true,`${card.name} 的最大生命值应可显示`);
  }
  assert.equal(g.resolvePending(0,0).ok,true);
}
assert.equal(g.viewFor(0).pending,null);
console.log("发现海盗选牌数值测试通过");
