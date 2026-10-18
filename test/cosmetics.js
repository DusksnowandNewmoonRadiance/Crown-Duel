/* 配饰商店与金币经济测试：注册金币 / 头衔 / 宝箱 / 装备 / 每日首胜 / 段位奖励 */
process.env.PORT = "3925";
process.env.HOST = "127.0.0.1";
const os = require("os"), fs = require("fs"), path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cd-cos-"));
process.env.ADMIN_TOKEN = "test-admin-token-123";
require("../server/index.js");
const Store = require("../server/store.js");
const URL = "http://127.0.0.1:3925";

process.on("unhandledRejection",e=>{console.error("[cosmetics] 未捕获异常:",e);process.exit(1);});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };

async function api(method, url, body, token) {
  const r = await fetch(URL + url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

(async () => {
  // 等服务端 listen（最多 6 秒）
  for (let i = 0; i < 60; i++) {
    try { await fetch(URL + "/healthz"); break; } catch (e) { await sleep(100); }
  }
  // 注册（新账号 20 金币）
  const reg = await api("POST", "/api/auth/register", { user: "cos_u1", pass: "pass1234", nick: "配饰测试" });
  const token = reg.body && reg.body.token;
  const uid = reg.body && reg.body.me && reg.body.me.uid;
  check("注册成功并返回 token", !!token && !!uid);
  const me1 = await api("GET", "/api/me?token=" + token);
  const meObj = me1.body && me1.body.me;
  check("新账号金币 = 20", meObj && meObj.gold === 20, meObj && meObj.gold);
  check("新账号没有配饰", !!(meObj && meObj.cosmetics && meObj.cosmetics.titles.length === 0 && meObj.cosmetics.colors.length === 0));

  // 买「皇冠新兵」20 金币
  const buy1 = await api("POST", "/api/cosmetics/buy?token=" + token, { id: "title_recruit" });
  check("买头衔成功且扣光 20 金币", buy1.body && buy1.body.ok && buy1.body.gold === 0, buy1.body && buy1.body.gold);
  check("头衔进入 inventory", buy1.body && buy1.body.cosmetics && buy1.body.cosmetics.titles.includes("title_recruit"));

  // 重复购买被拒
  const buyAgain = await api("POST", "/api/cosmetics/buy?token=" + token, { id: "title_recruit" });
  check("已拥有的头衔不能重复买", buyAgain.body && !buyAgain.body.ok);

  // 金币不足买将军
  const buy2 = await api("POST", "/api/cosmetics/buy?token=" + token, { id: "title_general" });
  check("金币不足买「皇冠将军」被拒", buy2.body && !buy2.body.ok, buy2.body && buy2.body.msg);
  const me2 = await api("GET", "/api/me?token=" + token);
  check("失败不扣款", me2.body && me2.body.me && me2.body.me.gold === 0, me2.body && me2.body.me && me2.body.me.gold);

  // 充钱买宝箱，开出色卡
  Store.addGold(uid, 2000);
  const chest = await api("POST", "/api/cosmetics/buy?token=" + token, { id: "chest_color" });
  const gotColor = chest.body && chest.body.item && chest.body.item.id;
  check("宝箱开出 7 色之一", !!(chest.body && chest.body.ok && gotColor), gotColor);
  check("颜色进入 inventory", !!(chest.body && chest.body.cosmetics && chest.body.cosmetics.colors.includes(gotColor)));

  // 抽满 7 色后返还 25
  let refunded = 0;
  for (let i = 0; i < 10; i++) {
    const r = await api("POST", "/api/cosmetics/buy?token=" + token, { id: "chest_color" });
    if (r.body && r.body.refund) { refunded = r.body.refund; break; }
  }
  check("颜色抽满后返还 25 金币", refunded === 25, refunded);

  // 装备 / 卸下
  const eq1 = await api("POST", "/api/cosmetics/equip?token=" + token, { kind: "title", value: "title_recruit" });
  check("装备头衔成功", !!(eq1.body && eq1.body.ok && eq1.body.cosmetics.equip.title === "title_recruit"));
  const eq2 = await api("POST", "/api/cosmetics/equip?token=" + token, { kind: "color", value: gotColor });
  check("装备名字颜色成功", !!(eq2.body && eq2.body.ok && eq2.body.cosmetics.equip.color === gotColor));
  const me3 = await api("GET", "/api/me?token=" + token);
  check("/api/me 返回已装备配饰", !!(me3.body && me3.body.me && me3.body.me.cosmetics.equip.title === "title_recruit"));
  const eq3 = await api("POST", "/api/cosmetics/equip?token=" + token, { kind: "title", value: "" });
  check("卸下头衔成功", !!(eq3.body && eq3.body.ok && eq3.body.cosmetics.equip.title === null));

  // 每日首胜
  const d1 = Store.claimDailyWin(uid);
  check("每日首胜第一次给 10 金币", !!(d1 && d1.ok && d1.awarded === 10), d1 && d1.awarded);
  const d2 = Store.claimDailyWin(uid);
  check("同一天第二次不给", !!(d2 && !d2.ok));
  // 模拟隔天
  const u = Store.byToken(token); u.daily.lastWinDate = "2000-01-01";
  const d3 = Store.claimDailyWin(uid);
  check("隔天再给 10 金币", !!(d3 && d3.ok && d3.awarded === 10));

  // 段位奖励（同一分段只发一次）
  const r1 = Store.grantRankReward(uid, 20);
  check("首次进入 20 段给 60 金币", !!(r1 && r1.awarded === 60), r1 && r1.awarded);
  const r2 = Store.grantRankReward(uid, 20);
  check("同一分段不重复发", r2 === null);
  const r3 = Store.grantRankReward(uid, 15);
  check("进入 15 段给 100 金币", !!(r3 && r3.awarded === 100), r3 && r3.awarded);

  // 未登录
  const noAuth = await api("POST", "/api/cosmetics/buy", { id: "title_recruit" });
  check("未登录购买被拒", !!(noAuth.body && !noAuth.body.ok));

  const passed = results.filter(Boolean).length;
  console.log("\nCOSMETICS TEST " + (passed === results.length ? "PASSED" : "FAILED") + " (" + passed + "/" + results.length + ")");
  process.exit(passed === results.length ? 0 : 1);
})();
