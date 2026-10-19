/* 卡组：本地存储（每个玩家最多 30 个卡组）+ 完整的卡组页面
   数据保存在浏览器 localStorage 里；「导出卡组代码」可以用来备份或分享 */
const Decks=(()=>{
  const C=window.DuelCards,V=CardView;
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  /* 卡牌师池要动态取：DIY 角色是 app.js 在 decks.js 之后才注册进来的。
     - allHeroes()：全部（原版 + 已注册的 DIY）
     - vanillaHeroes()：只要原版（单人练习 / 原版房间用）
     - isDiyHero(h)：是不是 DIY 角色（卡组页要给它加 DIY 标签） */
  const DiyApi=()=>window.DuelDiy||null;
  const allHeroes=()=>Object.keys(C.PROFILES);
  const isDiyHero=h=>{const d=DiyApi();return !!(d&&h&&d.isDiy(h));};
  const vanillaHeroes=()=>allHeroes().filter(h=>!isDiyHero(h));
  const MAX_DECKS=30,NAME_MAX=16,KEY="cd.decks.v2";
  const b64=s=>btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const unb64=s=>{if(!/^[A-Za-z0-9_-]+$/.test(s))throw new Error("卡组代码已损坏");let b=s.replace(/-/g,"+").replace(/_/g,"/");while(b.length%4)b+="=";return decodeURIComponent(escape(atob(b)));};
  const alphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const checksum=s=>{let n=0;for(let i=0;i<s.length;i++)n=(n*33+s.charCodeAt(i))%3844;return alphabet[Math.floor(n/62)]+alphabet[n%62];};
  function decodePairs(hero,pairs,meta,legacy){
    const diyMap=new Map(C.PROFILES[hero].diy&&Array.isArray(meta.m)?meta.m.filter(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==="string"&&typeof x[1]==="string"):[]);
    const knownIds=new Set(C.PROFILES[hero].cards.map(c=>c.id));
    const cards=[],length=pairs.length/2;
    for(let i=0;i<length;i++){
      const pair=pairs.slice(i*2,i*2+2);
      const id=diyMap.get(pair)||(legacy?C.legacyCardFromCode(hero,pair):C.cardFromCode(hero,pair));
      if(id&&knownIds.has(id))cards.push(id);
    }
    return{cards:cards.slice(0,C.DECK_SIZE),dropped:length-cards.length};
  }

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
        /* 这里不再按 C.PROFILES 过滤：DIY 角色要等 app.js 注册后才存在，
           过早过滤会把玩家给 DIY 角色组的卡组直接丢掉。未知角色的卡组先留着，
           不显示、也不参与出战；真被删掉的角色在 refresh() 里再清。 */
        d.list=d.list.filter(x=>x&&typeof x.id==="string"&&typeof x.hero==="string"&&Array.isArray(x.cards)).slice(0,MAX_DECKS)
          .map(x=>({id:x.id,hero:x.hero,name:cleanName(x.name)||"未命名卡组",cards:x.cards.filter(c=>typeof c==="string"),updatedAt:+x.updatedAt||0}));
        d.active=d.active&&typeof d.active==="object"?d.active:{};
        return d;
      }
    }catch(e){}
    /* 迁移旧版：每个卡牌师一个卡组 */
    const d={v:2,list:[],active:{}};
    for(const h of allHeroes()){
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

  /* ============================================================
     云端同步：登录后卡组跟着账号走（未登录完全走本地，不报错）
     - 首次 load 拉一次服务端数据，按卡组 updatedAt 逐条取较新后合并，再推回去
     - 本地改动后防抖 1.5s 推送，失败静默重试一次
     ============================================================ */
  const SYNC={state:"local",timer:0,busy:false};
  const syncToken=()=>{try{return localStorage.getItem("cd.token")||"";}catch(e){return"";}};
  function syncState(s){
    SYNC.state=s;
    const el=(typeof document!=="undefined"&&document.getElementById)?document.getElementById("dkSync"):null;
    if(!el)return;
    el.textContent={synced:"已同步",syncing:"同步中…",error:"同步失败（仅本地）",local:"仅本地（未登录）"}[s]||"";
    el.dataset.s=s;
  }
  function ensureSyncBadge(){
    if(typeof document==="undefined"||!document.getElementById||document.getElementById("dkSync"))return;
    const cnt=document.getElementById("dkCount");
    const host=cnt&&cnt.parentElement;
    if(!host)return;
    const el=document.createElement("span");
    el.id="dkSync";el.className="muted small";el.style.marginLeft="8px";
    host.appendChild(el);syncState(SYNC.state);
  }
  function mergeRemote(remote){
    if(!remote||!Array.isArray(remote.list))return false;
    let changed=false;
    const byId=new Map(data.list.map(d=>[d.id,d]));
    for(const rd of remote.list){
      if(!rd||typeof rd.id!=="string"||typeof rd.hero!=="string"||!Array.isArray(rd.cards))continue;
      const rec={id:rd.id,hero:rd.hero,name:cleanName(rd.name)||"未命名卡组",
        cards:rd.cards.filter(x=>typeof x==="string"),updatedAt:+rd.updatedAt||0};
      const cur=byId.get(rec.id);
      if(!cur){if(data.list.length<MAX_DECKS){data.list.push(rec);byId.set(rec.id,rec);changed=true;}}
      else if(rec.updatedAt>(+cur.updatedAt||0)){Object.assign(cur,rec);changed=true;}
    }
    if(remote.active&&typeof remote.active==="object"){
      for(const h in remote.active){
        if(typeof remote.active[h]==="string"&&!data.active[h]){data.active[h]=remote.active[h];changed=true;}
      }
    }
    if(changed)persist();
    return changed;
  }
  async function syncPull(){
    const t=syncToken();
    if(!t||typeof fetch!=="function"){syncState("local");return;}
    syncState("syncing");
    try{
      const r=await fetch("/api/decks?token="+encodeURIComponent(t),{cache:"no-store"});
      const j=await r.json();
      if(!j||!j.ok){syncState("local");return;}
      mergeRemote(j.decks);
      syncState("synced");
      scheduleSync(0);                       // 合并结果写回服务端
      const scr=(typeof document!=="undefined"&&document.getElementById)?document.getElementById("scrDecks"):null;
      if(scr&&!scr.hidden&&typeof renderAll==="function")renderAll();
    }catch(e){syncState("error");}
  }
  function scheduleSync(delay){
    if(!syncToken())return;
    clearTimeout(SYNC.timer);
    SYNC.timer=setTimeout(()=>syncPush(),delay===undefined?1500:delay);
  }
  async function syncPush(){
    const t=syncToken();
    if(!t||typeof fetch!=="function"){syncState("local");return;}
    if(SYNC.busy)return;
    SYNC.busy=true;syncState("syncing");
    let ok=false;
    for(let i=0;i<2&&!ok;i++){
      try{
        const r=await fetch("/api/decks?token="+encodeURIComponent(t),{
          method:"PUT",headers:{"content-type":"application/json"},
          body:JSON.stringify({decks:{v:2,list:data.list,active:data.active}})
        });
        const j=await r.json();ok=!!(j&&j.ok);
      }catch(e){}
      if(!ok&&i===0)await new Promise(r=>setTimeout(r,900));
    }
    SYNC.busy=false;syncState(ok?"synced":"error");
  }
  ensureSyncBadge();
  syncState(syncToken()?"syncing":"local");
  syncPull();

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
    /* DIY 角色注册/注销之后由 app.js 调用：清掉真被删掉的角色、修正当前选择、必要时重画 */
    refresh(){
      const live=new Set(allHeroes());
      /* app.js 会把「服务端当前知道的 DIY 名字」放在这个全局集合里：
         还没拉到卡表的角色先留着卡组，只有服务端确认删掉的才清 */
      const known=window.__cdDiyNames;
      const keep=d=>live.has(d.hero)||!!(known&&known.has(d.hero));
      const before=data.list.length;
      data.list=data.list.filter(keep);
      for(const h of Object.keys(data.active)){if(!keep({hero:h}))delete data.active[h];}
      if(data.list.length!==before){persist();scheduleSync();}
      const list=allHeroes();
      if(!hero||!list.includes(hero))hero=vanillaHeroes()[0]||list[0]||null;
      if(W&&!list.includes(W.hero))W=null;
      const scr=$("#scrDecks");
      if(host&&scr&&!scr.hidden)renderAll();
      return true;
    },
    setActive(h,id){
      if(!id||String(id).startsWith("default:"))delete data.active[h];else data.active[h]=id;
      persist();scheduleSync();
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
      persist();scheduleSync();return rec;
    },
    remove(id){
      const d=data.list.find(x=>x.id===id);if(!d)return;
      data.list=data.list.filter(x=>x.id!==id);
      if(data.active[d.hero]===id)delete data.active[d.hero];
      persist();scheduleSync();
    },
    /* CD3：卡牌师编号 + 名称 + 师内卡牌编号 + 校验码；旧 CD1/CD2 仍可导入。 */
    encode(d){
      if(!C.PROFILES[d.hero]||!Array.isArray(d.cards))throw new Error("卡组格式错误");
      const heroCode=C.heroCode(d.hero);
      if(!heroCode)throw new Error("卡牌师没有编号");
      const used=new Map();
      const pairs=d.cards.map(id=>{
        const code=C.cardCode(d.hero,id);
        if(!code)throw new Error("卡组包含已不存在的卡牌，请先移除再导出");
        used.set(code,id);return code;
      }).join("");
      const meta={n:cleanName(d.name)};
      if(C.PROFILES[d.hero].diy){meta.h=d.hero;meta.m=[...used].map(([code,id])=>[code,id]);}
      const body=heroCode+"."+b64(JSON.stringify(meta))+"."+pairs;
      return"CD3."+body+"."+checksum(body);
    },
    /* 只取英雄名：用于导入前判断「本机还没有这个 DIY 角色」 */
    peekHero(code){
      try{
        let b=String(code||"").trim();
        if(b.startsWith("CD3.")){
          const parts=b.slice(4).split(".");
          if(parts.length!==4)return null;
          const meta=JSON.parse(unb64(parts[1]));
          return C.heroFromCode(parts[0],meta.h);
        }
        if(!/^CD[12]\./.test(b))return null;
        const meta=b.startsWith("CD2.")?b.slice(4).split(".")[0]:b.slice(4);
        const o=JSON.parse(unb64(meta));
        return o&&typeof o.h==="string"?o.h:null;
      }catch(e){return null;}
    },
    decode(code){
      code=String(code||"").trim();
      if(code.startsWith("CD3.")){
        const parts=code.slice(4).split(".");
        if(parts.length!==4||!/^[A-Za-z0-9]{2}$/.test(parts[0])||parts[2].length%2||!/^[A-Za-z0-9]*$/.test(parts[2])||parts[3]!==checksum(parts.slice(0,3).join(".")))throw new Error("卡组代码已损坏");
        let meta;try{meta=JSON.parse(unb64(parts[1]));}catch(e){throw new Error("卡组代码已损坏");}
        const hero=C.heroFromCode(parts[0],meta&&meta.h);
        if(!hero||!C.PROFILES[hero]||typeof meta.n!=="string")throw new Error("卡组代码已损坏");
        return{hero,name:cleanName(meta.n)||"导入的卡组",...decodePairs(hero,parts[2],meta,false)};
      }
      if(code.startsWith("CD2.")){
        const parts=code.slice(4).split(".");
        if(parts.length!==3||parts[1].length%2||!/^[A-Za-z0-9]*$/.test(parts[1])||parts[2]!==checksum(parts[0]+"."+parts[1]))throw new Error("卡组代码已损坏");
        let o;try{o=JSON.parse(unb64(parts[0]));}catch(e){throw new Error("卡组代码已损坏");}
        if(!o||typeof o.h!=="string"||!C.PROFILES[o.h]||typeof o.n!=="string")throw new Error("卡组代码已损坏");
        return{hero:o.h,name:cleanName(o.n)||"导入的卡组",...decodePairs(o.h,parts[1],o,true)};
      }
      if(!code.startsWith("CD1."))throw new Error("不是有效的卡组代码");
      let o;try{o=JSON.parse(unb64(code.slice(4)));}catch(e){throw new Error("卡组代码已损坏");}
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
  let hero=null,kind="all",cost="all",rar="all",keyword="all",query="",tab="pool";

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
    /* 原版在前，DIY 在后（带 DIY 标签）；当前选中的角色如果已被删除，回退到第一个原版角色 */
    const list=allHeroes();
    if(hero&&!list.includes(hero))hero=vanillaHeroes()[0]||list[0]||null;
    const btn=h=>{
      const n=api.list(h).length;
      return`<button class="${h===hero?"on":""}" data-h="${V.esc(h)}" style="--hcr:${V.heroRgb(h)}"><span class="g">${V.esc(V.glyph(h))}</span><b>${V.esc(h)}</b><code class="dk-hero-code" title="卡牌师编号">${V.esc(C.heroCode(h)||"")}</code>${isDiyHero(h)?`<em class="diy-tag">DIY</em>`:""}${n?`<i>${n}</i>`:""}</button>`;
    };
    $("#dkHeroes").innerHTML=vanillaHeroes().map(btn).join("")+list.filter(isDiyHero).map(btn).join("");
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
      if(keyword!=="all"&&!V.keywordKeys(c).includes(keyword))return false;
      if(q&&!(c.name.toLowerCase().includes(q)||String(c.text||"").toLowerCase().includes(q)||String(c.flavor||"").toLowerCase().includes(q)||String(C.cardCode(hero,c.id)||"").toLowerCase()===q))return false;
      return true;
    }).sort((a,b)=>a.cost-b.cost||(a.kind<b.kind?1:-1)||a.name.localeCompare(b.name,"zh"));
  }
  function renderPool(){
    const counts={};cardsOf(hero).forEach(c=>V.keywordKeys(c).forEach(key=>counts[key]=(counts[key]||0)+1));
    $("#dkKeyword").innerHTML='<option value="all">全部词条</option>'+Object.entries(C.KEYWORDS).filter(([key])=>counts[key]).map(([key,word])=>`<option value="${V.esc(key)}">${V.esc(word.name)}（${counts[key]}）</option>`).join("");
    if(keyword!=="all"&&!counts[keyword])keyword="all";
    $("#dkKeyword").value=keyword;
    $$("#dkKind button").forEach(b=>b.classList.toggle("on",b.dataset.v===kind));
    $$("#dkCost button").forEach(b=>b.classList.toggle("on",b.dataset.v===cost));
    $$("#dkRar button").forEach(b=>b.classList.toggle("on",b.dataset.v===rar));
    const list=filtered();
    const full=W.cards.length>=C.DECK_SIZE;
    $("#dkCards").innerHTML=list.length?list.map(c=>{
      const n=countOf(c.id),atLimit=n>=c.limit;
      return`<div class="dc${n?"":" zero"}" data-id="${V.esc(c.id)}">${V.card(Object.assign({hero},c))}<span class="dc-code" title="卡牌编号">${V.esc(C.cardCode(hero,c.id)||"")}</span>
        <div class="dc-ctrl"><button data-a="-" ${n<=0?"disabled":""} aria-label="减少">−</button><span>${n}<small> / ${c.limit}</small></span><button data-a="+" ${atLimit||full?"disabled":""} aria-label="增加">＋</button></div></div>`;
    }).join(""):`<div class="empty" style="grid-column:1/-1">没有符合条件的卡牌</div>`;
  }
  function openCardPreview(id){
    const c=cardsOf(W.hero).find(x=>x.id===id);if(!c)return;
    const card=Object.assign({hero:W.hero},c),rarity=C.RARITY[c.rarity],notes=V.keywordNotes(card);
    $("#dkPreviewCard").innerHTML=V.card(card);
    $("#dkPreviewInfo").innerHTML=`<h2>${V.esc(c.name)}</h2><div class="meta">
      <span>代码 ${V.esc(C.cardCode(W.hero,c.id)||"—")}</span><span>${V.esc(rarity?rarity.name:c.rarity)}</span>
      <span>${c.kind==="unit"?"单位":"法术"}</span><span>${c.cost} 费</span><span>阵营 ${V.esc(C.PROFILES[W.hero].faction||W.hero)}</span>
      ${c.kind==="unit"?`<span>攻击 ${c.atk} / 生命 ${c.hp}</span>`:""}<span>携带上限 ${c.limit}</span></div>
      <h3>效果</h3><p>${V.richText(c.text||"无")}</p>
      ${c.flavor?`<h3>描述</h3><p>${V.esc(c.flavor)}</p>`:""}
      ${notes?`<h3>词条说明</h3><div class="cv-notes">${notes}</div>`:""}`;
    $("#mDeckCard").hidden=false;
    $("#mDeckCard .panel").scrollTop=0;
  }
  function closeCardPreview(){$("#mDeckCard").hidden=true;}
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
      <i class="cost">${c.cost}</i><span class="nm r-${c.rarity}">${V.esc(c.name)}</span><code class="dk-card-code">${V.esc(C.cardCode(W.hero,c.id)||"")}</code><b>×${cnt[c.id]}</b>
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
  /* 导入前补注册：分享过来的卡组可能用了本机还没拉到的 DIY 角色 */
  async function ensureHero(hero){
    if(!hero||C.PROFILES[hero])return true;
    const D=window.DuelDiy;
    if(!D)return false;
    try{
      const r=await fetch("/api/diy/heroes/"+encodeURIComponent(hero));
      if(!r.ok)return false;
      const j=await r.json();
      const v=D.validate(j.hero,{allowReplace:hero});
      if(!v.ok)return false;
      const reg=D.register(v.def,{author:(j.meta&&j.meta.author)||"玩家",builtin:!!(j.meta&&j.meta.builtin)});
      if(!reg.ok)return false;
      if(typeof window.refreshAfterDiy==="function")window.refreshAfterDiy();
      return true;
    }catch(e){return false;}
  }
  async function importCode(){
    const code=window.prompt("粘贴卡组代码：");
    if(!code)return;
    try{
      const hero=api.peekHero(code);
    if(hero&&!C.PROFILES[hero]){
      const ok=await ensureHero(hero);
      if(!ok){host.toast("这个卡组用了本机没有的 DIY 角色「"+hero+"」，请先让房主/服主上传该角色",false);return;}
    }
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
    $("#dkKeyword").addEventListener("change",e=>{keyword=e.target.value;renderPool();});
    $("#dkCards").addEventListener("click",e=>{
      const row=e.target.closest(".dc");if(!row)return;
      const b=e.target.closest("button[data-a]");
      if(b){if(b.disabled)return;b.dataset.a==="-"?sub(row.dataset.id):add(row.dataset.id);return;}
      if(e.target.closest(".card")||e.target.closest(".dc-code"))openCardPreview(row.dataset.id);
    });
    $("#dkItems").addEventListener("click",e=>{
      const b=e.target.closest("button[data-a]");const row=e.target.closest(".dk-row");if(!row)return;
      if(b){if(!b.disabled)(b.dataset.a==="-"?sub(row.dataset.id):add(row.dataset.id));return;}
      openCardPreview(row.dataset.id);
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
    $("#mDeckCard").addEventListener("click",e=>{if(e.target===$("#mDeckCard")||e.target.closest("[data-close]"))closeCardPreview();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#mDeckCard").hidden)closeCardPreview();});
    window.addEventListener("beforeunload",e=>{if(W&&W.dirty&&!$("#scrDecks").hidden){e.preventDefault();e.returnValue="";}});
  }

  async function close(force){
    closeCardPreview();
    if(!force&&!(await guard()))return;
    W=null;host.onClose();
  }
  /* h: 初始选中的卡牌师；deckId: 可选，直接打开某个卡组 */
  function open(h,hostApi,deckId){
    host=hostApi;bind();
    /* 传进来的角色可能刚被删（DIY 角色），回退到原版，别让 PROFILES[h] 取空崩掉 */
    if(!h||!C.PROFILES[h])h=vanillaHeroes()[0]||allHeroes()[0];
    const d=deckId&&api.get(deckId);
    if(d)startWork(d);else pickInitial(h);
    kind="all";cost="all";rar="all";keyword="all";query="";$("#dkSearch").value="";tab="pool";
    renderAll();
  }
  return Object.assign(api,{open,close,get dirty(){return!!(W&&W.dirty);}});
})();
