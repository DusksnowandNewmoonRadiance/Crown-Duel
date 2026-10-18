/* 生成文件：由 src/ui/iconmap.ts 编译而来，请改 TypeScript 源码后运行 npm run build，不要直接编辑本文件。 */
/* ============================================================================
   卡牌 → 图标映射 CardIcons
   ----------------------------------------------------------------------------
   给每张卡决定卡面中央的图标。优先级（高 → 低）：
     1. 卡牌自带的 icon 字段（DIY 工坊里手选，或数据里显式写了）
     2. OVERRIDES：「卡牌师:卡牌id」→ 图标，策划想单独换某张卡的图标就改这里
     3. 关键字（火炮 / 嘲讽 / 冲锋 / 废料……）
     4. 按效果 id 与描述文字的规则（RULES，从上到下第一条命中的生效）
     5. 卡牌师的默认徽记
   这些规则不改变任何游戏规则，只影响外观。
   ============================================================================ */
const CardIcons = (() => {
    /** 单卡覆盖：键为「卡牌师:卡牌id」 */
    const OVERRIDES = {
        "苏苏:winter": "snow",
        "苏苏:reddawn": "sun",
        "苏苏:peoplearmy": "people",
        "苏苏:blrSteelTide": "tank",
        "苏苏:awaSwap": "swap",
        "字母:evasion": "ghost",
        "字母:vanguard": "banner",
        "七星:cometfall": "comet",
        "七星:cometStrike": "comet",
        "七星:cometTutor": "comet",
        "七星:cometTrail": "comet",
        "七星:foresee": "eye",
        "七星:starClimb": "orbit",
        "七星:gravityLock": "lock",
        "核弹:superman": "crown",
        "核弹:ritual": "crown",
        "猪瘟鱼:escape": "dash",
        "猪瘟鱼:vault": "lock",
        "八幡:luckycoin": "coin",
        "八幡:finish": "skull",
        "045:copycrown": "crown",
        "045:highcommand": "crown",
        "下水:saturation": "burst",
        "下水:volley": "burst",
        "绘梨衣:crown": "crown",
        "白猫:night": "hourglass",
        "白猫:pollute": "skull",
        "白猫:kitten": "paper",
        "白猫:meteor": "comet",
        "核弹:stealth": "ghost",
        "核弹:vanish": "ghost",
        "核弹:phasepiercer": "sword",
        "核弹:teaunit": "heal",
        "八幡:deckhand": "anchor",
        "八幡:pirate": "anchor",
        "八幡:raider": "banner",
        "八幡:stalker": "sword",
        "八幡:wallbreaker": "sword",
        "苏苏:commissar": "banner",
        "苏苏:red": "star",
    };
    /** 令牌（衍生物）图标 */
    const TOKEN_ICON = {
        redGuard: "star", redTank: "tank", redArtillery: "cannon", scrap: "gear", scrapUnit: "gear",
        pirateScout: "anchor", pirateCry: "anchor", stunClub: "snow", duck: "people", junk: "trash",
        second: "star", third: "star", awaBand: "ghost", diyPunish: "skull",
    };
    /** 卡牌师默认徽记（没有任何规则命中时用） */
    const HERO_ICON = {
        "苏苏": "star", "字母": "shield", "七星": "orbit", "核弹": "burst", "猪瘟鱼": "fish",
        "八幡": "anchor", "045": "book", "下水": "cannon", "绘梨衣": "leaf", "白猫": "paper",
    };
    /* 规则按「效果 id + 描述」拼成的字符串匹配；越具体的越靠前。 */
    const RULES = [
        [/intel|scry|foresee|reveal|confiscate|情报|查看/, "eye"],
        [/rebel|takeover|策反|控制权/, "swap"],
        [/steal|bribe|launder|luckyCoin|vaultBurst|偷取|金钱|元/, "coin"],
        [/decay|doomsday|withering|eclipse|衰减|时间/, "hourglass"],
        [/lockCap|lockSpell|gravityLock|stasisField|silence|disruption|removeRestrict|封锁|无法打出|权限/, "lock"],
        [/stun|freeze|enemyAtkDown|frost|眩晕|冻结|攻击力 -/, "snow"],
        [/energyDown|manaBurn|ramp|crystal|费用|水晶|法力/, "gem"],
        [/summonSuperman|summonRed|fillRed|summoncall|namecardsummon|summonRandom|scrapSummon|pirateDiscover|召唤/, "people"],
        [/consolidate|convert|upcycle|remelt|transform|reshuffle|adapt|handoff|trade|scrapToUnits|转化|整编/, "cycle"],
        [/scrap|废料|碎纸/, "gear"],
        [/heal|restore|rum|治疗|恢复/, "heal"],
        [/armor|barrier|shield|timeShield|护甲/, "shield"],
        [/aoe|sweep|burst|firebomb|fireShip|sacAoe|saturation|volley|横扫|所有敌方/, "burst"],
        [/damage|hero\d|cometStrike|finish|airstrike|revenge|bombard|sanction|raid|造成.*伤害/, "bolt"],
        [/draw|supply|tutor|search|foresee|discover|pick|抽\s*\d*\s*张|展示/, "cards"],
        [/buff|boost|force|bless|rally|pump|highcommand|namecard|增益|获得 ?\+/, "buff"],
        [/discard|burn|corrupt|pollute|junk|killTough|stripTaunt|消灭|弃/, "trash"],
        [/crown|sovereign|皇冠/, "crown"],
    ];
    const hasIcon = (id) => !!id && typeof DuelIcons !== "undefined" && DuelIcons.has(id);
    function forCard(c) {
        if (!c)
            return "question";
        if (hasIcon(c.icon))
            return c.icon;
        const key = (c.hero || "") + ":" + c.id;
        if (OVERRIDES[key] && hasIcon(OVERRIDES[key]))
            return OVERRIDES[key];
        if (!c.hero && TOKEN_ICON[c.id])
            return TOKEN_ICON[c.id];
        /* 关键字：单位优先按身份给图标；法术走规则 */
        if (c.kind === "unit") {
            if (c.gun)
                return "cannon";
            if (c.scrap)
                return "gear";
        }
        const probe = `${c.effect || ""} ${c.text || ""}`;
        const named = RULES.find(([re]) => re.test(probe));
        if (c.kind === "spell")
            return (named && named[1]) || HERO_ICON[c.hero || ""] || "star";
        /* 单位：有「部署 / 回收」等效果文字时按规则；纯数值单位按关键字或卡牌师徽记 */
        if (named && /部署|回收|亡语|each|Deploy|deploy/.test(probe))
            return named[1];
        if (c.untargetable)
            return "ghost";
        if (c.ignoreTaunt)
            return "sword";
        if (c.taunt)
            return "bulwark";
        if (c.charge)
            return "dash";
        if (named && c.effect)
            return named[1];
        return HERO_ICON[c.hero || ""] || "sword";
    }
    /** 卡面中央大图标（已套好描边 / 尺寸） */
    const art = (c, size) => DuelIcons.svg(forCard(c), { size: size === undefined ? "100%" : size, stroke: 1.3, cls: "ico" });
    return { forCard, art, OVERRIDES, HERO_ICON };
})();
