/* 运营数据持久化：公告、数值覆盖。保存在 DATA_DIR（默认 ./data）里的 JSON 文件 */
"use strict";
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,"..","data");
fs.mkdirSync(DATA_DIR,{recursive:true});

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
/* 胜率统计：{ [hero]: {wins,losses,draws,games,winRate} }，记录联机对局结果 */
function calcRate(s){s.games=s.wins+s.losses+s.draws;s.winRate=s.games?Math.round(s.wins/s.games*1000)/10:0;return s;}

/* ============================================================
   账号系统：登录 / 金币 / 仓库 / 剧情存档
   ============================================================ */
function hashPass(pass,salt){return crypto.createHash("sha256").update(salt+"::"+pass).digest("hex");}
function newUser(user,pass,nick,email){
  const salt=crypto.randomBytes(8).toString("hex");
  const uid="u"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  return{uid,user,pass:hashPass(pass,salt),salt,nick:nick||user,email:email||"",gold:0,
    inv:[],                    // 仓库 [{id,qty}]
    campaign:{},               // [hero]:{unlocked,slots:[{deck,ch1,upgrades},×3]}
    token:crypto.randomBytes(16).toString("hex"),
    resetCode:"",resetExp:0,
    createdAt:Date.now()};
}
/* 用户安全视图（不含密码/盐） */
function pubUser(u){
  return{uid:u.uid,user:u.user,nick:u.nick,email:u.email||"",gold:u.gold,inv:u.inv,campaign:u.campaign};
}
function findUser(field,val){for(const k in users)if(users[k][field]===val)return users[k];return null;}
function validEmail(v){return typeof v==="string"&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());}

const Store={
  DATA_DIR,TYPES,
  pubUser,
  stats(){return stats;},
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
  /* ---------- 金币与仓库 ---------- */
  addGold(uid,n){const u=users[uid];if(!u)return 0;u.gold=Math.max(0,u.gold+n);write("users.json",users);return u.gold;},
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
