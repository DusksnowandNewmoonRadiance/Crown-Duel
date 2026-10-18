/* ============================================================================
   对局特效 · FX（极简版）
   ----------------------------------------------------------------------------
   语言和界面保持一致：**细线 / 硬边 / 少量大形状 / 一个字**。
   不用发光光晕、不用彩色粒子雨、不用径向渐变洗屏——
     · 冲击 = 一圈 1.5px 的细环 + 6 道放射刻线 + 一帧微闪
     · 宣告 = 一个字 + 两侧细线展开（电影字幕，而不是霓虹灯）
     · 施法 = 上下黑边压进来（letterbox）+ 画面轻轻压暗
     · 位移 = 一条 1.5px 的线从 A 划到 B
   所有动画都走 cubic-bezier 缓动，短、准、不弹跳。
   ============================================================================ */
const FX=(()=>{
  const W=1280;let H=720;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const layerRoot=()=>document.getElementById("fx");
  let scale=()=>1;
  const E_OUT="cubic-bezier(.2,.7,.3,1)",E_REV="cubic-bezier(.16,.84,.28,1)",E_IN="cubic-bezier(.5,0,.85,.35)";

  /* 语义色：只用这一个低饱和色板，不跟卡牌师的艳色走 */
  const C={
    hit:"#e0776a", heal:"#7fb79a", armor:"#bcc9d0", buff:"#d3b184",
    mana:"#8fb8d8", curse:"#a98bc9", paper:"#e7dfd2", white:"#ffffff"
  };
  const esc=s=>String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));

  function setScale(fn){scale=fn;}
  function setH(h){H=h;}
  function pos(el){
    const st=document.getElementById("stage").getBoundingClientRect(),r=el.getBoundingClientRect(),s=scale();
    return{x:(r.left+r.width/2-st.left)/s,y:(r.top+r.height/2-st.top)/s,w:r.width/s,h:r.height/s};
  }
  function add(css,html){const d=document.createElement("div");d.style.cssText=css;if(html!=null)d.innerHTML=html;layerRoot().appendChild(d);return d;}
  function run(el,kf,opt,keep){
    try{
      const a=el.animate(kf,Object.assign({fill:"forwards",easing:E_OUT},opt));
      const done=()=>{try{el.remove();}catch(e){}};
      if(keep)a.onfinish=null;else{a.onfinish=done;a.oncancel=done;}
      return a;
    }catch(e){try{el.remove();}catch(_){}}
  }

  /* ---------------- 基础积木 ---------------- */

  /* 画面压暗：给特效腾出「对比」，不是发光 */
  function focus(op,ms,z){
    const l=add(`position:absolute;inset:0;z-index:${z||199};pointer-events:none;background:#05060a;opacity:0;transition:opacity ${ms||180}ms ${E_OUT}`);
    requestAnimationFrame(()=>l.style.opacity=String(op));
    return l;
  }
  /* 一帧白闪（很低的不透明度，只是「亮了一下」） */
  function flash(op){
    const l=add(`position:absolute;inset:0;z-index:206;pointer-events:none;background:#fff;opacity:0;transition:opacity 70ms linear`);
    requestAnimationFrame(()=>{l.style.opacity=String(op||.07);setTimeout(()=>{l.style.opacity="0";setTimeout(()=>l.remove(),120);},70);});
  }
  /* 上下黑边：电影感的核心道具 */
  let barsT=null;
  function bars(hold){
    const h=Math.round(H*.072);
    if(barsT){clearTimeout(barsT.t);clearTimeout(barsT.d);barsT.t0.remove();barsT.b0.remove();}
    const t=add(`position:absolute;left:0;right:0;top:0;height:${h}px;background:#04040a;z-index:200;pointer-events:none;transform:translateY(-100%);transition:transform 240ms ${E_OUT}`);
    const b=add(`position:absolute;left:0;right:0;bottom:0;height:${h}px;background:#04040a;z-index:200;pointer-events:none;transform:translateY(100%);transition:transform 240ms ${E_OUT}`);
    requestAnimationFrame(()=>{t.style.transform="none";b.style.transform="none";});
    const d=setTimeout(()=>{t.style.transform="translateY(-100%)";b.style.transform="translateY(100%)";setTimeout(()=>{t.remove();b.remove();},300);},hold||900);
    barsT={t:d,t0:t,b0:b};
    return t;
  }
  /* 细线横扫：direction h/v */
  function sweep(color,ms,opt){
    const o=opt||{},c=color||C.white;
    const horizontal=o.dir!=="v";
    const size=o.span||(horizontal?W:H);
    const d=add(horizontal
      ? `position:absolute;left:0;top:${o.at!=null?o.at+"px":"50%"};width:100%;height:${o.thick||1}px;background:linear-gradient(90deg,transparent,${c} 18%,${c} 82%,transparent);z-index:203;pointer-events:none;opacity:0`
      : `position:absolute;left:${o.at!=null?o.at+"px":"50%"};top:0;height:100%;width:${o.thick||1}px;background:linear-gradient(180deg,transparent,${c} 18%,${c} 82%,transparent);z-index:203;pointer-events:none;opacity:0`);
    run(d,horizontal
      ?[{transform:"translateX(-100%)",opacity:0},{opacity:.9,offset:.15},{transform:"translateX(100%)",opacity:0}]
      :[{transform:"translateY(-100%)",opacity:0},{opacity:.9,offset:.15},{transform:"translateY(100%)",opacity:0}],
      {duration:ms||700,easing:E_IN});
    return d;
  }
  /* 取景刻度脉冲：四角括号亮一下 */
  function framePulse(color,ms){
    const c=color||C.white;
    const box=add(`position:absolute;inset:10px;z-index:204;pointer-events:none;opacity:.9`);
    box.innerHTML=["left:0;top:0;border-left:1px solid VAR;border-top:1px solid VAR",
      "right:0;top:0;border-right:1px solid VAR;border-top:1px solid VAR",
      "left:0;bottom:0;border-left:1px solid VAR;border-bottom:1px solid VAR",
      "right:0;bottom:0;border-right:1px solid VAR;border-bottom:1px solid VAR"]
      .map(s=>`<i style="position:absolute;width:14px;height:14px;${s.replace(/VAR/g,c)}"></i>`).join("");
    run(box,[{opacity:0,transform:"scale(1.01)"},{opacity:1,transform:"scale(1)"},{opacity:0,offset:.75}],{duration:ms||620});
    return box;
  }

  /* 命中：细环 + 放射刻线 + 微闪 */
  function hit(x,y,color,size){
    const c=color||C.hit,r=(size||1);
    const ring=add(`position:absolute;left:${x}px;top:${y}px;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:2px solid ${c};z-index:203;pointer-events:none`);
    run(ring,[{transform:"scale(.35)",opacity:1},{transform:`scale(${4.2*r})`,opacity:0}],{duration:420,easing:E_REV});
    const core=add(`position:absolute;left:${x}px;top:${y}px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:${c};z-index:203;pointer-events:none`);
    run(core,[{transform:"scale(1.4)",opacity:1},{transform:"scale(.4)",opacity:0}],{duration:200,easing:E_OUT});
    for(let i=0;i<8;i++){
      const a=(Math.PI*2*i)/8+(i%2?0.12:0),deg=a*180/Math.PI,len=(26+Math.random()*18)*r;
      const t=add(`position:absolute;left:${x}px;top:${y}px;width:${len}px;height:2px;background:${c};z-index:203;pointer-events:none;transform-origin:0 50%`);
      run(t,[{transform:`rotate(${deg}deg) translateX(14px)`,opacity:1},{transform:`rotate(${deg}deg) translateX(${14+len}px)`,opacity:0}],{duration:340,easing:E_REV});
    }
    flash(.08);
  }

  /* 旧粒子：改成细碎的小方块，不带光晕 */
  function particles(x,y,n,colors,dist,size,dur){
    const c=colors&&colors.length?colors:[C.white];
    for(let i=0;i<n;i++){
      const ang=Math.random()*Math.PI*2,dd=dist*(.35+Math.random()*.75),sz=Math.max(1.5,size*.22*(.7+Math.random()*.7));
      const p=add(`position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz*1.5}px;background:${c[i%c.length]};opacity:.9;z-index:203;pointer-events:none;transform:translate(-50%,-50%)`);
      run(p,[{transform:"translate(-50%,-50%) rotate(0deg) scale(1)",opacity:.9},
        {transform:`translate(calc(-50% + ${Math.cos(ang)*dd}px),calc(-50% + ${Math.sin(ang)*dd+dd*.5}px)) rotate(${(Math.random()*2-1)*160}deg) scale(.5)`,opacity:0}],
        {duration:dur||600,easing:E_OUT});
    }
  }
  function shake(){
    const st=document.getElementById("stage");
    st.classList.remove("shake");void st.offsetWidth;st.classList.add("shake");
    setTimeout(()=>st.classList.remove("shake"),300);
  }

  /* ---------------- 文字：电影字幕式，而不是霓虹灯 ---------------- */
  function bigText(text,color,glow,size,ms,top){
    const s=size||64,d=ms||1300,c=color||C.white;
    const box=add(`position:absolute;left:50%;top:${top||46}%;transform:translate(-50%,-50%);z-index:205;pointer-events:none;display:flex;align-items:center;gap:16px;white-space:nowrap`);
    box.innerHTML=`<i style="display:block;width:0;height:1px;background:${c};opacity:.5"></i><b style="font:600 ${s}px/1 var(--font-ui);letter-spacing:.16em;text-indent:.16em;color:${c};text-shadow:0 2px 26px rgba(0,0,0,.85)">${esc(text)}</b><i style="display:block;width:0;height:1px;background:${c};opacity:.5"></i>`;
    const b=box.querySelector("b"),ls=box.querySelectorAll("i");
    run(b,[{opacity:0,transform:"translateY(7px)",filter:"blur(6px)"},{opacity:1,transform:"none",filter:"blur(0)"}],{duration:240,easing:E_REV},true);
    ls.forEach(i=>run(i,[{width:"0px",opacity:0},{width:"72px",opacity:.5}],{duration:380,delay:90,easing:E_REV},true));
    setTimeout(()=>{
      run(b,[{opacity:1,transform:"none"},{opacity:0,transform:"translateY(-9px)"}],{duration:280});
      ls.forEach(i=>run(i,[{width:"72px",opacity:.5},{width:"72px",opacity:0}],{duration:240}));
      setTimeout(()=>{try{box.remove();}catch(e){}},320);
    },Math.max(0,d-320));
    return box;
  }
  function awaCard(text,ms){
    const d=ms||1200;
    bars(d-200);
    const l=add(`position:absolute;inset:0;z-index:205;pointer-events:none;display:grid;place-content:center;gap:12px;text-align:center;opacity:0`);
    l.innerHTML=`<div style="font:600 44px/1 var(--font-ui);letter-spacing:.22em;text-indent:.22em;color:#eef2f4">${esc(text)}</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:12px"><i style="width:34px;height:1px;background:#6b7478"></i><span style="font:500 10px var(--font-mono);letter-spacing:.28em;color:#7b8488">AWA</span><i style="width:34px;height:1px;background:#6b7478"></i></div>`;
    run(l,[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.75},{opacity:0}],{duration:d,easing:"linear"});
    return l;
  }

  /* 飘字：伤害/治疗数字 —— 只做「弹一下 + 升起」 */
  function float(el,text,cls){
    if(!el||!el.isConnected)return;const p=pos(el);
    const d=add(`left:${p.x}px;top:${p.y}px`);d.className="float "+(cls||"");d.textContent=text;
    setTimeout(()=>d.remove(),1000);
  }
  /* 细环：buff / 选中 */
  function ring(el,color){
    if(!el||!el.isConnected)return;const p=pos(el);
    const d=add(`left:${p.x}px;top:${p.y}px`);d.className="ring";d.style.setProperty("--rc",color||"#fff");
    setTimeout(()=>d.remove(),480);
  }
  /* 碎：少而硬的小方块 */
  function shatter(el,foe){
    if(!el||!el.isConnected)return;const p=pos(el);
    hit(p.x,p.y,foe?C.hit:C.armor,.7);
    for(let i=0;i<7;i++){
      const ang=(Math.PI*2*i)/7+Math.random()*.4,dist=46+Math.random()*64;
      const w=7+Math.random()*9;
      const s=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:${w}px;height:${w*(1.1+Math.random()*.7)}px;background:rgba(226,232,238,.9);z-index:203;pointer-events:none`);
      run(s,[{transform:"translate(-50%,-50%) rotate(0deg)",opacity:1},
        {transform:`translate(calc(-50% + ${Math.cos(ang)*dist}px),calc(-50% + ${Math.sin(ang)*dist+26}px)) rotate(${(Math.random()*2-1)*110}deg)`,opacity:0}],
        {duration:640,easing:"cubic-bezier(.15,.72,.4,1)"});
    }
  }

  /* ============================================================
     剧情 / 精英级大招：全部改成「字幕 + 细线 + 黑边」
     ============================================================ */
  const E={
    async regime(d){
      const T={rus:["俄罗斯政体",C.hit],ukr:["乌克兰政体",C.buff],blr:["白俄罗斯政体",C.mana],all:["联邦 · 三政合一",C.buff]};
      const r=T[d&&d.regime]||T.rus;
      const f=focus(.45,180);
      bars(900);
      framePulse(r[1],760);
      bigText(r[0],r[1],null,54,1300,38);
      Audio2.sfx("spell");
      await sleep(820);
      f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async convert(){ bigText("变废为宝",C.heal,null,50,1200,38);Audio2.sfx("heal");await sleep(760); },
    async transfer(){ bigText("灵魂引渡",C.curse,null,50,1300,38);Audio2.sfx("heal");await sleep(820); },
    async consolidate(){
      const f=focus(.4,160);
      bars(820);
      bigText("整编",C.buff,null,58,1200,38);
      Audio2.sfx("core");shake();
      await sleep(760);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async saturation(){
      const f=focus(.5,180);
      sweep(C.buff,760,{at:H*.42,thick:2});
      for(let i=0;i<3;i++){
        setTimeout(()=>hit(W/2,H*.5,C.buff,1.9-i*.4),i*110);
      }
      Audio2.sfx("satur");shake();
      await sleep(700);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async superman(){
      const f=focus(.34,220);
      bars(1100);
      const s=add(`position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:205;pointer-events:none;
        font:800 250px/1 var(--font-ui);color:rgba(255,255,255,.04);-webkit-text-stroke:2px ${C.curse};letter-spacing:-.04em`);
      s.textContent="S";
      run(s,[{transform:"translate(-50%,-50%) scale(1.1)",opacity:0},{transform:"translate(-50%,-50%) scale(1)",opacity:1,offset:.22},{transform:"translate(-50%,-51%) scale(1)",opacity:1,offset:.8},{transform:"translate(-50%,-53%) scale(1)",opacity:0}],{duration:1320,easing:E_REV});
      const r=add(`position:absolute;left:50%;top:50%;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;border:2px solid ${C.curse};z-index:204;pointer-events:none`);
      run(r,[{transform:"scale(.55)",opacity:.9},{transform:"scale(2.8)",opacity:0}],{duration:960,easing:E_REV});
      Audio2.sfx("core");shake();
      await sleep(1000);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async peopleArmy(){
      const f=focus(.5,180);
      bars(1100);
      for(let i=0;i<3;i++)setTimeout(()=>sweep(C.hit,700,{at:H*(.3+i*.16),thick:1}),i*120);
      bigText("人民军",C.buff,null,68,1500,42);
      Audio2.sfx("spell");shake();
      await sleep(1000);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async redDawn(){
      const f=focus(.35,160);
      const band=add(`position:absolute;left:0;right:0;bottom:0;height:${Math.round(H*.3)}px;z-index:200;pointer-events:none;background:linear-gradient(0deg,rgba(224,119,106,.32),transparent)`);
      run(band,[{opacity:0,transform:"translateY(30px)"},{opacity:1,transform:"none"}],{duration:420,easing:E_OUT});
      bigText("赤色黎明",C.hit,null,58,1200,58);
      Audio2.sfx("satur");shake();
      await sleep(760);
      band.style.transition="opacity .4s";band.style.opacity="0";setTimeout(()=>band.remove(),440);
      f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async summonScrap(d){
      const f=focus(.25,140);
      for(let i=0;i<6;i++){
        const x=300+Math.random()*680;
        const s=add(`position:absolute;left:${x}px;top:-30px;width:${8+Math.random()*6}px;height:${5+Math.random()*5}px;background:rgba(226,232,238,.75);z-index:201;pointer-events:none;transform:rotate(${Math.random()*70-35}deg)`);
        run(s,[{transform:`translateY(0) rotate(${Math.random()*40-20}deg)`,opacity:1},{transform:`translateY(${H*.5+Math.random()*70}px) rotate(${Math.random()*90-45}deg)`,opacity:0}],{duration:520,delay:i*60,easing:"cubic-bezier(.4,0,.8,.5)"});
      }
      bigText((d&&d.title)||"翻箱倒柜",C.heal,null,44,1000,40);
      Audio2.sfx("spell");
      await sleep(620);f.style.opacity="0";setTimeout(()=>f.remove(),320);
    },
    async summonRed(d){
      const f=focus(.3,140);
      sweep(C.hit,760,{at:H*.66,thick:2});
      for(let i=0;i<9;i++){
        const x=280+i*88;
        const t=add(`position:absolute;left:${x}px;top:${H*.66-70}px;width:1px;height:0;background:${C.buff};opacity:.6;z-index:202;pointer-events:none`);
        run(t,[{height:"0px",opacity:0},{height:"70px",opacity:.6,offset:.5},{height:"70px",opacity:0}],{duration:520,delay:i*40,easing:E_OUT});
      }
      bigText((d&&d.n>=2)?"十月革命":"红色动员",C.buff,null,44,1000,40);
      Audio2.sfx("spell");
      await sleep(620);f.style.opacity="0";setTimeout(()=>f.remove(),320);
    },
    async aoe5(){
      const f=focus(.45,160);
      for(let i=0;i<9;i++){
        const x=280+i*88;
        const t=add(`position:absolute;left:${x}px;top:${H*.12}px;width:1px;height:${H*.24}px;background:${C.buff};opacity:0;z-index:202;pointer-events:none;transform-origin:50% 0`);
        run(t,[{opacity:0,transform:"scaleY(.2)"},{opacity:.85,transform:"scaleY(1)",offset:.35},{opacity:0,transform:"scaleY(1)"}],{duration:560,delay:i*45,easing:E_OUT});
      }
      setTimeout(()=>{hit(W/2,H*.3,C.buff,1.2);Audio2.sfx("hit");shake();},360);
      await sleep(860);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async volley(){
      for(let i=0;i<5;i++)setTimeout(()=>{hit(320+i*140,H*.21,C.buff,.6);Audio2.sfx("hit");},i*70);
      shake();await sleep(520);
    },
    async fireShip(d){
      const f=focus(.35,140);
      const n=Math.max(1,(d&&d.n)||1);
      for(let i=0;i<n+1;i++)setTimeout(()=>sweep(C.hit,520,{at:H*(.3+i*.12),thick:1}),i*90);
      setTimeout(()=>{hit(W/2,H*.55,C.hit,1.5);Audio2.sfx("satur");shake();},220);
      await sleep(700);f.style.opacity="0";setTimeout(()=>f.remove(),380);
    },
    async fireBomb(){ hit(W/2,H*.21,C.hit,1.4);Audio2.sfx("hit");shake();await sleep(420); },
    async finish(d){
      const f=focus(.6,160);
      bars(1200);
      bigText("终结",C.hit,null,72,1300,40);
      setTimeout(()=>bigText("-"+((d&&d.dmg)||0),C.white,null,44,1200,64),220);
      Audio2.sfx("core");shake();
      await sleep(900);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async ritual(){
      const f=focus(.5,200);
      bars(900);
      const mk=(r,dash)=>add(`position:absolute;left:50%;top:50%;width:${r*2}px;height:${r*2}px;margin:-${r}px 0 0 -${r}px;border-radius:50%;border:1px ${dash?"dashed":"solid"} rgba(169,139,201,.6);z-index:201;pointer-events:none`);
      const a=mk(150,true),b=mk(110,false);
      run(a,[{transform:"rotate(0deg)",opacity:0},{opacity:.7,offset:.2},{transform:"rotate(90deg)",opacity:0}],{duration:950,easing:"linear"});
      run(b,[{transform:"rotate(0deg)",opacity:0},{opacity:.9,offset:.25},{transform:"rotate(-70deg)",opacity:0}],{duration:950,easing:"linear"});
      Audio2.sfx("spell");
      await sleep(880);
      f.style.opacity="0";setTimeout(()=>f.remove(),420);
      await E.superman();
    },
    async rebel(d,el){
      if(!el)return;const p=pos(el);
      hit(p.x,p.y,C.curse,.9);
      Audio2.sfx("spell");await sleep(440);
    },
    async destroy(d,el){ if(!el)return;const p=pos(el);particles(p.x,p.y,8,[C.curse,C.white],110,9,520);Audio2.sfx("die");await sleep(320); },
    async gravityLock(){
      const f=focus(.45,180);
      bars(800);
      const r=add(`position:absolute;left:50%;top:${H*.2}px;width:240px;height:240px;margin:-120px 0 0 -120px;border-radius:50%;border:1px solid ${C.curse};z-index:201;pointer-events:none`);
      run(r,[{transform:"scale(1.5)",opacity:.2},{transform:"scale(1)",opacity:.9,offset:.35},{transform:"scale(.9)",opacity:0}],{duration:900,easing:E_REV});
      Audio2.sfx("spell");shake();
      await sleep(760);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async costRaise(){ bigText("费用 +1",C.curse,null,48,1100,40);Audio2.sfx("error");await sleep(680); },
    async evasion(d,el){
      if(!el)return;const p=pos(el);
      const r=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:1.5px solid ${C.heal};z-index:202;pointer-events:none`);
      run(r,[{transform:"scale(1.4)",opacity:0},{transform:"scale(1)",opacity:.9,offset:.35},{transform:"scale(.85)",opacity:0}],{duration:780,easing:E_REV});
      Audio2.sfx("heal");await sleep(560);
    },
    async awaFreeze(){ awaCard("停摆",1100);Audio2.sfx("spell");await sleep(900); },
    async awaDiscover(){ awaCard("选角",900);Audio2.sfx("spell");await sleep(700); },
    async awaJazz(){ awaCard("即兴演出",1200);Audio2.sfx("spell");await sleep(950); },
    async escape(){
      const f=focus(.4,160);
      for(let i=0;i<16;i++){
        const x=Math.random()*W;
        const c=add(`position:absolute;left:${x}px;top:-20px;width:1.5px;height:${10+Math.random()*14}px;background:${C.buff};z-index:203;pointer-events:none;opacity:.8`);
        run(c,[{transform:"translateY(0)",opacity:.9},{transform:`translateY(${H+40}px)`,opacity:0}],{duration:900+Math.random()*600,delay:i*40,easing:"cubic-bezier(.4,0,.9,.4)"});
      }
      bars(1100);
      bigText("成功逃跑",C.buff,null,56,1400,42);
      Audio2.sfx("coin");
      await sleep(1000);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async comet(d,targetEl){
      if(!targetEl)return;const t=pos(targetEl);
      const f=focus(.5,160);
      const sx=W+260,sy=-220,ang=Math.atan2(t.y-sy,t.x-sx)*180/Math.PI;
      const tail=add(`position:absolute;left:${sx}px;top:${sy}px;width:0;height:1.5px;background:linear-gradient(90deg,rgba(255,255,255,0),${C.curse});transform-origin:0 50%;transform:rotate(${ang}deg);z-index:202;pointer-events:none`);
      const head=add(`position:absolute;left:${sx}px;top:${sy}px;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;z-index:203;pointer-events:none`);
      const dx=t.x-sx,dy=t.y-sy;
      run(head,[{transform:"translate(0,0)"},{transform:`translate(${dx}px,${dy}px)`}],{duration:520,easing:"cubic-bezier(.42,.05,.78,.95)"});
      run(tail,[{width:"0px",opacity:.9},{width:`${Math.hypot(dx,dy)}px`,opacity:.6}],{duration:520,easing:"cubic-bezier(.42,.05,.78,.95)"});
      Audio2.sfx("swing");
      await sleep(540);
      hit(t.x,t.y,C.curse,1.4);
      Audio2.sfx("core");shake();
      await sleep(320);f.style.opacity="0";setTimeout(()=>f.remove(),420);
    },
    async decay(d,el){
      if(!el)return;const p=pos(el);
      particles(p.x,p.y,9,[C.curse,"#6d4a8c"],110,8,620);
      const t=add(`left:${p.x}px;top:${p.y-10}px`);t.className="float decay";t.textContent="衰减 -"+((d&&d.n)||0);
      Audio2.sfx("hit");setTimeout(()=>t.remove(),1000);await sleep(440);
    },
    async decayMark(d,el){
      if(!el)return;const p=pos(el);
      hit(p.x,p.y,C.curse,.8);
      const t=add(`left:${p.x}px;top:${p.y-14}px`);t.className="float decay";t.textContent="衰减";
      Audio2.sfx("spell");setTimeout(()=>t.remove(),1000);await sleep(400);
    },
    async lock(d,el){
      if(!el)return;const p=pos(el);
      const r=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:50%;border:1px dashed ${C.curse};z-index:204;pointer-events:none`);
      run(r,[{transform:"rotate(0deg) scale(1.15)",opacity:.2},{transform:"rotate(120deg) scale(1)",opacity:.85,offset:.3},{transform:"rotate(200deg) scale(.95)",opacity:.4}],{duration:900,easing:E_OUT});
      const t=add(`left:${p.x}px;top:${p.y-12}px`);t.className="float decay";t.textContent="锁定";
      Audio2.sfx("spell");setTimeout(()=>t.remove(),1000);await sleep(420);
    },
    async fade(d,el){
      if(!el)return;const p=pos(el);
      particles(p.x,p.y,10,[C.curse,C.white],130,9,700);
      Audio2.sfx("die");await sleep(320);
    },
    async artillery(){ bigText("全亚洲炮兵总司令",C.buff,null,44,1300,38);await E.aoe5(); },
    async breakthrough(){
      const f=focus(.35,140);
      sweep(C.buff,560,{at:H*.22,thick:2});
      bigText("突 破",C.buff,null,60,1000,44);
      Audio2.sfx("core");shake();
      await sleep(620);f.style.opacity="0";setTimeout(()=>f.remove(),380);
    },
    async lowHp(){
      const c=add(`position:absolute;inset:0;z-index:206;pointer-events:none;opacity:0`);
      c.innerHTML=`<i style="position:absolute;inset:14px;border:1px solid rgba(224,119,106,.55)"></i>`;
      run(c,[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.6},{opacity:0}],{duration:1400,easing:"linear"});
      bigText("危 险",C.hit,null,50,1200,44);
    },
    async endGame(win){
      if(win){
        const f=focus(.35,300);
        for(let i=0;i<3;i++)setTimeout(()=>framePulse(C.buff,900),i*160);
        Audio2.sfx("win");
        await sleep(900);
        f.style.opacity="0";setTimeout(()=>f.remove(),500);
      }else Audio2.sfx("lose");
    }
  };

  /* ============================================================
     通用法术特效
     ============================================================ */
  const P={
    /* 弹道：一条 1.5px 的线从 A 划到 B，命中给一次细环 */
    async bolt(from,to,color){
      if(!from||!to)return;
      const a=pos(from),b=pos(to),c=color||C.hit;
      const ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,len=Math.hypot(b.x-a.x,b.y-a.y);
      const tail=add(`position:absolute;left:${a.x}px;top:${a.y}px;width:0;height:1.5px;transform-origin:0 50%;transform:rotate(${ang}deg);background:linear-gradient(90deg,rgba(255,255,255,.1),${c});z-index:203;pointer-events:none`);
      const head=add(`position:absolute;left:${a.x}px;top:${a.y}px;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#fff;z-index:204;pointer-events:none`);
      Audio2.sfx("swing");
      run(tail,[{width:"0px",opacity:.9},{width:`${len}px`,opacity:.75}],{duration:300,easing:E_IN});
      run(head,[{transform:"translate(0,0)"},{transform:`translate(${b.x-a.x}px,${b.y-a.y}px)`}],{duration:300,easing:E_IN});
      await sleep(310);
      hit(b.x,b.y,c,.9);
      Audio2.sfx("hit");
    },
    /* 横扫一整排 */
    async wave(row,color){
      if(!row)return;const p=pos(row),c=color||C.hit;
      const w=add(`position:absolute;left:${p.x-p.w/2}px;top:${p.y-p.h/2}px;width:${p.w}px;height:${p.h}px;z-index:203;pointer-events:none;overflow:hidden`);
      const line=document.createElement("div");
      line.style.cssText=`position:absolute;top:0;bottom:0;width:2px;background:linear-gradient(180deg,transparent,${c},transparent)`;
      w.appendChild(line);
      line.animate([{left:"-2px",opacity:0},{left:"0px",opacity:1,offset:.1},{left:w.offsetWidth+"px",opacity:.9},{opacity:0}],{duration:520,easing:E_IN,fill:"forwards"});
      Audio2.sfx("hit");shake();
      setTimeout(()=>w.remove(),560);
      await sleep(420);
    },
    /* 增益：方框描边亮一下 + 上浮文字 */
    async aura(els,color,text){
      const c=color||C.buff;
      els.filter(Boolean).forEach((el,i)=>{
        if(!el.isConnected)return;const p=pos(el);
        setTimeout(()=>{
          const g=add(`position:absolute;left:${p.x-p.w/2-3}px;top:${p.y-p.h/2-3}px;width:${p.w+6}px;height:${p.h+6}px;border:1px solid ${c};z-index:203;pointer-events:none`);
          run(g,[{opacity:0,transform:"scale(.97)"},{opacity:.9,transform:"scale(1)",offset:.25},{opacity:0,transform:"scale(1.02)"}],{duration:640,easing:E_OUT});
          if(text){const t=add(`left:${p.x}px;top:${p.y-18}px`);t.className="float buff";t.textContent=text;setTimeout(()=>t.remove(),1000);}
        },i*70);
      });
      if(els.length)Audio2.sfx("heal");
      await sleep(420);
    },
    /* 治疗：一条上升的细光柱 + 数字 */
    async heal(el){
      if(!el)return;const p=pos(el);
      const g=add(`position:absolute;left:${p.x-6}px;top:${p.y-p.h/2}px;width:12px;height:${p.h+10}px;background:linear-gradient(180deg,transparent,${C.heal});opacity:0;z-index:203;pointer-events:none`);
      run(g,[{opacity:0,transform:"scaleY(.4)"},{opacity:.55,transform:"scaleY(1)",offset:.35},{opacity:0,transform:"scaleY(1)"}],{duration:720,easing:E_OUT});
      for(let k=0;k<5;k++){
        const x=p.x-18+Math.random()*36;
        const s=add(`position:absolute;left:${x}px;top:${p.y+p.h*.3}px;width:1.5px;height:12px;background:${C.heal};z-index:204;pointer-events:none;opacity:.9`);
        run(s,[{transform:"translateY(0)",opacity:.9},{transform:`translateY(${-40-Math.random()*30}px)`,opacity:0}],{duration:760,delay:k*60,easing:E_OUT});
      }
      Audio2.sfx("heal");await sleep(420);
    },
    /* 护甲：一层薄薄的直角护罩 */
    async armor(el){
      if(!el)return;const p=pos(el);
      const s=add(`position:absolute;left:${p.x-p.w/2-2}px;top:${p.y-p.h/2-2}px;width:${p.w+4}px;height:${p.h+4}px;z-index:203;pointer-events:none;
        border:1.5px solid ${C.armor};clip-path:polygon(18% 0,82% 0,100% 16%,100% 84%,82% 100%,18% 100%,0 84%,0 16%)`);
      run(s,[{opacity:0,transform:"scale(.94)"},{opacity:.9,transform:"scale(1)",offset:.3},{opacity:0,transform:"scale(1.02)"}],{duration:680,easing:E_OUT});
      Audio2.sfx("select");await sleep(400);
    },
    /* 抽牌 */
    async draw(from,to,n){
      if(!from||!to)return;const a=pos(from),b=pos(to);
      for(let i=0;i<Math.min(3,n||1);i++){
        setTimeout(()=>{
          const c=add(`position:absolute;left:${a.x}px;top:${a.y}px;z-index:204;pointer-events:none;transform:translate(-50%,-50%) scale(.92)`,"<div class='card-back' style='font-size:4.5px'></div>");
          run(c,[{transform:"translate(-50%,-50%) scale(.92)",opacity:1},
            {transform:`translate(calc(-50% + ${b.x-a.x+(i-1)*26}px),calc(-50% + ${b.y-a.y}px)) rotate(${(i-1)*8}deg) scale(1.06)`,opacity:.16}],
            {duration:460,easing:"cubic-bezier(.3,.7,.4,1)"});
          Audio2.sfx("draw");
        },i*110);
      }
      await sleep(380);
    },
    /* 偷钱：短斜线飞过去，不用 $ 光字 */
    async coins(from,to){
      if(!from||!to)return;const a=pos(from),b=pos(to);
      for(let i=0;i<7;i++){
        const c=add(`position:absolute;left:${a.x+(Math.random()-.5)*40}px;top:${a.y+(Math.random()-.5)*34}px;width:10px;height:1.5px;background:${C.buff};z-index:205;pointer-events:none;opacity:.95`);
        run(c,[{transform:"translate(0,0) rotate(0deg)",opacity:.95},
          {transform:`translate(${b.x-a.x}px,${b.y-a.y}px) rotate(-24deg)`,opacity:0}],
          {duration:520,delay:i*40,easing:"cubic-bezier(.4,0,.6,1)"});
      }
      Audio2.sfx("coin");await sleep(560);
    },
    /* 费用：细晶片 */
    async mana(el,up){
      if(!el)return;const p=pos(el),c=up?C.mana:C.curse;
      for(let i=0;i<8;i++){
        const ang=up?(-Math.PI/2+(Math.random()-.5)*1.4):Math.random()*Math.PI*2,d=34+Math.random()*40;
        const s=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:6px;height:9px;background:${c};z-index:205;pointer-events:none;transform:translate(-50%,-50%)`);
        run(s,[{transform:"translate(-50%,-50%) rotate(0deg)",opacity:.95},
          {transform:`translate(calc(-50% + ${Math.cos(ang)*d}px),calc(-50% + ${Math.sin(ang)*d}px)) rotate(${Math.random()*180-90}deg)`,opacity:0}],
          {duration:560,easing:E_OUT});
      }
      const t=add(`left:${p.x}px;top:${p.y-10}px`);t.className="float "+(up?"mana":"manadown");t.textContent=up?"+1 费用":"-1 费用";
      setTimeout(()=>t.remove(),1000);
      Audio2.sfx(up?"select":"error");await sleep(420);
    },
    /* 冰霜：一排细密斜线扫过 */
    async frost(row){
      if(!row)return;const p=pos(row);
      const f=add(`position:absolute;left:${p.x-p.w/2}px;top:${p.y-p.h/2}px;width:${p.w}px;height:${p.h}px;z-index:203;pointer-events:none;overflow:hidden`);
      for(let i=0;i<14;i++){
        const s=document.createElement("div");
        s.style.cssText=`position:absolute;left:${Math.random()*100}%;top:0;width:1px;height:${18+Math.random()*26}px;background:${C.mana};opacity:.7`;
        f.appendChild(s);
        s.animate([{transform:"translateY(-30px)",opacity:0},{opacity:.8,offset:.25},{transform:`translateY(${p.h}px)`,opacity:0}],{duration:760,delay:i*34,easing:"linear",fill:"forwards"});
      }
      Audio2.sfx("spell");
      setTimeout(()=>f.remove(),1200);
      await sleep(520);
    },
    /* 召唤：一道竖光柱 */
    async pillar(row,color){
      if(!row)return;const p=pos(row),c=color||C.buff;
      const b=add(`position:absolute;left:${p.x-40}px;top:${p.y-p.h/2-40}px;width:80px;height:${p.h+40}px;z-index:203;pointer-events:none;
        background:linear-gradient(180deg,transparent,${c} 30%,${c} 70%,transparent);opacity:0`);
      run(b,[{opacity:0,transform:"scaleX(.5)"},{opacity:.35,transform:"scaleX(1)",offset:.3},{opacity:0,transform:"scaleX(1.1)"}],{duration:640,easing:E_OUT});
      Audio2.sfx("play");await sleep(340);
    },
    /* 弃牌 */
    async discard(el){
      if(!el)return;const p=pos(el);
      particles(p.x,p.y+16,8,[C.hit,C.buff],90,8,520);
      const x=add(`position:absolute;left:${p.x}px;top:${p.y+16}px;width:44px;height:1.5px;background:${C.hit};z-index:205;pointer-events:none;transform-origin:50% 50%`);
      run(x,[{transform:"translate(-50%,-50%) rotate(-24deg) scaleX(0)",opacity:1},{transform:"translate(-50%,-50%) rotate(-24deg) scaleX(1)",opacity:1,offset:.35},{transform:"translate(-50%,-50%) rotate(-24deg) scaleX(1)",opacity:0}],{duration:640,easing:E_OUT});
      Audio2.sfx("die");await sleep(420);
    },
    async selfHit(el){ if(!el)return;const p=pos(el);hit(p.x,p.y,C.hit,.7);Audio2.sfx("hit");await sleep(260); }
  };

  async function cast(steps){
    if(!steps||!steps.length)return;
    await Promise.all(steps.map(s=>{try{return P[s.fx]?P[s.fx](...(s.args||[])):null;}catch(e){console.warn(e);return null;}}));
  }
  async function play(name,data,el){if(E[name]){try{await E[name](data,el);}catch(e){console.warn(e);}}}
  function clear(){
    const r=layerRoot();if(r)r.innerHTML="";
    document.querySelectorAll(".float,.ring").forEach(e=>e.remove());
    if(barsT){clearTimeout(barsT.t);barsT.t0.remove();barsT.b0.remove();barsT=null;}
  }
  return{setScale,setH,pos,float,ring,shake,shatter,play,cast,clear,sleep,hit,bigText,bars,sweep,focus,flash,framePulse};
})();
