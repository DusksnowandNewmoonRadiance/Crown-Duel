/* 图鉴：人物档案 / 世界观 / 卡牌
   设定数据在 shared/lore.js（按需加载），来源见 docs/lore-source.html */
const Codex=(()=>{
  const C=window.DuelCards,V=CardView;
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const HEROES=Object.keys(C.PROFILES);
  const TIER_CLS={"顶尖":"t-top","第二":"t-2","第三":"t-3","第四":"t-4","旧大陆":"t-old","未知":"t-unk"};

  let L=null,host=null,bound=false,loading=null;
  let tab="people";
  const F={q:"",fac:new Set(),tier:new Set(),playable:false};
  const K={hero:new Set(),cost:new Set(),kind:new Set(),rar:new Set(),q:""};
  const FX=window.DuelCardFX;
  const COSTS=["0","1","2","3","4","5","6","7+"];

  function loadLore(){
    if(window.DuelLore){L=window.DuelLore;return Promise.resolve(L);}
    if(loading)return loading;
    loading=new Promise((res,rej)=>{
      const s=document.createElement("script");s.src="/shared/lore.js";
      s.onload=()=>{L=window.DuelLore;res(L);};
      s.onerror=()=>{loading=null;rej(new Error("设定数据加载失败，请检查网络后重试"));};
      document.head.appendChild(s);
    });
    return loading;
  }
  const isPlayable=id=>HEROES.includes(id);

  /* ============================================================
     人物
     ============================================================ */
  function passes(p){
    if(F.playable&&!isPlayable(p.id))return false;
    if(F.tier.size&&!F.tier.has(p.tier))return false;
    if(F.fac.size&&!p.factions.some(f=>F.fac.has(f)))return false;
    if(F.q){
      const hay=(p.name+" "+p.tag+" "+p.factions.join(" ")+" "+p.tier+" "+p.note+" "+p.look+" "+p.bg+" "+p.deck).toLowerCase();
      if(!hay.includes(F.q))return false;
    }
    return true;
  }
  function renderFilters(){
    const fm={},tm={};
    L.PEOPLE.forEach(p=>{p.factions.forEach(f=>fm[f]=(fm[f]||0)+1);tm[p.tier]=(tm[p.tier]||0)+1;});
    $("#cxFac").innerHTML=Object.keys(fm).sort((a,b)=>fm[b]-fm[a]||a.localeCompare(b,"zh"))
      .map(f=>`<button class="chip${F.fac.has(f)?" on":""}" data-f="${V.esc(f)}">${V.esc(f)} ${fm[f]}</button>`).join("");
    $("#cxTier").innerHTML=L.TIERS.filter(t=>tm[t]).map(t=>`<button class="chip ${TIER_CLS[t]}${F.tier.has(t)?" on":""}" data-t="${V.esc(t)}">${V.esc(t)} ${tm[t]}</button>`).join("")
      +`<button class="chip play${F.playable?" on":""}" data-p="1">只看可使用</button>`;
  }
  function renderPeople(){
    const list=L.PEOPLE.filter(passes);
    $("#cxCount").textContent=`${list.length} / ${L.PEOPLE.length} 人`;
    $("#cxGrid").innerHTML=list.map(p=>{
      const play=isPlayable(p.id);
      return`<button class="pcard${play?" play":""}" data-id="${V.esc(p.id)}"${play?` style="--hcr:${V.heroRgb(p.id)}"`:""}>
        <div class="pn">${V.esc(p.name)}${play?`<span class="tg act">可使用</span>`:""}</div>
        <div class="pt">${p.tag?V.esc(p.tag):'<span class="muted">未标注流派</span>'}</div>
        <div class="pf">${p.factions.map(f=>`<span>${V.esc(f)}</span>`).join("")}</div>
        <div class="pb"><span class="tier ${TIER_CLS[p.tier]||"t-unk"}">${V.esc(p.tier)}</span></div></button>`;
    }).join("")||`<div class="empty" style="grid-column:1/-1">没有匹配的人物</div>`;
  }
  const hl=t=>V.esc(t).replace(/【([^】]+)】/g,'<span class="nm">【$1】</span>');
  function openPerson(id){
    const p=L.byId[id];if(!p)return;
    const play=isPlayable(p.id);
    const deckTxt=p.deck.replace(/^卡组特色：/,"");
    $("#personBody").innerHTML=`
      <div class="ps-head"${play?` style="--hcr:${V.heroRgb(p.id)}"`:""}>
        <div><h2>${V.esc(p.name)}</h2>
          <div class="ps-meta"><span class="tier ${TIER_CLS[p.tier]||"t-unk"}">${V.esc(p.tier)}</span>${p.factions.map(f=>`<span class="fac">${V.esc(f)}</span>`).join("")}${play?`<span class="tg act">可使用</span>`:""}</div>
        </div>
      </div>
      ${p.note?`<div class="ps-note">${V.esc(p.note)}</div>`:""}
      <div class="ps-sec"><h3>外貌</h3><div class="ps-body">${p.look?hl(p.look):'<span class="muted">暂无记载</span>'}</div></div>
      <div class="ps-sec"><h3>背景</h3><div class="ps-body">${p.bg?hl(p.bg):'<span class="muted">暂无记载</span>'}</div></div>
      <div class="ps-sec"><h3>卡组</h3>${p.tag?`<div class="ps-tag">${hl(p.tag)}</div>`:""}<div class="ps-body">${deckTxt?hl(deckTxt):'<span class="muted">暂无记载</span>'}</div></div>
      ${play?`<div class="ps-acts"><button class="btn btn-gold" data-act="use">使用此卡牌师</button><button class="btn" data-act="deck">查看 / 编辑卡组</button></div>`:""}`;
    $("#mPerson").dataset.id=p.id;
    $("#mPerson").hidden=false;
    $("#mPerson .panel").scrollTop=0;
  }

  /* ============================================================
     世界观（Markdown 子集）
     ============================================================ */
  function inline(t){
    return V.esc(t).replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/【([^】]+)】/g,'<span class="nm">【$1】</span>');
  }
  function renderMarkdown(md){
    const out=[],stack=[],toc=[];let para=[],table=null;
    const flushPara=()=>{if(para.length){out.push("<p>"+para.map(inline).join("<br>")+"</p>");para=[];}};
    const endLists=()=>{while(stack.length)out.push("</li></"+stack.pop().type+">");};
    const flushTable=()=>{
      if(!table)return;
      const rows=table.filter(r=>!/^\s*\|?\s*:?-{2,}/.test(r));
      const cells=r=>r.trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim());
      out.push("<table><thead><tr>"+cells(rows[0]).map(c=>"<th>"+inline(c)+"</th>").join("")+"</tr></thead><tbody>"+
        rows.slice(1).map(r=>"<tr>"+cells(r).map(c=>"<td>"+inline(c)+"</td>").join("")+"</tr>").join("")+"</tbody></table>");
      table=null;
    };
    const flush=()=>{flushPara();endLists();flushTable();};
    md.split("\n").forEach(raw=>{
      const line=raw.replace(/\s+$/,"");
      if(/^\s*\|/.test(line)){flushPara();endLists();(table=table||[]).push(line);return;}
      flushTable();
      let m;
      if(!line.trim()){flushPara();endLists();return;}
      if(/^-{3,}$/.test(line.trim())){flush();out.push("<hr>");return;}
      if((m=line.match(/^(#{1,4})\s+(.*)$/))){
        flush();const lv=m[1].length,id="cx-"+toc.length;
        if(lv===2)toc.push({id,text:m[2]});
        out.push(`<h${lv} id="${id}">${inline(m[2])}</h${lv}>`);return;
      }
      if((m=line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/))){
        flushPara();
        const indent=m[1].length,type=/\d/.test(m[2])?"ol":"ul";
        while(stack.length&&stack[stack.length-1].indent>indent)out.push("</li></"+stack.pop().type+">");
        const top=stack[stack.length-1];
        if(!top||top.indent<indent){out.push(`<${type}><li>${inline(m[3])}`);stack.push({indent,type});}
        else out.push(`</li><li>${inline(m[3])}`);
        return;
      }
      endLists();para.push(line);
    });
    flush();
    return{html:out.join(""),toc};
  }
  let worldDone=false;
  function renderWorld(){
    if(worldDone)return;worldDone=true;
    const r=renderMarkdown(L.WORLD);
    $("#cxWorld").innerHTML=`<nav class="cx-toc">${r.toc.map(t=>`<a data-to="${t.id}">${V.esc(t.text)}</a>`).join("")}</nav><div class="cx-prose">${r.html}</div>`;
  }

  /* ============================================================
     卡牌：角色 / 花费 / 类型 / 稀有度 四个维度同时筛选
     同一维度内可多选（或），不同维度之间必须同时满足（且）
     ============================================================ */
  const costKey=c=>c.cost>=7?"7+":String(c.cost);
  let ALL=null;
  function allCards(){
    if(ALL)return ALL;
    ALL=[];
    HEROES.forEach(h=>C.PROFILES[h].cards.slice().sort((a,b)=>a.cost-b.cost||a.name.localeCompare(b.name,"zh")).forEach(c=>ALL.push({h,c})));
    return ALL;
  }
  const DIMS={
    hero:it=>it.h,
    cost:it=>costKey(it.c),
    kind:it=>it.c.kind,
    rar:it=>it.c.rarity
  };
  function matches(it,except){
    for(const d in DIMS){
      if(d===except||!K[d].size)continue;
      if(!K[d].has(DIMS[d](it)))return false;
    }
    const q=K.q.trim().toLowerCase();
    if(q&&!(it.c.name.toLowerCase().includes(q)||String(it.c.text||"").toLowerCase().includes(q)||String(it.c.flavor||"").toLowerCase().includes(q)))return false;
    return true;
  }
  function chip(dim,val,label,extra){
    // 数字 = 在其它维度条件不变时，选这一项会得到多少张
    const n=allCards().filter(it=>DIMS[dim](it)===val&&matches(it,dim)).length;
    const on=K[dim].has(val);
    return `<button class="chip${on?" on":""}${n===0&&!on?" zero":""}${extra||""}" data-d="${dim}" data-v="${V.esc(val)}">${V.esc(label)}<small>${n}</small></button>`;
  }
  function renderCards(){
    $("#cxFHero").innerHTML=HEROES.map(h=>chip("hero",h,h,"")).join("");
    $("#cxFCost").innerHTML=COSTS.map(c=>chip("cost",c,c==="7+"?"7+":c+" 费")).join("");
    $("#cxFKind").innerHTML=chip("kind","unit","单位")+chip("kind","spell","法术");
    $("#cxFRar").innerHTML=C.RARITY_ORDER.map(r=>chip("rar",r,C.RARITY[r].name+" · 上限 "+C.RARITY[r].limit," r-"+r)).join("");
    const items=allCards().filter(it=>matches(it,null));
    const active=["hero","cost","kind","rar"].some(d=>K[d].size)||K.q.trim();
    $("#cxCardCount").textContent=`共 ${items.length} 张${active?`（全部 ${allCards().length} 张）`:""}`;
    $("#cxReset").hidden=!active;
    $("#cxCards").innerHTML=items.length?items.map(({h,c})=>{
      const r=C.RARITY[c.rarity];
      const rec=FX&&FX.recipeFor(Object.assign({hero:h},c));
      return`<button class="cx-card" data-h="${V.esc(h)}" data-id="${V.esc(c.id)}">${V.card(Object.assign({hero:h},c))}
        <small><span class="rar r-${c.rarity}">${r?r.name:""}</span> 上限 ${c.limit}${rec?`<span class="fxm r-${c.rarity}">特效</span>`:""}</small></button>`;
    }).join(""):`<div class="empty" style="grid-column:1/-1">没有符合全部条件的卡牌，试试清除一些筛选</div>`;
  }

  /* ---- 卡牌详情 + 特效预览 ---- */
  let cvTimer=null;
  function openCard(h,id){
    const c=C.PROFILES[h].cards.find(x=>x.id===id);if(!c)return;
    const card=Object.assign({hero:h},c);
    const r=C.RARITY[c.rarity];
    const rec=FX&&FX.recipeFor(card);
    $("#cvCard").innerHTML=V.card(card);
    const notes=V.keywordNotes(card);
    let fx;
    if(!rec)fx=`<div class="muted small">这张卡没有专属的出牌特效${c.rarity==="special"?"（特殊卡里只有一部分带特效）":""}。</div>`;
    else if(rec.native)fx=`<div class="fx-line"><b>专属特效</b><span>沿用原有的专属动画，打出时自动播放。</span></div>`;
    else fx=`<div class="fx-line"><b>${c.rarity==="elite"?"专属特效":"通用特效"}</b><span>${V.esc(rec.label)}</span><button class="btn btn-primary" id="cvPlay">▶ 预览</button></div>
      <div class="fx-stage" id="cvStage"><div class="fx-inner fx-base" id="cvBase"></div><div class="fx-inner" id="cvLayer"></div></div>
      ${c.rarity==="special"?'<div class="muted small" style="margin-top:6px">通用特效：同一类效果的特殊卡会共用。</div>':'<div class="muted small" style="margin-top:6px">精英卡的特效各不相同。</div>'}`;
    $("#cvInfo").innerHTML=`<h2>${V.esc(c.name)}</h2>
      <div class="cv-meta"><span>${V.esc(h)}</span><span>${c.kind==="unit"?"单位":"法术"}</span><span>${c.cost} 费</span><span class="r-${c.rarity}">${r.name} · 携带上限 ${c.limit}</span></div>
      ${notes?`<div class="cv-sec"><h3>关键字</h3><div class="cv-notes">${notes}</div></div>`:""}
      <div class="cv-sec"><h3>出牌特效</h3>${fx}</div>`;
    $("#mCardView").hidden=false;
    $("#mCardView .panel").scrollTop=0;
    if(rec&&!rec.native){
      layoutPreview();
      $("#cvPlay").onclick=()=>playPreview(rec,card);
      setTimeout(()=>{if(!$("#mCardView").hidden)playPreview(rec,card);},350);
    }
  }
  function layoutPreview(){
    const st=$("#cvStage");if(!st)return;
    const s=st.clientWidth/1280;
    ["cvBase","cvLayer"].forEach(id=>{$("#"+id).style.transform=`scale(${s})`;});
    $("#cvBase").innerHTML=`
      <div class="ph" style="left:270px;top:50px;width:740px;height:200px">敌方战场</div>
      <div class="ph" style="left:270px;top:300px;width:740px;height:200px">我方战场</div>
      <div class="hero" style="left:118px;top:112px">敌</div>
      <div class="hero" style="left:118px;top:600px">我</div>`;
  }
  function playPreview(rec,card){
    const layer=$("#cvLayer");if(!layer)return;
    layer.innerHTML="";
    const T={foe:{x:118,y:112,w:112,h:112},me:{x:118,y:600,w:112,h:112},foeBoard:{x:640,y:150,w:740,h:200},meBoard:{x:640,y:400,w:740,h:200},center:{x:640,y:360,w:600,h:200}};
    CardFX.run(rec,{layer,W:1280,H:720,from:T.me,anchor:T[rec.target]||T.foe,name:card.name});
  }

  /* ============================================================
     事件 / 打开关闭
     ============================================================ */
  function setTab(t){
    tab=t;
    $$("#cxTabs button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
    $$("#scrCodex .cx-panel").forEach(p=>p.hidden=p.dataset.t!==t);
    if(t==="world")renderWorld();
    if(t==="cards")renderCards();
    if(t==="people"){renderFilters();renderPeople();}
  }
  function bind(){
    if(bound)return;bound=true;
    $("#cxTabs").addEventListener("click",e=>{const b=e.target.closest("button");if(b){Audio2.sfx("click");setTab(b.dataset.t);}});
    $("#cxQ").addEventListener("input",e=>{F.q=e.target.value.trim().toLowerCase();renderPeople();});
    $("#cxFac").addEventListener("click",e=>{
      const b=e.target.closest("button");if(!b)return;
      const f=b.dataset.f;F.fac.has(f)?F.fac.delete(f):F.fac.add(f);renderFilters();renderPeople();
    });
    $("#cxTier").addEventListener("click",e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.dataset.p){F.playable=!F.playable;}
      else{const t=b.dataset.t;F.tier.has(t)?F.tier.delete(t):F.tier.add(t);}
      renderFilters();renderPeople();
    });
    $("#cxGrid").addEventListener("click",e=>{const b=e.target.closest(".pcard");if(b){Audio2.sfx("select");openPerson(b.dataset.id);}});
    $("#mPerson").addEventListener("click",e=>{
      const m=$("#mPerson");
      if(e.target===m||e.target.closest("[data-close]")){m.hidden=true;return;}
      const a=e.target.closest("[data-act]");if(!a)return;
      const id=m.dataset.id;m.hidden=true;
      if(a.dataset.act==="use")host.useHero(id);
      else if(a.dataset.act==="deck")host.openDecks(id);
    });
    $("#cxWorld").addEventListener("click",e=>{
      const a=e.target.closest("a[data-to]");if(!a)return;
      const el=document.getElementById(a.dataset.to);if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
    });
    $("#cxFilters").addEventListener("click",e=>{
      const b=e.target.closest("button[data-d]");if(!b)return;
      const set=K[b.dataset.d],v=b.dataset.v;
      set.has(v)?set.delete(v):set.add(v);
      Audio2.sfx("click");renderCards();
    });
    $("#cxReset").addEventListener("click",()=>{["hero","cost","kind","rar"].forEach(d=>K[d].clear());K.q="";$("#cxCardQ").value="";renderCards();});
    $("#cxCardQ").addEventListener("input",e=>{K.q=e.target.value;renderCards();});
    $("#cxCards").addEventListener("click",e=>{const b=e.target.closest(".cx-card");if(b){Audio2.sfx("select");openCard(b.dataset.h,b.dataset.id);}});
    $("#mCardView").addEventListener("click",e=>{const m=$("#mCardView");if(e.target===m||e.target.closest("[data-close]"))m.hidden=true;});
    addEventListener("resize",()=>{if(!$("#mCardView").hidden)layoutPreview();});
    $("#codexBack").addEventListener("click",()=>close());
    document.addEventListener("keydown",e=>{
      if($("#scrCodex").hidden)return;
      if(e.key==="Escape"){
        if(!$("#mCardView").hidden)$("#mCardView").hidden=true;
        else if(!$("#mPerson").hidden)$("#mPerson").hidden=true;
        else close();
      }
    });
  }
  function close(){$("#mPerson").hidden=true;host.onClose();}
  /* opts: {person: 直接打开某个人物, tab} */
  async function open(hostApi,opts){
    host=hostApi;opts=opts||{};bind();
    try{await loadLore();}catch(e){host.toast(e.message);host.onClose();return;}
    setTab(opts.tab||"people");
    if(opts.person&&L.byId[opts.person])openPerson(opts.person);
  }
  return{open,close};
})();
