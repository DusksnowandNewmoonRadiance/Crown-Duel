/* 联机稳定性测试：序号 / 心跳 / 断线重连 / 恶意数据 / 长时间不操作判负 */
process.env.PORT="3921";process.env.HOST="127.0.0.1";process.env.TURN_SECONDS="1";
const os=require("os"),fs=require("fs"),path=require("path");
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"cd-net-"));
const {io}=require("socket.io-client");
const srv=require("../server/index.js");
const URL="http://127.0.0.1:3921";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];const check=(n,ok,x)=>{results.push(!!ok);console.log((ok?"✔ ":"✘ ")+n+(x!==undefined?"  "+x:""));};
function client(name,cid){
  return new Promise(res=>{
    const s=io(URL,{transports:["websocket"],forceNew:true});const c={s,games:[],notices:[]};
    s.on("game",u=>c.games.push(u));s.on("game:notice",d=>c.notices.push(d));
    s.on("connect",()=>s.emit("hello",{clientId:cid||"net-test-"+({"甲":"alpha","乙":"beta"}[name]||name),nick:name,hero:"苏苏"},r=>res(Object.assign(c,{hello:r}))));
  });
}
const emit=(c,ev,d)=>new Promise(r=>{const t=setTimeout(()=>r({timeout:true}),3000);c.s.emit(ev,d,x=>{clearTimeout(t);r(x);});});
const last=c=>c.games[c.games.length-1];
(async()=>{
  const A=await client("甲"),B=await client("乙");
  A.s.emit("match:quick");await sleep(100);B.s.emit("match:quick");
  await sleep(3800);
  check("开局后双方收到带序号的对局",last(A)&&last(A).seq>=1&&last(B)&&last(B).seq>=1,last(A)&&last(A).seq);
  const p=await emit(A,"game:ping");
  check("心跳返回当前序号",p.ok&&p.inGame&&p.seq===last(A).seq,JSON.stringify(p));

  // 调度完成后序号递增
  const s0=last(A).seq;
  await emit(A,"game:action",{type:"mulligan",uids:[]});
  await emit(B,"game:action",{type:"mulligan",uids:[]});
  await sleep(150);
  check("操作后序号递增",last(A).seq>s0,s0+" -> "+last(A).seq);
  check("双方的序号一致",last(A).seq===last(B).seq);

  // 恶意 / 畸形数据：不能让服务器崩溃，也不能让对局卡住
  const bads=[null,{},{type:"play"},{type:"play",uid:"x"},{type:"play",uid:1,targets:"abc"},{type:"attack",uid:{}},{type:"pick",index:"zz"},{type:"mulligan",uids:"no"},{type:"end",extra:1},"字符串",12345,[]];
  let allRejected=true;
  for(const b of bads){const r=await emit(A,"game:action",b);if(r&&r.timeout)allRejected=false;}
  check("畸形操作全部得到应答，服务器仍在运行",allRejected);
  const p2=await emit(B,"game:ping");
  check("畸形操作之后心跳仍然正常",p2.ok&&p2.inGame);

  // 断线重连：同一个 clientId 重新连接，收到完整对局状态
  const before=last(A).view.turn;
  A.s.close();
  await sleep(300);
  check("对手收到断线提示",B.notices.some(n=>/断线/.test(n.text)));
  const A2=await client("甲","net-test-alpha");
  await sleep(300);
  const g=last(A2);
  check("重连后收到完整的对局状态",g&&g.full===true&&g.view&&g.view.phase!=="over"&&g.view.turn>=before&&g.seq>=1,g&&("full="+g.full+" seq="+g.seq));
  check("重连后手牌还在",g&&g.view.me.hand.length>0);
  check("对手收到重新连接提示",B.notices.some(n=>/重新连接/.test(n.text)));

  // 请求同步
  A2.games.length=0;
  A2.s.emit("game:sync");await sleep(150);
  check("主动同步返回完整状态",A2.games.length===1&&A2.games[0].full===true);

  // 双方都不操作：连续超时 3 次判负，对局不会无限挂着
  await sleep(11000);
  const end=last(A2);
  check("长时间不操作后对局结束并判负",end&&end.view.phase==="over"&&!!end.view.reason,end&&end.view.reason);

  A2.s.close();B.s.close();srv.io.close();srv.server.close();
  const pass=results.every(Boolean);console.log(pass?"NETSTAB TEST PASSED":"NETSTAB TEST FAILED");
  process.exit(pass?0:1);
})();
