/* 卡牌外观（手牌、预览、卡组编辑器共用） */
const CardView=(()=>{
  const C=window.DuelCards;
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const rgbCache={};
  function rgb(hex){
    if(rgbCache[hex])return rgbCache[hex];
    const h=hex.replace("#","");const n=parseInt(h.length===3?h.split("").map(x=>x+x).join(""):h,16);
    return rgbCache[hex]=`${(n>>16)&255},${(n>>8)&255},${n&255}`;
  }
  const heroRgb=hero=>rgb(C.COLORS[hero]||"#e2b467");
  const glyph=n=>n==="045"?"045":String(n||"?")[0];
  /* 卡牌说明里的关键字加粗 */
  const KW_RE=/(无视嘲讽|【衰减】|【垃圾】|手牌上限|冲锋|嘲讽|部署|策反|亡语|限时|销毁|毁坏|污染|疲劳)/g;
  const richText=t=>esc(t).replace(KW_RE,"<b>$1</b>");

  /* 卡面由标准模板生成（src/ui/cardtemplate.ts → public/js/cardtemplate.js）。
     c: 卡牌数据（引擎实例或卡牌定义），opts: {cant} */
  function card(c,opts){return CardTemplate.render(c,opts);}
  function backInner(){return window.CardArt?CardArt.back():"";}
  function back(costUp){return`<div class="card-back${costUp?" up":""}">${backInner()}<span class="glyph">♛</span></div>`;}

  /* 预览时展示的关键字说明 */
  function keywordNotes(c){
    const K=C.KEYWORDS,out=[];
    if(c.charge)out.push(K.charge);
    if(c.taunt)out.push(K.taunt);
    if(c.ignoreTaunt)out.push(K.ignoreTaunt);
    if(c.untargetable)out.push(K.untargetable);
    if(c.strikes>1)out.push(K.strikes);
    if(/护甲/.test(c.text||""))out.push(K.armor);
    if(/销毁|毁坏|消灭.*计入已销毁/.test(c.text||""))out.push(K.destroyCard);
    if(/污染|变成【垃圾】/.test(c.text||"")||/whiteCorruptHand|whiteCorruptDeck|whiteDrawJunk5/.test(c.effect||""))out.push(K.pollute);
    if(/【垃圾】/.test(c.text||"")||c.id==="junk")out.push(K.junk);
    if(/疲劳/.test(c.text||""))out.push(K.fatigue);
    if(/手牌已满|手牌上限|满手牌/.test(c.text||""))out.push(K.overdraw);
    if(/【衰减】/.test(c.text||""))out.push(K.decay);
    if(/亡语/.test(c.text||"")||c.deathDmg>0)out.push(K.deathrattle);
    if(c.lifespan>0)out.push(K.fleeting);
    if(/出牌封锁|最多只能打出|无法打出法术/.test(c.text||""))out.push(K.lockCards);
    if(/部署/.test(c.text||""))out.push(K.deploy);
    if(/策反/.test(c.text||""))out.push(K.rebel);
    if(/俄布/.test(c.text||"")||(c.id==="red"&&c.hero==="苏苏"))out.push(K.red);
    if(c.gun||/火炮/.test(c.text||""))out.push(K.gun);
    if(c.member||/架子班成员/.test(c.text||""))out.push(K.member);
    if(/偷取/.test(c.text||""))out.push(K.stealMoney);
    if(/政体/.test(c.text||""))out.push(K.regime);
    if(/补给：/.test(c.text||""))out.push(K.supply);
    if(c.scrap||/废料/.test(c.text||""))out.push(K.scrap);
    if(/转化 d/.test(c.text||""))out.push(K.convert);
    if(c.recycle||/回收/.test(c.text||""))out.push(K.recycle);
    if(c.transfer||/引渡/.test(c.text||""))out.push(K.transfer);
    if(/整编/.test(c.text||""))out.push(K.consolidate);
    if(/权限/.test(c.text||""))out.push(K.permission);
    if(/情报/.test(c.text||""))out.push(K.intel);
    if(c.sealed)out.push({name:"已封存",desc:"情报部门封存了这张牌，在本回合无法打出。"});
    if(c.core)out.push(K.core);
    if(c.kind==="unit"&&c.fresh&&!c.charge)out.push({name:"刚部署",desc:"本回合不能攻击，下回合即可行动。"});
    if(c.stun>0)out.push({name:"眩晕",desc:"下个回合无法攻击。"});
    return out.map(k=>`<div><b>${esc(k.name)}</b>${esc(k.desc)}</div>`).join("");
  }
  return{esc,rgb,heroRgb,glyph,card,back,backInner,keywordNotes,richText};
})();
