/* ============================================================================
   卡面插画引擎 · CardArt（极简线稿版）
   ----------------------------------------------------------------------------
   以前卡面「图」就是一个 Unicode 字符配渐变，显得廉价；
   现在改成程序化 SVG：低饱和单色底 + 一条线条纹章 + 一条地平线。
   每位卡牌师有自己的母题，除此之外不加任何装饰（无放射线、无尘点、无暗角）。
   ============================================================================ */
const CardArt=(()=>{
  const C=window.DuelCards;

  /* ---------------- 颜色 ---------------- */
  function hexToRgb(hex){
    let h=String(hex||"#9aa0a6").replace("#","");
    if(h.length===3)h=h.split("").map(x=>x+x).join("");
    const n=parseInt(h,16);
    if(!isFinite(n))return{r:154,g:160,b:166};
    return{r:(n>>16)&255,g:(n>>8)&255,b:n&255};
  }
  function rgbToHsl(r,g,b){
    r/=255;g/=255;b/=255;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
    let h=0,s=0;
    if(mx!==mn){
      const d=mx-mn;
      s=l>.5?d/(2-mx-mn):d/(mx+mn);
      if(mx===r)h=((g-b)/d+(g<b?6:0))/6;
      else if(mx===g)h=((b-r)/d+2)/6;
      else h=((r-g)/d+4)/6;
    }
    return{h:h*360,s:s*100,l:l*100};
  }
  function hslToHex(h,s,l){
    h=((h%360)+360)%360;s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;
    const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
    let r=0,g=0,b=0;
    if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}
    else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}
    else if(h<300){r=x;b=c;}else{r=c;b=x;}
    const to=v=>Math.round((v+m)*255).toString(16).padStart(2,"0");
    return"#"+to(r)+to(g)+to(b);
  }
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  const cache={};
  function palette(hero){
    if(cache[hero])return cache[hero];
    const base=(C.COLORS&&C.COLORS[hero])||"#9aa0a6";
    const {r,g,b}=hexToRgb(base);
    const {h,s}=rgbToHsl(r,g,b);
    const sat=clamp(s,6,30);                 // 压低饱和度：这是「不花哨」的关键
    const p={
      key:base,
      bg:hslToHex(h,sat*.55,10),
      bgHi:hslToHex(h,sat*.7,15),
      line:hslToHex(h,sat*.95,64),
      lineDim:hslToHex(h,sat*.8,42),
      fill:hslToHex(h,sat*.85,26),
    };
    cache[hero]=p;
    return p;
  }

  function hash(str){
    let h=2166136261,str2=String(str);
    for(let i=0;i<str2.length;i++){h^=str2.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }

  /* ---------------- 基础形状 ---------------- */
  function starPath(cx,cy,ro,ri,n,rot){
    let d="";
    for(let i=0;i<n*2;i++){
      const rr=i%2?ri:ro;
      const a=(Math.PI*2*i)/(n*2)+(rot||0)-Math.PI/2;
      d+=(i?"L":"M")+(cx+Math.cos(a)*rr).toFixed(2)+" "+(cy+Math.sin(a)*rr).toFixed(2);
    }
    return d+"Z";
  }

  /* ---------------- 卡牌师纹章母题 ----------------
     坐标以 (0,0) 为中心，约 36×36；只用描边，不堆装饰。
  ------------------------------------------------ */
  const MOTIF={
    /* 绘梨衣：叶 */
    "绘梨衣":p=>`
      <path d="M0 -15 C7 -8 7 0 0 7 C-7 0 -7 -8 0 -15 Z"/>
      <path d="M0 -11 L0 6" opacity=".7"/>
      <path d="M-1.5 -6 L-7 -10 M1.5 -6 L7 -10 M-2 0 L-8 -1 M2 0 L8 -1" opacity=".45"/>`,
    /* 苏苏：星 */
    "苏苏":p=>`
      <path d="${starPath(0,0,14,5.6,5,0)}"/>
      <circle r="2.2" fill="${p.line}" stroke="none"/>`,
    /* 字母：A 字骨 */
    "字母":p=>`
      <path d="M-9 12 L0 -14 L9 12"/>
      <path d="M-5.2 3 L5.2 3" opacity=".6"/>
      <path d="M-15 -13 L-11 -9 M15 -13 L11 -9" opacity=".4"/>`,
    /* 七星：七芒 */
    "七星":p=>`
      <path d="${starPath(0,0,14.5,6.4,7,.26)}"/>
      <circle r="1.8" fill="${p.line}" stroke="none"/>`,
    /* 核弹：环与瓣 */
    "核弹":p=>`
      <circle r="14"/>
      <circle r="7" opacity=".5"/>
      ${[0,120,240].map(a=>`<path d="M0 -3.6 A3.6 3.6 0 0 1 3.1 -1.8 L7.4 -4.3 A8 8 0 0 0 0 -8 Z" fill="${p.fill}" stroke="none" transform="rotate(${a})"/>`).join("")}
      <circle r="1.6" fill="${p.line}" stroke="none"/>`,
    /* 猪瘟鱼：鱼与钱 */
    "猪瘟鱼":p=>`
      <path d="M-14 2 C-8 -8 4 -9 10 -2 C4 6 -8 8 -14 2 Z"/>
      <path d="M-14 2 L-20 -5 M-14 2 L-20 8" opacity=".7"/>
      <circle cx="4.5" cy="-2" r="1.3" fill="${p.line}" stroke="none"/>
      <circle cx="11" cy="10" r="6" opacity=".7"/>
      <path d="M11 4.4 L11 15.6" opacity=".5"/>`,
    /* 八幡：锚 */
    "八幡":p=>`
      <path d="M0 -16 L0 13"/>
      <path d="M-8 -9 L8 -9"/>
      <circle cy="-12" r="2.8"/>
      <path d="M-11 4 C-9 13 9 13 11 4"/>
      <path d="M-11 4 L-14 1 M11 4 L14 1" opacity=".6"/>`,
    /* 045：十字与塔 */
    "045":p=>`
      <path d="M0 -16 L3.4 -3.4 L16 0 L3.4 3.4 L0 16 L-3.4 3.4 L-16 0 L-3.4 -3.4 Z"/>
      <path d="M-5 -1 L-5 -6 L-2 -6 L-2 -3 L0 -3 L0 -7 L2 -7 L2 -3 L5 -3 L5 -1" opacity=".6"/>
      <path d="M-5 8 L5 8" opacity=".45"/>`,
    /* 下水：炮与弹道 */
    "下水":p=>`
      <path d="M-13 13 L-9 -11 L9 -11 L13 13 Z" opacity=".55"/>
      <path d="M-13 -3 L13 -12"/>
      <circle cx="13" cy="-12" r="2.6" opacity=".8"/>
      <path d="M-18 0 C-6 -15 8 -17 19 -21" stroke-dasharray="2.4 3" opacity=".55"/>`,
    /* 白猫：纸与墨 */
    "白猫":p=>`
      <path d="M-10 -15 L6 -15 L12 -9 L12 15 L-10 15 Z"/>
      <path d="M6 -15 L6 -9 L12 -9" opacity=".6"/>
      <path d="M-5 -6 L2 -6 M-5 -1 L7 -1 M-5 4 L1 4" opacity=".4"/>
      <path d="M-4 10 C2 6 7 13 13 8" opacity=".85"/>`,
  };
  const FALLBACK=p=>`
    <path d="${starPath(0,0,13,5.4,4,0)}"/>
    <circle r="2" fill="${p.line}" stroke="none"/>`;

  function motif(hero,p){
    return `<g fill="none" stroke="${p.line}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
      ${(MOTIF[hero]||FALLBACK)(p)}
    </g>`;
  }

  /* ---------------- 造景：单色底 +（单位）一条地平线 ---------------- */
  function frame(id,w,h,p,opts){
    const kind=(opts&&opts.kind)||"unit";
    const horizon=h*0.78;
    return `
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${p.bgHi}"/>
          <stop offset="1" stop-color="${p.bg}"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#${id})"/>
      ${kind==="spell"?"":`<path d="M0 ${horizon.toFixed(1)} L${w} ${horizon.toFixed(1)}" stroke="${p.lineDim}" stroke-width=".7" opacity=".32"/>`}
    `;
  }

  /* ---------------- 卡面插画 ---------------- */
  function art(c){
    const hero=(c&&c.hero)||"";
    const kind=c&&c.kind==="spell"?"spell":"unit";
    const p=palette(hero);
    const id="a"+hash(String((c&&c.id)||"x")+hero+kind).toString(36);
    const w=100,h=43;
    const scale=kind==="spell"?1.02:1.14;
    return `<svg class="artimg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      ${frame(id,w,h,p,{kind})}
      <g transform="translate(${w/2} ${(h*0.46).toFixed(1)}) scale(${scale})">${motif(hero,p)}</g>
    </svg>`;
  }

  /* ---------------- 战场单位插画 ---------------- */
  function unitArt(c){
    const hero=(c&&c.hero)||"";
    const p=palette(hero);
    const id="u"+hash(String((c&&c.id)||"u")+hero).toString(36);
    const w=100,h=62;
    return `<svg class="artimg unitimg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      ${frame(id,w,h,p,{kind:"unit"})}
      <g transform="translate(${w/2} ${(h*0.44).toFixed(1)}) scale(1.08)">${motif(hero,p)}</g>
    </svg>`;
  }

  /* ---------------- 卡背：居中小标记 ---------------- */
  function back(){
    return `<svg class="artimg backimg" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="100" height="140" fill="#121215"/>
      <g transform="translate(50 70)" fill="none" stroke="#3c3c44" stroke-width="1.2" stroke-linejoin="round">
        <path d="M-13 -2 L-13 -10 L-6 -5 L0 -12 L6 -5 L13 -10 L13 -2 Z"/>
        <path d="M-13 -2 L13 -2 L13 3 L-13 3 Z"/>
        <circle cy="10" r="1.4" fill="#3c3c44" stroke="none"/>
      </g>
    </svg>`;
  }

  /* ---------------- 卡牌师徽章 ---------------- */
  function portrait(hero){
    const p=palette(hero);
    const id="p"+hash("por"+hero).toString(36);
    return `<svg class="artimg porimg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      ${frame(id,100,100,p,{kind:"spell"})}
      <g transform="translate(50 50) scale(1.5)">${motif(hero,p)}</g>
    </svg>`;
  }

  return {art,unitArt,back,portrait,palette,hash};
})();
/* 顶层 const 只活在脚本词法作用域里，挂到 window 供其它模块取用 */
window.CardArt=CardArt;

