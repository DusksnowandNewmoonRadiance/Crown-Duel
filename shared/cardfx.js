/* 卡牌出牌特效配方（纯数据）。浏览器里由 public/js/cardfx.js 播放。
   - 精英：每张都有自己的配方（pattern + palette 的组合各不相同）；
           已经有专属动画的精英标记 native:true，沿用原动画，不再叠加。
   - 特殊：一部分带通用配方（卡牌数据里的 fx 字段，多张卡可以共用）。
   配方字段：pattern 动画形式 / palette 配色 / glyph 符号 / target 落点 / banner 是否显示卡名 */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.DuelCardFX=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";

const PATTERNS={
  burst:"爆裂",rain:"坠落",rise:"升腾",ring:"涟漪",slash:"斩击",pillar:"光柱",
  spiral:"聚能",wave:"横扫",flash:"闪耀",cross:"十字",orbit:"环绕",rift:"裂隙"
};
const PALETTES={
  crimson:{name:"绯红",c:["#ff5a3d","#ffb08a"]},
  gold:{name:"鎏金",c:["#f6d27a","#fff1c0"]},
  azure:{name:"苍蓝",c:["#5ab4ff","#bfe4ff"]},
  jade:{name:"翠青",c:["#4fe0a8","#c4ffe6"]},
  violet:{name:"紫晶",c:["#a86be0","#e0c8ff"]},
  rose:{name:"蔷薇",c:["#ff7aa8","#ffd0e0"]},
  ember:{name:"炽橙",c:["#ff9a3d","#ffe0a0"]},
  frost:{name:"霜白",c:["#9fe8ff","#ffffff"]},
  shadow:{name:"暗影",c:["#6a4a9a","#c8b0f0"]},
  steel:{name:"钢灰",c:["#b8c4cc","#ffffff"]},
  verdant:{name:"草绿",c:["#8ae04f","#e6ffc0"]},
  blood:{name:"血红",c:["#c0182a","#ff8a96"]},
  white:{name:"纯白",c:["#ffffff","#ffe9a8"]},
  teal:{name:"湖青",c:["#2ad0c8","#b8fff8"]},
  magenta:{name:"洋红",c:["#e03ad0","#ffc0f8"]},
  amber:{name:"琥珀",c:["#ffb020","#fff0b0"]}
};
const TARGETS=["foe","me","foeBoard","meBoard","center"];

/* ---- 特殊卡：通用配方（可重复） ---- */
const SPECIAL={
  sp_strike:{pattern:"slash",palette:"steel",glyph:"✦",target:"foe",label:"直击"},
  sp_storm:{pattern:"wave",palette:"ember",glyph:"✹",target:"foeBoard",label:"风暴"},
  sp_bless:{pattern:"rise",palette:"gold",glyph:"✦",target:"meBoard",label:"祝福"},
  sp_insight:{pattern:"orbit",palette:"azure",glyph:"✧",target:"me",label:"洞察"},
  sp_guard:{pattern:"ring",palette:"jade",glyph:"⛨",target:"me",label:"守护"},
  sp_bind:{pattern:"cross",palette:"violet",glyph:"⛓",target:"foeBoard",label:"压制"},
  sp_coin:{pattern:"rain",palette:"amber",glyph:"$",target:"me",label:"财富"}
};

/* ---- 精英卡：每张一个专属配方（键为 卡牌师:卡牌id） ---- */
const ELITE={
  /* 苏苏 */
  "绘梨衣:eriyi":{pattern:"orbit",palette:"teal",glyph:"♻",target:"me"},
  "绘梨衣:colossus":{pattern:"rise",palette:"steel",glyph:"▦",target:"meBoard"},
  "绘梨衣:neutral":{pattern:"ring",palette:"white",glyph:"⚐",target:"center"},
  "绘梨衣:crown":{pattern:"pillar",palette:"rose",glyph:"♛",target:"me"},
  "苏苏:awaSwap":{pattern:"rift",palette:"white",glyph:"∅",target:"foe"},
  "苏苏:first":{pattern:"slash",palette:"crimson",glyph:"Ⅰ",target:"foe"},
  "苏苏:marshal":{pattern:"burst",palette:"ember",glyph:"✚",target:"foe"},
  "苏苏:katyusha":{pattern:"rain",palette:"amber",glyph:"✣",target:"foeBoard"},
  "苏苏:armoredtrain":{pattern:"wave",palette:"steel",glyph:"▦",target:"meBoard"},
  "苏苏:winter":{pattern:"ring",palette:"frost",glyph:"❄",target:"foeBoard"},
  "苏苏:artillery":{native:true,label:"炮兵总司令（原有动画）"},
  "苏苏:peoplearmy":{native:true,label:"人民军（原有动画）"},
  "苏苏:reddawn":{native:true,label:"赤色黎明（原有动画）"},
  /* 字母 */
  "字母:guard":{pattern:"pillar",palette:"gold",glyph:"◈",target:"meBoard"},
  "字母:heavytank":{pattern:"cross",palette:"steel",glyph:"▣",target:"meBoard"},
  "字母:rebel":{pattern:"spiral",palette:"violet",glyph:"⚡",target:"foeBoard"},
  "字母:takeover":{pattern:"orbit",palette:"shadow",glyph:"⛓",target:"foeBoard"},
  "字母:remove":{native:true,label:"消除限制（原有动画）"},
  /* 七星 */
  "七星:gravityfield":{pattern:"rift",palette:"violet",glyph:"◉",target:"foe"},
  "七星:stasis":{pattern:"ring",palette:"azure",glyph:"◌",target:"foeBoard"},
  "七星:doomsday":{pattern:"flash",palette:"shadow",glyph:"⌛",target:"foe"},
  "七星:stasisfield":{pattern:"pillar",palette:"teal",glyph:"❖",target:"foe"},
  "七星:cometfall":{pattern:"slash",palette:"white",glyph:"☄",target:"foe"},
  "七星:gravityFold":{native:true,label:"引力折叠（原有动画）"},
  /* 核弹 */
  "核弹:superman":{native:true,label:"超人降临（原有动画）"},
  "核弹:ritual":{native:true,label:"皇冠仪式（原有动画）"},
  /* 猪瘟鱼 */
  "猪瘟鱼:vaultgate":{pattern:"pillar",palette:"amber",glyph:"▤",target:"meBoard"},
  "猪瘟鱼:vaultfill":{pattern:"rain",palette:"gold",glyph:"$",target:"me"},
  /* 八幡 */
  "八幡:king":{pattern:"flash",palette:"amber",glyph:"♛",target:"meBoard"},
  "八幡:submarine":{pattern:"rift",palette:"teal",glyph:"⛴",target:"foe"},
  "八幡:fireship":{native:true,label:"火船（原有动画）"},
  "八幡:finish":{native:true,label:"海盗大斩杀（原有动画）"},
  /* 045 */
  "045:alwei":{pattern:"orbit",palette:"azure",glyph:"锤",target:"meBoard"},
  "045:qixing":{pattern:"ring",palette:"violet",glyph:"✧",target:"foe"},
  "045:susu_leader":{pattern:"rise",palette:"crimson",glyph:"✯",target:"meBoard"},
  "045:huiliyi":{pattern:"spiral",palette:"verdant",glyph:"✦",target:"me"},
  "045:baimao":{pattern:"orbit",palette:"white",glyph:"◇",target:"me"},
  "045:xiashui":{pattern:"cross",palette:"ember",glyph:"✜",target:"foe"},
  "045:yuchun":{pattern:"rift",palette:"shadow",glyph:"☠",target:"foe"},
  "045:taojin":{pattern:"flash",palette:"magenta",glyph:"✺",target:"center"},
  "045:copycrown":{pattern:"flash",palette:"gold",glyph:"♚",target:"me"}
};

function build(id,rarity,r){
  const out=Object.assign({id,rarity},r);
  if(!out.native){
    out.colors=PALETTES[r.palette].c;
    out.label=r.label||(PATTERNS[r.pattern]+"·"+PALETTES[r.palette].name);
    out.banner=rarity==="elite";
  }
  return out;
}
/* 根据卡牌（引擎视图里的 hero / id / rarity / fx）取配方，没有则返回 null */
function recipeFor(card){
  if(!card)return null;
  if(card.fx&&SPECIAL[card.fx])return build(card.fx,"special",SPECIAL[card.fx]);
  if(card.rarity==="elite"){
    const key=(card.hero||"")+":"+card.id;
    if(ELITE[key])return build(key,"elite",ELITE[key]);
  }
  return null;
}
/* 配方的“指纹”：精英之间不能重复 */
const signature=r=>r.native?"native:"+r.id:r.pattern+"/"+r.palette;
return{PATTERNS,PALETTES,TARGETS,SPECIAL,ELITE,recipeFor,signature};
});
