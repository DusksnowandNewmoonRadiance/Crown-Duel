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
  const KW_RE=/(冲锋|无视嘲讽|嘲讽|部署|策反)/g;
  const richText=t=>esc(t).replace(KW_RE,"<b>$1</b>");

  function kwChips(c){
    let h="";
    if(c.charge)h+=`<i class="kw charge">冲锋</i>`;
    if(c.taunt)h+=`<i class="kw taunt">嘲讽</i>`;
    if(c.ignoreTaunt)h+=`<i class="kw pierce">无视嘲讽</i>`;
    if(c.untargetable)h+=`<i class="kw hide">隐匿</i>`;
    if(c.strikes>1)h+=`<i class="kw multi">连击</i>`;
    if(c.core)h+=`<i class="kw core">核心</i>`;
    return h?`<div class="kws">${h}</div>`:"";
  }
  /* c: 卡牌数据（引擎实例或卡牌定义），opts: {cant} */
  function card(c,opts){
    opts=opts||{};
    const atk=c.attack!==undefined?c.attack:c.atk,hp=c.health!==undefined?c.health:c.hp,maxHp=c.maxHealth!==undefined?c.maxHealth:c.hp;
    const base=c.baseCost!==undefined?c.baseCost:c.cost;
    const def=c.hero&&C.cardDef(c.hero,c.id);
    const cls=["card","k-"+c.kind];
    if(opts.cant)cls.push("cant");
    if(c.cost>base)cls.push("costup");else if(c.cost<base)cls.push("costdown");
    if(c.core)cls.push("core");
    if(c.owner==="awa")cls.push("awa");
    let stats="";
    if(c.kind==="unit"){
      const baseAtk=def?def.atk:atk;
      stats=`<div class="stats"><b class="stat atk${atk>baseAtk?" buff":""}">${atk}</b><b class="stat hp${hp<maxHp?" dmg":(def&&maxHp>def.hp?" buff":"")}">${hp}</b></div>`;
    }
    const tag=c.gun?"火炮":c.member?"架子班":(c.id==="red"&&c.hero==="苏苏")?"俄布":c.hero;
    const type=c.owner==="awa"?"awa · 法术":(c.kind==="unit"?"单位":"法术")+(tag?" · "+esc(tag):"");
    const body=richText(c.text)+(c.flavor?`<i class="flv">${esc(c.flavor)}</i>`:"");
    return`<div class="${cls.join(" ")}" style="--hcr:${heroRgb(c.hero)}">${kwChips(c)}<span class="cost">${c.cost}</span><div class="art"><span>${esc(c.art)}</span></div><div class="nm">${esc(c.name)}</div><div class="type">${type}</div><div class="tx">${body}</div>${stats}</div>`;
  }
  function back(costUp){return`<div class="card-back${costUp?" up":""}">♛</div>`;}

  /* 预览时展示的关键字说明 */
  function keywordNotes(c){
    const K=C.KEYWORDS,out=[];
    if(c.charge)out.push(K.charge);
    if(c.taunt)out.push(K.taunt);
    if(c.ignoreTaunt)out.push(K.ignoreTaunt);
    if(c.untargetable)out.push(K.untargetable);
    if(c.strikes>1)out.push(K.strikes);
    if(/部署/.test(c.text||""))out.push(K.deploy);
    if(/策反/.test(c.text||""))out.push(K.rebel);
    if(/俄布/.test(c.text||"")||(c.id==="red"&&c.hero==="苏苏"))out.push(K.red);
    if(c.gun||/火炮/.test(c.text||""))out.push(K.gun);
    if(c.member||/架子班成员/.test(c.text||""))out.push(K.member);
    if(/偷取/.test(c.text||""))out.push(K.stealMoney);
    if(c.core)out.push(K.core);
    if(c.kind==="unit"&&c.fresh&&!c.charge)out.push({name:"刚部署",desc:"本回合不能攻击，下回合即可行动。"});
    if(c.stun>0)out.push({name:"眩晕",desc:"下个回合无法攻击。"});
    return out.map(k=>`<div><b>${esc(k.name)}</b>${esc(k.desc)}</div>`).join("");
  }
  return{esc,rgb,heroRgb,glyph,card,back,keywordNotes,richText};
})();
