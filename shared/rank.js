/* ============================================================
   段位系统（浏览器与服务器共用）
   规则来自设定集「卡兹帝国 · 段位与 OCC」：段位 1—25（1 最高），六个分段。
   按项目要求把分数门槛大幅压低（原文要两万七千场才能到 1 段），合计 105 分：
     25→20：每段 1 分，输不扣，胜 +1，3 连胜后每局 +2
     20→15：每段 2 分，输 −1（该段胜利 +2 抵消），0 分后连输两次掉段
     15→10：每段 3 分，输不扣
     10→5 ：每段 6 分，输不扣
     5→2  ：每段 10 分，输不扣
     2→1  ：每段 15 分，输不扣
   1 段封顶。只算「快速匹配 + 本人登录」的对局，客户端伪造无效。
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DuelRank = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_SEG = 25;
  const MIN_SEG = 1;

  /* 分段分数表（想调门槛只改这里）：max/min 为段位区间，need 为每段所需分数 */
  const RANKS = [
    { max: 25, min: 20, need: 1 },
    { max: 20, min: 15, need: 2 },
    { max: 15, min: 10, need: 3 },
    { max: 10, min: 5, need: 6 },
    { max: 5, min: 2, need: 10 },
    { max: 2, min: 1, need: 15 },
  ];

  /* 升段金币奖励（按「升到哪一段」给）：低段少、高段多 */
  function rewardFor(seg) {
    if (seg > 20) return 20;
    if (seg > 15) return 30;
    if (seg > 10) return 40;
    if (seg > 5) return 60;
    if (seg > 2) return 100;
    return 200;
  }

  function need(seg) {
    const b = RANKS.find(x => seg <= x.max && seg > x.min);
    return b ? b.need : 0;
  }
  function winGain(seg) { return (seg <= 20 && seg > 15) ? 2 : 1; }
  function lossDeducts(seg) { return seg <= 20 && seg > 15; }

  function empty() { return { seg: MAX_SEG, points: 0, streak: 0, wins: 0, losses: 0, lossStreak: 0 }; }
  function normalize(rank) {
    const r = Object.assign(empty(), rank || {});
    r.seg = Math.min(MAX_SEG, Math.max(MIN_SEG, r.seg | 0 || MAX_SEG));
    r.points = Math.max(0, r.points | 0);
    r.streak = Math.max(0, r.streak | 0);
    r.lossStreak = Math.max(0, r.lossStreak | 0);
    r.wins = Math.max(0, r.wins | 0);
    r.losses = Math.max(0, r.losses | 0);
    return r;
  }

  /* 结算一场：返回 { rank, delta, from, to, promoted, demoted, capped, reward } */
  function recordResult(rank, win) {
    const r = normalize(rank);
    const from = r.seg;
    let delta = 0, promoted = false, demoted = false, capped = false, reward = 0;

    if (r.seg <= MIN_SEG) {
      win ? r.wins++ : r.losses++;
      return { rank: r, delta: 0, from, to: r.seg, promoted: false, demoted: false, capped: true, reward: 0 };
    }

    if (win) {
      r.wins++;
      r.lossStreak = 0;
      r.streak = (r.streak || 0) + 1;
      delta = winGain(r.seg) + ((r.seg > 20 && r.streak >= 4) ? 1 : 0);
      r.points += delta;
      while (r.points >= need(r.seg) && r.seg > MIN_SEG) {
        r.points -= need(r.seg);
        r.seg--;
        promoted = true;
        reward += rewardFor(r.seg);
      }
      if (r.seg <= MIN_SEG) { r.seg = MIN_SEG; r.points = 0; }
    } else {
      r.losses++;
      r.streak = 0;
      r.lossStreak = (r.lossStreak || 0) + 1;
      if (lossDeducts(r.seg)) {
        delta = -1;
        if (r.points > 0) r.points -= 1;
        else if (r.lossStreak >= 2) {
          r.seg = Math.min(MAX_SEG, r.seg + 1);
          r.points = 0; r.lossStreak = 0; demoted = true;
        }
      }
    }
    return { rank: r, delta, from, to: r.seg, promoted, demoted, capped, reward };
  }

  /* 计分资格：只有快速匹配 + 本人登录（服务端判定） */
  function eligible(o) {
    o = o || {};
    if (!o.quick) return { ok: false, why: "not-quick" };
    if (!o.uid) return { ok: false, why: "guest" };
    return { ok: true, why: "" };
  }

  /* UI 摘要 */
  function summary(rank) {
    const r = normalize(rank);
    const total = r.wins + r.losses;
    return {
      seg: r.seg, label: r.seg + " 段", points: r.points,
      need: r.seg > MIN_SEG ? need(r.seg) : 0,
      progress: r.seg > MIN_SEG ? Math.round((r.points / need(r.seg)) * 100) : 100,
      streak: r.streak, wins: r.wins, losses: r.losses,
      winrate: total ? Math.round((r.wins / total) * 100) : 0,
      max: r.seg <= MIN_SEG,
      hint: r.seg > MIN_SEG ? `本段 ${r.points}/${need(r.seg)} 分` : "已达最高段位",
    };
  }

  return { MAX_SEG, MIN_SEG, RANKS, need, winGain, lossDeducts, rewardFor, empty, normalize, recordResult, eligible, summary };
});
