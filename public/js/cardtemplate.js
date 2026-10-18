/* 生成文件：由 src/ui/cardtemplate.ts 编译而来，请改 TypeScript 源码后运行 npm run build，不要直接编辑本文件。 */
/* ============================================================================
   标准卡牌模板 CardTemplate
   ----------------------------------------------------------------------------
   手牌 / 预览 / 卡组编辑器 / 图鉴共用同一个模板，版式固定：

     ┌────────────────────────┐
     │ (费)   名  称           │  ← 标题栏，费用宝石压在左上角
     │ ┌────────────────────┐ │
     │ │   蓝图底 + 图标      │ │  ← 插画窗：网格 + 半调 + 十字准星 + 中央图标
     │ │ [冲锋][嘲讽]        │ │  ← 关键字徽章（图标 + 文字），叠在插画窗底部
     │ └────────────────────┘ │
     │  类型 · 卡牌师 · 稀有度  │  ← 类型带
     │ ┌────────────────────┐ │
     │ │ 描述文字             │ │  ← 文本框
     │ └────────────────────┘ │
     │ (攻)       ◆       (血) │  ← 攻防徽章，稀有度宝石居中
     └────────────────────────┘

   卡面中央的图标由 CardIcons.forCard(card) 决定，可被卡牌的 icon 字段或
   src/ui/iconmap.ts 的 OVERRIDES 覆盖；颜色随卡牌师主题色。
   这个模块只负责「把一张卡变成 HTML 字符串」，不碰 DOM、不读对局状态。
   ============================================================================ */
const CardTemplate = (() => {
    const C = DuelCards;
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const KW_RE = /(无视嘲讽|【衰减】|【垃圾】|手牌上限|冲锋|嘲讽|部署|策反|亡语|限时|销毁|毁坏|污染|疲劳)/g;
    const richText = (t) => esc(t).replace(KW_RE, "<b>$1</b>");
    const FALLBACK_PALETTE = { bg: "#17171a", bgHi: "#26262b", line: "#c9c9ce", lineDim: "#7c7c85", fill: "#2a2a30" };
    const palette = (hero) => {
        const p = typeof CardArt !== "undefined" ? CardArt.palette(hero) : null;
        return p || FALLBACK_PALETTE;
    };
    const hexRgb = (hex) => {
        const h = hex.replace("#", "");
        const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
        return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    };
    const heroRgb = (hero) => hexRgb((hero && C.COLORS[hero]) || "#e2b467");
    /* ---------------- 关键字徽章 ---------------- */
    function keywords(c) {
        const out = [];
        if (c.charge)
            out.push({ cls: "charge", icon: "dash", label: "冲锋", hint: "部署当回合即可攻击" });
        if (c.taunt)
            out.push({ cls: "taunt", icon: "bulwark", label: "嘲讽", hint: "敌人必须先攻击它" });
        if (c.ignoreTaunt)
            out.push({ cls: "pierce", icon: "sword", label: "无视嘲讽", hint: "攻击时不受嘲讽限制" });
        if (c.untargetable)
            out.push({ cls: "hide", icon: "ghost", label: "隐匿", hint: "无法被指定为攻击目标" });
        if ((c.strikes || 0) > 1)
            out.push({ cls: "multi", icon: "burst", label: "连击", hint: "每回合可攻击多次" });
        if ((c.lifespan || 0) > 0)
            out.push({ cls: "fleet", icon: "hourglass", label: "限时", hint: "下个回合开始时消散" });
        if (c.core)
            out.push({ cls: "core", icon: "gem", label: "核心", hint: "核心卡" });
        return out;
    }
    function keywordChips(c) {
        const ks = keywords(c);
        if (!ks.length)
            return "";
        return `<div class="kws">${ks.map((k) => `<i class="kw ${k.cls}" title="${esc(k.label + "：" + k.hint)}">${DuelIcons.svg(k.icon, { size: "1.15em", stroke: 1.8 })}<span class="t">${k.label}</span></i>`).join("")}</div>`;
    }
    /* ---------------- 插画窗：蓝图底 + 中央图标 ---------------- */
    function hash(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    /** 底图 SVG 文本（不含图标）。同一卡牌师 + 画幅只生成一次，作为 CSS 背景图被所有卡共用，
        这样每张卡的 DOM 里不再带内联 SVG（<mask>/<pattern> 的解析与栅格化是图鉴 / 卡组页卡顿的主因）。 */
    function backdropSvg(hero, w, h) {
        const p = palette(hero);
        const id = "b";
        const cx = w / 2, cy = h * 0.5, r = Math.min(w * 0.3, h * 0.42);
        let grid = "";
        for (let x = w / 8; x < w; x += w / 8)
            grid += `M${x.toFixed(1)} 0V${h}`;
        for (let y = h / 5; y < h; y += h / 5)
            grid += `M0 ${y.toFixed(1)}H${w}`;
        const m = 2.6, t = 3.2;
        const corners = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]
            .map(([x, y, sx, sy]) => `M${x + sx * t} ${y}H${x}V${y + sy * t}`).join("");
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bgHi}"/><stop offset="1" stop-color="${p.bg}"/></linearGradient>
        <pattern id="${id}d" width="3.4" height="3.4" patternUnits="userSpaceOnUse"><circle cx="1.7" cy="1.7" r=".5" fill="${p.line}"/></pattern>
        <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient>
        <mask id="${id}m"><rect width="${w}" height="${h}" fill="url(#${id}f)"/></mask>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#${id}g)"/>
      <path d="${grid}" stroke="${p.lineDim}" stroke-width=".25" opacity=".28" fill="none"/>
      <rect width="${w}" height="${h}" fill="url(#${id}d)" mask="url(#${id}m)" opacity=".5"/>
      <circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${p.fill}" fill-opacity=".38" stroke="${p.lineDim}" stroke-width=".5" stroke-opacity=".7"/>
      <circle cx="${cx}" cy="${cy}" r="${(r * 1.32).toFixed(1)}" fill="none" stroke="${p.lineDim}" stroke-width=".3" stroke-dasharray="1 2.2" opacity=".6"/>
      <path d="M${cx} ${(cy - r * 1.55).toFixed(1)}v${(r * 0.35).toFixed(1)}M${cx} ${(cy + r * 1.2).toFixed(1)}v${(r * 0.35).toFixed(1)}M${(cx - r * 1.75).toFixed(1)} ${cy}h${(r * 0.4).toFixed(1)}M${(cx + r * 1.35).toFixed(1)} ${cy}h${(r * 0.4).toFixed(1)}" stroke="${p.line}" stroke-width=".45" opacity=".55" fill="none"/>
      <path d="${corners}" stroke="${p.line}" stroke-width=".5" opacity=".45" fill="none"/>
    </svg>`;
    }
    const injected = new Set();
    let sheet = null;
    /** 返回该卡牌师（卡面 / 战场单位两种画幅）对应的背景类名，首次使用时注入一条 CSS 规则 */
    function backdropClass(hero, unit) {
        const cls = (unit ? "hu" : "hc") + hash(hero).toString(36);
        if (!injected.has(cls)) {
            injected.add(cls);
            if (!sheet) {
                sheet = document.createElement("style");
                sheet.id = "cd-card-art";
                document.head.appendChild(sheet);
            }
            const svg = backdropSvg(hero, 100, unit ? 86 : 41);
            sheet.appendChild(document.createTextNode(`.${cls}{background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}")}`));
        }
        return cls;
    }
    /** awa 卡的噪点贴图：运行时用 canvas 生成一次灰度噪声，作为 CSS 变量 --awa-noise 供 cards.css 使用 */
    let noiseReady = false;
    function ensureAwaNoise() {
        if (noiseReady)
            return;
        noiseReady = true;
        try {
            const cv = document.createElement("canvas");
            cv.width = cv.height = 64;
            const g = cv.getContext("2d");
            if (!g)
                return;
            const img = g.createImageData(64, 64);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.random() < 0.5 ? 0 : 255;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
                img.data[i + 3] = Math.random() < 0.35 ? 255 : 0;
            }
            g.putImageData(img, 0, 0);
            document.documentElement.style.setProperty("--awa-noise", "url(" + cv.toDataURL("image/png") + ")");
        }
        catch (_) { /* 无 canvas 时没有噪点，其余效果照常 */ }
    }
    /** 插画窗内容：背景层（CSS 背景图）+ 图标 */
    function art(c) {
        const hero = c.hero || "";
        return `<span class="artbg ${backdropClass(hero, false)}"></span><span class="ico-wrap" style="color:${palette(hero).line}">${iconLayers(c)}</span>`;
    }
    /** awa 卡的图标是三层叠加（红 / 青通道错位 + 本体），用于 GLITCH 色差；其余卡只有一层 */
    function iconLayers(c) {
        const one = CardIcons.art(c);
        if (c.owner === "awa")
            ensureAwaNoise();
        return c.owner === "awa" ? `<span class="gl gl-r">${one}</span><span class="gl gl-c">${one}</span>${one}` : one;
    }
    /** 战场单位用的插画（更接近方形） */
    function unitArt(c) {
        const hero = c.hero || "";
        return `<span class="artbg ${backdropClass(hero, true)}"></span><span class="ico-wrap" style="color:${palette(hero).line}">${iconLayers(c)}</span>`;
    }
    /* ---------------- 攻防徽章 ---------------- */
    function stat(kind, value, mod) {
        const icon = kind === "atk" ? "sword" : "heart";
        return `<b class="stat ${kind}${mod ? " " + mod : ""}"><span class="si">${DuelIcons.svg(icon, { size: "100%", stroke: 1.6 })}</span><span class="sv">${value}</span></b>`;
    }
    /* ---------------- 卡面 ---------------- */
    function render(c, opts) {
        // 数据兜底：坏数据渲染成占位卡，不抛异常，避免拖垮整个手牌区
        if (!c || c.id === undefined || c.kind === undefined) {
            return '<div class="card k-spell r-common"><span class="cost">?</span>' +
                `<div class="art">${DuelIcons.svg("question", { size: "2.4em" })}</div>` +
                '<div class="nm">数据缺失</div><div class="tx">这张卡的数据异常，请刷新页面</div></div>';
        }
        const o = opts || {};
        const atk = c.attack !== undefined ? c.attack : c.atk;
        const hp = c.health !== undefined ? c.health : c.hp;
        const maxHp = c.maxHealth !== undefined ? c.maxHealth : c.hp;
        const base = c.baseCost !== undefined ? c.baseCost : c.cost;
        const def = c.hero ? C.cardDef(c.hero, c.id) : undefined;
        const cls = ["card", "k-" + c.kind];
        if (o.cant)
            cls.push("cant");
        if (c.cost > base)
            cls.push("costup");
        else if (c.cost < base)
            cls.push("costdown");
        if (c.core)
            cls.push("core");
        if (c.owner === "awa")
            cls.push("awa");
        const rar = c.rarity && C.RARITY && C.RARITY[c.rarity] ? c.rarity : "";
        if (rar)
            cls.push("r-" + rar);
        let stats = "";
        if (c.kind === "unit" && atk !== undefined && hp !== undefined) {
            const baseAtk = def ? def.atk : atk;
            const hpMod = hp < maxHp ? "dmg" : def && maxHp > def.hp ? "buff" : "";
            stats = `<div class="stats">${stat("atk", atk, atk > baseAtk ? "buff" : "")}${stat("hp", hp, hpMod)}</div>`;
        }
        const rep = c.rep && C.REGIMES ? C.REGIMES[c.rep] : "";
        const tag = c.scrap ? "废料" : c.gun ? "火炮" : c.member ? "架子班"
            : c.id === "red" && c.hero === "苏苏" ? "俄布" : rep && c.hero === "苏苏" ? rep : c.hero;
        const kindName = c.kind === "unit" ? "单位" : "法术";
        const type = (c.owner === "awa" ? "awa · 法术" : kindName + (tag ? " · " + esc(tag) : "")) +
            (rar ? ` · <span class="rar r-${rar}">${C.RARITY[rar].name}</span>` : "");
        const gem = rar ? `<i class="gem r-${rar}" title="${C.RARITY[rar].name}"></i>` : "";
        const text = String(c.text || "");
        const body = richText(text) + (c.flavor ? `<i class="flv">${esc(c.flavor)}</i>` : "");
        /* 长描述自动降一档字号，避免在小卡里被裁成半句；悬停仍可看完整文本 */
        const txCls = text.length > 66 ? "tx tx-xs" : text.length > 44 ? "tx tx-s" : "tx";
        const rgb = heroRgb(c.hero);
        return `<div class="${cls.join(" ")}" style="--hcr:${rgb}" data-icon="${esc(CardIcons.forCard(c))}">` +
            `<span class="cost">${c.cost}</span>` +
            `<div class="${c.name.length > 9 ? "nm nm-s" : c.name.length > 6 ? "nm nm-m" : "nm"}"><span data-t="${esc(c.name)}">${esc(c.name)}</span></div>` +
            `<div class="art">${art(c)}${keywordChips(c)}</div>` +
            `<div class="type">${type}</div>` +
            `<div class="${txCls}" title="${esc(text)}">${body}</div>` +
            `${gem}${stats}</div>`;
    }
    return { render, art, unitArt, stat, keywords, esc, richText, heroRgb };
})();
