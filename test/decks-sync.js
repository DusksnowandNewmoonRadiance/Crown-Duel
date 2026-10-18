/* 卡组云端同步测试：登录后卡组跟账号走；未登录/非法数据的行为 */
const os = require("os"), fs = require("fs"), path = require("path");
process.env.PORT = "3925"; process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cd-decks-"));
require("../server/index.js");
const URL = "http://127.0.0.1:3925";
const api = (m, u, b) => fetch(URL + u, {
  method: m, headers: { "content-type": "application/json" },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };
const deck = (id, hero, name) => ({ id, hero, name, cards: ["red", "red", "redguard"], updatedAt: Date.now() });

(async () => {
  /* 未登录：不报错、不写数据 */
  const anon = await api("GET", "/api/decks");
  check("未登录 GET 返回 ok:false", anon.body.ok === false && anon.body.msg === "未登录");
  const anonPut = await api("PUT", "/api/decks", { decks: { v: 2, list: [], active: {} } });
  check("未登录 PUT 返回 ok:false", anonPut.body.ok === false);

  /* 注册后写入 / 读回 */
  const reg = await api("POST", "/api/auth/register", { user: "deckuser", pass: "pass1234", nick: "卡组测试" });
  check("注册成功并拿到 token", reg.body.ok === true && !!reg.body.token);
  const token = reg.body.token;
  const put = (decks) => api("PUT", "/api/decks?token=" + encodeURIComponent(token), { decks });
  const get = () => api("GET", "/api/decks?token=" + encodeURIComponent(token));

  const w = await put({ v: 2, list: [deck("d1", "苏苏", "卡组一"), deck("d2", "字母", "卡组二")], active: { "苏苏": "d1" } });
  check("写入两个卡组", w.status === 200 && w.body.ok === true && !!w.body.updatedAt, w.body.updatedAt);
  const r = await get();
  const ids = (r.body.decks && r.body.decks.list || []).map((x) => x.id).join(",");
  check("读回内容一致", r.body.ok === true && ids === "d1,d2" && r.body.decks.active["苏苏"] === "d1", ids);

  /* 非法数据 */
  const tooMany = await put({ v: 2, list: Array.from({ length: 31 }, (_, i) => deck("x" + i, "苏苏", "x")), active: {} });
  check("超过 30 个被拒", tooMany.status === 400 && tooMany.body.ok === false);
  const badHero = await put({ v: 2, list: [deck("d3", "不存在的角色", "x")], active: {} });
  check("hero 不存在被拒", badHero.status === 400, badHero.body.msg);
  const badCards = await put({ v: 2, list: [{ id: "d4", hero: "苏苏", name: "x", cards: "nope", updatedAt: 1 }], active: {} });
  check("cards 非数组被拒", badCards.status === 400);
  const badList = await put({ v: 2, list: "nope", active: {} });
  check("list 非数组被拒", badList.status === 400);

  /* 覆盖写（不做服务端合并） */
  await put({ v: 2, list: [deck("d9", "七星", "只剩这个")], active: {} });
  const r2 = await get();
  check("覆盖写后只剩新的", r2.body.decks.list.length === 1 && r2.body.decks.list[0].id === "d9", r2.body.decks.list.length);

  /* 名称清洗与截断 */
  const longName = await put({ v: 2, list: [deck("d10", "苏苏", "一二三四五六七八九十一二三四五六七八九十")], active: {} });
  const r3 = await get();
  check("名称截断到 16 字", longName.body.ok === true && r3.body.decks.list[0].name.length === 16, r3.body.decks.list[0].name.length);

  /* 未登录读不到别人的数据 */
  const other = await api("POST", "/api/auth/register", { user: "deckuser2", pass: "pass1234", nick: "第二人" });
  const otherGet = await api("GET", "/api/decks?token=" + encodeURIComponent(other.body.token));
  check("另一个账号看不到别人的卡组", otherGet.body.ok === true && otherGet.body.decks === null, JSON.stringify(otherGet.body.decks));

  const passed = results.filter(Boolean).length;
  console.log(`\nDECKS SYNC TEST ${passed === results.length ? "PASSED" : "FAILED"} (${passed}/${results.length})`);
  process.exit(passed === results.length ? 0 : 1);
})();
