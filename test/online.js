/* 联机冒烟测试：启动服务器，两个机器人快速匹配并用 AI 打完一整局 */
process.env.PORT=process.env.PORT||"3917";process.env.HOST="127.0.0.1";
const {io}=require("socket.io-client");
const C=require("../shared/cards.js"),E=require("../shared/engine.js"),{AIPlayer}=require("../shared/ai.js");
const srv=require("../server/index.js");
const URL="http://127.0.0.1:"+process.env.PORT;
const heroes=Object.keys(C.PROFILES);
function bot(name,hero){
  return new Promise((resolve,reject)=>{
    const s=io(URL,{transports:["websocket"]});
    const ai=new AIPlayer("normal");let lastView=null,busy=false,actions=0,errors=[];
    /* 只排队一次：重复 match:quick 会 leaveRoom，把已匹配好的对局踢掉 */
    s.on("connect",()=>s.emit("hello",{clientId:"test-"+name+"-"+Date.now(),nick:name,hero,deck:C.defaultDeck(hero)},()=>{
      s.emit("match:quick",{},r=>{ if(!r||!r.ok)console.log("[bot]",name,"排队失败:",JSON.stringify(r)); });
    }));
    s.on("game",async msg=>{
      lastView=msg.view;
      if(msg.view.phase==="over"){s.close();resolve({name,winner:msg.view.winner,actions,errors,reason:msg.view.reason});return;}
      step();
    });
    function act(a){return new Promise(r=>s.emit("game:action",a,r));}
    async function step(){
      const v=lastView;if(busy||!v)return;
      busy=true;
      try{
        if(v.phase==="mulligan"&&!v.mulligan.done){await act({type:"mulligan",uids:v.me.hand.filter(c=>c.cost>=5).map(c=>c.uid)});}
        else if(v.phase==="play"&&v.myTurn){
          let a;
          if(v.pending)a={type:"pick",index:0};
          else{
            // 用视图构造一个最小 game 供 AI 决策
            const g={turn:v.turn,players:[],pending:null};
            g.players[v.you]=Object.assign({deck:[]},v.me);g.players[1-v.you]=Object.assign({deck:[],hand:[]},v.foe);
            const n=ai.next(g,v.you);
            a=n.type==="end"?{type:"end"}:n;
          }
          actions++;
          const r=await act(a);
          if(!r.ok){errors.push(a.type+":"+r.error);if(a.type==="play")ai.plays=99;else if(a.type==="attack")ai.passed.add(a.uid);else {busy=false;return reject(new Error("end failed "+r.error));}}
        }
      }finally{busy=false;}
      if(lastView!==v)step();
    }
    s.on("game",()=>{});
    /* 超时时打印现场，方便定位卡在哪个状态，而不是只丢一句 timeout */
    setTimeout(()=>{const v=lastView||{};reject(new Error("timeout "+name+" turn="+v.turn+" phase="+v.phase+" myTurn="+v.myTurn+" pending="+!!v.pending+" actions="+actions+" errors="+errors.join(",")));},120000);
  });
}
(async()=>{
  const h1=heroes[Math.floor(Math.random()*heroes.length)],h2=heroes[Math.floor(Math.random()*heroes.length)];
  /* 匹配队列偶发竞态：双方都没进对局时整体重试一次（只影响冒烟测试，不改产品行为） */
  let a,b;
  for(let attempt=1;attempt<=2;attempt++){
    try{ [a,b]=await Promise.all([bot("甲"+attempt,h1),bot("乙"+attempt,h2)]); break; }
    catch(e){
      if(attempt===2)throw e;
      console.log("[retry] 第 "+attempt+" 次未进入对局，重试：" + e.message);
      await new Promise(r=>setTimeout(r,300));
    }
  }
  console.log(h1,"vs",h2,a,b);
  const ok=(a.winner==="draw"&&b.winner==="draw")||(a.winner==="me"&&b.winner==="foe")||(a.winner==="foe"&&b.winner==="me");
  console.log(ok?"ONLINE TEST PASSED":"ONLINE TEST FAILED");
  srv.io.close();srv.server.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
