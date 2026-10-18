/* ============================================================================
   卡牌出牌特效播放器 · CardFX（极简版）
   ----------------------------------------------------------------------------
   把 shared/cardfx.js 的配方画成「细线 + 硬边碎片 + 字幕」，
   和 FX / 界面保持同一套语言：1.5px 线、低饱和色、不用发光光晕、不放彩色粒子雨。
   ctx = { layer, W, H, from:{x,y}, anchor:{x,y,w,h}, name, shake }
   坐标是 1280×720 的舞台坐标；图鉴预览里把图层整体缩小即可复用。
   ============================================================================ */
const CardFX=(()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const TAU=Math.PI*2;
  const E_OUT="cubic-bezier(.2,.7,.3,1)",E_REV="cubic-bezier(.16,.84,.28,1)",E_IN="cubic-bezier(.5,0,.85,.35)";

  function mk(layer,css,text){
    const d=document.createElement("div");
    d.style.cssText="position:absolute;pointer-events:none;"+css;
    if(text!=null)d.textContent=text;
    layer.appendChild(d);return d;
  }
  function go(el,kf,opt){
    try{
      const a=el.animate(kf,Object.assign({fill:"forwards",easing:E_OUT},opt));
      const done=()=>{try{el.remove();}catch(e){}};
      a.onfinish=done;a.oncancel=done;return a;
    }catch(e){try{el.remove();}catch(_){}}
  }

  /* 把配方配色压成低饱和：色相留着，艳度砍半，亮度落在 60~85 */
  function tone(hex){
    try{
      let h=String(hex||"#ffffff").replace("#","");
      if(h.length===3)h=h.split("").map(x=>x+x).join("");
      const n=parseInt(h,16);if(!isFinite(n))return"#ffffff";
      let r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
      let H=0,S=0;
      if(mx!==mn){
        const d=mx-mn;S=l>.5?d/(2-mx-mn):d/(mx+mn);
        if(mx===r)H=((g-b)/d+(g<b?6:0))/6;else if(mx===g)H=((b-r)/d+2)/6;else H=((r-g)/d+4)/6;
      }
      S=Math.min(.42,S*.55); const L=Math.max(.6,Math.min(.85,l));
      const C2=(1-Math.abs(2*L-1))*S,X=C2*(1-Math.abs((H*6)%2-1)),M=L-C2/2;
      let R=0,G=0,B=0,hh=H*6;
      if(hh<1){R=C2;G=X;}else if(hh<2){R=X;G=C2;}else if(hh<3){G=C2;B=X;}
      else if(hh<4){G=X;B=C2;}else if(hh<5){R=X;B=C2;}else{R=C2;B=X;}
      const to=v=>Math.round((v+M)*255).toString(16).padStart(2,"0");
      return"#"+to(R)+to(G)+to(B);
    }catch(e){return"#ffffff";}
  }

  /* 碎片：短斜线，不是发光圆点 */
  function shards(L,x,y,colors,n,dist,size,dur){
    for(let i=0;i<n;i++){
      const ang=rnd(0,TAU),d=dist*rnd(.4,1),len=Math.max(4,size*rnd(.7,1.4)),c=colors[i%colors.length];
      const p=mk(L,`left:${x}px;top:${y}px;width:${len}px;height:${Math.max(2,len*.18)}px;background:${c};transform-origin:0 50%;opacity:.95`);
      go(p,[{transform:`rotate(${ang*180/Math.PI}deg) translateX(6px)`,opacity:.95},
        {transform:`rotate(${ang*180/Math.PI}deg) translateX(${6+d}px)`,opacity:0}],{duration:dur||560,easing:E_REV});
    }
  }
  /* 细环 */
  function thinRing(L,x,y,r0,color,width,dur,delay){
    const p=mk(L,`left:${x-r0}px;top:${y-r0}px;width:${r0*2}px;height:${r0*2}px;border-radius:50%;border:${width||2}px solid ${color};opacity:0`);
    go(p,[{transform:"scale(.4)",opacity:0},{opacity:.9,offset:.18},{transform:"scale(3.2)",opacity:0}],{duration:dur||700,delay:delay||0,easing:E_REV});
    return p;
  }
  /* 四角括号：替代原来的大符号 */
  function brackets(L,x,y,w,h,color,dur,delay){
    const bw=Math.round(w/2),bh=Math.round(h/2),tk=10;
    const box=mk(L,`left:${x-bw}px;top:${y-bh}px;width:${bw*2}px;height:${bh*2}px;opacity:0`);
    box.innerHTML=[`left:0;top:0;border-left:1.5px solid ${color};border-top:1.5px solid ${color}`,
      `right:0;top:0;border-right:1.5px solid ${color};border-top:1.5px solid ${color}`,
      `left:0;bottom:0;border-left:1.5px solid ${color};border-bottom:1.5px solid ${color}`,
      `right:0;bottom:0;border-right:1.5px solid ${color};border-bottom:1.5px solid ${color}`]
      .map(s=>`<i style="position:absolute;width:${tk+2}px;height:${tk+2}px;${s}"></i>`).join("");
    go(box,[{transform:"scale(1.06)",opacity:0},{transform:"scale(1)",opacity:.85,offset:.22},{transform:"scale(1)",opacity:0,offset:1}],{duration:dur||760,delay:delay||0,easing:E_OUT});
    return box;
  }
  function flashScreen(L,W,H,op){
    const o=mk(L,`left:0;top:0;width:${W}px;height:${H}px;background:#fff;opacity:0`);
    go(o,[{opacity:0},{opacity:op||.06,offset:.2},{opacity:0}],{duration:260,easing:"linear"});
  }

  /* ---------------- 12 种动画形式 ---------------- */
  const P={
    burst(c){
      const {L,a,c1,c2}=c;
      flashScreen(L,c.W,c.H,.05);
      thinRing(L,a.x,a.y,26,c1,1.5,620);
      thinRing(L,a.x,a.y,26,c2,1,700,110);
      shards(L,a.x,a.y,[c1,c2],10,150,12,620);
      brackets(L,a.x,a.y,220,180,c2,760);
      return 520;
    },
    rain(c){
      const {L,a,c1,c2}=c;
      const span=Math.max(380,(a.w||0)*.95),x0=a.x-span/2;
      for(let i=0;i<16;i++){
        const x=x0+rnd(0,span),len=rnd(18,40),delay=i*40;
        const g=mk(L,`left:${x}px;top:${a.y-320}px;width:1.5px;height:${len}px;background:linear-gradient(180deg,transparent,${i%2?c1:c2});opacity:0`);
        go(g,[{transform:"translateY(0)",opacity:0},{opacity:.9,offset:.12},{transform:`translateY(${320}px)`,opacity:0}],{duration:620,delay,easing:E_IN});
        setTimeout(()=>shards(L,x,a.y,[c1,c2],3,40,6,340),delay+520);
      }
      return 700;
    },
    rise(c){
      const {L,a,c1,c2}=c;
      const span=Math.max(360,(a.w||0)*.9),x0=a.x-span/2;
      const line=mk(L,`left:${x0}px;top:${a.y+40}px;width:${span}px;height:1.5px;background:linear-gradient(90deg,transparent,${c1} 20%,${c2} 50%,${c1} 80%,transparent);opacity:0`);
      go(line,[{transform:"translateY(0)",opacity:0},{opacity:.85,offset:.25},{transform:"translateY(-120px)",opacity:0}],{duration:900,easing:E_OUT});
      for(let i=0;i<12;i++){
        const x=x0+rnd(0,span),delay=i*45;
        const g=mk(L,`left:${x}px;top:${a.y+30}px;width:1.5px;height:${rnd(12,24)}px;background:${i%2?c1:c2};opacity:0`);
        go(g,[{transform:"translateY(0)",opacity:0},{opacity:.9,offset:.2},{transform:`translateY(${-rnd(120,220)}px)`,opacity:0}],{duration:820,delay});
      }
      return 650;
    },
    ring(c){
      const {L,a,c1,c2}=c;
      thinRing(L,a.x,a.y,30,c1,1.5,860,0);
      thinRing(L,a.x,a.y,30,c2,1,900,170);
      thinRing(L,a.x,a.y,30,c1,1,940,340);
      const d=mk(L,`left:${a.x-78}px;top:${a.y-78}px;width:156px;height:156px;border-radius:50%;border:1px dashed ${c2};opacity:0`);
      go(d,[{transform:"rotate(0) scale(.7)",opacity:0},{opacity:.55,offset:.3},{transform:"rotate(200deg) scale(1)",opacity:0}],{duration:1000,easing:"linear"});
      brackets(L,a.x,a.y,170,170,c1,900);
      return 600;
    },
    slash(c){
      const {L,a,c1,c2}=c;
      [[-22,0],[16,110],[-4,210]].forEach(([deg,delay])=>{
        const b=mk(L,`left:${a.x-240}px;top:${a.y-1}px;width:480px;height:2px;transform-origin:50% 50%;background:linear-gradient(90deg,transparent,${c2} 25%,#fff 50%,${c2} 75%,transparent)`);
        go(b,[{transform:`rotate(${deg}deg) scaleX(0)`,opacity:0},{transform:`rotate(${deg}deg) scaleX(1)`,opacity:1,offset:.22},{transform:`rotate(${deg}deg) scaleX(1.04)`,opacity:0}],{duration:420,delay,easing:E_IN});
        setTimeout(()=>shards(L,a.x+rnd(-70,70),a.y+rnd(-40,40),[c1,c2],4,90,9,380),delay+110);
      });
      brackets(L,a.x,a.y,200,150,c2,620);
      return 420;
    },
    pillar(c){
      const {L,a,c1,c2}=c;
      const span=Math.max(360,(a.w||0)*.85),n=5;
      for(let i=0;i<n;i++){
        const x=a.x-span/2+i*(span/(n-1)),delay=i*90;
        const p=mk(L,`left:${x-1}px;top:${a.y-520}px;width:${i===2?3:2}px;height:560px;transform-origin:50% 100%;background:linear-gradient(180deg,transparent,${c1} 35%,${i===2?"#fff":c2});opacity:0`);
        go(p,[{transform:"scaleY(0)",opacity:0},{transform:"scaleY(1)",opacity:1,offset:.3},{transform:"scaleY(1)",opacity:0}],{duration:820,delay,easing:E_OUT});
        const b=mk(L,`left:${x-40}px;top:${a.y+26}px;width:80px;height:1px;background:linear-gradient(90deg,transparent,${c2},transparent)`);
        go(b,[{transform:"scaleX(.2)",opacity:0},{transform:"scaleX(1)",opacity:.9,offset:.35},{transform:"scaleX(1)",opacity:0}],{duration:800,delay:delay+120});
      }
      brackets(L,a.x,a.y-30,Math.min(340,span),300,c2,900);
      return 500;
    },
    spiral(c){
      const {L,f,a,c1,c2}=c;
      const N=12,R=180;
      for(let i=0;i<N;i++){
        const th=i/N*TAU,len=rnd(8,14),col=i%2?c1:c2;
        const p=mk(L,`left:${f.x}px;top:${f.y}px;width:${len}px;height:1.5px;background:${col};transform-origin:0 50%;opacity:.9`);
        const kf=[0,.34,.67,1].map((t,k)=>{
          const r=R*(1-t),ang=th+t*2.6;
          return{transform:`rotate(${ang*180/Math.PI}deg) translate(${r}px,0)`,opacity:k===3?0:.9};
        });
        go(p,kf,{duration:560,delay:i*18,easing:"ease-in"});
      }
      thinRing(L,a.x,a.y,20,c2,1.5,700,540);
      setTimeout(()=>{shards(L,a.x,a.y,[c1,c2],10,140,11,560);brackets(L,a.x,a.y,200,170,c1,700);},1080);
      return 1100;
    },
    wave(c){
      const {L,a,c1,c2}=c;
      const span=Math.max(520,(a.w||0)),h=Math.max(150,a.h||190),x0=a.x-span/2;
      const bar=mk(L,`left:${x0}px;top:${a.y-h/2}px;width:2px;height:${h}px;background:linear-gradient(180deg,transparent,${c1} 25%,#fff 50%,${c1} 75%,transparent);opacity:0`);
      go(bar,[{transform:"translateX(-240px)",opacity:0},{opacity:1,offset:.12},{transform:`translateX(${span+240}px)`,opacity:.9,offset:.88},{transform:`translateX(${span+260}px)`,opacity:0}],{duration:760,easing:"cubic-bezier(.4,0,.6,1)"});
      for(let i=0;i<10;i++)setTimeout(()=>shards(L,x0+i*(span/9),a.y+rnd(-h/3,h/3),[c1,c2],3,46,7,380),i*45);
      return 520;
    },
    flash(c){
      const {L,W,H,c1,c2}=c;
      flashScreen(L,W,H,.07);
      const band=mk(L,`left:0;top:${H*.44-1}px;width:${W}px;height:2px;background:linear-gradient(90deg,transparent,${c2} 30%,#fff 50%,${c2} 70%,transparent);opacity:0`);
      go(band,[{transform:"scaleX(0)",opacity:0},{transform:"scaleX(1)",opacity:1,offset:.2},{transform:"scaleX(1)",opacity:0}],{duration:1000,easing:E_OUT});
      const v=mk(L,`left:${W/2-1}px;top:${H*.14}px;width:2px;height:${H*.6}px;background:linear-gradient(180deg,transparent,${c1},transparent);opacity:0`);
      go(v,[{transform:"scaleY(0)",opacity:0},{transform:"scaleY(1)",opacity:.9,offset:.25},{transform:"scaleY(1)",opacity:0}],{duration:1000,easing:E_OUT});
      brackets(L,W/2,H*.44,360,300,c2,1100);
      shards(L,W/2,H*.44,[c1,c2],14,320,12,860);
      return 650;
    },
    cross(c){
      const {L,a,c1,c2}=c;
      [[0,900],[90,700],[45,640],[-45,640]].forEach(([deg,len],i)=>{
        const b=mk(L,`left:${a.x-len/2}px;top:${a.y-1}px;width:${len}px;height:2px;transform-origin:50% 50%;background:linear-gradient(90deg,transparent,${i<2?c1:c2} 30%,#fff 50%,${i<2?c1:c2} 70%,transparent)`);
        go(b,[{transform:`rotate(${deg}deg) scaleX(0)`,opacity:0},{transform:`rotate(${deg}deg) scaleX(1)`,opacity:1,offset:.3},{transform:`rotate(${deg}deg) scaleX(1)`,opacity:0}],{duration:700,delay:i*40,easing:E_OUT});
      });
      thinRing(L,a.x,a.y,24,c2,1.5,760,120);
      shards(L,a.x,a.y,[c1,c2],8,150,9,620);
      return 450;
    },
    orbit(c){
      const {L,f,a,c1,c2}=c;
      const N=6,R=90;
      for(let i=0;i<N;i++){
        const th=i/N*TAU,len=12;
        const g=mk(L,`left:${f.x+Math.cos(th)*R}px;top:${f.y+Math.sin(th)*R}px;width:${len}px;height:1.5px;background:${i%2?c1:c2};transform-origin:0 50%;opacity:.9`);
        go(g,[{transform:`rotate(${th*180/Math.PI}deg) scale(.4)`,opacity:0},{opacity:.9,offset:.3},{transform:`rotate(${th*180/Math.PI+200}deg) scale(1)`,opacity:.9,offset:.7},{opacity:0}],{duration:760,easing:"ease-in-out"});
      }
      setTimeout(()=>{
        for(let i=0;i<N;i++){
          const g=mk(L,`left:${f.x}px;top:${f.y}px;width:12px;height:1.5px;background:${i%2?c1:c2};transform-origin:0 50%;opacity:.95`);
          go(g,[{transform:"rotate(0) translateX(0)",opacity:1},{transform:`rotate(${rnd(0,360)}deg) translateX(${Math.hypot(a.x-f.x,a.y-f.y)}px)`,opacity:0}],{duration:460,delay:i*45,easing:E_IN});
        }
        setTimeout(()=>{thinRing(L,a.x,a.y,18,c2,1.5,620);shards(L,a.x,a.y,[c1,c2],8,120,9,520);},400);
      },680);
      return 1000;
    },
    rift(c){
      const {L,a,c1,c2}=c;
      const e=mk(L,`left:${a.x-170}px;top:${a.y-30}px;width:340px;height:60px;border-radius:50%;border:1.5px solid ${c1};background:radial-gradient(ellipse,#05060a 40%,transparent 75%);opacity:0`);
      go(e,[{transform:"scale(.1,.1)",opacity:0},{transform:"scale(1,1)",opacity:1,offset:.25},{transform:"scale(1,1)",opacity:1,offset:.72},{transform:"scale(.2,.1)",opacity:0}],{duration:1000,easing:E_OUT});
      for(let i=0;i<12;i++){
        const x=a.x+rnd(-140,140),delay=i*40;
        const p=mk(L,`left:${x}px;top:${a.y-200}px;width:1.5px;height:${rnd(10,20)}px;background:${i%2?c1:c2};opacity:0`);
        go(p,[{transform:"translateY(0)",opacity:0},{opacity:.9,offset:.2},{transform:"translateY(200px)",opacity:0}],{duration:520,delay:delay+120,easing:E_IN});
      }
      return 700;
    }
  };
  const SFX={burst:"hit",rain:"spell",rise:"heal",ring:"spell",slash:"hit",pillar:"core",spiral:"spell",wave:"hit",flash:"core",cross:"core",orbit:"spell",rift:"spell"};
  const SHAKE={burst:1,slash:1,flash:1,cross:1,pillar:1};

  /* 卡名横幅（精英专属）：两条细线夹住一行字，不是霓虹灯牌 */
  function banner(L,W,H,name,c1,c2){
    const y=H*.27;
    const t=mk(L,`left:0;top:${y}px;width:${W}px;text-align:center;font:600 30px/1 var(--font-ui);letter-spacing:.18em;text-indent:.18em;color:${c2};text-shadow:0 2px 24px rgba(0,0,0,.9);opacity:0`,name);
    go(t,[{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none",offset:.18},{opacity:1,offset:.78},{opacity:0,transform:"translateY(-6px)"}],{duration:1400});
    [y+26,y-46].forEach((yy,i)=>{
      const l=mk(L,`left:${W/2-110}px;top:${yy}px;width:220px;height:1px;background:linear-gradient(90deg,transparent,${c1},transparent);opacity:0`);
      go(l,[{transform:"scaleX(0)",opacity:0},{transform:"scaleX(1)",opacity:.8,offset:.2},{transform:"scaleX(1)",opacity:0}],{duration:1300,delay:i*80,easing:E_OUT});
    });
  }

  /* 播放一个配方；返回的 Promise 在动画的“高潮”处结束，余光继续自动播完 */
  async function run(r,ctx){
    if(!r||r.native||!ctx||!ctx.layer)return;
    const pat=P[r.pattern];if(!pat)return;
    const W=ctx.W||1280,H=ctx.H||720;
    const raw=(r.colors&&r.colors.length>=2)?r.colors:["#ffffff","#cccccc"];
    const c={L:ctx.layer,W,H,a:ctx.anchor||{x:W/2,y:H/2,w:0,h:0},f:ctx.from||{x:200,y:H-120},
      c1:tone(raw[0]),c2:tone(raw[1])};
    try{
      Audio2.sfx(SFX[r.pattern]||"spell");
      if(r.banner&&ctx.name)banner(c.L,W,H,ctx.name,c.c1,c.c2);
      const wait=pat(c);
      if(r.banner&&SHAKE[r.pattern]&&ctx.shake)setTimeout(ctx.shake,Math.min(wait,400));
      await sleep(wait);
    }catch(e){console.warn("[cardfx]",e);}
  }
  return{run};
})();
