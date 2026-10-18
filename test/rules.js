/* 规则测试：护甲清空、衰减、出牌封锁、亡语、限时单位、偷钱换算、按设定集调整的卡牌 */
const C=require("../shared/cards.js"),E=require("../shared/engine.js");
const results=[];const check=(n,ok,x)=>{results.push(!!ok);console.log((ok?"✔ ":"✘ ")+n+(x!==undefined?"  "+x:""));};

function game(a,b){
  const g=new E.Game({players:[{name:"甲",hero:a},{name:"乙",hero:b}],first:0});
  g.mulligan(0,[]);g.mulligan(1,[]);
  // 苏苏开局会自动打出【苏维埃社会主义共和国联盟】选择政体，先替测试选俄罗斯以放行首回合操作
  if(g.pending&&g.pending.pi===0)g.resolvePending(0,0);
  return g;
}
const mk=(g,hero,id)=>g.clone(C.cardDef(hero,id),hero);
function ready(g,pi,hand){
  const p=g.players[pi];p.hand=hand;p.energy=p.maxEnergy=10;return p;
}
const play=(g,pi,card,targets,opt)=>g.playCard(pi,card.uid,targets||[],opt);
/* 苏苏作为后手时，其首回合开始会弹出政体选择 pending；测试中直接替它选默认政体以放行 */
const settle=g=>{if(g.pending&&g.pending.pi===g.current)g.resolvePending(g.current,g.pending.auto);};
function toTurn(g,pi){let n=0;while(g.current!==pi&&n++<4)g.endTurn(g.current);}

/* ---- 护甲 ---- */
{
  const g=game("苏苏","字母");
  const a=g.players[0],b=g.players[1];
  a.armor=5;
  g.endTurn(0);
  check("护甲在对手回合内仍然有效",a.armor===5&&g.current===1);
  const before=a.hp;b.board.push(Object.assign(mk(g,"字母","commando"),{atkLeft:1}));
  const r=g.attack(1,b.board[0].uid,null);
  check("护甲抵挡对手的攻击",r.ok&&a.hp===before-0&&a.armor===1,`hp ${a.hp} armor ${a.armor}`);
  g.endTurn(1);
  check("自己的下个回合开始时护甲清空",a.armor===0);
}

/* ---- 0 攻击力单位可以攻击 ---- */
{
  const g=game("七星","苏苏");
  const a=g.players[0],b=g.players[1];
  const band=mk(g,"七星","awaBand");band.atkLeft=1;a.board.push(band);
  const foe=mk(g,"苏苏","redheavy");b.board.push(foe);
  const r=g.attack(0,band.uid,foe.uid);
  check("攻击力为 0 的单位可以攻击",r.ok&&band.atkLeft===0,r.error||"");
}

/* ---- 衰减 ---- */
{
  const g=game("七星","苏苏");
  const a=g.players[0],b=g.players[1];
  ready(g,0,[mk(g,"七星","eclipse"),mk(g,"七星","withering"),mk(g,"七星","doomsday")]);
  check("星蚀：3 层衰减",play(g,0,a.hand[0]).ok&&b.decay===3);
  check("凋零彗尾：+3 层并抽牌",play(g,0,a.hand.find(c=>c.id==="withering")).ok&&b.decay===6);
  check("终焉倒计时：层数翻倍",play(g,0,a.hand.find(c=>c.id==="doomsday")).ok&&b.decay===12,"层数 "+b.decay);
  const hp=b.hp;b.armor=10;g.endTurn(0);
  check("衰减在回合开始时造成伤害，且不被护甲抵挡",b.hp===hp-12&&b.armor===0,`hp ${hp}→${b.hp}`);
}
{
  const g=game("七星","苏苏");
  const a=g.players[0],b=g.players[1];
  ready(g,0,[mk(g,"七星","doomsday")]);play(g,0,a.hand[0]);
  check("没有衰减时终焉倒计时至少 +1 层",b.decay===1);
}
{
  const g=game("七星","苏苏");
  const b=g.players[1];b.decay=40;b.hp=30;
  g.endTurn(0);
  check("衰减可以杀死英雄",g.phase==="over"&&g.winner===0);
}

/* ---- 出牌封锁 ---- */
{
  const g=game("七星","苏苏");
  const a=g.players[0],b=g.players[1];
  ready(g,0,[mk(g,"七星","cardCap")]);play(g,0,a.hand[0]);
  check("星域封锁：设置下回合出牌上限",b.nextCap===2&&b.turnCap===null);
  g.endTurn(0);settle(g);
  check("封锁在对手下个回合生效",b.turnCap===2);
  ready(g,1,[mk(g,"苏苏","redguard"),mk(g,"苏苏","redguard"),mk(g,"苏苏","redguard")]);
  const r1=play(g,1,b.hand[0]),r2=play(g,1,b.hand[0]),r3=play(g,1,b.hand[0]);
  check("本回合只能打出 2 张牌",r1.ok&&r2.ok&&!r3.ok,r3.error);
  g.endTurn(1);g.endTurn(0);
  check("封锁只持续一个回合",b.turnCap===null);
}
{
  const g=game("七星","苏苏");
  const a=g.players[0],b=g.players[1];
  ready(g,0,[mk(g,"七星","silence")]);play(g,0,a.hand[0]);g.endTurn(0);settle(g);
  ready(g,1,[mk(g,"苏苏","mobilize"),mk(g,"苏苏","redguard")]);
  const s=play(g,1,b.hand.find(c=>c.id==="mobilize")),u=play(g,1,b.hand.find(c=>c.id==="redguard"));
  check("寂静星环：不能打法术，但可以打单位",!s.ok&&u.ok,s.error);
}

/* ---- 亡语 / 复仇主义 ---- */
{
  const g=game("八幡","苏苏");
  const a=g.players[0],b=g.players[1];
  const p1=mk(g,"八幡","pirate"),p2=mk(g,"八幡","pirate");a.board.push(p1,p2);
  ready(g,0,[mk(g,"八幡","revengepirate"),mk(g,"八幡","fireship")]);
  play(g,0,a.hand[0]);
  check("复仇主义：所有单位获得亡语",p1.deathDmg===1&&p2.deathDmg===1);
  const hp=b.hp;
  play(g,0,a.hand[0]);   // 火船
  check("火船摧毁单位时触发亡语",b.hp===hp-2,`hp ${hp}→${b.hp}`);
}

/* ---- 限时单位：超人 ---- */
{
  const g=game("核弹","苏苏");
  const a=g.players[0],b=g.players[1];
  ready(g,0,[mk(g,"核弹","superman")]);
  check("超人 3 费，冲锋，限时",a.hand[0].cost===3&&a.hand[0].charge&&a.hand[0].lifespan===1);
  const hp=b.hp;
  play(g,0,a.hand[0]);
  const sup=a.board[0];
  g.attack(0,sup.uid,null);g.attack(0,sup.uid,null);
  check("超人本回合攻击两次，各 10 点伤害",b.hp===hp-20,`hp ${hp}→${b.hp}`);
  g.endTurn(0);settle(g);
  check("超人在对手回合仍在场",a.board.length===1);
  g.endTurn(1);
  check("超人在你的下个回合开始时消散",a.board.length===0);
}

/* ---- 猪瘟鱼：金钱换算 ---- */
{
  const g=game("猪瘟鱼","苏苏");
  const a=g.players[0];
  ready(g,0,[mk(g,"猪瘟鱼","greyincome"),mk(g,"猪瘟鱼","steal"),mk(g,"猪瘟鱼","escape")]);
  play(g,0,a.hand[0]);
  check("灰色收入：偷取 40 元",a.money===40,"money "+a.money);
  play(g,0,a.hand.find(c=>c.id==="steal"));
  check("人民收米术：偷取 100 元",a.money===140,"money "+a.money);
  check("目标金额为 300 元",C.ESCAPE_TARGET===300);
  a.money=300;
  play(g,0,a.hand.find(c=>c.id==="escape"));
  check("攒够 300 元后逃跑获胜",g.phase==="over"&&g.winner===0);
}

/* ---- 字母：消除限制 ---- */
{
  const g=game("字母","苏苏");
  const a=g.players[0],b=g.players[1];
  b.heroImmune=true;b.board.push(mk(g,"苏苏","kazakh"),mk(g,"苏苏","kazakh"));
  ready(g,0,[mk(g,"字母","remove")]);
  const hp=b.hp;play(g,0,a.hand[0]);
  check("消除限制：移除嘲讽与免疫并造成 3 点伤害",b.board.every(u=>!u.taunt)&&!b.heroImmune&&b.hp===hp-3);
}

/* ---- 八幡：海盗船随机海盗 ---- */
{
  const g=game("八幡","苏苏");
  const a=g.players[0];
  const seen=new Set();
  for(let i=0;i<40;i++){
    a.board=[];a.hand=[mk(g,"八幡","ship")];a.energy=10;
    play(g,0,a.hand[0]);
    a.board.filter(u=>u.id!=="ship").forEach(u=>seen.add(u.id));
    g.endTurn(0);settle(g);g.endTurn(1);
  }
  check("海盗船会随机召唤不同的海盗",seen.size>=3,[...seen].join(","));
}

/* ---- 045：愚蠢 / 绘梨衣 / 开发他人卡组 ---- */
{
  const g=game("045","字母");
  const a=g.players[0],b=g.players[1];
  ready(g,0,[mk(g,"045","yuchun")]);
  const n=b.deck.length;
  play(g,0,a.hand[0]);
  const top3=b.deck.slice(-3).every(c=>c.id==="duck");
  check("愚蠢：敌方牌库顶 3 张变成鸭子",top3&&b.deck.length===n&&b.deck[b.deck.length-4].id!=="duck");
}
{
  const g=game("045","字母");
  const a=g.players[0];
  const cheap=mk(g,"045","handoff");   // 1 费
  ready(g,0,[mk(g,"045","huiliyi"),cheap,mk(g,"045","alwei")]);
  play(g,0,a.hand[0]);
  const gone=!a.hand.includes(cheap);
  const repl=a.hand.find(c=>c!==undefined&&c.cost===3&&c!==a.hand.find(x=>x.id==="alwei"));
  check("绘梨衣：手牌里最便宜的牌变成费用高 2 的牌",gone&&!!repl,a.hand.map(c=>c.name+c.cost).join(" "));
}
{
  const g=game("045","字母");
  const a=g.players[0],b=g.players[1];
  ready(g,0,[mk(g,"045","develop")]);
  const deckN=b.deck.length,handN=a.hand.length;
  const r=play(g,0,a.hand[0]);
  check("开发他人卡组：进入选择",r.ok&&g.pending&&g.pending.pi===0&&g.pending.cards.length===3);
  const pick=g.pending.cards[0];
  g.resolvePending(0,0);
  check("复制到手牌且不会从敌方牌库移除",a.hand.some(c=>c.name===pick.name)&&b.deck.length===deckN&&a.hand.length===handN);
}

/* ---- 淘金 ---- */
{
  const seen=new Set();
  for(let i=0;i<60;i++){
    const g=game("045","字母");const a=g.players[0],b=g.players[1];
    ready(g,0,[mk(g,"045","taojin")]);
    const hp0=a.hp,hp1=b.hp,h=a.hand.length;b.hp=20;
    play(g,0,a.hand[0]);
    if(b.hp===14)seen.add("伤害");else if(b.hp===24)seen.add("治疗对手");else if(a.hp===hp0-3)seen.add("自伤");else if(a.hand.length>=h+1)seen.add("抽牌");
  }
  check("淘金会随机触发 4 种效果",seen.size===4,[...seen].join(","));
}

/* ---- 炮火准备（choose3x2 法术）---- */
{
  const g=game("下水","字母");
  const a=g.players[0],b=g.players[1];
  const f1=mk(g,"字母","commando"),f2=mk(g,"字母","shadow"),f3=mk(g,"字母","over");
  f1.health=4;f2.health=4;f3.health=4;b.board.push(f1,f2,f3);
  ready(g,0,[mk(g,"下水","prepfire")]);
  const r=play(g,0,a.hand[0],[f1.uid,f2.uid,f3.uid]);
  check("炮火准备：选中 3 个敌方单位各受 2 点伤害",r.ok&&f1.health===2&&f2.health===2&&f3.health===2,r.error||(f1.health+","+f2.health+","+f3.health));
  const g2=game("下水","字母");const a2=g2.players[0],b2=g2.players[1];
  const x=mk(g2,"字母","commando"),y=mk(g2,"字母","shadow");x.health=3;y.health=3;b2.board.push(x,y);
  ready(g2,0,[mk(g2,"下水","prepfire")]);
  const r2=play(g2,0,a2.hand[0],[x.uid]);
  check("炮火准备：只选 1 个也只伤它",r2.ok&&x.health===1&&y.health===3,r2.error||(x.health+","+y.health));
}

/* ---- 字母：临时策反限一回合，下回合返回 / 策动叛乱永久 ---- */
{
  const g=game("字母","苏苏");
  const a=g.players[0],b=g.players[1];
  const foe=mk(g,"苏苏","redheavy");b.board.push(foe);
  ready(g,0,[mk(g,"字母","takeover")]);
  play(g,0,a.hand[0]);
  const u=a.board.find(x=>x.uid===foe.uid);
  check("战术接管：临时策反单位进入你的战场",a.board.some(x=>x.uid===foe.uid)&&u&&u.tempRebel===1);
  g.endTurn(0);settle(g);g.endTurn(1);
  check("战术接管：你的下个回合开始单位返回原主人",b.board.some(x=>x.uid===foe.uid)&&!a.board.some(x=>x.uid===foe.uid));
}
{
  const g=game("字母","苏苏");
  const a=g.players[0],b=g.players[1];
  const foe=mk(g,"苏苏","redheavy");b.board.push(foe);
  ready(g,0,[mk(g,"字母","rebel")]);
  play(g,0,a.hand[0],[foe.uid]);
  const u=a.board.find(x=>x.uid===foe.uid);
  check("策动叛乱：永久策反（无临时标记）",!!u&&(u.tempRebel==null));
  g.endTurn(0);settle(g);g.endTurn(1);
  check("策动叛乱：下个回合仍在你战场（永久）",a.board.some(x=>x.uid===foe.uid)&&!b.board.some(x=>x.uid===foe.uid));
}

/* ---- 没收手稿：手牌优先，空手牌时销毁两张牌库牌，并补牌 ---- */
{
  const g=game("白猫","七星"),a=g.players[0],b=g.players[1];
  const confiscate=mk(g,"白猫","insight"),victim=mk(g,"七星","awaBand"),drawn=mk(g,"白猫","spark");
  ready(g,0,[confiscate]);a.deck=[drawn];b.hand=[victim];b.deck=[mk(g,"七星","awaBand"),mk(g,"七星","awaBand")];
  const r=play(g,0,confiscate);
  check("没收手稿：3 费销毁敌方手牌并抽牌",r.ok&&a.energy===7&&b.hand.length===0&&b.deck.length===2&&a.hand.some(c=>c.uid===drawn.uid)&&a.destroyedCards===1,r.error||"");
}
{
  const g=game("白猫","七星"),a=g.players[0],b=g.players[1];
  const confiscate=mk(g,"白猫","insight"),drawn=mk(g,"白猫","spark");
  ready(g,0,[confiscate]);a.deck=[drawn];b.hand=[];b.deck=[mk(g,"七星","awaBand"),mk(g,"七星","awaBand"),mk(g,"七星","awaBand")];
  const r=play(g,0,confiscate);
  check("没收手稿：敌方空手时销毁牌库顶 2 张并抽牌",r.ok&&b.deck.length===1&&a.hand.some(c=>c.uid===drawn.uid)&&a.destroyedCards===2,r.error||"");
}

/* ---- 数据一致性 ---- */
{
  let bad=[];
  for(const h in C.PROFILES){
    const e=C.deckError(h,C.defaultDeck(h));if(e)bad.push(h+":"+e);
    for(const c of C.PROFILES[h].cards)if(c.n>c.limit)bad.push(`${h}:${c.id} n>limit`);
  }
  check("所有默认卡组合法",!bad.length,bad.join(" "));
  const text=JSON.stringify(C.PROFILES);
  check("卡牌文字里没有已废弃的旧说法",!/25 元|彗星冲击|受 \d+ 点伤害/.test(text));
  // 所有提到「目标金额」的文字必须与常量一致（逃跑卡、关键字说明、卡牌师提示、规则页）
  const nums=[...(text+JSON.stringify(C.KEYWORDS)+JSON.stringify(C.HERO_INFO)).matchAll(/(?:偷取|偷够|攒够)\s*(\d+)\s*元[^。]{0,12}(?:获胜|逃跑|胜利)|已偷取\s*(\d+)\s*元/g)].map(m=>+(m[1]||m[2]));
  check("文字中的目标金额与 ESCAPE_TARGET 一致",nums.length>=2&&nums.every(n=>n===C.ESCAPE_TARGET),nums.join(","));
  const html=require("fs").readFileSync(__dirname+"/../public/index.html","utf8");
  check("规则页没有 awa 说明",!/awa 卡/.test(html));
}

const pass=results.every(Boolean);
console.log(pass?"RULES TEST PASSED":"RULES TEST FAILED");
process.exit(pass?0:1);
