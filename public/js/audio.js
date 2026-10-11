/* 音效与背景音乐（WebAudio 合成，无需音频文件） */
const Audio2=(()=>{
  let AC=null,unlocked=false;
  const last={};
  const S={sfx:true,music:true};
  try{S.sfx=localStorage.getItem("cd.sfx")!=="0";S.music=localStorage.getItem("cd.music")!=="0";}catch(e){}

  function init(){
    try{if(!AC)AC=new(window.AudioContext||window.webkitAudioContext)();if(AC&&AC.state==="suspended")AC.resume();}catch(e){}
  }
  function tone(f,t,d,type,v,slide){
    if(!AC||!S.sfx)return;
    const n=AC.currentTime+t,o=AC.createOscillator(),g=AC.createGain();
    o.type=type||"sine";o.frequency.setValueAtTime(f,n);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),n+d);
    g.gain.setValueAtTime(v||.1,n);g.gain.exponentialRampToValueAtTime(.001,n+d);
    o.connect(g);g.connect(AC.destination);o.start(n);o.stop(n+d+.03);
  }
  function noise(t,d,v,fc){
    if(!AC||!S.sfx)return;
    const n=AC.currentTime+t,len=Math.max(1,Math.floor(AC.sampleRate*d)),b=AC.createBuffer(1,len,AC.sampleRate),a=b.getChannelData(0);
    for(let i=0;i<len;i++)a[i]=(Math.random()*2-1)*(1-i/len);
    const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();
    s.buffer=b;f.type="lowpass";f.frequency.value=fc||1200;g.gain.value=v||.15;
    s.connect(f);f.connect(g);g.connect(AC.destination);s.start(n);
  }
  const SFX={
    click:()=>tone(700,0,.05,"triangle",.06),
    select:()=>{tone(520,0,.06,"triangle",.08);tone(780,.05,.07,"triangle",.07);},
    pick:()=>{tone(880,0,.06,"triangle",.09);tone(1174,.05,.08,"triangle",.08);},
    draw:()=>noise(0,.09,.1,3200),
    play:()=>{tone(190,0,.14,"square",.08,-90);noise(0,.1,.16,900);},
    spell:()=>{tone(520,0,.28,"sawtooth",.05,520);tone(780,.06,.3,"sine",.07,300);},
    swing:()=>noise(0,.16,.08,2400),
    hit:()=>{noise(0,.14,.26,900);tone(120,0,.14,"square",.1,-60);},
    heal:()=>{tone(523,0,.12,"sine",.09);tone(784,.1,.2,"sine",.09);},
    die:()=>tone(220,0,.3,"sawtooth",.07,-160),
    turn:()=>{tone(392,0,.12,"triangle",.1);tone(587,.12,.22,"triangle",.1);},
    enemy:()=>{tone(300,0,.14,"triangle",.1);tone(220,.14,.22,"triangle",.1);},
    coin:()=>{tone(988,0,.07,"square",.05);tone(1319,.07,.14,"square",.05);},
    error:()=>tone(150,0,.16,"square",.08),
    tick:()=>tone(1200,0,.04,"square",.04),
    core:()=>{tone(880,0,.4,"triangle",.13);tone(1320,.15,.5,"sine",.11);tone(660,.3,.6,"triangle",.09);},
    satur:()=>{noise(0,.5,.28,500);noise(.15,.5,.26,800);noise(.3,.5,.23,1100);[196,262,392,523].forEach((f,i)=>tone(f,i*.1,.35,"sawtooth",.1));},
    win:()=>[523,659,784,1047].forEach((f,i)=>tone(f,i*.13,.34,"triangle",.12)),
    lose:()=>[392,330,262,196].forEach((f,i)=>tone(f,i*.22,.45,"sawtooth",.07)),
    emote:()=>{tone(660,0,.08,"sine",.08);tone(990,.07,.1,"sine",.07);},
    match:()=>[523,784,1047].forEach((f,i)=>tone(f,i*.1,.25,"triangle",.1))
  };
  function sfx(n){const t=performance.now();if(last[n]&&t-last[n]<70)return;last[n]=t;try{SFX[n]&&SFX[n]();}catch(e){}}

  /* ---------- 背景音乐 ---------- */
  const BG={master:null,current:null,timer:null};
  const THEMES={
    menu:{notes:[262,330,392,440,392,330,294,262,220,262,294,330,294,262,247,262],bpm:72,type:"triangle",vol:.9},
    duel:{notes:[220,262,330,262,220,196,220,262,294,262,220,196,175,196,220,0],bpm:96,type:"triangle",vol:.75},
    win:{notes:[523,659,784,1047,784,1047,1319,0],bpm:120,type:"triangle",vol:1,once:true},
    lose:{notes:[330,294,262,220,196,175,0],bpm:80,type:"sine",vol:1,once:true}
  };
  function stopMusic(){
    BG.current=null;clearTimeout(BG.timer);
    if(BG.master&&AC){const m=BG.master;try{m.gain.setValueAtTime(m.gain.value,AC.currentTime);m.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+.4);}catch(e){}setTimeout(()=>{try{m.disconnect();}catch(e){}},500);}
    BG.master=null;
  }
  function music(theme){
    BG.want=theme;
    if(!unlocked||!S.music){stopMusic();return;}
    init();if(!AC)return;
    if(BG.current===theme)return;
    stopMusic();
    const th=THEMES[theme];if(!th)return;
    const master=AC.createGain();master.gain.value=.022;master.connect(AC.destination);
    BG.master=master;BG.current=theme;
    const beat=60/th.bpm;let i=0;
    const tick=()=>{
      if(BG.current!==theme)return;
      if(th.once&&i>=th.notes.length)return;
      const f=th.notes[i%th.notes.length];i++;
      if(f){
        const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
        o.type=th.type;o.frequency.value=f;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(th.vol,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+beat*.95);
        o.connect(g);g.connect(master);o.start(t);o.stop(t+beat);
        if(i%2===0&&theme==="duel"){const o2=AC.createOscillator(),g2=AC.createGain();o2.type="sine";o2.frequency.value=f/2;g2.gain.setValueAtTime(.5,t);g2.gain.exponentialRampToValueAtTime(.001,t+beat*1.8);o2.connect(g2);g2.connect(master);o2.start(t);o2.stop(t+beat*2);}
      }
      BG.timer=setTimeout(tick,beat*1000);
    };
    tick();
  }
  function unlock(){
    if(unlocked)return;unlocked=true;init();
    if(BG.want)music(BG.want);
  }
  ["pointerdown","keydown","touchstart"].forEach(e=>document.addEventListener(e,unlock,{capture:true,once:false}));

  function setSfx(v){S.sfx=v;try{localStorage.setItem("cd.sfx",v?"1":"0");}catch(e){}}
  function setMusic(v){S.music=v;try{localStorage.setItem("cd.music",v?"1":"0");}catch(e){}const w=BG.want;BG.current=null;if(v)music(w);else stopMusic();}
  return{sfx,music,init,setSfx,setMusic,get sfxOn(){return S.sfx;},get musicOn(){return S.music;}};
})();
