/* ============================================================================
   音效与背景音乐 · Audio3「蓝图」
   ----------------------------------------------------------------------------
   与视觉主题（深炭底 / 半调点阵 / 十字定位 / 金色手写体）对应的声音设计：
     · 冷色、克制、精确：D 多利亚调式，马林巴/FM 拨奏 + 玻璃钟（金色点缀）
     · 半调点阵 → 高频短促 tick；十字定位 → 干净的 sine 双音；叠影 → 乒乓延迟
   全部音效与两首 BGM 由 tools/music/blueprint_audio.py 离线合成（numpy，无外部采样），
   输出到 public/audio/{sfx,bgm}/*.ogg。每个音效文件自带短混响，这里不再重复加。
   取不到文件时退回下面同风格的 WebAudio 实时合成，断网 / 老缓存也不会哑音。
     每个声部 → 低通 → 音量包络 → [干声 + 混响送出] → 压缩器 → 主音量 → 输出
   ============================================================================ */
const Audio2=(()=>{
  let AC=null,unlocked=false,ready=false;
  let master,comp,dry,reverb;
  const last={};
  const S={sfx:true,musicVolume:100,lastMusicVolume:100};
  try{
    S.sfx=localStorage.getItem("cd.sfx")!=="0";
    const saved=localStorage.getItem("cd.musicVolume");
    S.musicVolume=saved===null?(localStorage.getItem("cd.music")==="0"?0:100):Math.max(0,Math.min(100,Number(saved)||0));
    if(S.musicVolume>0)S.lastMusicVolume=S.musicVolume;
  }catch(e){}

  const rnd=(a,b)=>a+Math.random()*(b-a);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  /* ---------------- 引擎：总线 / 混响 / 压缩 ---------------- */
  function makeIR(sec,decay){
    const len=Math.floor(AC.sampleRate*sec),buf=AC.createBuffer(2,len,AC.sampleRate);
    for(let ch=0;ch<2;ch++){
      const d=buf.getChannelData(ch);
      for(let i=0;i<len;i++){
        const t=i/len;
        /* 前 8ms 淡入避免爆音，之后指数衰减；两声道独立噪声 → 立体声宽度 */
        const fade=Math.min(1,i/(AC.sampleRate*0.008));
        d[i]=(Math.random()*2-1)*Math.pow(1-t,decay)*fade;
      }
    }
    return buf;
  }
  function init(){
    if(AC){if(AC.state==="suspended")AC.resume();return;}
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    try{
      AC=new Ctx();
      comp=AC.createDynamicsCompressor();
      comp.threshold.value=-16;comp.knee.value=20;comp.ratio.value=4;
      comp.attack.value=.004;comp.release.value=.22;
      master=AC.createGain();master.gain.value=.85;
      comp.connect(master);master.connect(AC.destination);

      reverb=AC.createConvolver();
      reverb.buffer=makeIR(2.2,2.8);
      const wet=AC.createGain();wet.gain.value=.9;
      reverb.connect(wet);wet.connect(comp);

      dry=AC.createGain();dry.gain.value=1;dry.connect(comp);
      ready=true;
      loadSamples();
      loadBgm("menu");loadBgm("duel");loadBgm("eriyi");
    }catch(e){AC=null;ready=false;}
  }
  /* 把一路信号接到干声，并按比例送进混响 */
  function bus(node,wetAmt){
    try{node.connect(dry);}catch(e){}
    if(wetAmt>0){
      const g=AC.createGain();g.gain.value=wetAmt;
      node.connect(g);g.connect(reverb);
    }
  }

  /* ---------------- 采样层 ----------------
     真录音永远比合成器「高级」：19 个 CC0 素材（Kenney，见 public/audio/LICENSE.txt）
     覆盖全部高频音效，仍然走同一条压缩/混响总线。取不到就退回下面的合成实现，
     所以断网、离线包、老缓存都不会出现哑音。 */
  const SAMPLE_NAMES=["click","select","pick","draw","play","spell","swing","hit","heal","die","turn",
    "enemy","coin","error","tick","core","satur","win","lose","emote","match"];
  const SAMPLE_URL={};SAMPLE_NAMES.forEach(n=>{SAMPLE_URL[n]="audio/sfx/"+n+".ogg";});
  /* 渲染时已按「提示音轻、打击重」配好相对电平；这里只留一个总增益，并在运行时加 ±3% 音高微调防机关枪 */
  const SFX_GAIN=.62;
  const samples={};
  let samplesLoading=false;
  function loadSamples(){
    if(samplesLoading||!AC)return;
    samplesLoading=true;
    Object.keys(SAMPLE_URL).forEach(n=>{
      if(samples[n])return;
      fetch(SAMPLE_URL[n]).then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status))
        .then(ab=>AC.decodeAudioData(ab))
        .then(buf=>{samples[n]=buf;})
        .catch(()=>{ /* 静默降级到合成 */ });
    });
  }
  function playSample(n){
    const b=samples[n];
    if(!b||!AC)return false;
    try{
      const src=AC.createBufferSource();src.buffer=b;
      src.playbackRate.value=1+rnd(-.03,.03);
      const g=AC.createGain();g.gain.value=SFX_GAIN;
      src.connect(g);bus(g,0);
      src.start(AC.currentTime);
      return true;
    }catch(e){return false;}
  }
  /* ---------------- 基本声部 ---------------- */
  /* 一个音：低通（可扫频）+ 起音/衰减包络 */
  function voice(freq,at,dur,o){
    if(!AC)return;
    o=o||{};
    const t0=AC.currentTime+at;
    const osc=AC.createOscillator();
    osc.type=o.type||"triangle";
    const f=freq*(o.detune?1+rnd(-o.detune,o.detune):1);
    osc.frequency.setValueAtTime(f,t0);
    if(o.glide)osc.frequency.exponentialRampToValueAtTime(Math.max(20,f*o.glide),t0+dur);

    const filt=AC.createBiquadFilter();
    filt.type="lowpass";
    filt.frequency.setValueAtTime(o.cutoff||2400,t0);
    if(o.cutoffEnd)filt.frequency.exponentialRampToValueAtTime(Math.max(80,o.cutoffEnd),t0+dur);
    filt.Q.value=o.q==null?.6:o.q;

    const g=AC.createGain();
    const peak=o.vol==null?.12:o.vol;
    const atk=clamp(o.attack==null?.006:o.attack,.002,dur*.6);
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(peak,t0+atk);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);

    osc.connect(filt);filt.connect(g);bus(g,o.wet==null?.18:o.wet);
    osc.start(t0);osc.stop(t0+dur+.06);
  }
  /* 一段噪声：带通/低通整形，用来做瞬态与摩擦声 */
  function noise(at,dur,o){
    if(!AC)return;
    o=o||{};
    const t0=AC.currentTime+at;
    const len=Math.max(1,Math.floor(AC.sampleRate*dur));
    const buf=AC.createBuffer(1,len,AC.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    const src=AC.createBufferSource();src.buffer=buf;
    const f=AC.createBiquadFilter();f.type=o.type||"bandpass";
    f.frequency.setValueAtTime(o.freq||1200,t0);
    if(o.freqEnd)f.frequency.exponentialRampToValueAtTime(Math.max(80,o.freqEnd),t0+dur);
    f.Q.value=o.q==null?1.0:o.q;
    const g=AC.createGain();
    const peak=o.vol==null?.12:o.vol;
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(peak,t0+(o.attack||.004));
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    src.connect(f);f.connect(g);bus(g,o.wet==null?.16:o.wet);
    src.start(t0);
  }

  /* ---------------- 音效 ---------------- */
  const SFX={
    click:()=>voice(600,0,.055,{type:"triangle",vol:.045,cutoff:2600,detune:.02,wet:.1}),
    select:()=>{voice(620,0,.07,{vol:.07,cutoff:2600,detune:.02});voice(930,.045,.09,{vol:.06,cutoff:3200,detune:.02});},
    pick:()=>{voice(880,0,.07,{vol:.075,cutoff:3400,detune:.02});voice(1244,.05,.1,{vol:.065,cutoff:3800,detune:.02});},
    draw:()=>{noise(0,.13,{freq:2600,q:.9,vol:.06,freqEnd:5200,wet:.12});},
    play:()=>{
      voice(150,0,.2,{type:"sine",vol:.16,cutoff:640,glide:.6,detune:.02,wet:.22});
      noise(0,.1,{freq:760,vol:.1,wet:.22});
      noise(.02,.06,{freq:2400,q:2,vol:.05,wet:.1});
    },
    spell:()=>{
      voice(420,0,.42,{vol:.08,cutoff:1500,cutoffEnd:4200,glide:1.5,wet:.45});
      voice(630,.05,.5,{type:"sine",vol:.06,cutoff:2600,cutoffEnd:5200,wet:.5});
      noise(0,.3,{freq:1800,q:.6,vol:.035,freqEnd:4200,wet:.45});
    },
    swing:()=>{noise(0,.17,{freq:2400,q:.7,vol:.075,freqEnd:900,wet:.2});},
    hit:()=>{
      voice(150,0,.17,{type:"sine",vol:.22,cutoff:900,glide:.42,wet:.12});
      voice(240,.005,.1,{type:"triangle",vol:.1,cutoff:1200,glide:.55,wet:.1,detune:.03});
      noise(0,.11,{freq:900,q:.8,vol:.16,wet:.18});
    },
    heal:()=>{
      voice(660,0,.45,{type:"sine",vol:.075,cutoff:3800,wet:.5});
      voice(990,.07,.5,{type:"sine",vol:.055,cutoff:4200,wet:.55});
      noise(0,.5,{freq:5200,q:.5,vol:.018,wet:.6});
    },
    die:()=>{
      voice(190,0,.42,{type:"triangle",vol:.09,cutoff:1200,cutoffEnd:300,glide:.4,wet:.32});
      noise(0,.3,{freq:600,q:.7,vol:.06,freqEnd:200,wet:.3});
    },
    turn:()=>{voice(392,0,.24,{vol:.08,cutoff:2400,wet:.28});voice(587,.09,.3,{vol:.07,cutoff:2800,wet:.3});},
    enemy:()=>{voice(300,0,.16,{vol:.075,cutoff:1800,wet:.2});voice(222,.1,.28,{vol:.07,cutoff:1400,wet:.24});},
    coin:()=>{
      voice(1046,0,.09,{vol:.055,cutoff:5200,wet:.14,detune:.02});
      voice(1568,.06,.14,{vol:.045,cutoff:6000,wet:.18,detune:.02});
    },
    error:()=>{voice(140,0,.18,{type:"triangle",vol:.09,cutoff:700,glide:.85,wet:.12});},
    tick:()=>{noise(0,.04,{type:"highpass",freq:3200,vol:.03,wet:.05});},
    core:()=>{
      [523,784,1046].forEach((f,i)=>voice(f,i*.05,.6,{vol:.075,cutoff:3600,wet:.5}));
      voice(262,0,.7,{type:"sine",vol:.06,cutoff:900,wet:.4});
      noise(0,.55,{freq:2600,q:.5,vol:.03,wet:.55});
    },
    satur:()=>{
      [0,.12,.24].forEach((d,i)=>noise(d,.4,{freq:500+i*260,q:.7,vol:.13-i*.02,wet:.3}));
      [196,262,392,523].forEach((f,i)=>voice(f,i*.09,.4,{vol:.06,cutoff:2200,wet:.35,detune:.015}));
    },
    win:()=>{
      [523,659,784,1047].forEach((f,i)=>voice(f,i*.13,.5,{vol:.09,cutoff:3600,wet:.45,detune:.008}));
      voice(262,0,.9,{type:"sine",vol:.06,cutoff:900,wet:.4});
    },
    lose:()=>{
      [392,330,262,196].forEach((f,i)=>voice(f,i*.22,.55,{vol:.075,cutoff:1600,cutoffEnd:700,wet:.4,detune:.008}));
    },
    emote:()=>{voice(680,0,.09,{type:"sine",vol:.06,cutoff:3600,wet:.3,detune:.03});voice(1010,.06,.12,{type:"sine",vol:.05,cutoff:4200,wet:.35,detune:.03});},
    match:()=>{[523,784,1047].forEach((f,i)=>voice(f,i*.1,.4,{vol:.08,cutoff:3400,wet:.4}));}
  };
  function sfx(n){
    if(!AC||!S.sfx)return;
    const t=performance.now();
    if(last[n]&&t-last[n]<60)return;
    last[n]=t;
    try{ if(playSample(n))return; SFX[n]&&SFX[n](); }catch(e){}
  }

  /* ---------------- 背景音乐 ---------------- */
  /* 离线渲染的管弦 loop（public/audio/bgm/*.ogg）：真曲子，比实时合成厚得多。
     文件没到位时先用合成顶上，加载完自动切过去；断网则一直是合成，不会静音。 */
  const BGM_URL={menu:"audio/bgm/menu.ogg",duel:"audio/bgm/duel.ogg",susu:"audio/bgm/susu.ogg",eriyi:"audio/bgm/eriyi.mp3"};
  /* menu / duel 是原声配乐（-16 dBFS RMS 左右）；susu / eriyi 是角色专属曲，各自按成品响度配平 */
  const BGM_GAIN={menu:.30,duel:.30,susu:.36,eriyi:.34};
  const bgmBuf={},bgmLoading={};
  const BG={want:null,current:null,timer:null,bus:null,pad:null,padOscs:null,file:null};
  function loadBgm(name){
    if(!AC||bgmBuf[name]||bgmLoading[name])return;
    bgmLoading[name]=true;
    fetch(BGM_URL[name]).then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status))
      .then(ab=>AC.decodeAudioData(ab))
      .then(buf=>{bgmBuf[name]=buf;bgmLoading[name]=false;
        /* 曲子到位时如果正放同主题的合成版，直接换过去 */
        if(S.musicVolume>0&&BG.want===name&&!BG.file&&AC){BG.current=null;music(name);}})
      .catch(()=>{bgmLoading[name]=false;});
  }
  function playBgmFile(name){
    const buf=bgmBuf[name];
    if(!buf||!AC)return false;
    try{
      const src=AC.createBufferSource();src.buffer=buf;src.loop=true;
      const g=AC.createGain();g.gain.value=.0001;
      src.connect(g);g.connect(comp);
      const send=AC.createGain();send.gain.value=.12;g.connect(send);send.connect(reverb);
      src.start();
      g.gain.exponentialRampToValueAtTime((BGM_GAIN[name]||.25)*S.musicVolume/100,AC.currentTime+1.6);
      BG.file={src,gain:g};
      BG.current=name;
      return true;
    }catch(e){return false;}
  }
  const THEMES={
    menu:{notes:[294,349,440,523,440,349,330,294,262,294,349,392,349,294,262,294],bpm:60,type:"sine",vol:.03,pad:[73,110]},
    duel:{notes:[294,349,440,349,294,262,294,349,392,349,294,262,233,262,294,0],bpm:112,type:"triangle",vol:.028,pad:[73,110]},
    /* 苏苏《赤色铁流》的合成版兜底：susu.ogg 没加载完（或断网）时先顶这段主题 A，
       音高/调性（D 小调）与真曲子一致，切过去不会跳调。 */
    susu:{notes:[440,440,587,698,698,659,587,587,523,587,659,698,659,587,440,0],bpm:124,type:"triangle",vol:.028,pad:[147,220]},
    win:{notes:[523,659,784,1047,784,1047,1319,0],bpm:120,type:"triangle",vol:.045,once:true},
    lose:{notes:[330,294,262,220,196,175,0],bpm:80,type:"sine",vol:.040,once:true}
  };
  function stopMusic(){
    BG.current=null;
    if(BG.file){
      const f=BG.file;BG.file=null;
      try{
        f.gain.gain.setValueAtTime(Math.max(.0001,f.gain.gain.value),AC.currentTime);
        f.gain.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+.5);
        f.src.stop(AC.currentTime+.65);
      }catch(e){}
    }
    if(BG.timer){clearInterval(BG.timer);BG.timer=null;}
    const stopNode=n=>{
      if(!n||!AC)return;
      try{
        n.gain.setValueAtTime(Math.max(.0001,n.gain.value),AC.currentTime);
        n.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+.5);
      }catch(e){}
      setTimeout(()=>{try{n.disconnect();}catch(e){}},700);
    };
    (BG.padOscs||[]).forEach(o=>{try{o.stop(AC.currentTime+.7);}catch(e){}});BG.padOscs=null;
    stopNode(BG.bus);stopNode(BG.pad);
    BG.bus=null;BG.pad=null;
  }
  function playThemeNote(f,t0,beat,th,busGain){
    if(!AC||!busGain)return;
    const osc=AC.createOscillator(),g=AC.createGain(),filt=AC.createBiquadFilter();
    osc.type=th.type||"triangle";
    /* 人类化：±7 音分、±10ms，避免机械感 */
    osc.frequency.value=f*(1+rnd(-.004,.004));
    osc.detune.value=rnd(-4,4);
    filt.type="lowpass";filt.frequency.value=2200;filt.Q.value=.4;
    const atk=.02,dur=beat*.92;
    g.gain.setValueAtTime(.0001,t0);
    g.gain.exponentialRampToValueAtTime(.9,t0+atk);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    osc.connect(filt);filt.connect(g);g.connect(busGain);
    osc.start(t0);osc.stop(t0+dur+.05);
  }
  function music(theme){
    BG.want=theme;
    if(!unlocked||S.musicVolume<=0){stopMusic();return;}
    init();if(!AC||!ready)return;
    if(BG.current===theme)return;
    stopMusic();
    /* 有离线渲染的曲子就放曲子；还没加载完先挂上加载，同时用合成顶着 */
    if(BGM_URL[theme]){
      if(playBgmFile(theme))return;
      loadBgm(theme);
    }
    const th=THEMES[theme];if(!th)return;

    const busGain=AC.createGain();busGain.gain.value=.0001;busGain.connect(comp);
    const musicWet=AC.createGain();musicWet.gain.value=.5;busGain.connect(musicWet);musicWet.connect(reverb);
    BG.bus=busGain;BG.current=theme;
    busGain.gain.exponentialRampToValueAtTime((th.vol||.12)*S.musicVolume/100,AC.currentTime+.8);

    /* 铺底 pad：根音 + 五度，慢起音，进混响 —— 这一层是「不塑料」的关键 */
    if(th.pad&&!th.once){
      const padGain=AC.createGain();padGain.gain.value=.0001;padGain.connect(comp);
      const ps=AC.createGain();ps.gain.value=.6;padGain.connect(ps);ps.connect(reverb);
      BG.pad=padGain;const padOscs=[];BG.padOscs=padOscs;
      th.pad.forEach((f,i)=>{
        const o=AC.createOscillator(),g=AC.createGain();
        o.type="sine";o.frequency.value=f*(1+(i?0.002:-0.002));
        g.gain.setValueAtTime(.0001,AC.currentTime);
        g.gain.exponentialRampToValueAtTime(.035,AC.currentTime+2.2);
        o.connect(g);g.connect(padGain);o.start();padOscs.push(o);
      });
      padGain.gain.exponentialRampToValueAtTime(.18*S.musicVolume/100,AC.currentTime+2.4);
    }

    /* 用 AudioContext 时钟做前瞻排期：setInterval 只负责「补货」 */
    const beat=60/th.bpm;
    let next=AC.currentTime+.08,i=0;
    BG.timer=setInterval(()=>{
      if(BG.current!==theme)return;
      const horizon=AC.currentTime+.25;
      while(next<horizon){
        const f=th.notes[i%th.notes.length];
        if(f)playThemeNote(f,next,beat,th,busGain);
        /* duel 每两拍补一个低八度，撑住节奏 */
        if(theme==="duel"&&i%2===0)playThemeNote(f?f/2:110,next,beat*1.8,{type:"sine"},busGain);
        next+=beat;i++;
        if(th.once&&i>=th.notes.length){
          const wait=Math.max(400,(next-AC.currentTime)*1000+400);
          setTimeout(()=>{if(BG.current===theme)stopMusic();},wait);
          break;
        }
      }
    },40);
  }
  function unlock(){
    if(unlocked)return;unlocked=true;init();
    if(BG.want)music(BG.want);
  }
  ["pointerdown","keydown","touchstart"].forEach(e=>document.addEventListener(e,unlock,{capture:true}));

  function setSfx(v){S.sfx=v;try{localStorage.setItem("cd.sfx",v?"1":"0");}catch(e){}}
  function setMusicVolume(value){
    const next=clamp(Math.round(Number(value)||0),0,100),wasOn=S.musicVolume>0;
    S.musicVolume=next;
    if(next>0)S.lastMusicVolume=next;
    try{localStorage.setItem("cd.musicVolume",String(next));localStorage.setItem("cd.music",next?"1":"0");}catch(e){}
    if(!next){stopMusic();return;}
    if(!wasOn){if(BG.want)music(BG.want);return;}
    if(!AC)return;
    const update=(node,target)=>{if(node)node.gain.setTargetAtTime(target,AC.currentTime,.08);};
    if(BG.file)update(BG.file.gain,(BGM_GAIN[BG.current]||.25)*next/100);
    else if(BG.current){
      const th=THEMES[BG.current];
      if(th){update(BG.bus,(th.vol||.12)*next/100);update(BG.pad,.18*next/100);}
    }
  }
  function setMusic(v){setMusicVolume(v?(S.lastMusicVolume||100):0);}
  return{sfx,music,init,setSfx,setMusic,setMusicVolume,get sfxOn(){return S.sfx;},get musicOn(){return S.musicVolume>0;},get musicVolume(){return S.musicVolume;}};
})();
