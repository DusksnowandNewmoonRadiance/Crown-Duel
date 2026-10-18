/* 图标库 / 卡牌图标映射 / DIY 图标字段 */
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const C = require("../shared/cards.js");
const Icons = require("../shared/icons.js");
const Diy = require("../shared/diy.js");

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log("✔ " + name); };

/* iconmap.js 是浏览器脚本（顶层 const），放进沙箱里加载 */
const ctx = { DuelIcons: Icons, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/iconmap.js"), "utf8") + ";this.CardIcons=CardIcons", ctx);
const CardIcons = ctx.CardIcons;

ok("图标库：每个 id 都能生成合法 SVG，且有中文名", () => {
  assert(Icons.IDS.length >= 30);
  for (const id of Icons.IDS) {
    const s = Icons.svg(id);
    assert(/^<svg [^>]*viewBox="0 0 24 24"/.test(s) && s.endsWith("</svg>"), id);
    assert(Icons.labelOf(id), id + " 缺少中文名");
  }
  assert(!/<script|onload|javascript:/i.test(Icons.IDS.map((i) => Icons.svg(i)).join("")));
});

ok("图标库：未知 id 退回「未知」图标，不抛错", () => {
  assert(Icons.svg("nope").includes("<svg"));
  assert.strictEqual(Icons.has("nope"), false);
  assert.strictEqual(Icons.has("__proto__"), false);
});

ok("映射：全部 250 张卡 + 令牌都解析到库内图标", () => {
  let n = 0;
  for (const [hero, p] of Object.entries(C.PROFILES)) for (const c of p.cards) { assert(Icons.has(CardIcons.forCard({ ...c, hero })), hero + ":" + c.id); n++; }
  for (const [id, t] of Object.entries(C.TOKENS)) assert(Icons.has(CardIcons.forCard({ ...t, id })), "token " + id);
  assert(n >= 200);
});

ok("映射：覆盖表里的目标图标都存在", () => {
  for (const [k, v] of Object.entries(CardIcons.OVERRIDES)) assert(Icons.has(v), k + " → " + v);
  for (const [k, v] of Object.entries(CardIcons.HERO_ICON)) assert(Icons.has(v), k + " → " + v);
});

ok("映射：卡牌自带 icon 字段优先；非法 icon 被忽略", () => {
  const base = { id: "x", hero: "苏苏", kind: "spell", name: "x", cost: 1, text: "抽 1 张牌。" };
  assert.strictEqual(CardIcons.forCard({ ...base, icon: "flame" }), "flame");
  assert.strictEqual(CardIcons.forCard({ ...base, icon: "../../evil" }), "cards");
});

ok("映射：图标分布不是单一图标（至少 15 种）", () => {
  const seen = new Set();
  for (const [hero, p] of Object.entries(C.PROFILES)) for (const c of p.cards) seen.add(CardIcons.forCard({ ...c, hero }));
  assert(seen.size >= 15, "只用了 " + seen.size + " 种");
});

ok("DIY：合法 icon 通过并保留；非法 icon 被拒绝", () => {
  const base = require("../shared/diy-builtin.js").heroes[0];
  const clone = () => JSON.parse(JSON.stringify(base));
  const good = clone(); good.name = "图标测试";
  good.cards[0].icon = "flame";
  const r1 = Diy.validate(good, { builtin: true, allowReplace: "苍蓝" });
  assert(r1.ok, JSON.stringify(r1.errors));
  assert.strictEqual(r1.def.cards[0].icon, "flame");
  const bad = clone(); bad.name = "图标测试二";
  bad.cards[0].icon = "<svg onload=alert(1)>";
  const r2 = Diy.validate(bad, { builtin: true, allowReplace: "苍蓝" });
  assert(!r2.ok && r2.errors.some((e) => /图标/.test(e)));
});

ok("内置 DIY 角色苍蓝（41 张，含私有机制）的卡牌也都解析到库内图标", () => {
  const v = Diy.validate(require("../shared/diy-builtin.js").heroes[0], { builtin: true, allowReplace: "苍蓝" });
  assert(v.ok, JSON.stringify(v.errors));
  assert(Diy.register(v.def, { builtin: true }).ok);
  const cards = C.PROFILES["苍蓝"].cards;
  assert(cards.length >= 40);
  const seen = new Set();
  for (const c of cards) { const id = CardIcons.forCard({ ...c, hero: "苍蓝" }); assert(Icons.has(id), c.id); seen.add(id); }
  assert(seen.size >= 6, "苍蓝只用了 " + seen.size + " 种图标");
});

console.log(`\nICONS TEST PASSED (${pass}/${pass})`);
