/* 绘梨衣专属机制测试：皇冠产出 / 废料 / 转化 / 回收 */
const C=require("../shared/cards.js"),E=require("../shared/engine.js");
let fail=0;const check=(n,ok,x)=>{if(!ok)fail++;console.log((ok?"✔ ":"✘ ")+n+(x!==undefined?"  "+x:""));};
function setup(){
  const g=new E.Game({players:[{name:"甲",hero:"绘梨衣"},{name:"乙",hero:"字母"}],first:0});
  g.mulligan(0,[]);g.mulligan(1,[]);
  const a=g.players[0],b=g.players[1];a.hand=[];b.hand=[];a.energy=a.maxEnergy=10;
  return{g,a,b};
}
const mk=(g,id)=>g.clone(C.cardDef("绘梨衣",id),"绘梨衣");
const give=(g,p,id,n)=>{const r=[];for(let i=0;i<(n||1);i++){const c=mk(g,id);p.hand.push(c);r.push(c);}return r.length===1?r[0]:r;};
const play=(g,c,t)=>g.playCard(0,c.uid,t||[]);

check("牌表合法：默认卡组 40 张",!C.deckError("绘梨衣",C.defaultDeck("绘梨衣"))&&C.defaultDeck("绘梨衣").length===40);
check("没有抽牌卡",!C.PROFILES["绘梨衣"].cards.some(c=>/抽 \d+ 张牌/.test(c.text)));
{ // 皇冠产出
  const {g,a}=setup();
  g.endTurn(0);g.endTurn(1);
  check("皇冠产出：回合开始获得 1 张碎纸",a.hand.filter(c=>c.id==="scrap").length>=1&&a.hand.filter(c=>c.id==="scrap").every(c=>c.scrap));
  a.hand=[];for(let i=0;i<10;i++)a.hand.push(mk(g,"fortress"));
  g.endTurn(0);g.endTurn(1);
  check("手牌已满时不产出",a.hand.length===10);
  const {g:g2,b}=setup();g2.endTurn(0);
  check("只有绘梨衣有皇冠产出",!b.hand.some(c=>c.scrap));
}
{ // 转化
  const {g,a}=setup();
  const sc=give(g,a,"scrap",2);
  const c=give(g,a,"upcycle");
  check("转化 2：废料足够时可以打出",!E.playError(c,a,g.players[1]));
  const r=play(g,c);
  check("转化 2：进入选择，选项费用在 3~5",r.ok&&g.pending&&g.pending.cards.length>=1&&g.pending.cards.every(x=>x.cost>=2&&x.cost<=4),g.pending&&g.pending.cards.map(x=>x.name+x.cost).join(","));
  check("转化：2 张废料被弃掉",a.hand.filter(x=>x.scrap).length===0);
  g.resolvePending(0,0);
  check("转化：选中的牌进入手牌",a.hand.length===1&&!a.hand[0].scrap);
  const base=C.PROFILES["绘梨衣"].cards.find(x=>x.id===a.hand[0].id);
  check("转化出的牌费用 -1",a.hand[0].cost===base.cost-1);
}
{ const {g,a}=setup();
  give(g,a,"scrap");const c=give(g,a,"upcycle");
  check("废料不足 2 张不能打出",!!E.playError(c,a,g.players[1])); }
{ // 回收
  const {g,a}=setup();
  const u=mk(g,"scavenger");a.board.push(u);u.health=0;g.cleanup();
  check("回收：拾荒者死亡后放回碎纸",a.hand.some(c=>c.id==="scrap"));
  const k=g.summon(a,"scrapUnit",2);
  a.board.forEach(x=>{if(x.id==="scrapUnit")x.health=0;});a.hand=[];g.cleanup();
  check("回收：废铜烂铁死亡也放回碎纸",k===2&&a.hand.filter(c=>c.id==="scrap").length===2);
}
{ // 触发
  const {g,a}=setup();
  const rage=mk(g,"corner"),shred=mk(g,"shredder");a.board.push(rage,shred);a.hp=20;
  const s=give(g,a,"scrap");play(g,s);
  check("角落里的小怪兽：打出废料后攻击 +1",rage.attack===4&&rage.tempAtk===1);
  check("碎纸机：打出废料后恢复 1 点生命",a.hp===21);
  g.endTurn(0);
  check("攻击加成在回合结束时消失",rage.attack===3);
}
{ // 消耗废料的牌
  const {g,a,b}=setup();
  give(g,a,"scrap",3);
  const hp=b.hp;play(g,give(g,a,"recycle"));
  check("废物利用：每张废料 2 点伤害",b.hp===hp-6&&a.hand.filter(x=>x.scrap).length===0,b.hp);
  const s=setup();s.a.hp=15;give(s.g,s.a,"scrap",3);
  play(s.g,give(s.g,s.a,"sweep"));
  check("大扫除：每张废料恢复 3 点",s.a.hp===24,s.a.hp);
  const t=setup();give(t.g,t.a,"scrap",1);
  const big=t.g.clone(C.cardDef("字母","over"),"字母"),small=t.g.clone(C.cardDef("字母","shadow"),"字母");t.b.board.push(small,big);
  play(t.g,give(t.g,t.a,"expired"));
  check("过期卡包：眩晕攻击力最高的敌方单位",big.stun>0&&!small.stun&&t.a.hand.filter(x=>x.scrap).length===0);
  const u=setup();give(u.g,u.a,"scrap",2);
  const gd=mk(u.g,"guard");u.a.hand.push(gd);play(u.g,gd);
  const b2=u.a.board.find(x=>x.id==="guard");
  check("小怪兽卫队：每张废料 +1/+1",b2.attack===7&&b2.health===7,b2.attack+"/"+b2.health);
  const w=setup();give(w.g,w.a,"scrap",2);const tmp=mk(w.g,"temp");w.a.hand.push(tmp);play(w.g,tmp);
  const t2=w.a.board.find(x=>x.id==="temp");
  check("临时工：弃掉 1 张废料，+2/+2",t2.attack===4&&t2.health===4&&w.a.hand.filter(x=>x.scrap).length===1);
}
{ // 复制皇冠 / 中立宣言
  const {g,a}=setup();
  give(g,a,"scrap",5);
  play(g,give(g,a,"crown"));
  check("复制皇冠：5 张废料换成 2 张精英牌",a.hand.length===2&&a.hand.every(c=>c.rarity==="elite"&&c.id!=="crown"),a.hand.map(c=>c.name).join(","));
  const s=setup();
  const e=s.g.clone(C.cardDef("字母","over"),"字母");s.b.board.push(e);const m=mk(s.g,"fortress");s.a.board.push(m);
  play(s.g,give(s.g,s.a,"neutral"));
  check("中立宣言：双方单位眩晕，获得 4 点护甲",e.stun>0&&m.stun>0&&s.a.armor===4);
}
{ // 巨像
  const {g,a}=setup();
  give(g,a,"scrap",4);const c=give(g,a,"colossus");play(g,c);
  const u=a.board.find(x=>x.id==="colossus");
  check("废料巨像：4 张废料 → +4/+4",u.attack===8&&u.health===8);
}
console.log(fail?"ERIYI TEST FAILED":"ERIYI TEST PASSED");
process.exit(fail?1:0);
