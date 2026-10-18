/* 生成文件：由 src/ui/targeting.ts 编译而来，请改 TypeScript 源码后运行 npm run build，不要直接编辑本文件。 */
/* ============================================================================
   瞄准箭头 Targeting
   ----------------------------------------------------------------------------
   只负责「画」：给定起点、终点和状态色，在舞台上方的 SVG 层画出
     · 一条弧形点列（蓝图虚线）+ 流动的光点
     · 终点箭头
     · 终点准星：自由状态是旋转的十字环；吸附到目标时变成四角取景框
   不读对局状态、不处理输入；输入逻辑见 input.ts。
   坐标一律是舞台坐标（1280 × 舞台高度，与 #aim 的 viewBox 一致）。
   ============================================================================ */
const Targeting = (() => {
    const NS = "http://www.w3.org/2000/svg";
    let root = null;
    let body, glow, flow, head;
    let reticle, freeRet, snapRet, brackets;
    const make = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs)
            el.setAttribute(k, String(attrs[k]));
        if (parent)
            parent.appendChild(el);
        return el;
    };
    /** 把 #aim 的内容换成瞄准层（只会做一次） */
    function mount(svg) {
        if (root === svg)
            return;
        root = svg;
        svg.innerHTML = "";
        svg.classList.add("aim-layer");
        glow = make("path", { class: "a-glow", fill: "none" }, svg);
        body = make("path", { class: "a-body", fill: "none" }, svg);
        flow = make("path", { class: "a-flow", fill: "none" }, svg);
        head = make("path", { class: "a-head" }, svg);
        reticle = make("g", { class: "a-ret" }, svg);
        freeRet = make("g", { class: "a-free" }, reticle);
        make("circle", { r: 13, fill: "none", class: "ring" }, freeRet);
        make("circle", { r: 20, fill: "none", class: "ring2" }, freeRet);
        make("path", { d: "M0-27V-17M0 17V27M-27 0H-17M17 0H27", class: "ticks", fill: "none" }, freeRet);
        make("circle", { r: 1.8, class: "dot" }, freeRet);
        snapRet = make("g", { class: "a-snap" }, reticle);
        brackets = make("path", { class: "brk", fill: "none" }, snapRet);
        make("circle", { r: 2.4, class: "dot" }, snapRet);
    }
    function setTone(tone) {
        if (!root)
            return;
        root.dataset.tone = tone;
    }
    /** 画（或更新）一条从 from 指向 to 的箭头 */
    function draw(from, to, opts) {
        if (!root)
            return;
        const o = opts || {};
        const end = o.snap ? { x: o.snap.x + o.snap.w / 2, y: o.snap.y + o.snap.h / 2 } : to;
        setTone(o.tone || "neutral");
        const dx = end.x - from.x, dy = end.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        /* 弧线：控制点抬高，越远越高；贴近时几乎是直线 */
        const lift = Math.min(150, 24 + dist * 0.28);
        const cp = { x: (from.x + end.x) / 2, y: Math.min(from.y, end.y) - lift * (dy < 0 ? 0.55 : 1) };
        /* 终点前留出箭头 + 准星的位置 */
        const tx = end.x - cp.x, ty = end.y - cp.y, tl = Math.hypot(tx, ty) || 1;
        const ux = tx / tl, uy = ty / tl;
        const pull = o.snap ? Math.min(dist * 0.5, Math.max(o.snap.w, o.snap.h) / 2 + 6) : 24;
        const stop = { x: end.x - ux * pull, y: end.y - uy * pull };
        const d = `M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${stop.x.toFixed(1)} ${stop.y.toFixed(1)}`;
        for (const p of [glow, body, flow])
            p.setAttribute("d", d);
        /* 箭头：尖朝向切线方向 */
        const hl = 15, hw = 9;
        const bx = stop.x - ux * hl, by = stop.y - uy * hl;
        head.setAttribute("d", `M${stop.x.toFixed(1)} ${stop.y.toFixed(1)}L${(bx - uy * hw).toFixed(1)} ${(by + ux * hw).toFixed(1)}L${(bx + ux * 4).toFixed(1)} ${(by + uy * 4).toFixed(1)}L${(bx + uy * hw).toFixed(1)} ${(by - ux * hw).toFixed(1)}Z`);
        reticle.setAttribute("transform", `translate(${end.x.toFixed(1)} ${end.y.toFixed(1)})`);
        if (o.snap) {
            const hw2 = o.snap.w / 2 + 5, hh2 = o.snap.h / 2 + 5, t = Math.min(14, hw2 * 0.6, hh2 * 0.6);
            brackets.setAttribute("d", `M${-hw2} ${-hh2 + t}V${-hh2}H${-hw2 + t}M${hw2 - t} ${-hh2}H${hw2}V${-hh2 + t}` +
                `M${hw2} ${hh2 - t}V${hh2}H${hw2 - t}M${-hw2 + t} ${hh2}H${-hw2}V${hh2 - t}`);
        }
        root.classList.toggle("snapped", !!o.snap);
        root.removeAttribute("hidden");
    }
    function hide() {
        if (root) {
            root.setAttribute("hidden", "");
            root.classList.remove("snapped");
        }
    }
    return { mount, draw, hide, setTone };
})();
