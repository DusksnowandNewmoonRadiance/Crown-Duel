/* 苏苏专属机制测试：苏维埃社会主义共和国联盟(开局选政体) / 三政体 / 整编 / 情报 / 俄布海组件 */
const C=require("../shared/cards.js"),E=require("../shared/engine.js");
let fail=0;const check=(n,ok,x)=>{if(!ok)fail++;console.log((ok?"✔ ":"✘ ")+n+(x!==undefined?"  "+x:""));};

function game(a,b){
  const g=new E.Game({players:[{name:"甲",hero:a||"苏苏"},{name:"乙",hero:b||"字母"}],first:0});
  g.mulligan(0,[]);g.mulligan(1,[]);
  return g;
}
const mk=(g,hero,id)=>g.clone(C.cardDef(hero,id)||C.TOKENS[id],hero);
/* 苏苏开局：自动抽取并自动使用【苏维埃社会主义共和国联盟】，选择一个政体并成为 */
function pickRegime(g,idx){if(g.pending&&g.pending.pi===0)g.resolvePending(0,idx);}
function setup(idx){ // idx: 0=俄罗斯 1=乌克兰 2=白俄罗斯
  const g=game();const a=g.players[0],b=g.players[1];
  pickRegime(g,idx===undefined?0:idx);
  a.hand=[];b.hand=[];a.energy=a.maxEnergy=10;return{g,a,b};
}
const give=(g,p,id,hero)=>{const c=mk(g,hero||"苏苏",id);p.hand.push(c);return c;};
const play=(g,pi,c,t,o)=>g.playCard(pi,c.uid,t||[],o);

/* ---- 苏维埃社会主义共和国联盟：开局选政体 ---- */
{
  const g=game();
  check("开局自动抽取并自动使用：弹出政体选择",g.pending&&g.pending.pi===0&&g.pending.cards.length===3);
  check("三个可选政体：俄罗斯 / 乌克兰 / 白俄罗斯",g.pending.cards.map(c=>c.id).join(",")==="rus,ukr,blr");
  g.resolvePending(0,2);
  check("选择白俄罗斯并成为",g.players[0].regime==="blr"&&g.players[0].regimeChanges===1);
}
/* ---- 政体：俄罗斯 ---- */
{
  const {g,a,b}=setup(0);
  check("建立俄罗斯政体",a.regime==="rus"&&a.regimeChanges===1);
  const k=give(g,a,"kazakh");play(g,0,k);
  const u=a.board.find(x=>x.id==="kazakh");
  check("俄罗斯政体：新部署单位获得冲锋可立即攻击",u&&u.charge&&u.atkLeft>0);
  g.armor(a,3);
  check("俄罗斯政体：无法获得护甲",a.armor===0);
}
/* ---- 政体：乌克兰 ---- */
{
  const {g,a,b}=setup(1);
  check("建立乌克兰政体",a.regime==="ukr");
  play(g,0,give(g,a,"red"));
  const r=a.board.find(x=>x.id==="red");
  check("乌克兰政体：新单位生命 -1",r.health===1&&r.maxHealth===1);
  const t=mk(g,"字母","over");b.board.push(t);
  r.atkLeft=1;r.health=5;r.maxHealth=5;
  g.attack(0,r.uid,t.uid);
  check("乌克兰政体：战斗伤害不加成",t.health===t.maxHealth-2,t.health+"/"+t.maxHealth);
  const hp=b.hp;g.damageHero(b,1);
  check("乌克兰政体：非战斗伤害 +1",b.hp===hp-2,b.hp);
}
/* ---- 政体：白俄罗斯 ---- */
{
  const {g,a,b}=setup(2);
  check("建立白俄罗斯政体",a.regime==="blr");
  play(g,0,give(g,a,"red"));
  const r=a.board.find(x=>x.id==="red");
  check("白俄罗斯政体：新单位失去冲锋",!r.charge&&r.atkLeft===0);
  play(g,0,give(g,a,"kazakh"));
  const t=a.board.find(x=>x.id==="kazakh");
  check("白俄罗斯政体：新嘲讽单位 +1/+2",t.attack===2&&t.health===10&&t.maxHealth===10,t.attack+"/"+t.health);
  a.armor=0;g.endTurn(0);
  check("白俄罗斯政体：回合结束获得 2 点护甲",a.armor===2,a.armor);
  g.endTurn(1);
  check("护甲在自己的下个回合开始时清空",a.armor===0);
}
/* ---- 整编 ---- */
{
  const {g,a,b}=setup(0);
  a.board.push(mk(g,"苏苏","red"));
  check("整编：不足 2 个俄布不能打出",!!E.playError(give(g,a,"consolidate"),a,b));
  a.hand=[];
  a.board.push(mk(g,"苏苏","red"),mk(g,"苏苏","red"),mk(g,"苏苏","redheavy"));
  a.board[1].attack=4;a.board[1].health=5;
  const c=give(g,a,"consolidate");play(g,0,c);
  const gd=a.board.find(u=>u.id==="redGuard");
  check("整编：合并为近卫红军，属性等于总和",gd&&gd.attack===8&&gd.health===9,gd&&gd.attack+"/"+gd.health);
  check("整编：只合并俄布，其他单位保留",a.board.some(u=>u.id==="redheavy")&&a.board.filter(u=>u.id==="red").length===0);
  check("整编：近卫红军有冲锋，可以立即攻击",gd.charge&&gd.atkLeft>0);
}
/* ---- 哈萨克布尔什维克红军 ---- */
{
  const {g,a,b}=setup(0);
  const kd=C.PROFILES["苏苏"].cards.find(c=>c.id==="kazakh");
  check("哈萨克红军：5 费 1/8 嘲讽",kd.cost===5&&kd.atk===1&&kd.hp===8&&kd.taunt&&kd.rarity==="elite");
  const k=give(g,a,"kazakh");
  a.board.push(mk(g,"苏苏","red"),mk(g,"苏苏","red"));
  const r1=a.board[0],r2=a.board[1];
  play(g,0,k);
  const u=a.board.find(x=>x.id==="kazakh");
  check("哈萨克红军：部署使所有俄布 +2/+2",r1.attack===4&&r1.health===4&&r2.attack===4&&r2.health===4,r1.attack+"/"+r1.health);
  check("哈萨克红军：自身不获得增益，保留 1/8",u.attack===1&&u.health===8,u.attack+"/"+u.health);
}
/* ---- 红场指挥官 ---- */
{
  const {g,a,b}=setup(0);
  const n=a.board.length;
  play(g,0,give(g,a,"redOfficer"));
  check("红场指挥官：部署召唤 1 个俄布",a.board.filter(u=>u.id==="red").length===n+1&&a.board.some(u=>u.id==="redOfficer"),a.board.map(u=>u.id).join(" "));
  const o=a.board.find(u=>u.id==="redOfficer");
  check("红场指挥官：本体保留 3/3",o.attack===3&&o.health===3,o.attack+"/"+o.health);
}
/* ---- 红军集结 / 战时共产主义 / 先锋动员 / 红场阅兵 ---- */
{
  const {g,a,b}=setup(0);
  a.board.push(mk(g,"苏苏","red"),mk(g,"苏苏","red"));
  play(g,0,give(g,a,"rally"));
  check("红军集结：所有俄布 +1/+1",a.board.every(u=>u.id==="red"&&u.attack===3&&u.health===3),a.board.map(u=>u.id+u.attack+u.health).join(" "));
  const n=a.board.length;
  a.deck=[mk(g,"苏苏","red"),mk(g,"苏苏","red"),mk(g,"苏苏","red")];
  const h0=a.hand.length;
  play(g,0,give(g,a,"warcom"));
  check("战时共产主义：每控制 1 个俄布抽 1 张",a.hand.length===h0+n&&a.deck.length===3-n,a.hand.length-h0);
  const hv=a.hand.length,boardN=a.board.length;
  play(g,0,give(g,a,"vanguard"));
  check("先锋动员：召唤 1 个俄布并抽 1 张",a.board.filter(u=>u.id==="red").length===boardN+1&&a.hand.length===hv+1);
}
/* ---- 情报 ---- */
{
  const {g,a,b}=setup(0);
  const e1=mk(g,"字母","guard"),e2=mk(g,"字母","order");b.hand=[e1,e2];
  play(g,0,give(g,a,"intel"));
  check("情报：进入选择，看到敌方手牌",g.pending&&g.pending.pi===0&&g.pending.cards.length===2);
  g.resolvePending(0,0);
  check("情报：选中的牌被封存",e1.sealed===true&&!e2.sealed);
  g.endTurn(0);
  b.energy=b.maxEnergy=10;
  check("被封存的牌在敌方回合无法打出",!!E.playError(e1,b,a));
  g.endTurn(1);
  check("封存在对手的回合结束后解除",e1.sealed===false);
  const x=setup(0);x.b.hand=[];
  play(x.g,0,give(x.g,x.a,"intel"));
  check("情报：敌方没有手牌时改为召唤俄布",!x.g.pending&&x.a.board.some(u=>u.id==="red"));
}
/* ---- 俄布 / 终端卡 ---- */
{
  const red=C.PROFILES["苏苏"].cards.find(c=>c.id==="red");
  check("俄布：2 费 2/2、无冲锋、普通",red.cost===2&&red.atk===2&&red.hp===2&&!red.charge&&red.rarity==="common"&&red.limit===4);
  check("卡组里已无政体法令与引渡单位",!C.PROFILES["苏苏"].cards.some(c=>/decree|^first$|^second$|^third$/.test(c.id)));
  const kh=C.PROFILES["苏苏"].cards.find(c=>c.id==="kazakh");
  check("哈萨克红军已加入苏苏卡组",!!kh&&kh.cost===5);
}
/* ---- awa：开局变成随机 awa 卡并洗入牌库 ---- */
{
  const def=C.PROFILES["苏苏"].cards.find(c=>c.id==="awaSwap");
  check("awa 卡：0 费 20/20 冲锋精英，部署 99 点伤害",def.cost===0&&def.atk===20&&def.hp===20&&def.charge&&def.rarity==="elite"&&def.effect==="hero99"&&def.limit===1);
  const base=C.defaultDeck("苏苏");
  check("这张卡的卡面没有任何描述，也不提 awa",def.text===""&&!def.flavor&&!/awa/i.test(def.name+def.text));
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
  let any=false;
  for(const h of ["苏苏","七星","下水"]){
    const g=new E.Game({players:[{name:"甲",hero:h},{name:"乙",hero:"字母"}],first:0});
    if(g.players[0].deck.concat(g.players[0].hand).some(c=>c.owner==="awa"))any=true;
    if(g.viewFor(0).intro.length)any=true;
  }
  check("没有携带 awa 卡时不再随机混入 awa 卡",!any);
  const g=new E.Game({players:[{name:"甲",hero:"苏苏"},{name:"乙",hero:"字母"}],first:0});
  g.mulligan(0,[]);g.mulligan(1,[]);
  if(g.pending&&g.pending.pi===0)g.resolvePending(0,0);
  const a=g.players[0],b=g.players[1];a.energy=a.maxEnergy=10;
  const c=g.clone(def,"苏苏");a.hand=[c];
  const r=g.playCard(0,c.uid,[]);
  check("awa 卡可以打出：99 点伤害",r.ok&&b.hp<=0&&g.phase==="over");
}
/* ---- 补充资源：后勤补给 / 窃取情报 / 政委 ---- */
{
  const {g,a,b}=setup(0);
  a.deck=[mk(g,"苏苏","red"),mk(g,"苏苏","redheavy"),mk(g,"苏苏","october"),mk(g,"苏苏","kazakh")];
  play(g,0,give(g,a,"supply"));
  check("后勤补给：展示牌库里的单位牌",g.pending&&g.pending.cards.length===3&&g.pending.cards.every(c=>c.kind==="unit"));
  const pick=g.pending.cards[0];
  g.resolvePending(0,0);
  check("后勤补给：选中的牌进入手牌并离开牌库",a.hand.some(c=>c.uid===pick.uid)&&!a.deck.some(c=>c.uid===pick.uid)&&a.deck.length===3);
  const x=setup(0);
  x.b.deck=[x.g.clone(C.cardDef("字母","over"),"字母"),x.g.clone(C.cardDef("字母","shadow"),"字母"),x.g.clone(C.cardDef("字母","order"),"字母"),x.g.clone(C.cardDef("字母","guard"),"字母")];
  const before=x.b.deck.length;
  play(x.g,0,give(x.g,x.a,"intelSteal"));
  check("窃取情报：看到敌方牌库顶 3 张",x.g.pending&&x.g.pending.cards.length===3);
  const target=x.g.pending.cards[1];
  x.g.resolvePending(0,1);
  check("窃取情报：偷到手牌，敌方牌库少 1 张",x.a.hand.some(c=>c.id===target.id)&&x.b.deck.length===before-1&&!x.b.deck.some(c=>c.uid===target.uid));
  const c=setup(0);
  const com=mk(c.g,"苏苏","commissar");c.a.board.push(com);com.health=0;c.g.cleanup();
  check("政委：被消灭后放回红色动员令",c.a.hand.some(x=>x.id==="mobilize"));
  const l=setup(0);l.g.lock=1;
  l.a.deck=[mk(l.g,"苏苏","red")];play(l.g,0,give(l.g,l.a,"supply"));
  check("停摆期间后勤补给无法取牌",!l.g.pending&&l.a.deck.length===1);
}
/* ---- 视图字段 ---- */
{
  const {g,a}=setup(1);
  const v=g.viewFor(1);
  check("视图公开政体和更换次数",v.foe.regime==="ukr"&&v.foe.regimeChanges===1);
}
/* ---- 默认卡组 ---- */
{
  const d=C.defaultDeck("苏苏"),ids=new Set(d);
  check("苏苏默认卡组合法",!C.deckError("苏苏",d));
  const drawText=C.PROFILES["苏苏"].cards.filter(c=>/抽 \d+ 张牌|抽 1 张牌/.test(c.text));
  check("苏苏现在有抽牌组件（战时共产主义 / 先锋动员）",drawText.length>0,drawText.map(c=>c.name).join(","));
  check("苏苏牌表在 18~26 张之间",ids.size>=18&&ids.size<=26,ids.size);
}
console.log(fail?"SUSU TEST FAILED":"SUSU TEST PASSED");
process.exit(fail?1:0);
