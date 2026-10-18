/* ============================================================
   DIY 角色（服务端）：持久化 + 上传/删除 API
   - 与 store.js 相同的落盘方式：DATA_DIR/diy-heroes.json，先写临时文件再改名
   - 启动时先注册内置「苍蓝」，再逐个恢复玩家上传的角色；
     单条数据坏了只 warn 跳过，不能让服务器起不来
   - 注册本身由 shared/diy.js 负责（会注入 Cards.PROFILES），
     所以引擎 / 卡组校验 / AI 全部沿用原版逻辑
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");
const C = require("../shared/cards.js");
const Diy = require("../shared/diy.js");
const Builtin = require("../shared/diy-builtin.js");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const FILE = "diy-heroes.json";
const FILE_PATH = path.join(DATA_DIR, FILE);
const SCHEMA = 1;
const MAX_HEROES = Diy.LIMITS.heroes;   // 200
const UPLOAD_LIMIT = 5;                 // 每个 IP 每分钟最多上传 5 次
const UPLOAD_WINDOW = 60000;
const OWNER_RE = /^[A-Za-z0-9_-]{8,64}$/;

/* {v:1, heroes:[{def, author, owner, createdAt, updatedAt}]} */
let db = { v: SCHEMA, heroes: [] };
let onChange = null;
const uploads = new Map();               // ip -> { count, start }

const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);
const now = () => Date.now();

/* ---------- 落盘 ---------- */
function readFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    if (!raw || typeof raw !== "object") throw new Error("格式错误");
    const heroes = Array.isArray(raw.heroes) ? raw.heroes : [];
    return { v: SCHEMA, heroes };
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`[Diy] 读取 ${FILE} 失败，按空名单启动：`, e.message);
    return { v: SCHEMA, heroes: [] };
  }
}
/* 先写临时文件再改名，避免写到一半断电把名单写坏 */
function persist() {
  const tmp = FILE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE_PATH);
}

/* ---------- 查询工具 ---------- */
const entryOf = (name) => db.heroes.find((e) => e && e.def && e.def.name === name) || null;
const list = () => Diy.list().map((r) => Diy.summary(r.name));
const isBuiltin = (name) => !!(Diy.hero(name) && Diy.hero(name).builtin);

/* 广播钩子：server/index.js 挂上 io.emit("diy:list", …) */
function setChangeHandler(fn) { onChange = typeof fn === "function" ? fn : null; }
function notifyChange() {
  if (!onChange) return;
  try { onChange(list()); } catch (e) { console.error("[Diy] 广播失败：", e.message); }
}

/* ---------- 保存 / 删除 ---------- */
/* 上传成功后：写内存 + 落盘（def 已经是 validate 清洗过的版本） */
function save(def, meta) {
  meta = meta || {};
  const t = now();
  const entry = {
    def,
    author: clean(meta.author, 24) || "玩家",
    owner: OWNER_RE.test(meta.owner || "") ? meta.owner : "",
    createdAt: +meta.createdAt || t,
    updatedAt: t,
  };
  const old = entryOf(def.name);
  if (old) {
    entry.createdAt = old.createdAt || entry.createdAt;
    db.heroes = db.heroes.map((e) => (e === old ? entry : e));
  } else {
    db.heroes.push(entry);
  }
  persist();
  return entry;
}
/* 从名单里删掉（Diy.unregister 由调用方负责） */
function remove(name) {
  const n = db.heroes.length;
  db.heroes = db.heroes.filter((e) => !(e && e.def && e.def.name === name));
  if (db.heroes.length === n) return false;
  persist();
  return true;
}

/* 运营后台专用：删任意角色（含内置），注销 + 落盘 + 广播
   注意：内置角色只从本次进程的注册表里移除，重启后 init() 会重新注册 */
function adminRemove(name) {
  if (!Diy.isDiy(name)) return { ok: false, error: "DIY 角色不存在" };
  const builtin = isBuiltin(name);
  Diy.unregister(name);
  const removed = remove(name);
  notifyChange();
  return { ok: true, name, builtin, removed };
}

/* ---------- 启动：内置 + 已保存 ---------- */
function init() {
  db = readFile();
  if (db.heroes.length > MAX_HEROES) db.heroes = db.heroes.slice(0, MAX_HEROES);
  let builtin = 0, saved = 0, skipped = 0;

  for (const raw of Builtin.heroes) {
    const v = Diy.validate(raw, { allowReplace: raw && raw.name });
    if (!v.ok) { console.warn("[Diy] 内置角色校验失败，跳过：", (v.errors || []).join("；")); skipped++; continue; }
    const r = Diy.register(v.def, { builtin: true, author: "官方示例", createdAt: 0 });
    if (!r.ok) { console.warn("[Diy] 内置角色注册失败，跳过：", r.error); skipped++; continue; }
    builtin++;
  }

  for (const e of db.heroes) {
    const raw = e && e.def;
    if (!raw || typeof raw !== "object") { console.warn("[Diy] 已保存角色缺少定义，跳过"); skipped++; continue; }
    const name = typeof raw.name === "string" ? raw.name : "";
    if (Diy.isDiy(name)) { console.warn(`[Diy] 角色「${name}」重名，跳过`); skipped++; continue; }
    const v = Diy.validate(raw);
    if (!v.ok) { console.warn(`[Diy] 角色「${name}」校验失败，跳过：`, (v.errors || []).slice(0, 3).join("；")); skipped++; continue; }
    const r = Diy.register(v.def, { author: e.author, createdAt: e.createdAt });
    if (!r.ok) { console.warn(`[Diy] 角色「${name}」注册失败，跳过：`, r.error); skipped++; continue; }
    Diy.setMeta(name, { updatedAt: +e.updatedAt || +e.createdAt || now() });
    saved++;
  }

  console.log(`[Diy] 已加载 ${builtin} 个内置角色、${saved} 个上传角色${skipped ? `，跳过 ${skipped} 条坏数据` : ""}`);
  return { builtin, saved, skipped };
}

/* ---------- HTTP 接口 ---------- */
const router = express.Router();
const noCache = (req, res, next) => { res.setHeader("Cache-Control", "no-cache"); next(); };
const ownerOf = (req) => {
  const v = String(req.headers["x-diy-owner"] || req.query.owner || "");
  return OWNER_RE.test(v) ? v : "";
};
function rateLimited(ip, bucket) {
  const key = (bucket || "post") + "|" + (ip || "");
  const t = now();
  const rec = uploads.get(key);
  if (!rec || t - rec.start >= UPLOAD_WINDOW) { uploads.set(key, { count: 1, start: t }); return false; }
  rec.count++;
  return rec.count > UPLOAD_LIMIT;
}

/* 机制目录：前端拼卡界面用 */
router.get("/api/diy/catalog", noCache, (req, res) => {
  res.json({ catalog: Diy.catalog(), limits: Diy.LIMITS });
});

/* 角色列表：只给摘要（不含完整卡表） */
router.get("/api/diy/heroes", noCache, (req, res) => {
  res.json({ heroes: list() });
});

/* 单个角色：完整定义 + 作者信息 */
router.get("/api/diy/heroes/:name", noCache, (req, res) => {
  const name = String(req.params.name || "");
  const def = Diy.exportDef(name);
  if (!def) return res.status(404).json({ ok: false, error: "DIY 角色不存在" });
  const e = entryOf(name);
  res.json({
    hero: def,
    meta: {
      author: (Diy.hero(name) || {}).author || "玩家",
      builtin: isBuiltin(name),
      createdAt: e ? e.createdAt : (Diy.hero(name) || {}).createdAt || 0,
    },
  });
});

/* 上传：校验 → 注册 → 落盘 → 广播；同名 409，参数错误 400 */
router.post("/api/diy/heroes", (req, res) => {
  if (rateLimited(req.ip || "")) return res.status(429).json({ ok: false, error: "上传太频繁了，一分钟内最多 5 次" });
  const body = req.body || {};
  const raw = body.hero && typeof body.hero === "object" ? body.hero : body;
  const name = typeof (raw && raw.name) === "string" ? raw.name.trim() : "";
  if (name && (Diy.isDiy(name) || C.PROFILES[name])) {
    return res.status(409).json({ ok: false, error: `角色「${name}」已存在，请换一个名字` });
  }
  if (Diy.list().length >= MAX_HEROES) return res.status(429).json({ ok: false, error: `DIY 角色数量已达上限（${MAX_HEROES}）` });

  const v = Diy.validate(raw);
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });

  /* 匿名 owner：客户端没带就发一个，删除时用它认领 */
  const owner = ownerOf(req) || ("diy_" + crypto.randomBytes(8).toString("hex"));
  const author = clean(body.author, 24) || "玩家";
  const reg = Diy.register(v.def, { author, owner });
  if (!reg.ok) return res.status(400).json({ ok: false, errors: [reg.error] });

  save(v.def, { author, owner, createdAt: now() });
  notifyChange();
  res.json({ ok: true, name: v.def.name, owner });
});

/* 覆盖更新：只有作者本人能改自己的角色；不许改名（改名请走「删 + 传」） */
router.put("/api/diy/heroes/:name", (req, res) => {
  if (rateLimited(req.ip || "", "put")) return res.status(429).json({ ok: false, error: "上传太频繁了，一分钟内最多 5 次" });
  const name = String(req.params.name || "");
  if (!Diy.isDiy(name)) return res.status(404).json({ ok: false, error: "DIY 角色不存在" });
  if (isBuiltin(name)) return res.status(403).json({ ok: false, error: "内置角色不能覆盖更新" });
  const entry = entryOf(name);
  const owner = ownerOf(req);
  if (!entry || !owner || owner !== entry.owner) return res.status(403).json({ ok: false, error: "只能更新自己上传的角色" });

  const body = req.body || {};
  const raw = body.hero && typeof body.hero === "object" ? body.hero : body;
  const rawName = typeof (raw && raw.name) === "string" ? raw.name.trim() : "";
  /* 改名会让 registry / 卡组里的 key 全部失效，这里直接拒掉 */
  if (rawName !== name) {
    return res.status(400).json({ ok: false, errors: [`不能改名（${rawName || "空"} → ${name}）：请删除后重新上传`] });
  }

  const v = Diy.validate(raw, { allowReplace: name });
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });

  const author = clean(body.author, 24) || entry.author || "玩家";
  const oldDef = Diy.exportDef(name);
  Diy.unregister(name);
  const reg = Diy.register(v.def, { author, owner, createdAt: entry.createdAt });
  if (!reg.ok) {
    /* 注册失败就把旧定义恢复回去，别把角色弄丢 */
    if (oldDef) {
      const back = Diy.register(oldDef, { author: entry.author, owner, createdAt: entry.createdAt });
      if (!back.ok) console.error(`[Diy] 覆盖失败且回滚失败：${name}`, back.error);
    }
    return res.status(400).json({ ok: false, errors: [reg.error] });
  }
  save(v.def, { author, owner, createdAt: entry.createdAt });   // save() 会保留原 createdAt
  Diy.setMeta(name, { updatedAt: now() });
  notifyChange();
  res.json({ ok: true, name, updated: true });
});

/* 删除：内置禁止；只能删自己上传的（x-diy-owner 比对） */
router.delete("/api/diy/heroes/:name", (req, res) => {
  const name = String(req.params.name || "");
  if (!Diy.isDiy(name)) return res.status(404).json({ ok: false, error: "DIY 角色不存在" });
  if (isBuiltin(name)) return res.status(403).json({ ok: false, error: "内置角色不能删除" });
  const e = entryOf(name);
  const owner = ownerOf(req);
  if (!e || !owner || owner !== e.owner) return res.status(403).json({ ok: false, error: "只能删除自己上传的角色" });

  Diy.unregister(name);
  remove(name);
  notifyChange();
  res.json({ ok: true, name });
});

module.exports = { router, init, list, save, remove, adminRemove, setChangeHandler, DATA_DIR, FILE };
