/* 调参实验：在内存里临时修改卡牌数值，比较胜率（不会写文件） */
const C=require("../shared/cards.js");
const W=require("./winrate.js");
const snapshot=JSON.stringify(C.PROFILES);
function restore(){const o=JSON.parse(snapshot);for(const h in o){C.PROFILES[h].hp=o[h].hp;C.PROFILES[h].cards.length=0;o[h].cards.forEach(c=>{C.PROFILES[h].cards.push(c);});}}
const card=(h,id)=>C.PROFILES[h].cards.find(c=>c.id===id);
const N=+process.argv[2]||20;
const heroes=(process.argv[3]||"").split(",").filter(Boolean);

const VARIANTS={
  base:()=>{},
  hp38:()=>{C.PROFILES["七星"].hp=38;},
  cheapDecay:()=>{card("七星","eclipse").cost=1;card("七星","eclipser").cost=2;card("七星","eclipser").hp=4;},
  hp38cheap:()=>{C.PROFILES["七星"].hp=38;card("七星","eclipse").cost=1;card("七星","eclipser").cost=2;card("七星","eclipser").hp=4;},
  nerfTop:()=>{card("苏苏","latvian").cost=3;card("下水","saturation").cost=4;},
  nerfTop2:()=>{card("苏苏","latvian").cost=3;card("苏苏","redguard").n=1;card("下水","saturation").cost=4;card("下水","cannon").cost=3;},
  package1:()=>{
    card("苏苏","latvian").cost=3;card("下水","saturation").cost=4;
    card("七星","eclipse").cost=1;card("七星","eclipser").cost=2;card("七星","eclipser").hp=4;
    C.PROFILES["核弹"].hp=32;C.PROFILES["猪瘟鱼"].hp=32;
  },
  decay2:()=>{C.PROFILES["七星"].hp=38;card("七星","eclipse").cost=1;card("七星","eclipse").text="敌方英雄获得 2 层【衰减】。";
    card("七星","eclipse").effect="decay2";card("七星","eclipser").cost=2;card("七星","eclipser").hp=4;}
};
const names=(process.argv[4]||"base,hp38,cheapDecay,hp38cheap").split(",");
for(const v of names){
  restore();VARIANTS[v]();
  const out=[];
  for(const h of heroes)out.push(h+" "+W.rate(h,N).overall+"%");
  console.log(v.padEnd(12),out.join("  "));
}
restore();
