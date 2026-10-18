/* ============================================================================
   对局输入控制器 GameInput
   ----------------------------------------------------------------------------
   把「指针 / 键盘」翻译成游戏动作的状态机。统一规则：

     拿起 ──▶ 放下 / 瞄准 ──▶ 确认 或 取消

   手牌
     · 按住拖出：牌跟着指针，拖到战场上松手 = 打出；松手在别处 = 放回
     · 点一下：牌被「拿起」（抬高 + 战场亮起），再点战场任意处 = 打出；点别处 / Esc / 右键 = 放回
     · 需要目标的牌（指向性法术）：打出后进入「瞄准」，箭头从落点飞向指针
   单位（可攻击时发光）
     · 按住拖向目标，松手 = 攻击；松手在别处 = 取消
     · 点一下：进入「瞄准」，箭头跟着指针，点合法目标 = 攻击；点空白 / Esc / 右键 = 取消
   瞄准时
     · 合法目标被框住并亮起，非法目标变暗；指针变为「锁定 / 禁止」光标
     · 点非法目标：提示原因（例如「必须先攻击嘲讽」）并保持瞄准
   键盘
     · 1–9 拿起第 N 张手牌　Enter 打出已拿起的牌 / 确认多选　Esc 逐级取消　Space / E 结束回合（在 game-ui）

   本模块不直接改 DOM 结构，也不发网络请求：所有对局动作通过 InputHost 回到 game-ui。
   ============================================================================ */
const GameInput = (() => {
  type Mode = "idle" | "carry" | "aim";
  type Kind = "hand" | "unit" | "hero" | "bg";

  interface Box { x: number; y: number; w: number; h: number }
  interface CastState { card: CardLike; spec: TargetSpec; picked: number[] }
  interface UiState {
    sel: { type: "hand" | "unit"; uid: number } | null;
    cast: CastState | null;
    drag: { uid: number } | null;
  }
  type TargetHit =
    | { kind: "unit"; uid: number; side: "me" | "foe"; el: HTMLElement }
    | { kind: "hero"; side: "me" | "foe"; el: HTMLElement };

  interface InputHost {
    ui: UiState;
    stage(): HTMLElement;
    scale(): number;
    view(): GameView | null;
    engine(): EngineQueries;
    canAct(): boolean;
    toStage(clientX: number, clientY: number): Point;
    /** 元素在舞台坐标下的中心点与尺寸（FX.pos） */
    pos(el: Element): Box;
    unitEl(uid: number): HTMLElement | null;
    heroEl(side: "me" | "foe"): HTMLElement | null;
    handEl(uid: number): HTMLElement | null;
    /** 出牌线以上算「战场」 */
    laneLimitY(): number;
    setLane(state: "ready" | "bad" | null, hint?: string): void;
    playCard(card: CardLike, targets?: number[]): void;
    /** 有「二选一」时打开选择框并返回 true */
    openOption(card: CardLike): boolean;
    attack(unit: UnitView, target: number | null): void;
    toast(msg: string, info?: boolean): void;
    sfx(name: string): void;
    render(): void;
    showPreview(c: CardLike, el: HTMLElement, ms?: number): void;
    hidePreview(): void;
    shakeTaunts(): void;
    cardOf(el: HTMLElement): CardLike | null;
    /** 点在这些区域上不处理（弹窗、侧栏、聊天……） */
    blocked(target: Element): boolean;
    audioInit(): void;
  }

  interface Press {
    id: number; x: number; y: number; kind: Kind; uid: number | null; side: string | null;
    el: HTMLElement | null; touch: boolean; moved: boolean; long: boolean; timer: number;
    /** 这次按下发生时是否已经处于瞄准（用于「点击确认目标」） */
    wasAim: boolean;
    drag: "hand" | "aim" | null;
  }
  interface Aim {
    kind: "attack" | "cast";
    via: "drag" | "click";
    origin: Point;
    uid: number;            // 攻击者 uid（attack）或 0
    last: Point;            // 指针最后位置（舞台坐标）
    hover: TargetHit | null;
  }

  const DRAG_THRESHOLD = 9;
  let H: InputHost;
  let press: Press | null = null;
  let aim: Aim | null = null;
  let hotEl: HTMLElement | null = null;

  const ui = (): UiState => H.ui;
  const mode = (): Mode => (aim ? "aim" : ui().sel && ui().sel!.type === "hand" ? "carry" : "idle");

  /* ---------------- 查询 ---------------- */
  function myUnit(uid: number): UnitView | undefined {
    const v = H.view();
    return v ? v.me.board.find((u) => u.uid === uid) : undefined;
  }
  function targetAt(clientX: number, clientY: number): TargetHit | null {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const un = el.closest<HTMLElement>(".unit");
    if (un && !(un as HTMLElement & { _dying?: boolean })._dying) {
      return { kind: "unit", uid: +(un.dataset.uid || 0), side: (un.dataset.side as "me" | "foe") || "foe", el: un };
    }
    const hero = el.closest<HTMLElement>("#foeHero,#meHero");
    if (hero) {
      const side = hero.id === "foeHero" ? "foe" : "me";
      const por = H.heroEl(side);
      if (por) return { kind: "hero", side, el: por };
    }
    return null;
  }
  /** 当前瞄准下，这个目标合法吗？null = 合法；否则返回原因 */
  function whyNot(t: TargetHit): string | null {
    const v = H.view();
    if (!v || !aim) return "";
    if (aim.kind === "attack") {
      const u = myUnit(aim.uid);
      if (!u) return "";
      const tg = H.engine().attackTargets(u, v.foe);
      if (t.kind === "hero") return t.side === "foe" ? (tg.hero ? null : v.foe.heroImmune ? "敌方英雄处于免疫状态" : "必须先攻击带嘲讽的单位") : "不能攻击自己的英雄";
      if (t.side === "me") return "不能攻击自己的单位";
      if (tg.units.includes(t.uid)) return null;
      const tu = v.foe.board.find((x) => x.uid === t.uid);
      return tu && tu.untargetable ? "这个单位无法被攻击" : "必须先攻击带嘲讽的单位";
    }
    const cs = ui().cast;
    if (!cs) return "";
    if (t.kind === "hero") return "这张牌只能指定单位";
    if (t.side !== cs.spec.side) return cs.spec.side === "foe" ? "请选择敌方单位" : "请选择己方单位";
    return cs.spec.eligible.includes(t.uid) ? null : "这个单位不能被选择";
  }

  /* ---------------- 瞄准绘制 ---------------- */
  /** 光标状态类挂在舞台上而不是 body：body 上的类变化会让整页样式失效，舞台子树小得多 */
  function setBody(tone: "neutral" | "valid" | "invalid" | null): void {
    const b = H.stage().classList;
    b.toggle("aiming", tone !== null);
    b.toggle("aim-valid", tone === "valid");
    b.toggle("aim-invalid", tone === "invalid");
  }
  function setHot(el: HTMLElement | null): void {
    if (hotEl === el) return;
    if (hotEl) hotEl.classList.remove("hot");
    hotEl = el;
    if (hotEl) hotEl.classList.add("hot");
  }
  function boxOf(el: Element): Box {
    const p = H.pos(el);
    return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
  }
  function redrawAim(): void {
    if (!aim) { Targeting.hide(); setBody(null); setHot(null); return; }
    const hit = aim.hover;
    const why = hit ? whyNot(hit) : "";
    const tone = !hit ? "neutral" : why === null ? "valid" : "invalid";
    Targeting.draw(aim.origin, aim.last, { tone, snap: hit && why === null ? boxOf(hit.el) : null });
    setBody(tone);
    setHot(hit && why === null ? hit.el : null);
  }
  /** 点击进入瞄准后没有按键按下，需要单独跟踪指针移动 */
  const onAimMove = (e: PointerEvent): void => { if (aim && e.pointerType === "mouse") moveAim(e.clientX, e.clientY); };
  function startAim(a: Aim): void {
    aim = a;
    removeEventListener("pointermove", onAimMove);
    addEventListener("pointermove", onAimMove);
    H.hidePreview();
    H.sfx("select");
    H.render();
    redrawAim();
  }
  function endAim(rerender = true): void {
    const was = aim;
    aim = null;
    removeEventListener("pointermove", onAimMove);
    Targeting.hide(); setBody(null); setHot(null);
    if (was && rerender) H.render();
  }
  function moveAim(clientX: number, clientY: number): void {
    if (!aim) return;
    aim.last = H.toStage(clientX, clientY);
    aim.hover = targetAt(clientX, clientY);
    redrawAim();
  }

  /* ---------------- 出牌 / 攻击 ---------------- */
  /** 打出一张牌。from 是箭头起点（指向性法术用）。 */
  function tryPlay(c: CardLike, from?: Point): void {
    const v = H.view();
    if (!v || !H.canAct()) return;
    const eng = H.engine();
    const err = eng.playError(c, v.me, v.foe);
    if (err) { H.toast(err); H.sfx("error"); clearSel(); return; }
    H.hidePreview();
    if (H.openOption(c)) { ui().sel = null; return; }
    const spec = eng.targetSpec(c, v.me, v.foe);
    if (spec) {
      ui().sel = null;
      ui().cast = { card: c, spec, picked: [] };
      const origin = from || castOrigin(c);
      startAim({ kind: "cast", via: "click", origin, uid: 0, last: origin, hover: null });
      return;
    }
    ui().sel = null;
    H.playCard(c);
  }
  function castOrigin(c: CardLike): Point {
    const el = c.uid !== undefined ? H.handEl(c.uid) : null;
    if (el) { const p = H.pos(el); return { x: p.x, y: p.y - p.h * 0.25 }; }
    return { x: 640, y: 480 };
  }
  function toggleCast(uid: number): void {
    const cs = ui().cast;
    if (!cs || !cs.spec.eligible.includes(uid)) return;
    const i = cs.picked.indexOf(uid);
    if (i >= 0) cs.picked.splice(i, 1);
    else if (cs.picked.length < cs.spec.max) { cs.picked.push(uid); H.sfx("pick"); }
    else if (cs.spec.max === 1) cs.picked = [uid];
    else { H.toast(`最多选择 ${cs.spec.max} 个`); return; }
    if (cs.spec.max === 1 && cs.picked.length === 1) { commitCast(); return; }
    H.render();
    redrawAim();
  }
  function commitCast(): void {
    const cs = ui().cast;
    if (!cs) return;
    if (cs.picked.length < cs.spec.min) { H.toast(`至少选择 ${cs.spec.min} 个`); return; }
    ui().cast = null;
    endAim(false);
    H.playCard(cs.card, cs.picked.slice());
  }
  function cancelCast(): void {
    if (!ui().cast) return;
    ui().cast = null;
    H.sfx("click");
    endAim();
  }
  function tryAttack(u: UnitView, target: number | null): void {
    if (!H.canAct()) return;
    const e = H.engine().canAttack(u);
    if (e) { H.toast(e, true); return; }
    ui().sel = null;
    endAim(false);
    H.attack(u, target);
  }
  function clearSel(): void {
    ui().sel = null;
    ui().drag = null;
    H.hidePreview();
    endAim(false);
    H.setLane(null);
    if (H.view()) H.render();
  }
  /** 逐级取消：先取消瞄准 / 指向性施法，再放下手牌；返回是否取消了什么 */
  function cancel(): boolean {
    if (ui().cast) { cancelCast(); return true; }
    if (aim || ui().sel) { clearSel(); return true; }
    return false;
  }

  /* ---------------- 指针 ---------------- */
  function onDown(e: PointerEvent): void {
    const v = H.view();
    if (!v || e.button > 0 || press) return;
    const tg = e.target as Element;
    if (H.blocked(tg)) return;
    H.audioInit();
    const hc = tg.closest<HTMLElement>(".hcard"), un = tg.closest<HTMLElement>(".unit"), hero = tg.closest<HTMLElement>(".portrait");
    const el = hc || un || hero;
    const pr: Press = {
      id: e.pointerId, x: e.clientX, y: e.clientY,
      kind: hc ? "hand" : un ? "unit" : hero ? "hero" : "bg",
      uid: el && el.dataset.uid ? +el.dataset.uid : null,
      side: un ? un.dataset.side || null : hero ? hero.dataset.hero || null : null,
      el, touch: e.pointerType !== "mouse", moved: false, long: false, timer: 0, wasAim: !!aim, drag: null,
    };
    press = pr;
    if (aim) { moveAim(e.clientX, e.clientY); }    // 触屏：按下时先把箭头对准手指
    else if (el && (hc || un)) {
      pr.timer = window.setTimeout(() => {
        if (press !== pr || pr.moved) return;
        pr.long = true;
        const c = H.cardOf(el);
        if (c) H.showPreview(c, el);
      }, 420);
    }
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onCancel);
  }

  function beginDrag(pr: Press): void {
    const v = H.view();
    if (!v) return;
    if (pr.kind === "hand" && H.canAct()) {
      const c = v.me.hand.find((x) => x.uid === pr.uid);
      if (!c) return;
      ui().drag = { uid: c.uid as number };
      ui().sel = { type: "hand", uid: c.uid as number };
      H.hidePreview();
      H.render();
      pr.el = H.handEl(c.uid as number) || pr.el;
      pr.drag = "hand";
      H.stage().classList.add("holding");
    } else if (pr.kind === "unit" && pr.side === "me" && H.canAct()) {
      const u = myUnit(pr.uid as number);
      if (!u) return;
      const err = H.engine().canAttack(u);
      if (err) { H.toast(err, true); return; }
      ui().sel = { type: "unit", uid: u.uid };
      const el = H.unitEl(u.uid);
      const origin = el ? (() => { const p = H.pos(el); return { x: p.x, y: p.y }; })() : H.toStage(pr.x, pr.y);
      pr.drag = "aim";
      startAim({ kind: "attack", via: "drag", origin, uid: u.uid, last: origin, hover: null });
    }
  }

  function onMove(e: PointerEvent): void {
    const pr = press;
    if (!pr || pr.id !== e.pointerId) return;
    const dx = e.clientX - pr.x, dy = e.clientY - pr.y;
    if (!pr.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      pr.moved = true;
      window.clearTimeout(pr.timer);
      if (pr.long) { H.hidePreview(); return; }
      if (!aim) beginDrag(pr);                       // 已在瞄准时不再开始新拖拽
    }
    if (pr.drag === "hand" && pr.el) {
      const p = H.toStage(e.clientX, e.clientY);
      const s = H.scale();
      pr.el.style.transform = `translate(${dx / s}px,${dy / s}px) scale(1.06)`;
      const over = p.y < H.laneLimitY();
      const v = H.view()!;
      const c = v.me.hand.find((x) => x.uid === pr.uid);
      const bad = c ? H.engine().playError(c, v.me, v.foe) : null;
      H.setLane(over ? (bad ? "bad" : "ready") : null, over ? bad || "松手出牌" : "向上拖到这里出牌");
    } else if (pr.drag === "aim" || aim) {
      moveAim(e.clientX, e.clientY);
    }
  }

  function endPress(): Press | null {
    const pr = press;
    if (!pr) return null;
    window.clearTimeout(pr.timer);
    press = null;
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onCancel);
    if (H) H.stage().classList.remove("holding");
    return pr;
  }
  function onCancel(): void {
    const pr = endPress();
    if (!pr) return;
    if (pr.drag === "hand" && pr.el) pr.el.style.transform = "";
    ui().drag = null;
    H.setLane(null);
    clearSel();
  }

  function onUp(e: PointerEvent): void {
    const pr = endPress();
    if (!pr) return;
    if (pr.long) { if (pr.touch) window.setTimeout(H.hidePreview, 1400); return; }
    const v = H.view();
    if (!v) return;

    /* 拖出的手牌：松手 */
    if (pr.drag === "hand") {
      if (pr.el) pr.el.style.transform = "";
      const p = H.toStage(e.clientX, e.clientY);
      ui().drag = null;
      H.setLane(null, "松手出牌");
      const c = v.me.hand.find((x) => x.uid === pr.uid);
      if (c && p.y < H.laneLimitY()) tryPlay(c, p); else clearSel();
      return;
    }
    /* 拖出的攻击：松手 */
    if (pr.drag === "aim" && aim) {
      const hit = targetAt(e.clientX, e.clientY);
      const u = myUnit(aim.uid);
      if (u && hit && whyNot(hit) === null) tryAttack(u, hit.kind === "hero" ? null : hit.uid);
      else clearSel();
      return;
    }
    if (pr.moved) return;

    /* 点击 */
    if (aim) { tapWhileAiming(pr, e); return; }
    tap(pr, e);
  }

  /** 瞄准中的一次点击：合法目标 = 确认；非法目标 = 提示；空白 = 取消 */
  function tapWhileAiming(pr: Press, e: PointerEvent): void {
    if (!aim) return;
    const hit = targetAt(e.clientX, e.clientY);
    /* 点自己（攻击者本身 / 同一张牌）视为取消 */
    if (aim.kind === "attack" && pr.kind === "unit" && pr.side === "me" && pr.uid === aim.uid) { clearSel(); return; }
    if (!hit) { cancel(); return; }
    const why = whyNot(hit);
    if (why === null) {
      if (aim.kind === "attack") {
        const u = myUnit(aim.uid);
        if (u) tryAttack(u, hit.kind === "hero" ? null : hit.uid);
      } else if (hit.kind === "unit") toggleCast(hit.uid);
      return;
    }
    if (why) { H.toast(why); H.sfx("error"); if (/嘲讽/.test(why)) H.shakeTaunts(); }
    else cancel();
  }

  function tap(pr: Press, e: PointerEvent): void {
    const v = H.view();
    if (!v) return;
    if (pr.kind === "hand") {
      const c = v.me.hand.find((x) => x.uid === pr.uid);
      if (!c || !pr.el) return;
      if (!H.canAct()) { H.showPreview(c, pr.el, 1800); return; }
      if (ui().sel && ui().sel!.type === "hand" && ui().sel!.uid === c.uid) { clearSel(); H.sfx("click"); return; }   // 再点一次 = 放回
      ui().sel = { type: "hand", uid: c.uid as number };
      H.sfx("select");
      const err = H.engine().playError(c, v.me, v.foe);
      if (err) H.toast(err, true);
      H.render();
      return;
    }
    if (pr.kind === "unit" && pr.side === "me") {
      const u = myUnit(pr.uid as number);
      if (!u || !pr.el) return;
      if (!H.canAct()) { H.showPreview(u, pr.el, 1800); return; }
      const err = H.engine().canAttack(u);
      if (err) { H.toast(err, true); H.showPreview(u, pr.el, 1800); return; }
      ui().sel = { type: "unit", uid: u.uid };
      const p = H.pos(pr.el);
      const origin = { x: p.x, y: p.y };
      startAim({ kind: "attack", via: "click", origin, uid: u.uid, last: H.toStage(e.clientX, e.clientY), hover: null });
      return;
    }
    if (pr.kind === "unit" && pr.side === "foe") {
      const u = v.foe.board.find((x) => x.uid === pr.uid);
      if (u && pr.el) H.showPreview(u, pr.el, 2200);
      return;
    }
    /* 拿起了一张牌：点战场任意处放下 */
    const sel = ui().sel;
    if (sel && sel.type === "hand" && (e.target as Element).closest("#meLane,#foeLane,#midline")) {
      const c = v.me.hand.find((x) => x.uid === sel.uid);
      if (c) { tryPlay(c, H.toStage(e.clientX, e.clientY)); return; }
    }
    if (ui().sel) clearSel(); else H.hidePreview();
  }

  /* ---------------- 键盘 / 右键 ---------------- */
  function onKey(e: KeyboardEvent): boolean {
    const v = H.view();
    if (!v) return false;
    if (e.key === "Escape") return cancel();
    if (e.key === "Enter") {
      if (ui().cast && ui().cast!.spec.max > 1) { commitCast(); return true; }
      const sel = ui().sel;
      if (sel && sel.type === "hand") {
        const c = v.me.hand.find((x) => x.uid === sel.uid);
        if (c) { tryPlay(c); return true; }
      }
      return false;
    }
    if (/^[1-9]$/.test(e.key) && H.canAct() && !ui().cast) {
      const c = v.me.hand[+e.key - 1];
      if (c) {
        clearSel();
        ui().sel = { type: "hand", uid: c.uid as number };
        H.sfx("select");
        H.render();
        return true;
      }
    }
    return false;
  }
  function onContext(e: Event): void {
    e.preventDefault();
    cancel();
  }
  /** 手机上的「打出」按钮 */
  function playHeld(): void {
    const v = H.view();
    const sel = ui().sel;
    if (!v || !sel || sel.type !== "hand") return;
    const c = v.me.hand.find((x) => x.uid === sel.uid);
    if (c) tryPlay(c);
  }

  /* ---------------- 对外 ---------------- */
  function attach(host: InputHost): void {
    H = host;
    const st = host.stage();
    st.addEventListener("pointerdown", onDown);
    st.addEventListener("contextmenu", onContext);
    const aimSvg = document.getElementById("aim");
    if (aimSvg) Targeting.mount(aimSvg as unknown as SVGSVGElement);
  }
  /** 重新开始 / 离开对局时调用 */
  function reset(): void {
    endPress();
    aim = null;
    removeEventListener("pointermove", onAimMove);
    Targeting.hide(); setBody(null); setHot(null);
    if (H) H.stage().classList.remove("holding");
  }
  /** 渲染后调用：瞄准中的元素可能已重建，重画箭头 */
  function refresh(): void { if (aim) redrawAim(); }

  return { attach, reset, refresh, cancel, clearSel, tryPlay, tryAttack, commitCast, cancelCast, playHeld, onKey, mode, isAiming: () => !!aim };
})();
