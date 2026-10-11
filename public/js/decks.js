/* 卡组：本地存储（每个玩家最多 30 个卡组）+ 完整的卡组页面
   数据保存在浏览器 localStorage 里；「导出卡组代码」可以用来备份或分享 */
const Decks=(()=>{
  const C=window.DuelCards,V=CardView;
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const HEROES=Object.keys(C.PROFILES);
  const MAX_DECKS=30,NAME_MAX=16,KEY="cd.decks.v2";

  /* ============================================================
     存储
     ============================================================ */
  let data=null;
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const cleanName=s=>String(s==null?"":s).replace(/[\u0000-\u001f\u007f<>]/g,"").trim().slice(0,NAME_MAX);
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){}}
  function load(){
    try{
      const d=JSON.parse(localStorage.getItem(KEY)||"null");
      if(d&&d.v===2&&Array.isArray(d.list)){
        d.list=d.list.filter(x=>x&&typeof x.id==="string"&&C.PROFILES[x.hero]&&Array.isArray(x.cards)).slice(0,MAX_DECKS)
          .map(x=>({id:x.id,hero:x.hero,name:cleanName(x.name)||"未命名卡组",cards:x.cards.filter(c=>typeof c==="string"),updatedAt:+x.updatedAt||0}));
        d.active=d.active&&typeof d.active==="object"?d.active:{};
        return d;
      }
    }catch(e){}
    /* 迁移旧版：每个卡牌师一个卡组 */
    const d={v:2,list:[],active:{}};
    for(const h of HEROES){
      try{
        const old=JSON.parse(localStorage.getItem("cd.deck."+h)||"null");
        if(Array.isArray(old)&&old.every(id=>C.PROFILES[h].cards.some(c=>c.id===id))&&old.length>0){
          const id=uid();d.list.push({id,hero:h,name:h+"·我的卡组",cards:old,updatedAt:Date.now()});
          if(!C.deckError(h,old))d.active[h]=id;
        }
      }catch(e){}
    }
    return d;
  }
  data=load();

  const virtualDeck=h=>({id:"default:"+h,hero:h,name:"官方推荐",cards:C.defaultDeck(h),virtual:true});
  const api={
    MAX:MAX_DECKS,NAME_MAX,
    count:()=>data.list.length,
    list:h=>data.list.filter(d=>!h||d.hero===h),
    get:id=>id&&String(id).startsWith("default:")?(C.PROFILES[id.slice(8)]?virtualDeck(id.slice(8)):null):data.list.find(d=>d.id===id)||null,
    error:d=>C.deckError(d.hero,d.cards),
    /* 当前出战卡组：用户指定且合法的，否则官方推荐 */
    active(h){
      const d=data.list.find(x=>x.id===data.active[h]&&x.hero===h);
      return d&&!C.deckError(h,d.cards)?d:virtualDeck(h);
    },
    activeCards:h=>api.active(h).cards.slice(),
    setActive(h,id){
      if(!id||String(id).startsWith("default:"))delete data.active[h];else data.active[h]=id;
      persist();
    },
    isActive:d=>api.active(d.hero).id===d.id,
    save(d){
      const name=cleanName(d.name);
      if(!name)throw new Error("请给卡组起个名字");
      if(!C.PROFILES[d.hero])throw new Error("卡牌师不存在");
      const cards=d.cards.filter(id=>C.PROFILES[d.hero].cards.some(c=>c.id===id)).slice(0,C.DECK_SIZE);
      let rec=d.id&&data.list.find(x=>x.id===d.id);
      if(rec){rec.name=name;rec.cards=cards;rec.updatedAt=Date.now();}
      else{
        if(data.list.length>=MAX_DECKS)throw new Error(`最多保存 ${MAX_DECKS} 个卡组，请先删除不用的卡组`);
        rec={id:uid(),hero:d.hero,name,cards,updatedAt:Date.now()};data.list.push(rec);
      }
      persist();return rec;
    },
    remove(id){
      const d=data.list.find(x=>x.id===id);if(!d)return;
      data.list=data.list.filter(x=>x.id!==id);
      if(data.active[d.hero]===id)delete data.active[d.hero];
      persist();
    },
    /* 导出 / 导入：CD1.<base64url(json)> */
    encode(d){
      const json=JSON.stringify({h:d.hero,n:d.name,c:d.cards});
      return"CD1."+btoa(unescape(encodeURIComponent(json))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    },
    decode(code){
      code=String(code||"").trim();
      if(!code.startsWith("CD1."))throw new Error("不是有效的卡组代码");
      let o;
      try{
        let b=code.slice(4).replace(/-/g,"+").replace(/_/g,"/");while(b.length%4)b+="=";
        o=JSON.parse(decodeURIComponent(escape(atob(b))));
      }catch(e){throw new Error("卡组代码已损坏");}
      if(!o||!C.PROFILES[o.h]||!Array.isArray(o.c))throw new Error("卡组代码已损坏");
      const known=o.c.filter(id=>C.PROFILES[o.h].cards.some(c=>c.id===id));
      return{hero:o.h,name:cleanName(o.n)||"导入的卡组",cards:known.slice(0,C.DECK_SIZE),dropped:o.c.length-known.length};
    }
  };

  /* ============================================================
     页面
     ============================================================ */
  let host=null;                 // {toast, confirm, onClose, onChange}
  let W=null;                    // 正在编辑的卡组 {id,hero,name,cards,virtual,dirty}
  let hero=null,kind="all",cost="all",rar="all",query="",tab="pool";

  const stateOf=d=>{
    const err=C.deckError(d.hero,d.cards);
    return{err,ok:!err,n:d.cards.length};
  };
  const cardsOf=h=>C.PROFILES[h].cards;
  const countOf=id=>W.cards.filter(x=>x===id).length;

  function startWork(d,opts){
    opts=opts||{};
    hero=d.hero;
    // 游戏更新后可能删除了某些卡牌：自动清理并提示，避免卡组里出现删不掉的“幽灵卡”
    const known=new Set(cardsOf(d.hero).map(c=>c.id));
    const valid=d.cards.filter(id=>known.has(id));
    const removed=d.cards.length-valid.length;
    W={id:opts.fresh?null:d.id,hero:d.hero,name:d.name,cards:valid,virtual:!!d.virtual,dirty:!!opts.dirty||removed>0};
    if(removed>0&&host)setTimeout(()=>host.toast(`有 ${removed} 张卡牌在游戏更新后已不存在，已从卡组中移除，请补全后保存`),0);
  }
  function loadDefault(h){startWork(virtualDeck(h));}
  function pickInitial(h){
    const a=api.active(h);
    startWork(a);
  }
  /* 修改官方卡组时自动变成一个新的、未保存的卡组 */
  function touch(){
    if(W.virtual){
      W.virtual=false;W.id=null;W.name=W.hero+"卡组";
      host.toast("已基于官方卡组创建新卡组，记得点「保存」",true);
    }
    W.dirty=true;
  }
  async function guard(){
    if(!W||!W.dirty)return true;
    return host.confirm("放弃修改？","当前卡组有尚未保存的修改，离开后会丢失。","放弃修改");
  }

  /* ---------- 渲染 ---------- */
  function renderAll(){
    $("#dkQuota").textContent=`卡组 ${api.count()} / ${MAX_DECKS}`;
    $("#dkQuota").classList.toggle("full",api.count()>=MAX_DECKS);
    renderHeroes();renderList();renderPool();renderCurrent();
    $("#dkTabs").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===tab));
    $("#scrDecks").dataset.tab=tab;
  }
  function renderHeroes(){
    $("#dkHeroes").innerHTML=HEROES.map(h=>{
      const n=api.list(h).length;
      return`<button class="${h===hero?"on":""}" data-h="${V.esc(h)}" style="--hcr:${V.heroRgb(h)}"><span class="g">${V.esc(V.glyph(h))}</span><b>${V.esc(h)}</b>${n?`<i>${n}</i>`:""}</button>`;
    }).join("");
  }
  function badge(d,isCur){
    if(d.virtual)return`<span class="tg off">官方</span>`;
    const s=stateOf(d);
    return(api.isActive(d)?`<span class="tg act">★ 出战</span>`:"")+(s.ok?"":`<span class="tg warn">${s.n===C.DECK_SIZE?"需调整":"未完成"}</span>`);
  }
  function renderList(){
    const rows=[];
    const off=virtualDeck(hero);
    rows.push(rowHTML(off,W&&W.virtual&&W.hero===hero,true));
    api.list(hero).sort((a,b)=>b.updatedAt-a.updatedAt).forEach(d=>rows.push(rowHTML(d,W&&W.id===d.id,false)));
    if(W&&W.hero===hero&&!W.virtual&&W.id===null)
      rows.unshift(`<div class="dk-item on draft"><div class="t"><b>${V.esc(W.name||"未命名")}</b><span class="tg warn">未保存</span></div><small>${W.cards.length} / ${C.DECK_SIZE} 张</small></div>`);
    $("#dkList").innerHTML=rows.join("");
  }
  function rowHTML(d,on,virtual){
    const live=on&&W&&!W.virtual?W:null;
    const n=live?W.cards.length:d.cards.length;
    const temp=virtual?{...d}:{...d,cards:d.cards};
    return`<button class="dk-item${on?" on":""}" data-id="${V.esc(d.id)}"><div class="t"><b>${V.esc(d.name)}${on&&W&&W.dirty&&!virtual?" *":""}</b>${badge(temp)}${virtual&&api.active(hero).id===d.id?`<span class="tg act">★ 出战</span>`:""}</div><small>${n} / ${C.DECK_SIZE} 张</small></button>`;
  }
  function filtered(){
    const q=query.trim().toLowerCase();
    return cardsOf(hero).filter(c=>{
      if(kind!=="all"&&c.kind!==kind)return false;
      if(cost!=="all"&&(cost==="6"?c.cost<6:c.cost!==+cost))return false;
      if(rar!=="all"&&c.rarity!==rar)return false;
      if(q&&!(c.name.toLowerCase().includes(q)||String(c.text||"").toLowerCase().includes(q)||String(c.flavor||"").toLowerCase().includes(q)))return false;
      return true;
    }).sort((a,b)=>a.cost-b.cost||(a.kind<b.kind?1:-1)||a.name.localeCompare(b.name,"zh"));
  }
  function renderPool(){
    $$("#dkKind button").forEach(b=>b.classList.toggle("on",b.dataset.v===kind));
    $$("#dkCost button").forEach(b=>b.classList.toggle("on",b.dataset.v===cost));
    $$("#dkRar button").forEach(b=>b.classList.toggle("on",b.dataset.v===rar));
    const list=filtered();
    const full=W.cards.length>=C.DECK_SIZE;
    $("#dkCards").innerHTML=list.length?list.map(c=>{
      const n=countOf(c.id),atLimit=n>=c.limit;
      return`<div class="dc${n?"":" zero"}" data-id="${V.esc(c.id)}">${V.card(Object.assign({hero},c))}
        <div class="dc-ctrl"><button data-a="-" ${n<=0?"disabled":""} aria-label="减少">−</button><span>${n}<small> / ${c.limit}</small></span><button data-a="+" ${atLimit||full?"disabled":""} aria-label="增加">＋</button></div></div>`;
    }).join(""):`<div class="empty" style="grid-column:1/-1">没有符合条件的卡牌</div>`;
  }
  function renderCurrent(){
    const name=$("#dkName");
    if(document.activeElement!==name)name.value=W.name;
    name.disabled=false;
    const s=stateOf(W);
    const dc=$("#dkCount");dc.className="deck-count "+(s.ok?"ok":(s.n>C.DECK_SIZE?"bad":""));
    dc.innerHTML=`${s.n}<small> / ${C.DECK_SIZE}</small>`;
    const cards=cardsOf(W.hero);
    const curve=[0,0,0,0,0,0,0,0];let units=0,spells=0;
    W.cards.forEach(id=>{const c=cards.find(x=>x.id===id);if(!c)return;curve[Math.min(7,c.cost)]++;if(c.kind==="unit")units++;else spells++;});
    const mx=Math.max(1,...curve);
    $("#dkCurve").innerHTML=curve.map((n,i)=>`<div><b>${n||""}</b><i style="height:${n/mx*70}%"></i>${i===7?"7+":i}</div>`).join("");
    $("#dkMix").innerHTML=`<span>单位<b>${units}</b></span><span>法术<b>${spells}</b></span>`;
    const st=$("#dkStatus");
    if(W.virtual){st.className="dk-status";st.textContent="这是官方推荐卡组。修改任意卡牌会自动创建你的副本。";}
    else if(s.ok){st.className="dk-status ok";st.textContent=W.dirty?"卡组合法，记得保存":"卡组合法，可以出战";}
    else{st.className="dk-status err";st.textContent=s.err;}
    // 卡组内容
    const cnt={};W.cards.forEach(id=>cnt[id]=(cnt[id]||0)+1);
    const rows=Object.keys(cnt).map(id=>cards.find(c=>c.id===id)).filter(Boolean).sort((a,b)=>a.cost-b.cost||a.name.localeCompare(b.name,"zh"));
    $("#dkItems").innerHTML=rows.length?rows.map(c=>`<div class="dk-row" data-id="${V.esc(c.id)}" title="${V.esc(c.text||c.flavor||"")}">
      <i class="cost">${c.cost}</i><span class="nm r-${c.rarity}">${V.esc(c.name)}</span><b>×${cnt[c.id]}</b>
      <button data-a="-" aria-label="减少">−</button><button data-a="+" ${cnt[c.id]>=c.limit||W.cards.length>=C.DECK_SIZE?"disabled":""} aria-label="增加">＋</button></div>`).join("")
      :`<div class="muted small" style="padding:14px 4px;text-align:center">还没有卡牌，点击中间的卡牌添加</div>`;
    // 按钮状态
    const saved=!W.virtual&&W.id!==null;
    $("#dkSave").disabled=W.virtual||!W.dirty;
    $("#dkActive").disabled=W.virtual?api.active(W.hero).virtual:(!saved||W.dirty||!s.ok||api.isActive(W));
    $("#dkActive").textContent=W.virtual?(api.active(W.hero).virtual?"★ 出战中":"设为出战"):(saved&&api.isActive(W)?"★ 出战中":"设为出战");
    $("#dkSaveAs").disabled=W.virtual&&false;
    $("#dkDelete").disabled=!saved;
    $("#dkSaveAs").textContent=W.virtual?"复制副本":"另存为";
    $("#dkTabs").querySelector('[data-t="deck"]').textContent=`我的卡组 ${s.n}/${C.DECK_SIZE}`;
  }

  /* ---------- 操作 ---------- */
  function add(id){
    const c=cardsOf(W.hero).find(x=>x.id===id);if(!c)return;
    if(countOf(id)>=c.limit){host.toast(`【${c.name}】最多携带 ${c.limit} 张`);return;}
    if(W.cards.length>=C.DECK_SIZE){host.toast(`卡组已满 ${C.DECK_SIZE} 张`);return;}
    touch();W.cards.push(id);Audio2.sfx("click");renderAll();
  }
  function sub(id){
    const i=W.cards.lastIndexOf(id);if(i<0)return;
    touch();W.cards.splice(i,1);Audio2.sfx("click");renderAll();
  }
  function save(){
    try{
      if(W.virtual)return;
      const wasNew=W.id===null;
      const rec=api.save(W);
      W.id=rec.id;W.name=rec.name;W.dirty=false;
      let extra="";
      const s=stateOf(rec);
      if(s.ok&&api.active(rec.hero).virtual){api.setActive(rec.hero,rec.id);extra="，并设为出战卡组";}
      else if(!s.ok)extra=`（还差 ${Math.max(0,C.DECK_SIZE-s.n)} 张，凑满 ${C.DECK_SIZE} 张才能出战）`;
      host.toast(`已保存「${rec.name}」${extra}`,s.ok);
      Audio2.sfx("select");host.onChange();renderAll();
    }catch(e){host.toast(e.message);}
  }
  function saveAs(){
    try{
      const base=W.virtual?W.hero+"卡组":W.name;
      const rec=api.save({id:null,hero:W.hero,name:(base+" 副本").slice(0,NAME_MAX),cards:W.cards});
      startWork(rec);
      host.toast(`已创建「${rec.name}」`,true);Audio2.sfx("select");host.onChange();renderAll();
    }catch(e){host.toast(e.message);}
  }
  async function del(){
    if(W.virtual||W.id===null)return;
    if(!(await host.confirm("删除卡组？",`确定要删除「${W.name}」吗？此操作无法撤销。`,"删除")))return;
    api.remove(W.id);host.toast("已删除",true);
    pickInitial(hero);host.onChange();renderAll();
  }
  function setActive(){
    try{
      if(W.virtual){api.setActive(W.hero,null);}
      else{
        const s=stateOf(W);
        if(W.id===null||W.dirty)return host.toast("请先保存卡组");
        if(!s.ok)return host.toast(s.err);
        api.setActive(W.hero,W.id);
      }
      host.toast(`出战卡组：${W.name}`,true);Audio2.sfx("select");host.onChange();renderAll();
    }catch(e){host.toast(e.message);}
  }
  function autoFill(){
    touch();
    const cards=cardsOf(W.hero).slice().sort((a,b)=>a.cost-b.cost);
    let guard=0;
    while(W.cards.length<C.DECK_SIZE&&guard++<200){
      const c=cards.find(x=>countOf(x.id)<x.limit);if(!c)break;W.cards.push(c.id);
    }
    renderAll();
  }
  async function newDeck(){
    if(api.count()>=MAX_DECKS)return host.toast(`最多保存 ${MAX_DECKS} 个卡组，请先删除不用的卡组`);
    if(!(await guard()))return;
    W={id:null,hero,name:"新卡组",cards:[],virtual:false,dirty:true};
    renderAll();$("#dkName").focus();$("#dkName").select();
  }
  async function exportCode(){
    const code=api.encode(W);
    try{await navigator.clipboard.writeText(code);host.toast("卡组代码已复制，可以发给朋友或自己备份",true);}
    catch(e){window.prompt("复制这段卡组代码：",code);}
  }
  async function importCode(){
    const code=window.prompt("粘贴卡组代码：");
    if(!code)return;
    try{
      const d=api.decode(code);
      if(!(await guard()))return;
      startWork({hero:d.hero,name:d.name,cards:d.cards},{fresh:true,dirty:true});
      renderAll();
      host.toast(d.dropped?`已导入（${d.dropped} 张卡牌已不存在，被忽略），记得保存`:"已导入，记得保存",!d.dropped);
    }catch(e){host.toast(e.message);}
  }

  /* ---------- 事件 ---------- */
  let bound=false;
  function bind(){
    if(bound)return;bound=true;
    $("#dkHeroes").addEventListener("click",async e=>{
      const b=e.target.closest("button");if(!b||b.dataset.h===hero)return;
      if(!(await guard()))return;
      hero=b.dataset.h;pickInitial(hero);renderAll();
    });
    $("#dkList").addEventListener("click",async e=>{
      const b=e.target.closest(".dk-item");if(!b||b.classList.contains("draft"))return;
      const d=api.get(b.dataset.id);if(!d)return;
      if(W&&(W.id===d.id||(W.virtual&&d.virtual)))return;
      if(!(await guard()))return;
      startWork(d);if(window.matchMedia("(max-width:900px)").matches)tab="deck";renderAll();
    });
    $("#dkNew").addEventListener("click",newDeck);
    $("#dkImport").addEventListener("click",importCode);
    $("#dkSearch").addEventListener("input",e=>{query=e.target.value;renderPool();});
    $("#dkKind").addEventListener("click",e=>{const b=e.target.closest("button");if(b){kind=b.dataset.v;renderPool();}});
    $("#dkCost").addEventListener("click",e=>{const b=e.target.closest("button");if(b){cost=b.dataset.v;renderPool();}});
    $("#dkRar").addEventListener("click",e=>{const b=e.target.closest("button");if(b){rar=b.dataset.v;renderPool();}});
    $("#dkCards").addEventListener("click",e=>{
      const row=e.target.closest(".dc");if(!row)return;
      const b=e.target.closest("button[data-a]");
      if(b){if(b.disabled)return;b.dataset.a==="-"?sub(row.dataset.id):add(row.dataset.id);return;}
      if(e.target.closest(".card"))add(row.dataset.id);
    });
    $("#dkItems").addEventListener("click",e=>{
      const b=e.target.closest("button[data-a]");const row=e.target.closest(".dk-row");if(!b||!row||b.disabled)return;
      b.dataset.a==="-"?sub(row.dataset.id):add(row.dataset.id);
    });
    $("#dkName").addEventListener("input",e=>{
      const v=e.target.value.replace(/[<>]/g,"").slice(0,NAME_MAX);
      if(W.virtual){touch();}
      W.name=v;W.dirty=true;
      renderList();$("#dkSave").disabled=false;
    });
    $("#dkName").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.target.blur();}});
    $("#dkSave").addEventListener("click",save);
    $("#dkSaveAs").addEventListener("click",saveAs);
    $("#dkDelete").addEventListener("click",del);
    $("#dkActive").addEventListener("click",setActive);
    $("#dkClear").addEventListener("click",()=>{if(!W.cards.length)return;touch();W.cards=[];renderAll();});
    $("#dkFill").addEventListener("click",autoFill);
    $("#dkExport").addEventListener("click",exportCode);
    $("#dkTabs").addEventListener("click",e=>{const b=e.target.closest("button");if(b){tab=b.dataset.t;renderAll();}});
    $("#decksBack").addEventListener("click",()=>close());
    window.addEventListener("beforeunload",e=>{if(W&&W.dirty&&!$("#scrDecks").hidden){e.preventDefault();e.returnValue="";}});
  }

  async function close(force){
    if(!force&&!(await guard()))return;
    W=null;host.onClose();
  }
  /* h: 初始选中的卡牌师；deckId: 可选，直接打开某个卡组 */
  function open(h,hostApi,deckId){
    host=hostApi;bind();
    const d=deckId&&api.get(deckId);
    if(d)startWork(d);else pickInitial(h);
    kind="all";cost="all";rar="all";query="";$("#dkSearch").value="";tab="pool";
    renderAll();
  }
  return Object.assign(api,{open,close,get dirty(){return!!(W&&W.dirty);}});
})();
