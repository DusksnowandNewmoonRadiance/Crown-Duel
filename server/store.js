/* 运营数据持久化：公告、数值覆盖。保存在 DATA_DIR（默认 ./data）里的 JSON 文件 */
"use strict";
const fs=require("fs");
const path=require("path");

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

const Store={
  DATA_DIR,TYPES,
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
