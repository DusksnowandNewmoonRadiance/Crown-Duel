/* DIY 角色系统测试：校验、注册、卡组、池分离、AI 实战冒烟 */
const C = require("../shared/cards.js");
const E = require("../shared/engine.js");
const { AIPlayer } = require("../shared/ai.js");
const Diy = require("../shared/diy.js");
const Builtin = require("../shared/diy-builtin.js");

const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };

/* ---- 内置角色 ---- */
const vanillaBefore = Object.keys(C.PROFILES).length;
const canglan = Builtin.heroes[0];
check("内置只有一个角色，且名为苍蓝", Builtin.heroes.length === 1 && canglan.name === "苍蓝", canglan.name);

const v = Diy.validate(canglan);
check("苍蓝通过校验", v.ok, v.errors.join(" | "));
const reg = Diy.register(v.def, { builtin: true });
check("苍蓝注册成功", reg.ok, reg.error);
check("苍蓝已进入 PROFILES", !!C.PROFILES["苍蓝"]);
check("苍蓝有颜色", C.COLORS["苍蓝"] === "#5ab4ff", C.COLORS["苍蓝"]);

const deck = C.defaultDeck("苍蓝");
check("苍蓝默认卡组 40 张", deck.length === 40, deck.length);
check("苍蓝默认卡组合法", C.deckError("苍蓝", deck) === null, C.deckError("苍蓝", deck));
check("isDiy 能识别苍蓝", Diy.isDiy("苍蓝") === true);
check("原版角色不会被误判", Object.keys(C.PROFILES).filter((h) => !Diy.isDiy(h)).length === vanillaBefore, Object.keys(C.PROFILES).filter((h) => !Diy.isDiy(h)).length);
check("catalog 非空且都有说明", Diy.catalog().length >= 20 && Diy.catalog().every((x) => x.id && x.text), Diy.catalog().length);

/* ---- 校验器拒绝坏输入 ---- */
const base = JSON.parse(JSON.stringify(canglan));
const bad = (patch, why) => {
  const d = JSON.parse(JSON.stringify(base));
  Object.assign(d, patch);
  const r = Diy.validate(d, { allowReplace: "苍蓝" });
  check("拒绝：" + why, !r.ok, (r.errors || []).slice(0, 2).join(" / "));
};
bad({ hp: 99 }, "血量越界");
bad({ hp: 5 }, "血量过低");
bad({ cards: base.cards.slice(0, 3) }, "卡牌种类太少");
{
  const d = JSON.parse(JSON.stringify(base));
  d.cards[0].effect = "whiteFinal";
  const r = Diy.validate(d, { allowReplace: "苍蓝" });
  check("拒绝：白名单外的机制", !r.ok, (r.errors[0] || ""));
}
{
  const d = JSON.parse(JSON.stringify(base));
  d.cards.forEach((c) => { c.limit = 1; });
  const r = Diy.validate(d, { allowReplace: "苍蓝" });
  check("拒绝：上限合计不足 40", !r.ok, (r.errors[0] || ""));
}
{
  const d = JSON.parse(JSON.stringify(base));
  d.cards[1].id = d.cards[0].id;
  const r = Diy.validate(d, { allowReplace: "苍蓝" });
  check("拒绝：卡牌 id 重复", !r.ok, (r.errors[0] || ""));
}
check("拒绝：占用原版角色名", !Diy.validate(Object.assign(JSON.parse(JSON.stringify(base)), { name: "苏苏" })).ok);

/* ---- 池分离：DIY 角色只在 DIY 池 ---- */
const vanillaNames = Object.keys(C.PROFILES).filter((h) => !Diy.isDiy(h));
check("DIY 角色不在原版池", !vanillaNames.includes("苍蓝"), vanillaNames.join(","));
check("DIY 名单包含苍蓝", Diy.names().includes("苍蓝"), Diy.names().join(","));

/* ---- 实战冒烟：苍蓝（普通 AI）对 字母（困难 AI）打完一局 ---- */
let finished = 0, errors = 0, turns = 0;
for (let k = 0; k < 6; k++) {
  try {
    const g = new E.Game({ players: [{ name: "苍蓝方", hero: "苍蓝" }, { name: "字母方", hero: "字母" }] });
    const ai = [new AIPlayer("normal"), new AIPlayer("normal")];
    for (let i = 0; i < 2; i++) g.mulligan(i, ai[i].mulligan(g, i));
    let steps = 0;
    while (g.phase !== "over" && steps++ < 3000) {
      const pi = g.current;
      if (g.pending) { g.resolvePending(g.pending.pi, ai[g.pending.pi].pickPending(g)); continue; }
      const act = ai[pi].next(g, pi);
      let r;
      if (act.type === "play") r = g.playCard(pi, act.uid, act.targets, act.option);
      else if (act.type === "attack") r = g.attack(pi, act.uid, act.target);
      else r = g.endTurn(pi);
      if (!r.ok) { if (act.type === "end") throw new Error("end " + r.error); ai[pi].passed.add(act.uid); ai[pi].plays = 99; }
      g.takeEvents();
      g.viewFor(0); g.viewFor(1);
    }
    if (g.phase === "over") { finished++; turns += g.turn; } else errors++;
  } catch (e) { errors++; console.log("  ! " + e.message); }
}
check("苍蓝能打完 6 局（AI 互打）", finished === 6 && errors === 0, `完成 ${finished}/6，平均 ${(turns / Math.max(1, finished)).toFixed(1)} 回合`);

/* ---- 神罚体系（苍蓝原版机制进白名单） ---- */
{
  const mk = () => {
    const g = new E.Game({ players: [{ name: "甲", hero: "苍蓝" }, { name: "乙", hero: "字母" }], first: 0 });
    g.mulligan(0, []); g.mulligan(1, []);
    const a = g.players[0], b = g.players[1];
    a.hand = []; b.hand = []; a.board = []; b.board = []; a.armor = 0;
    a.energy = a.maxEnergy = 10;
    return { g, a, b };
  };
  const punish = (g, hero) => g.clone(C.TOKENS.diyPunish, hero);

  check("白名单含 5 个神罚体系机制", ["diyPunishCast", "diyBarrier", "diyEcho", "diyPull", "diyMechEye"].every(id => !!Diy.CATALOG[id]));

  { // 神罚：抽到自动施放（自伤 1 + 抽 1），不进手牌
    const { g, a } = mk();
    a.deck = [g.clone(C.cardDef("苍蓝", "blue_prayer"), "苍蓝"), punish(g, "苍蓝")];   // deck.pop() 从末尾取
    a.hp = 30;
    g.draw(a, 1);
    check("神罚：抽到时自伤 1 点", a.hp === 29, a.hp);
    check("神罚：抽到时自动抽 1 张", a.hand.length === 1, a.hand.length);
    check("神罚：不会留在手牌里", !a.hand.some(c => c.id === "diyPunish"));
  }
  { // 神谕壁垒：护甲 = 敌方牌库神罚数
    const { g, a, b } = mk();
    b.deck = [punish(g, "字母"), punish(g, "字母"), punish(g, "字母")];
    const card = g.clone(C.cardDef("苍蓝", "blue_barrier"), "苍蓝");
    a.hand = [card];
    const r = g.playCard(0, card.uid, [], null);
    check("神谕壁垒：按敌方神罚数获得护甲", r.ok && a.armor === 3, "armor=" + a.armor);
  }
  { // 神罚共鸣：4 张进敌方牌库，2 张进自己
    const { g, a, b } = mk();
    b.deck = []; a.deck = [];
    const card = g.clone(C.cardDef("苍蓝", "blue_echo"), "苍蓝");
    a.hand = [card];
    const r = g.playCard(0, card.uid, [], null);
    const en = b.deck.filter(c => c.id === "diyPunish").length, my = a.deck.filter(c => c.id === "diyPunish").length;
    check("神罚共鸣：敌方牌库 +4 神罚", r.ok && en === 4, en);
    check("神罚共鸣：自己牌库 +2 神罚", my === 2, my);
  }
  { // 圣光牵引：临时策反 +1/+4
    const { g, a, b } = mk();
    const u = g.clone(C.cardDef("字母", "shadow"), "字母");
    b.board.push(u);
    const card = g.clone(C.cardDef("苍蓝", "blue_pull"), "苍蓝");
    a.hand = [card];
    const r = g.playCard(0, card.uid, [u.uid], null);
    const mine = a.board.find(x => x.id === "shadow");
    check("圣光牵引：策反到己方战场", r.ok && !!mine);
    check("圣光牵引：获得 +1/+4", mine && mine.attack === u.attack && mine.health === 5, mine ? mine.attack + "/" + mine.health : "-");
  }
  { // 机械眼：回合开始自动开火
    const { g, a, b } = mk();
    const eye = g.clone(C.cardDef("苍蓝", "blue_mech_eye"), "苍蓝");
    a.board.push(eye);
    const foe = g.clone(C.cardDef("字母", "shadow"), "字母");
    b.board.push(foe);
    b.hp = 30;
    g._startTurn(0);
    const hurt = foe.health < 1 || b.hp < 30;
    check("机械眼：回合开始自动攻击", eye.atkLeft === 0 && hurt, "atkLeft=" + eye.atkLeft + " foeHp=" + b.hp + " unitHp=" + foe.health);
  }
}
const passed = results.filter(Boolean).length;
console.log(`\nDIY TEST ${passed === results.length ? "PASSED" : "FAILED"} (${passed}/${results.length})`);
if (passed !== results.length) process.exitCode = 1;
