/* 运营数据持久化：公告、数值覆盖。保存在 DATA_DIR（默认 ./data）里的 JSON 文件 */
"use strict";
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const Rank=require("../shared/rank.js");

const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,"..","data");
fs.mkdirSync(DATA_DIR,{recursive:true});
/* 配饰：7 种名字颜色（宝箱随机开出） */
const NAME_COLORS=[
  {id:"red",name:"红",color:"#e0664f"},{id:"orange",name:"橙",color:"#e08a4f"},
  {id:"yellow",name:"黄",color:"#d9c05a"},{id:"green",name:"绿",color:"#6fbf73"},
  {id:"cyan",name:"青",color:"#4fb8b0"},{id:"blue",name:"蓝",color:"#5b9bd5"},
  {id:"purple",name:"紫",color:"#a98fd9"}
];
/* 段位一次性奖励：key = 跨入的分段起点 */
const RANK_REWARDS={"25":30,"20":60,"15":100,"10":150,"5":250,"2":500};

function read(name,fallback){
  try{return JSON.parse(fs.readFileSync(path.join(DATA_DIR,name),"utf8"));}
  catch(e){if(e.code!=="ENOENT")console.error(`[store] 读取 ${name} 失败：`,e.message);return fallback;}
}
/* 先写临时文件再改名，避免写到一半断电导致文件损坏 */
function write(name,data){
  const file=path.join(DATA_DIR,name),tmp=file+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(data,null,2));
  fs.renameSync(tmp,file);
}

const TYPES=["公告","更新","活动","维护"];
let announcements=read("announcements.json",null);
if(!Array.isArray(announcements)){
  announcements=[{id:"welcome",type:"公告",title:"欢迎来到皇冠对决",
    body:"8 位风格迥异的卡牌师，快节奏的卡牌对决。\n\n· 第一次玩？先去「单人练习」熟悉卡组，会有新手引导。\n· 想和朋友对战？进入「联机对战」创建房间，把房间号发给朋友即可。\n\n祝你玩得开心！",
    popup:false,pinned:true,createdAt:Date.now(),updatedAt:Date.now()}];
}
let balance=read("balance.json",{rev:"",overrides:{},updatedAt:0});
let stats=read("stats.json",{});
let users=read("users.json",{});
let moderation=read("moderation.json",{bans:{},mutes:{},forcedNames:{},reports:[]});
moderation.bans=moderation.bans||{};moderation.mutes=moderation.mutes||{};
moderation.forcedNames=moderation.forcedNames||{};moderation.reports=Array.isArray(moderation.reports)?moderation.reports:[];
/* 胜率统计：{ [hero]: {wins,losses,draws,games,winRate} }，记录联机对局结果 */
function calcRate(s){s.games=s.wins+s.losses+s.draws;s.winRate=s.games?Math.round(s.wins/s.games*1000)/10:0;return s;}

/* ============================================================
   账号系统：登录 / 金币 / 仓库 / 剧情存档
   ============================================================ */
function hashPass(pass,salt){return crypto.createHash("sha256").update(salt+"::"+pass).digest("hex");}
function newUser(user,pass,nick,email){
  const salt=crypto.randomBytes(8).toString("hex");
  const uid="u"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  return{uid,user,pass:hashPass(pass,salt),salt,nick:nick||user,email:email||"",gold:20,
    rank:{seg:25,points:0,streak:0,wins:0,losses:0,lossStreak:0},   // 段位（见 shared/rank.js）
    cosmetics:{titles:[],colors:[],equip:{title:null,color:null}},  // 配饰：头衔 / 名字颜色
    daily:{lastWinDate:""},    // 每日首胜（YYYY-MM-DD）
    rankRewards:[],            // 已领过的段位奖励（分段 key）
    inv:[],                    // 仓库 [{id,qty}]
    campaign:{},               // [hero]:{unlocked,slots:[{deck,ch1,upgrades},×3]}
    decks:null,                // 云端卡组 {v:2,list:[{id,hero,name,cards,updatedAt}],active:{hero:deckId}}
    token:crypto.randomBytes(16).toString("hex"),
    resetCode:"",resetExp:0,
    createdAt:Date.now()};
}
/* 用户安全视图（不含密码/盐） */
function pubUser(u){
  return{uid:u.uid,user:u.user,nick:u.nick,email:u.email||"",gold:u.gold,inv:u.inv,campaign:u.campaign,
    cosmetics:u.cosmetics||{titles:[],colors:[],equip:{title:null,color:null}},
    rank:u.rank||{seg:25,points:0,streak:0,wins:0,losses:0,lossStreak:0}};
}
function findUser(field,val){for(const k in users)if(users[k][field]===val)return users[k];return null;}
function validEmail(v){return typeof v==="string"&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());}

const Store={
  DATA_DIR,TYPES,
  pubUser,
  stats(){return stats;},
  moderationState(id){return{ban:moderation.bans[id]||null,mute:moderation.mutes[id]||null,forcedName:moderation.forcedNames[id]||""};},
  reports(){return moderation.reports.slice().sort((a,b)=>b.createdAt-a.createdAt);},
  addReport(report){
    const item=Object.assign({id:crypto.randomUUID(),createdAt:Date.now(),status:"pending",resolvedAt:0,action:""},report);
    moderation.reports.push(item);if(moderation.reports.length>500)moderation.reports=moderation.reports.slice(-500);
    write("moderation.json",moderation);return item;
  },
  resolveReport(id,action){
    const item=moderation.reports.find(x=>x.id===id);
    if(!item)return{ok:false,error:"举报记录不存在"};
    if(item.status!=="pending")return{ok:false,error:"该举报已处理"};
    if(!["ban","mute","rename","dismiss"].includes(action))return{ok:false,error:"未知处理方式"};
    if(action==="rename"&&item.reason!=="name")return{ok:false,error:"只有名字违规举报可以强制改名"};
    item.status=action==="dismiss"?"dismissed":"resolved";item.action=action;item.resolvedAt=Date.now();
    const sanction={reason:item.reasonLabel||item.details||"经管理员核实的举报",reportId:item.id,createdAt:Date.now()};
    if(action==="ban")moderation.bans[item.targetId]=sanction;
    if(action==="mute")moderation.mutes[item.targetId]=sanction;
    if(item.reason==="name"&&action!=="dismiss")moderation.forcedNames[item.targetId]="名字违规";
    write("moderation.json",moderation);return{ok:true,report:item,state:this.moderationState(item.targetId)};
  },
  moderationLists(){
    const rows=obj=>Object.entries(obj).map(([id,v])=>Object.assign({id},typeof v==="string"?{name:v}:{...v})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    return{bans:rows(moderation.bans),mutes:rows(moderation.mutes),forcedNames:rows(moderation.forcedNames)};
  },
  removeSanction(id,type){
    const key=type==="ban"?"bans":type==="mute"?"mutes":null;
    if(!key||!moderation[key][id])return false;
    delete moderation[key][id];write("moderation.json",moderation);return true;
  },
  setSanction(id,type,reason){
    const key=type==="ban"?"bans":type==="mute"?"mutes":null;
    if(!key)return{ok:false,error:"未知处罚类型"};
    const item={reason:String(reason||"管理员后台处理").slice(0,200),createdAt:Date.now(),reportId:""};
    moderation[key][id]=item;write("moderation.json",moderation);return{ok:true,state:this.moderationState(id)};
  },
  /* heroes:[h0,h1]，winner:0|1|"draw" */
  recordMatch(heroes,winner){
    if(!Array.isArray(heroes)||heroes.length<2)return stats;
    const a=heroes[0],b=heroes[1];
    const A=stats[a]||(stats[a]={wins:0,losses:0,draws:0,games:0,winRate:0});
    const B=stats[b]||(stats[b]={wins:0,losses:0,draws:0,games:0,winRate:0});
    if(winner==="draw"){A.draws++;B.draws++;}
    else{A[winner===0?"wins":"losses"]++;B[winner===0?"losses":"wins"]++;}
    calcRate(A);calcRate(B);
    write("stats.json",stats);
    return stats;
  },
  /* ---------- 账号 ---------- */
  register(user,pass,nick,email){
    if(!user||!pass)throw new Error("用户名和密码不能为空");
    if(String(user).length<2||String(user).length>16)throw new Error("用户名需 2~16 个字符");
    if(String(pass).length<4)throw new Error("密码至少 4 位");
    if(findUser("user",user))throw new Error("用户名已被注册");
    let mail="";
    if(email!==undefined&&email!==null&&String(email).trim()!==""){
      if(!validEmail(email))throw new Error("邮箱格式不正确");
      if(findUser("email",email))throw new Error("该邮箱已被绑定");
      mail=String(email).trim();
    }
    const u=newUser(String(user),String(pass),String(nick||"").trim(),mail);
    users[u.uid]=u;write("users.json",users);
    return{token:u.token,me:pubUser(u)};
  },
  login(user,pass){
    const u=findUser("user",user)||(String(user).includes("@")?findUser("email",user):null);
    if(!u)throw new Error("用户不存在");
    if(u.pass!==hashPass(pass,u.salt))throw new Error("密码错误");
    u.token=crypto.randomBytes(16).toString("hex");
    write("users.json",users);
    return{token:u.token,me:pubUser(u)};
  },
  bindEmail(uid,email){
    const u=users[uid];if(!u)throw new Error("未登录");
    if(!validEmail(email))throw new Error("邮箱格式不正确");
    if(findUser("email",email))throw new Error("该邮箱已被绑定");
    u.email=String(email).trim();
    write("users.json",users);
    return{email:u.email};
  },
  /* 忘记密码：生成 6 位验证码（开发模式直接返回，正式版应接入邮件发送） */
  forgot(email){
    if(!validEmail(email))throw new Error("请输入正确的邮箱");
    const u=findUser("email",email);
    if(!u)throw new Error("该邮箱未绑定任何账号");
    u.resetCode=String(Math.floor(100000+Math.random()*900000));
    u.resetExp=Date.now()+15*60*1000;
    write("users.json",users);
    return{code:u.resetCode};
  },
  reset(email,code,pass){
    if(!validEmail(email))throw new Error("请输入正确的邮箱");
    const u=findUser("email",email);
    if(!u)throw new Error("该邮箱未绑定任何账号");
    if(!u.resetCode||u.resetCode!==String(code).trim())throw new Error("验证码错误");
    if(Date.now()>u.resetExp)throw new Error("验证码已过期，请重新获取");
    if(String(pass).length<4)throw new Error("密码至少 4 位");
    const salt=crypto.randomBytes(8).toString("hex");
    u.pass=hashPass(String(pass),salt);u.salt=salt;u.resetCode="";u.resetExp=0;
    write("users.json",users);
    return{ok:true};
  },
  byToken(token){
    if(!token)return null;
    for(const k in users)if(users[k].token===token)return users[k];
    return null;
  },
  logout(token){const u=this.byToken(token);if(u){u.token="";write("users.json",users);}return!!u;},
  /* 好友系统（server/friends.js）用的最小访问器：拿用户表 / 落盘 */
  usersMap(){return users;},
  persistUsers(){write("users.json",users);},
  /* ---------- 卡组云端同步（跟着账号走） ---------- */
  decks(uid){const u=users[uid];return u?(u.decks||null):null;},
  saveDecks(uid,decks){
    const u=users[uid];if(!u)return false;
    u.decks=decks;write("users.json",users);return true;
  },
  /* ---------- 金币与仓库 ---------- */
  addGold(uid,n){const u=users[uid];if(!u)return 0;u.gold=Math.max(0,u.gold+n);write("users.json",users);return u.gold;},
  /* ---------- 配饰（头衔 / 名字颜色） ---------- */
  NAME_COLORS,
  /* 买配饰：头衔直接入库；宝箱随机开 7 色之一，重复返还 25 金币 */
  buyCosmetic(uid,item){
    const u=users[uid];if(!u)return{ok:false,msg:"未登录"};
    if(!u.cosmetics)u.cosmetics={titles:[],colors:[],equip:{title:null,color:null}};
    const cos=u.cosmetics;
    if(item.kind==="title"){
      if(cos.titles.includes(item.id))return{ok:false,msg:"已拥有这个头衔"};
      if(u.gold<item.price)return{ok:false,msg:"金币不足"};
      u.gold-=item.price;cos.titles.push(item.id);
      write("users.json",users);
      return{ok:true,gold:u.gold,cosmetics:cos,item:{kind:"title",id:item.id}};
    }
    if(item.kind==="chest"){
      if(u.gold<item.price)return{ok:false,msg:"金币不足"};
      u.gold-=item.price;
      const pool=NAME_COLORS.filter(c=>!cos.colors.includes(c.id));
      if(!pool.length){u.gold+=25;write("users.json",users);return{ok:true,gold:u.gold,cosmetics:cos,refund:25,msg:"颜色已全部拥有，返还 25 金币"};}
      const got=pool[Math.floor(Math.random()*pool.length)];
      cos.colors.push(got.id);
      write("users.json",users);
      return{ok:true,gold:u.gold,cosmetics:cos,item:{kind:"color",id:got.id,name:got.name,color:got.color}};
    }
    return{ok:false,msg:"未知商品类型"};
  },
  /* 装备 / 卸下（value 为空表示卸下） */
  equipCosmetic(uid,kind,value){
    const u=users[uid];if(!u)return{ok:false,msg:"未登录"};
    if(!u.cosmetics)u.cosmetics={titles:[],colors:[],equip:{title:null,color:null}};
    const cos=u.cosmetics;
    if(kind==="title"){
      if(value&&!cos.titles.includes(value))return{ok:false,msg:"还没有这个头衔"};
      cos.equip.title=value||null;
    }else if(kind==="color"){
      if(value&&!cos.colors.includes(value))return{ok:false,msg:"还没有这个颜色"};
      cos.equip.color=value||null;
    }else return{ok:false,msg:"未知配饰类型"};
    write("users.json",users);
    return{ok:true,cosmetics:cos};
  },
  /* 每日首胜：同一自然日只发一次 */
  claimDailyWin(uid){
    const u=users[uid];if(!u)return{ok:false};
    const today=new Date().toISOString().slice(0,10);
    if(!u.daily)u.daily={lastWinDate:""};
    if(u.daily.lastWinDate===today)return{ok:false,msg:"今天已经领过了"};
    u.daily.lastWinDate=today;u.gold+=10;
    write("users.json",users);
    return{ok:true,gold:u.gold,awarded:10};
  },
  /* 段位一次性奖励：同一分段只发一次（seg 是升段后的段位） */
  grantRankReward(uid,seg){
    const u=users[uid];if(!u)return null;
    const key=String(seg>20?25:seg>15?20:seg>10?15:seg>5?10:seg>2?5:2);
    if(!u.rankRewards)u.rankRewards=[];
    if(u.rankRewards.includes(key))return null;
    u.rankRewards.push(key);
    const gold=RANK_REWARDS[key]||0;
    u.gold+=gold;write("users.json",users);
    return{ok:true,seg:key,gold:u.gold,awarded:gold};
  },
  /* 商品由 server 侧的 SHOP 定义；buy(item) 返回 {ok,msg} */
  buy(uid,item){
    const u=users[uid];if(!u)return{ok:false,msg:"未登录"};
    if(u.gold<item.price)return{ok:false,msg:"金币不足"};
    u.gold-=item.price;
    const e=u.inv.find(x=>x.id===item.id);
    if(e)e.qty++;
    else u.inv.push({id:item.id,qty:1});
    write("users.json",users);
    return{ok:true,gold:u.gold,inv:u.inv};
  },
  useInv(uid,id){const u=users[uid];if(!u)return{ok:false,msg:"未登录"};const e=u.inv.find(x=>x.id===id);if(!e||e.qty<=0)return{ok:false,msg:"仓库里没有这件物品"};e.qty--;if(e.qty<=0)u.inv=u.inv.filter(x=>x.id!==id);write("users.json",users);return{ok:true,inv:u.inv};},
  /* ---------- 剧情存档 ---------- */
  camp(uid,hero){
    const u=users[uid];if(!u)return null;
    const c=u.campaign[hero]||(u.campaign[hero]={unlocked:false,slots:[
      {deck:[],ch1:{best:0,first:false},upgrades:{}},
      {deck:[],ch1:{best:0,first:false},upgrades:{}},
      {deck:[],ch1:{best:0,first:false},upgrades:{}}
    ]});
    u.campaign[hero]=c;return c;
  },
  /* 普通模式获胜 → 解锁该角色剧情 */
  unlockCampaign(uid,hero){
    const c=this.camp(uid,hero);c.unlocked=true;write("users.json",users);return c;
  },
  /* 存档位：deck=剧情牌库 id 列表；upgrades={cardId:lvl}；ch1={best,first} */
  saveSlot(uid,hero,slot,data){
    const c=this.camp(uid,hero);
    const s=c.slots[slot]||(c.slots[slot]={deck:[],ch1:{best:0,first:false},upgrades:{}});
    if(data.deck!==undefined)s.deck=data.deck;
    if(data.ch1)s.ch1=Object.assign({},s.ch1,data.ch1);
    if(data.upgrades)s.upgrades=Object.assign({},s.upgrades,data.upgrades);
    write("users.json",users);return s;
  },
  finishCampaign(uid,hero,slot,turns,stars){
    const c=this.camp(uid,hero);if(!c.unlocked)c.unlocked=true;
    const s=c.slots[slot]||(c.slots[slot]={deck:[],ch1:{best:0,first:false},upgrades:{}});
    const ch=s.ch1;
    const best=Math.max(ch.best||0,stars);
    const first=!(ch.first)&&stars>=1;
    if(first)ch.first=true;
    ch.best=best;
    write("users.json",users);
    return{best:ch.best,first};
  },
  /* 段位结算：只用于快速匹配；未登录 / 非账号对局由调用方跳过 */
  recordResult(uid,win){
    const u=findUser("uid",uid);if(!u)return null;
    const res=Rank.recordResult(u.rank,win);u.rank=res.rank;
    if(res.reward>0)u.gold=(u.gold||0)+res.reward;   // 升段奖励
    write("users.json",users);return res;
  },
  rankOf(uid){const u=findUser("uid",uid);return u?Rank.normalize(u.rank):null;},
  announcements(){return announcements.slice().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.createdAt-a.createdAt);},
  upsertAnnouncement(a){
    const now=Date.now();
    const clean={
      id:a.id&&announcements.some(x=>x.id===a.id)?a.id:now.toString(36)+Math.random().toString(36).slice(2,6),
      type:TYPES.includes(a.type)?a.type:"公告",
      title:String(a.title||"").trim().slice(0,40),
      body:String(a.body||"").slice(0,3000),
      popup:!!a.popup,pinned:!!a.pinned,updatedAt:now
    };
    if(!clean.title)throw new Error("标题不能为空");
    const old=announcements.find(x=>x.id===clean.id);
    if(old)Object.assign(old,clean);
    else{clean.createdAt=now;announcements.push(clean);}
    if(announcements.length>100)announcements=this.announcements().slice(0,100);
    write("announcements.json",announcements);
    return announcements.find(x=>x.id===clean.id);
  },
  deleteAnnouncement(id){
    const n=announcements.length;
    announcements=announcements.filter(x=>x.id!==id);
    if(announcements.length!==n)write("announcements.json",announcements);
    return announcements.length!==n;
  },
  balance(){return balance;},
  saveBalance(overrides){
    balance={rev:Date.now().toString(36),overrides,updatedAt:Date.now()};
    write("balance.json",balance);
    return balance;
  }
};
module.exports=Store;
