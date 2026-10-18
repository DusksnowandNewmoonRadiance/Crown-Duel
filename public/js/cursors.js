/* 生成文件：由 src/ui/cursors.ts 编译而来，请改 TypeScript 源码后运行 npm run build，不要直接编辑本文件。 */
/* ============================================================================
   主题光标 Cursors
   ----------------------------------------------------------------------------
   与「蓝图」主题一致的一套光标（白线 + 深色描边保证任何底色上都看得清，金色作唯一强调）：
     arrow   默认指针：锐角箭头，尖端一个金色小菱形
     hand    可点击：十字环 + 金色圆心
     grab    可拖拽（手牌 / 可行动的单位）：四角取景框 + 圆心
     target  瞄准中：十字准星
     lock    悬停在合法目标上：金色锁定框
     deny    悬停在非法目标上：划掉的圆
   用法：import 时自动注入一份 <style>；对局输入层通过舞台（#stage）上的类切换瞄准态
         （aiming / aim-valid / aim-invalid / holding）。
   光标图为内联 SVG（data URI），无额外请求。
   ============================================================================ */
const Cursors = (() => {
    const INK = "#0c0c0e", PAPER = "#f4f4f1", GOLD = "#f0b429", RED = "#e0705f", DIM = "#9a9aa2";
    /** 一条线画两遍：先深色粗描边，再浅色细线 */
    const stroke = (d, c = PAPER, w = 1.5) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const circle = (r, c = PAPER, w = 1.5) => `<circle cx="16" cy="16" r="${r}" fill="none" stroke="${INK}" stroke-width="${w + 2}"/><circle cx="16" cy="16" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
    const dot = (c = GOLD, r = 2) => `<circle cx="16" cy="16" r="${r + 1}" fill="${INK}"/><circle cx="16" cy="16" r="${r}" fill="${c}"/>`;
    const corners = (a, t, c) => stroke(`M${16 - a} ${16 - a + t}V${16 - a}H${16 - a + t}M${16 + a - t} ${16 - a}H${16 + a}V${16 - a + t}M${16 + a} ${16 + a - t}V${16 + a}H${16 + a - t}M${16 - a + t} ${16 + a}H${16 - a}V${16 + a - t}`, c, 1.6);
    const SHAPES = {
        arrow: {
            x: 4, y: 3,
            body: `<path d="M4 3V23.5L9.2 18.6 12.6 26.4 16.1 24.9 12.8 17.2H20.2Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
                `<path d="M4 1.2L6 3.2 4 5.2 2 3.2Z" fill="${GOLD}" stroke="${INK}" stroke-width="1"/>`,
        },
        hand: {
            x: 16, y: 16,
            body: circle(7.5) + stroke("M16 4.5V9M16 23V27.5M4.5 16H9M23 16H27.5") + dot(),
        },
        grab: {
            x: 16, y: 16,
            body: corners(10, 4.5, PAPER) + circle(4.2, PAPER, 1.3) + dot(GOLD, 1.7),
        },
        target: {
            x: 16, y: 16,
            body: circle(8.5) + stroke("M16 2.5V9.5M16 22.5V29.5M2.5 16H9.5M22.5 16H29.5") + dot(PAPER, 1.4),
        },
        lock: {
            x: 16, y: 16,
            body: corners(11, 5, GOLD) + circle(5.6, GOLD, 1.5) + dot(GOLD, 2),
        },
        deny: {
            x: 16, y: 16,
            body: circle(8.5, DIM, 1.5) + stroke("M10 10L22 22", RED, 1.8),
        },
    };
    const url = (k) => {
        const s = SHAPES[k];
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${s.body}</svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${s.x} ${s.y}`;
    };
    function css() {
        const v = (k, fb) => `${url(k)}, ${fb}`;
        return `
:root{--cur-arrow:${v("arrow", "default")};--cur-hand:${v("hand", "pointer")};--cur-grab:${v("grab", "grab")};
  --cur-target:${v("target", "crosshair")};--cur-lock:${v("lock", "crosshair")};--cur-deny:${v("deny", "not-allowed")}}
html,body{cursor:var(--cur-arrow)}
a,button,[role="button"],label,select,summary,.btn,.chip,.icon-btn,.round-btn,.seg button,.act,.act-row,.htile,.oc,.dc .card,.cx-card,.cos-chip{cursor:var(--cur-hand)}
button:disabled,.btn:disabled{cursor:var(--cur-deny)}
input,textarea{cursor:text}
.hcard,.unit.can .u,.hcard.play{cursor:var(--cur-grab)}
.unit.tgt .u,.portrait.tgt,.unit.choose .u{cursor:var(--cur-target)}
#stage.aiming,#stage.aiming *{cursor:var(--cur-target)!important}
#stage.aiming.aim-valid,#stage.aiming.aim-valid *{cursor:var(--cur-lock)!important}
#stage.aiming.aim-invalid,#stage.aiming.aim-invalid *{cursor:var(--cur-deny)!important}
#stage.holding,#stage.holding *{cursor:var(--cur-grab)!important}
`;
    }
    function install() {
        if (document.getElementById("cd-cursors"))
            return;
        const st = document.createElement("style");
        st.id = "cd-cursors";
        st.textContent = css();
        document.head.appendChild(st);
    }
    install();
    return { install, css, url };
})();
