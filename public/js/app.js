/* 应用外壳：主页、单人练习、卡组编辑、联机大厅与房间 */
(()=>{
"use strict";
const C=window.DuelCards,E=window.DuelEngine,A=window.DuelAI,V=CardView;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HEROES=Object.keys(C.PROFILES);
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
  ["#scrHome","#scrLobby","#scrRoom","#scrGame"].forEach(s=>$(s).hidden=s!==id);
  if(id==="#scrGame")GameUI.fit();
  if(id==="#scrHome"||id==="#scrLobby"||id==="#scrRoom")Audio2.music("menu");
}
function openModal(id){$(id).hidden=false;}
function closeModal(id){$(id).hidden=true;}
$$(".modal").forEach(m=>{
  m.addEventListener("click",e=>{if(e.target===m&&m.id!=="mMatch")m.hidden=true;if(e.target.closest("[data-close]"))m.hidden=true;});
});
function confirmBox(title,text,yes){
  return new Promise(res=>{
    $("#cfTitle").textContent=title;$("#cfText").textContent=text;$("#cfYes").textContent=yes||"确定";
    openModal("#mConfirm");
    const done=v=>{closeModal("#mConfirm");$("#cfYes").onclick=$("#cfNo").onclick=null;res(v);};
    $("#cfYes").onclick=()=>done(true);$("#cfNo").onclick=()=>done(false);
  });
}
const crest=(hero,cls)=>`<span class="crest ${cls||""}" style="--hcr:${V.heroRgb(hero)}">${V.esc(V.glyph(hero))}</span>`;
const stars=n=>"★".repeat(n)+"☆".repeat(3-n);

/* ============================================================
   个人设置：昵称 / 卡牌师 / 卡组
   ============================================================ */
const Me={
  get nick(){return store.get("nick","");},
  set nick(v){store.set("nick",v);},
  get hero(){const h=store.get("hero","苏苏");return C.PROFILES[h]?h:"苏苏";},
  set hero(v){store.set("hero",v);},
  deck(h){
    try{const d=JSON.parse(store.get("deck."+h,"null"));if(d&&!C.deckError(h,d))return d;}catch(e){}
    return C.defaultDeck(h);
  },
  saveDeck(h,list){store.set("deck."+h,JSON.stringify(list));},
  get cid(){let c=store.get("cid","");if(!/^[A-Za-z0-9_-]{8,64}$/.test(c)){c=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9-]/g,"");store.set("cid",c);}return c;}
};

/* ============================================================
   主页
   ============================================================ */
function heroTile(h,on){
  const info=C.HERO_INFO[h],p=C.PROFILES[h];
  return`<button class="htile${on?" on":""}" data-hero="${V.esc(h)}" style="--hcr:${V.heroRgb(h)}">${info.difficulty===1?`<span class="badge">新手推荐</span>`:""}${crest(h)}<strong>${V.esc(h)}</strong><small>${V.esc(info.title)}</small><span class="stars" title="上手难度">${stars(info.difficulty)}</span></button>`;
}
function renderHome(){
  const cur=Me.hero;
  $("#heroGrid").innerHTML=HEROES.map(h=>heroTile(h,h===cur)).join("");
  const p=C.PROFILES[cur],info=C.HERO_INFO[cur];
  const d=$("#heroDetail");d.style.setProperty("--hcr",V.heroRgb(cur));
  d.innerHTML=`${crest(cur)}<div><h3>${V.esc(cur)}<small>${V.esc(info.title)}</small></h3>
    <div class="meta"><span>阵营 <b>${V.esc(p.faction)}</b></span><span>风格 <b>${V.esc(p.style)}</b></span><span>生命 <b>${p.hp}</b></span><span>难度 <b style="color:var(--gold)">${stars(info.difficulty)}</b></span></div>
    <p class="tip">${V.esc(info.tip)}</p></div>`;
  $("#homeNickTxt").textContent=Me.nick||"设置昵称";
  $("#homeSound").classList.toggle("off",!Audio2.musicOn&&!Audio2.sfxOn);
}
$("#heroGrid").addEventListener("click",e=>{const b=e.target.closest(".htile");if(!b)return;Me.hero=b.dataset.hero;Audio2.sfx("select");renderHome();});
$("#homeNick").addEventListener("click",()=>askNick());
$("#homeSound").addEventListener("click",()=>{const on=!(Audio2.musicOn||Audio2.sfxOn);Audio2.setSfx(on);Audio2.setMusic(on);if(on)Audio2.music("menu");toast(on?"声音已开启":"声音已关闭",true);renderHome();});
$("#btnRules").addEventListener("click",()=>openModal("#mRules"));
$("#rulesCoach").addEventListener("click",()=>{closeModal("#mRules");if(!$("#scrGame").hidden&&GameUI.active){$("#pause").hidden=true;GameUI.openCoach();}else{store.del("coach");toast("下次对局开始时会重新显示新手引导",true);}});
$("#btnSolo").addEventListener("click",openSolo);
$("#btnDeck").addEventListener("click",()=>openDeck(Me.hero));
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
const Solo={opp:store.get("soloOpp",""),level:store.get("soloLevel","normal")};
function openSolo(){
  const me=Me.hero;
  $("#soloMe").innerHTML=`${crest(me)}<span style="--hcr:${V.heroRgb(me)}">${V.esc(me)}</span><button class="btn" id="soloChange">更换</button>`;
  $("#soloMe").style.setProperty("--hcr",V.heroRgb(me));
  $("#soloChange").onclick=()=>pickHero(h=>{Me.hero=h;renderHome();openSolo();});
  if(Solo.opp===me)Solo.opp="";
  $("#soloOpp").innerHTML=`<button class="rand${!Solo.opp?" on":""}" data-v="">随机对手</button>`+HEROES.filter(h=>h!==me).map(h=>`<button data-v="${V.esc(h)}" class="${Solo.opp===h?"on":""}" style="color:${Solo.opp===h?"":C.COLORS[h]}">${V.esc(h)}</button>`).join("");
  $$("#soloLevel button").forEach(b=>b.classList.toggle("on",b.dataset.v===Solo.level));
  openModal("#mSolo");
}
$("#soloOpp").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.opp=b.dataset.v;store.set("soloOpp",Solo.opp);openSolo();});
$("#soloLevel").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.level=b.dataset.v;store.set("soloLevel",Solo.level);$$("#soloLevel button").forEach(x=>x.classList.toggle("on",x===b));});
$("#soloGo").addEventListener("click",()=>{closeModal("#mSolo");startSolo();});

class LocalController{
  constructor(){
    const me=Me.hero;
    const others=HEROES.filter(h=>h!==me);
    const foe=Solo.opp&&Solo.opp!==me?Solo.opp:others[Math.floor(Math.random()*others.length)];
    this.game=new E.Game({players:[{name:Me.nick||"你",hero:me,deck:Me.deck(me)},{name:"电脑 · "+foe,hero:foe,deck:C.defaultDeck(foe)}]});
    this.ai=new A.AIPlayer(Solo.level);
    this.dead=false;this.running=false;
  }
  begin(){
    this.push(true);
    this.game.mulligan(1,this.ai.mulligan(this.game,1));
    this.push(false);
    if(Math.random()<.5)setTimeout(()=>!this.dead&&GameUI.showEmote("foe",0),1600);
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
  emote(id){
    GameUI.showEmote("me",id);
    if(Math.random()<.6)setTimeout(()=>{if(!this.dead)GameUI.showEmote("foe",[0,1,2,3,4,5][[0,2,2,3,4,1][id]]);},1300);
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
function startSolo(){
  if(solo)solo.dispose();
  solo=new LocalController();
  show("#scrGame");
  GameUI.start(solo,"solo",{tutorial:store.get("coach","")!=="1",onAgain:()=>startSolo(),onExit:()=>exitGame()});
  solo.begin();
}
function exitGame(){
  if(solo){solo.dispose();solo=null;}
  GameUI.stop();
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
function pickHero(cb){
  pickCb=cb;
  $("#heroGrid2").innerHTML=HEROES.map(h=>heroTile(h,h===Me.hero)).join("");
  openModal("#mHero");
}
$("#heroGrid2").addEventListener("click",e=>{const b=e.target.closest(".htile");if(!b)return;closeModal("#mHero");Audio2.sfx("select");const cb=pickCb;pickCb=null;cb&&cb(b.dataset.hero);});

/* ============================================================
   卡组编辑器
   ============================================================ */
let DW=null; // {hero, list}
function openDeck(hero){
  DW={hero,list:Me.deck(hero).slice()};
  renderDeck();openModal("#mDeck");
}
function renderDeck(){
  const h=DW.hero,cards=C.PROFILES[h].cards;
  $("#deckHeroes").innerHTML=HEROES.map(x=>`<button data-h="${V.esc(x)}" class="${x===h?"on":""}" style="--hcr:${V.heroRgb(x)}">${V.esc(x)}</button>`).join("");
  const cnt={};DW.list.forEach(id=>cnt[id]=(cnt[id]||0)+1);
  $("#deckCards").innerHTML=cards.slice().sort((a,b)=>a.cost-b.cost||(a.kind<b.kind?1:-1)).map(c=>{
    const n=cnt[c.id]||0;
    return`<div class="dc${n?"":" zero"}" data-id="${V.esc(c.id)}">${V.card(Object.assign({hero:h},c))}<div class="dc-ctrl"><button data-a="-" ${n<=0?"disabled":""}>−</button><span>${n}<small> / ${c.limit}</small></span><button data-a="+" ${n>=c.limit||DW.list.length>=C.DECK_SIZE?"disabled":""}>＋</button></div></div>`;
  }).join("");
  const total=DW.list.length,err=C.deckError(h,DW.list);
  const dc=$("#deckCount");dc.className="deck-count "+(err?"bad":"ok");dc.innerHTML=`${total}<small> / ${C.DECK_SIZE}</small>`;
  const curve=[0,0,0,0,0,0,0,0];let units=0,spells=0;
  DW.list.forEach(id=>{const c=cards.find(x=>x.id===id);curve[Math.min(7,c.cost)]++;if(c.kind==="unit")units++;else spells++;});
  const mx=Math.max(1,...curve);
  $("#deckCurve").innerHTML=curve.map((n,i)=>`<div><b>${n||""}</b><i style="height:${n/mx*70}%"></i>${i===7?"7+":i}</div>`).join("");
  $("#deckMix").innerHTML=`<span>单位<b>${units}</b></span><span>法术<b>${spells}</b></span>`;
  $("#deckMsg").textContent=err||"卡组合法，可以保存";
  $("#deckMsg").style.color=err?"":"var(--green)";
  $("#deckSave").disabled=!!err;
}
$("#deckHeroes").addEventListener("click",e=>{const b=e.target.closest("button");if(!b||b.dataset.h===DW.hero)return;DW={hero:b.dataset.h,list:Me.deck(b.dataset.h).slice()};renderDeck();});
$("#deckCards").addEventListener("click",e=>{
  const b=e.target.closest("button[data-a]");const row=e.target.closest(".dc");if(!row)return;
  const id=row.dataset.id,c=C.PROFILES[DW.hero].cards.find(x=>x.id===id);
  const n=DW.list.filter(x=>x===id).length;
  if(b&&b.dataset.a==="-"){const i=DW.list.lastIndexOf(id);if(i>=0)DW.list.splice(i,1);}
  else if(b||e.target.closest(".card")){
    if(n>=c.limit){toast(`【${c.name}】最多携带 ${c.limit} 张`);return;}
    if(DW.list.length>=C.DECK_SIZE){toast(`卡组已满 ${C.DECK_SIZE} 张`);return;}
    DW.list.push(id);
  }
  Audio2.sfx("click");
  const top=$("#deckCards").scrollTop;renderDeck();$("#deckCards").scrollTop=top;
});
$("#deckReset").addEventListener("click",()=>{DW.list=C.defaultDeck(DW.hero);renderDeck();});
$("#deckClear").addEventListener("click",()=>{DW.list=[];renderDeck();});
$("#deckFill").addEventListener("click",()=>{
  const cards=C.PROFILES[DW.hero].cards.slice().sort((a,b)=>a.cost-b.cost);
  let guard=0;
  while(DW.list.length<C.DECK_SIZE&&guard++<200){
    const c=cards.find(x=>DW.list.filter(y=>y===x.id).length<x.limit);if(!c)break;DW.list.push(c.id);
  }
  renderDeck();
});
$("#deckSave").addEventListener("click",()=>{
  const err=C.deckError(DW.hero,DW.list);if(err){toast(err);return;}
  Me.saveDeck(DW.hero,DW.list);closeModal("#mDeck");toast("卡组已保存",true);Audio2.sfx("select");
  Net.profile();
});

/* ============================================================
   联机
   ============================================================ */
const Net={
  socket:null,inLobby:false,room:null,lobby:null,myId:null,searching:false,searchSince:0,gameOn:false,pendingJoin:null,
  connect(){
    if(this.socket)return;
    if(typeof io!=="function"){toast("无法连接服务器（联机功能需要通过服务器访问）");return false;}
    const s=this.socket=io({transports:["websocket","polling"],reconnectionDelay:800,reconnectionDelayMax:4000});
    s.on("connect",()=>{
      $("#netDot").classList.add("on");$("#connBanner").hidden=true;
      s.emit("hello",{clientId:Me.cid,nick:Me.nick,hero:Me.hero,deck:Me.deck(Me.hero)},r=>{
        if(!r||!r.ok)return;this.myId=r.id;
        if(r.nick&&r.nick!==Me.nick){Me.nick=r.nick;renderHome();}
        if(this.pendingJoin){const c=this.pendingJoin;this.pendingJoin=null;this.joinRoom({code:c});}
      });
    });
    s.on("disconnect",()=>{$("#netDot").classList.remove("on");if(this.inLobby||this.room)$("#connBanner").hidden=false;});
    s.on("kicked",d=>{toast(d.reason||"连接已断开");this.leaveAll();});
    s.on("lobby",d=>{this.lobby=d;renderLobby();});
    s.on("lobby:chatlog",list=>{$("#lobbyChatLog").innerHTML="";list.forEach(m=>chatLine("#lobbyChatLog",m));});
    s.on("lobby:chat",m=>chatLine("#lobbyChatLog",m));
    s.on("room",r=>this.onRoom(r));
    s.on("room:chatlog",list=>{$("#roomChatLog").innerHTML="";list.forEach(m=>chatLine("#roomChatLog",m));});
    s.on("room:chat",m=>chatLine("#roomChatLog",m));
    s.on("match:status",d=>{this.searching=d.searching;if(d.searching){this.searchSince=Date.now();openModal("#mMatch");}else closeModal("#mMatch");});
    s.on("game",u=>this.onGame(u));
    s.on("game:emote",d=>GameUI.showEmote(d.who,d.id));
    s.on("game:notice",d=>GameUI.notice(d.text,d.ok));
    return true;
  },
  profile(){if(this.socket&&this.socket.connected)this.socket.emit("profile",{nick:Me.nick,hero:Me.hero,deck:Me.deck(Me.hero)});},
  enterLobby(){
    if(this.connect()===false)return;
    this.inLobby=true;store.set("online","1");
    if(this.room){show("#scrRoom");renderRoom();}else{show("#scrLobby");renderLobby();}
  },
  leaveAll(){
    this.inLobby=false;store.del("online");this.room=null;this.gameOn=false;
    if(this.socket){this.socket.disconnect();this.socket=null;}
    closeModal("#mMatch");$("#connBanner").hidden=true;
    if(GameUI.active&&GameUI.mode==="online")GameUI.stop();
    show("#scrHome");renderHome();
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
    if(r){closeModal("#mMatch");this.searching=false;}
    if(!this.inLobby)return;
    if(this.gameOn)return;
    if(r){if(!had)Audio2.sfx("match");show("#scrRoom");renderRoom();}
    else{show("#scrLobby");renderLobby();}
  },
  onGame(u){
    if(!this.gameOn){
      this.gameOn=true;
      closeModal("#mMatch");$$(".modal").forEach(m=>m.hidden=true);
      show("#scrGame");
      GameUI.start(this.ctl,"online",{tutorial:store.get("coach","")!=="1",onAgain:()=>this.backToRoomAfterGame(),onExit:()=>this.backToLobbyAfterGame()});
    }
    GameUI.push(u);
  },
  act(a){
    return new Promise(res=>{
      if(!this.socket||!this.socket.connected){res({ok:false,error:"与服务器的连接已断开"});return;}
      const t=setTimeout(()=>res({ok:false,error:"服务器无响应，请稍后再试"}),8000);
      this.socket.emit("game:action",a,r=>{clearTimeout(t);res(r||{ok:false});});
    });
  },
  ctl:{act:a=>Net.act(a),emote:id=>Net.socket&&Net.socket.emit("game:emote",id)},
  backToRoomAfterGame(){
    this.gameOn=false;GameUI.stop();
    if(this.room){show("#scrRoom");renderRoom();}else{show("#scrLobby");renderLobby();}
  },
  backToLobbyAfterGame(){
    this.gameOn=false;GameUI.stop();
    if(this.room)this.socket.emit("room:leave");
    show("#scrLobby");renderLobby();
  }
};

function fmtTime(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
function chatLine(box,m){
  const el=document.createElement("div");el.className="msg"+(m.sys?" sys":"");
  if(m.sys)el.textContent=m.text;
  else{const b=document.createElement("b");b.textContent=m.nick;el.appendChild(b);el.appendChild(document.createTextNode(m.text));const t=document.createElement("span");t.className="t";t.textContent=fmtTime(m.ts);el.appendChild(t);}
  const log=$(box);const stick=log.scrollTop+log.clientHeight>=log.scrollHeight-30;
  log.appendChild(el);while(log.children.length>80)log.firstChild.remove();
  if(stick)log.scrollTop=log.scrollHeight;
}

/* ---------- 大厅 ---------- */
function renderLobby(){
  const me=Me.hero;
  const mc=$("#lobbyMe");mc.style.setProperty("--hcr",V.heroRgb(me));
  mc.innerHTML=`${crest(me)}<div class="who"><b>${V.esc(Me.nick)}</b><div>当前卡牌师：${V.esc(me)} · ${V.esc(C.HERO_INFO[me].title)}</div></div><button class="btn" id="lobbyHero">更换卡牌师</button><button class="btn" id="lobbyDeck">卡组</button>`;
  $("#lobbyHero").onclick=()=>pickHero(h=>{Me.hero=h;Net.profile();renderLobby();renderHome();});
  $("#lobbyDeck").onclick=()=>openDeck(Me.hero);
  const L=Net.lobby;
  $("#lobbyOnline").textContent=L?`在线 ${L.online}${L.queue?` · 匹配中 ${L.queue}`:""}`:"连接中…";
  const box=$("#roomList");
  if(!L){box.innerHTML=`<div class="empty">正在连接服务器…</div>`;return;}
  if(!L.rooms.length){box.innerHTML=`<div class="empty">还没有房间。<br>点击 <b>快速匹配</b> 自动寻找对手，或 <b>创建房间</b> 把房间号发给朋友。</div>`;return;}
  box.innerHTML=L.rooms.map(r=>{
    const full=r.players.length>=2,playing=r.status!=="waiting";
    const can=!full&&!playing;
    return`<div class="room-card"><div class="rc-top"><span class="rc-name">${r.locked?"🔒 ":""}${V.esc(r.name)}</span><span class="rc-code">#${V.esc(r.code)}</span><span class="tag ${playing?"play":"wait"}">${playing?"对局中":full?"已满":"等待中"}</span></div>
      <div class="rc-players">${r.players.map(p=>`<span style="--hcr:${V.heroRgb(p.hero)}"><i>${V.esc(p.hero)}</i>${V.esc(p.nick)}</span>`).join("")}${r.players.length<2?`<span class="muted">空位</span>`:""}</div>
      ${can?`<button class="btn btn-primary" data-join="${V.esc(r.id)}">加入</button>`:""}</div>`;
  }).join("");
}
$("#roomList").addEventListener("click",e=>{const b=e.target.closest("[data-join]");if(b)Net.joinRoom({id:b.dataset.join});});
$("#lobbyBack").addEventListener("click",()=>Net.leaveAll());
$("#btnQuick").addEventListener("click",()=>{if(Net.socket){Net.socket.emit("match:quick");}});
$("#matchCancel").addEventListener("click",()=>{Net.socket&&Net.socket.emit("match:cancel");closeModal("#mMatch");});
setInterval(()=>{if(Net.searching)$("#matchTime").textContent=`已等待 ${Math.floor((Date.now()-Net.searchSince)/1000)} 秒`;},500);
$("#btnCreate").addEventListener("click",()=>{$("#crName").value="";$("#crPass").value="";openModal("#mCreate");setTimeout(()=>$("#crName").focus(),50);});
$("#crGo").addEventListener("click",()=>{
  Net.socket.emit("room:create",{name:$("#crName").value,password:$("#crPass").value},r=>{if(r&&r.ok)closeModal("#mCreate");else toast((r&&r.error)||"创建失败");});
});
$("#joinCodeForm").addEventListener("submit",e=>{e.preventDefault();const c=$("#joinCode").value.trim();if(!c)return;Net.joinRoom({code:c});});
$("#lobbyChatForm").addEventListener("submit",e=>{e.preventDefault();const t=$("#lobbyChatIn").value.trim();if(!t||!Net.socket)return;Net.socket.emit("lobby:chat",t);$("#lobbyChatIn").value="";});

/* ---------- 房间 ---------- */
let roomTick=null;
function renderRoom(){
  const r=Net.room;if(!r)return;
  $("#roomTitle").textContent=r.name;$("#roomCode").textContent=r.code;
  r.seats.forEach((s,i)=>{
    const el=$("#seat"+i);
    if(!s){el.className="seat empty-seat";el.style.removeProperty("--hcr");el.innerHTML=`<div style="font-size:30px">＋</div><div>等待对手加入…</div><div class="small">把房间号 <b style="color:var(--gold2)">${V.esc(r.code)}</b> 发给朋友</div>`;return;}
    el.className="seat";el.style.setProperty("--hcr",V.heroRgb(s.hero));
    el.innerHTML=`${i===r.you?`<span class="you">你</span>`:""}${s.host?`<span class="host">房主</span>`:""}${crest(s.hero)}<div><div class="nick">${V.esc(s.nick)}</div><div class="hn">${V.esc(s.hero)} · ${V.esc(C.HERO_INFO[s.hero].title)}</div></div><div class="st${s.ready?" ready":""}">${s.ready?"✔ 已准备":"未准备"}</div>${s.connected?"":`<div class="off">连接中断…</div>`}`;
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
$("#roomHero").addEventListener("click",()=>pickHero(h=>{Me.hero=h;Net.profile();renderHome();}));
$("#roomLeave").addEventListener("click",()=>{Net.socket&&Net.socket.emit("room:leave");});
$("#roomCodeBtn").addEventListener("click",async()=>{
  const r=Net.room;if(!r)return;
  const url=location.origin+location.pathname+"?room="+r.code;
  try{await navigator.clipboard.writeText(url);toast("邀请链接已复制，发给朋友即可加入",true);}
  catch(e){toast("房间号："+r.code,true,4000);}
});
$("#roomChatForm").addEventListener("submit",e=>{e.preventDefault();const t=$("#roomChatIn").value.trim();if(!t||!Net.socket)return;Net.socket.emit("room:chat",t);$("#roomChatIn").value="";});

/* ============================================================
   启动
   ============================================================ */
renderHome();
show("#scrHome");
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
window.__cd={Me,Net,GameUI,startSolo,get solo(){return solo;}};
})();
