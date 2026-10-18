/* 后台玩家管理测试：查人 / 金币 / 段位 / 配饰 / 清空卡组 / 操作审计 */
const os = require("os"), fs = require("fs"), path = require("path");
process.env.PORT = "3951"; process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cd-admin-"));
process.env.ADMIN_TOKEN = "test-admin-token-123";
const srv = require("../server/index.js");
const URL = "http://127.0.0.1:3951";
const TOK = "test-admin-token-123";
const ADMIN = { "content-type": "application/json", "x-admin-token": TOK };
const PLAIN = { "content-type": "application/json" };
const api = (m, u, b, h) => fetch(URL + u, { method: m, headers: h || ADMIN, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };

(async () => {
  const reg = await api("POST", "/api/auth/register", { user: "admin_test_user", pass: "pass123456", nick: "测试玩家" }, PLAIN);
  check("注册测试账号", reg.status === 200 && reg.body.ok === true, reg.body.msg || "");
  const uid = reg.body.me && reg.body.me.uid;
  check("拿到 uid", !!uid, uid);
  const token = reg.body.token;

  /* 鉴权 */
  check("无口令 401", (await api("GET", "/admin/api/users", undefined, PLAIN)).status === 401);

  /* 列表 */
  let r = await api("GET", "/admin/api/users");
  check("列表包含新玩家", r.status === 200 && r.body.users.some((u) => u.uid === uid), r.body.users && r.body.users.length);
  const one = (r.body.users || []).find((u) => u.uid === uid) || {};
  check("列表字段齐全", "gold" in one && "rank" in one && "online" in one && "decks" in one);
  check("新玩家金币 20", one.gold === 20, one.gold);
  check("新玩家段位 25", one.rank === 25, one.rank);

  /* 搜索 */
  r = await api("GET", "/admin/api/users?q=" + encodeURIComponent("测试玩家"));
  check("按昵称搜索命中", (r.body.users || []).some((u) => u.uid === uid), (r.body.users || []).length);

  /* 金币 */
  r = await api("POST", `/admin/api/users/${uid}/gold`, { delta: 100, reason: "测试" });
  check("发金币 +100 → 120", r.status === 200 && r.body.gold === 120, r.body.gold);
  r = await api("POST", `/admin/api/users/${uid}/gold`, { delta: -999999 });
  check("扣成负数被拒", r.status === 400, r.body.error);
  r = await api("POST", `/admin/api/users/${uid}/gold`, { delta: -20 });
  check("扣 20 → 100", r.status === 200 && r.body.gold === 100, r.body.gold);

  /* 段位 */
  r = await api("POST", `/admin/api/users/${uid}/rank`, { seg: 5 });
  check("设段位 5 且清零进度", r.status === 200 && r.body.rank.seg === 5 && r.body.rank.points === 0, JSON.stringify(r.body.rank));
  r = await api("POST", `/admin/api/users/${uid}/rank`, { seg: 99 });
  check("非法段位被拒", r.status === 400, r.body.error);

  /* 配饰 */
  r = await api("POST", `/admin/api/users/${uid}/cosmetics`, { kind: "title", id: "title_general", action: "grant" });
  check("发头衔 title_general", r.status === 200 && r.body.cosmetics.titles.includes("title_general"));
  r = await api("POST", `/admin/api/users/${uid}/cosmetics`, { kind: "title", id: "title_general", action: "revoke" });
  check("收回头衔", r.status === 200 && !r.body.cosmetics.titles.includes("title_general"));
  r = await api("POST", `/admin/api/users/${uid}/cosmetics`, { kind: "color", id: "purple", action: "grant" });
  check("发颜色 purple", r.status === 200 && r.body.cosmetics.colors.includes("purple"));
  r = await api("POST", `/admin/api/users/${uid}/cosmetics`, { kind: "color", id: "nope", action: "grant" });
  check("非法配饰 id 被拒", r.status === 400, r.body.error);

  /* 云端卡组 */
  const decks = { v: 2, list: [{ id: "d1", hero: "苏苏", name: "测试卡组", cards: [], updatedAt: Date.now() }], active: {} };
  r = await api("PUT", "/api/decks?token=" + token, { decks }, PLAIN);
  check("先写入云端卡组", r.status === 200 && r.body.ok === true, r.body.msg || "");
  r = await api("GET", `/admin/api/users/${uid}`);
  check("详情里卡组数 1", r.body.user && r.body.user.decks && r.body.user.decks.count === 1, JSON.stringify(r.body.user && r.body.user.decks));
  r = await api("POST", `/admin/api/users/${uid}/decks/reset`, {});
  check("清空云端卡组", r.status === 200);
  r = await api("GET", `/admin/api/users/${uid}`);
  check("清空后 decks 为 null", r.body.user && r.body.user.decks === null, JSON.stringify(r.body.user && r.body.user.decks));

  /* 审计 */
  r = await api("GET", "/admin/api/logs?limit=50");
  const acts = (r.body.logs || []).map((x) => x.action);
  check("审计含各操作", ["gold", "rank", "cosmetics", "decks-reset"].every((a) => acts.includes(a)), acts.join(","));
  check("审计带 ip 与时间", (r.body.logs || []).every((x) => x.ts && "ip" in x));

  /* 踢下线（该账号当前没有 socket 连接，返回 0 也应成功） */
  r = await api("POST", `/admin/api/users/${uid}/kick`, {});
  check("踢下线接口可用", r.status === 200 && typeof r.body.kicked === "number", r.body.kicked);

  const passed = results.filter(Boolean).length;
  console.log(`\nADMIN USERS TEST ${passed === results.length ? "PASSED" : "FAILED"} (${passed}/${results.length})`);
  try { srv.close && srv.close(); } catch (e) {}
  process.exit(passed === results.length ? 0 : 1);
})();
