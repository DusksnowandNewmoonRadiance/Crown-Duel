/* 卡组存储逻辑测试（在 Node 里用假的 localStorage 运行 public/js/decks.js 的存储部分） */
const fs=require("fs"),path=require("path"),vm=require("vm");
const C=require("../shared/cards.js");
const mem={};
const localStorage={getItem:k=>(k in mem?mem[k]:null),setItem:(k,v)=>{mem[k]=String(v);},removeItem:k=>{delete mem[k];}};
const stubEl=()=>new Proxy(function(){},{get:()=>stubEl(),apply:()=>stubEl()});
const sandbox={window:{DuelCards:C,matchMedia:()=>({matches:false}),addEventListener(){}},localStorage,document:{querySelector:()=>stubEl(),querySelectorAll:()=>[]},
  CardView:{esc:String,heroRgb:()=>"0,0,0",glyph:s=>s[0],card:()=>""},Audio2:{sfx(){}},btoa:s=>Buffer.from(s,"binary").toString("base64"),atob:s=>Buffer.from(s,"base64").toString("binary"),
  escape,unescape,encodeURIComponent,decodeURIComponent,console};
sandbox.window.localStorage=localStorage;
const src=fs.readFileSync(path.join(__dirname,"../public/js/decks.js"),"utf8").replace("const Decks=","globalThis.Decks=");
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const D=sandbox.Decks;

const results=[];const check=(n,ok,x)=>{results.push(ok);console.log((ok?"✔ ":"✘ ")+n+(x?"  "+x:""));};
const full=h=>C.defaultDeck(h);

check("没有任何卡组时出战卡组是官方推荐",D.active("苏苏").virtual===true&&D.activeCards("苏苏").length===40);
const r1=D.save({id:null,hero:"苏苏",name:"  我的红军  ",cards:full("苏苏")});
check("保存卡组并去掉名称首尾空格",r1.name==="我的红军"&&D.count()===1);
D.setActive("苏苏",r1.id);
check("设为出战后返回该卡组",D.active("苏苏").id===r1.id);
const half=D.save({id:null,hero:"字母",name:"半成品",cards:full("字母").slice(0,10)});
D.setActive("字母",half.id);
check("不完整的卡组不能出战（回退到官方推荐）",D.active("字母").virtual===true);
let err=null;try{D.save({id:null,hero:"苏苏",name:"   ",cards:[]});}catch(e){err=e.message;}
check("空名称被拒绝",!!err,err);
const dirtyCards=full("苏苏");dirtyCards.push("不存在的卡");
const r2=D.save({id:null,hero:"苏苏",name:"过滤",cards:dirtyCards});
check("保存时过滤不存在的卡牌",r2.cards.every(id=>C.PROFILES["苏苏"].cards.some(c=>c.id===id)));
// 修改已有卡组
const r3=D.save({id:r1.id,hero:"苏苏",name:"改名了",cards:full("苏苏")});
check("更新已有卡组不新增数量",r3.id===r1.id&&r3.name==="改名了"&&D.count()===3);
// 上限 30
let n=D.count();for(;n<30;n++)D.save({id:null,hero:"八幡",name:"卡组"+n,cards:[]});
check("可以保存到 30 个",D.count()===30);
err=null;try{D.save({id:null,hero:"八幡",name:"第31个",cards:[]});}catch(e){err=e.message;}
check("超过 30 个被拒绝",!!err&&D.count()===30,err);
// 导出 / 导入
const code=D.encode({hero:"七星",name:"七星·速攻",cards:full("七星")});
const back=D.decode(code);
check("新卡组代码先写两位卡牌师编号，再写每张卡的两位编号",code.startsWith("CD3.")&&/^[A-Za-z0-9]{2}$/.test(code.split(".")[1])&&code.split(".")[3].length===80);
check("导出再导入内容一致（含中文名称）",back.hero==="七星"&&back.name==="七星·速攻"&&JSON.stringify(back.cards)===JSON.stringify(full("七星")));
check("卡牌师由开头编号自动识别，不依赖元信息里的名字",D.peekHero(code)==="七星"&&!Object.hasOwn(JSON.parse(Buffer.from(code.split(".")[2],"base64url").toString()),"h"));
const allCards=[...Object.values(C.PROFILES).flatMap(p=>p.cards),...Object.values(C.TOKENS),...Object.values(C.AWA_CARDS),...Object.values(C.CAMPAIGN_CARDS)];
check("现有每张卡都有两位字母数字编号",allCards.every(c=>/^[A-Za-z0-9]{2}$/.test(c.code)));
check("每个卡牌师内编号唯一，跨卡牌师可复用",Object.values(C.PROFILES).every(p=>new Set(p.cards.map(c=>c.code)).size===p.cards.length)&&C.PROFILES["苏苏"].cards[0].code===C.PROFILES["七星"].cards[0].code);
check("卡牌师编号唯一",new Set(Object.keys(C.PROFILES).map(h=>C.heroCode(h))).size===Object.keys(C.PROFILES).length);
check("所有卡牌师的推荐卡组都能还原",Object.keys(C.PROFILES).every(h=>JSON.stringify(D.decode(D.encode({hero:h,name:h,cards:full(h)})).cards)===JSON.stringify(full(h))));
const xiCode=D.encode({hero:"045",name:"汐",cards:["xi"]});
check("汐属于 045，默认卡组包含 2 张并保留名片召唤",!!C.cardDef("045","xi")&&!C.cardDef("绘梨衣","xi")&&full("045").filter(id=>id==="xi").length===2&&full("045").includes("namecardsummon")&&!full("绘梨衣").includes("xi"));
check("汐可用 045 编号导出导入",C.cardCode("045","xi")==="0R"&&D.decode(xiCode).hero==="045"&&D.decode(xiCode).cards[0]==="xi");
check("旧编号保留且已下架的绘梨衣汐不会被导出",C.cardCode("045","highcommand")==="0Q"&&C.cardCode("绘梨衣","guard")==="07"&&C.cardCode("绘梨衣","xi")===null&&C.cardFromCode("绘梨衣","06")==="xi");
{
  const alphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const body=C.heroCode("绘梨衣")+"."+Buffer.from(JSON.stringify({n:"旧汐卡组"}),"utf8").toString("base64url")+".0607";
  let sum=0;for(const ch of body)sum=(sum*33+ch.charCodeAt(0))%3844;
  const imported=D.decode("CD3."+body+"."+alphabet[Math.floor(sum/62)]+alphabet[sum%62]);
  check("旧绘梨衣代码只丢弃汐，其他卡保持原编号",imported.dropped===1&&JSON.stringify(imported.cards)===JSON.stringify(["guard"]));
}
const old="CD1."+Buffer.from(JSON.stringify({h:"七星",n:"旧代码",c:full("七星")}),"utf8").toString("base64url");
check("旧版 CD1 卡组仍可导入",D.peekHero(old)==="七星"&&JSON.stringify(D.decode(old).cards)===JSON.stringify(full("七星")));
const oldMeta=Buffer.from(JSON.stringify({h:"七星",n:"旧 CD2",c:[]}),"utf8").toString("base64url");
const oldBody=oldMeta+".0r",alphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let sum=0;for(const ch of oldBody)sum=(sum*33+ch.charCodeAt(0))%3844;
const oldCd2="CD2."+oldBody+"."+alphabet[Math.floor(sum/62)]+alphabet[sum%62];
check("上一版 CD2 全局编号仍按旧卡牌解析",D.peekHero(oldCd2)==="七星"&&D.decode(oldCd2).cards[0]==="cometWatcher");
let bad=null;try{D.decode(code.slice(0,-1)+(code.endsWith("0")?"1":"0"));}catch(e){bad=e.message;}
check("损坏的代码被拒绝",!!bad,bad);
let bad2=null;try{D.decode("hello");}catch(e){bad2=e.message;}
check("非卡组代码被拒绝",!!bad2,bad2);
const withUnknown=D.decode("CD1."+Buffer.from(JSON.stringify({h:"七星",n:"x",c:full("七星").concat(["nope","nope2"])}),"utf8").toString("base64url"));
check("旧代码导入时忽略已不存在的卡牌并统计",withUnknown.dropped===2);
const doomed=C.PROFILES["七星"].cards.at(-1),removedCode=D.encode({hero:"七星",name:"已下架",cards:[doomed.id]});C.PROFILES["七星"].cards.pop();
const missing=D.decode(removedCode);C.PROFILES["七星"].cards.push(doomed);
check("新代码导入时统计已下架卡牌",missing.dropped===1&&missing.cards.length===0);
C.PROFILES["测试DIY"]={diy:true,cards:[{id:"alpha",code:""},{id:"beta",code:""}]};
const diyCode=D.encode({hero:"测试DIY",name:"自制",cards:["beta","alpha","beta"]});
C.PROFILES["测试DIY"].cards.reverse();
check("DIY 卡组代码保留卡牌师和编号对应关系",diyCode.startsWith("CD3.zz.")&&D.peekHero(diyCode)==="测试DIY"&&JSON.stringify(D.decode(diyCode).cards)===JSON.stringify(["beta","alpha","beta"]));
delete C.PROFILES["测试DIY"];
// 删除
D.remove(r1.id);
check("删除出战卡组后回退到官方推荐",D.active("苏苏").virtual===true&&D.count()===29);
// 持久化
const raw=JSON.parse(mem["cd.decks.v2"]);
check("数据写入存储",raw.v===2&&raw.list.length===29);
// 迁移旧版
for(const k of Object.keys(mem))delete mem[k];
mem["cd.deck.下水"]=JSON.stringify(full("下水"));
mem["cd.deck.苏苏"]=JSON.stringify(["red","red"]);
sandbox.vm=vm;
const sb2=Object.assign({},sandbox);
vm.createContext(sb2);vm.runInContext(src,sb2);
const D2=sb2.Decks;
check("迁移旧版卡组并自动设为出战",D2.list("下水").length===1&&D2.active("下水").name==="下水·我的卡组"&&!D2.active("下水").virtual);
check("迁移不完整的旧卡组时保留但不出战",D2.list("苏苏").length===1&&D2.active("苏苏").virtual===true);

const pass=results.every(Boolean);
console.log(pass?"DECKS TEST PASSED":"DECKS TEST FAILED");
process.exit(pass?0:1);
