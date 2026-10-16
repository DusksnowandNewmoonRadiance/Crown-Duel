/* 卡牌出牌特效播放器：把 shared/cardfx.js 里的配方画到指定图层上
   ctx = { layer, W, H, from:{x,y}, anchor:{x,y,w,h}, name, shake }
   坐标是 1280×720 的“舞台坐标”；图鉴预览里把图层整体缩小即可复用 */
const CardFX=(()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const TAU=Math.PI*2;

  function mk(layer,css,text){
    const d=document.createElement("div");
    d.style.cssText="position:absolute;pointer-events:none;"+css;
    if(text!=null)d.textContent=text;
    layer.appendChild(d);return d;
  }
  /* 播放一次动画，结束后自动移除元素 */
  function go(el,kf,opt){
    try{
      const a=el.animate(kf,Object.assign({fill:"forwards",easing:"ease-out"},opt));
      const done=()=>{try{el.remove();}catch(e){}};
      a.onfinish=done;a.oncancel=done;return a;
    }catch(e){try{el.remove();}catch(_){}}
  }
  function sparks(L,x,y,colors,n,dist,size,dur){
    for(let i=0;i<n;i++){
      const ang=rnd(0,TAU),d=dist*rnd(.45,1),s=size*rnd(.6,1.3),c=colors[i%colors.length];
      const p=mk(L,`left:${x-s/2}px;top:${y-s/2}px;width:${s}px;height:${s}px;border-radius:50%;background:${c};box-shadow:0 0 ${s*1.5}px ${c}`);
      go(p,[{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${Math.cos(ang)*d}px,${Math.sin(ang)*d}px) scale(.2)`,opacity:0}],{duration:dur||600});
    }
  }
  function glyphAt(L,x,y,text,size,color,glow,kf,dur){
    const g=mk(L,`left:${x}px;top:${y}px;font:900 ${size}px/1 var(--serif);color:${color};text-shadow:0 0 ${size*.35}px ${glow},0 0 ${size*.8}px ${glow};white-space:nowrap;margin:${-size*.5}px 0 0 ${-size*.5}px;width:${size}px;text-align:center`,text);
    go(g,kf,{duration:dur,easing:"cubic-bezier(.2,.8,.3,1)"});
    return g;
  }

  /* ---------------- 12 种动画形式 ---------------- */
  const P={
    burst(c){
      const {L,a,c1,c2,glyph}=c;
      const f=mk(L,`left:${a.x-170}px;top:${a.y-170}px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,${c2},${c1} 42%,transparent 70%);mix-blend-mode:screen`);
      go(f,[{transform:"scale(.15)",opacity:1},{transform:"scale(1.5)",opacity:.9,offset:.4},{transform:"scale(2)",opacity:0}],{duration:620});
      for(let i=0;i<2;i++){
        const r=mk(L,`left:${a.x-24}px;top:${a.y-24}px;width:48px;height:48px;border-radius:50%;border:5px solid ${i?c2:c1};box-shadow:0 0 24px ${c1}`);
        go(r,[{transform:"scale(.3)",opacity:1},{transform:"scale(6)",opacity:0}],{duration:700,delay:i*120});
      }
      sparks(L,a.x,a.y,[c1,c2],26,220,12,760);
      glyphAt(L,a.x,a.y,glyph,96,c2,c1,[{transform:"scale(.3)",opacity:0},{transform:"scale(1.5)",opacity:1,offset:.3},{transform:"scale(1.1) translateY(-40px)",opacity:0}],900);
      return 520;
    },
    rain(c){
      const {L,a,c1,c2,glyph}=c;
      const span=Math.max(380,(a.w||0)*.95),x0=a.x-span/2;
      for(let i=0;i<20;i++){
        const x=x0+rnd(0,span),sz=rnd(26,46),delay=i*42,col=i%2?c1:c2;
        const g=mk(L,`left:${x}px;top:${a.y-360}px;font:900 ${sz}px/1 var(--serif);color:${col};text-shadow:0 0 14px ${c1};margin-left:${-sz/2}px`,glyph);
        go(g,[{transform:"translateY(0) rotate(0)",opacity:0},{opacity:1,offset:.15},{transform:"translateY(360px) rotate(160deg)",opacity:1,offset:.9},{transform:"translateY(380px) rotate(180deg)",opacity:0}],{duration:620,delay,easing:"cubic-bezier(.5,0,.9,.5)"});
        setTimeout(()=>sparks(L,x,a.y,[c1,c2],5,46,8,380),delay+560);
      }
      return 700;
    },
    rise(c){
      const {L,a,c1,c2,glyph}=c;
      const span=Math.max(360,(a.w||0)*.9),x0=a.x-span/2;
      const base=mk(L,`left:${x0}px;top:${a.y-30}px;width:${span}px;height:120px;background:radial-gradient(ellipse at 50% 100%,${c1},transparent 70%);opacity:0;mix-blend-mode:screen`);
      go(base,[{opacity:0},{opacity:.8,offset:.4},{opacity:0}],{duration:1000});
      for(let i=0;i<18;i++){
        const x=x0+rnd(0,span),sz=rnd(18,36),delay=i*40,col=i%2?c1:c2;
        const g=mk(L,`left:${x}px;top:${a.y+40}px;font:900 ${sz}px/1 var(--serif);color:${col};text-shadow:0 0 12px ${c1};margin-left:${-sz/2}px`,i%3?"✦":glyph);
        go(g,[{transform:"translateY(0) scale(.5)",opacity:0},{opacity:1,offset:.25},{transform:`translateY(${-rnd(150,230)}px) scale(1.1)`,opacity:0}],{duration:900,delay});
      }
      return 650;
    },
    ring(c){
      const {L,a,c1,c2,glyph}=c;
      for(let i=0;i<3;i++){
        const r=mk(L,`left:${a.x-40}px;top:${a.y-40}px;width:80px;height:80px;border-radius:50%;border:${5-i}px solid ${i%2?c2:c1};box-shadow:0 0 22px ${c1},inset 0 0 18px ${c1}`);
        go(r,[{transform:"scale(.2)",opacity:1},{transform:`scale(${4+i*1.3})`,opacity:0}],{duration:900,delay:i*170});
      }
      const d=mk(L,`left:${a.x-90}px;top:${a.y-90}px;width:180px;height:180px;border-radius:50%;border:3px dashed ${c2};opacity:0`);
      go(d,[{transform:"rotate(0) scale(.6)",opacity:0},{opacity:.9,offset:.3},{transform:"rotate(240deg) scale(1.15)",opacity:0}],{duration:1000});
      glyphAt(L,a.x,a.y,glyph,84,c2,c1,[{transform:"scale(.4)",opacity:0},{transform:"scale(1.2)",opacity:1,offset:.35},{transform:"scale(1)",opacity:0}],1000);
      return 600;
    },
    slash(c){
      const {L,a,c1,c2,glyph}=c;
      [[-34,0],[30,110],[-6,220]].forEach(([deg,delay])=>{
        const b=mk(L,`left:${a.x-230}px;top:${a.y-5}px;width:460px;height:10px;border-radius:5px;background:linear-gradient(90deg,transparent,${c2} 30%,${c1} 50%,${c2} 70%,transparent);box-shadow:0 0 22px ${c1};transform:rotate(${deg}deg)`);
        go(b,[{transform:`rotate(${deg}deg) scaleX(0)`,opacity:0},{transform:`rotate(${deg}deg) scaleX(1)`,opacity:1,offset:.25},{transform:`rotate(${deg}deg) scaleX(1.05)`,opacity:0}],{duration:420,delay});
        setTimeout(()=>sparks(L,a.x+rnd(-60,60),a.y+rnd(-40,40),[c1,c2],7,110,8,420),delay+120);
      });
      glyphAt(L,a.x,a.y,glyph,70,c2,c1,[{transform:"scale(.4)",opacity:0},{transform:"scale(1.3)",opacity:1,offset:.5},{transform:"scale(1)",opacity:0}],700);
      return 420;
    },
    pillar(c){
      const {L,a,c1,c2,glyph}=c;
      const span=Math.max(360,(a.w||0)*.85),n=5;
      for(let i=0;i<n;i++){
        const x=a.x-span/2+i*(span/(n-1)),delay=i*90;
        const p=mk(L,`left:${x-28}px;top:${a.y-560}px;width:56px;height:620px;transform-origin:50% 0;background:linear-gradient(180deg,transparent,${c1} 40%,${c2});mix-blend-mode:screen;filter:blur(1px)`);
        go(p,[{transform:"scaleY(0)",opacity:0},{transform:"scaleY(1)",opacity:.95,offset:.3},{transform:"scaleY(1)",opacity:0}],{duration:800,delay});
        const b=mk(L,`left:${x-50}px;top:${a.y+30}px;width:100px;height:30px;border-radius:50%;background:radial-gradient(ellipse,${c2},${c1} 50%,transparent 72%)`);
        go(b,[{transform:"scale(.2)",opacity:0},{transform:"scale(1.2)",opacity:1,offset:.35},{transform:"scale(1.6)",opacity:0}],{duration:800,delay:delay+120});
      }
      glyphAt(L,a.x,a.y-40,glyph,80,c2,c1,[{transform:"translateY(30px) scale(.5)",opacity:0},{transform:"translateY(0) scale(1.2)",opacity:1,offset:.5},{transform:"translateY(-30px) scale(1)",opacity:0}],900);
      return 500;
    },
    spiral(c){
      const {L,f,a,c1,c2,glyph}=c;
      const N=14,R=170;
      for(let i=0;i<N;i++){
        const th=i/N*TAU,s=rnd(8,15),col=i%2?c1:c2;
        const p=mk(L,`left:${f.x-s/2}px;top:${f.y-s/2}px;width:${s}px;height:${s}px;border-radius:50%;background:${col};box-shadow:0 0 14px ${col}`);
        const kf=[0,.34,.67,1].map((t,k)=>{
          const r=R*(1-t),ang=th+t*2.6;
          return{transform:`translate(${Math.cos(ang)*r}px,${Math.sin(ang)*r}px) scale(${1-t*.5})`,opacity:k===3?0:1};
        });
        go(p,kf,{duration:560,delay:i*18,easing:"ease-in"});
      }
      const orb=mk(L,`left:${f.x-22}px;top:${f.y-22}px;width:44px;height:44px;border-radius:50%;background:radial-gradient(circle,#fff,${c2} 40%,${c1} 70%,transparent);box-shadow:0 0 36px ${c1};opacity:0`);
      go(orb,[{transform:"translate(0,0) scale(.3)",opacity:0},{transform:"translate(0,0) scale(1.3)",opacity:1,offset:.35},{transform:`translate(${a.x-f.x}px,${a.y-f.y}px) scale(1)`,opacity:1}],{duration:560,delay:560,easing:"cubic-bezier(.5,0,.8,.6)"});
      setTimeout(()=>{
        sparks(L,a.x,a.y,[c1,c2],18,150,10,600);
        glyphAt(L,a.x,a.y,glyph,80,c2,c1,[{transform:"scale(.3)",opacity:0},{transform:"scale(1.3)",opacity:1,offset:.35},{transform:"scale(1)",opacity:0}],800);
      },1100);
      return 1100;
    },
    wave(c){
      const {L,a,c1,c2}=c;
      const span=Math.max(520,(a.w||0)),h=Math.max(150,a.h||190),x0=a.x-span/2;
      const bar=mk(L,`left:${x0-240}px;top:${a.y-h/2}px;width:240px;height:${h}px;border-radius:30px;background:linear-gradient(90deg,transparent,${c1} 35%,${c2} 50%,${c1} 65%,transparent);mix-blend-mode:screen;filter:blur(2px)`);
      go(bar,[{transform:"translateX(0)",opacity:0},{opacity:.95,offset:.15},{transform:`translateX(${span+240}px)`,opacity:.9,offset:.9},{transform:`translateX(${span+260}px)`,opacity:0}],{duration:760,easing:"cubic-bezier(.4,0,.6,1)"});
      for(let i=0;i<14;i++)setTimeout(()=>sparks(L,x0+i*(span/13),a.y+rnd(-h/3,h/3),[c1,c2],3,50,7,420),i*45);
      return 520;
    },
    flash(c){
      const {L,W,H,c1,c2,glyph,a}=c;
      const o=mk(L,`left:0;top:0;width:${W}px;height:${H}px;background:radial-gradient(circle at 50% 45%,${c2},${c1} 38%,transparent 72%);mix-blend-mode:screen;opacity:0`);
      go(o,[{opacity:0},{opacity:.75,offset:.18},{opacity:0}],{duration:900});
      glyphAt(L,W/2,H*.44,glyph,230,c2,c1,[{transform:"scale(.4)",opacity:0},{transform:"scale(1.15)",opacity:1,offset:.28},{transform:"scale(1)",opacity:1,offset:.7},{transform:"scale(1.3)",opacity:0}],1100);
      sparks(L,W/2,H*.44,[c1,c2],24,420,12,900);
      return 650;
    },
    cross(c){
      const {L,a,c1,c2,glyph}=c;
      [[0,900,10],[90,700,10],[45,640,6],[-45,640,6]].forEach(([deg,len,th],i)=>{
        const b=mk(L,`left:${a.x-len/2}px;top:${a.y-th/2}px;width:${len}px;height:${th}px;border-radius:${th}px;background:linear-gradient(90deg,transparent,${i<2?c1:c2} 30%,#fff 50%,${i<2?c1:c2} 70%,transparent);box-shadow:0 0 22px ${c1}`);
        go(b,[{transform:`rotate(${deg}deg) scaleX(0)`,opacity:0},{transform:`rotate(${deg}deg) scaleX(1)`,opacity:1,offset:.3},{transform:`rotate(${deg}deg) scaleX(1)`,opacity:0}],{duration:700,delay:i*40});
      });
      glyphAt(L,a.x,a.y,glyph,90,c2,c1,[{transform:"scale(.3) rotate(-90deg)",opacity:0},{transform:"scale(1.25) rotate(0)",opacity:1,offset:.4},{transform:"scale(1) rotate(30deg)",opacity:0}],900);
      sparks(L,a.x,a.y,[c1,c2],16,180,9,700);
      return 450;
    },
    orbit(c){
      const {L,f,a,c1,c2,glyph}=c;
      const N=6,R=88;
      const box=mk(L,`left:${f.x}px;top:${f.y}px;width:0;height:0`);
      for(let i=0;i<N;i++){
        const th=i/N*TAU;
        const g=mk(box,`left:${Math.cos(th)*R-14}px;top:${Math.sin(th)*R-14}px;width:28px;height:28px;font:900 26px/28px var(--serif);text-align:center;color:${i%2?c1:c2};text-shadow:0 0 12px ${c1}`,glyph);
        void g;
      }
      go(box,[{transform:"rotate(0) scale(.4)",opacity:0},{transform:"rotate(200deg) scale(1)",opacity:1,offset:.3},{transform:"rotate(540deg) scale(1)",opacity:1}],{duration:700,easing:"ease-in-out"});
      setTimeout(()=>{
        for(let i=0;i<N;i++){
          const g=mk(L,`left:${f.x-14}px;top:${f.y-14}px;width:28px;height:28px;font:900 26px/28px var(--serif);text-align:center;color:${i%2?c1:c2};text-shadow:0 0 12px ${c1}`,glyph);
          go(g,[{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${a.x-f.x+rnd(-26,26)}px,${a.y-f.y+rnd(-26,26)}px) scale(1.6)`,opacity:1,offset:.85},{opacity:0,transform:`translate(${a.x-f.x}px,${a.y-f.y}px) scale(.4)`}],{duration:460,delay:i*45,easing:"cubic-bezier(.5,0,.8,.6)"});
        }
        setTimeout(()=>sparks(L,a.x,a.y,[c1,c2],18,150,10,600),420);
      },680);
      return 1000;
    },
    rift(c){
      const {L,a,c1,c2,glyph}=c;
      const e=mk(L,`left:${a.x-170}px;top:${a.y-36}px;width:340px;height:72px;border-radius:50%;background:radial-gradient(ellipse,#05060a 28%,${c1} 62%,transparent 74%);box-shadow:0 0 50px ${c1};opacity:0`);
      go(e,[{transform:"scale(.1,.1)",opacity:0},{transform:"scale(1,1)",opacity:1,offset:.25},{transform:"scale(1,1)",opacity:1,offset:.75},{transform:"scale(.2,.1)",opacity:0}],{duration:1000});
      for(let i=0;i<16;i++){
        const x=a.x+rnd(-140,140),s=rnd(7,13),col=i%2?c1:c2,delay=i*40;
        const p=mk(L,`left:${x-s/2}px;top:${a.y-s/2-230}px;width:${s}px;height:${s}px;border-radius:50%;background:${col};box-shadow:0 0 12px ${col}`);
        go(p,[{transform:"translateY(0)",opacity:0},{opacity:1,offset:.2},{transform:"translateY(230px) scale(.4)",opacity:.9}],{duration:520,delay:delay+120,easing:"ease-in"});
      }
      glyphAt(L,a.x,a.y,glyph,92,c2,c1,[{transform:"translateY(40px) scale(.3)",opacity:0},{transform:"translateY(-70px) scale(1.2)",opacity:1,offset:.5},{transform:"translateY(-130px) scale(1)",opacity:0}],1000);
      return 700;
    },
    swoop(c){   // 彗星陨击：紫白交织的彗星盘旋一圈后猛地撞向目标
      const {L,f,a,c1,c2,glyph,shk}=c;
      const cx=a.x,cy=a.y-255,R=235,start=-Math.PI/2,N=10;
      const pts=[{x:f.x,y:f.y,o:0}];
      for(let i=0;i<=N;i++){
        const ang=start+i/N*TAU;
        pts.push({x:cx+Math.cos(ang)*R,y:cy+Math.sin(ang)*R,o:.08+i/N*.58});
      }
      pts.push({x:a.x,y:a.y,o:.76});
      pts.push({x:a.x,y:a.y,o:1});
      const head=mk(L,`left:${f.x-18}px;top:${f.y-18}px;width:36px;height:36px;border-radius:50%;background:radial-gradient(circle,#fff 0%,${c2} 28%,${c1} 58%,transparent 78%);box-shadow:0 0 16px ${c2},0 0 34px ${c1},0 0 60px ${c1};opacity:0`);
      go(head,pts.map(p=>({transform:`translate(${p.x-f.x}px,${p.y-f.y}px)`,opacity:p.o<.04?0:1,offset:p.o})),{duration:1150,easing:"linear"});
      for(let i=1;i<pts.length-1;i++){
        const p=pts[i],delay=1150*p.o;
        setTimeout(()=>{
          for(let k=0;k<2;k++){
            const s=rnd(6,12),col=k%2?c1:c2;
            const g=mk(L,`left:${p.x-s/2}px;top:${p.y-s/2}px;width:${s}px;height:${s}px;border-radius:50%;background:${col};box-shadow:0 0 ${s*2.2}px ${col}`);
            go(g,[{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${rnd(-28,28)}px,${rnd(-28,28)}px) scale(.15)`,opacity:0}],{duration:520});
          }
          if(Math.random()<.35){
            const sz=rnd(12,22);
            const g=mk(L,`left:${p.x-sz/2}px;top:${p.y-sz/2}px;font:900 ${sz}px/1 var(--serif);color:${i%2?c1:c2};text-shadow:0 0 10px ${c1};text-align:center;width:${sz}px`,glyph);
            go(g,[{transform:"scale(.4) rotate(0)",opacity:1},{transform:"scale(.95) rotate(140deg)",opacity:0}],{duration:620});
          }
        },delay);
      }
      setTimeout(()=>{
        sparks(L,a.x,a.y,[c1,c2,"#fff"],30,250,13,720);
        glyphAt(L,a.x,a.y,glyph,120,c2,c1,[{transform:"scale(.2)",opacity:0},{transform:"scale(1.7)",opacity:1,offset:.3},{transform:"scale(1.15)",opacity:0}],850);
        if(shk)shk();
      },1150*.76);
      return 1150;
    }
  };
  const SFX={burst:"hit",rain:"spell",rise:"heal",ring:"spell",slash:"hit",pillar:"core",spiral:"spell",wave:"hit",flash:"core",cross:"core",orbit:"spell",rift:"spell",swoop:"hit"};
  const SHAKE={burst:1,slash:1,flash:1,cross:1,pillar:1};

  /* 卡名横幅（精英专属） */
  function banner(L,W,H,name,c1,c2){
    const bar=mk(L,`left:0;top:${H*.27}px;width:${W}px;height:92px;background:linear-gradient(90deg,transparent,rgba(8,12,14,.86) 20%,rgba(8,12,14,.86) 80%,transparent);opacity:0`);
    go(bar,[{opacity:0,transform:"scaleY(.2)"},{opacity:1,transform:"scaleY(1)",offset:.15},{opacity:1,offset:.8},{opacity:0}],{duration:1500});
    const t=mk(L,`left:0;top:${H*.27}px;width:${W}px;height:92px;display:grid;place-items:center;font:900 46px var(--serif);letter-spacing:.2em;color:${c2};text-shadow:0 0 22px ${c1},0 0 54px ${c1};opacity:0`,name);
    go(t,[{opacity:0,transform:"translateY(14px) scale(.9)"},{opacity:1,transform:"translateY(0) scale(1)",offset:.2},{opacity:1,offset:.8},{opacity:0,transform:"translateY(-8px)"}],{duration:1500});
  }

  /* 播放一个配方；返回的 Promise 在动画的“高潮”处结束，余光继续自动播完 */
  async function run(r,ctx){
    if(!r||r.native||!ctx||!ctx.layer)return;
    const pat=P[r.pattern];if(!pat)return;
    const W=ctx.W||1280,H=ctx.H||720;
    const c={L:ctx.layer,W,H,a:ctx.anchor||{x:W/2,y:H/2,w:0,h:0},f:ctx.from||{x:200,y:H-120},
      c1:r.colors[0],c2:r.colors[1],glyph:r.glyph||"✦",shk:ctx.shake};
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
