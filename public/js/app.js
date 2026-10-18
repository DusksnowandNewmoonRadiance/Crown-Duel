/* 应用外壳：主页、单人练习、卡组编辑、联机大厅与房间 */
(()=>{
"use strict";
const C=window.DuelCards,E=window.DuelEngine,A=window.DuelAI,V=CardView;
const Diy=window.DuelDiy,DiyBuiltin=window.DuelDiyBuiltin;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* 内置示例角色（苍蓝）先注册，之后 HEROES 才是纯原版池 */
if(Diy&&DiyBuiltin)for(const raw of DiyBuiltin.heroes||[]){
  /* 内置角色允许私有机制，必须走 builtin 通道 */
  const v=Diy.validate(raw,{builtin:true,allowReplace:raw&&raw.name});
  if(v.ok)Diy.register(v.def,{builtin:true,author:"官方示例"});
  else console.warn("内置 DIY 角色不可用：",raw&&raw.name,(v.errors||[]).join("；"));
}
/* 原版池：单人练习 / 卡组 / 图鉴 / AI 随机对手都只用这一份 */
const HEROES=Object.keys(C.PROFILES).filter(h=>!Diy.isDiy(h));
const isDiyHero=h=>!!(Diy&&Diy.isDiy(h));
/* 当前已注册的 DIY 角色（会随 diy:list 增加/减少） */
const diyHeroes=()=>Diy.names().filter(h=>C.PROFILES[h]);
const store={
  get(k,d){try{const v=localStorage.getItem("cd."+k);return v===null?d:v;}catch(e){return d;}},
  set(k,v){try{localStorage.setItem("cd."+k,v);}catch(e){}},
  del(k){try{localStorage.removeItem("cd."+k);}catch(e){}}
};

/* ============================================================
   通用
   ============================================================ */
function toast(msg,info,ms){const t=$("#toast");t.textContent=msg;t.className="on"+(info?" info":"");clearTimeout(t._t);t._t=setTimeout(()=>t.className="",ms||2000);}
function show(id){
  ["#scrHome","#scrLobby","#scrRoom","#scrDecks","#scrCodex","#scrShop","#scrVault","#scrCampaign","#scrDiy","#scrGame"].forEach(s=>$(s).hidden=s!==id);
  document.body.classList.toggle("in-game",id==="#scrGame");   // 对局中关掉整屏装饰层（不用 :has，避免整页样式失效）
  if(id==="#scrGame")GameUI.fit();
  if(id==="#scrHome"||id==="#scrLobby"||id==="#scrRoom"||id==="#scrDecks"||id==="#scrCodex"||id==="#scrShop"||id==="#scrVault"||id==="#scrCampaign"||id==="#scrDiy")Audio2.music("menu");
}
function openModal(id){$(id).hidden=false;}
function closeModal(id){$(id).hidden=true;}
$$(".modal").forEach(m=>{
  m.addEventListener("click",e=>{if(e.target===m&&m.id!=="mMatch")m.hidden=true;if(e.target.closest("[data-close]"))m.hidden=true;});
});
/* 手机软键盘：让应用外壳和弹窗跟随可视区域收缩，并把当前输入框滚入可见区。 */
(()=>{
  const vv=window.visualViewport,root=document.documentElement;
  let focused=null,scrollTimer=0;
  const mobile=()=>matchMedia("(max-width: 900px)").matches;
  function sync(){
    if(!mobile()||!focused){root.classList.remove("keyboard-open");return;}
    const h=vv?vv.height:window.innerHeight,top=vv?vv.offsetTop:0;
    root.style.setProperty("--vv-height",`${Math.max(180,h)}px`);
    root.style.setProperty("--vv-top",`${Math.max(0,top)}px`);
    root.classList.add("keyboard-open");
    clearTimeout(scrollTimer);
    scrollTimer=setTimeout(()=>{
      if(!focused||document.activeElement!==focused)return;
      const r=focused.getBoundingClientRect(),viewTop=vv?vv.offsetTop:0,viewBottom=viewTop+(vv?vv.height:window.innerHeight);
      if(r.top<viewTop+12||r.bottom>viewBottom-18)focused.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"});
    },180);
  }
  document.addEventListener("focusin",e=>{
    if(e.target.matches("input:not([type=checkbox]),textarea,[contenteditable=true]")){focused=e.target;sync();}
  });
  document.addEventListener("focusout",e=>{
    if(e.target===focused){focused=null;setTimeout(()=>{if(!document.activeElement.matches("input:not([type=checkbox]),textarea,[contenteditable=true]")){root.classList.remove("keyboard-open");root.style.removeProperty("--vv-height");root.style.removeProperty("--vv-top");}else{focused=document.activeElement;sync();}},120);}
  });
  window.addEventListener("resize",sync);
  if(vv){vv.addEventListener("resize",sync);vv.addEventListener("scroll",sync);}
})();
function confirmBox(title,text,yes){
  return new Promise(res=>{
    $("#cfTitle").textContent=title;$("#cfText").textContent=text;$("#cfYes").textContent=yes||"确定";
    openModal("#mConfirm");
    const done=v=>{closeModal("#mConfirm");$("#cfYes").onclick=$("#cfNo").onclick=null;res(v);};
    $("#cfYes").onclick=()=>done(true);$("#cfNo").onclick=()=>done(false);
  });
}
/* 卡牌师徽章：程序化 SVG 头像（cardart.js），不可用时退回字形 */
const crestArt=(hero)=>window.CardArt?CardArt.portrait(hero):V.esc(V.glyph(hero));
const crest=(hero,cls)=>`<span class="crest ${cls||""}" style="--hcr:${V.heroRgb(hero)}">${crestArt(hero)}</span>`;
const stars=n=>"★".repeat(n)+"☆".repeat(3-n);

/* ============================================================
   个人设置：昵称 / 卡牌师 / 卡组
   ============================================================ */
const Me={
  get nick(){return store.get("nick","");},
  set nick(v){store.set("nick",v);},
  get hero(){const h=store.get("hero","苏苏");return C.PROFILES[h]?h:"苏苏";},
  set hero(v){store.set("hero",v);},
  deck(h){return Decks.activeCards(h);},
  deckName(h){return Decks.active(h).name;},
  get cid(){let c=store.get("cid","");if(!/^[A-Za-z0-9_-]{8,64}$/.test(c)){c=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9-]/g,"");store.set("cid",c);}return c;}
};

/* ============================================================
   账号系统：登录 / 注册 / 金币 / 仓库 / 剧情存档
   ============================================================ */
const Account={
  token:store.get("token",""),
  me:null,
  async api(path,body){
    const b=Object.assign({},body||{});
    if(this.token&&!b.token)b.token=this.token;
    /* GET 请求把 token 放在查询串里（服务端 tok() 同时支持 body/query） */
    const qs=body?"":(b.token?"?token="+encodeURIComponent(b.token):"");
    const r=await fetch("/api"+path+qs,{method:body?"POST":"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(b):undefined});
    try{return await r.json();}catch(e){return{ok:false,msg:"网络错误"};}
  },
  async refresh(){
    if(!this.token){this.me=null;renderGold();renderHome();return;}
    const r=await this.api("/me");
    if(r.ok&&r.me){this.me=r.me;renderGold();renderHome();}
    else{this.token="";store.del("token");this.me=null;renderGold();renderHome();}
  },
  async login(user,pass){
    const r=await this.api("/auth/login",{user,pass});
    if(r.ok){this.token=r.token;this.me=r.me;store.set("token",r.token);renderGold();renderHome();return{ok:true};}
    return r;
  },
  async register(user,pass,nick,email){
    const r=await this.api("/auth/register",{user,pass,nick,email});
    if(r.ok){this.token=r.token;this.me=r.me;store.set("token",r.token);renderGold();renderHome();return{ok:true};}
    return r;
  },
  async logout(){
    await this.api("/auth/logout",{});
    this.token="";store.del("token");this.me=null;renderGold();renderHome();
  },
  get gold(){return this.me?this.me.gold:0;}
};
function renderGold(){
  const g=Account.gold;
  const coin=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-coin"/></svg>`;
  $("#homeGold").hidden=!Account.me;
  $("#homeGold").innerHTML=coin+g;
  const gp=$("#shopGold");if(gp)gp.innerHTML=coin+g;
  const gv=$("#vaultGold");if(gv)gv.innerHTML=coin+g;
  const gc=$("#campGold");if(gc)gc.innerHTML=coin+g;
  const a=$("#homeAuthTxt"),d=$("#homeAuth");
  if(a&&d){a.textContent=Account.me?(Account.me.nick||Account.me.user):"登录";d.title=Account.me?"退出登录":"登录/注册";}
  const hb=$("#homeBind");
  if(hb)hb.hidden=!(Account.me&&!Account.me.email);
}
/* 登录弹窗：login / register / forgot 三模式 */
let authMode="login",forgotCode="";
function authShow(){
  const login=authMode==="login";
  const forgot=authMode==="forgot";
  $("#authTitle").textContent=forgot?"找回密码":(login?"登录":"注册");
  $("#authSwitch").hidden=forgot;
  $("#authSwitch").textContent=login?"没有账号？注册":"已有账号？登录";
  $("#authGo").textContent=forgot?(forgotCode?"重置密码":"发送验证码"):(login?"登录":"注册");
  $("#authUserField").hidden=forgot;
  $("#authPassField").hidden=forgot&&!forgotCode;
  $("#authNickField").hidden=login||forgot;
  $("#authEmailField").hidden=!forgot&&!login;
  $("#authCodeField").hidden=!(forgot&&forgotCode);
  $("#authForgot").hidden=!login;
  if(!forgot||!forgotCode)$("#authPass").placeholder="至少 4 位";
  $("#authPass").type=forgot?"password":"password";
  $("#authMsg").textContent="";
}
function openAuth(){
  authMode="login";forgotCode="";
  authShow();
  openModal("#mAuth");
}
$("#homeAuth").addEventListener("click",()=>{if(Account.me){confirmBox("退出登录","确定要退出当前账号吗？","退出").then(ok=>{if(ok)Account.logout();});}else openAuth();});
$("#authSwitch").addEventListener("click",()=>{
  authMode=authMode==="login"?"register":"login";forgotCode="";
  authShow();
});
$("#authForgot").addEventListener("click",()=>{authMode="forgot";forgotCode="";authShow();$("#authEmail").focus();});
$("#authGo").addEventListener("click",async()=>{
  const user=$("#authUser").value.trim(),pass=$("#authPass").value,nick=$("#authNick").value.trim(),
        email=$("#authEmail").value.trim(),code=$("#authCode").value.trim();
  $("#authMsg").textContent="";
  if(authMode==="forgot"){
    if(!forgotCode){
      const r=await Account.api("/auth/forgot",{email});
      if(r.ok){forgotCode=r.code;$("#authMsg").textContent="验证码已发送（开发模式直接显示）："+r.code;authShow();}
      else $("#authMsg").textContent=r.msg||"发送失败";
    }else{
      const r=await Account.api("/auth/reset",{email,code,pass});
      if(r.ok){toast("密码已重置，请用新密码登录",true);authMode="login";forgotCode="";authShow();}
      else $("#authMsg").textContent=r.msg||"重置失败";
    }
    return;
  }
  const r=authMode==="login"?await Account.login(user,pass):await Account.register(user,pass,nick,email);
  if(r.ok){closeModal("#mAuth");toast("欢迎回来，"+(Account.me.nick||Account.me.user),true);renderHome();}
  else $("#authMsg").textContent=r.msg||"操作失败";
});
$("#authUser").addEventListener("keydown",e=>{if(e.key==="Enter")$("#authGo").click();});
$("#authPass").addEventListener("keydown",e=>{if(e.key==="Enter")$("#authGo").click();});
/* 绑定邮箱（登录后主页出现入口） */
$("#homeBind").addEventListener("click",()=>{if(!Account.me){openAuth();return;}$("#bindEmail").value="";$("#bindMsg").textContent="";openModal("#mBindEmail");});
$("#bindGo").addEventListener("click",async()=>{
  const email=$("#bindEmail").value.trim();
  const r=await Account.api("/auth/bindEmail",{email});
  if(r.ok){Account.me=Object.assign({},Account.me,{email:r.email});closeModal("#mBindEmail");renderHome();toast("邮箱绑定成功",true);}
  else $("#bindMsg").textContent=r.msg||"绑定失败";
});

/* ============================================================
   主页
   ============================================================ */
function heroTile(h,on){
  const info=C.HERO_INFO[h]||{difficulty:2,title:"",tip:""},p=C.PROFILES[h]||{faction:"",style:""};
  const diy=isDiyHero(h);
  const idx=diy?"":String(HEROES.indexOf(h)+1).padStart(2,"0");
  return`<button class="htile${on?" on":""}" data-hero="${V.esc(h)}" style="--hcr:${V.heroRgb(h)}"><span class="htile-art">${crest(h)}</span><span class="htile-veil"></span>${idx?`<span class="htile-no">${idx}</span>`:""}${info.difficulty===1?`<span class="badge">新手推荐</span>`:""}<span class="htile-tx"><strong>${V.esc(h)}${diy?' <i class="diy-tag">DIY</i>':''}</strong><small>${V.esc(info.title||p.faction)}</small><span class="stars" title="上手难度">${diy?"玩家自制":stars(info.difficulty)}</span></span></button>`;
}
function deckSelectHTML(h){
  const act=Decks.active(h).id;
  const opts=[{id:"default:"+h,name:"官方推荐"}].concat(Decks.list(h).filter(d=>!Decks.error(d)).sort((a,b)=>b.updatedAt-a.updatedAt));
  return`<select id="homeDeck">${opts.map(d=>`<option value="${V.esc(d.id)}"${d.id===act?" selected":""}>${V.esc(d.name)}</option>`).join("")}</select>`;
}
function renderHome(){
  const cur=Me.hero;
  $("#heroGrid").innerHTML=HEROES.map(h=>heroTile(h,h===cur)).join("");
  const p=C.PROFILES[cur]||{faction:"",style:"",hp:"-"},info=C.HERO_INFO[cur]||{difficulty:2,title:p.faction||"",tip:""};
  const d=$("#heroDetail");d.style.setProperty("--hcr",V.heroRgb(cur));
  d.innerHTML=`<div class="hd-top">${crest(cur)}<div class="hd-id"><div class="hd-k">${V.esc(p.faction)} · ${V.esc(p.style)}</div><h3>${V.esc(cur)}${isDiyHero(cur)?' <i class="diy-tag">DIY</i>':''}<small>${V.esc(info.title)}</small></h3></div><div class="hd-nums"><div class="hd-n"><b>${p.hp}</b><span>生命</span></div><div class="hd-n"><b class="st">${stars(info.difficulty)}</b><span>难度</span></div></div></div>
    <p class="tip">${V.esc(info.tip)}</p>
    <div class="deck-pick"><label for="homeDeck">出战卡组</label>${deckSelectHTML(cur)}<button class="btn" id="homeDeckEdit">管理卡组</button><button class="btn" id="homeLore">查看档案</button></div>`;
  $("#homeNickTxt").innerHTML=Cosmetics.nameHTML(Me.nick||"设置昵称",Account.me);
  $("#homeSound").classList.toggle("off",!Audio2.musicOn&&!Audio2.sfxOn);
}
$("#heroGrid").addEventListener("click",e=>{const b=e.target.closest(".htile");if(!b)return;Me.hero=b.dataset.hero;Audio2.sfx("select");renderHome();});
$("#heroDetail").addEventListener("change",e=>{
  if(e.target.id!=="homeDeck")return;
  Decks.setActive(Me.hero,e.target.value);Audio2.sfx("select");Net.profile();
  toast("出战卡组：「"+Me.deckName(Me.hero)+"」",true);
});
$("#heroDetail").addEventListener("click",e=>{
  if(e.target.closest("#homeDeckEdit"))openDecks(Me.hero);
  else if(e.target.closest("#homeLore"))openCodex({person:Me.hero});
});
$("#btnCodex").addEventListener("click",()=>openCodex());
$("#homeNick").addEventListener("click",()=>askNick());
$("#homeSound").addEventListener("click",()=>{const on=!(Audio2.musicOn||Audio2.sfxOn);Audio2.setSfx(on);Audio2.setMusic(on);if(on)Audio2.music("menu");toast(on?"声音已开启":"声音已关闭",true);renderHome();});
$("#btnRules").addEventListener("click",()=>openModal("#mRules"));
$("#btnShop").addEventListener("click",()=>{if(!Account.me){toast("请先登录",false);openAuth();return;}renderShop();show("#scrShop");});
$("#btnVault").addEventListener("click",()=>{if(!Account.me){toast("请先登录",false);openAuth();return;}renderVault();show("#scrVault");});
$("#btnCampaign").addEventListener("click",()=>{if(!Account.me){toast("请先登录",false);openAuth();return;}renderCampaign();show("#scrCampaign");});
$("#shopBack").addEventListener("click",()=>{show("#scrHome");renderHome();});
$("#vaultBack").addEventListener("click",()=>{show("#scrHome");renderHome();});
$("#campBack").addEventListener("click",()=>{show("#scrHome");renderHome();});
$("#rulesCoach").addEventListener("click",()=>{closeModal("#mRules");if(!$("#scrGame").hidden&&GameUI.active){$("#pause").hidden=true;GameUI.openCoach();}else{store.del("coach");toast("下次对局开始时会重新显示新手引导",true);}});
$("#btnSolo").addEventListener("click",openSolo);
$("#btnDeck").addEventListener("click",()=>openDecks(Me.hero));
$("#btnOnline").addEventListener("click",async()=>{if(!Me.nick&&!(await askNick()))return;Net.enterLobby();});

function askNick(){
  return new Promise(res=>{
    $("#nickIn").value=Me.nick;openModal("#mNick");setTimeout(()=>$("#nickIn").focus(),50);
    const go=()=>{const v=$("#nickIn").value.replace(/[<>]/g,"").trim().slice(0,12);if(!v){toast("昵称不能为空");return;}Me.nick=v;closeModal("#mNick");renderHome();Net.profile();res(true);};
    $("#nickGo").onclick=go;$("#nickIn").onkeydown=e=>{if(e.key==="Enter")go();};
    const obs=new MutationObserver(()=>{if($("#mNick").hidden){obs.disconnect();res(!!Me.nick);}});obs.observe($("#mNick"),{attributes:true});
  });
}

/* ============================================================
   单人练习
   ============================================================ */
const Solo={opp:store.get("soloOpp",""),level:store.get("soloLevel","normal"),oppDeck:store.get("soloOppDeck","random")};
/* 单人练习只打原版对手；要用 DIY 角色对局，从「DIY 工坊 → 游玩 DIY 角色」进入 */
function soloPool(){return HEROES.slice();}
if(Solo.oppDeck==="decay")Solo.oppDeck="衰减流";
if(Solo.oppDeck==="federation")Solo.oppDeck="星联邦流";
function openSolo(){
  const me=Me.hero;
  $("#soloMe").innerHTML=`${crest(me)}<span style="--hcr:${V.heroRgb(me)}">${V.esc(me)}<small class="muted" style="display:block;font:500 12px var(--sans)">卡组：${V.esc(Me.deckName(me))}</small></span><button class="btn" id="soloChange">更换</button>`;
  $("#soloMe").style.setProperty("--hcr",V.heroRgb(me));
  $("#soloChange").onclick=()=>pickHero(h=>{Me.hero=h;renderHome();openSolo();},soloPool().filter(h=>h!==Solo.opp));
  if(Solo.opp===me)Solo.opp="";
  $("#soloOpp").innerHTML=`<button class="rand${!Solo.opp?" on":""}" data-v="">随机对手</button>`+soloPool().filter(h=>h!==me).map(h=>`<button data-v="${V.esc(h)}" class="${Solo.opp===h?"on":""}" style="color:${Solo.opp===h?"":C.COLORS[h]}">${V.esc(h)}${isDiyHero(h)?` <i class="diy-tag">DIY</i>`:""}</button>`).join("");
  /* 只有真正有多套预设的对手才给选择；只有一套的一律用默认卡组。 */
  const presets=Solo.opp?C.presets(Solo.opp):null;
  const deckChoices=presets?Object.keys(presets):[];
  if(deckChoices.length<2){
    Solo.oppDeck="random";
    $("#soloOppDeck").innerHTML=`<button data-v="random" class="on">${Solo.opp?"默认卡组":"随对手随机"}</button>`;
  }else{
    const chosen=deckChoices.includes(Solo.oppDeck)?Solo.oppDeck:"random";
    $("#soloOppDeck").innerHTML=`<button data-v="random" class="${chosen==="random"?"on":""}">随机</button>`+
      deckChoices.map(name=>`<button data-v="${V.esc(name)}" class="${chosen===name?"on":""}">${V.esc(name)}</button>`).join("");
  }
  $$("#soloLevel button").forEach(b=>b.classList.toggle("on",b.dataset.v===Solo.level));
  openModal("#mSolo");
}
$("#soloOpp").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.opp=b.dataset.v;Solo.oppDeck="random";store.set("soloOpp",Solo.opp);store.set("soloOppDeck",Solo.oppDeck);openSolo();});
$("#soloOppDeck").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.oppDeck=b.dataset.v;store.set("soloOppDeck",Solo.oppDeck);openSolo();});
$("#soloLevel").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.level=b.dataset.v;store.set("soloLevel",Solo.level);$$("#soloLevel button").forEach(x=>x.classList.toggle("on",x===b));});
$("#soloGo").addEventListener("click",()=>{closeModal("#mSolo");startSolo();});

class LocalController{
  constructor(heroOverride){
    const me=(heroOverride&&C.PROFILES[heroOverride])?heroOverride:Me.hero;
    const others=soloPool().filter(h=>h!==me);
    const foe=Solo.opp&&Solo.opp!==me?Solo.opp:others[Math.floor(Math.random()*others.length)];
    /* 选择的敌方预设卡组优先；随机时由 AI 自行挑选。 */
    let foeDeck=C.aiDeck(foe);
    if(Solo.opp===foe&&Solo.oppDeck&&Solo.oppDeck!=="random"){
      const pd=C.presetDeck(foe,Solo.oppDeck);
      if(pd)foeDeck=pd;
    }
    this.game=new E.Game({players:[{name:Me.nick||"你",hero:me,deck:Me.deck(me)},{name:"电脑 · "+foe,hero:foe,deck:foeDeck}]});
    this.ai=new A.AIPlayer(Solo.level);
    this.dead=false;this.running=false;
  }
  begin(){
    this.push(true);
    this.game.mulligan(1,this.ai.mulligan(this.game,1));
    this.push(false);
    setTimeout(()=>!this.dead&&GameUI.showChat("foe","你好，请多指教！",this.game.players[1].name),1600);
  }
  push(full){
    const ev=this.game.takeEvents();
    GameUI.push({view:this.game.viewFor(0),events:full?[]:this.game.eventsFor(ev,0),timer:null,full});
  }
  async act(a){
    if(this.dead)return{ok:false};
    const g=this.game;let r;
    switch(a.type){
      case"mulligan":r=g.mulligan(0,a.uids);break;
      case"play":r=g.playCard(0,a.uid,a.targets,a.option);break;
      case"attack":r=g.attack(0,a.uid,a.target);break;
      case"end":r=g.endTurn(0);break;
      case"pick":r=g.resolvePending(0,a.index);break;
      case"concede":r=g.concede(0);break;
      default:r={ok:false,error:"未知操作"};
    }
    if(r.ok){this.push(false);this.runAI();}
    return r;
  }
  /* 单人练习里的聊天：电脑偶尔回一句 */
  async chat(text){
    GameUI.showChat("me",text);
    const reply=/再来|再打/.test(text)?"好啊，随时奉陪":/稳|厉害|打得好|漂亮/.test(text)?"谢谢夸奖！":/你好|嗨|hi/i.test(text)?"你好！":/稍等|想想/.test(text)?"不急，慢慢来":
      ["哈哈","有意思","接招！","承让了","继续吧"][Math.floor(Math.random()*5)];
    if(Math.random()<.55)setTimeout(()=>{if(!this.dead)GameUI.showChat("foe",reply,this.game.players[1].name);},900+Math.random()*900);
    return{ok:true};
  }
  async runAI(){
    if(this.running)return;this.running=true;
    const g=this.game;
    try{
      while(!this.dead&&g.phase==="play"&&g.current===1){
        await GameUI.idle();
        await sleep(420);
        if(this.dead)break;
        if(g.pending&&g.pending.pi===1){g.resolvePending(1,this.ai.pickPending(g));this.push(false);continue;}
        const a=this.ai.next(g,1);let r;
        if(a.type==="play")r=g.playCard(1,a.uid,a.targets,a.option);
        else if(a.type==="attack")r=g.attack(1,a.uid,a.target);
        else{await sleep(250);r=g.endTurn(1);}
        if(!r.ok){
          if(a.type==="play")this.ai.plays=99;else if(a.type==="attack")this.ai.passed.add(a.uid);else break;
          continue;
        }
        this.push(false);
      }
    }finally{this.running=false;}
  }
  dispose(){this.dead=true;}
}
let solo=null;
function startSolo(opts){
  const hero=(opts&&opts.hero&&C.PROFILES[opts.hero])?opts.hero:null;
  if(solo)solo.dispose();
  solo=new LocalController(hero);
  show("#scrGame");
  GameUI.start(solo,"solo",{tutorial:store.get("coach","")!=="1",onAgain:()=>startSolo(opts),onExit:()=>exitGame(),onWin:()=>reportWin(hero||Me.hero)});
  solo.begin();
}
/* 普通模式获胜：+金币 并 解锁该角色剧情（仅登录后上报） */
async function reportWin(hero){
  if(!Account.me||!hero)return;
  const r=await Account.api("/reward/match",{won:true,hero});
  if(r.ok){Account.me=Object.assign({},Account.me,{gold:r.gold,campaign:r.campaign});renderGold();}
}
function exitGame(){
  if(solo){solo.dispose();solo=null;}
  GameUI.stop();setTimeout(()=>Live.afterGame(),0);
  if(Net.room){show("#scrRoom");renderRoom();}
  else if(Net.inLobby){show("#scrLobby");}
  else{show("#scrHome");renderHome();}
}

/* 对局结果与菜单按钮 */
$("#resAgain").addEventListener("click",()=>{$("#result").hidden=true;const o=GameUI.opts;o.onAgain&&o.onAgain();});
$("#resBack").addEventListener("click",()=>{$("#result").hidden=true;const o=GameUI.opts;o.onExit&&o.onExit();});
$("#pRestart").addEventListener("click",()=>{$("#pause").hidden=true;if(GameUI.mode==="solo")startSolo();});
$("#pRules").addEventListener("click",()=>openModal("#mRules"));
$("#pQuit").addEventListener("click",async()=>{
  const v=GameUI.view;const over=!v||v.phase==="over";
  if(GameUI.mode==="solo"){$("#pause").hidden=true;exitGame();return;}
  if(!over&&!(await confirmBox("认输并离开？","本局将判负，确定要离开吗？","认输")))return;
  $("#pause").hidden=true;
  if(!over)await Net.act({type:"concede"});
  Net.backToRoomAfterGame();
});

/* ============================================================
   选择卡牌师（弹窗）
   ============================================================ */
let pickCb=null;
/* 选角池：只有当前房间是「允许 DIY」时才把 DIY 角色列出来 */
function heroPickerList(){
  if(!(Net&&Net.room&&Net.room.pool==="diy"))return HEROES.slice();
  return HEROES.concat(diyHeroes().filter(h=>!HEROES.includes(h)));
}
function renderHeroPicker(list){
  $("#heroGrid2").innerHTML=(list||heroPickerList()).map(h=>heroTile(h,h===Me.hero)).join("");
}
function pickHero(cb,list){
  pickCb=cb;
  renderHeroPicker(list);
  openModal("#mHero");
}
$("#heroGrid2").addEventListener("click",e=>{const b=e.target.closest(".htile");if(!b)return;closeModal("#mHero");Audio2.sfx("select");const cb=pickCb;pickCb=null;cb&&cb(b.dataset.hero);});

/* ============================================================
   卡组页面（见 decks.js）
   ============================================================ */
/* 图鉴：只从主页进入，返回主页 */
function openCodex(opts){
  show("#scrCodex");
  Codex.open({
    toast,
    onClose(){show("#scrHome");renderHome();},
    useHero(h){Me.hero=h;Net.profile();show("#scrHome");renderHome();toast("已选择卡牌师："+h,true);},
    openDecks(h){show("#scrHome");openDecks(h);}
  },opts);
}
function openDecks(hero,deckId){
  const ret=!$("#scrLobby").hidden?"#scrLobby":!$("#scrRoom").hidden?"#scrRoom":"#scrHome";
  show("#scrDecks");
  Decks.open(hero,{
    toast,confirm:confirmBox,
    onChange(){Net.profile();},
    onClose(){
      show(ret);renderHome();
      if(ret==="#scrLobby")renderLobby();
      if(ret==="#scrRoom"&&Net.room)renderRoom();
      Live.afterGame();
    }
  },deckId);
}

/* ============================================================
   DIY 工坊：角色编辑 / 实时预览 / 上传下载
   - 角色定义由 shared/diy.js 校验与注册，这里只做界面
   - 上传成功后会立刻注册进 DuelCards，建房选「允许 DIY」就能用
   ============================================================ */
/* 匿名 owner：服务端用它判断「这是不是你上传的」，存在 localStorage 里 */
const DiyOwner={
  get(){
    let v=store.get("diyOwner","");
    if(!/^[A-Za-z0-9_-]{8,64}$/.test(v)){
      v=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9-]/g,"").slice(0,64);
      store.set("diyOwner",v);
    }
    return v;
  }
};
/* 本机上传过的角色名（服务端摘要里没有 owner 字段，只能本地记） */
function diyMine(){
  try{const a=JSON.parse(store.get("diyMine","[]"));return Array.isArray(a)?a:[];}catch(e){return[];}
}
function isMineDiy(name){return diyMine().includes(name);}
function markMine(name){if(!name||isMineDiy(name))return;store.set("diyMine",JSON.stringify(diyMine().concat(name).slice(-200)));}
function unmarkMine(name){store.set("diyMine",JSON.stringify(diyMine().filter(n=>n!==name)));}

/* 校验并注册一份角色定义（返回是否成功） */
function registerDiyDef(raw,meta){
  if(!Diy)return false;
  /* 只有标记为内置的角色才允许私有机制；玩家上传的角色一律走通用白名单 */
  const v=Diy.validate(raw,{builtin:!!(meta&&meta.builtin),allowReplace:raw&&raw.name});
  if(!v.ok){console.warn("DIY 角色校验失败：",raw&&raw.name,(v.errors||[]).join("；"));return false;}
  const r=Diy.register(v.def,meta||{});
  if(!r.ok){console.warn("DIY 角色注册失败：",v.def.name,r.error);return false;}
  return true;
}
/* 摘要里没有卡表，缺定义的角色要靠 REST 补一份 */
function fetchDiyHero(name){
  fetch("/api/diy/heroes/"+encodeURIComponent(name),{cache:"no-store"})
    .then(r=>r.ok?r.json():null)
    .then(d=>{
      if(!d||!d.hero||C.PROFILES[name])return;
      const meta=d.meta||{};
      if(registerDiyDef(d.hero,{builtin:!!meta.builtin,author:meta.author,createdAt:meta.createdAt}))refreshAfterDiy();
    })
    .catch(()=>{});
}
/* diy:list / hello.diyHeroes / GET /api/diy/heroes 都走这里 */
function applyDiySummaries(list){
  if(!Array.isArray(list)||!Diy)return;
  DiyUI.summaries=list.slice();
  if(typeof renderDiyPlay==="function")setTimeout(renderDiyPlay,0);
  const builtinNames=new Set((DiyBuiltin&&DiyBuiltin.heroes||[]).map(h=>h&&h.name));
  const alive=new Set();
  for(const s of list){
    const name=s&&s.name;
    if(typeof name!=="string"||!name)continue;
    alive.add(name);
    if(C.PROFILES[name])continue;              // 已注册
    const b=(DiyBuiltin&&DiyBuiltin.heroes||[]).find(h=>h&&h.name===name);
    if(b){registerDiyDef(b,{builtin:true,author:"官方示例"});continue;}
    fetchDiyHero(name);                        // 异步补全卡表
  }
  /* 服务端已经删掉的角色，本地同步注销（内置角色不动） */
  for(const n of Diy.names()){
    if(alive.has(n)||builtinNames.has(n))continue;
    Diy.unregister(n);
    unmarkMine(n);
    if(Me.hero===n)Me.hero=HEROES[0];
  }
  /* 告诉卡组页「服务端目前有哪些 DIY 名字」，它据此判断卡组是不是真该清掉 */
  window.__cdDiyNames=alive;
  refreshAfterDiy();
}
/* DIY 角色集合变了：刷新所有可能显示选角的地方 */
function refreshAfterDiy(){
  renderHome();
  renderHeroPicker();
  if(Net&&Net.inLobby)renderLobby();
  if(Net&&Net.room)renderRoom();
  if(!$("#scrDiy").hidden)DiyUI.renderHeroList();
  try{if(typeof Decks!=="undefined"&&Decks.refresh)Decks.refresh();}catch(e){console.warn("卡组页刷新失败：",e&&e.message);}
}

const DiyUI={
  def:null,catalog:null,limits:null,summaries:[],busy:false,loaded:false,current:"",

  blank(){return{schema:1,name:"",faction:"",style:"",hp:30,color:"#5ab4ff",cards:[]};},
  clone(v){return JSON.parse(JSON.stringify(v));},

  /* ---------- 打开 / 数据加载 ---------- */
  open(){
    if(!this.def)this.def=this.blank();
    show("#scrDiy");
    if(!this.loaded){
      this.loadCatalog().then(()=>{this.loaded=true;this.render();});
    }else this.render();
    this.loadSummaries();
  },
  async loadCatalog(){
    try{
      const r=await fetch("/api/diy/catalog",{cache:"no-store"});
      const d=await r.json();
      this.catalog=Array.isArray(d.catalog)?d.catalog:Diy.catalog();
      this.limits=d.limits||Diy.LIMITS;
    }catch(e){
      this.catalog=Diy.catalog();
      this.limits=Diy.LIMITS;
    }
  },
  async loadSummaries(){
    try{
      const r=await fetch("/api/diy/heroes",{cache:"no-store"});
      const d=await r.json();
      if(Array.isArray(d.heroes))applyDiySummaries(d.heroes);
    }catch(e){this.renderHeroList();}
  },

  /* ---------- 渲染 ---------- */
  render(){
    this.renderInfo();
    this.renderList();
    this.renderPreview();
    this.renderHeroList();
    this.renderBtns();
  },
  /* 「覆盖更新」只对本机上传过的角色显示（内置 / 别人上传的不显示） */
  renderBtns(){
    const btn=$("#diyUpdate");if(!btn)return;
    const name=this.def&&this.def.name;
    const mine=!!name&&isMineDiy(name)&&Diy.isDiy(name)&&!(Diy.hero(name)||{}).builtin;
    btn.hidden=!mine;
    const box=$("#diyInfoBtns");if(box)box.classList.toggle("has-update",mine);
  },
  renderInfo(){
    const d=this.def;
    $("#diyName").value=d.name||"";
    $("#diyFaction").value=d.faction||"";
    $("#diyStyle").value=d.style||"";
    $("#diyHp").value=Number.isFinite(+d.hp)?+d.hp:30;
    $("#diyColor").value=/^#[0-9a-f]{6}$/i.test(d.color||"")?d.color:"#5ab4ff";
    this.renderStats();
  },
  renderStats(){
    const cards=(this.def&&this.def.cards)||[];
    const caps=cards.reduce((s,c)=>s+(Number.isFinite(+c.limit)?+c.limit:0),0);
    const nsum=cards.reduce((s,c)=>s+(Number.isFinite(+c.n)?+c.n:0),0);
    $("#diyStats").innerHTML=`<span>卡牌 <b>${cards.length}</b> 种</span><span>上限合计 <b class="${caps>=40?"ok":"bad"}">${caps}</b> / 40</span><span>默认合计 <b>${nsum}</b> 张</span>`;
    $("#diyCardHint").textContent=`8~24 种 · 当前 ${cards.length}`;
  },
  num(v){return Number.isFinite(+v)?+v:"";},
  cardRow(c,i){
    const cat=this.catalog||[];
    const kind=c.kind==="spell"?"spell":"unit";
    const list=cat.filter(x=>x.kind===kind);
    const opts=(kind==="spell"
      ?`<option value=""${c.effect?"":" selected"} disabled>请选择机制</option>`
      :`<option value=""${c.effect?"":" selected"}>无</option>`)+
      list.map(x=>`<option value="${V.esc(x.id)}"${c.effect===x.id?" selected":""}>${V.esc(x.name)}</option>`).join("");
    return `<div class="diy-card" data-i="${i}">
      <div class="diy-card-h">
        <span class="diy-idx">${i+1}</span>
        <input class="diy-cn" data-k="name" maxlength="14" value="${V.esc(c.name||"")}" placeholder="卡名（1~14 字）" autocomplete="off">
        <span class="diy-id" title="卡牌 id 自动生成">${V.esc(c.id||"")}</span>
        <span class="diy-card-ops">
          <button class="btn btn-ghost" data-op="up" title="上移">↑</button>
          <button class="btn btn-ghost" data-op="down" title="下移">↓</button>
          <button class="btn btn-ghost" data-op="del" title="删除这张卡">✕</button>
        </span>
      </div>
      <div class="diy-card-fields">
        <label>费<input type="number" inputmode="numeric" data-k="cost" min="0" max="10" value="${this.num(c.cost)}"></label>
        <label>类型<select data-k="kind"><option value="unit"${kind==="unit"?" selected":""}>单位</option><option value="spell"${kind==="spell"?" selected":""}>法术</option></select></label>
        <label class="${kind==="spell"?"off":""}">攻<input type="number" inputmode="numeric" data-k="atk" min="0" max="20" value="${this.num(c.atk)}"${kind==="spell"?" disabled":""}></label>
        <label class="${kind==="spell"?"off":""}">血<input type="number" inputmode="numeric" data-k="hp" min="1" max="30" value="${this.num(c.hp)}"${kind==="spell"?" disabled":""}></label>
        <label>张数<input type="number" inputmode="numeric" data-k="n" min="1" max="4" value="${this.num(c.n)}"></label>
        <label>上限<input type="number" inputmode="numeric" data-k="limit" min="1" max="4" value="${this.num(c.limit)}"></label>
        <label>图标<button type="button" class="diy-ico" data-op="icon" title="选择卡面图标（留空 = 自动）">${DuelIcons.svg(c.icon||CardIcons.forCard(Object.assign({hero:(this.def&&this.def.name)||""},c,{kind})),{size:"1.5em",stroke:1.7})}${c.icon?"":"<i>自动</i>"}</button></label>
      </div>
      <div class="diy-card-fields2">
        <label class="grow">机制<select data-k="effect">${opts}</select></label>
        ${kind==="unit"?`<label class="kw"><input type="checkbox" data-k="charge"${c.charge?" checked":""}>冲锋</label>
          <label class="kw"><input type="checkbox" data-k="taunt"${c.taunt?" checked":""}>嘲讽</label>
          <label class="kw"><input type="checkbox" data-k="ignoreTaunt"${c.ignoreTaunt?" checked":""}>无视嘲讽</label>`:""}
      </div>
      <input class="diy-card-text" data-k="text" maxlength="90" value="${V.esc(c.text||"")}" placeholder="卡面描述（留空用机制默认文案）" autocomplete="off">
    </div>`;
  },
  renderList(){
    const box=$("#diyList");
    const cards=(this.def&&this.def.cards)||[];
    box.innerHTML=cards.length?cards.map((c,i)=>this.cardRow(c,i)).join(""):`<div class="empty">还没有卡牌<br>点右上角「加一张牌」开始</div>`;
  },
  /* 右侧：校验结果 + 卡面预览 */
  renderPreview(){
    const res=this.validate();
    const box=$("#diyIssues");
    if(res.ok)box.innerHTML=`<p class="ok">✔ 校验通过，可以上传</p>`;
    else box.innerHTML=`<p class="bad">✘ 还有 ${res.errors.length} 处问题</p><ul>${res.errors.map(e=>`<li>${V.esc(e)}</li>`).join("")}</ul>`;
    if(res.dup)box.innerHTML+=`<p class="warn">名字「${V.esc(this.def.name)}」已被占用：${isMineDiy(this.def.name)?"要更新自己的角色请先删除再上传，或换个名字":"换一个名字"}</p>`;
    const faces=$("#diyFaces");
    const color=/^#[0-9a-f]{6}$/i.test(this.def.color||"")?this.def.color:"#5ab4ff";
    /* 预览卡面用主题色：CardView 从 C.COLORS 取色，按色值生成一个临时 key（不污染真实角色，旧 key 顺手删掉） */
    const heroKey="diycolor"+color.slice(1).toLowerCase();
    if(this._previewKey&&this._previewKey!==heroKey)delete C.COLORS[this._previewKey];
    C.COLORS[heroKey]=color;
    this._previewKey=heroKey;
    faces.innerHTML=((this.def&&this.def.cards)||[]).map(c=>{
      const cat=(this.catalog||[]).find(x=>x.id===c.effect);
      const kind=c.kind==="spell"?"spell":"unit";
      const limit=Number(c.limit)||4;
      const rarity=limit>=4?"common":limit===3?"rare":limit===2?"special":"elite";
      const card={id:c.id||"x",name:c.name||"未命名",cost:Number(c.cost)||0,kind,art:c.art||(kind==="unit"?"◆":"✧"),
        text:c.text||(cat?cat.text:""),rarity,hero:heroKey};
      if(kind==="unit"){card.atk=Number(c.atk)||0;card.hp=Number(c.hp)||1;}
      if(c.charge)card.charge=true;
      if(c.taunt)card.taunt=true;
      if(c.ignoreTaunt)card.ignoreTaunt=true;
      try{return `<div class="diy-face">${V.card(card)}</div>`;}catch(e){return `<div class="diy-face bad">卡面渲染失败</div>`;}
    }).join("")||`<div class="empty">卡面预览</div>`;
  },
  renderHeroList(){
    const box=$("#diyHeroList");
    if(!box)return;
    const list=this.summaries.slice().sort((a,b)=>(b.builtin?1:0)-(a.builtin?1:0)||((b.createdAt||0)-(a.createdAt||0)));
    $("#diyCount").textContent="角色 "+list.length;
    if(!list.length){box.innerHTML=`<div class="empty">还没有人上传 DIY 角色<br>做好之后点「上传」，全服玩家都能在 DIY 房间里用它</div>`;return;}
    box.innerHTML=list.map(s=>{
      const cnt=Array.isArray(s.cards)?s.cards.length:(Number(s.cards)||0);
      const del=s.builtin?`<span class="tag">内置</span>`
        :`<button class="btn btn-ghost diy-hero-del" data-del="${V.esc(s.name)}"${isMineDiy(s.name)?"":" disabled"} title="${isMineDiy(s.name)?"删除这个角色":"只能删除本机上传的角色"}">删除</button>`;
      return `<div class="diy-hero" data-name="${V.esc(s.name)}" style="--hcr:${V.heroRgb(s.name)}">
        <span class="crest">${crestArt(s.name)}</span>
        <b>${V.esc(s.name)}</b>
        <span class="muted small">${s.builtin?"官方示例":V.esc(s.author||"玩家")}</span>
        <span class="diy-hero-n">${cnt} 张</span>
        ${del}
      </div>`;
    }).join("");
  },

  /* ---------- 编辑操作 ---------- */
  setField(k,v){this.def[k]=v;this.renderPreview();this.renderStats();},
  setCard(i,k,el){
    const c=this.def.cards[i];if(!c)return;
    if(el.type==="checkbox")c[k]=!!el.checked;
    else if(el.type==="number")c[k]=el.value===""?"":Number(el.value);
    else c[k]=el.value;
    this.renderPreview();
    this.renderStats();
  },
  /* 图标选择器：来自 DuelIcons 白名单，选「自动」则按机制 / 关键字推断 */
  pickIcon(i){
    const c=this.def.cards[i];if(!c)return;
    let m=document.getElementById("mDiyIcon");
    if(!m){
      m=document.createElement("div");m.className="modal";m.id="mDiyIcon";
      m.innerHTML=`<div class="panel"><button class="x-btn" data-close aria-label="关闭">✕</button><h2>选择卡面图标</h2><div class="ico-grid" id="icoGrid"></div><div class="panel-acts"><button class="btn" id="icoAuto">自动（按机制推断）</button><button class="btn btn-gold" data-close>完成</button></div></div>`;
      document.body.appendChild(m);
      m.addEventListener("click",e=>{if(e.target===m||e.target.closest("[data-close]"))m.hidden=true;});
    }
    const draw=()=>{
      $("#icoGrid").innerHTML=DuelIcons.list().map(x=>`<button type="button" class="ico-opt${c.icon===x.id?" on":""}" data-id="${x.id}" title="${V.esc(x.label)}">${DuelIcons.svg(x.id,{size:"26px",stroke:1.6})}<small>${V.esc(x.label)}</small></button>`).join("");
    };
    draw();
    $("#icoGrid").onclick=e=>{const b=e.target.closest(".ico-opt");if(!b)return;c.icon=b.dataset.id;draw();this.renderList();this.renderPreview();};
    $("#icoAuto").onclick=()=>{c.icon="";draw();this.renderList();this.renderPreview();};
    m.hidden=false;
  },
  setKind(i,kind){
    const c=this.def.cards[i];if(!c)return;
    c.kind=kind==="spell"?"spell":"unit";
    c.effect="";                       // 换了类型，机制必须重选
    this.renderList();this.renderPreview();this.renderStats();
  },
  nextId(){
    const used=new Set((this.def.cards||[]).map(c=>c.id).filter(Boolean));
    let i=1;while(used.has("c"+i))i++;
    return "c"+i;
  },
  add(){
    if(!this.def)this.def=this.blank();
    this.def.cards.push({id:this.nextId(),name:"",cost:2,kind:"unit",atk:2,hp:2,art:"◆",n:4,limit:4,text:""});
    this.renderList();this.renderPreview();this.renderStats();
    const rows=$$("#diyList .diy-card");const last=rows[rows.length-1];
    if(last){last.scrollIntoView({block:"nearest"});const f=last.querySelector(".diy-cn");if(f)f.focus();}
  },
  move(i,dir){
    const cards=this.def.cards,j=i+dir;
    if(j<0||j>=cards.length)return;
    const t=cards[i];cards[i]=cards[j];cards[j]=t;
    this.renderList();this.renderPreview();
  },
  del(i){
    if(!this.def.cards[i])return;
    this.def.cards.splice(i,1);
    this.renderList();this.renderPreview();this.renderStats();
  },

  /* ---------- 校验 / 上传 / 导入导出 ---------- */
  validate(){
    /* 结构校验用 allowReplace：编辑自己已上传的角色时不该因为重名报错 */
    const v=Diy.validate(this.def,{allowReplace:this.def&&this.def.name});
    const name=this.def&&this.def.name;
    const dup=!!(name&&C.PROFILES[name]&&!isMineDiy(name));
    return{ok:v.ok&&!dup,errors:v.errors||[],dup,def:v.def};
  },
  check(){
    const res=this.validate();
    this.renderPreview();
    if(res.ok)toast("校验通过，可以上传",true);
    else toast(res.errors[0]||(res.dup?"名字已被占用":"请先补全角色信息"),false,4000);
  },
  async upload(){
    if(this.busy)return;
    const v=Diy.validate(this.def);           // 真上传：重名也算错
    if(!v.ok){
      this.renderPreview();
      this.showErrors(v.errors);
      toast(v.errors[0]||"请先修正错误",false,4000);
      return;
    }
    this.busy=true;
    try{
      const r=await fetch("/api/diy/heroes",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-diy-owner":DiyOwner.get()},
        body:JSON.stringify({hero:v.def,author:Me.nick||""})
      });
      const d=await r.json().catch(()=>({ok:false,error:"服务器返回异常"}));
      if(r.ok&&d.ok){
        const name=d.name||v.def.name;
        markMine(name);
        registerDiyDef(v.def,{author:Me.nick||"玩家"});
        toast(`上传成功：「${name}」，建房时选「允许 DIY」即可使用`,true,4000);
        this.renderBtns();
        await this.loadSummaries();
      }else{
        const errs=(d&&Array.isArray(d.errors)&&d.errors)||[(d&&(d.error||d.msg))||"上传失败"];
        this.showErrors(errs);
        toast(errs[0],false,4500);
      }
    }catch(e){
      toast("上传失败：网络错误",false,4000);
    }
    this.busy=false;
  },
  /* 覆盖更新：只对自己上传过的角色可用；不能改名（服务端也会拒） */
  async update(){
    if(this.busy)return;
    const name=this.def&&this.def.name;
    if(!name||!isMineDiy(name)){toast("只能覆盖更新这台浏览器上传的角色",false,4000);return;}
    /* 覆盖时允许同名，所以用 allowReplace */
    const v=Diy.validate(this.def,{allowReplace:name});
    if(!v.ok){this.renderPreview();this.showErrors(v.errors);toast(v.errors[0]||"请先修正错误",false,4000);return;}
    if(v.def.name!==name){toast("覆盖更新不能改名，请删除后重新上传",false,4000);return;}
    this.busy=true;
    try{
      const r=await fetch("/api/diy/heroes/"+encodeURIComponent(name),{
        method:"PUT",
        headers:{"Content-Type":"application/json","x-diy-owner":DiyOwner.get()},
        body:JSON.stringify({hero:v.def,author:Me.nick||""})
      });
      const d=await r.json().catch(()=>({ok:false,error:"服务器返回异常"}));
      if(r.ok&&d.ok){
        registerDiyDef(v.def,{author:Me.nick||"玩家"});
        markMine(name);
        toast(`已更新「${name}」`,true);
        this.renderBtns();
        await this.loadSummaries();
        refreshAfterDiy();
      }else{
        const errs=(d&&Array.isArray(d.errors)&&d.errors)||[(d&&(d.error||d.msg))||"覆盖更新失败"];
        this.showErrors(errs);
        toast(errs[0],false,4500);
      }
    }catch(e){
      toast("覆盖更新失败：网络错误",false,4000);
    }
    this.busy=false;
  },
  showErrors(errs){
    const box=$("#diyIssues");
    if(!box||!errs||!errs.length)return;
    box.innerHTML=`<p class="bad">✘ 服务器拒绝（${errs.length} 条）</p><ul>${errs.map(e=>`<li>${V.esc(e)}</li>`).join("")}</ul>`;
  },
  async loadHero(name){
    if(!name)return;
    try{
      const r=await fetch("/api/diy/heroes/"+encodeURIComponent(name),{cache:"no-store"});
      const d=await r.json();
      if(!r.ok||!d.hero){toast((d&&d.error)||"加载失败",false);return;}
      this.def=this.clone(d.hero);
      this.current=name;
      this.render();
      toast("已加载「"+name+"」，改完换个名字上传就是新角色",true,4000);
    }catch(e){toast("加载失败：网络错误",false);}
  },
  async remove(name){
    if(!isMineDiy(name)){toast("只能删除这台浏览器上传的角色",false);return;}
    const ok=await confirmBox("删除 DIY 角色",`确定删除「${name}」？删除后所有玩家都不能再用它。`,"删除");
    if(!ok)return;
    try{
      const r=await fetch("/api/diy/heroes/"+encodeURIComponent(name),{method:"DELETE",headers:{"x-diy-owner":DiyOwner.get()}});
      const d=await r.json().catch(()=>({}));
      if(r.ok&&d.ok){
        unmarkMine(name);
        Diy.unregister(name);
        if(Me.hero===name)Me.hero=HEROES[0];
        if(this.current===name){this.current="";this.def=this.blank();this.render();}
        else this.renderBtns();
        toast("已删除「"+name+"」",true);
        await this.loadSummaries();
      }else toast((d&&(d.error||d.msg))||"删除失败",false);
    }catch(e){toast("删除失败：网络错误",false);}
  },
  exportJson(){
    const def=this.def||this.blank();
    const name=(def.name||"diy-hero").replace(/[\\/:*?"<>|\s]/g,"_");
    try{
      const blob=new Blob([JSON.stringify(def,null,2)],{type:"application/json"});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=name+".json";
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),2000);
      toast("已导出 JSON",true);
    }catch(e){toast("导出失败："+e.message,false);}
  },
  importJson(file){
    if(!file)return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const raw=JSON.parse(String(rd.result||""));
        const hero=raw&&raw.hero?raw.hero:raw;
        if(!hero||typeof hero!=="object"||Array.isArray(hero))throw new Error("不是有效的角色 JSON");
        this.def=this.clone(hero);
        if(!Array.isArray(this.def.cards))this.def.cards=[];
        this.current="";
        this.render();
        toast("已导入，检查无误后点「上传」",true,4000);
      }catch(e){toast("导入失败："+e.message,false,4000);}
    };
    rd.onerror=()=>toast("读取文件失败",false);
    rd.readAsText(file);
  },

  /* ---------- 说明书 ---------- */
  renderHelp(){
    const cat=this.catalog||Diy.catalog();
    const L=this.limits||Diy.LIMITS;
    const rows=cat.map(c=>`<tr><td><code>${V.esc(c.id)}</code></td><td>${c.kind==="spell"?"法术":"单位"}</td><td>${V.esc(c.text||"")}</td></tr>`).join("");
    const rng=(k)=>Array.isArray(L[k])?L[k].join("~"):L[k];
    $("#diyHelpBody").innerHTML=`<div class="diy-help-body">
      <p class="muted"><b>DIY 角色和原版池完全分开</b>：DIY 角色只能进「允许 DIY」的房间，原版房间一律拒绝；原版角色两边都能用。服务端会硬校验，不是前端藏起来。</p>
      <div class="diy-help-cols">
        <section>
          <h3>角色字段</h3>
          <ul class="diy-help-list">
            <li>名字：${rng("name")} 字，全服唯一，不能和原版角色重名</li>
            <li>血量：${rng("hp")}（原版多在 30~35）</li>
            <li>阵营：${rng("faction")} 字 · 风格：${rng("style")} 字</li>
            <li>主题色：<code>#RRGGBB</code>，卡面边框与徽章用它</li>
            <li>卡牌种类：${rng("cards")} 种，携带上限合计必须 ≥ ${L.deckSize} 张</li>
          </ul>
        </section>
        <section>
          <h3>卡牌字段</h3>
          <ul class="diy-help-list">
            <li>卡名 ${rng("cardName")} 字 · 文本 ${rng("text")} 字 · 角标 ${rng("art")} 字</li>
            <li>费用 ${rng("cost")} · 攻击 ${rng("atk")} · 生命 ${rng("unitHp")}</li>
            <li>默认张数 ${rng("n")} · 携带上限 ${rng("limit")}（稀有度按上限推导：4 普通 / 3 稀有 / 2 特殊 / 1 精英）</li>
            <li>法术必须选机制；单位可以只带关键词（冲锋/嘲讽/无视嘲讽）</li>
            <li>全服最多保存 ${L.heroes} 个 DIY 角色，每个 IP 每分钟最多上传 5 次</li>
          </ul>
        </section>
      </div>
      <h3>可用机制（${cat.length} 项，全部来自现有引擎，不能写脚本）</h3>
      <div class="diy-help-table"><table><thead><tr><th>id</th><th>类型</th><th>效果</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted small">完整文档：<code>docs/diy-heroes.md</code>（角色 JSON 格式、接口、机制说明、平衡建议都在里面）。</p>
    </div>`;
  }
};

/* ---------- DIY 工坊事件 ---------- */
[["#diyName","name"],["#diyFaction","faction"],["#diyStyle","style"],["#diyHp","hp"],["#diyColor","color"]].forEach(([sel,k])=>{
  const el=$(sel);if(!el)return;
  el.addEventListener("input",()=>{
    const v=el.value;
    DiyUI.setField(k,k==="hp"?(v===""?0:Number(v)):v);
  });
});
$("#diyList").addEventListener("input",e=>{
  const row=e.target.closest(".diy-card"),k=e.target.dataset.k;
  if(!row||!k||e.target.tagName==="SELECT")return;
  DiyUI.setCard(+row.dataset.i,k,e.target);
});
$("#diyList").addEventListener("change",e=>{
  const row=e.target.closest(".diy-card"),k=e.target.dataset.k;
  if(!row||!k)return;
  const i=+row.dataset.i;
  if(k==="kind")DiyUI.setKind(i,e.target.value);
  else DiyUI.setCard(i,k,e.target);
});
$("#diyList").addEventListener("click",e=>{
  const b=e.target.closest("[data-op]");
  if(!b)return;
  const i=+b.closest(".diy-card").dataset.i;
  if(b.dataset.op==="up")DiyUI.move(i,-1);
  else if(b.dataset.op==="down")DiyUI.move(i,1);
  else if(b.dataset.op==="icon")DiyUI.pickIcon(i);
  else DiyUI.del(i);
});
$("#diyAddCard").addEventListener("click",()=>DiyUI.add());
$("#diyCheck").addEventListener("click",()=>DiyUI.check());
$("#diyUpload").addEventListener("click",()=>DiyUI.upload());
$("#diyUpdate").addEventListener("click",()=>DiyUI.update());
$("#diyExport").addEventListener("click",()=>DiyUI.exportJson());
$("#diyImport").addEventListener("click",()=>$("#diyImportFile").click());
$("#diyImportFile").addEventListener("change",e=>{
  const f=e.target.files&&e.target.files[0];
  DiyUI.importJson(f);
  e.target.value="";
});
$("#diyHelp").addEventListener("click",()=>{DiyUI.renderHelp();openModal("#mDiyHelp");});
$("#diyHeroList").addEventListener("click",e=>{
  const del=e.target.closest("[data-del]");
  if(del){DiyUI.remove(del.dataset.del);return;}
  const row=e.target.closest(".diy-hero");
  if(row)DiyUI.loadHero(row.dataset.name);
});
$("#diyBack").addEventListener("click",()=>{
  if(Net.inLobby){if(Net.room){show("#scrRoom");renderRoom();}else{show("#scrLobby");renderLobby();}}
  else{show("#scrHome");renderHome();}
});
/* ---------- DIY 工坊左栏：游玩 DIY 角色 ---------- */
const DiyPlay={hero:""};
function renderDiyPlay(){
  const list=typeof diyHeroes==="function"?diyHeroes():[];
  if(!list.includes(DiyPlay.hero))DiyPlay.hero=list[0]||"";
  const box=$("#diyPlayList");
  if(!box)return;
  box.innerHTML=list.length
    ?list.map(h=>`<button class="diy-play-hero${h===DiyPlay.hero?" on":""}" data-v="${V.esc(h)}" style="--hcr:${V.heroRgb(h)}">${V.esc(h)}</button>`).join("")
    :`<p class="muted small">还没有可玩的 DIY 角色。</p>`;
  const go=$("#diyPlayGo");if(go)go.disabled=!DiyPlay.hero;
  const hint=$("#diyPlayHint");
  if(hint)hint.textContent=DiyPlay.hero?`将以「${DiyPlay.hero}」对战随机原版电脑（本地对局，不计段位）`:"没有可选角色";
}
$("#diyPlayList").addEventListener("click",e=>{
  const b=e.target.closest("[data-v]");if(!b)return;
  DiyPlay.hero=b.dataset.v;renderDiyPlay();
});
$("#diyPlayGo").addEventListener("click",()=>{if(DiyPlay.hero)startSolo({hero:DiyPlay.hero});});
function openDiy(){
  if(!Diy){toast("DIY 模块没有加载成功，请刷新页面",false);return;}
  DiyUI.open();renderDiyPlay();
}
$("#btnDiy").addEventListener("click",openDiy);
$("#lobbyDiy").addEventListener("click",openDiy);

/* ============================================================
   联机
   ============================================================ */
const Net={
  socket:null,inLobby:false,room:null,lobby:null,myId:null,searching:false,searchSince:0,gameOn:false,pendingJoin:null,
  seq:null,hbTimer:null,hbMiss:0,wasDown:false,diyHeroBack:null,friends:null,spectating:false,
  connect(){
    if(this.socket)return;
    if(typeof io!=="function"){toast("无法连接服务器（联机功能需要通过服务器访问）");return false;}
    const s=this.socket=io({transports:["websocket","polling"],reconnectionDelay:800,reconnectionDelayMax:4000});
    s.on("connect",()=>{
      $("#netDot").classList.add("on");$("#connBanner").hidden=true;
      s.emit("hello",{clientId:Me.cid,token:Account.token||"",nick:Me.nick,hero:Me.hero,deck:Me.deck(Me.hero)},r=>{
        if(!r||!r.ok){
          if(r&&r.banned)toast(r.error||"账号已封禁",false,5000);
          else if(r&&r.error)toast(r.error,false,5000);
          /* 服务端拒绝多半是「DIY 角色进原版房间」：切回原版角色让玩家能继续 */
          if(r&&/DIY/.test(r.error||"")&&isDiyHero(Me.hero)){Me.hero=HEROES[0];renderHome();}
          return;
        }
        this.myId=r.id;
        /* hello 回包里也带 DIY 摘要（另一种下发方式，和 diy:list 都要兼容） */
        if(r.diyHeroes)applyDiySummaries(r.diyHeroes);
        if(this.wasDown&&this.gameOn){GameUI.notice("已重新连接",true);}
        this.wasDown=false;this.hbMiss=0;
        Live.checkBuild(r.build);Live.setMaint(r.maintenance);
        if(r.nick&&r.nick!==Me.nick){Me.nick=r.nick;renderHome();}
        if(this.pendingJoin){const c=this.pendingJoin;this.pendingJoin=null;this.joinRoom({code:c});}
      });
    });
    s.on("diy:list",d=>applyDiySummaries(d&&d.heroes));
    s.on("disconnect",()=>{
      $("#netDot").classList.remove("on");if(this.inLobby||this.room)$("#connBanner").hidden=false;
      if(this.gameOn){this.wasDown=true;GameUI.notice("网络连接中断，正在自动重连…（对局会为你保留一段时间）",false);}
    });
    s.io.on("reconnect_attempt",n=>{if(this.gameOn&&n>=2)GameUI.notice(`网络不佳，正在重连…（第 ${n} 次）`,false);});
    s.io.on("reconnect_failed",()=>{if(this.gameOn)GameUI.notice("重连失败，请检查网络后刷新页面",false);});
    this.startHeartbeat();
    s.on("kicked",d=>{toast(d.reason||"连接已断开");this.leaveAll();});
    s.on("profile:corrected",d=>{if(d&&d.nick){Me.nick=d.nick;renderHome();if(this.inLobby)renderLobby();}});
    s.on("lobby",d=>{this.lobby=d;renderLobby();});
    /* 段位结算（服务端判定，客户端只显示） */
    s.on("rank:update",d=>{
      if(!d)return;
      if(Account.me)Account.me.rank=d.rank;
      const R=window.DuelRank,st=R?R.summary(d.rank):null;
      const head=d.promoted?"升段！":d.demoted?"掉段…":d.capped?"段位已封顶":(d.delta>0?`段位 +${d.delta} 分`:`段位 ${d.delta} 分`);
      toast(head+(st?`  · 当前 ${st.label}`:""),!d.demoted);
      renderHome();if(Net.inLobby&&!Net.room)renderLobby();
    });
    s.on("rank:reward",d=>{if(!d)return;if(Account.me&&typeof d.gold==="number")Account.me.gold=d.gold;renderGold();flyCoin(d.awarded||0);toast(`升段奖励 +${d.awarded} 金币`,true);});
    s.on("daily:reward",d=>{if(!d)return;if(Account.me&&typeof d.gold==="number")Account.me.gold=d.gold;renderGold();flyCoin(d.awarded||0);toast(`每日首胜 +${d.awarded} 金币`,true);});
    s.on("lobby:chatlog",list=>{$("#lobbyChatLog").innerHTML="";list.forEach(m=>chatLine("#lobbyChatLog",m));});
    s.on("lobby:chat",m=>chatLine("#lobbyChatLog",m));
    s.on("room",r=>this.onRoom(r));
    s.on("room:chatlog",list=>{$("#roomChatLog").innerHTML="";list.forEach(m=>chatLine("#roomChatLog",m));});
    s.on("room:chat",m=>chatLine("#roomChatLog",m));
    s.on("match:status",d=>{this.searching=d.searching;if(d.searching){this.searchSince=Date.now();openModal("#mMatch");}else closeModal("#mMatch");});
    s.on("game",u=>this.onGame(u));
    s.on("game:chat",d=>GameUI.showChat(d.who,d.text,d.nick));
    s.on("game:notice",d=>GameUI.notice(d.text,d.ok));
    s.on("toast",d=>toast(d.text,true,3500));
    /* 好友 */
    s.on("friend:list",d=>renderFriends(d));
    s.on("friend:request-in",d=>{
      toast(`${(d&&d.from&&d.from.nick)||"有人"} 申请加你为好友`,true,4500);
      if(this.socket&&this.socket.connected)this.socket.emit("friend:list",{},r=>renderFriends(r));
    });
    s.on("friend:presence",d=>{
      if(!this.friends||!Array.isArray(this.friends.friends))return;
      const f=this.friends.friends.find(x=>x.uid===d.uid);
      if(f){f.online=!!d.online;renderFriends(this.friends);}
    });
    /* 好友邀请进房 */
    s.on("room:invite-in",d=>{
      if(!d)return;
      toast(`${d.from||"好友"} 邀请你加入房间 #${d.code}`,true,8000);
      this.pendingInvite=d;
      if(Net.inLobby&&!Net.room)renderLobby();
    });
    s.on("announce",d=>Live.onAnnounce(d));
    s.on("broadcast",d=>sysMsg("bc",d.text,{ms:15000}));
    s.on("maintenance",m=>Live.setMaint(m));
    s.on("content",()=>Live.loadContent(false));
    s.on("build",d=>Live.checkBuild(d.build));
    return true;
  },
  profile(){if(this.socket&&this.socket.connected)this.socket.emit("profile",{nick:Me.nick,hero:Me.hero,deck:Me.deck(Me.hero)});},
  enterLobby(){
    if(this.connect()===false)return;
    /* 大厅默认还是原版池：带着 DIY 角色连上去会被服务端直接拒绝，先切回原版；
       记住这个 DIY 角色，进到「允许 DIY」的房间时再自动换回来（刷新页面重连也能恢复） */
    if(isDiyHero(Me.hero)){
      this.diyHeroBack=Me.hero;
      Me.hero=HEROES[0];renderHome();
      toast("DIY 角色只能在「允许 DIY」的房间里使用，已切回原版角色",false,4500);
    }
    this.inLobby=true;store.set("online","1");
    if(this.room){show("#scrRoom");renderRoom();}else{show("#scrLobby");renderLobby();}
  },
  leaveAll(){
    this.inLobby=false;store.del("online");this.room=null;this.gameOn=false;this.diyHeroBack=null;
    if(isDiyHero(Me.hero))Me.hero=HEROES[0];
    if(this.socket){this.socket.disconnect();this.socket=null;}
    closeModal("#mMatch");$("#connBanner").hidden=true;
    if(GameUI.active&&GameUI.mode==="online")GameUI.stop();
    show("#scrHome");renderHome();
  },
  /* 观战：进入只读视角（服务端延迟 2 回合） */
  startSpectate(d){
    if(!this.socket||!this.socket.connected){toast("与服务器的连接已断开");return;}
    this.socket.emit("room:spectate",d,r=>{
      if(r&&r.ok){this.spectating=true;toast("已进入观战（延迟 2 回合）",true);}
      else toast((r&&r.error)||"观战失败",false,3500);
    });
  },
  joinRoom(d){
    this.socket.emit("room:join",d,r=>{
      if(r&&r.ok)return;
      if(r&&r.needPassword){this.askPass(d);return;}
      toast((r&&r.error)||"加入失败");
    });
  },
  askPass(d){
    $("#passIn").value="";openModal("#mPass");setTimeout(()=>$("#passIn").focus(),50);
    const go=()=>{closeModal("#mPass");this.joinRoom(Object.assign({},d,{password:$("#passIn").value}));};
    $("#passGo").onclick=go;$("#passIn").onkeydown=e=>{if(e.key==="Enter")go();};
  },
  onRoom(r){
    const had=this.room;this.room=r;
    /* 房间信息里可能带一个我们还没注册的 DIY 角色（对手的自制角色）：先补一份定义 */
    if(r&&Array.isArray(r.seats))for(const s of r.seats){if(s&&s.hero&&!C.PROFILES[s.hero])fetchDiyHero(s.hero);}
    /* 进了允许 DIY 的房间：把刚才为了连大厅而临时换掉的角色换回来 */
    if(r&&r.pool==="diy"&&this.diyHeroBack&&C.PROFILES[this.diyHeroBack]&&!isDiyHero(Me.hero)){
      Me.hero=this.diyHeroBack;this.diyHeroBack=null;this.profile();renderHome();
      toast("已换回 DIY 角色："+Me.hero,true);
    }else if(r&&r.pool!=="diy")this.diyHeroBack=null;
    if(r){closeModal("#mMatch");this.searching=false;}
    if(!this.inLobby)return;
    if(this.gameOn){
      // 服务器说我们已经不在任何房间里：对局已经不存在（服务器重启，或断线太久被判负）
      if(!r){
        this.gameOn=false;this.seq=null;
        GameUI.stop();
        toast("对局已经结束或服务器已重启，已回到大厅",false,4000);
        show("#scrLobby");renderLobby();
        setTimeout(()=>Live.afterGame(),0);
      }
      return;
    }
    if(r){if(!had)Audio2.sfx("match");show("#scrRoom");renderRoom();}
    else{
      /* 离开房间：DIY 角色只在 DIY 房间里有效，回到大厅前先切回原版 */
      this.diyHeroBack=null;
      if(isDiyHero(Me.hero)){
        Me.hero=HEROES[0];renderHome();this.profile();
        toast("已切回原版角色：DIY 角色只能在「允许 DIY」的房间里使用",false,4000);
      }
      show("#scrLobby");renderLobby();
    }
  },
  /* 对局序号：发现中间丢了更新，就请求一次完整同步 */
  trackSeq(u){
    if(u.seq===undefined)return;
    const gap=!u.full&&this.seq!=null&&u.seq>this.seq+1;
    this.seq=u.seq;
    if(gap&&this.socket&&this.socket.connected)this.socket.emit("game:sync");
  },
  startHeartbeat(){
    if(this.hbTimer)return;
    const ping=()=>{
      if(!this.gameOn||!this.socket||document.hidden)return;
      if(!this.socket.connected){this.socket.connect();return;}
      let done=false;
      const t=setTimeout(()=>{
        if(done)return;
        if(++this.hbMiss>=2){this.hbMiss=0;try{this.socket.disconnect();this.socket.connect();}catch(e){}}
      },5000);
      this.socket.emit("game:ping",null,r=>{
        done=true;clearTimeout(t);this.hbMiss=0;
        if(!r||!r.ok)return;
        if(r.inGame===false&&this.gameOn&&!GameUI.view){return;}
        if(r.inGame&&r.seq!==this.seq)this.socket.emit("game:sync");
      });
    };
    this.hbTimer=setInterval(ping,10000);
    const wake=()=>{
      if(!this.socket)return;
      if(!this.socket.connected)this.socket.connect();
      else if(this.gameOn)this.socket.emit("game:sync");
    };
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)wake();});
    addEventListener("online",wake);
    addEventListener("focus",wake);
  },
  onGame(u){
    this.trackSeq(u);
    if(!this.gameOn){
      this.gameOn=true;
      closeModal("#mMatch");$$(".modal").forEach(m=>m.hidden=true);
      show("#scrGame");
      GameUI.start(this.ctl,"online",{tutorial:store.get("coach","")!=="1",opponentId:u.foeId,opponentName:u.view&&u.view.foe&&u.view.foe.name,onReport:(id,name)=>openReport(id,name,"game"),onAgain:()=>this.backToRoomAfterGame(),onExit:()=>this.backToLobbyAfterGame()});
    }
    if(u.spectate){
      Net.spectating=true;
      const sc=$("#scrGame");if(sc)sc.classList.add("spectating");
      const sb=$("#specBanner");if(sb)sb.hidden=false;
    }
    if(u.foeId)GameUI.opts.opponentId=u.foeId;
    if(u.view&&u.view.foe)GameUI.opts.opponentName=u.view.foe.name;
    GameUI.push(u);
  },
  clearSpectate(){
    this.spectating=false;
    const sc=$("#scrGame");if(sc)sc.classList.remove("spectating");
    const sb=$("#specBanner");if(sb)sb.hidden=true;
  },
  act(a){
    return new Promise(res=>{
      if(!this.socket||!this.socket.connected){res({ok:false,error:"与服务器的连接已断开"});return;}
      const t=setTimeout(()=>res({ok:false,error:"服务器无响应，请稍后再试"}),8000);
      this.socket.emit("game:action",a,r=>{clearTimeout(t);res(r||{ok:false});});
    });
  },
  ctl:{act:a=>Net.act(a),chat:text=>new Promise(res=>{
    if(!Net.socket||!Net.socket.connected)return res({ok:false,error:"与服务器的连接已断开"});
    const t=setTimeout(()=>res({ok:false,error:"服务器无响应"}),6000);
    Net.socket.emit("game:chat",text,r=>{clearTimeout(t);res(r||{ok:false});});
  })},
  backToRoomAfterGame(){
    this.gameOn=false;this.seq=null;GameUI.stop();
    this.clearSpectate();setTimeout(()=>Live.afterGame(),0);
    if(this.room){show("#scrRoom");renderRoom();}else{show("#scrLobby");renderLobby();}
  },
  backToLobbyAfterGame(){
    this.gameOn=false;this.seq=null;GameUI.stop();
    this.clearSpectate();setTimeout(()=>Live.afterGame(),0);
    if(this.room)this.socket.emit("room:leave");
    show("#scrLobby");renderLobby();
  }
};

function fmtTime(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
function chatLine(box,m){
  const el=document.createElement("div");el.className="msg"+(m.sys?" sys":"");
  if(m.sys)el.textContent=m.text;
  else{const b=document.createElement("b");b.textContent=m.nick;if(m.id){b.dataset.reportId=m.id;b.dataset.reportName=m.nick;b.title="点击举报这名玩家";b.classList.add("reportable-name");}el.appendChild(b);el.appendChild(document.createTextNode(m.text));const t=document.createElement("span");t.className="t";t.textContent=fmtTime(m.ts);el.appendChild(t);}
  const log=$(box);const stick=log.scrollTop+log.clientHeight>=log.scrollHeight-30;
  log.appendChild(el);while(log.children.length>80)log.firstChild.remove();
  if(stick)log.scrollTop=log.scrollHeight;
}

let reportTarget=null;
function openReport(id,name,source){
  if(!id||id===Net.myId){toast("请选择另一名玩家进行举报");return;}
  reportTarget={id:String(id),name:String(name||"玩家"),source:source||"player"};
  $("#reportTarget").textContent=`举报对象：${reportTarget.name}（ID ${reportTarget.id}）`;
  $("#reportDetails").value="";$("#reportReason").value="abuse";openModal("#mReport");
}
document.addEventListener("click",e=>{
  const name=e.target.closest("[data-report-id]");if(!name)return;
  e.preventDefault();e.stopPropagation();
  openReport(name.dataset.reportId,name.dataset.reportName||name.textContent.trim(),"click");
},true);
$("#reportSend").addEventListener("click",()=>{
  if(!reportTarget||!Net.socket){toast("请先连接联机服务器");return;}
  Net.socket.emit("moderation:report",{targetId:reportTarget.id,targetName:reportTarget.name,source:reportTarget.source,
    reason:$("#reportReason").value,details:$("#reportDetails").value},r=>{
      if(!r||!r.ok){toast((r&&r.error)||"举报未能提交");return;}
      closeModal("#mReport");toast("举报已发送，等待管理员核实",true,3500);reportTarget=null;
    });
});

/* ---------- 大厅 ---------- */
function rankLabel(){
  const R=window.DuelRank;if(!R)return "段位 ?";
  const st=R.summary((Account.me||{}).rank);
  return st.max?`${st.label} · 封顶`:`${st.label} · 本段 ${st.points}/${st.need} 分`;
}
function renderLobby(){
  const me=Me.hero;
  const mc=$("#lobbyMe");mc.style.setProperty("--hcr",V.heroRgb(me));
  mc.innerHTML=`${crest(me)}<div class="who"><b>${Cosmetics.nameHTML(Me.nick,Account.me)}</b><div>${V.esc(me)}${isDiyHero(me)?' <i class="diy-tag">DIY</i>':""} · ${V.esc((C.HERO_INFO[me]||{}).title||(C.PROFILES[me]||{}).faction||"")} · 卡组：${V.esc(Me.deckName(me))} · ${rankLabel()}</div></div><button class="btn" id="lobbyHero">更换卡牌师</button><button class="btn" id="lobbyDeck">卡组</button>`;
  $("#lobbyHero").onclick=()=>pickHero(h=>{Me.hero=h;Net.profile();renderLobby();renderHome();});
  $("#lobbyDeck").onclick=()=>openDecks(Me.hero);
  const L=Net.lobby;
  renderFriends();
  $("#lobbyOnline").textContent=L?`在线 ${L.online}${L.queue?` · 匹配中 ${L.queue}`:""}`:"连接中…";
  const box=$("#roomList");
  if(!L){box.innerHTML=`<div class="empty">正在连接服务器…</div>`;return;}
  if(!L.rooms.length){box.innerHTML=`<div class="empty">还没有房间。<br>点击 <b>快速匹配</b> 自动寻找对手，或 <b>创建房间</b> 把房间号发给朋友。</div>`;return;}
  box.innerHTML=L.rooms.map(r=>{
    const full=r.players.length>=2,playing=r.status!=="waiting";
    const can=!full&&!playing;
    return`<div class="room-card"><div class="rc-top"><span class="rc-name">${r.locked?"[私] ":""}${V.esc(r.name)}</span><span class="rc-code">#${V.esc(r.code)}</span>${r.pool==="diy"?'<span class="tag diy">DIY</span>':""}<span class="tag ${playing?"play":"wait"}">${playing?"对局中":full?"已满":"等待中"}</span></div>
      <div class="rc-players">${r.players.map(p=>`<span style="--hcr:${V.heroRgb(p.hero)}"><i>${V.esc(p.hero)}</i><b class="reportable-name" data-report-id="${V.esc(p.id)}" data-report-name="${V.esc(p.nick)}" title="点击举报">${V.esc(p.nick)}</b></span>`).join("")}${r.players.length<2?`<span class="muted">空位</span>`:""}</div>
      ${can?`<button class="btn btn-primary" data-join="${V.esc(r.id)}">加入</button>`:""}${r.status==="playing"?`<button class="btn" data-spectate="${V.esc(r.id)}">观战</button>`:""}</div>`;
  }).join("");
}
$("#roomList").addEventListener("click",e=>{
  const j=e.target.closest("[data-join]");if(j){Net.joinRoom({id:j.dataset.join});return;}
  const sp=e.target.closest("[data-spectate]");if(sp)Net.startSpectate({id:sp.dataset.spectate});
});
/* ---------- 好友面板 ---------- */
function renderFriends(d){
  if(d&&Array.isArray(d.friends))Net.friends=d;
  const box=$("#friendsList"),reqBox=$("#friendsReq");
  if(!box||!reqBox)return;
  const data=Net.friends||{friends:[],requests:[]};
  if(!Account.me){box.innerHTML=`<div class="friends-empty">登录账号后可以加好友、邀请进房和观战</div>`;reqBox.innerHTML="";return;}
  const row=(f,kind)=>{
    const rank=(window.DuelRank&&f.rank)?window.DuelRank.summary(f.rank).label:"";
    const meta=[f.hero||"",rank].filter(Boolean).join(" · ");
    if(kind==="req")return`<div class="friend-row req"><span class="fn">${V.esc(f.nick)}${meta?` <span class="muted small">${V.esc(meta)}</span>`:""}</span><button class="btn btn-gold" data-facc="${V.esc(f.uid)}">同意</button><button class="btn" data-frej="${V.esc(f.uid)}">忽略</button></div>`;
    return`<div class="friend-row"><span class="dot${f.online?" on":""}"></span><span class="fn">${V.esc(f.nick)}${meta?` <span class="muted small">${V.esc(meta)}</span>`:""}</span><button class="btn" data-finv="${V.esc(f.uid)}"${f.online?"":" disabled"}>邀请</button><button class="btn" data-fdel="${V.esc(f.uid)}">删除</button></div>`;
  };
  const reqs=(data.requests||[]).map(f=>row(f,"req")).join("");
  reqBox.innerHTML=reqs?`<div class="small muted" style="padding:2px 0">待处理申请</div>${reqs}`:"";
  const list=(data.friends||[]).map(f=>row(f,"friend")).join("");
  const inv=Net.pendingInvite?`<div class="friend-row req"><span class="fn">邀请：#${V.esc(Net.pendingInvite.code)} ${V.esc(Net.pendingInvite.name||"")}</span><button class="btn btn-gold" data-joininv="1">加入</button></div>`:"";
  box.innerHTML=(inv+list)||`<div class="friends-empty">还没有好友。输入对方昵称加一个吧。</div>`;
}
const friendsBox=$("#friendsBox");
if(friendsBox)friendsBox.addEventListener("click",e=>{
  const t=e.target.closest("button");if(!t||!Net.socket)return;
  const emit=(ev,d)=>Net.socket.emit(ev,d,r=>{if(r&&r.ok===false)toast(r.msg||r.error||"操作失败",false);});
  if(t.dataset.facc)emit("friend:accept",{uid:t.dataset.facc});
  else if(t.dataset.frej)emit("friend:reject",{uid:t.dataset.frej});
  else if(t.dataset.fdel){if(confirm("删除这个好友？"))emit("friend:remove",{uid:t.dataset.fdel});}
  else if(t.dataset.finv)emit("room:invite",{uid:t.dataset.finv});
  else if(t.dataset.joininv){const inv=Net.pendingInvite;Net.pendingInvite=null;Net.joinRoom({code:inv.code});renderFriends();}
});
const friendForm=$("#friendForm");
if(friendForm)friendForm.addEventListener("submit",e=>{
  e.preventDefault();
  const name=$("#friendName").value.trim();if(!name||!Net.socket)return;
  Net.socket.emit("friend:request",{name},r=>{
    if(r&&r.ok){toast(r.msg||"申请已发送",true);$("#friendName").value="";}
    else toast((r&&(r.msg||r.error))||"添加失败",false,3500);
  });
});
$("#lobbyBack").addEventListener("click",()=>Net.leaveAll());
$("#btnQuick").addEventListener("click",()=>{if(Net.socket){Net.socket.emit("match:quick");}});
$("#matchCancel").addEventListener("click",()=>{Net.socket&&Net.socket.emit("match:cancel");closeModal("#mMatch");});
setInterval(()=>{if(Net.searching)$("#matchTime").textContent=`已等待 ${Math.floor((Date.now()-Net.searchSince)/1000)} 秒`;},500);
/* 建房：房间类型（pool）默认原版，DIY 房间才允许 DIY 角色 */
let createPool="vanilla";
$("#crPool").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  createPool=b.dataset.v;
  $$("#crPool button").forEach(x=>x.classList.toggle("on",x===b));
});
$("#btnCreate").addEventListener("click",()=>{
  $("#crName").value="";$("#crPass").value="";
  createPool="vanilla";$$("#crPool button").forEach(x=>x.classList.toggle("on",x.dataset.v==="vanilla"));
  openModal("#mCreate");setTimeout(()=>$("#crName").focus(),50);
});
$("#crGo").addEventListener("click",()=>{
  if(!Net.socket){toast("与服务器的连接已断开");return;}
  Net.socket.emit("room:create",{name:$("#crName").value,password:$("#crPass").value,pool:createPool},r=>{
    if(r&&r.ok)closeModal("#mCreate");
    else toast((r&&r.error)||"创建失败",false,3500);
  });
});
$("#joinCodeForm").addEventListener("submit",e=>{e.preventDefault();const c=$("#joinCode").value.trim();if(!c)return;Net.joinRoom({code:c});});
$("#lobbyChatForm").addEventListener("submit",e=>{e.preventDefault();const t=$("#lobbyChatIn").value.trim();if(!t||!Net.socket)return;Net.socket.emit("lobby:chat",t,r=>{if(r&&r.ok)$("#lobbyChatIn").value="";else toast((r&&r.error)||"消息未发送");});});

/* ---------- 房间 ---------- */
let roomTick=null;
function renderRoom(){
  const r=Net.room;if(!r)return;
  $("#roomTitle").textContent=r.name;$("#roomCode").textContent=r.code;
  const spBox=$("#roomSpectate");
  if(spBox){
    if(r.spectate){
      spBox.hidden=false;
      spBox.innerHTML=`观战中 · 延迟 2 回合 · <button class="btn" id="specQuit">结束观战</button>`;
      const q=$("#specQuit");if(q)q.onclick=()=>{Net.socket&&Net.socket.emit("room:stopSpectate");};
    }else if(r.spectators>0){
      spBox.hidden=false;spBox.innerHTML=`观战 ${r.spectators} 人`;
    }else{spBox.hidden=true;spBox.innerHTML="";}
  }
  const pool=$("#roomPool");
  if(pool){
    pool.textContent=r.pool==="diy"?"允许 DIY":"原版房间";
    pool.title=r.pool==="diy"?"这是 DIY 房间：可选 DIY 角色，也可选原版角色":"这是原版房间：只能选原版角色";
    pool.classList.toggle("on",r.pool==="diy");
  }
  r.seats.forEach((s,i)=>{
    const el=$("#seat"+i);
    if(!s){el.className="seat empty-seat";el.style.removeProperty("--hcr");el.innerHTML=`<div style="font-size:30px">＋</div><div>等待对手加入…</div><div class="small">把房间号 <b style="color:var(--gold2)">${V.esc(r.code)}</b> 发给朋友</div>`;return;}
    el.className="seat";el.style.setProperty("--hcr",V.heroRgb(s.hero));
    el.innerHTML=`${i===r.you?`<span class="you">你</span>`:""}${s.host?`<span class="host">房主</span>`:""}${crest(s.hero)}<div><div class="nick${i===r.you?"":" reportable-name"}" ${i===r.you?"":`data-report-id="${V.esc(s.id)}" data-report-name="${V.esc(s.nick)} title="点击举报"`}>${V.esc(s.nick)}</div><div class="hn">${V.esc(s.hero)}${isDiyHero(s.hero)?' <i class="diy-tag">DIY</i>':""} · ${V.esc((C.HERO_INFO[s.hero]||{}).title||(C.PROFILES[s.hero]||{}).faction||"")}</div></div><div class="st${s.ready?" ready":""}">${s.ready?"已准备":"未准备"}</div>${s.connected?"":`<div class="off">连接中断…</div>`}`;
  });
  const me=r.seats[r.you];
  const both=r.seats.every(Boolean);
  $("#roomReady").textContent=me&&me.ready?"取消准备":"准备";
  $("#roomReady").className="btn btn-lg "+(me&&me.ready?"":"btn-gold");
  $("#roomReady").disabled=r.status==="playing";
  $("#roomHero").disabled=r.status!=="waiting"||!!(me&&me.ready);
  clearInterval(roomTick);
  const st=$("#roomStatus");
  if(r.status==="countdown"){
    const end=Date.now()+r.countdown;
    const tick=()=>{const s=Math.max(0,Math.ceil((end-Date.now())/1000));st.innerHTML=`对局即将开始 <b>${s}</b>`;};
    tick();roomTick=setInterval(tick,200);
  }else if(r.status==="playing")st.textContent="对局进行中…";
  else if(!both)st.textContent="等待对手加入";
  else if(me&&me.ready)st.textContent="已准备，等待对手准备";
  else st.textContent="双方都准备后自动开始";
}
$("#roomReady").addEventListener("click",()=>{const r=Net.room;if(!r)return;const me=r.seats[r.you];Audio2.sfx("click");Net.socket.emit("room:ready",!(me&&me.ready));});
$("#roomDeck").addEventListener("click",()=>openDecks(Me.hero));
$("#roomHero").addEventListener("click",()=>pickHero(h=>{Me.hero=h;Net.profile();renderHome();}));
$("#roomLeave").addEventListener("click",()=>{Net.socket&&Net.socket.emit("room:leave");});
$("#roomCodeBtn").addEventListener("click",async()=>{
  const r=Net.room;if(!r)return;
  const url=location.origin+location.pathname+"?room="+r.code;
  try{await navigator.clipboard.writeText(url);toast("邀请链接已复制，发给朋友即可加入",true);}
  catch(e){toast("房间号："+r.code,true,4000);}
});
$("#roomChatForm").addEventListener("submit",e=>{e.preventDefault();const t=$("#roomChatIn").value.trim();if(!t||!Net.socket)return;Net.socket.emit("room:chat",t,r=>{if(r&&r.ok)$("#roomChatIn").value="";else toast((r&&r.error)||"消息未发送");});});

/* ============================================================
   运营：版本热更新 / 数值热更新 / 公告 / 广播 / 维护
   ============================================================ */
const Live={
  build:null,version:"",rev:null,news:[],pendingContent:false,updateReady:false,maint:{on:false},
  inGame(){return GameUI.active&&!$("#scrGame").hidden&&GameUI.view&&GameUI.view.phase!=="over";},
  async boot(){
    await this.loadContent(true);
    await this.loadNews(true);
    setInterval(()=>{if(!(Net.socket&&Net.socket.connected))this.loadContent(false);},5*60000);
  },
  async loadContent(first){
    let c;try{const r=await fetch("/api/content",{cache:"no-store"});if(!r.ok)return;c=await r.json();}catch(e){return;}
    if(first){this.build=c.build;this.version=c.version;$("#verLabel").innerHTML=`v${V.esc(c.version)} · <a id="verNews">更新日志</a>`;$("#verNews").onclick=()=>this.openNews(this.news.find(n=>n.type==="更新"));}
    else this.checkBuild(c.build);
    this.applyContent(c);
    this.setMaint(c.maintenance);
  },
  applyContent(c){
    if(c.rev===this.rev)return;
    if(this.inGame()||!$("#scrDecks").hidden){this.pendingContent=true;return;}
    C.applyOverrides(c.overrides||{},c.rev);
    const changed=this.rev!==null;this.rev=c.rev;this.pendingContent=false;
    renderHome();if(Net.inLobby&&!Net.room)renderLobby();
    if(changed)toast("卡牌数值已更新，新对局将使用最新数值",true,3000);
  },
  checkBuild(b){
    if(!b||!this.build||b===this.build||this.updateReady)return;
    this.updateReady=true;this.showUpdate();
  },
  showUpdate(){
    if(!this.updateReady||this.inGame()||$("#sysUpd"))return;
    sysMsg("upd",`游戏已更新到新版本`,{id:"sysUpd",action:"立即刷新",onAction:()=>location.reload(),sticky:true});
  },
  /* 对局结束、回到菜单时调用：补上延后的更新 */
  afterGame(){if(this.pendingContent)this.loadContent(false);this.showUpdate();},
  setMaint(m){
    this.maint=m||{on:false};
    const old=$("#sysMaint");if(old)old.remove();
    if(this.maint.on&&!m.restarting)sysMsg("maint",this.maint.message,{id:"sysMaint",sticky:true});
    if(m&&m.restarting)sysMsg("maint","服务器正在重启更新，几秒后会自动重新连接…",{id:"sysMaint",sticky:true});
    const lm=$("#lobbyMaint");lm.hidden=!this.maint.on;lm.textContent="🔧 "+(this.maint.message||"");
    $("#btnQuick").disabled=$("#btnCreate").disabled=!!this.maint.on;
  },
  /* ---------- 公告 ---------- */
  seen(){try{return new Set(JSON.parse(store.get("seenNews","[]")));}catch(e){return new Set();}},
  markSeen(id){const s=this.seen();s.add(id);store.set("seenNews",JSON.stringify([...s].slice(-200)));this.renderDots();},
  async loadNews(first){
    try{const r=await fetch("/api/announcements",{cache:"no-store"});if(!r.ok)return;this.news=await r.json();}catch(e){return;}
    this.renderDots();
    if(first){const seen=this.seen();const pop=this.news.find(n=>n.popup&&!seen.has(n.id+"@"+n.updatedAt));if(pop&&!this.inGame())setTimeout(()=>this.openNews(pop),600);}
    if(!$("#mNews").hidden)this.renderNews(this.cur);
  },
  unread(){const s=this.seen();return this.news.filter(n=>!s.has(n.id+"@"+n.updatedAt));},
  renderDots(){const u=this.unread().length>0;$$(".news-btn .red-dot").forEach(d=>d.hidden=!u);},
  openNews(item){
    if(!this.news.length){toast("暂时没有公告",true);return;}
    this.renderNews((item||this.unread()[0]||this.news[0]).id);openModal("#mNews");
  },
  renderNews(id){
    const seen=this.seen();const cur=this.news.find(n=>n.id===id)||this.news[0];this.cur=cur.id;
    this.markSeen(cur.id+"@"+cur.updatedAt);
    const fmt=t=>new Date(t).toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric"});
    $("#newsList").innerHTML=this.news.map(n=>`<button class="news-item${n.id===cur.id?" on":""}" data-id="${V.esc(n.id)}">${!seen.has(n.id+"@"+n.updatedAt)&&n.id!==cur.id?'<span class="red-dot"></span>':""}<b><span class="ntag t${V.esc(n.type)}">${V.esc(n.type)}</span>${n.pinned?"[置顶] ":""}${V.esc(n.title)}</b><small>${fmt(n.createdAt)}</small></button>`).join("");
    $("#newsDetail").innerHTML=`<h3>${V.esc(cur.title)}</h3><div class="when"><span class="ntag t${V.esc(cur.type)}">${V.esc(cur.type)}</span>${new Date(cur.createdAt).toLocaleString("zh-CN",{hour12:false})}${cur.updatedAt>cur.createdAt+60000?" · 已编辑":""}</div><div class="txt">${V.esc(cur.body)}</div>`;
    $("#newsDetail").scrollTop=0;
  },
  /* 来自服务器的推送 */
  onAnnounce(d){
    this.loadNews(false).then(()=>{
      if(!d||!d.latest)return;
      if(d.latest.popup&&!this.inGame())this.openNews(this.news.find(n=>n.id===d.latest.id));
      else sysMsg("bc",`新公告：${d.latest.title}`,{action:"查看",onAction:()=>this.openNews(this.news.find(n=>n.id===d.latest.id))});
    });
  }
};
/* 屏幕顶部的系统消息条 */
function sysMsg(kind,text,o){
  o=o||{};
  if(o.id&&$("#"+o.id))$("#"+o.id).remove();
  const d=document.createElement("div");d.className="sys-msg "+kind;if(o.id)d.id=o.id;
  const t=document.createElement("span");t.textContent=text;d.appendChild(t);
  if(o.action){const b=document.createElement("button");b.className="btn";b.textContent=o.action;b.onclick=()=>{o.onAction();if(!o.sticky)d.remove();};d.appendChild(b);}
  const x=document.createElement("button");x.className="x";x.textContent="✕";x.onclick=()=>d.remove();d.appendChild(x);
  $("#sysBar").appendChild(d);
  if(!o.sticky)setTimeout(()=>d.remove(),o.ms||12000);
  return d;
}
$("#homeNews").addEventListener("click",()=>Live.openNews());
$("#lobbyNews").addEventListener("click",()=>Live.openNews());
$("#newsList").addEventListener("click",e=>{const b=e.target.closest(".news-item");if(b)Live.renderNews(b.dataset.id);});

/* Cosmetics 必须在「启动」之前定义：启动时 renderHome() 会读它，const 在 TDZ 内访问会抛错并中断后续全部初始化 */
/* ============================================================
   配饰（头衔 / 名字颜色）与金币动画
   ============================================================ */
const Cosmetics={
  titles:{title_recruit:{name:"皇冠新兵",color:"#6fbf73"},title_general:{name:"皇冠将军",color:"#a98fd9"}},
  colors:{red:"#e0664f",orange:"#e08a4f",yellow:"#d9c05a",green:"#6fbf73",cyan:"#4fb8b0",blue:"#5b9bd5",purple:"#a98fd9"},
  of(me){return (me&&me.cosmetics)||{titles:[],colors:[],equip:{title:null,color:null}};},
  nameHTML(nick,me){
    const c=Cosmetics.of(me),eq=c.equip||{},t=eq.title&&Cosmetics.titles[eq.title];
    const col=eq.color&&Cosmetics.colors[eq.color];
    return (t?`<i class="cos-title" style="color:${t.color}">${V.esc(t.name)}</i>`:"")+`<b${col?` style="color:${col}"`:""}>${V.esc(nick||"")}</b>`;
  }
};
/* ============================================================
   启动
   ============================================================ */
renderHome();
show("#scrHome");
Live.boot();
Account.refresh();   // 恢复登录会话（若本地有 token）
const qs=new URLSearchParams(location.search);
const inviteCode=qs.get("room");
if(!inviteCode&&store.get("online","")==="1"&&Me.nick)Net.enterLobby();
if(inviteCode&&/^\d{4,10}$/.test(inviteCode)){
  history.replaceState(null,"",location.pathname);
  (async()=>{
    if(!Me.nick&&!(await askNick()))return;
    Net.pendingJoin=inviteCode;Net.enterLobby();
  })();
}
window.__cd={Me,Net,GameUI,Live,startSolo,get solo(){return solo;}};

/* ============================================================
   商店
   ============================================================ */
function reducedMotion(){try{return matchMedia("(prefers-reduced-motion:reduce)").matches;}catch(e){return false;}}
function flyCoin(n){
  if(reducedMotion())return;
  const target=document.querySelector("#homeGold")||document.querySelector("#shopGold");
  if(!target)return;
  const r=target.getBoundingClientRect();
  const el=document.createElement("div");
  el.className="coin-fly";el.textContent="+"+n;
  el.style.left=(innerWidth/2)+"px";el.style.top=(innerHeight*0.45)+"px";
  document.body.appendChild(el);
  requestAnimationFrame(()=>{el.style.transform=`translate(${r.left+r.width/2-innerWidth/2}px,${r.top+r.height/2-innerHeight*0.45}px) scale(.7)`;el.style.opacity="0";});
  setTimeout(()=>el.remove(),650);
}
function flashEl(el){if(!el)return;el.classList.remove("flash");void el.offsetWidth;el.classList.add("flash");}
function shakeEl(el){if(!el)return;el.classList.remove("shake");void el.offsetWidth;el.classList.add("shake");}

async function renderShop(){
  const r=await Account.api("/shop");
  if(!r.ok||!r.items){toast("商店加载失败",false);return;}
  const coin=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-coin"/></svg>`;
  const inv=Account.me.inv||[];
  const cos=Cosmetics.of(Account.me),eq=cos.equip||{};
  const basics=r.items.filter(it=>!["title","chest"].includes(it.kind));
  const decos=r.items.filter(it=>["title","chest"].includes(it.kind));
  $("#shopList").innerHTML=basics.map(it=>{
    const owned=(inv.find(x=>x.id===it.id)||{}).qty||0;
    return`<div class="shop-item">
      <div class="shop-card" style="--hcr:#e2b467">
        <div class="shop-name">${V.esc(it.name)}</div>
        <div class="shop-kind">${it.kind==="card"?"剧情卡":it.kind==="pack"?"卡包":"升级券"}</div>
        <div class="shop-desc">${V.esc(it.desc)}</div>
        <div class="shop-price">${coin}${it.price}</div>
        <button class="btn btn-gold" data-id="${V.esc(it.id)}" ${Account.gold<it.price?"disabled":""}>购买${owned?"（拥有 "+owned+"）":""}</button>
      </div>
    </div>`;
  }).join("");
  let box=$("#shopCos");
  if(!box){box=document.createElement("div");box.id="shopCos";box.className="shop-cos";$("#shopList").parentNode.insertBefore(box,$("#shopList"));}
  const ownedT=cos.titles||[],ownedC=cos.colors||[];
  box.innerHTML=`<h3 class="shop-sub">配饰</h3><div class="shop-grid">`+decos.map(it=>{
    const owned=it.kind==="title"&&ownedT.includes(it.id);
    const isEq=it.kind==="title"&&eq.title===it.id;
    return`<div class="shop-item"><div class="shop-card" style="--hcr:${it.titleColor||"#e2b467"}">
      <div class="shop-name">${V.esc(it.name)}</div>
      <div class="shop-kind">${it.kind==="title"?"头衔":"宝箱"}</div>
      <div class="shop-desc">${V.esc(it.desc)}</div>
      <div class="shop-price">${coin}${it.price}</div>
      <button class="btn ${owned?"":"btn-gold"}" data-cos="${V.esc(it.id)}" ${(!owned&&Account.gold<it.price)?"disabled":""}>${isEq?"装备中":owned?"装备":"购买"}</button>
    </div></div>`;
  }).join("")+`</div>
  <h3 class="shop-sub">我的配饰</h3><div class="cos-owned">${
    (ownedT.length||ownedC.length)?[
      ...ownedT.map(id=>`<button class="cos-chip ${eq.title===id?"on":""}" data-equip="title:${id}">${V.esc((Cosmetics.titles[id]||{}).name||id)}</button>`),
      ...(eq.title?`<button class="cos-chip" data-equip="title:">卸下头衔</button>`:""),
      ...ownedC.map(id=>`<button class="cos-chip ${eq.color===id?"on":""}" style="--c:${Cosmetics.colors[id]}" data-equip="color:${id}">${V.esc(id)}</button>`),
      ...(eq.color?`<button class="cos-chip" data-equip="color:">卸下颜色</button>`:"")
    ].join(""):`<span class="muted small">还没有配饰，先买个宝箱试试</span>`
  }</div>`;
}$("#shopCos")?.addEventListener("click",async e=>{
  const cosBtn=e.target.closest("button[data-cos]"),eqBtn=e.target.closest("button[data-equip]");
  if(cosBtn){
    const card=cosBtn.closest(".shop-card");
    const item=cosBtn.dataset.cos;
    const r=await Account.api("/cosmetics/buy",{id:item});
    if(r.ok){
      if(r.cosmetics&&Account.me)Account.me.cosmetics=r.cosmetics;
      if(typeof r.gold==="number"&&Account.me)Account.me.gold=r.gold;
      renderGold();renderShop();
      if(item==="chest_color"){shakeEl(card);setTimeout(()=>{if(r.refund){toast(r.msg||`返还 ${r.refund} 金币`,true);flyCoin(r.refund);}else{toast(`开出「${(r.item&&r.item.name)||"新颜色"}」`,true);}},320);}
      else{flashEl(card);toast("购买成功",true);}
    }else toast(r.msg||"购买失败",false);
    return;
  }
  if(eqBtn){
    const [kind,value]=eqBtn.dataset.equip.split(":");
    const r=await Account.api("/cosmetics/equip",{kind,value});
    if(r.ok){if(r.cosmetics&&Account.me)Account.me.cosmetics=r.cosmetics;renderGold();renderShop();toast(value?"已装备":"已卸下",true);}
    else toast(r.msg||"操作失败",false);
  }
});
$("#shopList").addEventListener("click",async e=>{
  const b=e.target.closest("button[data-id]");if(!b)return;
  const r=await Account.api("/shop/buy",{id:b.dataset.id});
  if(r.ok){Account.me=Object.assign({},Account.me,{gold:r.gold,inv:r.inv});renderGold();renderShop();toast("购买成功",true);flashEl(b.closest(".shop-card"));}
  else toast(r.msg||"购买失败",false);
});

/* ============================================================
   仓库：所有角色共用一个仓库（方块网格），放入时选角色+存档位
   ============================================================ */
const Vault={item:null,hero:"八幡",slot:0};
const VAULT_ICON={villageHorn:`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-flag"/></svg>`,militiaCaptain:`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-swords"/></svg>`,campaignPack:`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-cards"/></svg>`,upgradeToken:`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-bolt"/></svg>`};
function renderVault(){
  const inv=Account.me.inv||[];
  const list=$("#vaultList");
  if(!inv.length){list.innerHTML='<div class="empty">仓库是空的<br><b>去商店</b>买点东西吧</div>';return;}
  list.innerHTML=inv.map(x=>{
    const it=SHOP_ITEMS[x.id];
    return`<button class="vault-cell" data-id="${V.esc(x.id)}" title="${it?V.esc(it.name):V.esc(x.id)}">
      <span class="vault-icon">${VAULT_ICON[x.id]||""}</span>
      <span class="vault-name">${it?V.esc(it.name):V.esc(x.id)}</span>
      <span class="vault-qty">×${x.qty}</span>
    </button>`;
  }).join("");
}
$("#vaultList").addEventListener("click",e=>{
  const b=e.target.closest("button[data-id]");if(!b)return;
  const it=SHOP_ITEMS[b.dataset.id];
  if(it&&it.kind==="token"){toast("升级券在剧情结算后的升级界面使用",false);return;}
  Vault.item=b.dataset.id;
  $("#slotPickTitle").textContent="放入【"+(it?it.name:b.dataset.id)+"】";
  $("#pickHero").innerHTML=HEROES.map(h=>`<button data-v="${V.esc(h)}" class="${Vault.hero===h?"on":""}">${V.esc(h)}</button>`).join("");
  $("#pickSlot").innerHTML=[0,1,2].map(i=>`<button data-v="${i}" class="${Vault.slot===i?"on":""}">存档位 ${i+1}</button>`).join("");
  $("#pickMsg").textContent="";
  openModal("#mSlotPick");
});
$("#pickHero").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Vault.hero=b.dataset.v;$$("#pickHero button").forEach(x=>x.classList.toggle("on",x===b));});
$("#pickSlot").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Vault.slot=+b.dataset.v;$$("#pickSlot button").forEach(x=>x.classList.toggle("on",x===b));});
$("#pickGo").addEventListener("click",async()=>{
  if(!Vault.item){toast("请先选择物品",false);return;}
  const r=await Account.api("/inventory/use",{id:Vault.item,hero:Vault.hero,slot:Vault.slot});
  if(r.ok){Account.me=Object.assign({},Account.me,{inv:r.inv,campaign:r.campaign});closeModal("#mSlotPick");renderGold();renderVault();toast("已放入 "+Vault.hero+" 存档位 "+(Vault.slot+1),true);}
  else toast(r.msg||"放入失败",false);
});
/* 商品表（与 server 侧 SHOP 一致，供仓库显示名称） */
const SHOP_ITEMS={
  villageHorn:{name:"渔村号角",desc:"3 费：召唤 2 个 2/1 冲锋起义村民",kind:"card"},
  militiaCaptain:{name:"民兵队长",desc:"4 费 3/3 嘲讽：部署时全军 +1/+1",kind:"card"},
  campaignPack:{name:"剧情卡包",desc:"随机获得 1 张剧情专属卡",kind:"pack"},
  upgradeToken:{name:"升级券",desc:"将剧情牌库中的一张卡升级一阶",kind:"token"}
};

/* ============================================================
   剧情模式
   ============================================================ */
const Campaign={
  page:0,hero:"八幡",slot:0,chapter:null,pending:null,
  camp:{hero:"",slot:0,turns:0,star:0,rewardCard:""}
};
const SHOP_CARDS=["villageHorn","militiaCaptain"];   // 商店直接买的剧情卡（放 pack 奖励池同源）
function renderCampaign(){
  const list=$("#campHeroList");
  const per=4,start=Campaign.page*per,slice=HEROES.slice(start,start+per);
  $("#campPrev").hidden=Campaign.page===0;
  $("#campNext").hidden=start+per>=HEROES.length;
  $("#campPage").textContent=`${Campaign.page+1} / ${Math.ceil(HEROES.length/per)}`;
  /* 较短的竖版封面，翻页按钮固定在列表上方 */
  list.innerHTML=slice.map(h=>{
    const cam=Account.me&&Account.me.campaign&&Account.me.campaign[h];
    const unlocked=cam&&cam.unlocked;
    /* 目前只有部分角色写了剧情章节，没写的不要显示成「已解锁」让人点进去 */
    const story=!!C.campaignOf(h);
    const sub=!story?"剧情未开放":(unlocked?"★ 已解锁":"未解锁");
    return`<button class="camp-bar ${story?(unlocked?"":"locked"):"locked nostory"}" data-hero="${V.esc(h)}" style="--hcr:${V.heroRgb(h)}">
      <div class="camp-img" style="--hcr:${V.heroRgb(h)}">
        <img class="camp-photo" alt="" hidden data-hero-img="${V.esc(h)}">
        <span class="crest camp-crest" style="--hcr:${V.heroRgb(h)}">${window.CardArt&&CardArt.cover?CardArt.cover(h):crestArt(h)}</span>
      </div>
      <div class="camp-txt"><strong>${V.esc(h)}</strong><span class="muted">${sub}</span></div>
    </button>`;
  }).join("");
  /* 预留图片接口：img.camp-photo 有 src 时自动替换徽记（后续接角色立绘） */
  $$(".camp-photo[data-hero-img]").forEach(img=>{
    const key="campart."+img.dataset.heroImg;
    const src=store.get(key,"");
    if(src){img.hidden=false;img.src=src;img.previousElementSibling.hidden=true;}
  });
}
$("#campHeroList").addEventListener("click",e=>{
  const b=e.target.closest("button[data-hero]");if(!b)return;
  const hero=b.dataset.hero;
  /* 没写章节的角色直接拦在外面：以前是先藏列表再渲染，一抛错整页就白了 */
  if(!C.campaignOf(hero)){toast("该角色的剧情章节还没开放",false);return;}
  const cam=Account.me&&Account.me.campaign&&Account.me.campaign[hero];
  if(!cam||!cam.unlocked){toast("先用该角色赢得一场普通对局解锁剧情",false);return;}
  Campaign.hero=hero;
  const list=$("#campHeroList");list.classList.remove("out-l","out-r","in-l","in-r");Campaign._busy=false;
  try{
    renderCampaignDetail();
    $("#campListWrap").hidden=true;
    $("#campDetail").hidden=false;
  }catch(err){
    /* 渲染失败就退回列表，绝不留一块空白 */
    console.warn("[campaign]",err);
    $("#campDetail").hidden=true;
    $("#campListWrap").hidden=false;
    toast("剧情数据读取失败，请刷新页面重试",false);
  }
});
/* 翻页：点击按钮，带滑入/滑出动画 */
function flipCampaign(dir){
  if(Campaign._busy)return;Campaign._busy=true;
  const list=$("#campHeroList");
  list.classList.add(dir>0?"out-l":"out-r");          // 旧页向翻页方向滑出
  setTimeout(()=>{
    Campaign.page+=dir;
    renderCampaign();
    list.classList.remove("out-l","out-r");
    list.classList.add(dir>0?"in-l":"in-r");          // 新页从对侧滑入
    setTimeout(()=>{list.classList.remove("in-l","in-r");Campaign._busy=false;},220);
  },170);
}
$("#campPrev").addEventListener("click",()=>flipCampaign(-1));
$("#campNext").addEventListener("click",()=>flipCampaign(1));
$("#campDetailBack").addEventListener("click",()=>{$("#campDetail").hidden=true;$("#campListWrap").hidden=false;renderCampaign();});
function renderCampaignDetail(){
  const cam=C.campaignOf(Campaign.hero);
  if(!cam||!cam.chapters||!cam.chapters.ch1)return;
  const ch=cam.chapters.ch1;
  const data=(Account.me.campaign&&Account.me.campaign[Campaign.hero])||{slots:[]};
  if(!data.slots||!data.slots.length)data.slots=[{},{},{}];
  $("#campChapter").innerHTML=`<h2>${V.esc(ch.title)}</h2>
    <p class="muted">${V.esc((cam.intro||[])[0]||"")}</p>
    <p>胜利条件：撑过 <b>${ch.survive[0]}</b> 回合（1★）· <b>${ch.survive[1]}</b>（2★）· <b>${ch.survive[2]}</b>（3★）</p>
    <p class="muted">奖励：${ch.rewards[1]} / ${ch.rewards[2]} / ${ch.rewards[3]} 金币 · 首通随机剧情卡</p>`;
  $("#campSlots").innerHTML=data.slots.map((s,i)=>{
    const cnt=s.deck?s.deck.length:0,best=s.ch1?Math.max(s.ch1.best||0,0):0,first=s.ch1&&s.ch1.first;
    return`<button class="slot-card ${Campaign.slot===i?"on":""}" data-slot="${i}">
      <b>存档位 ${i+1}</b>
      <span class="muted">${cnt?cnt+" 张卡":"初始弱卡组（开战自动补足）"} · 最佳 ${best}★${first?" · 已首通":""}</span>
    </button>`;
  }).join("");
  $("#campStart").disabled=false;
}
$("#campSlots").addEventListener("click",e=>{
  const b=e.target.closest("button[data-slot]");if(!b)return;
  Campaign.slot=+b.dataset.slot;renderCampaignDetail();
});
$("#campStart").addEventListener("click",()=>{
  // 存档位为空也能开战：开局自动用初始弱卡组补足 30 张
  startCampaign(Campaign.hero,Campaign.slot);
});

/* ---------- 剧情对局 ---------- */
let campGame=null;
function startCampaign(hero,slot){
  if(campGame)campGame.dispose();
  const cam=C.campaignOf(hero),ch=cam.chapters.ch1;
  const data=Account.me.campaign[hero],s=(data.slots&&data.slots[slot])||{};
  const deck=(s.deck||[]).slice();
  /* 若不足 30 张，用该角色初始弱卡补足，保证可玩 */
  const base=C.campaignInitialDeck(hero,slot);
  for(const id of base){if(deck.length>=30)break;deck.push(id);}
  const upgrades=s.upgrades||{};
  const me={name:Account.me.nick||Account.me.user,hero,deck,upgrades};
  const foe={name:"土匪",hero:ch.enemy.hero,deck:ch.enemy.deck.slice()};
  const g=new E.Game({players:[me,foe],campaign:{player:0,survive:ch.survive,events:ch.events,boss:"bd_boss",hero,ch:"ch1"}});
  const ai=new A.AIPlayer("normal");ai.campaignStyle="bandit1";
  const ctl={
    game:g,ai,dead:false,running:false,
    push(full){const ev=g.takeEvents();GameUI.push({view:g.viewFor(0),events:full?[]:g.eventsFor(ev,0),timer:null,full});},
    begin(){this.push(true);g.mulligan(1,ai.mulligan(g,1));this.push(false);},
    async act(a){
      if(this.dead)return{ok:false};
      let r;
      switch(a.type){
        case"mulligan":r=g.mulligan(0,a.uids);break;
        case"play":r=g.playCard(0,a.uid,a.targets,a.option);break;
        case"attack":r=g.attack(0,a.uid,a.target);break;
        case"end":r=g.endTurn(0);break;
        case"pick":r=g.resolvePending(0,a.index);break;
        case"concede":r=g.concede(0);break;
        default:r={ok:false,error:"未知操作"};
      }
      if(r.ok){this.push(false);this.runAI();}
      return r;
    },
    async runAI(){
      if(this.running)return;this.running=true;
      try{
        while(!this.dead&&g.phase==="play"&&g.current===1){
          await GameUI.idle();await sleep(420);
          if(this.dead)break;
          if(g.pending&&g.pending.pi===1){g.resolvePending(1,ai.pickPending(g));this.push(false);continue;}
          const a=ai.next(g,1);let r;
          if(a.type==="play")r=g.playCard(1,a.uid,a.targets,a.option);
          else if(a.type==="attack")r=g.attack(1,a.uid,a.target);
          else{await sleep(250);r=g.endTurn(1);}
          if(!r.ok){if(a.type==="play")ai.plays=99;else if(a.type==="attack")ai.passed.add(a.uid);else break;continue;}
          this.push(false);
        }
      }finally{this.running=false;}
    },
    async chat(){return{ok:true};},
    dispose(){this.dead=true;}
  };
  campGame=ctl;
  show("#scrGame");
  GameUI.start(ctl,"campaign",{campaign:{hero,slot,ch,data},onAgain:()=>{exitCampaign();startCampaign(hero,slot);},onExit:()=>exitCampaign(),onOver:(v)=>{
    const star=g.campaign?g.campaign.reachedStar:0;
    finishCampaign(v.winner==="me"?0:1,g.players[0].turnsStarted,star);
  }});
  /* 先放 AVG 开场，再启动对局 */
  playAVG(cam.intro||[],()=>{ctl.begin();});
  window.__cd.campSession={hero,slot,ch};
}
function exitCampaign(){
  if(campGame){campGame.dispose();campGame=null;}
  GameUI.stop();window.__cd.campSession=null;
  show("#scrCampaign");renderCampaignDetail();
}
/* AVG 开场：逐句点击推进 */
function playAVG(lines,done){
  const ov=$("#avgOverlay");ov.hidden=false;
  const tx=$("#avgText");let i=0;
  tx.textContent=lines[0]||"";
  const next=()=>{
    i++;
    if(i>=lines.length){ov.hidden=true;done&&done();}
    else tx.textContent=lines[i];
  };
  ov.onclick=next;$("#avgSkip").onclick=()=>{ov.hidden=true;done&&done();};
}
/* 局内对话窗口（ce 事件） */
function onCampaignEvent(e){
  const dlg=$("#campDlg");
  if(!dlg)return;
  $("#campDlgBody").textContent=e.text||"";
  dlg.hidden=false;
  clearTimeout(onCampaignEvent._t);
  onCampaignEvent._t=setTimeout(()=>{if(dlg&&!dlg.hidden)dlg.hidden=true;},9000);
}
$("#campDlgClose").addEventListener("click",()=>{$("#campDlg").hidden=true;});
/* 剧情结算：星级上报 → 奖励弹窗 */
async function finishCampaign(winner,turns,star){
  const s=window.__cd.campSession;if(!s)return;
  if(winner===0){
    const r=await Account.api("/campaign/finish",{hero:s.hero,slot:s.slot,stars:star||1});
    if(r.ok){
      Account.me=Object.assign({},Account.me,{gold:r.gold,campaign:r.campaign});
      renderGold();
      const ch=C.campaignOf(s.hero).chapters.ch1;
      $("#rewardStars").innerHTML=stars(star||1);
      $("#rewardGold").textContent="+ "+r.gold;
      $("#rewardCardLine").hidden=!r.rewardCard;
      if(r.rewardCard){
        const def=C.cardDef(s.hero,r.rewardCard);
        $("#rewardCard").textContent="【"+(def?def.name:r.rewardCard)+"】已加入你的剧情牌库";
      }
      $("#rewardNewBest").hidden=true;
      $("#rewardTitle").textContent="渔村守住了！";
      $("#rewardSub").textContent=`撑过了 ${turns} 个回合`;
      $("#rewardUpgrade").hidden=false;
      openModal("#mReward");
    }
  }else{
    $("#rewardTitle").textContent="渔村失守…";
    $("#rewardSub").textContent="别灰心，升级卡牌或换个策略再来！";
    $("#rewardStars").innerHTML=stars(star||0);
    $("#rewardGold").textContent="+ 0";
    $("#rewardCardLine").hidden=true;
    $("#rewardUpgrade").hidden=true;
    openModal("#mReward");
  }
}
/* 升级剧情卡 */
let upTarget="";
function upgradableCards(sl){
  const ids=sl.deck||[];
  return ids.filter(id=>C.CAMPAIGN_UPGRADES[id]);
}
function openUpgrade(){
  const s=window.__cd.campSession;if(!s)return;
  const data=Account.me.campaign[s.hero],sl=data.slots[s.slot];
  const path=upgradableCards(sl);
  upTarget=path[0]||"";
  $("#upCardList").innerHTML=path.map(id=>`<button data-id="${V.esc(id)}" class="${upTarget===id?"on":""}">${V.esc(C.cardDef(s.hero,id).name)}（Lv${(sl.upgrades[id]||0)}）</button>`).join("");
  renderUpPreview();
  $("#upGo").disabled=false;
  openModal("#mUpgrade");
}
function renderUpPreview(){
  const s=window.__cd.campSession;if(!s)return;
  const data=Account.me.campaign[s.hero],sl=data.slots[s.slot];
  const def=C.cardDef(s.hero,upTarget),lvl=sl.upgrades[upTarget]||0;
  const steps=C.campaignUpgradePath(s.hero,upTarget)||[];
  const up=steps[lvl+1];
  $("#upPreview").innerHTML=`<b>${V.esc(def.name)}</b>（Lv${lvl}）→ ${up?V.esc(up.desc||("Lv"+(lvl+1))):"已满级"}`;
  $("#upCost").textContent=up?up.cost+" 金币":"—";
  $("#upMsg").textContent="";
  $("#upGo").disabled=!up;
}
$("#upCardList").addEventListener("click",e=>{const b=e.target.closest("button[data-id]");if(!b)return;upTarget=b.dataset.id;renderUpPreview();$$("#upCardList button").forEach(x=>x.classList.toggle("on",x===b));});
$("#upGo").addEventListener("click",async()=>{
  const s=window.__cd.campSession;if(!s)return;
  const r=await Account.api("/campaign/upgrade",{hero:s.hero,slot:s.slot,cardId:upTarget});
  if(r.ok){Account.me=Object.assign({},Account.me,{gold:r.gold,campaign:r.campaign});renderGold();renderUpPreview();toast("升级成功！",true);}
  else toast(r.msg||"升级失败",false);
});
$("#rewardBack").addEventListener("click",()=>{closeModal("#mReward");exitCampaign();});
$("#rewardAgain").addEventListener("click",()=>{closeModal("#mReward");const s=window.__cd.campSession;if(s)startCampaign(s.hero,s.slot);});
$("#rewardUpgrade").addEventListener("click",()=>{closeModal("#mReward");openUpgrade();});
window.__cd={Me,Net,GameUI,Live,startSolo,get solo(){return solo;},Account,Campaign,renderGold,onCampaignEvent,DiyUI,Diy,diyHeroes,pickHero,applyDiySummaries};
})();



