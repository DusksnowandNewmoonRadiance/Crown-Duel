/* 好友系统：数据落在 users.json 的 u.friends / u.friendRequests（uid 数组）
   - 只有注册账号（有 uid）才能加好友；游客只读
   - 双向：接受后双方列表都写入对方
   - 上限 50 个好友 / 50 条待处理申请，防止刷
   本模块只负责数据，在线状态与推送由 server/index.js 处理 */
"use strict";
const Store = require("./store.js");

const MAX_FRIENDS = 50;
const MAX_REQUESTS = 50;

function users() { return Store.usersMap(); }
function byUid(uid) {
  if (!uid) return null;
  const m = users();
  if (m[uid] && m[uid].uid === uid) return m[uid];
  for (const k in m) if (m[k].uid === uid) return m[k];
  return null;
}
/* 按昵称找账号：先精确匹配昵称，再匹配用户名（不区分大小写） */
function byNick(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  const m = users();
  let fallback = null;
  for (const k in m) {
    const u = m[k];
    if (String(u.nick || "").toLowerCase() === n) return u;
    if (!fallback && String(u.user || "").toLowerCase() === n) fallback = u;
  }
  return fallback;
}
function ensure(u) {
  if (!Array.isArray(u.friends)) u.friends = [];
  if (!Array.isArray(u.friendRequests)) u.friendRequests = [];
  return u;
}
function save() { Store.persistUsers(); }
function pub(u) {
  return { uid: u.uid, nick: u.nick || u.user || "玩家", user: u.user || "" };
}
function has(a, uid) { return Array.isArray(a) && a.includes(uid); }

/* 发申请：返回 {ok,msg,target}；target 是对方的公开信息（用于推送） */
function request(fromUid, targetName) {
  const me = byUid(fromUid);
  if (!me) return { ok: false, msg: "请先登录账号再添加好友" };
  ensure(me);
  const target = byNick(targetName);
  if (!target) return { ok: false, msg: "找不到这个玩家" };
  if (target.uid === me.uid) return { ok: false, msg: "不能加自己为好友" };
  ensure(target);
  if (has(me.friends, target.uid)) return { ok: false, msg: "你们已经是好友了" };
  if (has(me.friendRequests, target.uid)) return { ok: false, msg: "对方已经向你发过申请，去「待处理」里同意吧" };
  if (has(target.friendRequests, me.uid)) return { ok: false, msg: "申请已经发过了，等对方处理" };
  if (me.friends.length >= MAX_FRIENDS) return { ok: false, msg: `好友上限 ${MAX_FRIENDS} 人` };
  if (target.friendRequests.length >= MAX_REQUESTS) return { ok: false, msg: "对方待处理申请太多，稍后再试" };
  target.friendRequests.push(me.uid);
  save();
  return { ok: true, msg: "好友申请已发送", target: pub(target), from: pub(me) };
}

/* 同意申请 */
function accept(uid, fromUid) {
  const me = byUid(uid), other = byUid(fromUid);
  if (!me || !other) return { ok: false, msg: "申请已失效" };
  ensure(me); ensure(other);
  if (!has(me.friendRequests, other.uid)) return { ok: false, msg: "没有这条申请" };
  me.friendRequests = me.friendRequests.filter(x => x !== other.uid);
  if (!has(me.friends, other.uid)) {
    if (me.friends.length >= MAX_FRIENDS) return { ok: false, msg: `好友上限 ${MAX_FRIENDS} 人` };
    me.friends.push(other.uid);
  }
  if (!has(other.friends, me.uid)) {
    if (other.friends.length >= MAX_FRIENDS) return { ok: false, msg: "对方好友已满" };
    other.friends.push(me.uid);
  }
  other.friendRequests = other.friendRequests.filter(x => x !== me.uid);
  save();
  return { ok: true, msg: `已和 ${other.nick || other.user} 成为好友`, other: pub(other), me: pub(me) };
}

/* 拒绝申请（从待处理里删掉，不建立关系） */
function reject(uid, fromUid) {
  const me = byUid(uid);
  if (!me) return { ok: false, msg: "请先登录" };
  ensure(me);
  const n = me.friendRequests.length;
  me.friendRequests = me.friendRequests.filter(x => x !== fromUid);
  if (me.friendRequests.length === n) return { ok: false, msg: "没有这条申请" };
  save();
  return { ok: true };
}

/* 删除好友（双向） */
function remove(uid, otherUid) {
  const me = byUid(uid), other = byUid(otherUid);
  if (!me) return { ok: false, msg: "请先登录" };
  ensure(me);
  me.friends = me.friends.filter(x => x !== otherUid);
  if (other) { ensure(other); other.friends = other.friends.filter(x => x !== uid); }
  save();
  return { ok: true };
}

/* 好友列表 / 待处理申请（公开字段；在线状态由调用方补） */
function list(uid) {
  const me = byUid(uid);
  if (!me) return [];
  ensure(me);
  return me.friends.map(byUid).filter(Boolean).map(pub);
}
function requests(uid) {
  const me = byUid(uid);
  if (!me) return [];
  ensure(me);
  return me.friendRequests.map(byUid).filter(Boolean).map(pub);
}
/* 某人的好友 uid 列表（用于在线状态推送） */
function friendUids(uid) {
  const me = byUid(uid);
  if (!me) return [];
  ensure(me);
  return me.friends.slice();
}

module.exports = { request, accept, reject, remove, list, requests, friendUids, byUid, byNick, pub };
