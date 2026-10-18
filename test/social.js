/* 好友系统测试：申请 / 同意 / 拒绝 / 删除 / 邀请进房
   只有注册账号（有 uid）才能加好友 */
process.env.PORT = "3941"; process.env.HOST = "127.0.0.1";
const os = require("os"), fs = require("fs"), path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cd-social-"));
const { io } = require("socket.io-client");
const srv = require("../server/index.js");
const URL = "http://127.0.0.1:3941";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x ? "  " + x : "")); };

async function api(p, body) {
  const r = await fetch(URL + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
/* 登录态客户端：收集服务端推来的好友事件 */
function client(name, token, opts) {
  return new Promise((res) => {
    const s = io(URL, { transports: ["websocket"] });
    const got = { requests: [], list: [], presence: [], invites: [], toasts: [], room: null };
    s.on("friend:request-in", (d) => got.requests.push(d));
    s.on("friend:list", (d) => got.list.push(d));
    s.on("friend:presence", (d) => got.presence.push(d));
    s.on("room:invite-in", (d) => got.invites.push(d));
    s.on("toast", (d) => got.toasts.push(d));
    s.on("room", (r) => { got.room = r; });
    s.on("connect", () => {
      s.emit("hello", Object.assign({ clientId: "social-" + name, nick: name, hero: "苏苏", token: token || "" }, opts || {}), (r) => res({ s, got, me: r }));
    });
  });
}
const call = (c, ev, d) => new Promise((r) => c.s.emit(ev, d, r));

(async () => {
  /* 两个注册账号 */
  const ra = await api("/api/auth/register", { user: "alice01", pass: "pass1234", nick: "爱丽丝" });
  const rb = await api("/api/auth/register", { user: "bob01", pass: "pass1234", nick: "鲍勃" });
  check("注册两个账号成功", !!ra.token && !!rb.token, (ra.me && ra.me.nick) + " / " + (rb.me && rb.me.nick));
  const A = await client("爱丽丝", ra.token), B = await client("鲍勃", rb.token);
  await sleep(300);

  /* 1) A 加 B */
  let r = await call(A, "friend:request", { name: "鲍勃" });
  check("A 给 B 发好友申请", r.ok, r.msg);
  await sleep(250);
  check("B 收到 friend:request-in", B.got.requests.length === 1 && B.got.requests[0].from.uid === ra.me.uid, JSON.stringify(B.got.requests[0] && B.got.requests[0].from));

  /* 2) 异常：加自己 / 重复 / 不存在 */
  check("不能加自己", !(await call(A, "friend:request", { name: "爱丽丝" })).ok);
  check("重复申请被拒", !(await call(A, "friend:request", { name: "鲍勃" })).ok);
  check("不存在的昵称被拒", !(await call(A, "friend:request", { name: "查无此人" })).ok);

  /* 3) B 同意 */
  const bl = await call(B, "friend:list", {});
  check("B 的待处理申请里有 A", (bl.requests || []).some((x) => x.uid === ra.me.uid), JSON.stringify((bl.requests || []).map((x) => x.nick)));
  r = await call(B, "friend:accept", { uid: ra.me.uid });
  check("B 同意申请", r.ok, r.msg);
  await sleep(250);
  const al2 = await call(A, "friend:list", {});
  const bl2 = await call(B, "friend:list", {});
  check("双方好友列表都有对方", (al2.friends || []).some((x) => x.uid === rb.me.uid) && (bl2.friends || []).some((x) => x.uid === ra.me.uid),
    JSON.stringify((al2.friends || []).map((x) => x.nick)));
  check("好友带在线状态", (al2.friends || [])[0] && (al2.friends || [])[0].online === true);

  /* 4) 邀请进房：A 建房，A 邀请 B */
  const cr = await new Promise((res) => A.s.emit("room:create", { name: "邀请测试房" }, res));
  check("A 建房成功", cr && cr.ok);
  r = await call(A, "room:invite", { uid: rb.me.uid });
  check("A 邀请 B 进房", r.ok, r.msg);
  await sleep(250);
  check("B 收到 room:invite-in", B.got.invites.length === 1 && /^\d{6}$/.test(B.got.invites[0].code || ""), JSON.stringify(B.got.invites[0]));
  const code = B.got.invites[0].code;
  const joined = await new Promise((res) => B.s.emit("room:join", { code }, res));
  check("B 用邀请码进房", joined && joined.ok, joined && joined.error);
  await sleep(250);
  check("两人在同一房间", A.got.room && A.got.room.seats.filter(Boolean).length === 2);

  /* 5) 删除好友 */
  r = await call(A, "friend:remove", { uid: rb.me.uid });
  check("A 删除好友", r.ok, r.msg);
  await sleep(200);
  const al3 = await call(A, "friend:list", {});
  const bl3 = await call(B, "friend:list", {});
  check("删除后双方列表都清空", (al3.friends || []).length === 0 && (bl3.friends || []).length === 0);

  /* 6) 拒绝申请（等过发申请的限频窗口） */
  await sleep(1700);
  const rq2 = await call(A, "friend:request", { name: "鲍勃" });
  check("A 再次发申请", rq2.ok, rq2.msg);
  await sleep(250);
  r = await call(B, "friend:reject", { uid: ra.me.uid });
  check("B 拒绝申请", r.ok, r.msg);
  const bl4 = await call(B, "friend:list", {});
  check("拒绝后不再有待处理", (bl4.requests || []).length === 0 && (bl4.friends || []).length === 0);

  /* 7) 游客不能加好友 */
  const G = await client("游客", "");
  await sleep(200);
  const gr = await call(G, "friend:request", { name: "鲍勃" });
  check("游客加好友被拒", !gr.ok, gr.msg || gr.error);

  A.s.close(); B.s.close(); G.s.close(); srv.io.close(); srv.server.close();
  const pass = results.every(Boolean);
  console.log(pass ? "SOCIAL TEST PASSED" : "SOCIAL TEST FAILED");
  setTimeout(() => process.exit(pass ? 0 : 1), 200);
})().catch((e) => { console.error(e); try { srv.io.close(); srv.server.close(); } catch (_) {} process.exit(1); });
