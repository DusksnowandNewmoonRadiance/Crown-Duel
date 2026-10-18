/* 运营后台接口：/admin（页面）与 /admin/api/*（需要 x-admin-token） */
"use strict";
const path=require("path");
const crypto=require("crypto");
const express=require("express");
const C=require("../shared/cards.js");
const Store=require("./store.js");

module.exports=function adminRouter(ctx){
  let TOKEN=process.env.ADMIN_TOKEN||"";
  if(TOKEN.length<12){
    TOKEN=crypto.randomBytes(18).toString("base64url");
    console.log(`[admin] 未设置 ADMIN_TOKEN（或少于 12 位），本次运行的临时后台口令：${TOKEN}`);
  }
  const fails=new Map(); // ip -> {n, t}
  const router=express.Router();
  router.use(express.json({limit:"256kb"}));

  router.get("/",(req,res)=>{res.setHeader("Cache-Control","no-cache");res.sendFile(path.join(__dirname,"admin.html"));});

  /* 鉴权：常数时间比较，10 分钟内失败 10 次则锁定 */
  router.use("/api",(req,res,next)=>{
    const ip=req.ip,f=fails.get(ip);
    if(f&&f.n>=10&&Date.now()-f.t<600000)return res.status(429).json({error:"尝试次数过多，请 10 分钟后再试"});
    const got=Buffer.from(String(req.get("x-admin-token")||"")),want=Buffer.from(TOKEN);
    if(got.length!==want.length||!crypto.timingSafeEqual(got,want)){
      const r=f&&Date.now()-f.t<600000?f:{n:0,t:Date.now()};r.n++;fails.set(ip,r);
      return res.status(401).json({error:"口令错误"});
    }
    fails.delete(ip);next();
  });

  router.get("/api/status",(req,res)=>res.json(ctx.status()));
  router.get("/api/stats",(req,res)=>res.json(Store.stats()));
  router.get("/api/reports",(req,res)=>res.json(ctx.reports()));
  router.post("/api/reports/:id/resolve",(req,res)=>{
    const out=ctx.resolveReport(req.params.id,String((req.body||{}).action||""));
    if(!out.ok)return res.status(400).json({error:out.error||"处理失败"});
    res.json(out);
  });
  router.get("/api/moderation",(req,res)=>res.json(ctx.moderation()));
  router.post("/api/moderation",(req,res)=>{
    const b=req.body||{},out=ctx.sanctionPlayer(String(b.id||""),String(b.type||""),String(b.reason||""));
    if(!out.ok)return res.status(400).json({error:out.error||"处罚失败"});
    res.json(out);
  });
  router.delete("/api/moderation/:type/:id",(req,res)=>{
    const out=ctx.removeSanction(req.params.id,req.params.type);
    if(!out.ok)return res.status(404).json({error:out.error||"记录不存在"});
    res.json(out);
  });

  /* ---- DIY 角色管理（列表 / 删除，含内置） ---- */
  router.get("/api/diy",(req,res)=>res.json(ctx.diyList()));
  router.delete("/api/diy/:name",(req,res)=>{
    const out=ctx.diyRemove(String(req.params.name||""));
    if(!out||!out.ok)return res.status(404).json({error:(out&&out.error)||"删除失败"});
    res.json(out);
  });

  router.get("/api/announcements",(req,res)=>res.json(Store.announcements()));
  router.post("/api/announcements",(req,res)=>{
    try{
      const isNew=!req.body.id;
      const a=Store.upsertAnnouncement(req.body||{});
      ctx.announcementsChanged(isNew?a:null);
      res.json(a);
    }catch(e){res.status(400).json({error:e.message});}
  });
  router.delete("/api/announcements/:id",(req,res)=>{
    const ok=Store.deleteAnnouncement(req.params.id);
    if(ok)ctx.announcementsChanged(null);
    res.json({ok});
  });

  router.post("/api/broadcast",(req,res)=>{
    const text=String((req.body||{}).text||"").trim().slice(0,200);
    if(!text)return res.status(400).json({error:"内容不能为空"});
    ctx.broadcast(text);res.json({ok:true});
  });

  router.post("/api/maintenance",(req,res)=>{
    const b=req.body||{};
    if(b.action==="drain")ctx.drain(Math.max(1,Math.min(60,+b.minutes||15)),String(b.message||"").slice(0,120));
    else if(b.action==="on")ctx.setMaintenance(true,String(b.message||"").slice(0,120));
    else if(b.action==="off")ctx.setMaintenance(false);
    else return res.status(400).json({error:"未知操作"});
    res.json(ctx.status());
  });

  router.get("/api/balance",(req,res)=>{
    const cards=[];
    for(const h in C.PROFILES)C.PROFILES[h].cards.forEach(c=>cards.push({key:h+":"+c.id,hero:h,name:c.name,kind:c.kind,base:C.baseOf(h+":"+c.id)}));
    res.json(Object.assign({cards},Store.balance()));
  });
  router.put("/api/balance",(req,res)=>{
    const map=(req.body||{}).overrides;
    const errs=C.checkOverrides(map);
    if(errs.length)return res.status(400).json({error:errs.slice(0,8).join("\n")});
    const b=Store.saveBalance(map);
    C.applyOverrides(b.overrides,b.rev);
    ctx.contentChanged();
    res.json(b);
  });
  return router;
};
