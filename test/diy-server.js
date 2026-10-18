/* DIY 角色服务端测试：目录 / 列表 / 详情 / 上传 / 持久化 / 池分离 / 删除权限 */
process.env.PORT = "3922"; process.env.HOST = "127.0.0.1";
process.env.ADMIN_TOKEN = "test-admin-token-123";   // 后台 DIY 管理用固定口令
const os = require("os"), fs = require("fs"), path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cd-diy-"));
const { io } = require("socket.io-client");
const srv = require("../server/index.js");
const Diy = require("../shared/diy.js");
const URL = "http://127.0.0.1:3922";
const OWNER = "diy-test-owner-01";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, x) => { results.push(!!ok); console.log((ok ? "✔ " : "✘ ") + n + (x !== undefined ? "  " + x : "")); };

async function api(method, url, body, headers) {
  const r = await fetch(URL + url, {
    method,
    headers: Object.assign({ "content-type": "application/json", "x-diy-owner": OWNER }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  return { status: r.status, body: data };
}

/* 一个测试用角色：10 种卡、携带上限合计 40 */
const heroDef = {
  schema: 1, name: "测试机师", faction: "测试工坊", style: "接口测试用角色", hp: 30, color: "#ff8800",
  cards: [
    { id: "t_recruit", name: "测试·新兵", cost: 1, kind: "unit", atk: 2, hp: 2, n: 2, limit: 4 },
    { id: "t_guard", name: "测试·守卫", cost: 2, kind: "unit", atk: 1, hp: 4, taunt: true, n: 2, limit: 4 },
    { id: "t_knight", name: "测试·骑士", cost: 3, kind: "unit", atk: 3, hp: 3, charge: true, n: 2, limit: 4 },
    { id: "t_titan", name: "测试·巨像", cost: 6, kind: "unit", atk: 8, hp: 8, n: 1, limit: 4 },
    { id: "t_bolt", name: "测试·闪电", cost: 2, kind: "spell", effect: "damage5", n: 2, limit: 4 },
    { id: "t_heal", name: "测试·愈合", cost: 1, kind: "spell", effect: "heal2", n: 2, limit: 4 },
    { id: "t_draw", name: "测试·推演", cost: 1, kind: "spell", effect: "draw2", n: 2, limit: 4 },
    { id: "t_aoe", name: "测试·清扫", cost: 4, kind: "spell", effect: "aoe2", n: 1, limit: 4 },
    { id: "t_armor", name: "测试·装甲", cost: 2, kind: "spell", effect: "armor2", n: 1, limit: 4 },
    { id: "t_buff", name: "测试·战意", cost: 3, kind: "spell", effect: "buffAll1", n: 1, limit: 4 },
  ],
};

function client(name, cid, hero, deck) {
  return new Promise((res) => {
    const s = io(URL, { transports: ["websocket"], forceNew: true });
    const c = { s, games: [], rooms: [], toasts: [], diy: [], status: [] };
    s.on("game", (m) => c.games.push(m));
    s.on("room", (m) => c.rooms.push(m));
    s.on("toast", (m) => c.toasts.push(m));
    s.on("diy:list", (m) => c.diy.push(m));
    s.on("match:status", (m) => c.status.push(m));
    s.on("connect", () => s.emit("hello", { clientId: cid, nick: name, hero, deck }, (r) => res(Object.assign(c, { hello: r }))));
  });
}
const emit = (c, ev, d) => new Promise((r) => { const t = setTimeout(() => r({ timeout: true }), 5000); c.s.emit(ev, d, (x) => { clearTimeout(t); r(x); }); });
const waitEvent = (c, ev, pred, ms) => new Promise((res) => {
  const t = setTimeout(() => { c.s.off(ev, h); res(null); }, ms || 6000);
  const h = (m) => { if (!pred || pred(m)) { clearTimeout(t); c.s.off(ev, h); res(m); } };
  c.s.on(ev, h);
});
const last = (arr) => arr[arr.length - 1];

(async () => {
  /* ---------- 1) 只读接口 ---------- */
  const cat = await api("GET", "/api/diy/catalog");
  check("catalog 返回 31 条机制", cat.status === 200 && cat.body.catalog.length === 31, cat.body && cat.body.catalog.length);
  check("catalog 带总量限制", !!(cat.body && cat.body.limits && cat.body.limits.heroes === 200), cat.body && cat.body.limits.heroes);

  const list = await api("GET", "/api/diy/heroes");
  const canglan = list.body && list.body.heroes.find((h) => h.name === "苍蓝");
  check("列表含内置苍蓝且 builtin=true", !!canglan && canglan.builtin === true, canglan && JSON.stringify({ hp: canglan.hp, cards: canglan.cards }));
  check("列表只给摘要（cards 是数量不是卡表）", !!canglan && typeof canglan.cards === "number" && !Array.isArray(canglan.cards), canglan && typeof canglan.cards);

  const detail = await api("GET", "/api/diy/heroes/" + encodeURIComponent("苍蓝"));
  check("详情返回 41 张卡（作者原版）", detail.status === 200 && detail.body.hero.cards.length === 41, detail.body && detail.body.hero.cards.length);
  check("详情 meta 标注内置", !!(detail.body && detail.body.meta && detail.body.meta.builtin === true && detail.body.meta.author === "官方示例"));
  check("不存在的角色 404", (await api("GET", "/api/diy/heroes/" + encodeURIComponent("没有这个角色"))).status === 404);

  /* ---------- 2) 上传 / 重复 / 非法 ---------- */
  const A = await client("甲", "diy-test-alpha-01", "苏苏");
  const up = await api("POST", "/api/diy/heroes", { hero: heroDef, author: "测试员" });
  check("上传合法角色成功", up.status === 200 && up.body.ok === true && up.body.name === "测试机师", up.status + " " + (up.body && (up.body.error || up.body.name)));
  check("上传返回可认领的 owner", !!(up.body && up.body.owner === OWNER), up.body && up.body.owner);

  const dup = await api("POST", "/api/diy/heroes", { hero: heroDef });
  check("同名再传返回 409", dup.status === 409, dup.status + " " + (dup.body && dup.body.error));

  const badDef = JSON.parse(JSON.stringify(heroDef));
  badDef.name = "坏角色"; badDef.cards[0].effect = "whiteFinal";
  const bad = await api("POST", "/api/diy/heroes", { hero: badDef });
  check("非法定义返回 400 且带 errors", bad.status === 400 && Array.isArray(bad.body.errors) && bad.body.errors.length > 0, bad.body && (bad.body.errors || [])[0]);

  /* 上传成功后广播 diy:list（hello 回包也带 diyHeroes） */
  check("上传后广播 diy:list", A.diy.some((m) => (m.heroes || []).some((h) => h.name === "测试机师")));
  check("hello 回包带 diyHeroes", Array.isArray(A.hello.diyHeroes) && A.hello.diyHeroes.some((h) => h.name === "苍蓝"));

  /* ---------- 2b) 覆盖更新 PUT：只有作者本人能改 ---------- */
  const beforeMeta = (await api("GET", "/api/diy/heroes/" + encodeURIComponent("测试机师"))).body.meta;
  const patched = JSON.parse(JSON.stringify(heroDef));
  patched.hp = 34;
  const putOk = await api("PUT", "/api/diy/heroes/" + encodeURIComponent("测试机师"), { hero: patched, author: "测试员" });
  check("本人 PUT 覆盖成功", putOk.status === 200 && putOk.body.ok === true && putOk.body.updated === true, putOk.status + " " + JSON.stringify(putOk.body));
  const afterPut = await api("GET", "/api/diy/heroes/" + encodeURIComponent("测试机师"));
  check("PUT 后详情变化（血量 30→34）", afterPut.status === 200 && afterPut.body.hero.hp === 34, afterPut.body && afterPut.body.hero.hp);
  check("PUT 后广播 diy:list 带新血量", A.diy.some((m) => (m.heroes || []).some((h) => h.name === "测试机师" && h.hp === 34)));

  const putOther = await api("PUT", "/api/diy/heroes/" + encodeURIComponent("测试机师"), { hero: patched }, { "x-diy-owner": "someone-else-9999" });
  check("别人的角色 PUT 403", putOther.status === 403, putOther.status + " " + (putOther.body && putOther.body.error));

  const builtinDef = JSON.parse(JSON.stringify(detail.body.hero));
  builtinDef.hp = 40;
  const putBuiltin = await api("PUT", "/api/diy/heroes/" + encodeURIComponent("苍蓝"), { hero: builtinDef });
  check("内置角色 PUT 403", putBuiltin.status === 403, putBuiltin.status + " " + (putBuiltin.body && putBuiltin.body.error));

  const renamed = JSON.parse(JSON.stringify(patched));
  renamed.name = "测试机师2";
  const putRename = await api("PUT", "/api/diy/heroes/" + encodeURIComponent("测试机师"), { hero: renamed });
  check("PUT 改名被拒绝 400", putRename.status === 400 && Array.isArray(putRename.body.errors), putRename.status + " " + (putRename.body && (putRename.body.errors || [])[0]));

  /* ---------- 3) 持久化 ---------- */
  const file = path.join(process.env.DATA_DIR, "diy-heroes.json");
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  const entry = saved.heroes.find((e) => e.def && e.def.name === "测试机师");
  check("落盘文件结构 v=1 + heroes[]", saved.v === 1 && Array.isArray(saved.heroes), "v=" + saved.v + " heroes=" + saved.heroes.length);
  check("落盘内容含完整定义与作者", !!entry && entry.def.cards.length === 10 && entry.author === "测试员" && !!entry.createdAt, entry && entry.author);
  check("PUT 后落盘是新数值且保留 createdAt（重启也会是新版本）",
    !!entry && entry.def.hp === 34 && entry.createdAt === beforeMeta.createdAt && entry.updatedAt >= entry.createdAt,
    entry && `hp=${entry.def.hp} created=${entry.createdAt === beforeMeta.createdAt} updated=${entry.updatedAt >= entry.createdAt}`);
  check("内存注册表与文件一致", Diy.isDiy("测试机师") && Diy.list().length === saved.heroes.length + 1, Diy.list().map((x) => x.name).join(","));

  /* ---------- 3b) 真重启 + 坏数据容错：另起一个进程读同一个 DATA_DIR ---------- */
  const rawFile = JSON.parse(fs.readFileSync(file, "utf8"));
  rawFile.heroes.push({ def: { name: "坏数据", cards: [] } });   // 校验不过的一条
  rawFile.heroes.push(null);                                     // 垃圾条目
  fs.writeFileSync(file, JSON.stringify(rawFile, null, 2));
  const { spawn } = require("child_process");
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "index.js")],
    { env: Object.assign({}, process.env, { PORT: "3923" }), cwd: path.join(__dirname, ".."), stdio: "ignore" });
  let rebooted = null;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    try {
      const r = await fetch("http://127.0.0.1:3923/api/diy/heroes");
      if (r.ok) { rebooted = (await r.json()).heroes || []; break; }
    } catch (e) { /* 还没起来 */ }
  }
  child.kill();
  check("坏数据不会让服务器起不来（重启后照常服务）",
    Array.isArray(rebooted) && rebooted.some((h) => h.name === "测试机师") && rebooted.some((h) => h.name === "苍蓝"),
    rebooted && rebooted.map((h) => h.name).join(","));
  check("坏数据被跳过，没进注册表", Array.isArray(rebooted) && !rebooted.some((h) => h.name === "坏数据"));

  /* ---------- 4) 池分离：vanilla 房间拒绝 DIY 角色 ---------- */
  const B = await client("乙", "diy-test-beta-01", "苍蓝");
  check("大厅里可以先选 DIY 角色（还没进房间）", !!(B.hello && B.hello.ok === true), B.hello && B.hello.error);
  const created = await emit(A, "room:create", { name: "普通房" });
  await sleep(120);
  const vanilla = last(A.rooms);
  check("建房默认 pool=vanilla", created.ok === true && !!vanilla && vanilla.pool === "vanilla", vanilla && vanilla.pool);

  const refused = await emit(B, "room:join", { id: vanilla.id });
  check("DIY 角色进普通房被拒绝", !refused.ok && /DIY 角色/.test(refused.error || ""), refused.error);

  A.s.emit("profile", { hero: "苍蓝" });
  const toast = await waitEvent(A, "toast", (m) => /DIY 角色/.test(m.text || ""), 2500);
  check("普通房内换成 DIY 角色被拒绝并提示", !!toast, toast && toast.text);

  /* 普通房仍能用原版角色正常开局 */
  B.s.emit("profile", { hero: "苏苏" });
  await sleep(120);
  check("乙改回原版角色后可以进房", (await emit(B, "room:join", { id: vanilla.id })).ok === true);
  A.s.emit("room:ready", true); B.s.emit("room:ready", true);
  const vanillaGame = await waitEvent(A, "game", () => true, 7000);
  check("普通房原版角色能正常开局", !!vanillaGame && !!vanillaGame.view && !!vanillaGame.view.phase, vanillaGame && vanillaGame.view.phase);

  /* ---------- 5) DIY 房间：苍蓝可以开局 ---------- */
  const C = await client("丙", "diy-test-gamma-01", "苍蓝");
  const D = await client("丁", "diy-test-delta-01", "苍蓝");
  const badPool = await emit(D, "room:create", { pool: "hack" });
  check("非法 pool 被拒绝", !badPool.ok && /房间类型/.test(badPool.error || ""), badPool.error);
  const created2 = await emit(C, "room:create", { name: "DIY 房", pool: "diy" });
  await sleep(120);
  const diyRoom = last(C.rooms);
  check("建房 pool=diy", created2.ok === true && !!diyRoom && diyRoom.pool === "diy", diyRoom && diyRoom.pool);
  check("DIY 角色可以进 DIY 房", (await emit(D, "room:join", { id: diyRoom.id })).ok === true);
  C.s.emit("room:ready", true); D.s.emit("room:ready", true);
  const diyGame = await waitEvent(C, "game", () => true, 7000);
  check("DIY 房用苍蓝能进入对局", !!diyGame && !!diyGame.view && diyGame.view.phase !== "waiting", diyGame && diyGame.view.phase);

  /* 快速匹配按池分离：一个 vanilla、一个 diy 不应该配上 */
  const E = await client("戊", "diy-test-eps-01", "苏苏");
  const F = await client("己", "diy-test-zeta-01", "苍蓝");
  E.s.emit("match:quick"); await sleep(150); F.s.emit("match:quick", { pool: "diy" });
  await sleep(900);
  const searching = (c) => c.status.some((m) => m.searching === true);
  const roomCount = (c) => c.rooms.filter(Boolean).length;   // hello 时会推一次 room=null，排除
  check("快速匹配不跨池配对",
    searching(E) && searching(F) && E.games.length === 0 && F.games.length === 0 && roomCount(E) === 0 && roomCount(F) === 0,
    `E搜索=${searching(E)} F搜索=${searching(F)} E房间=${roomCount(E)} F房间=${roomCount(F)}`);
  E.s.emit("match:cancel"); F.s.emit("match:cancel");

  /* ---------- 6) 后台 DIY 管理 ---------- */
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const adminApi = (method, url, body, token) => fetch(URL + "/admin/api" + url, {
    method,
    headers: Object.assign({ "content-type": "application/json" },
      token === null ? {} : { "x-admin-token": token === undefined ? ADMIN_TOKEN : token }),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  check("后台 DIY 列表：无口令 401", (await adminApi("GET", "/diy", undefined, "")).status === 401);
  const adminList = await adminApi("GET", "/diy");
  check("后台 DIY 列表：含内置苍蓝",
    adminList.status === 200 && adminList.body.total >= 1 &&
    adminList.body.heroes.some((h) => h.name === "苍蓝" && h.builtin === true),
    adminList.body && adminList.body.total);

  /* 上传一个专用角色，给后台删除用 */
  const doomed = JSON.parse(JSON.stringify(heroDef));
  doomed.name = "后台删除测试";
  doomed.cards = doomed.cards.map((c) => Object.assign({}, c, { id: "adm_" + c.id }));
  const up2 = await api("POST", "/api/diy/heroes", { hero: doomed, author: "测试员" });
  const beforeList = await adminApi("GET", "/diy");
  const del2 = await adminApi("DELETE", "/diy/" + encodeURIComponent("后台删除测试"));
  const afterList = await adminApi("GET", "/diy");
  check("后台能删除任意 DIY 角色",
    up2.status === 200 && del2.status === 200 && del2.body.ok === true,
    del2.status + " " + (del2.body && del2.body.error));
  check("后台删除后列表变短且详情 404",
    beforeList.body.total === afterList.body.total + 1 &&
    (await api("GET", "/api/diy/heroes/" + encodeURIComponent("后台删除测试"))).status === 404,
    `${beforeList.body.total} -> ${afterList.body.total}`);

  /* ---------- 7) 删除权限 ---------- */
  const delBuiltin = await api("DELETE", "/api/diy/heroes/" + encodeURIComponent("苍蓝"));
  check("内置角色不能删除", [400, 403].includes(delBuiltin.status), delBuiltin.status + " " + (delBuiltin.body && delBuiltin.body.error));
  const delWrong = await api("DELETE", "/api/diy/heroes/" + encodeURIComponent("测试机师"), undefined, { "x-diy-owner": "someone-else-9999" });
  check("别人的角色删不掉", delWrong.status === 403, delWrong.status + " " + (delWrong.body && delWrong.body.error));
  const delOk = await api("DELETE", "/api/diy/heroes/" + encodeURIComponent("测试机师"));
  check("能删掉自己上传的角色", delOk.status === 200 && delOk.body.ok === true, delOk.status);
  check("删除后详情 404 且已注销",
    (await api("GET", "/api/diy/heroes/" + encodeURIComponent("测试机师"))).status === 404 && !Diy.isDiy("测试机师"));

  A.s.close(); B.s.close(); C.s.close(); D.s.close(); E.s.close(); F.s.close();
  srv.io.close(); srv.server.close();
  const pass = results.every(Boolean);
  console.log(pass ? "DIY SERVER TEST PASSED" : "DIY SERVER TEST FAILED");
  setTimeout(() => process.exit(pass ? 0 : 1), 300);
})().catch((e) => { console.error(e); process.exit(1); });
