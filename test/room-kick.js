/* 私人房间踢人：权限、倒计时、重新加入及对局中限制 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {io:connect}=require("socket.io-client");
process.env.PORT="3922";
process.env.HOST="127.0.0.1";
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"cd-room-kick-"));
const srv=require("../server/index.js");
const url=`http://127.0.0.1:${process.env.PORT}`;
const clients=[];
const ack=(s,event,data)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`${event} 未响应`)),3000);
  s.emit(event,data,r=>{clearTimeout(timer);resolve(r);});
});
const until=(get,predicate,ms=5000)=>new Promise((resolve,reject)=>{
  const started=Date.now();
  const check=()=>{
    const value=get();
    if(predicate(value))return resolve(value);
    if(Date.now()-started>=ms)return reject(new Error("等待房间状态超时"));
    setTimeout(check,20);
  };
  check();
});
async function player(id){
  const s=connect(url,{transports:["websocket"],forceNew:true});
  clients.push(s);
  let room;
  s.on("room",value=>{room=value;});
  await new Promise((resolve,reject)=>{s.once("connect",resolve);s.once("connect_error",reject);});
  const hello=await ack(s,"hello",{clientId:`roomkick-${id}`,nick:id});
  assert.equal(hello.ok,true);
  return{s,get room(){return room;},id:hello.id};
}
(async()=>{
  const host=await player("host"),guest=await player("guest");
  assert.equal((await ack(host.s,"room:create",{name:"踢人测试"})).ok,true);
  const room=await until(()=>host.room,r=>r&&r.you===0);
  assert.equal((await ack(guest.s,"room:join",{id:room.id})).ok,true);
  await until(()=>host.room,r=>r&&r.seats.every(Boolean));

  assert.equal((await ack(guest.s,"room:kick",{targetId:host.id})).ok,false,"普通玩家不能踢房主");
  assert.equal((await ack(host.s,"room:kick",{targetId:host.id})).ok,false,"房主不能踢自己");
  assert.equal((await ack(host.s,"room:kick",{targetId:"absent"})).ok,false,"不能踢房间外玩家");

  host.s.emit("room:ready",true);guest.s.emit("room:ready",true);
  await until(()=>host.room,r=>r&&r.status==="countdown");
  const kicked=new Promise(resolve=>guest.s.once("room:kicked",resolve));
  assert.equal((await ack(host.s,"room:kick",{targetId:guest.id})).ok,true);
  assert.match((await kicked).reason,/房主/);
  await until(()=>guest.room,r=>r===null);
  await until(()=>host.room,r=>r&&r.status==="waiting"&&!r.seats[1]);
  assert.equal(host.room.kicked.length,1,"房主可看到踢出记录");
  assert.equal(host.room.kicked[0].id,guest.id);
  assert.equal(guest.room,null,"被踢玩家不再看到房间信息");
  assert.equal((await ack(guest.s,"room:join",{id:room.id})).ok,false,"被踢玩家不能重进同一房间");
  assert.equal((await ack(guest.s,"room:unkick",{targetId:guest.id})).ok,false,"非房主不能解除踢出");
  assert.equal((await ack(host.s,"room:unkick",{targetId:"absent"})).ok,false,"无记录不能解除");
  assert.equal((await ack(host.s,"room:unkick",{targetId:guest.id})).ok,true,"房主可解除踢出");
  await until(()=>host.room,r=>r&&r.kicked.length===0);
  assert.equal((await ack(guest.s,"room:join",{id:room.id})).ok,true,"解除后玩家可重进房间");
  guest.s.emit("room:leave");
  await until(()=>host.room,r=>r&&r.seats[1]===null);
  await new Promise(resolve=>setTimeout(resolve,3100));
  assert.equal(host.room.status,"waiting","踢人应取消已启动的倒计时");

  const other=await player("other");
  assert.equal((await ack(other.s,"room:join",{id:room.id})).ok,true);
  other.s.emit("room:ready",true);
  await until(()=>host.room,r=>r&&r.status==="countdown");
  await until(()=>host.room,r=>r&&r.status==="playing",5000);
  assert.equal((await ack(host.s,"room:kick",{targetId:other.id})).ok,false,"对局中不能踢人");

  const host2=await player("host2"),guest2=await player("guest2");
  assert.equal((await ack(host2.s,"room:create",{name:"断线踢人"})).ok,true);
  const room2=await until(()=>host2.room,r=>r&&r.you===0);
  assert.equal((await ack(guest2.s,"room:join",{id:room2.id})).ok,true);
  await until(()=>host2.room,r=>r&&r.seats[1]);
  guest2.s.close();
  await until(()=>host2.room,r=>r&&r.seats[1]&&!r.seats[1].connected);
  assert.equal((await ack(host2.s,"room:kick",{targetId:guest2.id})).ok,true,"房主可移出断线玩家");
  const guest2Again=await player("guest2");
  assert.equal((await ack(guest2Again.s,"room:join",{id:room2.id})).ok,false,"断线重连也不能绕过移出限制");
  assert.equal((await ack(host2.s,"room:unkick",{targetId:guest2.id})).ok,true);
  assert.equal((await ack(guest2Again.s,"room:join",{id:room2.id})).ok,true,"断线玩家解除后可重进");
  console.log("ROOM KICK TEST PASSED");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  clients.forEach(s=>s.close());
  srv.io.close();srv.server.close();
  setTimeout(()=>process.exit(process.exitCode||0),100);
});
