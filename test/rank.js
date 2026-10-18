/* 段位测试：1—25 段 / 105 分表 / 连胜加速 / 20→15 掉段 / 1 段封顶 / 只算真人快速匹配 / 升段奖励 */
process.env.PORT = "3931"; process.env.HOST = "127.0.0.1";
const os = require("os"), fs = require("fs"), path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cd-rank-"));
process.env.ADMIN_TOKEN = "test-admin-token-123";
const srv = require("../server/index.js");
const Store = require("../server/store.js");
const Rank = require("../shared/rank.js");

const URL = "http://127.0.0.1:3931";
const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };
async function api(method, url, body) {
  const r = await fetch(URL + url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { }
  return { status: r.status, body: j };
}

(async () => {
  /* ---- 阈值表 ---- */
  let sum = 0; for (let seg = 25; seg > 1; seg--) sum += Rank.need(seg);
  check("六段分数表合计 105 分", sum === 105, sum);
  check("分段门槛 1/2/3/6/10/15", [25, 20, 15, 10, 5, 2].map(Rank.need).join(",") === "1,2,3,6,10,15",
    [25, 20, 15, 10, 5, 2].map(Rank.need).join(","));
  check("升段奖励：24 段 20 金 / 1 段 200 金", Rank.rewardFor(24) === 20 && Rank.rewardFor(1) === 200,
    Rank.rewardFor(24) + "/" + Rank.rewardFor(1));

  /* ---- 25 段起步 ---- */
  const e = Rank.empty();
  check("新玩家从 25 段、0 分起步", e.seg === 25 && e.points === 0, JSON.stringify(e));

  /* ---- 连胜加速 ---- */
  {
    let r = Rank.empty(); const d = [];
    for (let i = 0; i < 5; i++) { const res = Rank.recordResult(r, true); r = res.rank; d.push(res.delta); }
    check("25→20 段 3 连胜后每局 +2", d.join(",") === "1,1,1,2,2", d.join(","));
    check("5 连胜后到 19 段（含加速）", r.seg === 19, r.seg);
  }

  /* ---- 20→15：输 −1，0 分后连输两次掉段 ---- */
  {
    const a = Rank.recordResult(Object.assign(Rank.empty(), { seg: 20, points: 1 }), false);
    check("20→15 段输一场 −1 分", a.rank.points === 0 && a.delta === -1, a.rank.points);
    const b = Rank.recordResult(Object.assign(Rank.empty(), { seg: 20, points: 0, lossStreak: 1 }), false);
    check("0 分后连输两次掉一段", b.rank.seg === 21 && b.demoted === true, b.rank.seg);
    const c = Rank.recordResult(Object.assign(Rank.empty(), { seg: 14, points: 2 }), false);
    check("15 段以上输不扣分", c.rank.points === 2 && c.delta === 0, c.rank.points);
  }

  /* ---- 到 1 段 + 封顶 ---- */
  {
    let r = Rank.empty(), games = 0;
    while (r.seg > 1 && games < 3000) { r = Rank.recordResult(r, games % 2 === 0).rank; games++; }
    check("50% 胜率约 200 局到 1 段", r.seg === 1 && games >= 180 && games <= 220, games + " 局");
    const cap = Rank.recordResult(Object.assign(Rank.empty(), { seg: 1, points: 0 }), true);
    check("1 段封顶：胜利不再加分", cap.capped === true && cap.delta === 0 && cap.rank.seg === 1);
    const cap2 = Rank.recordResult(Object.assign(Rank.empty(), { seg: 1, points: 0 }), false);
    check("1 段封顶：失败也不掉段", cap2.rank.seg === 1 && cap2.delta === 0);
  }

  /* ---- 计分资格 ---- */
  check("房间对局不计分", Rank.eligible({ quick: false, uid: "u1" }).why === "not-quick");
  check("未登录不计分", Rank.eligible({ quick: true, uid: null }).why === "guest");
  check("快速匹配 + 登录才计分", Rank.eligible({ quick: true, uid: "u1" }).ok === true);

  /* ---- 服务端：注册 → 初始 25 段；升段发金币 ---- */
  const reg = await api("POST", "/api/auth/register", { user: "rank_u1", pass: "pass12345", nick: "段位测试" });
  check("注册成功并拿到 token", reg.status === 200 && !!reg.body.token, reg.status);
  const token = reg.body.token;
  const me0 = await api("GET", "/api/me?token=" + token);
  const me = me0.body.me || {};
  check("接口返回初始段位 25 段", me.rank && me.rank.seg === 25 && me.rank.points === 0, JSON.stringify(me.rank));
  const uid = me.uid;
  const gold0 = me.gold || 0;

  const w1 = Store.recordResult(uid, true);
  check("第 1 胜：25 段 → 24 段，奖励 20 金", w1.rank.seg === 24 && w1.promoted === true && w1.reward === 20,
    `seg=${w1.rank.seg} reward=${w1.reward}`);
  const me1 = await api("GET", "/api/me?token=" + token);
  check("金币已到账", ((me1.body.me || {}).gold || 0) === gold0 + 20, `${gold0} → ${(me1.body.me || {}).gold}`);
  const l1 = Store.recordResult(uid, false);
  check("输一场不掉段（24 段输不扣）", l1.rank.seg === 24 && l1.delta === 0, `seg=${l1.rank.seg}`);
  check("未登录（无 uid）不记录", Store.recordResult(null, true) === null && Store.recordResult("", true) === null);

  const passed = results.filter(Boolean).length;
  console.log(`\nRANK TEST ${passed === results.length ? "PASSED" : "FAILED"} (${passed}/${results.length})`);
  process.exit(passed === results.length ? 0 : 1);
})();
