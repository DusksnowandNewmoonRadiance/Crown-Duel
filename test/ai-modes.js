/* AI 卡组流派测试：同一英雄两套预设 → 两套打法
   白俄罗斯铁壁：叠甲、解场、安全才开钢铁洪流
   星联邦流：叠血（抽牌回血）、解场、保护观察者
   抢血英雄（核弹/八幡）不能被带偏 */
const C = require("../shared/cards.js");
const E = require("../shared/engine.js");
const { AIPlayer, deckMode } = require("../shared/ai.js");

const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };

/* ---- 卡组流派识别 ---- */
{
  check("苏苏·白俄罗斯铁壁 → blr", deckMode({ deck: C.presetDeck("苏苏", "白俄罗斯铁壁") }) === "blr");
  check("苏苏·俄布海 → 普通", deckMode({ deck: C.presetDeck("苏苏", "俄布海") }) === "");
  check("七星·星联邦流 → federation", deckMode({ deck: C.presetDeck("七星", "星联邦流") }) === "federation");
  check("七星·衰减流 → 普通", deckMode({ deck: C.presetDeck("七星", "衰减流") }) === "");
  check("核弹默认卡组 → 普通", deckMode({ deck: C.defaultDeck("核弹") }) === "");
}

/* ---- 构造场面 ---- */
function mkGame(hero, deck, oppHero) {
  const g = new E.Game({ players: [{ name: "甲", hero, deck }, { name: "乙", hero: oppHero }], first: 0 });
  g.mulligan(0, []); g.mulligan(1, []);
  if (g.pending && g.pending.pi === 0) g.resolvePending(0, g.pending.auto);
  const a = g.players[0], b = g.players[1];
  a.board = []; b.board = [];
  return { g, a, b };
}
function put(g, p, hero, id, atkLeft) {
  const u = g.clone(C.cardDef(hero, id), hero);
  u.fresh = false; u.atkLeft = atkLeft === undefined ? 1 : atkLeft;
  p.board.push(u);
  return u;
}

/* ---- 白俄罗斯铁壁：能解场就不抢血 ---- */
{
  const { g, a, b } = mkGame("苏苏", C.presetDeck("苏苏", "白俄罗斯铁壁"), "字母");
  const mine = put(g, a, "苏苏", "redheavy");     // 4/5
  const foe = put(g, b, "字母", "shadow");        // 3/1
  a.hp = 30; b.hp = 30;
  const ai = new AIPlayer("normal");
  const mv = ai.chooseAttack(a, b);
  check("白俄罗斯：优先解场而不是打脸", mv && mv.target && mv.target.uid === foe.uid,
    mv ? (mv.target ? "打 " + mv.target.id : "打脸") : "不攻击");
  check("白俄罗斯：单位本身没被跳过", !!mine);
}

/* ---- 白俄罗斯：没场面压力时才开钢铁洪流 ---- */
{
  const mkState = (hp, threats) => {
    const { g, a, b } = mkGame("苏苏", C.presetDeck("苏苏", "白俄罗斯铁壁"), "字母");
    a.hp = hp; a.energy = a.maxEnergy = 10; a.board = [];
    if (threats) { put(g, b, "字母", "commando"); put(g, b, "字母", "shadow"); }
    const card = g.clone(C.cardDef("苏苏", "blrSteelTide"), "苏苏");
    a.hand = [card];
    const ai = new AIPlayer("normal");
    const act = ai.next(g, 0);
    return { act, card };
  };
  const safe = mkState(26, false);
  check("钢铁洪流：血量健康且场面安全时 AI 会开", safe.act.type === "play" && safe.act.uid === safe.card.uid, safe.act.type);
  const risky = mkState(8, true);
  check("钢铁洪流：残血且被压时 AI 不会开", !(risky.act.type === "play" && risky.act.uid === risky.card.uid), risky.act.type);
}

/* ---- 星联邦流：保护彗星观察者、优先解场 ---- */
{
  const { g, a, b } = mkGame("七星", C.presetDeck("七星", "星联邦流"), "字母");
  const watcher = put(g, a, "七星", "cometWatcher");   // 1/3 回血引擎
  const big = put(g, a, "七星", "sentinel");           // 3/4
  const foe = put(g, b, "字母", "shadow");             // 3/1
  a.hp = 28; b.hp = 30;
  const ai = new AIPlayer("normal");
  const mv = ai.chooseAttack(a, b);
  check("星联邦：优先解场", mv && mv.target && mv.target.uid === foe.uid, mv ? (mv.target ? "打 " + mv.target.id : "打脸") : "不攻击");
  check("星联邦：不用彗星观察者去换怪", mv && mv.unit && mv.unit.id !== "cometWatcher", mv && mv.unit ? mv.unit.id : "-");
  check("星联邦：观察者留在场上", !!watcher && watcher.health > 0 && !!big);
}

/* ---- 抢血英雄不受影响：核弹仍然打脸 ---- */
{
  const { g, a, b } = mkGame("核弹", C.defaultDeck("核弹"), "苏苏");
  const nukeUnit = C.PROFILES["核弹"].cards.find(c => c.kind === "unit").id;
  put(g, a, "核弹", nukeUnit);
  put(g, b, "苏苏", "red");     // 2/2
  a.hp = 30; b.hp = 30;
  const ai = new AIPlayer("normal");
  const mv = ai.chooseAttack(a, b);
  check("核弹（抢血）：仍然优先打脸", mv && !mv.target, mv ? (mv.target ? "打 " + mv.target.id : "打脸") : "不攻击");
}

const passed = results.filter(Boolean).length;
console.log(`\nAI MODES TEST ${passed === results.length ? "PASSED" : "FAILED"} (${passed}/${results.length})`);
if (passed !== results.length) process.exitCode = 1;
