/* 皇冠对决 · 联机服务器
   - Express 提供静态页面
   - Socket.IO 负责大厅、房间、快速匹配与对局
   - 对局完全由服务器裁决（shared/engine.js），客户端只发送操作 */
"use strict";
const path=require("path");
const http=require("http");
const crypto=require("crypto");
const express=require("express");
const {Server}=require("socket.io");
const C=require("../shared/cards.js");
const E=require("../shared/engine.js");
const Store=require("./store.js");
const adminRouter=require("./admin.js");
const Diy=require("../shared/diy.js");
const DiyServer=require("./diy.js");
const VERSION=require("../package.json").version;

const PORT=+process.env.PORT||3000;
const HOST=process.env.HOST||"0.0.0.0";
const TURN_MS=+process.env.TURN_SECONDS*1000||75000;
const MULLIGAN_MS=30000;
const RECONNECT_MS=90000;      // 断线后保留座位的时间（手机网络切换、锁屏都需要时间）
const AFK_LIMIT=3;             // 连续超时自动结束回合这么多次，判负
const ROOM_GRACE_MS=20000;
const COUNTDOWN_MS=3000;
const MAX_ROOMS=300;
const DRAIN_CHECK_MS=3000;

/* 本次部署的版本号：程序版本 + 前端/共享代码内容摘要。客户端发现版本变化就提示刷新 */
function computeBuild(){
  const fs=require("fs"),h=crypto.createHash("sha1");
  const walk=d=>fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1).forEach(e=>{
    const p=path.join(d,e.name);if(e.isDirectory())walk(p);else h.update(e.name).update(fs.readFileSync(p));});
  ["public","shared"].forEach(d=>walk(path.join(__dirname,"..",d)));
  let ver=VERSION;try{ver=JSON.parse(fs.readFileSync(path.join(__dirname,"..","package.json"),"utf8")).version;}catch(e){}
  return ver+"-"+h.digest("hex").slice(0,8);
}
let BUILD=computeBuild();
/* 部署新前端后无需重启：定时检查文件变化，并通知所有在线玩家 */
setInterval(()=>{let b;try{b=computeBuild();}catch(e){return;}if(b!==BUILD){BUILD=b;console.log("[皇冠对决] 检测到新版本 "+b);io.emit("build",{build:b});}},15000).unref();
{const b=Store.balance();if(b.overrides&&!C.checkOverrides(b.overrides).length)C.applyOverrides(b.overrides,b.rev);}

/* ============================================================
   HTTP
   ============================================================ */
const app=express();
app.disable("x-powered-by");
app.set("trust proxy","loopback");
const noCache={etag:true,lastModified:true,setHeaders:res=>res.setHeader("Cache-Control","no-cache")};
app.use(express.json({limit:"256kb"}));
app.use(express.static(path.join(__dirname,"..","public"),noCache));
app.use("/shared",express.static(path.join(__dirname,"..","shared"),noCache));
app.get("/healthz",(req,res)=>res.json({ok:true,build:BUILD,online:onlineCount(),rooms:rooms.size,uptime:process.uptime()|0}));
app.get("/api/announcements",(req,res)=>{res.setHeader("Cache-Control","no-cache");res.json(Store.announcements().slice(0,30));});
app.get("/api/content",(req,res)=>{res.setHeader("Cache-Control","no-cache");const b=Store.balance();res.json({build:BUILD,version:VERSION,rev:b.rev,overrides:b.overrides||{},maintenance:maintView()});});
app.get("/api/stats",(req,res)=>{res.setHeader("Cache-Control","no-cache");res.json(Store.stats());});

/* ============================================================
   账号 / 金币 / 商店 / 仓库 / 剧情模式 API
   ============================================================ */
const SHOP=[
  {id:"villageHorn",name:"渔村号角",desc:"剧情卡：3费法术，召唤 2 个 2/1 冲锋起义者（剧情专属，加入剧情牌库）",price:600,kind:"card",card:"villageHorn"},
  {id:"militiaCaptain",name:"民兵队长",desc:"剧情卡：4费 3/3 嘲讽，部署：你的单位 +1 攻击力（剧情专属，加入剧情牌库）",price:700,kind:"card",card:"militiaCaptain"},
  {id:"campaignPack",name:"剧情卡包",desc:"随机获得 1 张剧情专属卡（加入剧情牌库）",price:500,kind:"pack"},
  {id:"upgradeToken",name:"升级券",desc:"将剧情牌库中的一张卡升级一阶（+1/+1→冲锋→嘲讽→部署抽牌）",price:350,kind:"token"}
];
function tok(req){return(req.body&&req.body.token)||req.query.token;}
function needUser(req,res){
  const u=Store.byToken(tok(req));
  if(!u){res.json({ok:false,msg:"未登录或登录已过期"});return null;}
  return u;
}
/* 普通模式获胜：+金币 并 解锁该角色剧情 */
app.post("/api/reward/match",(req,res)=>{
  const u=needUser(req,res);if(!u)return;
  const won=!!req.body.won,hero=String(req.body.hero||"");
  if(won)Store.addGold(u.uid,20);
  if(won&&hero&&C.PROFILES[hero])Store.unlockCampaign(u.uid,hero);
  res.json({ok:true,gold:u.gold,campaign:u.campaign});
});
app.post("/api/auth/register",(req,res)=>{
  try{const r=Store.register(req.body.user,req.body.pass,req.body.nick,req.body.email);res.json({ok:true,...r});}
  catch(e){res.json({ok:false,msg:e.message});}
});
app.post("/api/auth/login",(req,res)=>{
  try{const r=Store.login(req.body.user,req.body.pass);res.json({ok:true,...r});}
  catch(e){res.json({ok:false,msg:e.message});}
});
app.post("/api/auth/logout",(req,res)=>{res.json({ok:Store.logout(tok(req))});});
app.post("/api/auth/bindEmail",(req,res)=>{
  try{
    const u=Store.byToken(tok(req));
    if(!u){res.json({ok:false,msg:"未登录"});return;}
    const r=Store.bindEmail(u.uid,req.body.email);res.json({ok:true,...r});
  }catch(e){res.json({ok:false,msg:e.message});}
});
app.post("/api/auth/forgot",(req,res)=>{
  try{const r=Store.forgot(req.body.email);res.json({ok:true,...r});}
  catch(e){res.json({ok:false,msg:e.message});}
});
app.post("/api/auth/reset",(req,res)=>{
  try{const r=Store.reset(req.body.email,req.body.code,req.body.pass);res.json({ok:true,...r});}
  catch(e){res.json({ok:false,msg:e.message});}
});
app.get("/api/me",(req,res)=>{
  const u=Store.byToken(tok(req));
  res.json(u?{ok:true,me:Store.pubUser(u)}:{ok:false,msg:"未登录"});
});
app.get("/api/shop",(req,res)=>res.json({ok:true,items:SHOP}));
app.post("/api/shop/buy",(req,res)=>{
  const u=needUser(req,res);if(!u)return;
  const item=SHOP.find(x=>x.id===req.body.id);
  if(!item){res.json({ok:false,msg:"没有这件商品"});return;}
  const r=Store.buy(u.uid,item);
  res.json({ok:r.ok,msg:r.msg,gold:u.gold,inv:u.inv});
});
/* 使用仓库物品：card → 加入指定剧情存档牌库；pack → 随机剧情卡加入；token → 备用（升级走 upgrade API） */
app.post("/api/inventory/use",(req,res)=>{
  const u=needUser(req,res);if(!u)return;
  const hero=String(req.body.hero||""),slot=+req.body.slot||0;
  const item=SHOP.find(x=>x.id===req.body.id);
  if(!item){res.json({ok:false,msg:"未知物品"});return;}
  const inv=u.inv.find(x=>x.id===req.body.id);
  if(!inv||inv.qty<=0){res.json({ok:false,msg:"仓库里没有这件物品"});return;}
  const camp=C.campaignOf(hero);
  if(!camp){res.json({ok:false,msg:"该角色暂无剧情"});return;}
  let card=null;
  if(item.kind==="card")card=item.card;
  else if(item.kind==="pack"){
    const pool=camp.chapters.ch1.rewardPool||[];
    if(!pool.length){res.json({ok:false,msg:"该关暂无可用剧情卡"});return;}
    card=pool[Math.floor(Math.random()*pool.length)];
  }else{res.json({ok:false,msg:"该物品暂不能在此使用"});return;}
  const c=Store.camp(u.uid,hero);const s=c.slots[slot]||(c.slots[slot]={deck:[],ch1:{best:0,first:false},upgrades:{}});
  const limit=C.rarityLimit(C.cardDef(hero,card));
  const now=(s.deck||[]).filter(x=>x===card).length;
  if(now>=limit){res.json({ok:false,msg:"剧情牌库中该卡已达携带上限"});return;}
  s.deck=s.deck||[];s.deck.push(card);
  Store.useInv(u.uid,req.body.id);
  res.json({ok:true,inv:u.inv,campaign:u.campaign});
});
/* 剧情结算：stars=1|2|3 达成的星级；奖励金币 + 首通随机剧情卡 */
app.post("/api/campaign/finish",(req,res)=>{
  const u=needUser(req,res);if(!u)return;
  const hero=String(req.body.hero||""),slot=+req.body.slot||0,stars=+req.body.stars||0;
  const camp=C.campaignOf(hero);
  if(!camp||!camp.chapters.ch1){res.json({ok:false,msg:"该角色暂无剧情"});return;}
  const rewards=camp.chapters.ch1.rewards||{1:100,2:150,3:250};
  const gold=rewards[stars]||0;
  const r=Store.finishCampaign(u.uid,hero,slot,req.body.turns||0,stars);
  Store.addGold(u.uid,gold);
  let rewardCard=null;
  if(r.first){
    const pool=camp.chapters.ch1.rewardPool||[];
    if(pool.length){
      const c=Store.camp(u.uid,hero),s=c.slots[slot];
      const avail=pool.filter(id=>(s.deck||[]).filter(x=>x===id).length<C.rarityLimit(C.cardDef(hero,id)));
      if(avail.length){rewardCard=avail[Math.floor(Math.random()*avail.length)];s.deck=s.deck||[];s.deck.push(rewardCard);}
    }
  }
  res.json({ok:true,gold:u.gold,stars:r.best,first:r.first,rewardCard,campaign:u.campaign});
});
/* 升级剧情卡：消耗金币，阶梯 +1/+1→冲锋→嘲讽→部署抽牌 */
app.post("/api/campaign/upgrade",(req,res)=>{
  const u=needUser(req,res);if(!u)return;
  const hero=String(req.body.hero||""),slot=+req.body.slot||0,cardId=String(req.body.cardId||"");
  const path=C.campaignUpgradePath(hero,cardId);
  if(!path||!path.length){res.json({ok:false,msg:"这张卡不能升级"});return;}
  const c=Store.camp(u.uid,hero),s=c.slots[slot];
  const lvl=((s.upgrades||{})[cardId])||0;
  if(lvl>=path.length-1){res.json({ok:false,msg:"已升满"});return;}
  const cost=path[lvl+1].cost||0;
  if(u.gold<cost){res.json({ok:false,msg:"金币不足"});return;}
  u.gold-=cost;
  s.upgrades=s.upgrades||{};s.upgrades[cardId]=lvl+1;
  res.json({ok:true,gold:u.gold,campaign:u.campaign,upgrades:s.upgrades});
});
app.use("/admin",adminRouter({
  status:()=>({build:BUILD,version:VERSION,uptime:process.uptime()|0,online:onlineCount(),queue:queue.length,rooms:rooms.size,
    matches:activeMatches(),maintenance:maintView(),dataDir:Store.DATA_DIR,reportsPending:Store.reports().filter(x=>x.status==="pending").length}),
  announcementsChanged:a=>io.emit("announce",{latest:a?{id:a.id,type:a.type,title:a.title,popup:a.popup}:null}),
  broadcast:text=>io.emit("broadcast",{text,ts:Date.now()}),
  setMaintenance:(on,msg)=>setMaintenance(on,msg),
  drain:(min,msg)=>startDrain(min,msg),
  contentChanged:()=>io.emit("content",{rev:Store.balance().rev}),
  reports:()=>Store.reports(),moderation:()=>Store.moderationLists(),
  sanctionPlayer:(id,type,reason)=>sanctionPlayer(id,type,reason),
  resolveReport:(id,action)=>resolveReport(id,action),
  removeSanction:(id,type)=>removeSanction(id,type),
  /* 后台 DIY 管理：列表与删除（删除会注销注册表 + 落盘 + 广播 diy:list） */
  diyList:()=>{const heroes=DiyServer.list();return{heroes,total:heroes.length};},
  diyRemove:name=>DiyServer.adminRemove(name)
}));

const server=http.createServer(app);
const io=new Server(server,{pingInterval:8000,pingTimeout:15000,maxHttpBufferSize:64*1024});

/* ============================================================
   DIY 角色：加载内置 + 已上传的，挂上 HTTP 接口
   ============================================================ */
DiyServer.init();
DiyServer.setChangeHandler(heroes=>io.emit("diy:list",{heroes}));
app.use(DiyServer.router);

/* ============================================================
   工具
   ============================================================ */
const now=()=>Date.now();
const clean=(s,max)=>String(s==null?"":s).replace(/[\u0000-\u001f\u007f<>]/g,"").trim().slice(0,max);
const isInt=v=>Number.isInteger(v)&&v>=0&&v<1e9;
function randomCode(){
  for(let i=0;i<50;i++){const c=String(100000+crypto.randomInt(900000));if(![...rooms.values()].some(r=>r.code===c))return c;}
  return String(crypto.randomInt(1e9));
}

/* ---------- 房间池：vanilla 只允许原版角色，diy 额外允许 DIY 角色 ---------- */
function poolOf(v){if(v===undefined||v===null||v==="")return "vanilla";return v==="diy"||v==="vanilla"?v:null;}
const roomPool=r=>(r&&r.pool)==="diy"?"diy":"vanilla";
const diyBlocked=(hero,room)=>Diy.isDiy(hero)&&roomPool(room)!=="diy";
const diyBlockMsg=hero=>`${hero} 是 DIY 角色，只能在允许 DIY 的房间里使用`;

/* ============================================================
   维护模式 / 平滑更新
   开启维护后不能开始新对局；drain 会等进行中的对局结束（或超时）后退出进程，
   由 systemd 自动用新代码重启
   ============================================================ */
const MAINT={on:false,message:"",drainUntil:0,timer:null};
function maintView(){return{on:MAINT.on,message:MAINT.message,drainUntil:MAINT.drainUntil||0};}
function activeMatches(){let n=0;for(const r of rooms.values())if(r.match&&!r.match.over)n++;return n;}
function setMaintenance(on,message){
  MAINT.on=!!on;MAINT.message=on?(message||"服务器维护中，暂时无法开始新对局"):"";
  if(!on){MAINT.drainUntil=0;clearInterval(MAINT.timer);MAINT.timer=null;}
  else{for(const r of rooms.values())cancelCountdown(r);queue.forEach(id=>send(users.get(id),"match:status",{searching:false}));queue=[];}
  io.emit("maintenance",maintView());lobbyChanged();
}
function startDrain(minutes,message){
  MAINT.drainUntil=now()+minutes*60000;
  setMaintenance(true,message||`服务器即将更新：进行中的对局可以正常打完，之后会自动重启（最多 ${minutes} 分钟）`);
  clearInterval(MAINT.timer);
  MAINT.timer=setInterval(()=>{
    if(activeMatches()>0&&now()<MAINT.drainUntil)return;
    clearInterval(MAINT.timer);
    console.log("[皇冠对决] 对局已全部结束，正在重启以完成更新");
    io.emit("maintenance",Object.assign(maintView(),{restarting:true}));
    setTimeout(()=>process.exit(0),1500);
  },DRAIN_CHECK_MS);
}

/* ============================================================
   数据
   ============================================================ */
const users=new Map();   // clientId -> user
const rooms=new Map();   // roomId -> room
let queue=[];            // 快速匹配队列（clientId）
const lobbyChat=[];
const chatArchive=[]; // recent direct conversations retained so a report can include evidence

function archiveChat(m,channel,roomId){
  if(!m||!m.id)return;
  chatArchive.push({id:m.id,nick:m.nick,text:m.text,ts:m.ts,channel,roomId:roomId||null});
  while(chatArchive.length>3000)chatArchive.shift();
}
function reportTranscript(a,b,roomId){
  const since=now()-7*24*60*60*1000;
  return chatArchive.filter(m=>m.ts>=since&&(m.id===a||m.id===b)&&(!roomId||m.roomId===roomId))
    .slice(-100).map(m=>({id:m.id,nick:m.nick,text:m.text,ts:m.ts,channel:m.channel}));
}
function publicModerationNotice(text){
  const m={sys:true,text,ts:now()};lobbyChat.push(m);if(lobbyChat.length>40)lobbyChat.shift();
  io.to("lobby").emit("lobby:chat",m);io.emit("broadcast",{text,ts:m.ts});
}
function removeSanction(id,type){
  const ok=Store.removeSanction(id,type);if(!ok)return{ok:false,error:"处罚记录不存在"};
  const u=users.get(id);if(u)send(u,"toast",{text:type==="ban"?"管理员已解除封号":"管理员已解除禁言"});
  return{ok:true};
}
function sanctionPlayer(id,type,reason){
  id=String(id||"");
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(id))return{ok:false,error:"玩家 ID 格式无效"};
  if(!["ban","mute"].includes(type))return{ok:false,error:"未知处罚类型"};
  const out=Store.setSanction(id,type,reason);if(!out.ok)return out;
  const u=users.get(id),name=Store.moderationState(id).forcedName||(u&&u.nick)||id;
  if(u){
    if(type==="ban"){
      dequeue(u);leaveRoom(u);send(u,"kicked",{reason:"你的账号已被管理员封禁，暂时不能进行联机"});
      if(u.socket)u.socket.disconnect(true);
    }else send(u,"toast",{text:"你已被管理员禁言，暂时不能发送聊天消息"});
  }
  publicModerationNotice(type==="ban"?`玩家「${name}」已被管理员封号，无法进行联机。`:`玩家「${name}」已被管理员禁言。`);
  return{ok:true,state:out.state};
}
function resolveReport(id,action){
  const out=Store.resolveReport(id,action);if(!out.ok)return out;
  const r=out.report,u=users.get(r.targetId),before=u&&u.nick;
  if(u){
    const state=Store.moderationState(r.targetId);
    if(state.forcedName){u.nick=state.forcedName;send(u,"profile:corrected",{nick:u.nick});}
    const room=u.roomId&&rooms.get(u.roomId);
    if(room)roomChanged(room);else lobbyChanged();
    if(action==="ban"){
      dequeue(u);leaveRoom(u);send(u,"kicked",{reason:"你的账号已被管理员封禁，暂时不能进行联机"});
      if(u.socket)u.socket.disconnect(true);
    }else if(action==="mute")send(u,"toast",{text:"你已被管理员禁言，暂时不能发送聊天消息"});
    else if(action==="rename")send(u,"toast",{text:"管理员已将违规昵称改为「名字违规」"});
  }
  if(action!=="dismiss"){
    const shownName=action==="rename"||r.reason==="name"?"名字违规":(u?u.nick:r.targetName);
    const message=action==="ban"?`玩家「${shownName}」已被封号，无法进行联机。`:
      action==="mute"?`玩家「${shownName}」已被禁言。`:`玩家「${shownName}」因名字违规，昵称已改为「名字违规」。`;
    publicModerationNotice(message);
  }
  return{ok:true,report:r,previousName:before};
}

function onlineCount(){let n=0;for(const u of users.values())if(u.connected)n++;return n;}
function userOf(socket){return socket.data.uid?users.get(socket.data.uid):null;}
function send(u,ev,data){if(u&&u.connected&&u.socket)u.socket.emit(ev,data);}

/* ---------- 大厅广播（节流） ---------- */
let lobbyDirty=false;
function lobbyChanged(){
  if(lobbyDirty)return;lobbyDirty=true;
  setTimeout(()=>{lobbyDirty=false;io.to("lobby").emit("lobby",lobbySnapshot());},250);
}
function lobbySnapshot(){
  const list=[...rooms.values()].sort((a,b)=>(a.status==="waiting"?0:1)-(b.status==="waiting"?0:1)||b.createdAt-a.createdAt).slice(0,100);
  return{online:onlineCount(),queue:queue.length,rooms:list.map(r=>({
    id:r.id,code:r.code,name:r.name,locked:!!r.password,quick:r.quick,status:r.status,pool:roomPool(r),
    players:r.seats.filter(Boolean).map(id=>{const u=users.get(id);return u?{id:u.id,nick:u.nick,hero:u.hero}:null;}).filter(Boolean)
  }))};
}

/* ---------- 房间 ---------- */
function roomView(r,forId){
  return{id:r.id,code:r.code,name:r.name,locked:!!r.password,quick:r.quick,hostId:r.hostId,status:r.status,pool:roomPool(r),
    you:r.seats.indexOf(forId),countdown:r.countdownAt?Math.max(0,r.countdownAt-now()):0,
    seats:r.seats.map((id,i)=>{if(!id)return null;const u=users.get(id);if(!u)return null;
      return{id,nick:u.nick,hero:u.hero,ready:r.ready[i],connected:u.connected,host:id===r.hostId};})};
}
function roomChanged(r){
  r.seats.forEach(id=>{if(id){const u=users.get(id);send(u,"room",roomView(r,id));}});
  lobbyChanged();
}
function createRoom(host,name,password,quick,pool){
  const r={id:crypto.randomUUID(),code:randomCode(),name:clean(name,16)||`${host.nick}的房间`,password:clean(password,16),
    hostId:host.id,seats:[null,null],ready:[false,false],status:"waiting",match:null,quick:!!quick,pool:roomPool({pool}),
    chat:[],createdAt:now(),countdownT:null,countdownAt:0};
  rooms.set(r.id,r);return r;
}
function joinRoom(u,r){
  if(u.roomId===r.id)return true;
  const i=r.seats.indexOf(null);if(i<0)return false;
  leaveRoom(u,true);dequeue(u);
  r.seats[i]=u.id;r.ready[i]=false;u.roomId=r.id;
  if(u.socket){u.socket.leave("lobby");u.socket.join("room:"+r.id);}
  send(u,"room:chatlog",r.chat);
  roomSys(r,`${u.nick} 进入了房间`);
  roomChanged(r);return true;
}
function leaveRoom(u,silent){
  const r=u.roomId&&rooms.get(u.roomId);
  u.roomId=null;
  if(u.socket){u.socket.join("lobby");if(r)u.socket.leave("room:"+r.id);}
  if(!r)return;
  const i=r.seats.indexOf(u.id);
  if(r.match&&!r.match.over&&i>=0)r.match.forfeit(i,"对手离开了对局");
  if(i>=0){r.seats[i]=null;r.ready[i]=false;}
  cancelCountdown(r);
  if(!r.seats.some(Boolean)){if(r.match)r.match.dispose();rooms.delete(r.id);lobbyChanged();return;}
  if(r.hostId===u.id)r.hostId=r.seats.find(Boolean);
  if(!silent)roomSys(r,`${u.nick} 离开了房间`);
  if(r.status!=="playing")r.status="waiting";
  roomChanged(r);
  if(!silent)send(u,"lobby",lobbySnapshot());
}
function roomSys(r,text){const m={sys:true,text,ts:now()};r.chat.push(m);if(r.chat.length>40)r.chat.shift();io.to("room:"+r.id).emit("room:chat",m);}
function cancelCountdown(r){if(r.countdownT){clearTimeout(r.countdownT);r.countdownT=null;r.countdownAt=0;if(r.status==="countdown")r.status="waiting";}}
function checkStart(r){
  if(r.status!=="waiting")return;
  if(MAINT.on){if(r.ready.every(Boolean))roomSys(r,"服务器维护中，暂时无法开始新对局");return;}
  /* 池分离：vanilla 房间里不能带 DIY 角色开局 */
  if(r.seats.every(Boolean)){
    const bad=r.seats.map(id=>users.get(id)).find(u=>u&&diyBlocked(u.hero,r));
    if(bad){if(r.ready.every(Boolean))roomSys(r,diyBlockMsg(bad.hero));return;}
  }
  const ok=r.seats.every(Boolean)&&r.ready.every(Boolean)&&r.seats.every(id=>users.get(id)&&users.get(id).connected);
  if(!ok)return;
  r.status="countdown";r.countdownAt=now()+COUNTDOWN_MS;
  r.countdownT=setTimeout(()=>{r.countdownT=null;r.countdownAt=0;startMatch(r);},COUNTDOWN_MS);
  roomChanged(r);
}
function startMatch(r){
  if(!r.seats.every(Boolean)){r.status="waiting";roomChanged(r);return;}
  /* 兜底：倒计时期间有人换成 DIY 角色，就退回等待状态而不是开局 */
  const bad=r.seats.map(id=>users.get(id)).find(u=>u&&diyBlocked(u.hero,r));
  if(bad){r.status="waiting";r.ready=[false,false];roomSys(r,diyBlockMsg(bad.hero));roomChanged(r);return;}
  if(r.match)r.match.dispose();
  r.status="playing";r.ready=[false,false];
  r.match=new Match(r);
  roomChanged(r);
}

/* ---------- 快速匹配 ---------- */
function dequeue(u){const n=queue.length;queue=queue.filter(id=>id!==u.id);if(queue.length!==n){send(u,"match:status",{searching:false});lobbyChanged();}}
function enqueue(u,pool){
  if(MAINT.on){send(u,"toast",{text:MAINT.message});return;}
  if(u.roomId)leaveRoom(u,true);
  if(queue.includes(u.id))return;
  const want=pool==="diy"?"diy":"vanilla";
  queue=queue.filter(id=>{const x=users.get(id);return x&&x.connected&&!x.roomId;});
  /* 只和同一个池的人匹配：vanilla 排队的看不到 DIY 房间 */
  let otherId=null;
  for(let i=0;i<queue.length;i++){
    const x=users.get(queue[i]);
    if(x&&(x.queuedPool||"vanilla")===want){otherId=queue[i];queue.splice(i,1);break;}
  }
  if(otherId){
    const other=users.get(otherId);
    send(other,"match:status",{searching:false});
    const r=createRoom(other,"快速匹配",null,true,want);
    joinRoom(other,r);joinRoom(u,r);
    r.ready=[true,true];
    roomSys(r,"匹配成功！对局即将开始");
    checkStart(r);
  }else{
    queue.push(u.id);u.queuedAt=now();u.queuedPool=want;
    send(u,"match:status",{searching:true,since:u.queuedAt,pool:want});
  }
  lobbyChanged();
}

/* ============================================================
   对局（一个房间一局）
   ============================================================ */
class Match{
  constructor(room){
    this.room=room;this.seats=room.seats.slice();this.over=false;this.timer=null;this.deadline=0;this.timerKey="";
    this.seq=0;this.afk=[0,0];
    const ps=this.seats.map(id=>{const u=users.get(id);return{name:u.nick,hero:u.hero,deck:u.deck};});
    this.game=new E.Game({players:ps});
    this.startedAt=now();
    this.push(true);
  }
  seatOf(uid){return this.seats.indexOf(uid);}
  /* 引擎出现异常时的兜底：丢弃悬空的选择，向双方强制同步，不让对局停在半个状态 */
  recover(err,where){
    console.error("[game] "+where+" error",err);
    try{
      const g=this.game;
      g.pending=null;
      this.timerKey="";
      this.push(true);
    }catch(e2){
      console.error("[game] recover failed",e2);
      try{this.game.forfeit(this.game.current,"服务器异常，对局终止");this.push(false);}catch(e3){this.dispose();}
    }
  }
  act(seat,a){
    if(this.over)return{ok:false,error:"对局已结束"};
    const g=this.game;let r;
    try{r=this._act(seat,a);}catch(e){this.recover(e,"action");return{ok:false,error:"服务器处理出错，已为你同步对局状态"};}
    if(r&&r.ok&&a&&a.type!=="concede")this.afk[seat]=0;
    return r;
  }
  _act(seat,a){
    const g=this.game;let r;
    switch(a&&a.type){
      case"mulligan":r=g.mulligan(seat,Array.isArray(a.uids)?a.uids.filter(isInt).slice(0,5):[]);break;
      case"play":{
        if(!isInt(a.uid))return{ok:false,error:"参数错误"};
        const targets=Array.isArray(a.targets)?a.targets.filter(isInt).slice(0,3):[];
        r=g.playCard(seat,a.uid,targets,typeof a.option==="string"?a.option:null);break;}
      case"attack":
        if(!isInt(a.uid)||(a.target!=null&&!isInt(a.target)))return{ok:false,error:"参数错误"};
        r=g.attack(seat,a.uid,a.target==null?null:a.target);break;
      case"end":r=g.endTurn(seat);break;
      case"pick":r=g.resolvePending(seat,a.index);break;
      case"concede":r=g.concede(seat);break;
      default:return{ok:false,error:"未知操作"};
    }
    if(r.ok)this.push(false);
    return r;
  }
  /* 计时：调度阶段 30 秒；每回合 75 秒，超时自动结束回合 */
  schedule(){
    const g=this.game;
    if(g.phase==="over"){this.clearTimer();return;}
    const key=g.phase==="mulligan"?"mull":"turn"+g.turn;
    if(key===this.timerKey)return;
    this.timerKey=key;this.clearTimer();
    const ms=g.phase==="mulligan"?MULLIGAN_MS:TURN_MS;
    this.deadline=now()+ms;this.timerTotal=ms;
    this.timer=setTimeout(()=>this.timeout(),ms+300);
  }
  clearTimer(){if(this.timer)clearTimeout(this.timer);this.timer=null;}
  timeout(){
    this.timer=null;const g=this.game;if(this.over)return;
    try{
      if(g.phase==="mulligan"){[0,1].forEach(i=>{if(!g.players[i].mulliganDone)g.mulligan(i,[]);});}
      else if(g.phase==="play"){
        const cur=g.current;
        if(g.pending)g.resolvePending(g.pending.pi,g.pending.auto);
        if(g.phase==="play"&&g.current===cur){
          this.afk[cur]++;
          if(this.afk[cur]>=AFK_LIMIT){
            this.timerKey="";
            this.forfeit(cur,"长时间未操作，判负");return;
          }
          g.note("回合超时，自动结束",g.players[cur]);
          g.endTurn(cur);
        }
      }
      this.timerKey="";this.push(false);
    }catch(e){this.recover(e,"timeout");}
  }
  timerInfo(){return this.deadline?{msLeft:Math.max(0,this.deadline-now()),total:this.timerTotal}:null;}
  push(full){
    const g=this.game;
    this.seq++;
    this.schedule();
    const events=g.takeEvents();
    this.seats.forEach((id,i)=>{
      const u=users.get(id);
      send(u,"game",{view:g.viewFor(i),events:full?[]:g.eventsFor(events,i),timer:this.timerInfo(),full:!!full,
        foeOnline:!!(users.get(this.seats[1-i])||{}).connected,foeId:this.seats[1-i],seq:this.seq});
    });
    if(g.phase==="over"&&!this.over)this.finish();
  }
  sendTo(id){
    const i=this.seatOf(id);if(i<0)return;
    send(users.get(id),"game",{view:this.game.viewFor(i),events:[],timer:this.timerInfo(),full:true,foeOnline:!!(users.get(this.seats[1-i])||{}).connected,foeId:this.seats[1-i],seq:this.seq});
  }
  forfeit(seat,reason){if(this.over)return;this.game.forfeit(seat,reason);this.push(false);}
  finish(){
    this.over=true;this.clearTimer();
    const r=this.room;
    r.status="waiting";r.ready=[false,false];
    const g=this.game;
    /* 联机胜率统计：按双方英雄记录胜负（平局各记一场） */
    try{Store.recordMatch(this.seats.map(id=>{const u=users.get(id);return u&&u.hero||"?";}),g.winner);}
    catch(e){console.error("[stats] 记录对局失败",e);}
    roomSys(r,g.winner==="draw"?"对局结束：平局":`对局结束：${g.players[g.winner].name} 获胜`);
    roomChanged(r);
  }
  dispose(){this.clearTimer();this.over=true;}
}

/* ============================================================
   Socket
   ============================================================ */
function limited(u,key,ms){const t=now();if(u[key]&&t-u[key]<ms)return true;u[key]=t;return false;}
const reply=(cb,v)=>{if(typeof cb==="function")cb(v);};

io.on("connection",socket=>{
  socket.on("hello",(d,cb)=>{
    d=d||{};
    const account=Store.byToken(String(d.token||""));
    const cid=account?`acct_${account.uid}`:(/^[A-Za-z0-9_-]{8,64}$/.test(d.clientId||"")?d.clientId:crypto.randomUUID());
    const mod=Store.moderationState(cid);
    if(mod.ban){reply(cb,{ok:false,banned:true,error:"你的账号已被管理员封禁，暂时不能进行联机"});socket.disconnect(true);return;}
    let u=users.get(cid);
    if(u&&u.socket&&u.socket!==socket&&u.connected){u.socket.emit("kicked",{reason:"你在另一个窗口打开了游戏"});u.socket.disconnect(true);}
    if(!u){u={id:cid,nick:"",hero:"苏苏",deck:null,roomId:null};users.set(cid,u);}
    u.nick=mod.forcedName||clean(d.nick,12)||u.nick||("玩家"+crypto.randomInt(1000,9999));
    const r=u.roomId&&rooms.get(u.roomId);   // 重连回房间时，选角要先按房间池校验
    if(d.hero&&C.PROFILES[d.hero]){
      if(r&&diyBlocked(d.hero,r))return reply(cb,{ok:false,error:diyBlockMsg(d.hero)});
      u.hero=d.hero;u.deck=C.deckError(d.hero,d.deck)?null:d.deck;
    }
    if(r&&diyBlocked(u.hero,r))return reply(cb,{ok:false,error:diyBlockMsg(u.hero)});
    u.socket=socket;u.connected=true;socket.data.uid=cid;
    if(u.dcTimer){clearTimeout(u.dcTimer);u.dcTimer=null;}
    reply(cb,{ok:true,id:cid,nick:u.nick,build:BUILD,version:VERSION,maintenance:maintView(),diyHeroes:DiyServer.list()});
    if(r){
      socket.join("room:"+r.id);
      send(u,"room",roomView(r,u.id));send(u,"room:chatlog",r.chat);
      if(r.match&&!r.match.over){
        r.match.sendTo(u.id);
        const other=r.seats.find(x=>x&&x!==u.id);send(users.get(other),"game:notice",{text:"对手已重新连接",ok:true});
        r.match.seats.forEach(id=>{if(id!==u.id)r.match.sendTo(id);});
      }
      roomChanged(r);
    }else{
      socket.join("lobby");
      send(u,"room",null);
    }
    send(u,"lobby",lobbySnapshot());
    send(u,"lobby:chatlog",lobbyChat);
    send(u,"diy:list",{heroes:DiyServer.list()});
    lobbyChanged();
  });

  socket.on("profile",(d)=>{
    const u=userOf(socket);if(!u||!d)return;
    const mod=Store.moderationState(u.id);
    if(d.nick!==undefined)u.nick=mod.forcedName||clean(d.nick,12)||u.nick;
    if(d.hero&&C.PROFILES[d.hero]&&!(u.roomId&&rooms.get(u.roomId)&&rooms.get(u.roomId).status==="playing")){
      const room=u.roomId&&rooms.get(u.roomId);
      if(diyBlocked(d.hero,room)){send(u,"toast",{text:diyBlockMsg(d.hero)});return;}
      u.hero=d.hero;u.deck=C.deckError(d.hero,d.deck)?null:d.deck;
      const r=room;
      if(r){const i=r.seats.indexOf(u.id);if(i>=0&&!r.quick)r.ready[i]=false;cancelCountdown(r);}
    }
    const r=u.roomId&&rooms.get(u.roomId);if(r)roomChanged(r);else lobbyChanged();
  });

  socket.on("lobby:chat",(text,cb)=>{
    const u=userOf(socket);if(!u)return;
    if(Store.moderationState(u.id).mute)return reply(cb,{ok:false,error:"你已被管理员禁言"});
    const t=clean(text,120);if(!t)return reply(cb,{ok:false,error:"消息不能为空"});if(limited(u,"_lc",800))return reply(cb,{ok:false,error:"发言太快了，稍等一下"});
    const m={id:u.id,nick:u.nick,text:t,ts:now()};lobbyChat.push(m);if(lobbyChat.length>40)lobbyChat.shift();archiveChat(m,"lobby",null);
    io.to("lobby").emit("lobby:chat",m);reply(cb,{ok:true});
  });

  socket.on("room:create",(d,cb)=>{
    const u=userOf(socket);if(!u)return reply(cb,{ok:false,error:"未登录"});
    if(limited(u,"_rc",1500))return reply(cb,{ok:false,error:"操作太快了"});
    if(rooms.size>=MAX_ROOMS)return reply(cb,{ok:false,error:"房间数量已达上限，请稍后再试"});
    if(MAINT.on)return reply(cb,{ok:false,error:MAINT.message});
    d=d||{};
    const pool=poolOf(d.pool);
    if(!pool)return reply(cb,{ok:false,error:"房间类型无效，只能是 vanilla 或 diy"});
    dequeue(u);
    const r=createRoom(u,d.name,d.password,false,pool);
    joinRoom(u,r);reply(cb,{ok:true});
  });

  socket.on("room:join",(d,cb)=>{
    const u=userOf(socket);if(!u)return reply(cb,{ok:false,error:"未登录"});
    d=d||{};
    const r=d.id?rooms.get(String(d.id)):[...rooms.values()].find(x=>x.code===clean(d.code,10));
    if(!r)return reply(cb,{ok:false,error:"房间不存在或已关闭"});
    if(r.seats.includes(u.id))return reply(cb,{ok:true});
    /* 池分离：带着 DIY 角色进不了普通房间 */
    if(diyBlocked(u.hero,r))return reply(cb,{ok:false,error:diyBlockMsg(u.hero)});
    if(r.password&&clean(d.password,16)!==r.password)return reply(cb,{ok:false,error:r.password&&d.password?"密码错误":"需要密码",needPassword:true});
    if(r.status==="playing")return reply(cb,{ok:false,error:"房间正在对局中"});
    if(!joinRoom(u,r))return reply(cb,{ok:false,error:"房间已满"});
    reply(cb,{ok:true});
  });

  socket.on("room:leave",()=>{const u=userOf(socket);if(u){leaveRoom(u);send(u,"room",null);}});

  socket.on("room:ready",ready=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);if(!r)return;
    if(r.status==="playing")return;
    const i=r.seats.indexOf(u.id);if(i<0)return;
    r.ready[i]=!!ready;
    if(!ready)cancelCountdown(r);
    roomChanged(r);checkStart(r);
  });

  socket.on("room:chat",(text,cb)=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);if(!r)return;
    if(Store.moderationState(u.id).mute)return reply(cb,{ok:false,error:"你已被管理员禁言"});
    const t=clean(text,120);if(!t)return reply(cb,{ok:false,error:"消息不能为空"});if(limited(u,"_rch",700))return reply(cb,{ok:false,error:"发言太快了，稍等一下"});
    const m={id:u.id,nick:u.nick,text:t,ts:now()};r.chat.push(m);if(r.chat.length>40)r.chat.shift();archiveChat(m,"room",r.id);
    io.to("room:"+r.id).emit("room:chat",m);reply(cb,{ok:true});
  });

  socket.on("match:quick",d=>{
    const u=userOf(socket);if(!u)return;
    const want=d&&typeof d==="object"&&d.pool!==undefined?poolOf(d.pool):"vanilla";
    if(!want)return send(u,"toast",{text:"匹配类型无效，只能是 vanilla 或 diy"});
    enqueue(u,want);
  });
  socket.on("match:cancel",()=>{const u=userOf(socket);if(u)dequeue(u);});

  socket.on("game:action",(a,cb)=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);
    if(!r||!r.match)return reply(cb,{ok:false,error:"当前不在对局中"});
    const seat=r.match.seatOf(u.id);if(seat<0)return reply(cb,{ok:false,error:"你不在这局对战中"});
    let res;
    try{res=r.match.act(seat,a);}catch(e){console.error("[game] action error",e);res={ok:false,error:"服务器处理出错"};}
    reply(cb,res);
  });

  socket.on("game:sync",()=>{const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);if(r&&r.match&&!r.match.over)r.match.sendTo(u.id);});
  /* 心跳：客户端对照对局序号，发现落后就主动请求完整同步 */
  socket.on("game:ping",(d,cb)=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);
    if(!r||!r.match)return reply(cb,{ok:true,inGame:false});
    reply(cb,{ok:true,inGame:!r.match.over,seq:r.match.seq,turn:r.match.game.turn,phase:r.match.game.phase});
  });

  /* 局内聊天：同时记入房间聊天记录，对局结束回到房间后还能看到 */
  socket.on("game:chat",(text,cb)=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);
    if(!r||!r.match||!r.seats.includes(u.id))return reply(cb,{ok:false,error:"当前不在对局中"});
    if(Store.moderationState(u.id).mute)return reply(cb,{ok:false,error:"你已被管理员禁言"});
    const t=clean(text,60);if(!t)return reply(cb,{ok:false,error:"消息不能为空"});
    if(limited(u,"_gc",1200))return reply(cb,{ok:false,error:"发言太快了，稍等一下"});
    const m={id:u.id,nick:u.nick,text:t,ts:now()};r.chat.push(m);if(r.chat.length>40)r.chat.shift();archiveChat(m,"game",r.id);
    io.to("room:"+r.id).emit("room:chat",m);
    r.seats.forEach(sid=>{if(sid)send(users.get(sid),"game:chat",{who:sid===u.id?"me":"foe",nick:u.nick,text:t,ts:m.ts});});
    reply(cb,{ok:true});
  });

  socket.on("moderation:report",(d,cb)=>{
    const u=userOf(socket);if(!u)return reply(cb,{ok:false,error:"未登录"});d=d||{};
    if(limited(u,"_report",30000))return reply(cb,{ok:false,error:"提交太快了，请稍后再试"});
    const targetId=String(d.targetId||"");
    if(!/^[A-Za-z0-9_-]{8,64}$/.test(targetId)||targetId===u.id)return reply(cb,{ok:false,error:"举报对象无效"});
    const labels={abuse:"聊天骂人",afk:"故意不结束回合",name:"名字违规",cheat:"外挂"};
    if(!Object.prototype.hasOwnProperty.call(labels,d.reason))return reply(cb,{ok:false,error:"举报理由无效"});
    const target=users.get(targetId),targetMod=Store.moderationState(targetId);
    const targetName=targetMod.forcedName||(target&&target.nick)||clean(d.targetName,24)||"未知玩家";
    const roomId=u.roomId&&target&&target.roomId===u.roomId?u.roomId:null;
    const report=Store.addReport({reporterId:u.id,reporterName:u.nick,targetId,targetName,source:clean(d.source,20)||"player",
      reason:d.reason,reasonLabel:labels[d.reason],details:clean(d.details,500),transcript:reportTranscript(u.id,targetId,roomId),roomId,targetOnline:!!(target&&target.connected)});
    io.to("admin").emit("moderation:report",{id:report.id});
    reply(cb,{ok:true,id:report.id});
  });

  socket.on("disconnect",()=>{
    const u=userOf(socket);if(!u||u.socket!==socket)return;
    u.connected=false;u.socket=null;
    dequeue(u);
    const r=u.roomId&&rooms.get(u.roomId);
    if(r){
      if(r.match&&!r.match.over){
        const other=r.seats.find(x=>x&&x!==u.id);
        send(users.get(other),"game:notice",{text:`对手断线了，等待重连（${RECONNECT_MS/1000} 秒）…`});
        u.dcTimer=setTimeout(()=>{u.dcTimer=null;if(r.match&&!r.match.over)r.match.forfeit(r.match.seatOf(u.id),"对手断线超时");leaveRoom(u,true);users.delete(u.id);},RECONNECT_MS);
      }else{
        const i=r.seats.indexOf(u.id);if(i>=0)r.ready[i]=false;cancelCountdown(r);
        u.dcTimer=setTimeout(()=>{u.dcTimer=null;leaveRoom(u);users.delete(u.id);},ROOM_GRACE_MS);
      }
      roomChanged(r);
    }else{
      u.dcTimer=setTimeout(()=>{u.dcTimer=null;if(!u.connected)users.delete(u.id);},ROOM_GRACE_MS);
    }
    lobbyChanged();
  });
});

server.listen(PORT,HOST,()=>console.log(`[皇冠对决] 服务器已启动：http://${HOST==="0.0.0.0"?"localhost":HOST}:${PORT}`));

/* 任何未捕获的异常都不应该让整个服务器（和所有对局）一起消失 */
process.on("uncaughtException",e=>console.error("[进程] 未捕获异常",e));
process.on("unhandledRejection",e=>console.error("[进程] 未处理的 Promise 拒绝",e));
process.on("SIGTERM",()=>{io.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();});
module.exports={server,io};
