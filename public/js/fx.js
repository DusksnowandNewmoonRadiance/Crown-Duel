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
  async function play(name,data,el){if(E[name]){try{await E[name](data,el);}catch(e){console.warn(e);}}}
  function clear(){const r=layerRoot();if(r)r.innerHTML="";}
  return{setScale,pos,float,ring,shake,shatter,play,clear,sleep};
})();
