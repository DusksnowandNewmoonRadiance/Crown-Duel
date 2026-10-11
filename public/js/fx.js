/* 对局特效：全部画在 #fx 图层上，坐标为舞台坐标（1280×720） */
const FX=(()=>{
  const W=1280,H=720;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const layerRoot=()=>document.getElementById("fx");
  let scale=()=>1;
  function setScale(fn){scale=fn;}
  function pos(el){
    const st=document.getElementById("stage").getBoundingClientRect(),r=el.getBoundingClientRect(),s=scale();
    return{x:(r.left+r.width/2-st.left)/s,y:(r.top+r.height/2-st.top)/s,w:r.width/s,h:r.height/s};
  }
  function add(css,html){const d=document.createElement("div");d.style.cssText=css;if(html)d.innerHTML=html;layerRoot().appendChild(d);return d;}
  function fadeLayer(bg,z){
    const l=add(`position:absolute;inset:0;z-index:${z||200};pointer-events:none;background:${bg};opacity:0;transition:opacity .3s`);
    requestAnimationFrame(()=>l.style.opacity="1");
    return l;
  }
  function out(l,ms){setTimeout(()=>{l.style.opacity="0";setTimeout(()=>l.remove(),400);},ms);}
  function shake(){const st=document.getElementById("stage");st.classList.remove("shake");void st.offsetWidth;st.classList.add("shake");setTimeout(()=>st.classList.remove("shake"),340);}

  function float(el,text,cls){
    if(!el||!el.isConnected)return;const p=pos(el);
    const d=add(`left:${p.x}px;top:${p.y}px`);d.className="float "+cls;d.textContent=text;setTimeout(()=>d.remove(),1150);
  }
  function ring(el,color){
    if(!el||!el.isConnected)return;const p=pos(el);
    const d=add(`left:${p.x}px;top:${p.y}px`);d.className="ring";d.style.setProperty("--rc",color||"#fff");setTimeout(()=>d.remove(),560);
  }
  function particles(x,y,n,colors,dist,size,dur){
    for(let i=0;i<n;i++){
      const ang=Math.random()*Math.PI*2,dd=dist*(.4+Math.random()*.8),sz=size*(.6+Math.random()*.8);
      const c=colors[i%colors.length];
      const p=add(`position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${c};box-shadow:0 0 10px ${c};transform:translate(-50%,-50%);z-index:203;transition:transform ${dur}ms cubic-bezier(.15,.6,.35,1),opacity ${dur}ms`);
      requestAnimationFrame(()=>{p.style.transform=`translate(calc(-50% + ${Math.cos(ang)*dd}px),calc(-50% + ${Math.sin(ang)*dd}px)) scale(.3)`;p.style.opacity="0";});
      setTimeout(()=>p.remove(),dur+80);
    }
  }
  function shatter(el,foe){
    if(!el||!el.isConnected)return;const p=pos(el);
    const c1=foe?"#c07a64":"#5aa58c",c2=foe?"#3d2b27":"#172220";
    const f=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:radial-gradient(circle,#fff,${c1},transparent 70%);filter:blur(4px);z-index:202;animation:shatter .35s ease-out forwards`);
    setTimeout(()=>f.remove(),400);
    for(let i=0;i<18;i++){
      const ang=Math.random()*Math.PI*2,dist=80+Math.random()*150,sz=6+Math.random()*10,rot=(Math.random()*2-1)*540;
      const s=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:${sz}px;height:${sz*1.4}px;background:linear-gradient(160deg,${c1},${c2});border:1px solid rgba(255,255,255,.2);z-index:203;transform:translate(-50%,-50%);transition:transform .55s cubic-bezier(.1,.7,.5,1),opacity .55s`);
      requestAnimationFrame(()=>{s.style.transform=`translate(calc(-50% + ${Math.cos(ang)*dist}px),calc(-50% + ${Math.sin(ang)*dist}px)) rotate(${rot}deg) scale(.4)`;s.style.opacity="0";});
      setTimeout(()=>s.remove(),650);
    }
  }
  function bigText(text,color,glow,size,ms,top){
    const d=add(`position:absolute;left:50%;top:${top||46}%;transform:translate(-50%,-50%);font:900 ${size||64}px/1 var(--serif);color:${color};text-shadow:0 0 30px ${glow},0 0 70px ${glow},0 6px 20px #000;letter-spacing:.2em;white-space:nowrap;z-index:205;animation:bigText ${ms||1300}ms ease-out forwards`,"");
    d.textContent=text;setTimeout(()=>d.remove(),(ms||1300)+50);
  }
  function awaCard(text,ms){
    const l=add("position:absolute;inset:0;z-index:205;pointer-events:none;display:grid;place-content:center;gap:10px;text-align:center;background:repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 2px,transparent 2px 5px),rgba(10,12,14,.6);opacity:0;font-family:var(--mono);color:#e8eef2",
      `<div style="font-size:44px;font-weight:700;letter-spacing:.4em;text-shadow:0 0 18px #fff">${text}</div><div style="font-size:13px;letter-spacing:.3em;color:#9aa4aa">署名：awa</div>`);
    l.animate([{opacity:0},{opacity:1,offset:.18},{opacity:1,offset:.7},{opacity:0}],{duration:ms,fill:"forwards"});
    setTimeout(()=>l.remove(),ms+50);
  }

  const E={
    async saturation(){
      const l=fadeLayer("radial-gradient(ellipse at 50% 50%,rgba(224,102,79,.42),rgba(5,8,9,.7) 60%)");
      for(let i=0;i<3;i++){const w=add(`position:absolute;left:50%;top:50%;width:200px;height:200px;margin:-100px 0 0 -100px;border-radius:50%;border:4px solid ${["#ffb0a0","#ffd9a8","#f0d18e"][i]};box-shadow:0 0 50px #e0664f;z-index:201;animation:satWave 1.1s ${i*.15}s ease-out forwards;opacity:0`);w.style.opacity="";setTimeout(()=>w.remove(),1500);}
      particles(W/2,H/2,26,["#ffd9a8","#e0664f"],260,8,900);
      Audio2.sfx("satur");shake();out(l,1100);await sleep(700);
    },
    async superman(){
      const l=fadeLayer("radial-gradient(circle at 50% 50%,rgba(138,107,196,.45),rgba(5,8,9,.88) 60%)");
      const r=add("position:absolute;left:50%;top:50%;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;border:3px solid rgba(179,156,232,.65);box-shadow:0 0 80px #8a6bc4,inset 0 0 60px rgba(138,107,196,.7);z-index:201;animation:burst 1.4s ease-out forwards");
      bigText("S","#f0e8ff","#8a6bc4",220,1500,50);
      Audio2.sfx("core");shake();out(l,1300);setTimeout(()=>r.remove(),1500);await sleep(1000);
    },
    async peopleArmy(){
      const l=fadeLayer("radial-gradient(circle at 50% 50%,rgba(224,102,79,.35),rgba(5,8,9,.85) 60%)");
      l.innerHTML=`<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(224,102,79,.15) 0 2px,transparent 2px 14px);animation:scan 1.2s linear infinite"></div>`;
      bigText("人民军","#f6dca0","#e0664f",84,1600);
      Audio2.sfx("spell");shake();out(l,1400);await sleep(1100);
    },
    async redDawn(){
      const l=fadeLayer("linear-gradient(0deg,rgba(224,102,79,.55),transparent 55%)");
      bigText("赤色黎明","#ffd9a8","#d9634d",64,1200,62);
      Audio2.sfx("satur");shake();out(l,1000);await sleep(800);
    },
    async summonRed(d){
      const l=fadeLayer("radial-gradient(ellipse at 50% 100%,rgba(224,102,79,.45),transparent 55%)");
      add("position:absolute;left:236px;right:228px;top:470px;height:4px;background:linear-gradient(90deg,transparent,#d9634d,#ffd9a8,#d9634d,transparent);box-shadow:0 0 30px #d9634d;z-index:201;animation:sweep 1s ease-out forwards");
      bigText(d&&d.n>=2?"十月革命":"红色动员","#f6dca0","#d9634d",46,1000,38);
      Audio2.sfx("spell");out(l,900);setTimeout(()=>{[...layerRoot().children].forEach(c=>{if(c.style.animation.includes("sweep"))c.remove();});},1100);await sleep(600);
    },
    async aoe5(){
      const l=fadeLayer("rgba(5,8,9,.55)");
      for(let i=0;i<9;i++){
        const x=280+Math.random()*720;
        const d=add(`position:absolute;left:${x}px;top:-60px;width:12px;height:60px;border-radius:6px;background:linear-gradient(180deg,#ffd9a8,#d9634d);box-shadow:0 0 20px #ff8a70;z-index:201;transition:top .35s cubic-bezier(.5,0,.9,.3),opacity .3s`);
        setTimeout(()=>{d.style.top="140px";},i*60);
        setTimeout(()=>{d.style.opacity="0";const b=add(`position:absolute;left:${x}px;top:150px;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:4px solid #ffd9a8;box-shadow:0 0 50px #d9634d;z-index:202;animation:burst .8s ease-out forwards`);Audio2.sfx("hit");shake();setTimeout(()=>b.remove(),900);},i*60+340);
        setTimeout(()=>d.remove(),1200);
      }
      out(l,1200);await sleep(1000);
    },
    async volley(){
      for(let i=0;i<6;i++){const x=300+i*120+Math.random()*40;setTimeout(()=>{const b=add(`position:absolute;left:${x}px;top:150px;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:4px solid #ffd9a8;box-shadow:0 0 40px #d9634d;z-index:202;animation:burst .7s ease-out forwards`);Audio2.sfx("hit");setTimeout(()=>b.remove(),800);},i*80);}
      shake();await sleep(600);
    },
    async fireShip(d){
      const l=fadeLayer("radial-gradient(circle at 50% 50%,rgba(255,140,60,.35),rgba(5,8,9,.7) 65%)");
      particles(W/2,400,Math.max(8,(d&&d.n||1)*6),["#ffd9a8","#e5533d","#ff9a50"],280,26,1000);
      Audio2.sfx("satur");shake();out(l,1000);await sleep(800);
    },
    async fireBomb(){particles(W/2,150,20,["#ffd9a8","#e5533d"],260,14,800);Audio2.sfx("hit");shake();await sleep(500);},
    async finish(d){
      const l=fadeLayer("radial-gradient(circle at 50% 50%,rgba(60,20,20,.65),rgba(5,8,9,.9) 70%)");
      bigText("☠","#ffd9a8","#d9634d",130,1300,38);
      setTimeout(()=>bigText("-"+((d&&d.dmg)||0),"#ffd9a8","#d9634d",58,1300,62),150);
      Audio2.sfx("core");shake();out(l,1300);await sleep(900);
    },
    async ritual(){
      const l=fadeLayer("radial-gradient(circle at 50% 50%,rgba(138,107,196,.35),rgba(5,8,9,.88) 60%)",199);
      l.innerHTML=`<div style="position:absolute;left:50%;top:50%;width:400px;height:400px;margin:-200px 0 0 -200px;border-radius:50%;border:2px dashed rgba(179,156,232,.75);box-shadow:0 0 60px #8a6bc4;animation:spin 2.2s linear infinite"></div><div style="position:absolute;left:50%;top:50%;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;border:2px solid rgba(226,180,103,.6);animation:spin 1.6s linear infinite reverse"></div>`;
      Audio2.sfx("spell");out(l,950);await sleep(1000);await E.superman();
    },
    async rebel(d,el){
      if(!el)return;const p=pos(el);
      const r=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:4px solid #b39ce8;box-shadow:0 0 40px #8a6bc4,inset 0 0 20px #fff;z-index:202;animation:burst .8s ease-out forwards`);
      Audio2.sfx("spell");setTimeout(()=>r.remove(),850);await sleep(500);
    },
    async destroy(d,el){if(!el)return;const p=pos(el);particles(p.x,p.y,18,["#b39ce8","#fff"],140,10,700);Audio2.sfx("die");await sleep(350);},
    async gravityLock(){
      const l=fadeLayer("radial-gradient(ellipse at 50% 0%,rgba(138,107,196,.45),rgba(5,8,9,.75) 65%)");
      l.innerHTML=`<div style="position:absolute;left:50%;top:150px;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;border:3px solid rgba(179,156,232,.6);box-shadow:0 0 60px #8a6bc4,inset 0 0 60px rgba(138,107,196,.6);animation:gravPull 1.2s ease-out forwards"></div>`;
      Audio2.sfx("spell");shake();out(l,1000);await sleep(800);
    },
    async costRaise(){const l=fadeLayer("radial-gradient(ellipse at 50% 0%,rgba(168,80,112,.45),rgba(5,8,9,.75) 65%)");bigText("费用 +1","#ffb0c8","#a85070",60,1200,36);Audio2.sfx("error");out(l,1000);await sleep(700);},
    async evasion(d,el){
      if(!el)return;const p=pos(el);
      const r=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;border:4px solid #4fc0b0;box-shadow:0 0 50px #4fc0b0,inset 0 0 30px #9be2d6;z-index:202;animation:gravPull 1.4s ease-out reverse forwards`);
      Audio2.sfx("heal");setTimeout(()=>r.remove(),1450);await sleep(500);
    },
    async awaFreeze(){awaCard("∅ 停摆",1300);Audio2.sfx("spell");await sleep(1000);},
    async awaDiscover(){awaCard("※ 选角",900);Audio2.sfx("spell");await sleep(700);},
    async awaJazz(){awaCard("♪ 即兴演出",1300);Audio2.sfx("spell");await sleep(1000);},
    async escape(){
      const l=fadeLayer("radial-gradient(circle at 50% 40%,rgba(240,200,100,.4),rgba(5,8,9,.85) 70%)");
      for(let i=0;i<30;i++){const x=Math.random()*W;const c=add(`position:absolute;left:${x}px;top:-30px;font:700 26px var(--serif);color:#f2cf73;text-shadow:0 0 10px #c9a040;z-index:203;transition:top ${900+Math.random()*700}ms ease-in`,"$");setTimeout(()=>c.style.top=(H+40)+"px",i*30);setTimeout(()=>c.remove(),1900);}
      bigText("成功逃跑！","#ffe8a0","#c9a040",64,1600);Audio2.sfx("coin");out(l,1500);await sleep(1300);
    },
    async comet(d,targetEl){
      if(!targetEl)return;const t=pos(targetEl);
      const dark=fadeLayer("radial-gradient(circle at 80% 20%,rgba(138,107,196,.32),rgba(5,8,9,.86) 55%)");
      const sx=W+320,sy=-260,ang=Math.atan2(sy-t.y,sx-t.x)*180/Math.PI;
      const c=add(`position:absolute;left:${t.x}px;top:${t.y}px;width:60px;height:60px;margin:-30px 0 0 -30px;z-index:201;transform:translate(${sx-t.x}px,${sy-t.y}px);transition:transform .55s cubic-bezier(.45,.05,.75,.95)`,
        `<div style="position:absolute;left:50%;top:50%;width:240px;height:26px;transform-origin:0 50%;transform:translate(0,-50%) rotate(${ang}deg);background:linear-gradient(90deg,rgba(169,143,217,0),rgba(169,143,217,.4) 30%,rgba(232,213,255,.92) 75%,#fff);filter:blur(4px);border-radius:12px"></div><div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 55% 55%,#fff 0%,#f0e8ff 25%,#b39ce8 55%,rgba(138,107,196,0) 80%);box-shadow:0 0 40px #a98fd9,0 0 80px rgba(138,107,196,.7)"></div>`);
      await sleep(30);c.style.transform="translate(0,0)";await sleep(560);
      c.remove();
      const b=add(`position:absolute;left:${t.x}px;top:${t.y}px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:4px solid #e8d5ff;box-shadow:0 0 50px #a98fd9,inset 0 0 25px #fff;z-index:202;animation:burst .9s ease-out forwards`);
      Audio2.sfx("core");shake();setTimeout(()=>b.remove(),950);out(dark,400);
    },
    async decay(d,el){
      if(!el)return;const p=pos(el);
      particles(p.x,p.y,16,["#b48ae0","#5a2c7a","#2a1238"],120,10,800);
      const t=add(`left:${p.x}px;top:${p.y-10}px`);t.className="float decay";t.textContent="☠ 衰减 -"+(d&&d.n||0);
      Audio2.sfx("hit");setTimeout(()=>t.remove(),1150);await sleep(500);
    },
    async decayMark(d,el){
      if(!el)return;const p=pos(el);
      const m=add(`position:absolute;left:${p.x}px;top:${p.y}px;font:900 76px var(--serif);color:#c9a2f0;text-shadow:0 0 26px #7a3fb0,0 0 60px #4a2070;transform:translate(-50%,-50%);z-index:205;animation:bigText 1.1s ease-out forwards`,"☠");
      particles(p.x,p.y,14,["#b48ae0","#7a3fb0"],110,9,800);
      Audio2.sfx("spell");setTimeout(()=>m.remove(),1150);await sleep(450);
    },
    async lock(d,el){
      if(!el)return;const p=pos(el);
      const r=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:140px;height:140px;margin:-70px 0 0 -70px;border-radius:50%;border:4px dashed #a98fd9;box-shadow:0 0 36px #8a6bc4,inset 0 0 26px rgba(138,107,196,.6);z-index:204;animation:gravPull 1.2s ease-out reverse forwards`);
      const m=add(`position:absolute;left:${p.x}px;top:${p.y}px;font:900 54px var(--serif);color:#dccbff;text-shadow:0 0 20px #8a6bc4;transform:translate(-50%,-50%);z-index:205;animation:bigText 1.1s ease-out forwards`,"⛓");
      Audio2.sfx("spell");setTimeout(()=>{r.remove();m.remove();},1250);await sleep(500);
    },
    async fade(d,el){
      if(!el)return;const p=pos(el);
      particles(p.x,p.y,20,["#e8d5ff","#b39ce8","#fff"],150,10,900);
      Audio2.sfx("die");await sleep(350);
    },
    async artillery(){
      bigText("全亚洲炮兵总司令","#ffd9a8","#d9634d",50,1500,36);
      await E.aoe5();
    },
    async breakthrough(){
      const l=fadeLayer("radial-gradient(circle at 50% 30%,rgba(255,200,120,.35),rgba(5,8,9,.7) 65%)");
      particles(W/2,150,24,["#ffd9a8","#ffb36a","#fff"],240,9,800);
      bigText("突 破","#ffe0a8","#e08a40",70,1000,40);
      Audio2.sfx("core");shake();out(l,900);await sleep(600);
    },
    async lowHp(){
      const l=add("position:absolute;inset:0;z-index:206;pointer-events:none;opacity:0;transition:opacity .25s;background:radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(224,102,79,.6) 100%)");
      requestAnimationFrame(()=>l.style.opacity="1");
      bigText("危 险","#ffd9a8","#d9634d",58,1100);
      setTimeout(()=>{l.style.opacity="0";setTimeout(()=>l.remove(),400);},900);
    },
    async endGame(win){
      if(win){particles(W/2,H*.62,50,["#ffe6b0","#e2b467","#fff4d0"],420,9,1700);Audio2.sfx("win");}
      else Audio2.sfx("lose");
    }
  };
  /* ============================================================
     通用法术特效（按卡牌效果组合播放）
     ============================================================ */
  const P={
    /* 弹道：从 from 飞向 to，命中后爆开 */
    async bolt(from,to,color){
      if(!from||!to)return;
      const a=pos(from),b=pos(to),c=color||"#ff9a6a";
      const orb=add(`position:absolute;left:${a.x}px;top:${a.y}px;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;z-index:204;
        background:radial-gradient(circle,#fff 0,${c} 45%,transparent 72%);box-shadow:0 0 24px ${c},0 0 50px ${c};transition:transform .38s cubic-bezier(.5,0,.8,.6)`);
      const ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
      const tail=add(`position:absolute;left:${a.x}px;top:${a.y}px;width:0;height:6px;margin-top:-3px;transform-origin:0 50%;transform:rotate(${ang}deg);z-index:203;border-radius:3px;
        background:linear-gradient(90deg,transparent,${c});opacity:.85;transition:width .38s cubic-bezier(.5,0,.8,.6),opacity .3s .3s`);
      Audio2.sfx("swing");
      await sleep(20);
      orb.style.transform=`translate(${b.x-a.x}px,${b.y-a.y}px)`;tail.style.width=Math.hypot(b.x-a.x,b.y-a.y)+"px";tail.style.opacity="0";
      await sleep(390);
      orb.remove();tail.remove();
      const r=add(`position:absolute;left:${b.x}px;top:${b.y}px;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:4px solid ${c};box-shadow:0 0 30px ${c};z-index:204;animation:burst .55s ease-out forwards`);
      particles(b.x,b.y,12,[c,"#fff"],90,8,500);
      Audio2.sfx("hit");setTimeout(()=>r.remove(),600);
    },
    /* 冲击波横扫一整排 */
    async wave(row,color){
      if(!row)return;const p=pos(row),c=color||"#ff8a5a";
      const w=add(`position:absolute;left:${p.x-p.w/2}px;top:${p.y-p.h/2}px;width:${p.w}px;height:${p.h}px;z-index:203;border-radius:18px;
        background:linear-gradient(90deg,transparent 0,${c} 45%,#fff 50%,${c} 55%,transparent 100%);background-size:40% 100%;background-repeat:no-repeat;background-position:-40% 0;
        opacity:.75;mix-blend-mode:screen;transition:background-position .5s ease-in,opacity .3s .4s`);
      await sleep(20);w.style.backgroundPosition="140% 0";w.style.opacity="0";
      Audio2.sfx("hit");shake();await sleep(460);w.remove();
    },
    /* 单位增益：光圈 + 上升光点 */
    async aura(els,color,text){
      const c=color||"#f6d27a";
      els.filter(Boolean).forEach((el,i)=>{
        if(!el.isConnected)return;const p=pos(el);
        setTimeout(()=>{
          const g=add(`position:absolute;left:${p.x-p.w/2-6}px;top:${p.y-p.h/2-6}px;width:${p.w+12}px;height:${p.h+12}px;border-radius:18px;z-index:203;
            box-shadow:0 0 0 3px ${c},0 0 28px ${c},inset 0 0 26px ${c};opacity:0;animation:auraA .7s ease-out forwards`);
          for(let k=0;k<7;k++){const s=add(`position:absolute;left:${p.x-p.w/2+Math.random()*p.w}px;top:${p.y+p.h/2-10}px;width:5px;height:5px;border-radius:50%;background:${c};box-shadow:0 0 8px ${c};z-index:204;transition:transform .7s ease-out,opacity .7s`);
            requestAnimationFrame(()=>{s.style.transform=`translateY(${-60-Math.random()*60}px)`;s.style.opacity="0";});setTimeout(()=>s.remove(),750);}
          if(text){const t=add(`left:${p.x}px;top:${p.y-20}px`);t.className="float buff";t.textContent=text;setTimeout(()=>t.remove(),1150);}
          setTimeout(()=>g.remove(),750);
        },i*70);
      });
      if(els.length)Audio2.sfx("heal");
      await sleep(450);
    },
    /* 治疗：绿色十字光点 */
    async heal(el){
      if(!el)return;const p=pos(el);
      const g=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.w}px;margin:${-p.w/2}px 0 0 ${-p.w/2}px;border-radius:50%;z-index:203;
        background:radial-gradient(circle,rgba(142,230,156,.55),transparent 65%);animation:auraA .8s ease-out forwards`);
      for(let k=0;k<10;k++){const s=add(`position:absolute;left:${p.x-40+Math.random()*80}px;top:${p.y+10}px;font:700 ${12+Math.random()*10}px var(--sans);color:#8ee69c;text-shadow:0 0 8px #3f9a55;z-index:204;transition:transform .8s ease-out,opacity .8s`,"+");
        setTimeout(()=>{s.style.transform=`translateY(${-50-Math.random()*50}px)`;s.style.opacity="0";},k*30);setTimeout(()=>s.remove(),1100);}
      Audio2.sfx("heal");setTimeout(()=>g.remove(),850);await sleep(420);
    },
    /* 护甲：护盾展开 */
    async armor(el){
      if(!el)return;const p=pos(el);
      const s=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:150px;height:170px;margin:-85px 0 0 -75px;z-index:203;
        clip-path:polygon(50% 0,100% 18%,92% 70%,50% 100%,8% 70%,0 18%);background:linear-gradient(160deg,rgba(220,232,236,.6),rgba(120,140,150,.25));
        box-shadow:inset 0 0 30px #fff;animation:shieldA .75s ease-out forwards`);
      Audio2.sfx("select");setTimeout(()=>s.remove(),800);await sleep(420);
    },
    /* 抽牌：卡背从牌库飞向手牌 */
    async draw(from,to,n){
      if(!from||!to)return;const a=pos(from),b=pos(to);
      for(let i=0;i<Math.min(3,n||1);i++){
        setTimeout(()=>{
          const c=add(`position:absolute;left:${a.x}px;top:${a.y}px;z-index:204;transform:translate(-50%,-50%) scale(.9);transition:transform .45s cubic-bezier(.3,.7,.4,1),opacity .45s`,
            `<div class="card-back" style="font-size:4.5px">♛</div>`);
          requestAnimationFrame(()=>{c.style.transform=`translate(calc(-50% + ${b.x-a.x+(i-1)*30}px),calc(-50% + ${b.y-a.y}px)) rotate(${(i-1)*12}deg) scale(1.1)`;c.style.opacity=".2";});
          setTimeout(()=>c.remove(),480);Audio2.sfx("draw");
        },i*110);
      }
      await sleep(380);
    },
    /* 偷钱：金币从对方飞到自己 */
    async coins(from,to){
      if(!from||!to)return;const a=pos(from),b=pos(to);
      for(let i=0;i<8;i++){
        const c=add(`position:absolute;left:${a.x+(Math.random()-.5)*50}px;top:${a.y+(Math.random()-.5)*40}px;font:900 22px var(--serif);color:#f2cf73;text-shadow:0 0 10px #c9a040;z-index:205;
          transform:translate(-50%,-50%);transition:transform .55s cubic-bezier(.4,0,.6,1) ${i*45}ms,opacity .2s ${i*45+500}ms`,"$");
        requestAnimationFrame(()=>{c.style.transform=`translate(calc(-50% + ${b.x-a.x}px),calc(-50% + ${b.y-a.y}px)) scale(.7)`;c.style.opacity="0";});
        setTimeout(()=>c.remove(),900);
      }
      Audio2.sfx("coin");await sleep(600);
    },
    /* 费用水晶：碎裂（down）或升腾（up） */
    async mana(el,up){
      if(!el)return;const p=pos(el),c=up?"#9fdcf2":"#b48ae0";
      for(let i=0;i<12;i++){
        const ang=up?(-Math.PI/2+(Math.random()-.5)*1.2):Math.random()*Math.PI*2,d=40+Math.random()*50;
        const s=add(`position:absolute;left:${p.x}px;top:${p.y}px;width:10px;height:13px;clip-path:polygon(50% 0,100% 38%,50% 100%,0 38%);background:${c};box-shadow:0 0 10px ${c};z-index:205;
          transform:translate(-50%,-50%);transition:transform .6s ease-out,opacity .6s`);
        requestAnimationFrame(()=>{s.style.transform=`translate(calc(-50% + ${Math.cos(ang)*d}px),calc(-50% + ${Math.sin(ang)*d}px)) rotate(${Math.random()*360}deg)`;s.style.opacity="0";});
        setTimeout(()=>s.remove(),650);
      }
      const t=add(`left:${p.x}px;top:${p.y-10}px`);t.className="float "+(up?"mana":"manadown");t.textContent=up?"+1 费用":"-1 费用";setTimeout(()=>t.remove(),1150);
      Audio2.sfx(up?"select":"error");await sleep(450);
    },
    /* 冰霜：敌方一排结霜（攻击力降低） */
    async frost(row){
      if(!row)return;const p=pos(row);
      const f=add(`position:absolute;left:${p.x-p.w/2}px;top:${p.y-p.h/2}px;width:${p.w}px;height:${p.h}px;border-radius:18px;z-index:203;
        background:linear-gradient(180deg,rgba(170,220,255,.35),rgba(120,180,230,.15));box-shadow:inset 0 0 40px rgba(200,235,255,.8);opacity:0;transition:opacity .25s`);
      requestAnimationFrame(()=>f.style.opacity="1");
      for(let i=0;i<16;i++){const s=add(`position:absolute;left:${p.x-p.w/2+Math.random()*p.w}px;top:${p.y-p.h/2-10}px;color:#e6f6ff;font-size:${12+Math.random()*12}px;z-index:204;transition:transform .9s linear,opacity .9s`,"❄");
        requestAnimationFrame(()=>{s.style.transform=`translateY(${p.h*.8}px) rotate(180deg)`;s.style.opacity="0";});setTimeout(()=>s.remove(),950);}
      Audio2.sfx("spell");setTimeout(()=>{f.style.opacity="0";setTimeout(()=>f.remove(),300);},600);await sleep(550);
    },
    /* 召唤：光柱 */
    async pillar(row,color){
      if(!row)return;const p=pos(row),c=color||"#f6dca0";
      const b=add(`position:absolute;left:${p.x-50}px;top:${p.y-p.h/2-60}px;width:100px;height:${p.h+60}px;z-index:203;
        background:linear-gradient(90deg,transparent,${c},#fff,${c},transparent);opacity:0;filter:blur(2px);animation:pillarA .7s ease-out forwards`);
      Audio2.sfx("play");setTimeout(()=>b.remove(),750);await sleep(350);
    },
    /* 弃掉对方手牌 */
    async discard(el){
      if(!el)return;const p=pos(el);
      particles(p.x,p.y+20,14,["#e0664f","#ffd0a0"],110,9,600);
      const x=add(`position:absolute;left:${p.x}px;top:${p.y+20}px;transform:translate(-50%,-50%);font:900 46px var(--serif);color:#ff7a62;text-shadow:0 0 16px #a8402f;z-index:205;animation:bigText .9s ease-out forwards`,"✕");
      Audio2.sfx("die");setTimeout(()=>x.remove(),950);await sleep(400);
    },
    /* 自伤 */
    async selfHit(el){if(!el)return;const p=pos(el);particles(p.x,p.y,10,["#e0664f"],60,7,450);Audio2.sfx("hit");await sleep(250);}
  };
  /* steps: [{fx, ...参数}]，全部并行播放，等待最长的一个 */
  async function cast(steps){
    if(!steps||!steps.length)return;
    await Promise.all(steps.map(s=>{try{return P[s.fx]?P[s.fx](...(s.args||[])):null;}catch(e){console.warn(e);return null;}}));
  }

  async function play(name,data,el){if(E[name]){try{await E[name](data,el);}catch(e){console.warn(e);}}}
  function clear(){const r=layerRoot();if(r)r.innerHTML="";}
  return{setScale,pos,float,ring,shake,shatter,play,cast,clear,sleep};
})();
