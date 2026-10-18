/* 观战测试：第三人只读、视图延迟 2 回合、不含手牌明细、房主可请离 */
process.env.PORT = "3942"; process.env.HOST = "127.0.0.1";
const os = require("os"), fs = require("fs"), path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cd-spec-"));
const { io } = require("socket.io-client");
const srv = require("../server/index.js");
const URL = "http://127.0.0.1:3942";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x ? "  " + x : "")); };

async function api(p, body) {
  const r = await fetch(URL + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
/* bot:true 的客户端会自动 mulligan / 结束回合，用来把对局推起来 */
function client(name, token, bot) {
  return new Promise((res) => {
    const s = io(URL, { transports: ["websocket"] });
    const c = { s, name, views: [], room: null, kicked: null, gameCount: 0 };
    s.on("game", (u) => {
      c.views.push(u);
      c.gameCount++;
      if (!bot || !u || !u.view) return;
      const v = u.view;
      if (v.pending) { s.emit("game:action", { type: "pick", index: 0 }, () => {}); return; }
      if (v.phase === "mulligan" && v.mulligan && !v.mulligan.done) { s.emit("game:action", { type: "mulligan", uids: [] }, () => {}); return; }
      if (v.phase === "play" && v.myTurn) setTimeout(() => s.emit("game:action", { type: "end" }, () => {}), 120);
    });
    s.on("room", (r) => { c.room = r; });
    s.on("kicked", (d) => { c.kicked = d; });
    s.on("connect", () => {
      s.emit("hello", { clientId: "spec-" + name, nick: name, hero: "苏苏", token: token || "" }, (r) => { c.id = r.id; res(c); });
    });
  });
}
const call = (c, ev, d) => new Promise((r) => c.s.emit(ev, d, r));

(async () => {
  const ra = await api("/api/auth/register", { user: "specA", pass: "pass1234", nick: "甲" });
  const rb = await api("/api/auth/register", { user: "specB", pass: "pass1234", nick: "乙" });
  const A = await client("甲", ra.token, true);
  const B = await client("乙", rb.token, true);
  const C = await client("观众", "", false);
  await sleep(300);

  /* 开局：A 建房，B 加入，双方准备 */
  const cr = await new Promise((res) => A.s.emit("room:create", { name: "观战测试房" }, res));
  check("A 建房", cr && cr.ok);
  const code = cr.code || (A.room && A.room.code);
  const jn = await new Promise((res) => B.s.emit("room:join", { code }, res));
  check("B 加入房间", jn && jn.ok, jn && jn.error);
  A.s.emit("room:ready", true);   // room:ready 没有回调，直接发
  B.s.emit("room:ready", true);
  await sleep(4200);   // 倒计时 3 秒 + 余量
  check("对局已开始", A.gameCount > 0 && B.gameCount > 0, `A=${A.gameCount} B=${B.gameCount}`);

  /* 观战 */
  const sp = await call(C, "room:spectate", { code });
  check("第三人观战成功", sp.ok, sp.error);
  await sleep(600);
  check("观战者收到房间视图且标记 spectate", !!C.room && C.room.spectate === true);
  check("观战者收到对局视图", C.gameCount > 0, "views=" + C.gameCount);
  const v = C.views[C.views.length - 1];
  check("观战视图标记 spectate", !!v && v.spectate === true);
  const myHand = v && v.view && v.view.me && v.view.me.hand;
  check("观战视图不含手牌明细（全是背面）", Array.isArray(myHand) && myHand.every((x) => x.back === true), JSON.stringify((myHand || []).slice(0, 2)));
  const foeHand = v && v.view && v.view.foe && v.view.foe.hand;
  check("对手手牌也是背面", Array.isArray(foeHand) && foeHand.every((x) => x.back === true));

  /* 只读 */
  const act = await call(C, "game:action", { type: "end" });
  check("观战者不能操作", !act.ok && /观战/.test(act.error || ""), act.error);

  /* 延迟 2 回合 */
  await sleep(4000);
  const aTurn = A.views[A.views.length - 1].view.turn;
  const cTurn = C.views[C.views.length - 1].view.turn;
  check("观战视图落后至少 2 回合", aTurn - cTurn >= 2, `玩家 turn=${aTurn} 观战 turn=${cTurn}`);

  /* 房主请离 */
  const kick = await call(A, "room:kickSpectator", { uid: C.id });
  check("房主可以请离观战者", kick.ok, kick.error);
  await sleep(300);
  check("被请离的观战者收到 kicked", !!C.kicked, C.kicked && C.kicked.reason);
  const before = C.gameCount;
  await sleep(1200);
  check("请离后不再收到对局视图", C.gameCount === before, `${before} -> ${C.gameCount}`);

  A.s.close(); B.s.close(); C.s.close(); srv.io.close(); srv.server.close();
  const pass = results.every(Boolean);
  console.log(pass ? "SPECTATE TEST PASSED" : "SPECTATE TEST FAILED");
  setTimeout(() => process.exit(pass ? 0 : 1), 200);
})().catch((e) => { console.error(e); try { srv.io.close(); srv.server.close(); } catch (_) {} process.exit(1); });
