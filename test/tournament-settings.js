/* 后台发金币及比赛金额：鉴权、持久化、每场金额锁定 */
"use strict";
const assert=require("assert");
const fs=require("fs"),os=require("os"),path=require("path");
const {execFileSync}=require("child_process");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"crown-pricing-"));
process.env.DATA_DIR=dir;process.env.PORT=String(41000+Math.floor(Math.random()*1000));process.env.HOST="127.0.0.1";
process.env.ADMIN_TOKEN="tournament-settings-test-token";
const {io:client}=require("socket.io-client");
const Store=require("../server/store.js");
const C=require("../shared/cards.js");
const srv=require("../server/index.js");
const url="http://127.0.0.1:"+process.env.PORT;
const sockets=[];
const emit=(s,event,data)=>new Promise(resolve=>s.emit(event,data,resolve));
async function api(method,endpoint,body,token=process.env.ADMIN_TOKEN){
  const r=await fetch(url+"/admin/api"+endpoint,{method,headers:{"content-type":"application/json","x-admin-token":token},body:body?JSON.stringify(body):undefined});
  return{status:r.status,data:await r.json()};
}
async function player(n){
  const a=Store.register("price"+n,"password123","价签"+n,"");
  const s=client(url,{transports:["websocket"]});sockets.push(s);
  await new Promise((resolve,reject)=>{s.once("connect",resolve);s.once("connect_error",reject);});
  const hero=Object.keys(C.PROFILES)[0];
  assert((await emit(s,"hello",{token:a.token,nick:a.me.nick,hero,deck:C.defaultDeck(hero)})).ok);
  return{...a,s};
}
async function run(){
  await new Promise(resolve=>srv.server.listening?resolve():srv.server.once("listening",resolve));
  const [a,b]=await Promise.all([player(1),player(2)]);
  assert.strictEqual((await api("GET","/tournament",null,"wrong-token")).status,401);
  assert.deepStrictEqual([Store.tournamentSettings().fee,Store.tournamentSettings().prize],[150,900]);
  assert.strictEqual((await api("PUT","/tournament",{fee:-1,prize:900})).status,400);
  assert.strictEqual((await api("PUT","/tournament",{fee:1.5,prize:900})).status,400);
  const grant=await api("POST","/users/"+a.me.uid+"/gold",{delta:500,reason:"测试"});
  assert.strictEqual(grant.status,200);assert.strictEqual(Store.byToken(a.token).gold,a.me.gold+500);
  assert.strictEqual((await api("POST","/users/"+b.me.uid+"/gold",{delta:500,reason:"测试"})).status,200);
  const first=await emit(a.s,"tournament:join",{});
  assert(first.ok);assert.strictEqual(first.state.fee,150);assert.strictEqual(first.state.prize,900);
  assert.strictEqual((await api("PUT","/tournament",{fee:25,prize:70})).status,200);
  const second=await emit(b.s,"tournament:join",{});
  assert(second.ok);assert.strictEqual(second.state.id,first.state.id);
  assert.strictEqual(second.state.fee,150);assert.strictEqual(second.state.prize,900);
  assert.strictEqual(Store.byToken(b.token).gold,b.me.gold+350);
  assert((await emit(a.s,"tournament:leave",{})).ok);
  assert((await emit(b.s,"tournament:leave",{})).ok);
  assert.strictEqual(Store.byToken(a.token).gold,a.me.gold+500);
  const next=await emit(a.s,"tournament:join",{});
  assert(next.ok);assert.strictEqual(next.state.fee,25);assert.strictEqual(next.state.prize,70);
  assert((await emit(a.s,"tournament:leave",{})).ok);
  assert.strictEqual((await api("PUT","/tournament",{fee:0,prize:80})).status,200);
  const free=await emit(a.s,"tournament:join",{});
  assert(free.ok);assert.strictEqual(free.state.fee,0);
  assert((await emit(a.s,"tournament:leave",{})).ok);
  const persisted=execFileSync(process.execPath,["-e",`const S=require(${JSON.stringify(require.resolve("../server/store.js"))});process.stdout.write(JSON.stringify(S.tournamentSettings()))`],{env:process.env,encoding:"utf8"});
  assert.deepStrictEqual(JSON.parse(persisted).fee,0);
  assert.strictEqual(JSON.parse(persisted).prize,80);
  console.log("TOURNAMENT SETTINGS TEST PASSED");
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  sockets.forEach(s=>s.close());srv.io.close();if(srv.server.listening)await new Promise(r=>srv.server.close(r));
  if(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(dir,{recursive:true,force:true});
  process.exit(process.exitCode||0);
});
