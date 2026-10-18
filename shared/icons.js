/* 生成文件：由 src/shared/icons.ts 编译而来，请改 TypeScript 源码后运行 npm run build，不要直接编辑本文件。 */
/* ============================================================================
   皇冠对决 · 图标库 DuelIcons（浏览器与服务器共用）
   ----------------------------------------------------------------------------
   一套 24×24 描边图标，统一线宽 / 圆角，风格与「蓝图」主题一致。
   用途：卡面插画、关键字徽章、DIY 工坊的图标选择器。
   · 服务器用 has(id) 校验 DIY 卡牌的 icon 字段（只接受白名单里的 id，不接受任意 SVG）；
   · 浏览器用 svg(id, opts) 取得内联 SVG 字符串。
   新增图标：在 ICONS 里加一行 { label, d }，再到 src/ui/iconmap.ts 里决定哪些卡默认用它。
   ============================================================================ */
(function (root, factory) {
    if (typeof module === "object" && module && module.exports !== undefined)
        module.exports = factory();
    else
        root.DuelIcons = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
    /* 每个图标是一段 SVG 内部标记（继承 currentColor 描边）。 */
    const ICONS = {
        sword: { label: "剑", d: '<path d="M20 4L9 15M16 4h4v4M6.5 11.5l6 6M7.5 16.5L4 20"/>' },
        shield: { label: "盾", d: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/>' },
        bulwark: { label: "壁垒", d: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/><path d="M12 8v7M8.5 11.5h7"/>' },
        heart: { label: "心", d: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>' },
        heal: { label: "治疗", d: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M12 8.5v5M9.5 11h5"/>' },
        bolt: { label: "闪电", d: '<path d="M13.5 3L6 13.5h5L10.5 21 18 10.5h-5z"/>' },
        flame: { label: "火焰", d: '<path d="M12 3c.8 3.4 5 5.4 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.3 1.8 1.2 2.6 2 2.7C11 8.6 11 5.6 12 3z"/>' },
        burst: { label: "爆发", d: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>' },
        cards: { label: "抽牌", d: '<rect x="8" y="3.5" width="11" height="15" rx="2" transform="rotate(8 13.5 11)"/><rect x="4.5" y="6" width="11" height="15" rx="2" transform="rotate(-8 10 13.5)"/>' },
        coin: { label: "金币", d: '<circle cx="12" cy="12" r="8.2"/><path d="M12 8v8M9.6 10.3h4.8M9.6 13.7h4.8"/>' },
        gem: { label: "水晶", d: '<path d="M12 3l7 7-7 11-7-11z"/><path d="M5 10h14M9 10l3-7 3 7M9 10l3 11 3-11"/>' },
        eye: { label: "情报", d: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>' },
        gear: { label: "齿轮", d: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.4"/><path d="M12 3.4v2.4M12 18.2v2.4M3.4 12h2.4M18.2 12h2.4M6 6l1.7 1.7M16.3 16.3L18 18M18 6l-1.7 1.7M7.7 16.3L6 18"/>' },
        star: { label: "星", d: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.8l-5.3 3 1.1-5.9-4.4-4.1 6-.8z"/>' },
        banner: { label: "旗帜", d: '<path d="M6 3v18"/><path d="M6 4.5c4-2 8 2 12 0v9c-4 2-8-2-12 0z"/>' },
        people: { label: "召唤", d: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19c0-3.2 2.4-5.5 5.5-5.5s5.5 2.3 5.5 5.5M15.5 14.2c3 0 5 1.8 5 4.8"/>' },
        buff: { label: "增益", d: '<path d="M6 12l6-6 6 6M6 19l6-6 6 6"/>' },
        debuff: { label: "减益", d: '<path d="M6 5l6 6 6-6M6 12l6 6 6-6"/>' },
        snow: { label: "冰冻", d: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M9.8 4.8L12 6.8l2.2-2M9.8 19.2L12 17.2l2.2 2"/>' },
        hourglass: { label: "沙漏", d: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>' },
        cycle: { label: "转化", d: '<path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/>' },
        skull: { label: "亡语", d: '<path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 20v-2.2M14 20v-2.2"/>' },
        cannon: { label: "火炮", d: '<path d="M4 13.5l10.5-6 3.5 5.2L7.5 18.5z"/><circle cx="9" cy="19.5" r="2.4"/><path d="M18 8.5l3-1.6"/>' },
        dash: { label: "冲锋", d: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>' },
        lock: { label: "封锁", d: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14v2.4"/>' },
        scroll: { label: "法令", d: '<path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2z"/><path d="M9 9h6M9 13h6M9 17h3"/>' },
        crown: { label: "皇冠", d: '<path d="M3 8.5l3.6 2.4L12 5l5.4 5.9L21 8.5l-1.7 9.2a1 1 0 0 1-1 .8H5.7a1 1 0 0 1-1-.8z"/><path d="M5 21h14"/>' },
        swap: { label: "交换", d: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>' },
        target: { label: "瞄准", d: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>' },
        wave: { label: "冲击波", d: '<path d="M3 15c3-6 6-6 9 0s6 6 9 0M3 9c3-6 6-6 9 0s6 6 9 0" opacity="0.55"/><path d="M3 12c3-6 6-6 9 0s6 6 9 0"/>' },
        comet: { label: "彗星", d: '<circle cx="16.5" cy="7.5" r="3.2"/><path d="M14 10L4 20M11.5 8l-7.5 7.5M16 13l-7.5 7.5" opacity="0.8"/>' },
        tank: { label: "坦克", d: '<path d="M4 14.5h16l-1.6 4.5H5.6z"/><path d="M8 14.5v-3h8v3M12 11.5V9M12 9h6"/>' },
        dice: { label: "随机", d: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/>' },
        trash: { label: "弃牌", d: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v6M14 11v6"/>' },
        fish: { label: "鱼", d: '<path d="M3 12c3-5 9-6 13-2.5 1-.8 3-2 5-2.5-.8 2-.8 4 0 6-2-.5-4-1.7-5-2.5C12 16.5 6 17 3 12z"/><circle cx="8.5" cy="11" r="1" fill="currentColor"/>' },
        anchor: { label: "锚", d: '<circle cx="12" cy="5.5" r="2.2"/><path d="M12 7.7V20M7.5 10.5h9M4.5 14c.4 4 3.6 6 7.5 6s7.1-2 7.5-6M4.5 14l-1.5 2M19.5 14l1.5 2"/>' },
        leaf: { label: "叶", d: '<path d="M12 3c5 3 6 8 0 14C6 11 7 6 12 3z"/><path d="M12 7v13M12 12l-3-2M12 14l3-2"/>' },
        paper: { label: "纸页", d: '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h4"/>' },
        book: { label: "典籍", d: '<path d="M12 6.5C10 5 6.6 4.6 4 5.4v13c2.6-.8 6-.4 8 1.1 2-1.5 5.4-1.9 8-1.1v-13c-2.6-.8-6-.4-8 1.1z"/><path d="M12 6.5v13"/>' },
        orbit: { label: "星轨", d: '<circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/><circle cx="19" cy="8" r="1.2" fill="currentColor"/>' },
        hand: { label: "手牌", d: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V13c0 4-2.2 7-5.5 7C8.4 20 7 18.5 5.5 15.6L4.6 13.8a1.4 1.4 0 0 1 2.3-1.5L8 13.5"/>' },
        ghost: { label: "隐匿", d: '<path d="M5.5 20V11a6.5 6.5 0 0 1 13 0v9l-2.2-1.8-2.1 1.8-2.2-1.8-2.2 1.8-2.1-1.8z"/><circle cx="10" cy="11" r="1.1" fill="currentColor"/><circle cx="14" cy="11" r="1.1" fill="currentColor"/>' },
        sun: { label: "圣光", d: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>' },
        plus: { label: "加号", d: '<path d="M12 5v14M5 12h14"/>' },
        question: { label: "未知", d: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9M12 17v.2"/>' },
    };
    const IDS = Object.keys(ICONS);
    const has = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(ICONS, id);
    /** 返回内联 SVG 字符串；id 不存在时退回「未知」图标 */
    function svg(id, opts) {
        const o = opts || {};
        const def = has(id) ? ICONS[id] : ICONS.question;
        const size = o.size === undefined ? "1em" : typeof o.size === "number" ? o.size + "px" : o.size;
        const cls = o.cls ? ` class="${o.cls}"` : "";
        return `<svg${cls} viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${o.stroke || 1.6}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${def.d}</svg>`;
    }
    const labelOf = (id) => (has(id) ? ICONS[id].label : "");
    const list = () => IDS.map((id) => ({ id, label: ICONS[id].label }));
    return { IDS, has, svg, labelOf, list };
});
