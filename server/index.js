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

const PORT=+process.env.PORT||3000;
const HOST=process.env.HOST||"0.0.0.0";
const TURN_MS=+process.env.TURN_SECONDS*1000||75000;
const MULLIGAN_MS=30000;
const RECONNECT_MS=60000;
const ROOM_GRACE_MS=20000;
const COUNTDOWN_MS=3000;
const MAX_ROOMS=300;

/* ============================================================
   HTTP
   ============================================================ */
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",true);
const noCache={etag:true,lastModified:true,setHeaders:res=>res.setHeader("Cache-Control","no-cache")};
app.use(express.static(path.join(__dirname,"..","public"),noCache));
app.use("/shared",express.static(path.join(__dirname,"..","shared"),noCache));
app.get("/healthz",(req,res)=>res.json({ok:true,online:onlineCount(),rooms:rooms.size,uptime:process.uptime()|0}));

const server=http.createServer(app);
const io=new Server(server,{pingInterval:10000,pingTimeout:20000,maxHttpBufferSize:64*1024});

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

/* ============================================================
   数据
   ============================================================ */
const users=new Map();   // clientId -> user
const rooms=new Map();   // roomId -> room
let queue=[];            // 快速匹配队列（clientId）
const lobbyChat=[];

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
    id:r.id,code:r.code,name:r.name,locked:!!r.password,quick:r.quick,status:r.status,
    players:r.seats.filter(Boolean).map(id=>{const u=users.get(id);return u?{nick:u.nick,hero:u.hero}:null;}).filter(Boolean)
  }))};
}

/* ---------- 房间 ---------- */
function roomView(r,forId){
  return{id:r.id,code:r.code,name:r.name,locked:!!r.password,quick:r.quick,hostId:r.hostId,status:r.status,
    you:r.seats.indexOf(forId),countdown:r.countdownAt?Math.max(0,r.countdownAt-now()):0,
    seats:r.seats.map((id,i)=>{if(!id)return null;const u=users.get(id);if(!u)return null;
      return{id,nick:u.nick,hero:u.hero,ready:r.ready[i],connected:u.connected,host:id===r.hostId};})};
}
function roomChanged(r){
  r.seats.forEach(id=>{if(id){const u=users.get(id);send(u,"room",roomView(r,id));}});
  lobbyChanged();
}
function createRoom(host,name,password,quick){
  const r={id:crypto.randomUUID(),code:randomCode(),name:clean(name,16)||`${host.nick}的房间`,password:clean(password,16),
    hostId:host.id,seats:[null,null],ready:[false,false],status:"waiting",match:null,quick:!!quick,chat:[],createdAt:now(),countdownT:null,countdownAt:0};
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
  const ok=r.seats.every(Boolean)&&r.ready.every(Boolean)&&r.seats.every(id=>users.get(id)&&users.get(id).connected);
  if(!ok)return;
  r.status="countdown";r.countdownAt=now()+COUNTDOWN_MS;
  r.countdownT=setTimeout(()=>{r.countdownT=null;r.countdownAt=0;startMatch(r);},COUNTDOWN_MS);
  roomChanged(r);
}
function startMatch(r){
  if(!r.seats.every(Boolean)){r.status="waiting";roomChanged(r);return;}
  if(r.match)r.match.dispose();
  r.status="playing";r.ready=[false,false];
  r.match=new Match(r);
  roomChanged(r);
}

/* ---------- 快速匹配 ---------- */
function dequeue(u){const n=queue.length;queue=queue.filter(id=>id!==u.id);if(queue.length!==n){send(u,"match:status",{searching:false});lobbyChanged();}}
function enqueue(u){
  if(u.roomId)leaveRoom(u,true);
  if(queue.includes(u.id))return;
  queue=queue.filter(id=>{const x=users.get(id);return x&&x.connected&&!x.roomId;});
  const otherId=queue.shift();
  if(otherId){
    const other=users.get(otherId);
    send(other,"match:status",{searching:false});
    const r=createRoom(other,"快速匹配",null,true);
    joinRoom(other,r);joinRoom(u,r);
    r.ready=[true,true];
    roomSys(r,"匹配成功！对局即将开始");
    checkStart(r);
  }else{
    queue.push(u.id);u.queuedAt=now();
    send(u,"match:status",{searching:true,since:u.queuedAt});
  }
  lobbyChanged();
}

/* ============================================================
   对局（一个房间一局）
   ============================================================ */
class Match{
  constructor(room){
    this.room=room;this.seats=room.seats.slice();this.over=false;this.timer=null;this.deadline=0;this.timerKey="";
    const ps=this.seats.map(id=>{const u=users.get(id);return{name:u.nick,hero:u.hero,deck:u.deck};});
    this.game=new E.Game({players:ps});
    this.startedAt=now();
    this.push(true);
  }
  seatOf(uid){return this.seats.indexOf(uid);}
  act(seat,a){
    if(this.over)return{ok:false,error:"对局已结束"};
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
    if(g.phase==="mulligan"){[0,1].forEach(i=>{if(!g.players[i].mulliganDone)g.mulligan(i,[]);});}
    else if(g.phase==="play"){
      const cur=g.current;
      if(g.pending)g.resolvePending(g.pending.pi,g.pending.auto);
      if(g.phase==="play"&&g.current===cur){g.note("回合超时，自动结束",g.players[cur]);g.endTurn(cur);}
    }
    this.timerKey="";this.push(false);
  }
  timerInfo(){return this.deadline?{msLeft:Math.max(0,this.deadline-now()),total:this.timerTotal}:null;}
  push(full){
    const g=this.game;
    this.schedule();
    const events=g.takeEvents();
    this.seats.forEach((id,i)=>{
      const u=users.get(id);
      send(u,"game",{view:g.viewFor(i),events:full?[]:g.eventsFor(events,i),timer:this.timerInfo(),full:!!full,
        foeOnline:!!(users.get(this.seats[1-i])||{}).connected});
    });
    if(g.phase==="over"&&!this.over)this.finish();
  }
  sendTo(id){
    const i=this.seatOf(id);if(i<0)return;
    send(users.get(id),"game",{view:this.game.viewFor(i),events:[],timer:this.timerInfo(),full:true,foeOnline:!!(users.get(this.seats[1-i])||{}).connected});
  }
  forfeit(seat,reason){if(this.over)return;this.game.forfeit(seat,reason);this.push(false);}
  finish(){
    this.over=true;this.clearTimer();
    const r=this.room;
    r.status="waiting";r.ready=[false,false];
    const g=this.game;
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
    const cid=/^[A-Za-z0-9_-]{8,64}$/.test(d.clientId||"")?d.clientId:crypto.randomUUID();
    let u=users.get(cid);
    if(u&&u.socket&&u.socket!==socket&&u.connected){u.socket.emit("kicked",{reason:"你在另一个窗口打开了游戏"});u.socket.disconnect(true);}
    if(!u){u={id:cid,nick:"",hero:"苏苏",deck:null,roomId:null};users.set(cid,u);}
    u.nick=clean(d.nick,12)||u.nick||("玩家"+crypto.randomInt(1000,9999));
    if(d.hero&&C.PROFILES[d.hero]){u.hero=d.hero;u.deck=C.deckError(d.hero,d.deck)?null:d.deck;}
    u.socket=socket;u.connected=true;socket.data.uid=cid;
    if(u.dcTimer){clearTimeout(u.dcTimer);u.dcTimer=null;}
    const r=u.roomId&&rooms.get(u.roomId);
    reply(cb,{ok:true,id:cid,nick:u.nick});
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
    lobbyChanged();
  });

  socket.on("profile",(d)=>{
    const u=userOf(socket);if(!u||!d)return;
    if(d.nick!==undefined)u.nick=clean(d.nick,12)||u.nick;
    if(d.hero&&C.PROFILES[d.hero]&&!(u.roomId&&rooms.get(u.roomId)&&rooms.get(u.roomId).status==="playing")){
      u.hero=d.hero;u.deck=C.deckError(d.hero,d.deck)?null:d.deck;
      const r=u.roomId&&rooms.get(u.roomId);
      if(r){const i=r.seats.indexOf(u.id);if(i>=0&&!r.quick)r.ready[i]=false;cancelCountdown(r);}
    }
    const r=u.roomId&&rooms.get(u.roomId);if(r)roomChanged(r);else lobbyChanged();
  });

  socket.on("lobby:chat",text=>{
    const u=userOf(socket);if(!u)return;
    const t=clean(text,120);if(!t||limited(u,"_lc",800))return;
    const m={nick:u.nick,text:t,ts:now()};lobbyChat.push(m);if(lobbyChat.length>40)lobbyChat.shift();
    io.to("lobby").emit("lobby:chat",m);
  });

  socket.on("room:create",(d,cb)=>{
    const u=userOf(socket);if(!u)return reply(cb,{ok:false,error:"未登录"});
    if(limited(u,"_rc",1500))return reply(cb,{ok:false,error:"操作太快了"});
    if(rooms.size>=MAX_ROOMS)return reply(cb,{ok:false,error:"房间数量已达上限，请稍后再试"});
    d=d||{};dequeue(u);
    const r=createRoom(u,d.name,d.password,false);
    joinRoom(u,r);reply(cb,{ok:true});
  });

  socket.on("room:join",(d,cb)=>{
    const u=userOf(socket);if(!u)return reply(cb,{ok:false,error:"未登录"});
    d=d||{};
    const r=d.id?rooms.get(String(d.id)):[...rooms.values()].find(x=>x.code===clean(d.code,10));
    if(!r)return reply(cb,{ok:false,error:"房间不存在或已关闭"});
    if(r.seats.includes(u.id))return reply(cb,{ok:true});
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

  socket.on("room:chat",text=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);if(!r)return;
    const t=clean(text,120);if(!t||limited(u,"_rch",700))return;
    const m={nick:u.nick,text:t,ts:now()};r.chat.push(m);if(r.chat.length>40)r.chat.shift();
    io.to("room:"+r.id).emit("room:chat",m);
  });

  socket.on("match:quick",()=>{const u=userOf(socket);if(u)enqueue(u);});
  socket.on("match:cancel",()=>{const u=userOf(socket);if(u)dequeue(u);});

  socket.on("game:action",(a,cb)=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);
    if(!r||!r.match)return reply(cb,{ok:false,error:"当前不在对局中"});
    const seat=r.match.seatOf(u.id);if(seat<0)return reply(cb,{ok:false,error:"你不在这局对战中"});
    let res;
    try{res=r.match.act(seat,a);}catch(e){console.error("[game] action error",e);res={ok:false,error:"服务器处理出错"};}
    reply(cb,res);
  });

  socket.on("game:sync",()=>{const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);if(r&&r.match)r.match.sendTo(u.id);});

  socket.on("game:emote",id=>{
    const u=userOf(socket);const r=u&&u.roomId&&rooms.get(u.roomId);if(!r||!r.match)return;
    if(!isInt(id)||id>20||limited(u,"_em",1500))return;
    r.seats.forEach(sid=>{if(sid)send(users.get(sid),"game:emote",{who:sid===u.id?"me":"foe",id});});
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

process.on("SIGTERM",()=>{io.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();});
module.exports={server,io};
