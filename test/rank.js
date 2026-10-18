/* 段位系统测试：25 段起步 / 连胜加速 / 20→15 掉段 / 105 分到 1 段 / 1 段封顶 */
const Rank = require("../shared/rank.js");

const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };

/* ---- 起步 ---- */
const start = Rank.empty();
check("新玩家从 25 段起步", start.seg === 25 && start.points === 0, JSON.stringify(start));
check("六段分数表合计 105 分", (() => { let s = 0; for (let seg = 25; seg > 1; seg--) s += Rank.need(seg); return s === 105; })(),
  (() => { let s = 0; for (let seg = 25; seg > 1; seg--) s += Rank.need(seg); return s; })());
check("分段门槛：25→20=1 / 20→15=2 / 15→10=3 / 10→5=6 / 5→2=10 / 2→1=15",
  [25, 20, 15, 10, 5, 2].map(Rank.need).join(",") === "1,2,3,6,10,15", [25, 20, 15, 10, 5, 2].map(Rank.need).join(","));

/* ---- 连胜加速：25→20 段 3 连胜后每局 +2 ---- */
{
  let r = Rank.empty();
  const d = [];
  for (let i = 0; i < 5; i++) { const res = Rank.applyResult(r, true); r = res.rank; d.push(res.delta); }
  check("3 连胜后每局 +2", d.join(",") === "1,1,1,2,2", d.join(","));
  check("5 连胜（含加速）把 25 段推到 19 段", r.seg === 19, r.seg);
}

/* ---- 20→15 段：输 −1；0 分后连输两次掉段 ---- */
{
  let r = Object.assign(Rank.empty(), { seg: 20, points: 1, streak: 0, lossStreak: 0 });
  const res = Rank.applyResult(r, false);
  check("20→15 段输一场 −1 分", res.rank.points === 0 && res.delta === -1, res.rank.points);
  let r2 = Object.assign(Rank.empty(), { seg: 20, points: 0, lossStreak: 1 });
  const res2 = Rank.applyResult(r2, false);
  check("0 分后连输两次掉一段", res2.rank.seg === 21 && res2.demoted === true, res2.rank.seg);
  let r3 = Object.assign(Rank.empty(), { seg: 14, points: 2 });
  const res3 = Rank.applyResult(r3, false);
  check("15 段以上（14 段）输不扣分", res3.rank.points === 2 && res3.delta === 0, res3.rank.points);
}

/* ---- 到 1 段与封顶 ---- */
{
  let r = Rank.empty(), games = 0, wins = 0;
  while (r.seg > 1 && games < 2000) { const win = games % 2 === 0; if (win) wins++; r = Rank.applyResult(r, win).rank; games++; }
  check("50% 胜率约 200 局到 1 段", r.seg === 1 && games >= 180 && games <= 220, games + " 局 / " + wins + " 胜");
  const cap = Rank.applyResult(Object.assign(Rank.empty(), { seg: 1, points: 0 }), true);
  check("1 段封顶，胜利不再加分", cap.capped === true && cap.delta === 0 && cap.rank.seg === 1);
  const cap2 = Rank.applyResult(Object.assign(Rank.empty(), { seg: 1, points: 0 }), false);
  check("1 段封顶，失败也不掉段", cap2.rank.seg === 1 && cap2.delta === 0);
}

/* ---- 计分资格（服务端判定）：只有「快速匹配 + 双方登录 + uid 不同 + 有胜负」才记 ---- */
{
  const E = Rank.eligible;
  check("两个登录账号快速匹配 → 计分", E({ quick: true, uidA: "u1", uidB: "u2", winner: 0 }).ok === true);
  check("一方未登录 → 双方都不计", E({ quick: true, uidA: "u1", uidB: null, winner: 0 }).ok === false &&
    E({ quick: true, uidA: "u1", uidB: null, winner: 0 }).why === "guest");
  check("同一账号两边（自己匹配自己）→ 不计", E({ quick: true, uidA: "u1", uidB: "u1", winner: 1 }).why === "same-uid");
  check("房间对局 / 剧情 / 单人 → 不计", E({ quick: false, uidA: "u1", uidB: "u2", winner: 1 }).why === "not-quick");
  check("平局（无胜负）→ 不计", E({ quick: true, uidA: "u1", uidB: "u2", winner: "draw" }).why === "no-winner");
}
/* ---- 摘要 ---- */
{
  const s = Rank.summary({ seg: 12, points: 1, wins: 30, losses: 20, streak: 2 });
  check("摘要：12 段 / 本段 1/3 分 / 胜率 60%", s.label === "12 段" && s.points === 1 && s.need === 3 && s.winrate === 60,
    `${s.label} ${s.points}/${s.need} ${s.winrate}%`);
}

const passed = results.filter(Boolean).length;
console.log(`\nRANK TEST ${passed === results.length ? "PASSED" : "FAILED"} (${passed}/${results.length})`);
if (passed !== results.length) process.exitCode = 1;
