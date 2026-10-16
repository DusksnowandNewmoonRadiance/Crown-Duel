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
  ["#scrHome","#scrLobby","#scrRoom","#scrDecks","#scrCodex","#scrGame"].forEach(s=>$(s).hidden=s!==id);
  if(id==="#scrGame")GameUI.fit();
  if(id==="#scrHome"||id==="#scrLobby"||id==="#scrRoom"||id==="#scrDecks"||id==="#scrCodex")Audio2.music("menu");
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
  deck(h){return Decks.activeCards(h);},
  deckName(h){return Decks.active(h).name;},
  get cid(){let c=store.get("cid","");if(!/^[A-Za-z0-9_-]{8,64}$/.test(c)){c=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9-]/g,"");store.set("cid",c);}return c;}
};

/* ============================================================
   主页
   ============================================================ */
function heroTile(h,on){
  const info=C.HERO_INFO[h],p=C.PROFILES[h];
  return`<button class="htile${on?" on":""}" data-hero="${V.esc(h)}" style="--hcr:${V.heroRgb(h)}">${info.difficulty===1?`<span class="badge">新手推荐</span>`:""}${crest(h)}<strong>${V.esc(h)}</strong><small>${V.esc(info.title)}</small><span class="stars" title="上手难度">${stars(info.difficulty)}</span></button>`;
}
function deckSelectHTML(h){
  const act=Decks.active(h).id;
  const opts=[{id:"default:"+h,name:"官方推荐"}].concat(Decks.list(h).filter(d=>!Decks.error(d)).sort((a,b)=>b.updatedAt-a.updatedAt));
  return`<select id="homeDeck">${opts.map(d=>`<option value="${V.esc(d.id)}"${d.id===act?" selected":""}>${V.esc(d.name)}</option>`).join("")}</select>`;
}
function renderHome(){
  const cur=Me.hero;
  $("#heroGrid").innerHTML=HEROES.map(h=>heroTile(h,h===cur)).join("");
  const p=C.PROFILES[cur],info=C.HERO_INFO[cur];
  const d=$("#heroDetail");d.style.setProperty("--hcr",V.heroRgb(cur));
  d.innerHTML=`${crest(cur)}<div><h3>${V.esc(cur)}<small>${V.esc(info.title)}</small></h3>
    <div class="meta"><span>阵营 <b>${V.esc(p.faction)}</b></span><span>风格 <b>${V.esc(p.style)}</b></span><span>生命 <b>${p.hp}</b></span><span>难度 <b style="color:var(--gold)">${stars(info.difficulty)}</b></span></div>
    <p class="tip">${V.esc(info.tip)}</p>
    <div class="deck-pick"><label for="homeDeck">出战卡组</label>${deckSelectHTML(cur)}<button class="btn" id="homeDeckEdit">管理卡组</button><button class="btn" id="homeLore">查看档案</button></div></div>`;
  $("#homeNickTxt").textContent=Me.nick||"设置昵称";
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
function openSolo(){
  const me=Me.hero;
  $("#soloMe").innerHTML=`${crest(me)}<span style="--hcr:${V.heroRgb(me)}">${V.esc(me)}<small class="muted" style="display:block;font:500 12px var(--sans)">卡组：${V.esc(Me.deckName(me))}</small></span><button class="btn" id="soloChange">更换</button>`;
  $("#soloMe").style.setProperty("--hcr",V.heroRgb(me));
  $("#soloChange").onclick=()=>pickHero(h=>{Me.hero=h;renderHome();openSolo();});
  if(Solo.opp===me)Solo.opp="";
  $("#soloOpp").innerHTML=`<button class="rand${!Solo.opp?" on":""}" data-v="">随机对手</button>`+HEROES.filter(h=>h!==me).map(h=>`<button data-v="${V.esc(h)}" class="${Solo.opp===h?"on":""}" style="color:${Solo.opp===h?"":C.COLORS[h]}">${V.esc(h)}</button>`).join("");
  /* 敌方卡组选择：选七星作战时出现（随机 / 衰减流 / 星联邦流） */
  const df=$("#soloOppDeckField");
  df.hidden=!(me==="七星");
  $$("#soloOppDeck button").forEach(b=>b.classList.toggle("on",b.dataset.v===Solo.oppDeck));
  $$("#soloLevel button").forEach(b=>b.classList.toggle("on",b.dataset.v===Solo.level));
  openModal("#mSolo");
}
$("#soloOpp").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.opp=b.dataset.v;store.set("soloOpp",Solo.opp);openSolo();});
$("#soloOppDeck").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.oppDeck=b.dataset.v;store.set("soloOppDeck",Solo.oppDeck);openSolo();});
$("#soloLevel").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;Solo.level=b.dataset.v;store.set("soloLevel",Solo.level);$$("#soloLevel button").forEach(x=>x.classList.toggle("on",x===b));});
$("#soloGo").addEventListener("click",()=>{closeModal("#mSolo");startSolo();});

class LocalController{
  constructor(){
    const me=Me.hero;
    const others=HEROES.filter(h=>h!==me);
    const foe=Solo.opp&&Solo.opp!==me?Solo.opp:others[Math.floor(Math.random()*others.length)];
    /* 敌方卡组：七星 AI 可用衰减流/星联邦流——选了七星作战时可指定，否则随机 */
    let foeDeck=C.aiDeck(foe);
    if(foe==="七星"&&Solo.oppDeck&&Solo.oppDeck!=="random"){
      const pd=C.presetDeck("七星",Solo.oppDeck);
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
function startSolo(){
  if(solo)solo.dispose();
  solo=new LocalController();
  show("#scrGame");
  GameUI.start(solo,"solo",{tutorial:store.get("coach","")!=="1",onAgain:()=>startSolo(),onExit:()=>exitGame()});
  solo.begin();
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
function pickHero(cb){
  pickCb=cb;
  $("#heroGrid2").innerHTML=HEROES.map(h=>heroTile(h,h===Me.hero)).join("");
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
   联机
   ============================================================ */
const Net={
  socket:null,inLobby:false,room:null,lobby:null,myId:null,searching:false,searchSince:0,gameOn:false,pendingJoin:null,
  seq:null,hbTimer:null,hbMiss:0,wasDown:false,
  connect(){
    if(this.socket)return;
    if(typeof io!=="function"){toast("无法连接服务器（联机功能需要通过服务器访问）");return false;}
    const s=this.socket=io({transports:["websocket","polling"],reconnectionDelay:800,reconnectionDelayMax:4000});
    s.on("connect",()=>{
      $("#netDot").classList.add("on");$("#connBanner").hidden=true;
      s.emit("hello",{clientId:Me.cid,nick:Me.nick,hero:Me.hero,deck:Me.deck(Me.hero)},r=>{
        if(!r||!r.ok)return;this.myId=r.id;
        if(this.wasDown&&this.gameOn){GameUI.notice("已重新连接",true);}
        this.wasDown=false;this.hbMiss=0;
        Live.checkBuild(r.build);Live.setMaint(r.maintenance);
        if(r.nick&&r.nick!==Me.nick){Me.nick=r.nick;renderHome();}
        if(this.pendingJoin){const c=this.pendingJoin;this.pendingJoin=null;this.joinRoom({code:c});}
      });
    });
    s.on("disconnect",()=>{
      $("#netDot").classList.remove("on");if(this.inLobby||this.room)$("#connBanner").hidden=false;
      if(this.gameOn){this.wasDown=true;GameUI.notice("网络连接中断，正在自动重连…（对局会为你保留一段时间）",false);}
    });
    s.io.on("reconnect_attempt",n=>{if(this.gameOn&&n>=2)GameUI.notice(`网络不佳，正在重连…（第 ${n} 次）`,false);});
    s.io.on("reconnect_failed",()=>{if(this.gameOn)GameUI.notice("重连失败，请检查网络后刷新页面",false);});
    this.startHeartbeat();
    s.on("kicked",d=>{toast(d.reason||"连接已断开");this.leaveAll();});
    s.on("lobby",d=>{this.lobby=d;renderLobby();});
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
    s.on("announce",d=>Live.onAnnounce(d));
    s.on("broadcast",d=>sysMsg("bc","📣 "+d.text,{ms:15000}));
    s.on("maintenance",m=>Live.setMaint(m));
    s.on("content",()=>Live.loadContent(false));
    s.on("build",d=>Live.checkBuild(d.build));
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
    else{show("#scrLobby");renderLobby();}
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
  ctl:{act:a=>Net.act(a),chat:text=>new Promise(res=>{
    if(!Net.socket||!Net.socket.connected)return res({ok:false,error:"与服务器的连接已断开"});
    const t=setTimeout(()=>res({ok:false,error:"服务器无响应"}),6000);
    Net.socket.emit("game:chat",text,r=>{clearTimeout(t);res(r||{ok:false});});
  })},
  backToRoomAfterGame(){
    this.gameOn=false;this.seq=null;GameUI.stop();setTimeout(()=>Live.afterGame(),0);
    if(this.room){show("#scrRoom");renderRoom();}else{show("#scrLobby");renderLobby();}
  },
  backToLobbyAfterGame(){
    this.gameOn=false;this.seq=null;GameUI.stop();setTimeout(()=>Live.afterGame(),0);
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
  mc.innerHTML=`${crest(me)}<div class="who"><b>${V.esc(Me.nick)}</b><div>${V.esc(me)} · ${V.esc(C.HERO_INFO[me].title)} · 卡组：${V.esc(Me.deckName(me))}</div></div><button class="btn" id="lobbyHero">更换卡牌师</button><button class="btn" id="lobbyDeck">卡组</button>`;
  $("#lobbyHero").onclick=()=>pickHero(h=>{Me.hero=h;Net.profile();renderLobby();renderHome();});
  $("#lobbyDeck").onclick=()=>openDecks(Me.hero);
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
$("#roomDeck").addEventListener("click",()=>openDecks(Me.hero));
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
    if(this.maint.on&&!m.restarting)sysMsg("maint","🔧 "+this.maint.message,{id:"sysMaint",sticky:true});
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
    $("#newsList").innerHTML=this.news.map(n=>`<button class="news-item${n.id===cur.id?" on":""}" data-id="${V.esc(n.id)}">${!seen.has(n.id+"@"+n.updatedAt)&&n.id!==cur.id?'<span class="red-dot"></span>':""}<b><span class="ntag t${V.esc(n.type)}">${V.esc(n.type)}</span>${n.pinned?"📌 ":""}${V.esc(n.title)}</b><small>${fmt(n.createdAt)}</small></button>`).join("");
    $("#newsDetail").innerHTML=`<h3>${V.esc(cur.title)}</h3><div class="when"><span class="ntag t${V.esc(cur.type)}">${V.esc(cur.type)}</span>${new Date(cur.createdAt).toLocaleString("zh-CN",{hour12:false})}${cur.updatedAt>cur.createdAt+60000?" · 已编辑":""}</div><div class="txt">${V.esc(cur.body)}</div>`;
    $("#newsDetail").scrollTop=0;
  },
  /* 来自服务器的推送 */
  onAnnounce(d){
    this.loadNews(false).then(()=>{
      if(!d||!d.latest)return;
      if(d.latest.popup&&!this.inGame())this.openNews(this.news.find(n=>n.id===d.latest.id));
      else sysMsg("bc",`📢 新公告：${d.latest.title}`,{action:"查看",onAction:()=>this.openNews(this.news.find(n=>n.id===d.latest.id))});
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

/* ============================================================
   启动
   ============================================================ */
renderHome();
show("#scrHome");
Live.boot();
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
})();
