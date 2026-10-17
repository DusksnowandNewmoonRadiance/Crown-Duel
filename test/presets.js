const assert=require("node:assert/strict");
const Cards=require("../shared/cards.js");

const counts=deck=>Object.entries(deck.reduce((out,id)=>{
  out[id]=(out[id]||0)+1;return out;
},{})).sort(([a],[b])=>a.localeCompare(b));

for(const hero of Object.keys(Cards.PROFILES)){
  const presets=Cards.presets(hero);
  assert.ok(presets,`${hero} 缺少敌方卡组`);
  const names=Object.keys(presets);
  assert.equal(names.length,2,`${hero} 必须有两套预设`);
  for(const name of names){
    const deck=Cards.presetDeck(hero,name);
    assert.equal(deck.length,Cards.DECK_SIZE,`${hero}：${name} 张数错误`);
    assert.equal(Cards.deckError(hero,deck),null,`${hero}：${name} 不合法`);
  }
  assert.notDeepEqual(counts(presets[names[0]]),counts(presets[names[1]]),`${hero} 的两套卡组不能相同`);
  const random=Math.random;
  try{
    Math.random=()=>0;
    assert.equal(Cards.aiDeck(hero),presets[names[0]]);
    Math.random=()=>.999;
    assert.equal(Cards.aiDeck(hero),presets[names[1]]);
  }finally{Math.random=random;}
}
console.log("所有卡牌师的两套敌方卡组测试通过");
