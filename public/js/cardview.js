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

  function kwChips(c){
    let h="";
    if(c.charge)h+=`<i class="kw charge">冲锋</i>`;
    if(c.taunt)h+=`<i class="kw taunt">嘲讽</i>`;
    if(c.ignoreTaunt)h+=`<i class="kw pierce">无视嘲讽</i>`;
    if(c.untargetable)h+=`<i class="kw hide">隐匿</i>`;
    if(c.strikes>1)h+=`<i class="kw multi">连击</i>`;
    if(c.lifespan>0)h+=`<i class="kw multi">限时</i>`;
    if(c.core)h+=`<i class="kw core">核心</i>`;
    return h?`<div class="kws">${h}</div>`:"";
  }
  /* c: 卡牌数据（引擎实例或卡牌定义），opts: {cant} */
  function card(c,opts){
    // 数据兜底：任何 null / undefined / 缺 id 或 kind 的对象都渲染成占位卡，
    // 不抛异常，避免把整个手牌区（及对局流程）拖死。
    if(!c||c.id===undefined||c.kind===undefined){
      return '<div class="card k-spell r-common"><span class="cost">?</span>'+
        '<div class="art"><span class="glyph">?</span></div>'+
        '<div class="nm">数据缺失</div>'+
        '<div class="tx">这张卡的数据异常，请刷新页面</div></div>';
    }
    opts=opts||{};
    const atk=c.attack!==undefined?c.attack:c.atk,hp=c.health!==undefined?c.health:c.hp,maxHp=c.maxHealth!==undefined?c.maxHealth:c.hp;
    const base=c.baseCost!==undefined?c.baseCost:c.cost;
    const def=c.hero&&C.cardDef(c.hero,c.id);
    const cls=["card","k-"+c.kind];
    if(opts.cant)cls.push("cant");
    if(c.cost>base)cls.push("costup");else if(c.cost<base)cls.push("costdown");
    if(c.core)cls.push("core");
    if(c.owner==="awa")cls.push("awa");
    const rar=C.RARITY&&C.RARITY[c.rarity]?c.rarity:"";
    if(rar)cls.push("r-"+rar);
    let stats="";
    if(c.kind==="unit"){
      const baseAtk=def?def.atk:atk;
      stats=`<div class="stats"><b class="stat atk${atk>baseAtk?" buff":""}">${atk}</b><b class="stat hp${hp<maxHp?" dmg":(def&&maxHp>def.hp?" buff":"")}">${hp}</b></div>`;
    }
    const rep=c.rep&&C.REGIMES?C.REGIMES[c.rep]:"";
    const tag=c.scrap?"废料":c.gun?"火炮":c.member?"架子班":(c.id==="red"&&c.hero==="苏苏")?"俄布":(rep&&c.hero==="苏苏"?rep:c.hero);
    const type=(c.owner==="awa"?"awa · 法术":(c.kind==="unit"?"单位":"法术")+(tag?" · "+esc(tag):""))
      +(rar?` · <span class="rar r-${rar}">${C.RARITY[rar].name}</span>`:"");
    const gem=rar?`<i class="gem r-${rar}" title="${C.RARITY[rar].name}"></i>`:"";
    const body=richText(c.text)+(c.flavor?`<i class="flv">${esc(c.flavor)}</i>`:"");
    /* 长描述自动降一档字号，避免在 9.5px 的卡池/预览里被裁成半句；悬停仍可看完整文本 */
    const txLen=String(c.text||"").length;
    const txCls=txLen>66?"tx tx-xs":txLen>44?"tx tx-s":"tx";
    /* 卡面插画：程序化 SVG（见 cardart.js），glyph 只作为兜底文字保留 */
    const artwork=window.CardArt?CardArt.art(c):"";
    return`<div class="${cls.join(" ")}" style="--hcr:${heroRgb(c.hero)}">${kwChips(c)}<span class="cost">${c.cost}</span><div class="art">${artwork}<span class="glyph">${esc(c.art)}</span></div><div class="nm">${esc(c.name)}</div><div class="type">${type}</div><div class="${txCls}" title="${esc(c.text||"")}">${body}</div>${gem}${stats}</div>`;
  }
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
