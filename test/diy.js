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

const v = Diy.validate(canglan, { builtin: true, allowReplace: "苍蓝" });
check("苍蓝通过内置通道校验", v.ok, v.errors.join(" | "));
check("苍蓝恢复到作者原版 41 张卡", v.def.cards.length === 41, v.def.cards.length);
check("苍蓝卡表保留了 azure 标记", v.def.cards.filter((c) => c.azure).length === 4, v.def.cards.filter((c) => c.azure).length);
check("苍蓝带嘲讽的单位数量正确", v.def.cards.filter((c) => c.taunt).length === 5, v.def.cards.filter((c) => c.taunt).length);
const reg = Diy.register(v.def, { builtin: true });
check("苍蓝注册成功", reg.ok, reg.error);
check("苍蓝已进入 PROFILES", !!C.PROFILES["苍蓝"]);
check("苍蓝有颜色", C.COLORS["苍蓝"] === "#5ab4ff", C.COLORS["苍蓝"]);

const deck = C.aiDeck("苍蓝");
check("苍蓝官方卡组 40 张", deck.length === 40, deck.length);
check("苍蓝官方卡组合法", C.deckError("苍蓝", deck) === null, C.deckError("苍蓝", deck));
check("苍蓝官方卡组含机械眼包", deck.filter((id) => /blueMechEye|summonMechDef|mechPriest/.test(id)).length === 6);
check("苍蓝官方卡组含神罚包", deck.filter((id) => /divineWrath|divineBarrier|punishArrival/.test(id)).length === 5);
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

/* ---- 机制分层：私有机制只允许内置角色 ---- */
{
  const upload = {
    name: "测试上传角色",
    hp: 30,
    cards: Array.from({ length: 10 }, (_, i) => ({
      id: "u" + i, name: "卡" + i, cost: 2, kind: "spell", effect: "draw1", n: 4, limit: 4,
    })),
  };
  const clean = Diy.validate(upload);
  check("玩家上传：全部用通用机制 → 通过", clean.ok, (clean.errors || []).join(" | "));

  const dirty = JSON.parse(JSON.stringify(upload));
  dirty.cards[0].effect = "divineWrath";
  const r1 = Diy.validate(dirty);
  check("玩家上传：用私有机制 → 拒绝", !r1.ok);
  check("玩家上传：错误信息写明「内置角色专用机制」",
    (r1.errors || []).some((x) => x.includes("内置角色专用机制")), (r1.errors || [])[0]);

  const dirty2 = JSON.parse(JSON.stringify(upload));
  dirty2.cards[1].effect = "vaultDeath";
  const r2 = Diy.validate(dirty2);
  check("玩家上传：另一个私有机制也拒绝", !r2.ok && (r2.errors || []).some((x) => x.includes("内置角色专用机制")), (r2.errors || [])[0]);

  const built = JSON.parse(JSON.stringify(dirty));
  built.name = "另一种内置";
  const r3 = Diy.validate(built, { builtin: true });
  check("内置通道：同一个私有机制 → 允许", r3.ok, (r3.errors || []).join(" | "));
}
check("BUILTIN_EFFECTS 已导出且非空", !!Diy.BUILTIN_EFFECTS && Object.keys(Diy.BUILTIN_EFFECTS).length >= 30, Object.keys(Diy.BUILTIN_EFFECTS || {}).length);

/* ---- 苍蓝 AI 互打：6 局都要正常结束 ---- */
{
  const E = require("../shared/engine.js");
  const { AIPlayer } = require("../shared/ai.js");
  let over = 0, threw = "";
  for (let k = 0; k < 6; k++) {
    try {
      const g = new E.Game({
        players: [
          { name: "A", hero: "苍蓝", deck: C.aiDeck("苍蓝") },
          { name: "B", hero: "苏苏", deck: C.aiDeck("苏苏") },
        ],
        first: k % 2,
      });
      const ai = [new AIPlayer("normal"), new AIPlayer("normal")];
      for (let i = 0; i < 2; i++) g.mulligan(i, ai[i].mulligan(g, i));
      let steps = 0;
      while (g.phase !== "over" && steps++ < 4000) {
        const pi = g.current;
        if (g.pending) { g.resolvePending(g.pending.pi, ai[g.pending.pi].pickPending(g)); continue; }
        const a = ai[pi].next(g, pi);
        const r = a.type === "play" ? g.playCard(pi, a.uid, a.targets, a.option)
          : a.type === "attack" ? g.attack(pi, a.uid, a.target) : g.endTurn(pi);
        if (!r.ok) {
          if (a.type === "end") break;
          if (a.type === "play") ai[pi].plays = 99; else ai[pi].passed.add(a.uid);
        }
        g.takeEvents();
      }
      if (g.phase === "over") over++;
    } catch (e) { threw = e.message; break; }
  }
  check("苍蓝 AI 互打 6 局全部正常结束", over === 6 && !threw, "over=" + over + "/6" + (threw ? " threw=" + threw : ""));
}

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
    a.deck = [g.clone(C.cardDef("苍蓝", "bluePrayer"), "苍蓝"), punish(g, "苍蓝")];   // deck.pop() 从末尾取
    a.hp = 30;
    g.draw(a, 1);
    check("神罚：抽到时自伤 1 点", a.hp === 29, a.hp);
    check("神罚：抽到时自动抽 1 张", a.hand.length === 1, a.hand.length);
    check("神罚：不会留在手牌里", !a.hand.some(c => c.id === "diyPunish"));
  }
  /* 下面几条测的是「通用机制」本身（DIY 白名单里的 diyBarrier/diyEcho/diyPull），
     不再依赖苍蓝的具体卡——苍蓝已改回作者的私有机制实现。 */
  const synth = (id, effect, cost, extra) => Object.assign({
    id, name: id, cost, kind: "spell", effect, text: "", art: "✧", hero: "苍蓝", rarity: "common",
  }, extra || {});
  { // 神谕壁垒：护甲 = 敌方牌库神罚数
    const { g, a, b } = mk();
    b.deck = [punish(g, "字母"), punish(g, "字母"), punish(g, "字母")];
    const card = g.clone(synth("t_barrier", "diyBarrier", 3), "苍蓝");
    a.hand = [card];
    const r = g.playCard(0, card.uid, [], null);
    check("神谕壁垒：按敌方神罚数获得护甲", r.ok && a.armor === 3, "armor=" + a.armor);
  }
  { // 神罚共鸣：4 张进敌方牌库，2 张进自己
    const { g, a, b } = mk();
    b.deck = []; a.deck = [];
    const card = g.clone(synth("t_echo", "diyEcho", 4), "苍蓝");
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
    const card = g.clone(synth("t_pull", "diyPull", 4), "苍蓝");
    a.hand = [card];
    const atk0 = u.attack, hp0 = u.maxHealth;
    const r = g.playCard(0, card.uid, [u.uid], null);
    const mine = a.board.find(x => x.id === "shadow");
    check("圣光牵引：策反到己方战场", r.ok && !!mine);
    check("圣光牵引：获得 +1/+4", mine && mine.attack === atk0 + 1 && mine.maxHealth === hp0 + 4, mine ? mine.attack + "/" + mine.maxHealth : "-");
  }
  { // 机械眼：回合开始自动开火
    const { g, a, b } = mk();
    const eye = g.clone(Object.assign(synth("t_eye", "diyMechEye", 2), { kind: "unit", atk: 2, hp: 2, taunt: true }), "苍蓝");
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
