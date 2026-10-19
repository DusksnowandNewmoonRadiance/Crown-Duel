/* 四人比赛：自动分房、报名费、淘汰赛、冠军奖励和取消退费 */
"use strict";
const assert=require("assert");
const fs=require("fs"),os=require("os"),path=require("path");
const {execFileSync}=require("child_process");
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"crown-tournament-"));
process.env.DATA_DIR=dataDir;process.env.PORT=String(39000+Math.floor(Math.random()*1000));process.env.HOST="127.0.0.1";
const {io:client}=require("socket.io-client");
const Store=require("../server/store.js");
const C=require("../shared/cards.js");
const srv=require("../server/index.js");
const url="http://127.0.0.1:"+process.env.PORT;
const sockets=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function emit(s,event,data){return new Promise(resolve=>s.emit(event,data,resolve));}
function waitFor(s,event,pred=()=>true,ms=12000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{s.off(event,on);reject(new Error("等待 "+event+" 超时"));},ms);
    function on(data){if(!pred(data))return;clearTimeout(timer);s.off(event,on);resolve(data);}
    s.on(event,on);
  });
}
async function player(i){
  const a=Store.register("tourtest"+i,"password123","选手"+i,"");
  const startingGold=a.me.gold;
  Store.addGold(a.me.uid,200);
  const s=client(url,{transports:["websocket"]});sockets.push(s);
  await waitFor(s,"connect");
  const h=Object.keys(C.PROFILES)[0];
  const hello=await emit(s,"hello",{token:a.token,nick:"选手"+i,hero:h,deck:C.defaultDeck(h)});
  assert(hello.ok,JSON.stringify(hello));
  return{s,uid:a.me.uid,token:a.token,id:hello.id,startingGold};
}
async function run(){
  await new Promise(resolve=>srv.server.listening?resolve():srv.server.once("listening",resolve));
  const p=await Promise.all([0,1,2,3,4].map(player));
  assert.strictEqual((await emit(p[0].s,"tournament:join",{})).ok,true);
  assert.strictEqual(Store.byToken(p[0].token).gold,p[0].startingGold+50);
  for(let i=1;i<4;i++)assert.strictEqual((await emit(p[i].s,"tournament:join",{})).ok,true);
  const fifth=await emit(p[4].s,"tournament:join",{});
  assert(fifth.ok);assert.notStrictEqual(fifth.state.id,(await emit(p[0].s,"tournament:join",{})).state.id);
  assert.strictEqual(Store.byToken(p[0].token).gold,p[0].startingGold+50,"重复报名不能重复扣费");
  assert.strictEqual((await emit(p[4].s,"room:create",{name:"绕过比赛"})).ok,false);
  assert.strictEqual((await emit(p[4].s,"room:join",{id:fifth.state.id})).ok,false);
  assert.strictEqual((await emit(p[4].s,"tournament:leave",{})).ok,true);
  assert.strictEqual(Store.byToken(p[4].token).gold,p[4].startingGold+200);
  Store.spendGold(p[4].uid,100);
  assert.strictEqual((await emit(p[4].s,"tournament:join",{})).ok,false,"金币不足不能报名");
  await Promise.all(p.slice(0,4).map(x=>waitFor(x.s,"game",d=>d.view&&d.view.phase==="mulligan")));
  assert((await emit(p[0].s,"game:action",{type:"concede"})).ok);
  assert((await emit(p[2].s,"game:action",{type:"concede"})).ok);
  await Promise.all([p[1],p[3]].map(x=>waitFor(x.s,"game",d=>d.view&&d.view.phase==="mulligan",12000)));
  assert((await emit(p[1].s,"game:action",{type:"concede"})).ok);
  await waitFor(p[3].s,"tournament:state",d=>d&&d.stage==="done");
  assert.strictEqual(Store.byToken(p[3].token).gold,p[3].startingGold+950);
  for(let i=0;i<3;i++)assert.strictEqual(Store.byToken(p[i].token).gold,p[i].startingGold+50);
  const cross=Store.register("crosscase","password123","跨场测试","");
  Store.addGold(cross.me.uid,400);
  assert(Store.enterTournament(cross.me.uid,150,"old").ok);
  Store.closeTournament(cross.me.uid,false,"old");
  assert(Store.enterTournament(cross.me.uid,150,"new").ok);
  const before=Store.byToken(cross.token).gold;
  Store.settleTournament([cross.me.uid],null,0,false,"old");
  assert.strictEqual(Store.byToken(cross.token).tournamentId,"new","旧比赛不能清理新比赛的报名");
  assert.strictEqual(Store.closeTournament(cross.me.uid,true,"new"),before+150);
  const recovery=Store.register("recovery","password123","恢复测试","");
  Store.addGold(recovery.me.uid,200);
  assert(Store.enterTournament(recovery.me.uid,150,"restart-case").ok);
  const probe=`const S=require(${JSON.stringify(require.resolve("../server/store.js"))});process.stdout.write(String(S.byToken(${JSON.stringify(recovery.token)}).gold))`;
  const recovered=()=>Number(execFileSync(process.execPath,["-e",probe],{env:process.env,encoding:"utf8"}));
  assert.strictEqual(recovered(),recovery.me.gold+200,"重启后退还未完成比赛的报名费");
  assert.strictEqual(recovered(),recovery.me.gold+200,"重复启动不能重复退费");
  console.log("TOURNAMENT TEST PASSED");
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  sockets.forEach(s=>s.close());srv.io.close();if(srv.server.listening)await new Promise(r=>srv.server.close(r));
  if(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(dataDir,{recursive:true,force:true});
  process.exit(process.exitCode||0);
});
