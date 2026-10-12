/* 苏苏专属机制测试：政体 / 引渡 / 整编 / 权限 / 情报 */
const C=require("../shared/cards.js"),E=require("../shared/engine.js");
let fail=0;const check=(n,ok,x)=>{if(!ok)fail++;console.log((ok?"✔ ":"✘ ")+n+(x!==undefined?"  "+x:""));};

function game(a,b){
  const g=new E.Game({players:[{name:"甲",hero:a||"苏苏"},{name:"乙",hero:b||"字母"}],first:0});
  g.mulligan(0,[]);g.mulligan(1,[]);return g;
}
const mk=(g,hero,id)=>g.clone(C.cardDef(hero,id)||C.TOKENS[id],hero);
function setup(){
  const g=game();const a=g.players[0],b=g.players[1];
  a.hand=[];b.hand=[];a.energy=a.maxEnergy=10;return{g,a,b};
}
const give=(g,p,id,hero)=>{const c=mk(g,hero||"苏苏",id);p.hand.push(c);return c;};
const play=(g,pi,c,t,o)=>g.playCard(pi,c.uid,t||[],o);

/* ---- 政体：俄罗斯 ---- */
{
  const {g,a,b}=setup();
  play(g,0,give(g,a,"decreeRus"));
  check("十月宣言：政体变为俄罗斯并召唤俄布",a.regime==="rus"&&a.board.filter(u=>u.id==="red").length===1&&a.regimeChanges===1);
  const guard=give(g,a,"blr");play(g,0,guard);
  const u=a.board.find(x=>x.id==="blr");
  check("俄罗斯政体：新部署的单位可以立即攻击",u&&u.charge&&u.atkLeft>0);
  g.armor(a,3);
  check("俄罗斯政体：无法获得护甲",a.armor===0);
  play(g,0,give(g,a,"decreeRus"));
  check("政体不变时不计更换次数",a.regimeChanges===1);
}
/* ---- 政体：乌克兰 ---- */
{
  const {g,a,b}=setup();
  b.board.push(mk(g,"字母","over"));
  play(g,0,give(g,a,"decreeUkr"),[b.board[0].uid]);
  check("乌克兰宣言：2 点伤害 +1 政体加成 = 3",a.regime==="ukr"&&b.board[0].health===b.board[0].maxHealth-3,b.board[0].health+"/"+b.board[0].maxHealth);
  play(g,0,give(g,a,"red"));
  const r=a.board.find(x=>x.id==="red");
  check("乌克兰政体：新单位生命 -1",r.health===1&&r.maxHealth===1);
  // 战斗伤害不吃加成
  b.board=[];const t=mk(g,"字母","over");b.board.push(t);
  r.atkLeft=1;r.health=5;r.maxHealth=5;
  g.attack(0,r.uid,t.uid);
  check("乌克兰政体：战斗伤害不加成",t.health===t.maxHealth-2,t.health);
  const r2=mk(g,"苏苏","redguard");r2.atkLeft=1;a.board.push(r2);
  const hp=b.hp;b.board=[];g.attack(0,r2.uid,null);
  check("乌克兰政体：攻击英雄不加成",b.hp===hp-2,b.hp);
  const hp2=b.hp;play(g,0,give(g,a,"marshal"));
  check("乌克兰政体：部署伤害 +1",b.hp===hp2-4,b.hp);
}
/* ---- 政体：白俄罗斯 ---- */
{
  const {g,a,b}=setup();
  play(g,0,give(g,a,"decreeBlr"));
  check("白俄罗斯宣言：获得 2 点护甲",a.regime==="blr"&&a.armor===2);
  play(g,0,give(g,a,"red"));
  const r=a.board.find(x=>x.id==="red");
  check("白俄罗斯政体：新单位失去冲锋",!r.charge&&r.atkLeft===0);
  play(g,0,give(g,a,"blr"));
  const t=a.board.find(x=>x.id==="blr");
  check("白俄罗斯政体：新嘲讽单位 +0/+1",t.health===6&&t.maxHealth===6);
  a.armor=0;g.endTurn(0);
  check("白俄罗斯政体：回合结束获得 2 点护甲",a.armor===2,a.armor);
  g.endTurn(1);
  check("护甲在自己的下个回合开始时清空",a.armor===0);
}
/* ---- 引渡 ---- */
{
  const {g,a}=setup();
  const f=mk(g,"苏苏","first");a.board.push(f);f.health=0;g.cleanup();
  check("引渡：苏一世死亡后苏二世进入手牌",a.hand.some(c=>c.id==="second"));
  const s2=a.hand.find(c=>c.id==="second");
  play(g,0,s2,[],"ukr");
  const u=a.board.find(x=>x.id==="second");
  check("苏二世：选择政体",a.regime==="ukr"&&!!u);
  u.health=0;g.cleanup();
  check("引渡：苏二世死亡后苏三世进入手牌",a.hand.some(c=>c.id==="third"));
  a.hand=[];for(let i=0;i<C.MAX_HAND;i++)a.hand.push(mk(g,"苏苏","red"));
  const f2=mk(g,"苏苏","first");a.board.push(f2);f2.health=0;g.cleanup();
  check("引渡：手牌已满时弃置而不是崩溃",a.hand.length===C.MAX_HAND&&!a.hand.some(c=>c.id==="second"));
}
/* ---- 苏二世的眩晕 ---- */
{
  const {g,a,b}=setup();
  const big=mk(g,"字母","over"),small=mk(g,"字母","shadow");b.board.push(small,big);
  const s2=give(g,a,"second");play(g,0,s2,[],"rus");
  check("苏二世：眩晕攻击力最高的敌方单位",big.stun>0&&!small.stun);
  check("苏二世：选择政体",a.regime==="rus");
}
/* ---- 苏三世 ---- */
{
  const {g,a}=setup();
  play(g,0,give(g,a,"decreeBlr"));
  play(g,0,give(g,a,"third"));
  check("苏三世：本回合联邦生效",a.fedTurn===true);
  play(g,0,give(g,a,"ukr"));
  const k=a.board.find(x=>x.id==="ukr");
  check("联邦回合：新单位同时获得冲锋（俄罗斯加成），白俄罗斯代价被覆盖",k&&k.charge);
  g.endTurn(0);
  check("联邦回合结束后失效",a.fedTurn===false);
}
/* ---- 整编 ---- */
{
  const {g,a}=setup();
  a.board.push(mk(g,"苏苏","red"));
  check("整编：不足 2 个俄布不能打出",!!E.playError(give(g,a,"consolidate"),a,g.players[1]));
  a.hand=[];
  a.board.push(mk(g,"苏苏","red"),mk(g,"苏苏","red"),mk(g,"苏苏","blr"));
  a.board[1].attack=4;a.board[1].health=5;
  const c=give(g,a,"consolidate");play(g,0,c);
  const gd=a.board.find(u=>u.id==="redGuard");
  check("整编：合并为近卫红军，属性等于总和",gd&&gd.attack===2+4+2&&gd.health===2+5+2,gd&&gd.attack+"/"+gd.health);
  check("整编：只合并俄布，其他单位保留",a.board.some(u=>u.id==="blr")&&a.board.filter(u=>u.id==="red").length===0);
  check("整编：近卫红军有冲锋，可以立即攻击",gd.charge&&gd.atkLeft>0);
}
/* ---- 情报 ---- */
{
  const {g,a,b}=setup();
  const e1=mk(g,"字母","guard"),e2=mk(g,"字母","order");b.hand=[e1,e2];
  play(g,0,give(g,a,"intel"));
  check("情报：进入选择，看到敌方手牌",g.pending&&g.pending.pi===0&&g.pending.cards.length===2);
  g.resolvePending(0,0);
  check("情报：选中的牌被封存",e1.sealed===true&&!e2.sealed);
  const v=g.viewFor(1);
  g.endTurn(0);
  b.energy=b.maxEnergy=10;
  check("被封存的牌在敌方回合无法打出",!!E.playError(e1,b,a));
  g.endTurn(1);
  check("封存在对手的回合结束后解除",e1.sealed===false);
  // 敌方没有手牌时召唤俄布
  const x=setup();x.b.hand=[];
  play(x.g,0,give(x.g,x.a,"intel"));
  check("情报：敌方没有手牌时改为召唤俄布",!x.g.pending&&x.a.board.some(u=>u.id==="red"));
}
/* ---- 俄布 / 终端 ---- */
{
  const red=C.PROFILES["苏苏"].cards.find(c=>c.id==="red");
  check("俄布：2 费 2/2、无冲锋、普通",red.cost===2&&red.atk===2&&red.hp===2&&!red.charge&&red.rarity==="common"&&red.limit===4);
  const art=C.PROFILES["苏苏"].cards.find(c=>c.id==="artillery");
  check("全亚洲炮兵总司令：卡面没有无关文字",!/隐藏终端/.test(art.text));
}
/* ---- awa：开局变成随机 awa 卡并洗入牌库 ---- */
{
  const def=C.PROFILES["苏苏"].cards.find(c=>c.id==="awaSwap");
  check("awa 卡：0 费 20/20 冲锋精英，部署 99 点伤害",def.cost===0&&def.atk===20&&def.hp===20&&def.charge&&def.rarity==="elite"&&def.effect==="hero99"&&def.limit===1);
  const base=C.defaultDeck("苏苏");
  check("这张卡的卡面没有任何描述，也不提 awa",def.text===""&&!def.flavor&&!/awa/i.test(def.name+def.text));
  // 不能通过其他方式获得：选角 / 变废为宝 的候选里都不含它
  { let leaked=false;
    for(let i=0;i<150&&!leaked;i++){
      const g2=new E.Game({players:[{name:"甲",hero:"下水"},{name:"乙",hero:"字母"}],first:0});
      g2.mulligan(0,[]);g2.mulligan(1,[]);
      const p=g2.players[0];p.energy=p.maxEnergy=10;
      const c2=g2.clone(C.AWA_CARDS["下水"],"下水");p.hand=[c2];
      g2.playCard(0,c2.uid,[]);
      if(g2.pending&&g2.pending.cards.some(x=>x.id==="awaSwap"))leaked=true;
    }
    check("选角不会给出这张卡",!leaked);
  }
  check("默认卡组不含 awa 卡，且仍为 40 张合法",!base.includes("awaSwap")&&base.length===40&&!C.deckError("苏苏",base));
  const deck=base.slice(0,39).concat(["awaSwap"]);
  check("携带 awa 卡的卡组合法",!C.deckError("苏苏",deck),C.deckError("苏苏",deck));
  const pool=new Set(Object.values(C.AWA_CARDS).map(c=>c.id));
  let hit=new Set(),okAll=true;
  for(let i=0;i<60;i++){
    const g=new E.Game({players:[{name:"甲",hero:"苏苏",deck},{name:"乙",hero:"字母"}],first:0});
    const all=g.players[0].deck.concat(g.players[0].hand);
    const awa=all.filter(c=>c.owner==="awa");
    if(awa.length!==1||all.some(c=>c.id==="awaSwap")||all.length!==40)okAll=false;
    awa.forEach(c=>hit.add(c.id));
    const v=g.viewFor(0),vf=g.viewFor(1);
    if(!(v.intro.length===1&&v.intro[0].who==="me"&&pool.has(awa[0].id)&&vf.intro[0].who==="foe"))okAll=false;
  }
  check("开局变成 1 张 awa 卡，原卡消失，牌库仍为 40 张，双方视图都有提示",okAll);
  check("awa 随机卡会抽到不同的卡牌",hit.size>=2,[...hit].join(","));
  // 没有携带时不会有 awa 卡（旧的随机替换已删除）
  let any=false;
  for(const h of ["苏苏","七星","下水"]){
    const g=new E.Game({players:[{name:"甲",hero:h},{name:"乙",hero:"字母"}],first:0});
    if(g.players[0].deck.concat(g.players[0].hand).some(c=>c.owner==="awa"))any=true;
    if(g.viewFor(0).intro.length)any=true;
  }
  check("没有携带 awa 卡时不再随机混入 awa 卡",!any);
  // 直接打出 awa 卡（例如被其他效果放进手牌）
  const g=new E.Game({players:[{name:"甲",hero:"苏苏"},{name:"乙",hero:"字母"}],first:0});
  g.mulligan(0,[]);g.mulligan(1,[]);
  const a=g.players[0],b=g.players[1];a.energy=a.maxEnergy=10;
  const c=g.clone(def,"苏苏");a.hand=[c];
  const r=g.playCard(0,c.uid,[]);
  check("awa 卡可以打出：99 点伤害",r.ok&&b.hp<=0&&g.phase==="over");
}
/* ---- 视图字段 ---- */
{
  const {g,a}=setup();
  play(g,0,give(g,a,"decreeUkr"));
  const v=g.viewFor(1);
  check("视图公开政体和更换次数",v.foe.regime==="ukr"&&v.foe.regimeChanges===1);
}
/* ---- 默认卡组 ---- */
{
  const d=C.defaultDeck("苏苏"),ids=new Set(d);
  check("苏苏默认卡组合法",!C.deckError("苏苏",d));
  const drawText=C.PROFILES["苏苏"].cards.filter(c=>/抽 \d+ 张牌/.test(c.text));
  check("苏苏没有抽牌卡",drawText.length===0,drawText.map(c=>c.name).join(","));
  check("苏苏牌表在 18~22 张之间",ids.size>=18&&ids.size<=22,ids.size);
}
console.log(fail?"SUSU TEST FAILED":"SUSU TEST PASSED");
process.exit(fail?1:0);
