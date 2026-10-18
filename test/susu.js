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
/* ---- 白俄罗斯铁壁体系：10 张专用卡 ---- */
{
  const P=C.PROFILES["苏苏"].cards,by=id=>P.find(c=>c.id===id);
  const c1=by("blrConscript"),tr=by("blrTrench"),g1=by("blrGarrison"),b1=by("blrBastion"),
        r1=by("blrRailway"),rp=by("blrRepair"),f1=by("blrFortify"),w1=by("blrArmorWall"),
        st=by("blrSteelTide"),tk=C.TOKENS.redTank;
  check("白俄罗斯民兵：1 费 1/2 嘲讽 亡语 +2 甲",
    c1.cost===1&&c1.atk===1&&c1.hp===2&&c1.taunt&&c1.effect==="blrDeathArmor"&&c1.rarity==="common"&&c1.limit===4);
  check("战壕：2 费 0/5 嘲讽",tr.cost===2&&tr.atk===0&&tr.hp===5&&tr.taunt&&!tr.effect&&tr.rarity==="common"&&tr.limit===4);
  check("明斯克卫戍军：2 费 2/4 嘲讽 部署 +2 甲",
    g1.cost===2&&g1.atk===2&&g1.hp===4&&g1.taunt&&g1.effect==="blrGarrison"&&g1.rarity==="common"&&g1.limit===4);
  check("边防哨所：3 费 0/6 嘲讽 回合末 +1 甲",
    b1.cost===3&&b1.atk===0&&b1.hp===6&&b1.taunt&&b1.effect==="blrBastion"&&b1.limit===4);
  check("装甲列车：5 费 4/6 嘲讽 部署 +3 甲",
    r1.cost===5&&r1.atk===4&&r1.hp===6&&r1.taunt&&r1.effect==="blrRailway"&&r1.rarity==="special"&&r1.limit===2);
  check("抢修列车：3 费法术 3 甲抽 1",rp.cost===3&&rp.kind==="spell"&&rp.effect==="armor3draw"&&rp.rarity==="common"&&rp.limit===4);
  check("筑垒令：2 费法术，护甲=2×嘲讽数",f1.cost===2&&f1.kind==="spell"&&f1.effect==="blrFortify"&&f1.rarity==="rare"&&f1.limit===3);
  check("铁壁：3 费法术，嘲讽 +1/+1 并 +2 甲",w1.cost===3&&w1.kind==="spell"&&w1.effect==="blrArmorWall"&&w1.rarity==="rare"&&w1.limit===3);
  check("钢铁洪流：10 费精英，每回合产 1 张坦克",st.cost===10&&st.kind==="spell"&&st.effect==="blrSteelTide"&&st.rarity==="elite"&&st.limit===1);
  check("红军坦克 token：5/4 冲锋",tk.atk===5&&tk.hp===4&&tk.charge===true&&tk.kind==="unit");
  check("10 张铁壁专用卡都带 blr 标记",[c1,tr,g1,b1,r1,rp,f1,w1,st].every(c=>c.rep==="blr"));
}
/* ---- 白俄罗斯铁壁：部署 / 亡语 / 回合末 叠甲 ---- */
{
  const {g,a}=setup(2);a.energy=a.maxEnergy=99;a.armor=0;
  play(g,0,give(g,a,"blrGarrison"));
  const u=a.board.find(x=>x.id==="blrGarrison");
  check("卫戍军：部署获得 2 点护甲",a.armor===2,a.armor);
  check("白俄罗斯：新嘲讽单位 +1/+2（卫戍军 3/6）",u.attack===3&&u.health===6,u.attack+"/"+u.health);
  play(g,0,give(g,a,"blrRailway"));
  check("装甲列车：部署获得 3 点护甲（累计 5）",a.armor===5,a.armor);

  const d=setup(2);d.a.armor=0;
  const m=mk(d.g,"苏苏","blrConscript");d.a.board.push(m);m.health=0;d.g.cleanup();
  check("白俄罗斯民兵：亡语获得 2 点护甲",d.a.armor===2,d.a.armor);

  const t=setup(2);t.a.armor=0;t.a.board.push(mk(t.g,"苏苏","blrBastion"));
  t.g.endTurn(0);
  check("边防哨所：有嘲讽单位时回合末额外 +1（政体 2 + 哨所 1）",t.a.armor===3,t.a.armor);
  const n=setup(2);n.a.armor=0;
  const bast=mk(n.g,"苏苏","blrBastion");bast.taunt=false;n.a.board.push(bast);
  n.g.endTurn(0);
  check("边防哨所：没有嘲讽单位时只吃政体 +2",n.a.armor===2,n.a.armor);
}
/* ---- 筑垒令：2×嘲讽单位数（0 / 1 / 3） ---- */
{
  const {g,a}=setup(2);a.energy=a.maxEnergy=99;a.armor=0;
  play(g,0,give(g,a,"blrFortify"));
  check("筑垒令：0 个嘲讽 → 0 护甲",a.armor===0,a.armor);
  a.board.push(mk(g,"苏苏","redheavy"));
  play(g,0,give(g,a,"blrFortify"));
  check("筑垒令：只有非嘲讽单位 → 仍是 0",a.armor===0,a.armor);
  a.board.push(mk(g,"苏苏","blrConscript"));
  play(g,0,give(g,a,"blrFortify"));
  check("筑垒令：1 个嘲讽 → 2 护甲",a.armor===2,a.armor);
  a.board.push(mk(g,"苏苏","blrConscript"),mk(g,"苏苏","blrBastion"));
  a.armor=0;
  play(g,0,give(g,a,"blrFortify"));
  check("筑垒令：3 个嘲讽 → 6 护甲",a.armor===6,a.armor);
}
/* ---- 铁壁 / 抢修列车 ---- */
{
  const {g,a}=setup(2);a.energy=a.maxEnergy=99;a.armor=0;
  const u1=mk(g,"苏苏","blrConscript"),u2=mk(g,"苏苏","blrGarrison"),u3=mk(g,"苏苏","redheavy");
  a.board.push(u1,u2,u3);
  const a2=u2.attack;
  play(g,0,give(g,a,"blrArmorWall"));
  check("铁壁：嘲讽单位 +1/+1",u1.attack===2&&u1.health===3&&u2.attack===a2+1&&u2.health===5,u1.attack+"/"+u1.health+" "+u2.attack+"/"+u2.health);
  check("铁壁：非嘲讽单位不受影响",u3.attack===4&&u3.health===5);
  check("铁壁：获得 2 点护甲",a.armor===2,a.armor);
  a.armor=0;
  play(g,0,give(g,a,"blrRepair"));
  check("抢修列车：3 点护甲并抽 1 张",a.armor===3,a.armor);
}
/* ---- 钢铁洪流：10 费终端，每个自己的回合开始产 1 张红军坦克 ---- */
{
  const {g,a}=setup(2);a.energy=a.maxEnergy=99;a.armor=0;a.hand=[];
  const res=play(g,0,give(g,a,"blrSteelTide"));
  check("钢铁洪流：可以打出（10 费）",res.ok,res.error);
  check("钢铁洪流：标记为永久生效",a.steelTide===true);
  const c2=give(g,a,"blrSteelTide");
  check("钢铁洪流：重复打出被拒绝",!!E.playError(c2,a,g.players[1]),E.playError(c2,a,g.players[1]));

  a.hand=[];
  g.endTurn(0);g.endTurn(1);
  const t1=a.hand.filter(c=>c.id==="redTank");
  check("钢铁洪流：下个自己的回合开始获得 1 张红军坦克",t1.length===1,t1.length);
  a.hand=[];
  g.endTurn(0);g.endTurn(1);
  check("钢铁洪流：再下一个回合再获得 1 张",a.hand.filter(c=>c.id==="redTank").length===1,a.hand.length);

  a.hand=[];for(let i=0;i<C.MAX_HAND;i++)a.hand.push(g.clone(C.TOKENS.redTank,"苏苏"));
  const before=a.hand.length;
  g.endTurn(0);g.endTurn(1);
  check("钢铁洪流：手牌满时不加牌",a.hand.length===before&&a.hand.length<=C.MAX_HAND,a.hand.length);
}
/* ---- 红军坦克：5/4 冲锋，落场即可攻击（blr 政体不吃掉它的冲锋） ---- */
{
  const {g,a}=setup(2);a.energy=a.maxEnergy=99;
  const t=g.clone(C.TOKENS.redTank,"苏苏");a.hand=[t];
  const res=g.playCard(0,t.uid,[],null);
  const tank=a.board.find(u=>u.id==="redTank");
  check("红军坦克：可以打出",res.ok,res.error);
  check("红军坦克：5/4 冲锋且当回合可攻击",!!tank&&tank.attack===5&&tank.health===4&&tank.charge&&tank.atkLeft>0,tank?tank.attack+"/"+tank.health+" atkLeft="+tank.atkLeft:"");
}
/* ---- 两套预设：俄布海 / 白俄罗斯铁壁 ---- */
{
  const rus=C.presetDeck("苏苏","俄布海"),blr=C.presetDeck("苏苏","白俄罗斯铁壁");
  check("苏苏有两套预设",!!rus&&!!blr);
  check("俄布海 40 张且合法",rus.length===40&&!C.deckError("苏苏",rus),C.deckError("苏苏",rus));
  check("白俄罗斯铁壁 40 张且合法",blr.length===40&&!C.deckError("苏苏",blr),C.deckError("苏苏",blr));
  check("俄布海不含铁壁卡",!rus.some(id=>/^blr/.test(id)));
  check("铁壁卡组不含俄布体系牌",!blr.some(id=>["red","redguard","redcharge","redOfficer","commissar","mobilize","vanguard","october","consolidate","rally","warcom","kazakh","reddawn","peoplearmy"].includes(id)));
  check("铁壁卡组里 9 张 blr 专用卡齐全",new Set(blr.filter(id=>/^blr/.test(id))).size===9,[...new Set(blr.filter(id=>/^blr/.test(id)))].join(","));
  check("铁壁卡组带钢铁洪流终端",blr.includes("blrSteelTide"));
  check("苏苏牌表 28 张以上（含铁壁卡）",C.PROFILES["苏苏"].cards.filter(c=>c.id!=="awaSwap").length>=28,C.PROFILES["苏苏"].cards.length);
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
/* ---- 默认卡组（俄布海） ---- */
{
  const d=C.defaultDeck("苏苏"),ids=new Set(d);
  check("苏苏默认卡组（俄布海）合法",!C.deckError("苏苏",d));
  check("苏苏默认卡组正好 40 张",d.length===40,d.length);
  check("默认卡组保留俄布核心",["red","mobilize","october","kazakh"].every(id=>d.includes(id)));
  check("默认卡组不含铁壁卡（两套卡组分开）",!d.some(id=>/^blr/.test(id)));
  const drawText=C.PROFILES["苏苏"].cards.filter(c=>/抽 \d+ 张牌|抽 1 张牌/.test(c.text));
  check("苏苏现在有抽牌组件（战时共产主义 / 先锋动员）",drawText.length>0,drawText.map(c=>c.name).join(","));
  check("默认卡组牌型数量在 18~26 之间",ids.size>=18&&ids.size<=26,ids.size);
}
/* ---- 钢铁洪流的 AI 决策：残血不乱打、健康时当终端 ---- */
{
  const AIPlayer=require("../shared/ai.js").AIPlayer;
  const mkGame=hp=>{
    const g=new E.Game({players:[{name:"甲",hero:"苏苏",deck:C.presetDeck("苏苏","白俄罗斯铁壁")},{name:"乙",hero:"字母"}],first:0});
    g.mulligan(0,[]);g.mulligan(1,[]);
    if(g.pending&&g.pending.pi===0)g.resolvePending(0,0);
    const a=g.players[0];a.hp=hp;a.armor=0;a.energy=a.maxEnergy=10;a.board=[];
    const t=g.clone(C.cardDef("苏苏","blrSteelTide"),"苏苏");a.hand=[t];
    return{g,a,t};
  };
  const low=mkGame(5),high=mkGame(20);
  const actLow=new AIPlayer("normal").next(low.g,0);
  const actHigh=new AIPlayer("normal").next(high.g,0);
  check("钢铁洪流：残血（5 血）时 AI 不会主动打出",!(actLow.type==="play"&&actLow.uid===low.t.uid),actLow.type);
  check("钢铁洪流：血量健康时 AI 会打出",actHigh.type==="play"&&actHigh.uid===high.t.uid,actHigh.type);
}
console.log(fail?"SUSU TEST FAILED":"SUSU TEST PASSED");
process.exit(fail?1:0);
