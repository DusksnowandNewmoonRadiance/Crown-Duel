/* 稀有度与出牌特效配方测试 */
const C=require("../shared/cards.js"),F=require("../shared/cardfx.js"),E=require("../shared/engine.js");
const results=[];const check=(n,ok,x)=>{results.push(!!ok);console.log((ok?"✔ ":"✘ ")+n+(x!==undefined?"  "+x:""));};
const all=[];for(const h in C.PROFILES)C.PROFILES[h].cards.forEach(c=>all.push(Object.assign({hero:h},c)));

check("四种稀有度对应携带上限 4 / 3 / 2 / 1",
  C.RARITY.common.limit===4&&C.RARITY.rare.limit===3&&C.RARITY.special.limit===2&&C.RARITY.elite.limit===1);
const noRar=all.filter(c=>!C.RARITY[c.rarity]);
check("每张卡牌都有稀有度",!noRar.length,noRar.map(c=>c.hero+":"+c.id).join(","));
const mism=all.filter(c=>C.RARITY[c.rarity]&&C.RARITY[c.rarity].limit!==c.limit);
check("稀有度与携带上限一致",!mism.length,mism.map(c=>`${c.hero}:${c.id} ${c.rarity}/${c.limit}`).join(","));
check("默认张数不超过携带上限",all.every(c=>c.n<=c.limit));
const cnt={};all.forEach(c=>cnt[c.rarity]=(cnt[c.rarity]||0)+1);
check("四种稀有度都有卡牌",C.RARITY_ORDER.every(r=>cnt[r]>0),JSON.stringify(cnt));

/* 精英：每张都有自己的特效 */
const elites=all.filter(c=>c.rarity==="elite");
const noFx=elites.filter(c=>!F.recipeFor(c));
check("每张精英都有专属特效",!noFx.length,noFx.map(c=>c.hero+":"+c.id).join(","));
const sig=new Map();let dup=[];
elites.forEach(c=>{const r=F.recipeFor(c);if(!r)return;const s=F.signature(r);if(sig.has(s))dup.push(s+" "+sig.get(s)+" & "+c.hero+":"+c.id);else sig.set(s,c.hero+":"+c.id);});
check("精英特效互不重复",!dup.length,dup.join("; "));
const bad=[];
elites.forEach(c=>{const r=F.recipeFor(c);if(!r||r.native)return;
  if(!F.PATTERNS[r.pattern])bad.push(c.id+" pattern");
  if(!F.PALETTES[r.palette])bad.push(c.id+" palette");
  if(!F.TARGETS.includes(r.target))bad.push(c.id+" target");
  if(!r.glyph)bad.push(c.id+" glyph");});
check("精英配方字段合法",!bad.length,bad.join(","));
check("精英名单里没有多余的配方",Object.keys(F.ELITE).every(k=>elites.some(c=>c.hero+":"+c.id===k)));
check("原有专属动画的精英沿用原动画",Object.values(F.ELITE).filter(r=>r.native).length===8);

/* 特殊：部分有通用特效，可重复 */
const specials=all.filter(c=>c.rarity==="special");
const withFx=specials.filter(c=>c.fx);
check("一部分特殊卡带特效（不是全部）",withFx.length>0&&withFx.length<specials.length,`${withFx.length}/${specials.length}`);
check("特殊卡的特效 ID 都存在",withFx.every(c=>F.SPECIAL[c.fx]));
const used={};withFx.forEach(c=>used[c.fx]=(used[c.fx]||0)+1);
check("特殊卡的特效可以重复使用",Object.values(used).some(n=>n>1),JSON.stringify(used));
check("只有特殊卡会带通用特效",all.filter(c=>c.fx&&c.rarity!=="special").length===0);

/* 引擎视图里带着稀有度和特效 */
const g=new E.Game({players:[{name:"甲",hero:"苏苏"},{name:"乙",hero:"字母"}],first:0});
const v=g.viewFor(0);
check("视图里的手牌带稀有度",v.me.hand.every(c=>C.RARITY[c.rarity]));
const e=g.players[0].deck.find(c=>c.rarity==="elite");
check("视图里能解析出精英配方",!!F.recipeFor(E.pubCard(e)));

/* 热更新：改稀有度时携带上限联动 */
const key="字母:over";
const baseLimit=C.PROFILES["字母"].cards.find(c=>c.id==="over").limit;
const errs=C.checkOverrides({[key]:{rarity:"elite"}});
check("覆盖稀有度合法",!errs.length,errs.join(" "));
C.applyOverrides({[key]:{rarity:"elite"}},"t1");
const c1=C.PROFILES["字母"].cards.find(c=>c.id==="over");
check("改稀有度后携带上限随之改变",c1.rarity==="elite"&&c1.limit===1&&c1.n<=1);
C.applyOverrides({},"t2");
check("清除覆盖后恢复",c1.rarity==="special"&&c1.limit===baseLimit);
check("非法稀有度被拒绝",C.checkOverrides({[key]:{rarity:"legendary"}}).length>0);

const pass=results.every(Boolean);
console.log(pass?"RARITY TEST PASSED":"RARITY TEST FAILED");
process.exit(pass?0:1);
