/* 运营功能测试：公告推送、全服广播、数值热更新、维护模式、平滑重启 */
const os=require("os"),fs=require("fs"),path=require("path");
process.env.PORT="3918";process.env.HOST="127.0.0.1";
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"cd-live-"));
process.env.ADMIN_TOKEN="test-admin-token-123";
const {io}=require("socket.io-client");
const realExit=process.exit.bind(process);
let exited=null;process.exit=code=>{exited=code;};   // 拦截平滑重启时的退出
const srv=require("../server/index.js");
const URL="http://127.0.0.1:3918",H={"content-type":"application/json","x-admin-token":process.env.ADMIN_TOKEN};
const api=(m,u,b,h)=>fetch(URL+u,{method:m,headers:h||H,body:b?JSON.stringify(b):undefined}).then(async r=>({status:r.status,body:await r.json()}));
const wait=(s,ev)=>new Promise(r=>s.once(ev,r));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];const check=(name,ok,extra)=>{results.push(ok);console.log((ok?"✔ ":"✘ ")+name+(extra?"  "+extra:""));};
(async()=>{
  const s=io(URL,{transports:["websocket"]});
  const hello=await new Promise(r=>s.on("connect",()=>s.emit("hello",{clientId:"live-test-001",nick:"测试"},r)));
  check("hello 返回版本号",!!hello.build,hello.build);
  check("错误口令被拒绝",(await api("GET","/admin/api/status",null,{"x-admin-token":"wrong-token-xxxxxx"})).status===401);
  const st=await api("GET","/admin/api/status");check("后台状态",st.status===200&&st.body.online===1);
  // 公告
  const p=wait(s,"announce");
  const a=await api("POST","/admin/api/announcements",{title:"测试公告",type:"更新",body:"正文",popup:true});
  const ev=await p;check("发布公告并推送给在线玩家",a.status===200&&ev.latest&&ev.latest.title==="测试公告");
  const list=await api("GET","/api/announcements");check("公开公告列表",list.body.some(x=>x.title==="测试公告"));
  check("非法公告被拒绝",(await api("POST","/admin/api/announcements",{title:""})).status===400);
  // 广播
  const pb=wait(s,"broadcast");await api("POST","/admin/api/broadcast",{text:"今晚维护"});check("全服广播",(await pb).text==="今晚维护");
  // 数值热更新
  const bad=await api("PUT","/admin/api/balance",{overrides:{"苏苏:red":{cost:-1}}});check("非法数值被拒绝",bad.status===400,bad.body.error);
  const pc=wait(s,"content");
  const ok=await api("PUT","/admin/api/balance",{overrides:{"苏苏:red":{cost:3,atk:4}}});await pc;
  const content=(await api("GET","/api/content")).body;
  const C=require("../shared/cards.js");
  check("数值热更新生效",ok.status===200&&content.overrides["苏苏:red"].cost===3&&C.PROFILES["苏苏"].cards.find(c=>c.id==="red").cost===3);
  await api("PUT","/admin/api/balance",{overrides:{}});
  check("删除覆盖后恢复原值",C.PROFILES["苏苏"].cards.find(c=>c.id==="red").cost===2);
  check("数值保存到磁盘",fs.existsSync(path.join(process.env.DATA_DIR,"balance.json")));
  // 维护
  const pm=wait(s,"maintenance");await api("POST","/admin/api/maintenance",{action:"on",message:"维护测试"});const m=await pm;
  const cr=await new Promise(r=>s.emit("room:create",{},r));
  check("维护中禁止开房",m.on&&!cr.ok,cr.error);
  await api("POST","/admin/api/maintenance",{action:"off"});await sleep(1600);
  const cr2=await new Promise(r=>s.emit("room:create",{},r));check("关闭维护后可以开房",cr2.ok);
  // 平滑重启（没有进行中的对局 → 几秒内退出）
  const pr=new Promise(r=>s.on("maintenance",x=>{if(x.restarting)r(x);}));
  await api("POST","/admin/api/maintenance",{action:"drain",minutes:1});
  await pr;await sleep(1800);
  check("平滑重启：无对局时自动退出",exited===0);
  s.close();srv.io.close();srv.server.close();
  const pass=results.every(Boolean);console.log(pass?"LIVE TEST PASSED":"LIVE TEST FAILED");
  setTimeout(()=>realExit(pass?0:1),300);
})().catch(e=>{console.error(e);realExit(1);});
