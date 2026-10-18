const assert=require("node:assert/strict");
const Cards=require("../shared/cards.js");

const counts=deck=>Object.entries(deck.reduce((out,id)=>{
  out[id]=(out[id]||0)+1;return out;
},{})).sort(([a],[b])=>a.localeCompare(b));

/* 只有成熟的多套预设才允许保留（七星：衰减流 / 星联邦流；苏苏：俄布海 / 白俄罗斯铁壁）。
   其余卡牌师只留官方推荐那一套，第二套已撤下。 */
const MULTI_HEROES=new Set(["七星","苏苏"]);

for(const hero of Object.keys(Cards.PROFILES)){
  const presets=Cards.presets(hero);
  assert.ok(presets,`${hero} 缺少预设卡组`);
  const names=Object.keys(presets);
  assert.ok(names.length>=1,`${hero} 至少要有一套预设`);

  if(MULTI_HEROES.has(hero))assert.equal(names.length,2,`${hero} 应该有两套预设`);
  else assert.equal(names.length,1,`${hero} 只应保留官方推荐卡组，第二套尚未成型`);

  for(const name of names){
    const deck=Cards.presetDeck(hero,name);
    assert.equal(deck.length,Cards.DECK_SIZE,`${hero}：${name} 张数错误`);
    assert.equal(Cards.deckError(hero,deck),null,`${hero}：${name} 不合法`);
  }

  if(names.length===2)assert.notDeepEqual(counts(presets[names[0]]),counts(presets[names[1]]),`${hero} 的两套卡组不能相同`);

  /* aiDeck 必须落在预设集合里；把 Math.random 钉死后能稳定取到第一套 */
  const random=Math.random;
  try{
    Math.random=()=>0;
    assert.equal(Cards.aiDeck(hero),presets[names[0]],`${hero} aiDeck 取第一套`);
    Math.random=()=>.999;
    const last=presets[names[names.length-1]];
    assert.equal(Cards.aiDeck(hero),last,`${hero} aiDeck 取最后一套`);
  }finally{Math.random=random;}
}
console.log("预设卡组测试通过（七星两套，其余一套）");
