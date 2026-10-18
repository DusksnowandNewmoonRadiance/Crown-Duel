/* ============================================================
   段位系统（浏览器与服务器共用）
   规则来自设定集「卡兹帝国 · 段位与 OCC」：段位 1—25，1 最高，共 6 个分段。
   本实现按项目要求把分数门槛大幅压低（原文是两万七千场才能到 1 段）：
     25→20：每段 1 分，输不扣分，胜 +1，3 连胜后每局 +2
     20→15：每段 1 分，输 −1，0 分后连输两次掉段
     15→10：每段 1 分，输不扣分
     10→5 ：每段 2 分，输不扣分
     5→2  ：每段 2 分，输不扣分
     2→1  ：每段 3 分，输不扣分
   合计 34 分；配合连胜加成约 20~25 胜即可到 1 段。1 段封顶，之后输赢不再影响分数。
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DuelRank = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_SEG = 25;   // 起始段位（数字越大越低）
  const MIN_SEG = 1;    // 最高段位

  /* 分段分数表（想调门槛只改这里）
     合计 105 分：按 50% 胜率约 100 胜 / 200 局到 1 段，连胜加成会略快 */
  const RANKS = [
    { max: 25, min: 20, need: 1 },    // 25→20：每段 1 分，共 5
    { max: 20, min: 15, need: 2 },    // 20→15：每段 2 分，共 10
    { max: 15, min: 10, need: 3 },    // 15→10：每段 3 分，共 15
    { max: 10, min: 5,  need: 6 },    // 10→5 ：每段 6 分，共 30
    { max: 5,  min: 2,  need: 10 },   // 5→2  ：每段 10 分，共 30
    { max: 2,  min: 1,  need: 15 },   // 2→1  ：每段 15 分，共 15
  ];
  function need(seg) {
    const b = RANKS.find(x => seg <= x.max && seg > x.min);
    return b ? b.need : 0;
  }
  /* 每场胜利得分：20→15 段要扣分，所以该段胜利给 2 分（输 −1 后仍有净收益） */
  function winGain(seg) { return (seg <= 20 && seg > 15) ? 2 : 1; }
  /* 该段位是否扣分（只有 20→15 这一段扣） */
  function lossDeducts(seg) { return seg <= 20 && seg > 15; }
  /* 该段位是否启用「0 分后连输两次掉段」（同上） */
  function canDemote(seg) { return seg <= 20 && seg > 15; }

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

  /* 结算一场（win: true/false）。返回新 rank + 事件 */
  function applyResult(rank, win) {
    const r = normalize(rank);
    const fromSeg = r.seg;
    let delta = 0, promoted = false, demoted = false, capped = false;

    if (r.seg <= MIN_SEG) {                    // 1 段封顶
      capped = true;
      win ? r.wins++ : r.losses++;
      return { rank: r, delta: 0, from: fromSeg, to: r.seg, promoted: false, demoted: false, capped: true };
    }

    if (win) {
      r.wins++;
      r.lossStreak = 0;
      r.streak = (r.streak || 0) + 1;
      /* 3 连胜后每局 +2（只在 25→20 这一段生效，其余段位固定 +1） */
      delta = winGain(r.seg) + ((r.seg > 20 && r.streak >= 4) ? 1 : 0);   // 25→20 段 3 连胜后每局 +2
      r.points += delta;
      while (r.points >= need(r.seg) && r.seg > MIN_SEG) {
        r.points -= need(r.seg);
        r.seg--;
        promoted = true;
      }
      if (r.seg <= MIN_SEG) { r.seg = MIN_SEG; r.points = 0; }
    } else {
      r.losses++;
      r.streak = 0;
      r.lossStreak = (r.lossStreak || 0) + 1;
      if (lossDeducts(r.seg)) {
        delta = -1;
        if (r.points > 0) {
          r.points -= 1;
        } else if (canDemote(r.seg) && r.lossStreak >= 2) {
          /* 0 分后连输两次：掉一段，分数回满 */
          r.seg = Math.min(MAX_SEG, r.seg + 1);
          r.points = 0;
          r.lossStreak = 0;
          demoted = true;
        }
      }
    }
    return { rank: r, delta, from: fromSeg, to: r.seg, promoted, demoted, capped: false };
  }

  /* 是否计分：快速匹配 + 双方真实账号 + uid 不同 + 分出胜负（服务端判定，客户端伪造无效） */
  function eligible(o){
    o=o||{};
    if(!o.quick)return{ok:false,why:"not-quick"};
    if(!o.uidA||!o.uidB)return{ok:false,why:"guest"};
    if(o.uidA===o.uidB)return{ok:false,why:"same-uid"};
    if(o.winner!==0&&o.winner!==1)return{ok:false,why:"no-winner"};
    return{ok:true,why:""};
  }

  /* UI 摘要：段位数字、本段进度、下一段 */
  function summary(rank) {
    const r = normalize(rank);
    const total = r.wins + r.losses;
    return {
      seg: r.seg,
      label: r.seg + " 段",
      points: r.points,
      need: r.seg > MIN_SEG ? need(r.seg) : 0,
      progress: r.seg > MIN_SEG ? Math.round((r.points / need(r.seg)) * 100) : 100,
      streak: r.streak, wins: r.wins, losses: r.losses,
      winrate: total ? Math.round((r.wins / total) * 100) : 0,
      max: r.seg <= MIN_SEG,
    };
  }

  return { MAX_SEG, MIN_SEG, RANKS, need, winGain, lossDeducts, canDemote, empty, normalize, applyResult, summary, eligible };
});
