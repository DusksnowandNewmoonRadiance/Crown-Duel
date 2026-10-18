/* 对局界面：渲染服务器/本地引擎给出的视图，处理拖拽、点选与动画
   控制器接口：ctl.act(action) -> Promise<{ok,error}>，ctl.chat(text) -> Promise<{ok,error}> */
const GameUI=(()=>{
  const E=window.DuelEngine,C=window.DuelCards,V=CardView;
  const $=s=>document.querySelector(s);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const QUICK=["你好！","打得好！","谢谢","哎呀…","让我想想…","这波稳了","稍等一下","再来一局？"];

  const S={ctl:null,mode:"solo",opts:{},view:null,queue:[],processing:false,waiters:[],
    sel:null,cast:null,press:null,drag:null,inflight:false,prev:{},timer:null,scale:1,
    mulOut:new Set(),resultShown:false,pvT:0,hoverT:0,coach:null,turnBanner:-1,
    chat:{log:[],unread:0,sending:false}};

  /* ============================================================
     布局
     ============================================================ */
  function fit(){
    const wrap=$("#stageWrap");if(!wrap)return;
    const W=wrap.clientWidth,H=wrap.clientHeight;if(!W||!H)return;
    const mobile=W>H&&W<=1100;
    const compact=!mobile&&H/720<.8;
    const SH=mobile?560:compact?660:720;
    const st=$("#stage");
    st.classList.toggle("compact",compact);st.classList.toggle("mobile",mobile);st.style.height=SH+"px";
    S.mobile=mobile;S.SH=SH;FX.setH&&FX.setH(SH);
    $("#aim").setAttribute("viewBox",`0 0 1280 ${SH}`);
    const s=Math.min(W/1280,H/SH);S.scale=s;
    st.style.transform=`translate(${(W-1280*s)/2}px,${(H-SH*s)/2}px) scale(${s})`;
    if(S.coach)placeCoach();
  }
  FX.setScale(()=>S.scale);
  function toStage(x,y){const r=$("#stage").getBoundingClientRect();return{x:(x-r.left)/S.scale,y:(y-r.top)/S.scale};}

  /* ============================================================
     生命周期
     ============================================================ */
  function start(ctl,mode,opts){
    stop(true);
    S.ctl=ctl;S.mode=mode;S.opts=opts||{};
    GameInput.reset();
    S.viewSeq=undefined;S.introShown=false;S.view=null;S.queue=[];S.prev={};S.sel=null;S.cast=null;S.drag=null;S.inflight=false;S.mulOut=new Set();S.resultShown=false;S.turnBanner=-1;
    ["#meRow","#foeRow","#hand","#foeHand","#fx","#logList"].forEach(s=>$(s).innerHTML="");
    ["#mulligan","#pick","#option","#result","#pause","#castBar","#preview","#reveal","#chatPanel","#netNotice","#coach","#aim"].forEach(s=>$(s).hidden=true);
    ["left","top","right","bottom"].forEach(k=>$("#chatPanel").style.removeProperty(k));
    $("#logPanel").classList.add("closed");
    S.chat={log:[],unread:0,sending:false};renderChat();
    $("#pRestart").hidden=mode!=="solo";
    $("#pQuit").textContent=mode==="solo"?"返回主页":"认输并离开";
    buildHero("foe");buildHero("me");
    setTimer(null);
    fit();
    /* 有专属战斗曲的角色参战时换曲；确认对手是谁之前先按剧情/通用曲走 */
    Audio2.music((opts&&opts.campaign&&opts.campaign.hero)?heroBgm(opts.campaign.hero):"duel");
  }
  /* 拿到第一份局面才能确定双方英雄——这时候再把曲子定下来 */
  /* 角色专属战斗曲：没有对应项就走通用 duel.ogg */
  const HERO_BGM={苏苏:"susu",绘梨衣:"eriyi"};
  const heroBgm=h=>HERO_BGM[h]||"duel";
  function pickMusic(v){
    /* 自己或对手有专属曲时优先用（苏苏《赤色铁流》/ 绘梨衣的定制曲） */
    const h=["me","foe"].map(k=>v[k]&&v[k].hero).find(x=>x&&HERO_BGM[x]);
    Audio2.music(h?HERO_BGM[h]:"duel");
  }
  function stop(silent){
    S.ctl=null;S.queue=[];S.waiters.splice(0).forEach(f=>f());
    setTimer(null);FX.clear();hidePreview();GameInput.reset();
    if(S.coach){S.coach=null;$("#coach").hidden=true;}
  }
  function push(u){if(!S.ctl)return;S.queue.push(u);if(!S.processing)processQueue();}
  async function processQueue(){
    S.processing=true;
    // 用 try/finally 包住整个循环：即使 handle / render 在任何地方抛异常，
    // finally 里的 S.processing=false 和 waiters 清理也一定会执行，
    // 保证 UI 不会永久锁死、AI 不会永久卡在 GameUI.idle()。
    try{
      while(S.queue.length&&S.ctl){
        const u=S.queue.shift();
        // 连续销毁或变牌需要逐张展示，按张数延长保护时间，避免读牌时触发看门狗。
        const cardChanges=(u.events||[]).filter(e=>e.t==="burn"||e.t==="transformCard").length;
        const animationLimit=9000+cardChanges*2500;
        let wd;
        const guard=new Promise((_,rej)=>{wd=setTimeout(()=>rej(new Error("animation watchdog")),animationLimit);});
        try{
          await Promise.race([handle(u),guard]);
        }catch(e){
          console.error(e);
          S.viewSeq=u.seq!==undefined?u.seq:S.viewSeq;
          S.view=u.view;
          try{render(true);}catch(e2){console.error("[render recover]",e2);}
        }finally{
          clearTimeout(wd);
        }
      }
    }finally{
      S.processing=false;
      S.waiters.splice(0).forEach(f=>f());
      try{render(false);}catch(e){console.error("[render final]",e);}
    }
  }
  function idle(){return(S.processing||S.queue.length)?new Promise(r=>S.waiters.push(r)):Promise.resolve();}

  /* ============================================================
     处理一次更新：先播放事件动画，再渲染新状态
     ============================================================ */
  async function handle(u){
    const v=u.view;
    if(u.timer!==undefined)setTimer(u.timer);
    if(u.foeOnline===false)notice("对手断线了，等待重连…",false);
    else if(u.foeOnline===true&&!$("#netNotice").hidden&&!$("#netNotice").classList.contains("ok"))$("#netNotice").hidden=true;
    if(u.full||!S.view){
      if(u.seq!==undefined)S.viewSeq=u.seq;
      const first=!S.view;S.view=v;
      if(first&&v.me&&v.foe)pickMusic(v);
      if(S.cast&&!v.myTurn)S.cast=null;
      render(true);
      if(first&&v.phase==="play"&&v.myTurn)S.turnBanner=v.turn;
      postRender(v,null);return;
    }
    const fast=S.queue.length>3||document.hidden;
    let turnEv=null;
    for(const e of u.events){
      if(e.t==="turn"){turnEv=e;continue;}
      if(e.t==="toast"){gtoast(e.text,true,2400);continue;}
      if(e.t==="ce"&&window.__cd&&window.__cd.onCampaignEvent){window.__cd.onCampaignEvent(e);continue;}
      if(fast)continue;
      if(e.t==="play")await animPlay(e);
      else if(e.t==="attack")await animAttack(e);
      else if(e.t==="fx")await animFx(e);
      else if(e.t==="burn")await animCardChange(e,"burn");
      else if(e.t==="transformCard")await animCardChange(e,"transform");
    }
    if(u.seq!==undefined&&S.viewSeq!==undefined&&u.seq<S.viewSeq)return;   // 看门狗已经渲染了更新的状态
    if(u.seq!==undefined)S.viewSeq=u.seq;
    const old=S.view;S.view=v;
    if(S.cast&&(!v.myTurn||!v.me.hand.some(c=>c.uid===S.cast.card.uid)))S.cast=null;
    if(S.sel&&S.sel.type==="hand"&&!v.me.hand.some(c=>c.uid===S.sel.uid))S.sel=null;
    if(S.sel&&S.sel.type==="unit"&&!v.me.board.some(c=>c.uid===S.sel.uid))S.sel=null;
    render(false);
    postRender(v,old);
    if(turnEv&&v.phase==="play"&&S.turnBanner!==v.turn){
      S.turnBanner=v.turn;
      const mine=turnEv.pi===v.you;
      Audio2.sfx(mine?"turn":"enemy");
      if(!fast)await banner(mine?"你的回合":"对手回合",!mine,mine?950:800);
      if(mine)maybeCoach();
    }
  }
  function postRender(v,old){
    if(old&&old.me.hp>10&&v.me.hp<=10&&v.me.hp>0&&v.phase==="play")FX.play("lowHp");
    if(v.phase==="over"&&!S.resultShown){S.resultShown=true;showResult(v);}
    if(v.intro&&v.intro.length&&!S.introShown){
      S.introShown=true;
      v.intro.forEach((x,i)=>setTimeout(()=>gtoast(`${x.who==="me"?"你":"对手"}的【${x.from}】变成了 awa 的【${x.to}】，已洗入牌库`,false,3200),400+i*1500));
    }
  }

  /* ============================================================
     动画
     ============================================================ */
  const unitEl=uid=>document.querySelector(`.unit[data-uid="${uid}"]`);
  const heroEl=side=>$(`#${side}Hero .portrait`);
  async function animPlay(e){
    const mine=e.pi===S.view.you;
    const c=e.card;
    if(!mine){
      Audio2.sfx(c.kind==="unit"?"play":"spell");
      await reveal(c,"对手打出",c.kind==="spell"?1100:850,true);
    }else{
      Audio2.sfx(c.kind==="unit"?"play":"spell");
      const hc=document.querySelector(`.hcard[data-uid="${c.uid}"]`);if(hc)hc.style.opacity="0";
      if(c.kind==="spell"){revealSide(c);await sleep(380);}
    }
    // 特殊 / 精英卡的出牌特效，与按效果生成的通用特效并行播放
    const recipe=window.DuelCardFX?DuelCardFX.recipeFor(c):null;
    const run=recipe&&!recipe.native?CardFX.run(recipe,fxCtx(recipe,e)):null;
    await Promise.all([FX.cast(cardFx(e)),run]);
  }
  function fxCtx(r,e){
    const v=S.view,mine=e.pi===v.you,me=mine?"me":"foe",op=mine?"foe":"me";
    const P=sel=>{const el=$(sel);return el?FX.pos(el):{x:640,y:360,w:600,h:200};};
    const from=P(`#${me}Hero .portrait`);
    let a;
    switch(r.target){
      case"me":a=from;break;
      case"meBoard":a=P(`#${me}Row`);break;
      case"foeBoard":a=P(`#${op}Row`);break;
      case"center":a={x:640,y:360,w:600,h:200};break;
      default:a=P(`#${op}Hero .portrait`);
    }
    return{layer:$("#fx"),W:1280,H:S.SH||720,from,anchor:a,name:e.card.name,shake:FX.shake};
  }
  /* 卡牌效果 → 通用特效。B 弹道打脸 / T 弹道打目标 / W 冲击波 / U 全体增益 / G 火炮增益 / R 俄布增益 / X 目标增益
     H 治疗 / A 护甲 / D 抽牌 / $ 偷钱 / M+ M- 费用 / F 冰霜 / S 召唤 / K 弃牌 / Q 自伤 */
  const CARD_FX={
    heal2:"H",heal3:"H",draw:"D1",drawHeal1:"D1 H",drawArmor:"D1 A",armor1:"A",armor2:"A",hero1:"B",hero2:"B",hero3:"B",draw2:"D2",
    fiveYearPlan:"W D1",scrapToUnits:"S",supplyDeck:"D1",intelSteal:"D1",scrapSearch:"D1",hero99:"B",scrapSummon2:"S",scrapBlast:"B",scrapSweep:"H",neutral:"A",scrapStun:"F",summonPirate:"S",copySmallCannon:"S",susuDeploy:"S",summoncall:"S",decreeRus:"S",decreeUkr:"T",decreeBlr:"A",consolidate:"S",secondDeploy:"T",
    buffAll1:"U:+1/+1",buffAll2:"U:+2/+2",highcommand:"U:+2/+2",buffAll1draw:"U:+1/+1 D1",buffAllCharge:"U:+1/+1",alweiDeploy:"D2 U:+1/+1",pirateBuff:"U:+1攻 D1",
    buffGuns1:"G:+1攻",buffGuns2:"G:+2攻",reload:"G:+3攻 D1",buffGuns2draw:"G:+2攻 D1",buffRed:"R:+2/+2",
    huiliyiDeploy:"D1",buffOneDraw:"X:+2/+2 D1",revengeDeath:"U:亡语 D1",developEnemy:"D1",summonRandomPirate:"S",
    decay2draw:"D1",energyDown2:"M-",lockCap1:"M-",removeRestrict:"B",
    choose4:"T",choose2:"T",choose3x2:"T",
    energyDown:"M-",qixingDeploy:"M-",energyDownDraw:"M- D1",manaBurn:"B M-",starClimb:"M+ M-",ramp:"M+ D1",baimaoDeploy:"M+",
    xiashuiDeploy:"B",yuchunDeploy:"K",
    steal2:"$",steal3:"$",steal4:"$",steal3hero1:"$ B",steal3draw:"$ D1",steal2armor2:"$ A",steal4draw:"$ D1",steal5draw:"B $ D1",
    bribeDraw:"D2 Q $",healDrawSteal:"H D1 $",hero2drawSteal:"B D1 $",supplySteal:"D2 A $",vaultBurst:"D3 A $",
    armor3draw:"A D1",traceBoost:"A D2",timeShield2:"A H",nebulaShield2:"A D2",develop:"D2 A",handoff:"D1 A",crown:"D3 A",supply:"D2 A",draw2armor1:"D2 A",
    damage5:"B",damage6:"B",damage7:"B",unitDamageHero:"B",aoe2:"W B",adapt:"H",
    draw1:"D1",draw3:"D3",raid:"D3",draw1heal2:"D1 H",draw2heal2:"D2 H",heal5draw:"H D1",heal3draw:"H D1",healDraw:"H D1",
    enemyAtkDown:"F",enemyAtkDown1:"F",filterSuperman:"D1",tutorSuperman:"D1",rebelWeakest:"D1",runaway:"A B"
  };
  function cardFx(e){
    const v=S.view,mine=e.pi===v.you,me=mine?"me":"foe",op=mine?"foe":"me";
    let code=CARD_FX[e.card.effect]||"";
    if(e.card.effect==="runaway"&&(mine?v.me:v.foe).money>=C.ESCAPE_TARGET)code="";
    if(!code)return[];
    const casterBoard=(mine?v.me:v.foe).board;
    const myHero=heroEl(me),opHero=heroEl(op),myRow=$("#"+me+"Row"),opRow=$("#"+op+"Row");
    const units=f=>casterBoard.filter(f).map(u=>unitEl(u.uid)).filter(Boolean);
    const steps=[];
    code.split(" ").forEach(tok=>{
      const [k,arg]=tok.split(":");
      if(k==="B")steps.push({fx:"bolt",args:[myHero,opHero,mine?"#ffb36a":"#ff7a62"]});
      else if(k==="T")(e.targets||[]).forEach(id=>steps.push({fx:"bolt",args:[myHero,unitEl(id),"#ffb36a"]}));
      else if(k==="W")steps.push({fx:"wave",args:[opRow]});
      else if(k==="U")steps.push({fx:"aura",args:[units(()=>true),"#f6d27a",arg]});
      else if(k==="G")steps.push({fx:"aura",args:[units(u=>u.gun),"#ffb36a",arg]});
      else if(k==="R")steps.push({fx:"aura",args:[units(u=>u.id==="red"),"#ff8a70",arg]});
      else if(k==="X")steps.push({fx:"aura",args:[(e.targets||[]).map(unitEl),"#f6d27a",arg]});
      else if(k==="H")steps.push({fx:"heal",args:[myHero]});
      else if(k==="A")steps.push({fx:"armor",args:[myHero]});
      else if(k[0]==="D")steps.push({fx:"draw",args:[$("#"+me+"Pile"),$(mine?"#hand":"#foeHand"),+k.slice(1)||1]});
      else if(k==="$")steps.push({fx:"coins",args:[opHero,myHero]});
      else if(k==="M+")steps.push({fx:"mana",args:[$("#"+me+"Hero .mana"),true]});
      else if(k==="M-")steps.push({fx:"mana",args:[$("#"+op+"Hero .mana"),false]});
      else if(k==="F")steps.push({fx:"frost",args:[opRow]});
      else if(k==="S")steps.push({fx:"pillar",args:[myRow]});
      else if(k==="K")steps.push({fx:"discard",args:[$(mine?"#foeHand":"#hand")]});
      else if(k==="Q")steps.push({fx:"selfHit",args:[myHero]});
    });
    return steps;
  }
  async function animAttack(e){
    const mine=e.pi===S.view.you;
    const a=unitEl(e.uid),t=e.target!=null?unitEl(e.target):heroEl(mine?"foe":"me");
    if(!a||!t)return;
    if(!mine){
      const pa0=FX.pos(a),pt0=FX.pos(t);
      Targeting.draw({x:pa0.x,y:pa0.y},{x:pt0.x,y:pt0.y},{tone:"invalid",snap:{x:pt0.x-pt0.w/2,y:pt0.y-pt0.h/2,w:pt0.w,h:pt0.h}});
      await sleep(460);Targeting.hide();
    }
    const pa=FX.pos(a),pt=FX.pos(t);
    const dx=(pt.x-pa.x)*.82,dy=(pt.y-pa.y)*.82;
    a.style.zIndex=60;Audio2.sfx("swing");
    const an=a.animate([
      {transform:"translate(0,0) scale(1)",offset:0,easing:"ease-in"},
      {transform:`translate(${dx}px,${dy}px) scale(1.15)`,offset:.42},
      {transform:`translate(${dx}px,${dy}px) scale(1.15)`,offset:.52},
      {transform:"translate(0,0) scale(1)",offset:1}],{duration:540,easing:"ease-out"});
    await sleep(230);
    FX.ring(t,"#ff9a80");Audio2.sfx("hit");
    if(Math.abs(dy)>100)FX.shake();
    await Promise.race([an.finished.catch(()=>{}),sleep(400)]);
    a.style.zIndex="";
  }
  async function animFx(e){
    const mine=e.pi===S.view.you;
    let el=null;
    if(e.name==="rebel"||e.name==="destroy"||e.name==="fade")el=unitEl(e.uid);
    else if(e.name==="decay")el=heroEl(mine?"me":"foe");
    else if(e.name==="decayMark"||e.name==="lock")el=heroEl(mine?"foe":"me");
    else if(e.name==="evasion")el=heroEl(mine?"me":"foe");
    else if(e.name==="comet")el=heroEl(mine?"foe":"me");
    await FX.play(e.name,e,el);
  }
  async function animCardChange(e,mode){
    if(!e.card)return;
    const mine=e.pi===S.view.you;
    const zone=e.zone||"手牌";
    const sel=zone==="战场"?unitEl(e.card.uid):zone.includes("牌库")?$(mine?"#mePile":"#foePile"):$(mine?"#hand":"#foeHand");
    const p=sel?FX.pos(sel):{x:mine?690:590,y:mine?530:90};
    const x=Math.max(95,Math.min(1185,p.x)),y=Math.max(98,Math.min((S.SH||720)-100,p.y));
    const endY=(S.SH||720)/2;
    const d=document.createElement("div");d.className="card-event";
    d.style.left="640px";d.style.top=endY+"px";
    const face=document.createElement("div");face.className="card-event-face";
    d.appendChild(face);$("#fx").appendChild(d);
    // 发动效果的一方直接看到受影响的牌；对方先看到牌背，再翻开。
    const hidden=e.sourcePi!==undefined&&e.sourcePi!==S.view.you;
    face.innerHTML=hidden?V.back():V.card(e.card);
    const animate=(el,frames,ms)=>el.animate(frames,{duration:ms,easing:"ease-in-out",fill:"forwards"}).finished.catch(()=>{});
    try{
      await animate(d,[{transform:`translate(calc(-50% + ${x-640}px),calc(-50% + ${y-endY}px)) scale(.45)`,opacity:.6},{transform:"translate(-50%,-50%) scale(1)",opacity:1}],300);
      if(hidden){
        await animate(face,[{transform:"rotateY(0)"},{transform:"rotateY(90deg)"}],160);
        face.innerHTML=V.card(e.card);
        await animate(face,[{transform:"rotateY(-90deg)"},{transform:"rotateY(0)"}],180);
      }
      if(mode==="transform"){
        await sleep(350);
        await animate(face,[{transform:"rotateY(0) scale(1)"},{transform:"rotateY(90deg) scale(1.08)"}],220);
        face.innerHTML=V.card(e.into);
        face.classList.add("changed");
        await animate(face,[{transform:"rotateY(-90deg) scale(1.08)"},{transform:"rotateY(0) scale(1)"}],240);
        await sleep(350);
        await animate(d,[{transform:"translate(-50%,-50%) scale(1)",opacity:1},{transform:"translate(-50%,-50%) scale(.55)",opacity:0}],320);
      }else{
        await sleep(350);
        d.classList.add("burning");Audio2.sfx("die");
        await animate(d,[{transform:"translate(-50%,-50%) scale(1)",opacity:1},{transform:"translate(-50%,-62%) rotate(-5deg) scale(.85)",opacity:.8},{transform:"translate(-50%,-92%) rotate(8deg) scale(.5)",opacity:0}],780);
      }
    }finally{d.remove();}
  }
  async function reveal(card,label,ms,foe){
    const r=$("#reveal");r.className=foe?"foe":"";r.innerHTML=`<div class="rl">${V.esc(label)}</div>${V.card(card)}`;r.hidden=false;
    await sleep(ms);r.hidden=true;
  }
  /* 自己打出的法术：在左侧空白处小图展示，不挡住战场 */
  function revealSide(card){
    const d=document.createElement("div");d.className="reveal-side";d.innerHTML=V.card(card);
    $("#fx").appendChild(d);setTimeout(()=>d.remove(),1500);
  }
  async function banner(text,foe,ms){
    const b=$("#banner");b.textContent=text;b.className=foe?"foe":"";void b.offsetWidth;b.classList.add("show");
    await sleep(ms||1000);b.classList.remove("show");
  }

  /* ============================================================
     渲染
     ============================================================ */
  function buildHero(side){
    $(`#${side}Hero`).innerHTML=`
      <div class="portrait" data-hero="${side}"><span class="por-art"></span><span class="glyph"></span><b class="hpb"></b><b class="armb" hidden></b><span class="htag immune" hidden>免疫</span></div>
      <div class="hname"><span class="nm"></span><small class="hr"></small></div>
      <div class="mana"><div class="gems"></div><b class="mn"></b></div>
      <div class="money" hidden><span class="mt"></span><div class="bar"><i></i></div></div>
      <div class="counts"></div>`;
  }
  function ready(){const v=S.view;return!!(v&&v.phase==="play"&&v.myTurn&&!v.pending);}
  function canAct(){return ready()&&!S.inflight&&!S.processing&&!!S.ctl;}

  function watch(key,el,val,kind,full){
    const pv=S.prev[key];S.prev[key]=val;
    if(full||pv===undefined||val===pv)return;
    const d=val-pv;
    if(kind==="hp"){
      FX.float(el,(d>0?"+":"")+d,d>0?"heal":"dmg");Audio2.sfx(d>0?"heal":"hit");
      if(d<=-6)FX.shake();
      if(d<0){el.classList.remove("hit");void el.offsetWidth;el.classList.add("hit");setTimeout(()=>el.classList.remove("hit"),420);}
    }else if(kind==="armor")FX.float(el,(d>0?"+":"")+d+" 护甲","armor");
    else if(kind==="money"&&d>0){FX.float(el,"+"+d+" 元","gold");Audio2.sfx("coin");}
  }
  function renderHero(side,p,full){
    const box=$(`#${side}Hero`);
    box.style.setProperty("--hcr",V.heroRgb(p.hero));
    const por=box.querySelector(".portrait"),g=por.querySelector(".glyph");
    const artEl=por.querySelector(".por-art");
    if(artEl&&window.CardArt&&artEl.dataset.h!==p.hero){
      artEl.dataset.h=p.hero;artEl.innerHTML=CardArt.portrait(p.hero);por.classList.add("has-art");
    }
    g.textContent=V.glyph(p.hero);g.classList.toggle("long",p.hero==="045");
    const hpb=por.querySelector(".hpb");hpb.textContent=Math.max(0,p.hp);hpb.classList.toggle("over",p.hp>p.maxHp);hpb.classList.toggle("low",p.hp<=10);
    const ar=por.querySelector(".armb");ar.hidden=!p.armor;ar.textContent=p.armor;
    por.querySelector(".immune").hidden=!p.heroImmune;
    box.querySelector(".nm").textContent=p.name;
    const lock=S.view.lock?`<span class="lock-tag">停摆</span>`:"";
    let st="";
    if(p.decay>0)st+=`<span class="lock-tag st-decay" title="每个回合开始时受到 ${p.decay} 点伤害">衰减 ${p.decay}</span>`;
    if(p.turnCap!=null)st+=`<span class="lock-tag st-lock">封锁 ${p.playedTurn}/${p.turnCap}</span>`;
    if(p.regime||p.fedTurn){
      const RT={rus:"新单位冲锋 · 无法获得护甲",ukr:"部署与法术伤害 +1 · 新单位生命 -1",blr:"回合结束 +2 护甲 · 新嘲讽 +1 生命 · 新单位无冲锋"};
      const nm=p.fedTurn?"联邦":C.REGIMES[p.regime];
      const tip=p.fedTurn?"苏三世：本回合三种政体的加成同时生效（代价不生效）":(RT[p.regime]||"");
      st+=`<span class="lock-tag st-regime r-${p.fedTurn?"all":p.regime}" title="${V.esc(tip)}">${V.esc(nm)}${p.fedTurn&&p.regime?" · "+V.esc(C.REGIMES[p.regime]):""}</span>`;
    }
    if(p.hero==="绘梨衣")st+=`<span class="lock-tag st-regime r-all" title="皇冠产出：每个回合开始，手牌获得 1 张【碎纸】">皇冠产出</span>`;
    if(p.hero==="白猫")st+=`<button type="button" class="lock-tag st-regime r-all destroy-tag" title="点击查看销毁的卡牌">销毁 ${p.destroyedCards||0} · 查看牌名</button>`;
    if(p.noSpell)st+=`<span class="lock-tag st-lock">禁法术</span>`;
    if((p.nextCap!=null||p.nextNoSpell)&&p.turnCap==null&&!p.noSpell)st+=`<span class="lock-tag st-next">下回合受封锁</span>`;
    box.querySelector(".hr").innerHTML=V.esc(p.hero)+" "+lock+st;
    box.querySelector(".destroy-tag")?.addEventListener("click",()=>{const panel=$("#logPanel");panel.classList.remove("closed");renderLog();});
    let gems="";for(let i=0;i<10;i++)gems+=`<i class="${i<p.energy?"":(i<p.maxEnergy?"used":"lock")}"></i>`;
    box.querySelector(".gems").innerHTML=gems;
    box.querySelector(".mn").textContent=`${p.energy}/${p.maxEnergy}`;
    const mo=box.querySelector(".money");mo.hidden=p.hero!=="猪瘟鱼";
    if(!mo.hidden){mo.querySelector(".mt").innerHTML=`金钱 <b>${p.money}</b> / ${C.ESCAPE_TARGET}`;mo.querySelector("i").style.width=Math.min(100,p.money/C.ESCAPE_TARGET*100)+"%";}
    box.querySelector(".counts").innerHTML=side==="foe"?`手牌 <b>${p.handCount}</b> · 牌库 <b>${p.deckCount}</b>`:`牌库 <b>${p.deckCount}</b>${p.fatigue?` · 疲劳 <b>${p.fatigue}</b>`:""}`;
    watch(side+"hp",por,p.hp,"hp",full);watch(side+"ar",por,p.armor,"armor",full);watch(side+"mo",por,p.money,"money",full);
  }

  function unitHTML(u,side){
    let kw="";
    const ic=n=>DuelIcons.svg(n,{size:"100%",stroke:2.1});
    if(u.charge)kw+=`<i class="charge" title="冲锋">${ic("dash")}</i>`;
    if(u.ignoreTaunt)kw+=`<i class="pierce" title="无视嘲讽">${ic("sword")}</i>`;
    if(u.untargetable)kw+=`<i class="hide" title="隐匿">${ic("ghost")}</i>`;
    if(u.deathDmg>0)kw+=`<i class="death" title="亡语：对敌方英雄造成 ${u.deathDmg} 点伤害">${ic("skull")}</i>`;
    if(u.lifespan>0)kw+=`<i class="fleet" title="限时：下个回合开始时消散">${ic("hourglass")}</i>`;
    let badge="";
    if(u.stun>0)badge=`<span class="badge stun">眩晕</span>`;
    else if(u.strikes>1)badge=`<span class="badge multi">×${Math.max(0,u.atkLeft)}/${u.strikes}</span>`;
    else if(side==="me"&&u.fresh&&!u.charge&&u.atkLeft<=0&&S.view.myTurn)badge=`<span class="badge zz">Zz</span>`;
    const def=u.hero&&C.cardDef(u.hero,u.id);
    const atkB=def&&u.attack>def.atk?" buff":"",hpB=u.health<u.maxHealth?" dmg":(def&&u.maxHealth>def.hp?" buff":"");
    const uart=CardTemplate.unitArt(u);
    return`<div class="u"><div class="ukw">${kw}</div><div class="ua">${uart}</div><div class="un"${u.owner==="awa"?` data-t="${V.esc(u.name)}"`:""}>${V.esc(u.name)}</div>${badge}<div class="ust">${CardTemplate.stat("atk",u.attack,atkB.trim())}${CardTemplate.stat("hp",u.health,hpB.trim())}</div></div>`;
  }
  function unitFlags(u,side){
    const v=S.view;let f="";
    if(u.taunt)f+=" taunt";
    if(u.untargetable)f+=" hide";
    if(u.owner==="awa")f+=" awa";
    const selU=S.sel&&S.sel.type==="unit"?v.me.board.find(x=>x.uid===S.sel.uid):null;
    if(side==="me"){
      const ok=ready()&&!S.cast&&!E.canAttack(u)&&hasTarget(u);
      if(ok)f+=" can";else if(v.myTurn&&(u.atkLeft<=0||u.stun))f+=" tired";
      if(selU&&selU.uid===u.uid)f+=" sel";
    }else if(selU)f+=E.attackTargets(selU,v.foe).units.includes(u.uid)?" tgt":" nt";
    if(S.cast){
      if(S.cast.spec.side===side&&S.cast.spec.eligible.includes(u.uid))f+=S.cast.picked.includes(u.uid)?" picked":" choose";
      else f+=" nt";
    }
    return f;
  }
  function hasTarget(u){const t=E.attackTargets(u,S.view.foe);return t.hero||t.units.length>0;}

  function syncRow(box,units,side,full){
    const map=new Map();
    [...box.children].forEach(el=>{if(!el._dying)map.set(el.dataset.uid,el);});
    const order=[];
    units.forEach(u=>{
      let el=map.get(String(u.uid));
      if(el)map.delete(String(u.uid));
      else{
        el=document.createElement("div");el.dataset.uid=u.uid;el.dataset.side=side;box.appendChild(el);
        if(!full){
          el._enter=true;setTimeout(()=>{el._enter=false;cls(el);},500);
          if(u.id==="superman"){el._slam=true;setTimeout(()=>{el._slam=false;cls(el);},1000);setTimeout(()=>FX.shake(),640);}
        }
      }
      el.dataset.side=side;
      el._base="unit"+unitFlags(u,side);cls(el);
      el.style.setProperty("--hcr",V.heroRgb(u.hero));
      const html=unitHTML(u,side);if(el._sig!==html){el.innerHTML=html;el._sig=html;}
      if(!full&&el._hp!==undefined&&el._hp!==u.health){
        const d=u.health-el._hp;
        setTimeout(()=>FX.float(el,(d>0?"+":"")+d,d>0?"heal":"dmg"),20);
        if(d<0){el._hit=true;cls(el);setTimeout(()=>{el._hit=false;cls(el);},420);}
      }
      el._hp=u.health;
      order.push(el);
    });
    map.forEach(el=>{
      el._dying=true;cls(el);
      if(!full){FX.shatter(el,side==="foe");Audio2.sfx("die");}
      setTimeout(()=>el.remove(),full?0:300);
    });
    let cur=box.firstElementChild;
    for(const el of order){
      while(cur&&cur._dying)cur=cur.nextElementSibling;
      if(cur===el)cur=cur.nextElementSibling;else box.insertBefore(el,cur);
    }
  }
  function cls(el){el.className=el._base+(el._enter?" enter":"")+(el._slam?" slam":"")+(el._hit?" hit":"")+(el._dying?" dying":"");}

  function layoutHand(n){
    const avail=S.mobile?$("#hand").clientWidth:816,w=132;
    const sp=n>1?Math.min(140,(avail-w-10)/(n-1)):0;
    const total=(n-1)*sp+w,start=(avail-total)/2,mid=(n-1)/2;
    return i=>({left:start+i*sp,rot:(i-mid)*(S.mobile?1.7:(n>6?2.2:3)),ty:Math.pow(Math.abs(i-mid),2)*(S.mobile?.45:(n>6?1.1:1.6))});
  }
  function syncHand(full){
    const v=S.view,box=$("#hand"),hand=v.me.hand;
    const map=new Map();[...box.children].forEach(el=>{if(!el._dying)map.set(el.dataset.uid,el);});
    const L=layoutHand(hand.length);let created=0;
    const rd=ready()&&!S.cast;
    hand.forEach((c,i)=>{
      // 数据兜底：坏卡跳过，不要让一张坏卡把整个手牌渲染打断
      if(!c||c.uid===undefined)return;
      let el=map.get(String(c.uid));
      if(el)map.delete(String(c.uid));
      else{el=document.createElement("div");el.dataset.uid=c.uid;box.appendChild(el);if(!full){el._enter=true;created++;setTimeout(()=>{el._enter=false;el.classList.remove("enter");},420);}}
      const p=L(i);
      // playError 现在对视图对象（无 deck 字段）安全，但仍然包一层防御
      let playable=false;
      try{playable=rd&&!E.playError(c,v.me,v.foe);}catch(err){console.error("[syncHand/playError]",err);}
      el.className="hcard"+(c.sealed?" sealed":"")+(playable?" play":"")+(S.sel&&S.sel.type==="hand"&&S.sel.uid===c.uid?" sel":"")+(S.drag&&S.drag.uid===c.uid?" drag":"")+(el._enter?" enter":"");
      el.style.left=p.left+"px";el.style.zIndex=S.sel&&S.sel.uid===c.uid?50:(i+1);
      el.style.setProperty("--rot",p.rot.toFixed(1)+"deg");el.style.setProperty("--ty",p.ty.toFixed(1)+"px");
      const html=V.card(c,{cant:v.myTurn&&v.phase==="play"&&c.cost>v.me.energy});
      if(el._sig!==html){el.innerHTML=html;el._sig=html;}
    });
    // 弃牌立即移除，不走 setTimeout —— 避免卡死时残留空壳 DOM 元素
    map.forEach(el=>{
      el._dying=true;
      el.classList.add("dying");
      el.innerHTML="";
      el.remove();
    });
    if(created)Audio2.sfx("draw");
  }
  function syncFoeHand(){
    const v=S.view,box=$("#foeHand"),n=v.foe.handCount;
    const sp=Math.min(46,(780-60)/Math.max(1,n-1)),total=(n-1)*sp+60,start=(816-total)/2,mid=(n-1)/2;
    let html="";
    for(let i=0;i<n;i++){const c=v.foe.hand[i]||{};html+=`<div class="card-back${c.costUp?" up":""}" style="left:${start+i*sp}px;transform:rotate(${(mid-i)*3}deg) translateY(${Math.abs(i-mid)*-2}px)">${V.backInner()}<span class="glyph">♛</span></div>`;}
    if(box._sig!==html){box.innerHTML=html;box._sig=html;}
  }

  function render(full){
    const v=S.view;if(!v)return;
    renderHero("foe",v.foe,full);renderHero("me",v.me,full);
    syncRow($("#foeRow"),v.foe.board,"foe",full);
    syncRow($("#meRow"),v.me.board,"me",full);
    syncHand(full);syncFoeHand();
    $("#foePile").innerHTML=`${V.back()}<div>对手牌库<b>${v.foe.deckCount}</b></div>`;
    $("#mePile").innerHTML=`${V.back()}<div>我的牌库<b>${v.me.deckCount}</b></div>`;
    $("#turnNo").textContent=v.phase==="mulligan"?"调度阶段":`第 ${Math.max(1,Math.ceil(v.turn/2))} 轮`;
    // 目标高亮
    const selU=S.sel&&S.sel.type==="unit"?v.me.board.find(x=>x.uid===S.sel.uid):null;
    heroEl("foe").classList.toggle("tgt",!!(selU&&E.attackTargets(selU,v.foe).hero));
    renderEndBtn();renderPlayBtn();renderMid();
    renderMulligan();renderPending();renderCastBar();
    $("#meLane").classList.toggle("drop",!!(S.drag||(S.sel&&S.sel.type==="hand")));
    if(!$("#logPanel").classList.contains("closed"))renderLog();
    GameInput.refresh();
  }
  function actionsLeft(){
    const v=S.view;
    if(v.me.hand.some(c=>!E.playError(c,v.me,v.foe)))return"play";
    if(v.me.board.some(u=>!E.canAttack(u)&&hasTarget(u)))return"attack";
    return null;
  }
  function renderEndBtn(){
    const v=S.view,b=$("#endBtn");
    if(v.phase==="mulligan"){b.textContent="调度中";b.disabled=true;b.classList.remove("done");return;}
    if(v.phase==="over"){b.textContent="对局结束";b.disabled=true;b.classList.remove("done");return;}
    if(!v.myTurn){b.textContent="对手回合";b.disabled=true;b.classList.remove("done");return;}
    b.textContent="结束回合";b.disabled=!ready()||S.inflight;
    b.classList.toggle("done",ready()&&!actionsLeft()&&!S.cast);
  }
  function renderPlayBtn(){
    const b=$("#playBtn"),v=S.view;
    const c=S.sel&&S.sel.type==="hand"?v.me.hand.find(x=>x.uid===S.sel.uid):null;
    b.hidden=!S.mobile||!c||!ready()||!!S.cast||!!E.playError(c,v.me,v.foe);
    if(!b.hidden)b.textContent=`打出 ${c.name}`;
  }
  function renderMid(){
    const v=S.view,m=$("#midText");let t="",foe=false;
    if(v.phase==="mulligan")t="调度阶段：换掉不想要的起手牌";
    else if(v.phase==="over")t="对局结束";
    else if(!v.myTurn){t=v.foePending?"对手正在做选择…":"对手回合…";foe=true;}
    else if(v.pending)t="请做出选择";
    else if(S.cast)t=`<b>${V.esc(S.cast.spec.label)}</b>　<small>点击目标　右键 / Esc 取消</small>`;
    else if(S.sel&&S.sel.type==="unit")t="<b>点击目标</b>发起攻击　<small>右键 / Esc 取消</small>";
    else if(S.sel&&S.sel.type==="hand")t=S.mobile?"点战场放下出牌，或点右侧按钮":"<b>点战场</b>放下出牌　<small>右键 / Esc 放回</small>";
    else{const a=actionsLeft();t=a==="play"?"<b>拖动</b>发光的手牌到战场，或<b>点一下</b>再点战场出牌":a==="attack"?"<b>拖动或点击</b>发光的单位，再选择目标":"没有可执行的操作了，点击<b>结束回合</b>";}
    m.innerHTML=t;m.className=foe?"foe":"";
  }
  function renderLog(){
    const v=S.view;if(!v)return;
    const records=[v.me,v.foe].filter(p=>p.hero==="白猫").map(p=>{
      const rows=(p.destroyedLog||[]).slice().reverse().map((r,i)=>`<div class="lg"><b>${(p.destroyedLog||[]).length-i}.</b> ${V.esc(r.name)} <small>（${V.esc(r.zone)} · ${V.esc(r.source)}）</small></div>`).join("");
      return `<section class="destroy-history"><b>${V.esc(p.name)}销毁的卡牌（${p.destroyedCards||0}）</b>${rows||'<div class="lg">暂无</div>'}</section>`;
    }).join("");
    $("#destroyList").innerHTML=records;
    $("#logList").innerHTML=v.log.slice().reverse().map(l=>`<div class="lg ${l.who}">${l.who==="me"?"<b>你</b> ":l.who==="foe"?"<b>对手</b> ":""}${V.esc(l.text)}</div>`).join("");
  }

  /* ---------- 覆盖层 ---------- */
  function renderMulligan(){
    const v=S.view,ov=$("#mulligan");
    if(v.phase!=="mulligan"){ov.hidden=true;return;}
    ov.hidden=false;
    $("#mulSub").textContent=(v.first?"你是先手：起手 4 张，第一回合不抽牌。":"你是后手：起手 5 张。")+"点击卡牌标记要更换的牌。";
    const done=v.mulligan.done;
    const html=v.me.hand.map(c=>`<button class="oc${S.mulOut.has(c.uid)&&!done?" out":""}" data-uid="${c.uid}" ${done?"disabled":""}>${V.card(c)}</button>`).join("");
    const box=$("#mulCards");if(box._sig!==html){box.innerHTML=html;box._sig=html;}
    $("#mulOk").hidden=done;
    $("#mulWait").textContent=done?(v.mulligan.foeDone?"即将开始…":"等待对手完成调度…"):(S.mulOut.size?`将更换 ${S.mulOut.size} 张`:"不更换也可以直接确认");
  }
  function renderPending(){
    const v=S.view,ov=$("#pick");
    if(!v.pending){ov.hidden=true;return;}
    ov.hidden=false;
    $("#pickTitle").textContent=v.pending.title;$("#pickHint").textContent=v.pending.hint;
    const html=v.pending.cards.map((c,i)=>`<button class="oc" data-i="${i}">${V.card(c)}</button>`).join("");
    const box=$("#pickCards");if(box._sig!==html){box.innerHTML=html;box._sig=html;}
  }
  function renderCastBar(){
    const cs=S.cast,bar=$("#castBar");
    if(!cs){bar.hidden=true;return;}
    bar.hidden=false;
    $("#cbCard").innerHTML=V.card(cs.card);
    $("#cbLabel").textContent=cs.spec.label;
    $("#cbCount").textContent=cs.spec.max>1?`已选 ${cs.picked.length} / ${cs.spec.max}`:"点击发光的单位";
    $("#cbOk").hidden=cs.spec.max<=1;
    $("#cbOk").disabled=cs.picked.length<cs.spec.min;
  }
  function showResult(v){
    /* 剧情模式：交给 app 侧的结算弹窗（星级/奖励/升级），不再显示默认结果页 */
    if(S.mode==="campaign"&&S.opts.onOver){
      setTimeout(()=>{if(S.ctl||S.mode==="solo")S.opts.onOver(v);},1100);
      return;
    }
    const win=v.winner==="me",draw=v.winner==="draw";
    setTimeout(()=>{
      if(!S.ctl&&S.mode!=="solo")return;
      const ov=$("#result");
      ov.className="overlay result"+(draw?" draw":win?"":" lose");
      $("#resTitle").textContent=draw?"平 局":win?"胜 利":"失 败";
      $("#resCrown").textContent=draw?"⚖":"♛";
      const why=v.reason&&v.reason!=="击败了对手"?`（${v.reason}）`:"";
      $("#resText").textContent=draw?"双方同时倒下":(win?`你击败了 ${v.foe.name}${why}`:`${v.foe.name} 获胜${why}`);
      const st=v.me.stats||{};
      $("#resStats").innerHTML=`<div><b>${st.dmg||0}</b>对英雄伤害</div><div><b>${st.played||0}</b>打出卡牌</div><div><b>${st.kills||0}</b>消灭单位</div><div><b>${v.me.turnsStarted}</b>回合数</div>`;
      $("#resAgain").textContent=S.mode==="solo"?"再来一局":"返回房间";
      $("#resBack").textContent=S.mode==="solo"?"返回主页":"返回大厅";
      ov.hidden=false;
      if(win&&S.opts.onWin)S.opts.onWin(v);
      FX.play("endGame",win);
      Audio2.music(win?"win":"lose");
    },1100);
  }

  /* ---------- 计时 ---------- */
  function setTimer(t){
    if(!t){S.timer=null;$("#timerBar").hidden=true;return;}
    S.timer={end:performance.now()+t.msLeft,total:t.total};
    $("#timerBar").hidden=false;
  }
  let lastTick=0;
  setInterval(()=>{
    if(!S.timer||!S.view)return;
    const left=Math.max(0,S.timer.end-performance.now());
    const bar=$("#timerBar");
    bar.querySelector("i").style.transform=`scaleX(${left/S.timer.total})`;
    bar.classList.toggle("warn",left<15000);
    const sec=Math.ceil(left/1000);
    const mine=S.view.phase==="mulligan"?!S.view.mulligan.done:S.view.myTurn;
    if(mine&&sec<=10&&sec>0&&sec!==lastTick){lastTick=sec;Audio2.sfx("tick");}
    if(mine&&sec<=15&&S.view.phase==="play"&&!S.cast)$("#midText").innerHTML=`<b>剩余 ${sec} 秒</b>，超时将自动结束回合`;
  },250);

  /* ============================================================
     操作
     ============================================================ */
  async function send(a){
    if(!S.ctl)return{ok:false};
    S.inflight=true;renderEndBtn();
    let r;
    try{r=await S.ctl.act(a);}catch(e){r={ok:false,error:"网络错误，请稍后重试"};}
    S.inflight=false;
    if(!r||!r.ok){gtoast((r&&r.error)||"操作失败");Audio2.sfx("error");}
    render(false);
    return r||{ok:false};
  }
  function openOption(os,c){
    $("#optTitle").textContent=os.label;
    $("#optBtns").innerHTML=os.options.map(o=>`<button data-id="${o.id}">${V.esc(o.label)}</button>`).join("");
    $("#option").hidden=false;
    $("#option")._card=c;
  }
  function canAttackNow(u){
    if(!canAct())return false;
    const e=E.canAttack(u);if(e){gtoast(e,true);return false;}
    return true;
  }
  function shakeTaunts(){document.querySelectorAll("#foeRow .unit.taunt .u").forEach(e=>e.animate([{transform:"translateX(0)"},{transform:"translateX(-6px)"},{transform:"translateX(6px)"},{transform:"translateX(0)"}],{duration:280}));}
  const clearSel=()=>GameInput.clearSel();
  function endTurn(){
    if(!canAct())return;
    if(S.cast)GameInput.cancelCast();
    S.sel=null;hidePreview();Audio2.sfx("click");
    send({type:"end"});
  }

  /* ============================================================
     预览
     ============================================================ */
  function showPreview(c,srcEl,ms){
    if(!c||c.back)return;
    const pv=$("#preview");
    const notes=V.keywordNotes(c);
    pv.innerHTML=V.card(c)+(notes?`<div class="kwlist">${notes}</div>`:"");
    const x=srcEl?FX.pos(srcEl).x:640;
    pv.style.left=(x>640?250:640)+"px";
    pv.hidden=false;
    clearTimeout(S.pvT);if(ms)S.pvT=setTimeout(hidePreview,ms);
  }
  function hidePreview(){clearTimeout(S.pvT);clearTimeout(S.hoverT);$("#preview").hidden=true;}
  function cardOf(el){
    const v=S.view;if(!v||!el)return null;const uid=+el.dataset.uid;
    if(el.classList.contains("hcard"))return v.me.hand.find(c=>c.uid===uid);
    return(el.dataset.side==="me"?v.me:v.foe).board.find(c=>c.uid===uid);
  }

  /* ============================================================
     输入：拖拽 / 点击 / 长按
     ============================================================ */
  function blocked(t){return!!t.closest(".overlay,#coach,#castBar,#sideR,#logPanel,#chatPanel");}

  /* 桌面端：鼠标悬停查看大图 */
  function onOver(e){
    if(e.pointerType!=="mouse"||GameInput.isAiming())return;
    const el=e.target.closest(".unit,.hcard");if(!el)return;
    clearTimeout(S.hoverT);
    S.hoverT=setTimeout(()=>{if(!GameInput.isAiming()&&!S.drag&&el.isConnected&&el.matches(":hover"))showPreview(cardOf(el),el);},el.classList.contains("hcard")?250:400);
  }
  function onOut(e){
    if(e.pointerType!=="mouse")return;
    const el=e.target.closest(".unit,.hcard");if(!el)return;
    if(e.relatedTarget&&el.contains(e.relatedTarget))return;
    clearTimeout(S.hoverT);if(!(S.sel&&S.sel.type==="hand"))hidePreview();
  }

  /* ============================================================
     提示 / 聊天 / 引导
     ============================================================ */
  function gtoast(msg,info,ms){
    const t=$("#gToast");t.textContent=msg;t.className="on"+(info?" info":"");
    clearTimeout(t._t);t._t=setTimeout(()=>{t.className="";},ms||1600);
  }
  function notice(text,ok){
    const n=$("#netNotice");n.textContent=text;n.className=ok?"ok":"";n.hidden=false;
    clearTimeout(n._t);if(ok)n._t=setTimeout(()=>{n.hidden=true;},2500);
  }
  /* ---------- 局内聊天 ---------- */
  const chatMuted=()=>{try{return localStorage.getItem("cd.chatMute")==="1";}catch(e){return false;}};
  function chatOpen(){return!$("#chatPanel").hidden;}
  function showChat(who,text,nick){
    text=String(text||"").slice(0,60);if(!text)return;
    if(who==="foe"&&chatMuted())return;
    S.chat.log.push({who,text,nick:who==="me"?"你":(nick||(S.view&&S.view.foe.name)||"对手")});
    if(S.chat.log.length>60)S.chat.log.shift();
    if(who==="foe"&&!chatOpen())S.chat.unread++;
    renderChat();bubble(who,text);
  }
  function renderChat(){
    const b=$("#chatBadge");b.hidden=!S.chat.unread;b.textContent=S.chat.unread>9?"9+":S.chat.unread;
    const log=$("#chatLog");
    log.innerHTML=S.chat.log.length?S.chat.log.map(m=>`<div class="cm ${m.who}"><b>${V.esc(m.nick)}</b>${V.esc(m.text)}</div>`).join("")
      :`<div class="empty-c">还没有消息，打个招呼吧</div>`;
    log.scrollTop=log.scrollHeight;
  }
  function toggleChat(open){
    const p=$("#chatPanel");
    open=open===undefined?p.hidden:open;
    p.hidden=!open;
    if(open){
      S.chat.unread=0;
      $("#chatQuick").innerHTML=QUICK.map(t=>`<button type="button">${V.esc(t)}</button>`).join("");
      $("#chatMute").checked=chatMuted();
      renderChat();
      if(matchMedia("(hover:hover)").matches)setTimeout(()=>$("#chatIn").focus(),30);
    }else $("#chatIn").blur();
  }
  function setupChatDrag(){
    const panel=$("#chatPanel"),head=panel.querySelector("header");
    let drag=null;
    head.addEventListener("pointerdown",e=>{
      if(e.button!==0||e.target.closest("button,label,input"))return;
      const sr=$("#stage").getBoundingClientRect(),pr=panel.getBoundingClientRect(),scale=S.scale||1;
      drag={id:e.pointerId,scale,sr,w:pr.width/scale,h:pr.height/scale,
        startX:(e.clientX-sr.left)/scale,startY:(e.clientY-sr.top)/scale,
        left:(pr.left-sr.left)/scale,top:(pr.top-sr.top)/scale};
      panel.style.right="auto";panel.style.bottom="auto";
      panel.style.left=`${drag.left}px`;panel.style.top=`${drag.top}px`;
      head.setPointerCapture(e.pointerId);e.preventDefault();
    });
    head.addEventListener("pointermove",e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const x=(e.clientX-drag.sr.left)/drag.scale,y=(e.clientY-drag.sr.top)/drag.scale;
      const maxX=Math.max(0,1280-drag.w),maxY=Math.max(0,(S.SH||720)-drag.h);
      panel.style.left=`${Math.min(maxX,Math.max(0,drag.left+x-drag.startX))}px`;
      panel.style.top=`${Math.min(maxY,Math.max(0,drag.top+y-drag.startY))}px`;
    });
    const end=e=>{if(drag&&drag.id===e.pointerId)drag=null;};
    head.addEventListener("pointerup",end);head.addEventListener("pointercancel",end);
  }
  async function sendChat(text){
    text=String(text||"").trim().slice(0,60);
    if(!text||!S.ctl||!S.ctl.chat||S.chat.sending)return;
    S.chat.sending=true;
    let r;try{r=await S.ctl.chat(text);}catch(e){r={ok:false,error:"发送失败"};}
    S.chat.sending=false;
    if(r&&r.ok)$("#chatIn").value="";
    else gtoast((r&&r.error)||"发送失败");
  }
  function bubble(who,text){
    const st=$("#stage");
    st.querySelectorAll(`.emote-bubble.${who}`).forEach(x=>x.remove());
    const b=document.createElement("div");b.className="emote-bubble "+who;b.textContent=text;
    b.style.top=(who==="me"?400:60)+"px";
    st.appendChild(b);Audio2.sfx("emote");
    setTimeout(()=>b.remove(),4300);
  }

  const COACH=[
    {sel:"#meHero .portrait",text:"这是<b>你的卡牌师</b>。右下角红色数字是<b>生命值</b>，归零就输了。"},
    {sel:"#meHero .mana",text:"这是<b>费用水晶</b>。每回合上限 +1 并回满，出牌要消耗卡牌左上角的费用。"},
    {sel:"#hand",text:"这是你的手牌。<b>绿色发光</b>的牌现在就能打出：把它<b>拖到战场上</b>松手（或者连点两下）。"},
    {sel:"#meLane",text:"单位上场后，<b>绿色发光</b>表示可以攻击：把它<b>拖向</b>敌方单位或英雄。带<b>嘲讽</b>的敌人必须先打。"},
    {sel:"#foeHero .portrait",text:"把<b>对手的生命值</b>打到 0 就能获胜！"},
    {sel:"#endBtn",text:"做完能做的事后点<b>结束回合</b>。按钮<b>变绿</b>说明你已经没有可执行的操作了。"},
    {sel:"#gMenu",text:"<b>长按</b>或<b>鼠标悬停</b>在卡牌上可以查看详细说明。菜单里可以随时重看玩法。祝你好运！"}
  ];
  function maybeCoach(){
    if(!S.opts.tutorial)return;
    let done=false;try{done=localStorage.getItem("cd.coach")==="1";}catch(e){}
    if(done&&!S.opts.forceCoach)return;
    S.opts.tutorial=false;
    S.coach={i:0};$("#coach").hidden=false;placeCoach();
  }
  function placeCoach(){
    const c=S.coach;if(!c)return;const step=COACH[c.i];
    const el=$(step.sel);if(!el){nextCoach();return;}
    const p=FX.pos(el),pad=10;
    const hole=$("#coachHole");
    Object.assign(hole.style,{left:(p.x-p.w/2-pad)+"px",top:(p.y-p.h/2-pad)+"px",width:(p.w+pad*2)+"px",height:(p.h+pad*2)+"px"});
    $("#coachText").innerHTML=step.text;
    $("#coachStep").textContent=`${c.i+1} / ${COACH.length}`;
    $("#coachNext").textContent=c.i===COACH.length-1?"开始游戏":"下一步";
    const tip=$("#coachTip");
    let tx=Math.min(1280-360,Math.max(20,p.x-170));
    let ty=p.y>360?p.y-p.h/2-pad-170:p.y+p.h/2+pad+16;
    if(step.sel==="#meHero .portrait"||step.sel==="#meHero .mana"){tx=p.x+p.w/2+30;ty=Math.min(S.SH-190,Math.max(20,p.y-80));}
    if(step.sel==="#foeHero .portrait"){tx=p.x+p.w/2+30;ty=p.y-40;}
    if(step.sel==="#endBtn"||step.sel==="#gMenu"){tx=Math.max(20,p.x-p.w/2-380);ty=Math.max(20,p.y-50);}
    tip.style.left=tx+"px";tip.style.top=ty+"px";
  }
  function nextCoach(){
    const c=S.coach;if(!c)return;c.i++;
    if(c.i>=COACH.length)endCoach();else placeCoach();
  }
  function endCoach(){S.coach=null;$("#coach").hidden=true;try{localStorage.setItem("cd.coach","1");}catch(e){}}

  /* ============================================================
     事件绑定（只绑定一次）
     ============================================================ */
  /* 输入控制器（src/ui/input.ts）需要的宿主能力 */
  function inputHost(){
    return{
      ui:S,stage:()=>$("#stage"),scale:()=>S.scale,view:()=>S.view,engine:()=>E,canAct,toStage,
      pos:el=>FX.pos(el),unitEl,heroEl,
      handEl:uid=>document.querySelector(`.hcard[data-uid="${uid}"]`),
      laneLimitY:()=>S.mobile?354:492,
      setLane(state,hint){const lane=$("#meLane");lane.classList.toggle("ready",state==="ready");lane.classList.toggle("bad",state==="bad");if(hint)$("#dropHint").textContent=hint;},
      playCard(card,targets){send(targets?{type:"play",uid:card.uid,targets}:{type:"play",uid:card.uid});},
      openOption(card){const os=E.optionSpec(card);if(os){openOption(os,card);return true;}return false;},
      attack(u,target){send({type:"attack",uid:u.uid,target});},
      toast:gtoast,sfx:n=>Audio2.sfx(n),render:()=>render(false),showPreview,hidePreview,shakeTaunts,cardOf,blocked,audioInit:()=>Audio2.init()
    };
  }
  function bind(){
    const st=$("#stage");
    GameInput.attach(inputHost());
    st.addEventListener("pointerover",onOver);
    st.addEventListener("pointerout",onOut);
    $("#endBtn").addEventListener("click",endTurn);
    $("#cbOk").addEventListener("click",()=>GameInput.commitCast());
    $("#cbCancel").addEventListener("click",()=>GameInput.cancelCast());
    $("#mulCards").addEventListener("click",e=>{
      const b=e.target.closest(".oc");if(!b||b.disabled)return;
      const uid=+b.dataset.uid;if(S.mulOut.has(uid))S.mulOut.delete(uid);else S.mulOut.add(uid);
      Audio2.sfx("select");renderMulligan();
    });
    $("#mulOk").addEventListener("click",()=>{Audio2.sfx("click");send({type:"mulligan",uids:[...S.mulOut]});});
    $("#pickCards").addEventListener("click",e=>{
      const b=e.target.closest(".oc");if(!b||S.inflight)return;
      Audio2.sfx("select");send({type:"pick",index:+b.dataset.i});
    });
    $("#optBtns").addEventListener("click",e=>{
      const b=e.target.closest("button");if(!b)return;
      const c=$("#option")._card;$("#option").hidden=true;
      if(c){Audio2.sfx("select");send({type:"play",uid:c.uid,option:b.dataset.id});}
    });
    $("#optCancel").addEventListener("click",()=>{$("#option").hidden=true;});
    $("#gLog").addEventListener("click",()=>{const p=$("#logPanel");p.classList.toggle("closed");if(!p.classList.contains("closed"))renderLog();});
    $("#logClose").addEventListener("click",()=>$("#logPanel").classList.add("closed"));
    $("#gChat").addEventListener("click",()=>toggleChat());
    $("#chatReport").addEventListener("click",()=>{if(S.opts.onReport)S.opts.onReport(S.opts.opponentId,S.opts.opponentName);});
    $("#chatClose").addEventListener("click",()=>toggleChat(false));
    setupChatDrag();
    $("#chatQuick").addEventListener("click",e=>{const b=e.target.closest("button");if(b)sendChat(b.textContent);});
    $("#chatForm").addEventListener("submit",e=>{e.preventDefault();sendChat($("#chatIn").value);});
    $("#chatIn").addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();toggleChat(false);}});
    $("#chatMute").addEventListener("change",e=>{try{localStorage.setItem("cd.chatMute",e.target.checked?"1":"0");}catch(_){}
      if(e.target.checked){S.chat.log=S.chat.log.filter(m=>m.who!=="foe");S.chat.unread=0;$("#stage").querySelectorAll(".emote-bubble.foe").forEach(x=>x.remove());}
      renderChat();});
    $("#gMenu").addEventListener("click",()=>{Audio2.sfx("click");openPause();});
    $("#playBtn").addEventListener("click",()=>GameInput.playHeld());
    $("#pResume").addEventListener("click",()=>$("#pause").hidden=true);
    $("#pSfx").addEventListener("click",()=>{Audio2.setSfx(!Audio2.sfxOn);syncPause();});
    $("#pMusic").addEventListener("click",()=>{Audio2.setMusic(!Audio2.musicOn);syncPause();});
    $("#pFull").addEventListener("click",toggleFull);
    $("#coachNext").addEventListener("click",nextCoach);
    $("#coachSkip").addEventListener("click",endCoach);
    document.addEventListener("keydown",e=>{
      if($("#scrGame").hidden||!S.view)return;
      if(e.target.closest("input"))return;
      if(e.key==="Escape"){
        if(S.coach)endCoach();
        else if(chatOpen())toggleChat(false);
        else if(!$("#pause").hidden)$("#pause").hidden=true;
        else if(!$("#option").hidden)$("#option").hidden=true;
        else if(!GameInput.cancel())openPause();
      }else if($("#pause").hidden&&$("#option").hidden&&!S.coach&&GameInput.onKey(e))e.preventDefault();
      else if((e.key===" "||e.key==="e"||e.key==="E")&&$("#pause").hidden&&!S.cast&&!GameInput.isAiming()){e.preventDefault();endTurn();}
    });
    addEventListener("resize",fit);
    addEventListener("orientationchange",()=>setTimeout(fit,200));
    if(window.visualViewport)visualViewport.addEventListener("resize",fit);
    document.addEventListener("fullscreenchange",()=>{fit();syncPause();});
    document.addEventListener("webkitfullscreenchange",()=>{fit();syncPause();});
    setupFull();
  }
  function openPause(){syncPause();$("#pause").hidden=false;clearSel();}
  function syncPause(){
    $("#pSfx").textContent="音效："+(Audio2.sfxOn?"开":"关");
    $("#pMusic").textContent="音乐："+(Audio2.musicOn?"开":"关");
    $("#pFull").textContent=fsEl()?"退出全屏":"全屏";
    $("#gFull").textContent=fsEl()?"⤢":"⛶";
  }
  /* ---- 全屏：触屏设备首次点按自动进入；手动退出后不再自动进入 ---- */
  const FSK="cd.autoFull";
  const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
  const fsCan=()=>!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);
  const touchy=()=>matchMedia("(pointer:coarse)").matches||navigator.maxTouchPoints>0;
  const standalone=()=>matchMedia("(display-mode: fullscreen)").matches||matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  async function enterFull(){
    const el=document.documentElement;
    try{
      if(el.requestFullscreen)await el.requestFullscreen({navigationUI:"hide"});
      else if(el.webkitRequestFullscreen)el.webkitRequestFullscreen();
      try{await screen.orientation.lock("landscape");}catch(e){}
    }catch(e){}
    setTimeout(fit,200);
  }
  async function toggleFull(){
    try{
      if(fsEl()){try{localStorage.setItem(FSK,"0");}catch(e){}await(document.exitFullscreen?document.exitFullscreen():document.webkitExitFullscreen());}
      else{try{localStorage.removeItem(FSK);}catch(e){}await enterFull();}
    }catch(e){}
    syncPause();setTimeout(fit,200);
  }
  function autoFull(){
    if(!touchy()||!fsCan()||fsEl()||standalone())return;
    try{if(localStorage.getItem(FSK)==="0")return;}catch(e){}
    enterFull();
  }
  function setupFull(){
    const can=fsCan()&&!standalone();
    $("#gFull").hidden=!(touchy()&&can);
    $("#rotFull").hidden=!(touchy()&&can);
    const ios=touchy()&&!fsCan()&&!standalone();
    $("#rotIos").hidden=!ios;
    $("#pFull").hidden=!can;
    $("#gFull").addEventListener("click",()=>{Audio2.sfx("click");toggleFull();});
    $("#rotFull").addEventListener("click",()=>toggleFull());
    // 触屏设备在对局里的第一次点按进入全屏（浏览器要求必须由点按触发）
    $("#scrGame").addEventListener("pointerdown",e=>{if(e.pointerType==="touch")autoFull();},{passive:true});
  }
  bind();

  return{start,stop,push,idle,fit,showChat,notice,gtoast,openCoach(){S.opts.tutorial=true;S.opts.forceCoach=true;maybeCoach();},
    get view(){return S.view;},get mode(){return S.mode;},get opts(){return S.opts;},get active(){return!!S.ctl;}};
})();

