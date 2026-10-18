/* 批量截图：桌面 / 手机竖屏 / 手机横屏 / 平板，覆盖主页、DIY 工坊、卡组、大厅、对局 */
const PORT = process.argv[2] || "9333";
const APP = process.argv[3] || "http://127.0.0.1:3970/";
const OUT = process.argv[4] || "screenshots";
const fs = require("fs");
fs.mkdirSync(OUT, { recursive: true });

async function newTarget() { const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" }); return r.json(); }
function connect(u) {
  const ws = new WebSocket(u); let id = 0; const p = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
  const ready = new Promise((r) => ws.addEventListener("open", r));
  const send = (method, params) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  return { ws, ready, send };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t = await newTarget();
  const { ws, ready, send } = connect(t.webSocketDebuggerUrl);
  await ready;
  await send("Page.enable"); await send("Runtime.enable");
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const f = `${OUT}/${name}.png`;
    fs.writeFileSync(f, Buffer.from(r.result.data, "base64"));
    console.log("  saved", f, fs.statSync(f).size, "bytes");
  };
  const click = async (sel, ms) => {
    await send("Runtime.evaluate", { expression: `(()=>{const e=document.querySelector('${sel}');if(e)e.click();return !!e;})()`, returnByValue: true });
    await sleep(ms || 700);
  };
  const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.result.value;

  const viewports = [
    { name: "desktop", w: 1440, h: 900, mobile: false },
    { name: "phone", w: 390, h: 844, mobile: true },
    { name: "phone-landscape", w: 844, h: 390, mobile: true },
    { name: "tablet", w: 768, h: 1024, mobile: true },
  ];

  for (const vp of viewports) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile, maxTouchPoints: vp.mobile ? 5 : 0 });
    await send("Page.navigate", { url: APP });
    await sleep(1600);
    console.log(`\n== ${vp.name} ${vp.w}x${vp.h} ==`);
    await shot(`${vp.name}-01-home`);

    // DIY 工坊（并载入内置苍蓝，让截图有内容）
    await click("#btnDiy", 1200);
    await js(`(()=>{const list=document.querySelectorAll('.diy-heroes button,.diy-heroes .diy-hero,.diy-hero');if(list.length)list[0].click();return list.length;})()`);
    await sleep(900);
    await shot(`${vp.name}-02-diy`);

    // 卡组页
    await click("#btnDeck", 1200);
    await shot(`${vp.name}-03-decks`);

    // 大厅
    await click("#btnOnline", 1500);
    await shot(`${vp.name}-04-lobby`);

    // 建房弹窗（含房间类型）
    await click("#btnCreate", 900);
    await shot(`${vp.name}-05-create`);
    await click("[data-close]", 400);

    // 单人练习 → 对局（只在桌面和手机竖屏截）
    if (vp.name === "desktop" || vp.name === "phone") {
      await send("Page.navigate", { url: APP }); await sleep(1500);
      await click("#btnSolo", 900);
      await shot(`${vp.name}-06-solo`);
      await click("#soloGo", 2200);
      await shot(`${vp.name}-07-game`);
    }
  }
  ws.close();
  console.log("\nall shots done");
})();
