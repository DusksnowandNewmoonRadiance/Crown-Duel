/* ============================================================
   皇冠对决 · DIY 角色系统（浏览器与服务器共用）
   - DIY 角色只用「现有引擎机制白名单」拼卡，不执行任何自定义代码
   - 注册后角色会被注入 Cards.PROFILES，因此引擎 / 卡组校验 / AI / 渲染
     全部沿用原版逻辑
   - 与正常池严格分离：C.isDiy(hero) 为 true 的角色只能进入 DIY 房间
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./cards.js"), require("./icons.js"));
  else root.DuelDiy = factory(root.DuelCards, root.DuelIcons);
})(typeof self !== "undefined" ? self : this, function (C, Icons) {
  "use strict";

  const SCHEMA = 1;
  const ID_RE = /^[a-z][a-z0-9_]{1,31}$/;
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const LIMITS = {
    name: [1, 12],        // 角色名（同时作为内部 key，必须唯一）
    faction: [0, 16],
    style: [0, 40],
    hp: [20, 50],
    cards: [8, 24],       // 不同卡牌的种类数
    cardName: [1, 14],
    text: [0, 90],
    cost: [0, 10],
    atk: [0, 20],
    unitHp: [1, 30],
    n: [1, 4],
    limit: [1, 4],
    deckSize: 40,
    heroes: 200,          // 服务端最多保存的 DIY 角色数
  };

  /* ------------------------------------------------------------
     机制白名单：键是引擎里已有的 effect，值是给作者看的说明。
     只收录「不依赖某个原版卡牌师私有状态」的通用机制，
     每一项都经过 test/diy.js 的实际出牌验证。
     ------------------------------------------------------------ */
  const CATALOG = {
    draw1: { name: "抽 1 张牌", kind: "spell", text: "抽 1 张牌。" },
    draw2: { name: "抽 2 张牌", kind: "spell", text: "抽 2 张牌。" },
    draw3: { name: "抽 3 张牌", kind: "spell", text: "抽 3 张牌。" },
    damage5: { name: "直伤 5", kind: "spell", text: "对敌方英雄造成 5 点伤害。" },
    damage6: { name: "直伤 6", kind: "spell", text: "对敌方英雄造成 6 点伤害。" },
    damage7: { name: "直伤 7", kind: "spell", text: "对敌方英雄造成 7 点伤害。" },
    heal2: { name: "治疗 2", kind: "spell", text: "恢复 2 点生命。" },
    heal3draw: { name: "治疗 3 抽 1", kind: "spell", text: "恢复 3 点生命，抽 1 张牌。" },
    heal4Draw1: { name: "治疗 4 抽 1", kind: "spell", text: "恢复 4 点生命，抽 1 张牌。" },
    heal5Armor2: { name: "治疗 5 护甲 2", kind: "spell", text: "恢复 5 点生命，获得 2 点护甲。" },
    armor1: { name: "护甲 1", kind: "spell", text: "获得 1 点护甲。" },
    armor2: { name: "护甲 2", kind: "spell", text: "获得 2 点护甲。" },
    armor3draw: { name: "护甲 3 抽 1", kind: "spell", text: "获得 3 点护甲，抽 1 张牌。" },
    draw1heal2: { name: "抽 1 治疗 2", kind: "spell", text: "抽 1 张牌，恢复 2 点生命。" },
    draw2armor1: { name: "抽 2 护甲 1", kind: "spell", text: "抽 2 张牌，获得 1 点护甲。" },
    draw2heal2: { name: "抽 2 治疗 2", kind: "spell", text: "抽 2 张牌，恢复 2 点生命。" },
    aoe2: { name: "全场 2 伤", kind: "spell", text: "对所有敌方单位造成 2 点伤害。" },
    aoe4: { name: "全场 4 伤", kind: "spell", text: "对所有敌方单位造成 4 点伤害。" },
    buffAll1: { name: "全体 +1/+1", kind: "spell", text: "使你的所有单位获得 +1/+1。" },
    buffAll2: { name: "全体 +2/+2", kind: "spell", text: "使你的所有单位获得 +2/+2。" },
    buffAllCharge: { name: "全体 +1/+1 冲锋", kind: "spell", text: "使你的所有单位获得 +1/+1，并可在本回合攻击。" },
    enemyAtkDown: { name: "敌方 -1 攻", kind: "spell", text: "使所有敌方单位攻击力 -1。" },
    stunAllDraw: { name: "全体眩晕抽 1", kind: "spell", text: "眩晕所有敌方单位，抽 1 张牌。" },
    drawHeal: { name: "每次抽牌回 1", kind: "unit", text: "每当你获得 1 张手牌，恢复 1 点生命。" },
    drawHeal1: { name: "部署抽 1 回 1", kind: "unit", text: "部署：抽 1 张牌，恢复 1 点生命。" },
    whiteAoe: { name: "清场 3 伤", kind: "spell", text: "对所有敌方单位造成 3 点伤害。" },
    /* ---- 神罚体系（苍蓝原版机制） ---- */
    diyPunishCast: { name: "神罚（抽到自动）", kind: "spell", text: "抽到时自动施放：你的英雄受到 1 点伤害，抽 1 张牌。" },
    diyBarrier: { name: "神谕壁垒", kind: "spell", text: "获得等同于敌方牌库中【神罚】数量的护甲。" },
    diyEcho: { name: "神罚共鸣", kind: "spell", text: "将 4 张【神罚】洗入敌方牌库，再将 2 张洗入你的牌库。" },
    diyPull: { name: "圣光牵引", kind: "spell", text: "策反 1 个敌方单位（下回合返回），使其获得 +1/+4。" },
    diyMechEye: { name: "机械眼", kind: "unit", text: "在你的回合开始时，随机攻击一个敌方目标（消耗当回合攻击次数）。" },
  };

  /* ------------------------------------------------------------
     校验
     ------------------------------------------------------------ */
  const str = (v) => (typeof v === "string" ? v : "");
  const int = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);
  const inRange = (v, [a, b]) => Number.isFinite(v) && v >= a && v <= b;

  function cleanText(s, max) {
    return str(s).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  }

  function validate(raw, opts) {
    opts = opts || {};
    const errors = [];
    const def = { schema: SCHEMA, name: "", faction: "", style: "", hp: 30, color: "#5ab4ff", cards: [] };

    if (!raw || typeof raw !== "object") return { ok: false, errors: ["角色定义必须是一个对象"], def: null };

    def.name = cleanText(raw.name, LIMITS.name[1]);
    if (!def.name) errors.push("缺少角色名");
    else if (C.PROFILES[def.name] && !(opts.allowReplace && opts.allowReplace === def.name)) errors.push(`角色名「${def.name}」已被占用`);

    def.faction = cleanText(raw.faction, LIMITS.faction[1]) || "DIY 工坊";
    def.style = cleanText(raw.style, LIMITS.style[1]) || "玩家自制角色";
    def.hp = int(raw.hp);
    if (!inRange(def.hp, LIMITS.hp)) errors.push(`血量必须是 ${LIMITS.hp[0]}~${LIMITS.hp[1]}`);

    def.color = HEX_RE.test(str(raw.color)) ? str(raw.color) : "#5ab4ff";

    const cards = Array.isArray(raw.cards) ? raw.cards : [];
    if (cards.length < LIMITS.cards[0] || cards.length > LIMITS.cards[1]) {
      errors.push(`卡牌种类必须是 ${LIMITS.cards[0]}~${LIMITS.cards[1]} 张（当前 ${cards.length}）`);
    }

    const seen = new Set();
    cards.forEach((c, i) => {
      const at = `第 ${i + 1} 张卡`;
      if (!c || typeof c !== "object") { errors.push(`${at} 不是对象`); return; }
      const id = str(c.id).toLowerCase();
      if (!ID_RE.test(id)) { errors.push(`${at} 的 id 不合法（小写字母开头，可含数字/下划线，2~32 位）`); return; }
      if (seen.has(id)) { errors.push(`${at} 的 id 重复：${id}`); return; }
      seen.add(id);

      const name = cleanText(c.name, LIMITS.cardName[1]);
      if (!name) errors.push(`${at} 缺少卡名`);
      const cost = int(c.cost);
      if (!inRange(cost, LIMITS.cost)) errors.push(`${at} 费用必须是 ${LIMITS.cost[0]}~${LIMITS.cost[1]}`);
      const kind = c.kind === "spell" ? "spell" : "unit";

      let effect = str(c.effect) || "";
      if (effect && !CATALOG[effect]) { errors.push(`${at} 使用了未开放的机制：${effect}`); effect = ""; }
      if (kind === "spell" && !effect) errors.push(`${at} 是法术牌，必须选择一种机制`);
      if (c.onDraw && kind !== "spell") errors.push(`${at}：只有法术牌可以标记「抽到时自动施放」`);

      /* 卡面图标：只接受图标库里的 id（白名单，不接受自定义 SVG） */
      const icon = str(c.icon);
      if (icon && !(Icons && Icons.has(icon))) errors.push(`${at} 的图标不在图标库内：${icon}`);
      const card = {
        id, name, cost, kind,
        art: cleanText(c.art, 2) || (kind === "unit" ? "◆" : "✧"),
        icon: icon && Icons && Icons.has(icon) ? icon : undefined,
        text: cleanText(c.text, LIMITS.text[1]) || (CATALOG[effect] ? CATALOG[effect].text : ""),
        effect: effect || undefined,
        onDraw: !!c.onDraw || undefined,
        n: int(c.n), limit: int(c.limit),
        rarity: "common",
      };
      if (kind === "unit") {
        card.atk = int(c.atk);
        card.hp = int(c.hp);
        if (!inRange(card.atk, LIMITS.atk)) errors.push(`${at} 攻击力必须是 ${LIMITS.atk[0]}~${LIMITS.atk[1]}`);
        if (!inRange(card.hp, LIMITS.unitHp)) errors.push(`${at} 生命必须是 ${LIMITS.unitHp[0]}~${LIMITS.unitHp[1]}`);
        if (c.charge) card.charge = true;
        if (c.taunt) card.taunt = true;
        if (c.ignoreTaunt) card.ignoreTaunt = true;
        if (c.strikes > 1) card.strikes = Math.min(3, int(c.strikes));
        if (c.lifespan > 0) card.lifespan = Math.min(3, int(c.lifespan));
      }
      if (!inRange(card.n, LIMITS.n)) errors.push(`${at} 默认张数必须是 ${LIMITS.n[0]}~${LIMITS.n[1]}`);
      if (!inRange(card.limit, LIMITS.limit)) errors.push(`${at} 携带上限必须是 ${LIMITS.limit[0]}~${LIMITS.limit[1]}`);
      if (Number.isFinite(card.n) && Number.isFinite(card.limit) && card.n > card.limit) errors.push(`${at} 默认张数不能超过携带上限`);
      card.rarity = card.limit >= 4 ? "common" : card.limit === 3 ? "rare" : card.limit === 2 ? "special" : "elite";
      def.cards.push(card);
    });

    // 卡组必须能凑满 40 张
    const caps = def.cards.reduce((s, c) => s + (Number.isFinite(c.limit) ? c.limit : 0), 0);
    if (caps < LIMITS.deckSize) errors.push(`所有卡牌的携带上限合计 ${caps}，不足 ${LIMITS.deckSize} 张，无法组出合法卡组`);

    return { ok: errors.length === 0, errors, def };
  }

  /* ------------------------------------------------------------
     注册 / 查询
     ------------------------------------------------------------ */
  const registry = new Map(); // name -> {name, def, builtin, author, createdAt}

  function inject(def) {
    const cards = def.cards.map((c) => Object.assign({}, c, { hero: def.name }));
    C.PROFILES[def.name] = {
      faction: def.faction, style: def.style, hp: def.hp, cards,
      diy: true, color: def.color,
    };
    if (C.COLORS) C.COLORS[def.name] = def.color;
    if (C.HERO_INFO) C.HERO_INFO[def.name] = { difficulty: 2, title: def.faction, tip: def.style + "（玩家自制角色，仅能在允许 DIY 的房间里使用）" };
    return C.PROFILES[def.name];
  }

  function register(def, meta) {
    meta = meta || {};
    if (!def || !def.name || !Array.isArray(def.cards) || !def.cards.length) {
      return { ok: false, error: "角色定义不完整" };
    }
    if (C.PROFILES[def.name] && !registry.has(def.name)) {
      return { ok: false, error: `角色名「${def.name}」已被占用` };
    }
    inject(def);
    registry.set(def.name, {
      name: def.name,
      def,
      builtin: !!meta.builtin,
      author: cleanText(meta.author, 24) || (meta.builtin ? "官方示例" : "玩家"),
      createdAt: +meta.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
    const built = C.defaultDeck(def.name);
    const err = C.deckError(def.name, built);
    if (err) return { ok: false, error: `默认卡组不合法：${err}` };
    return { ok: true, hero: def.name };
  }

  function unregister(name) {
    if (!registry.has(name)) return false;
    registry.delete(name);
    delete C.PROFILES[name];
    if (C.COLORS && registry.has(name) === false) delete C.COLORS[name];
    if (C.HERO_INFO) delete C.HERO_INFO[name];
    return true;
  }

  const isDiy = (hero) => registry.has(hero);
  const hero = (name) => (registry.get(name) || null);
  const list = () => [...registry.values()].sort((a, b) => b.createdAt - a.createdAt);
  const names = () => [...registry.keys()];
  const summary = (name) => {
    const r = registry.get(name);
    if (!r) return null;
    return {
      name: r.name, faction: r.def.faction, style: r.def.style, hp: r.def.hp, color: r.def.color,
      cards: r.def.cards.length, builtin: r.builtin, author: r.author,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  };
  const catalog = () => Object.keys(CATALOG).map((id) => Object.assign({ id }, CATALOG[id]));

  return {
    SCHEMA, LIMITS, CATALOG, ID_RE,
    validate, register, unregister, isDiy, hero, list, names, summary, catalog,
    /* 供服务器保存/恢复 */
    exportDef: (name) => (registry.get(name) ? registry.get(name).def : null),
    setMeta: (name, meta) => { const r = registry.get(name); if (r) Object.assign(r, meta); return !!r; },
  };
});
