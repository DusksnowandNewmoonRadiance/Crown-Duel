/* 局内聊天测试 */
process.env.PORT="3919";process.env.HOST="127.0.0.1";
const os=require("os"),fs=require("fs"),path=require("path");
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"cd-chat-"));
const {io}=require("socket.io-client");
const srv=require("../server/index.js");
const URL="http://127.0.0.1:3919";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];const check=(n,ok,x)=>{results.push(ok);console.log((ok?"✔ ":"✘ ")+n+(x?"  "+x:""));};
function client(name){
  return new Promise(res=>{
    const s=io(URL,{transports:["websocket"]});const got=[];
    s.on("game:chat",m=>got.push(m));
    s.on("connect",()=>s.emit("hello",{clientId:"chat-test-"+name,nick:name,hero:"苏苏"},()=>res({s,got})));
  });
}
const chat=(c,t)=>new Promise(r=>c.s.emit("game:chat",t,r));
(async()=>{
  const A=await client("甲"),B=await client("乙");
  const early=await chat(A,"大厅里不该发出去");
  check("不在对局中时被拒绝",!early.ok,early.error);
  A.s.emit("match:quick");await sleep(100);B.s.emit("match:quick");
  await sleep(3800);   // 倒计时 3 秒后开局
  const r1=await chat(A,"你好！");await sleep(150);
  check("发送成功",r1.ok);
  check("双方都收到，且身份正确",A.got[0]&&A.got[0].who==="me"&&B.got[0]&&B.got[0].who==="foe"&&B.got[0].text==="你好！"&&B.got[0].nick==="甲");
  const r2=await chat(A,"太快了");
  check("发言过快被限制",!r2.ok,r2.error);
  await sleep(1300);
  const long="长".repeat(200);
  const r3=await chat(B,long);await sleep(150);
  check("超长消息被截断为 60 字",r3.ok&&A.got[A.got.length-1].text.length===60);
  await sleep(1300);
  const r4=await chat(A,"<b>HTML</b>\u0007");await sleep(150);
  check("过滤尖括号和控制字符",r4.ok&&!/[<>\u0007]/.test(B.got[B.got.length-1].text),JSON.stringify(B.got[B.got.length-1].text));
  await sleep(1300);
  const r5=await chat(A,"   ");
  check("空消息被拒绝",!r5.ok,r5.error);
  A.s.close();B.s.close();srv.io.close();srv.server.close();
  const pass=results.every(Boolean);console.log(pass?"CHAT TEST PASSED":"CHAT TEST FAILED");
  setTimeout(()=>process.exit(pass?0:1),200);
})().catch(e=>{console.error(e);process.exit(1);});
