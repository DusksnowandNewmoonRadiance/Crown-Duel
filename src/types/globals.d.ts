/* 运行环境里已有的全局对象（由 shared/*.js 与 public/js/*.js 提供）。
   这里只声明 TypeScript 模块要用到的部分；边界处刻意写得窄，避免到处都是 any。 */

declare const module: { exports: unknown } | undefined;

/* ---------- 卡牌 / 对局视图（服务器或本地引擎给出） ---------- */
interface CardLike {
  id: string;
  hero?: string;
  name: string;
  kind: "unit" | "spell";
  cost: number;
  baseCost?: number;
  text?: string;
  flavor?: string;
  effect?: string;
  art?: string;
  rarity?: string;
  icon?: string;
  rep?: string;
  owner?: string;
  charge?: boolean;
  taunt?: boolean;
  ignoreTaunt?: boolean;
  untargetable?: boolean;
  gun?: boolean;
  member?: boolean;
  scrap?: boolean;
  core?: boolean;
  sealed?: boolean;
  strikes?: number;
  lifespan?: number;
  deathDmg?: number;
  // 单位实例
  uid?: number;
  attack?: number;
  health?: number;
  maxHealth?: number;
  atk?: number;
  hp?: number;
  atkLeft?: number;
  stun?: number;
  fresh?: boolean;
}

interface UnitView extends CardLike {
  uid: number;
  attack: number;
  health: number;
  maxHealth: number;
}

interface PlayerView {
  name: string;
  hero: string;
  hp: number;
  maxHp: number;
  armor: number;
  energy: number;
  maxEnergy: number;
  heroImmune?: boolean;
  hand: CardLike[];
  handCount: number;
  board: UnitView[];
}

interface GameView {
  phase: "mulligan" | "play" | "over";
  myTurn: boolean;
  you: number;
  turn: number;
  pending?: unknown;
  me: PlayerView;
  foe: PlayerView;
}

interface TargetSpec {
  side: "me" | "foe";
  eligible: number[];
  min: number;
  max: number;
  label: string;
}

interface AttackTargets {
  hero: boolean;
  units: number[];
}

/* 引擎里 UI 层用到的查询函数（均为只读） */
interface EngineQueries {
  playError(card: CardLike, me: PlayerView, foe: PlayerView): string | null | undefined;
  canAttack(unit: UnitView): string | null | undefined;
  attackTargets(unit: UnitView, foe: PlayerView): AttackTargets;
  targetSpec(card: CardLike, me: PlayerView, foe: PlayerView): TargetSpec | null;
  optionSpec(card: CardLike): { label: string; options: { id: string; label: string }[] } | null;
}

interface Point {
  x: number;
  y: number;
}

/* DuelCards 中 UI 用到的部分 */
interface DuelCardsLike {
  COLORS: Record<string, string>;
  RARITY: Record<string, { id: string; name: string; limit: number; order: number }>;
  REGIMES: Record<string, string>;
  PROFILES: Record<string, { cards: CardLike[] }>;
  cardDef(hero: string, id: string): { atk: number; hp: number } | undefined;
}
declare const DuelCards: DuelCardsLike;

/* shared/icons.js（由 src/shared/icons.ts 编译） */
interface DuelIconsApi {
  IDS: string[];
  has(id: unknown): boolean;
  svg(id: string, opts?: { size?: number | string; stroke?: number; cls?: string }): string;
  labelOf(id: string): string;
  list(): { id: string; label: string }[];
}
declare const DuelIcons: DuelIconsApi;

/* public/js/cardart.js（手写 JS，仍负责卡牌师徽记 / 卡背 / 封面） */
declare const CardArt: {
  palette(hero: string): { bg: string; bgHi: string; line: string; lineDim: string; fill: string };
  hash(s: string): number;
};
