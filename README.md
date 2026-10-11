# 皇冠对决 · 网页联机版

8 位卡牌师的快节奏卡牌对战。支持**单人练习（3 档电脑难度）**和**联机大厅**（快速匹配、创建房间、房间密码、邀请链接、大厅/房间聊天、断线重连）。

## 目录结构

```
crown-duel/
├─ server/index.js      联机服务器（Express + Socket.IO，大厅 / 房间 / 匹配 / 计时 / 断线重连 / 维护）
├─ server/admin.*       运营后台（公告、广播、维护、数值热更新）
├─ server/store.js      运营数据存储（公告、数值，保存为 JSON）
├─ shared/              浏览器与服务器共用的代码
│  ├─ cards.js          全部卡牌数据、默认卡组、卡组校验
│  ├─ engine.js         规则引擎（联机时由服务器裁决，防作弊）
│  └─ ai.js             电脑对手
├─ public/              网页前端（无需构建）
├─ deploy/              部署脚本：setup.sh / systemd 服务 / nginx 配置
└─ test/                自动化测试（AI 对战模拟 + 联机冒烟测试）
```

## 本地运行

需要 Node.js 18 或更高版本。

```bash
npm install
npm start
```

浏览器打开 http://localhost:3000 。同一局域网的朋友用 `http://你的电脑IP:3000` 即可联机。

测试：`npm test`（会跑 AI 互打模拟，以及两个机器人通过服务器打完一整局联机）。

## 部署到服务器

1. 把整个 `crown-duel` 目录上传到服务器（`node_modules` 不用传），例如：
   ```bash
   scp -r crown-duel 你的用户名@服务器IP:~/
   ```
2. 登录服务器，进入目录，执行一键部署（需要 sudo 权限）：
   ```bash
   cd ~/crown-duel
   sudo bash deploy/setup.sh
   ```
   - 有域名并想用 Nginx（推荐，走 80 端口）：`sudo DOMAIN=你的域名 bash deploy/setup.sh`
   - 想换端口：`sudo PORT=8080 bash deploy/setup.sh`
3. 脚本会自动：安装 Node 20（如果没有）→ 创建专用的无登录系统用户 `crownduel` → 复制程序到 `/opt/crown-duel` → 注册为开机自启的 systemd 服务。
4. 没用 Nginx 时，记得在云服务器的**安全组 / 防火墙**放行端口（默认 3000）。

常用命令：

```bash
sudo systemctl status crown-duel     # 查看状态
sudo journalctl -u crown-duel -f     # 实时日志
sudo systemctl restart crown-duel    # 重启
```

## 更新游戏（热更新）

在服务器上拉取最新代码，再执行一次部署脚本：

```bash
cd ~/Duel && git pull && sudo npm_config_registry=https://registry.npmmirror.com bash deploy/setup.sh
```

更新是**平滑**的，不会打断玩家：

1. 新版本先装到临时目录，装好后再切换，切换前旧版本照常运行。
2. 新的网页立即生效。在线玩家会收到「游戏已更新」提示，点一下就刷新到新版本；正在对局的玩家不会被打扰，对局结束后才提示。
3. 服务器进入维护模式：不能开新对局，进行中的对局正常打完后，服务器自动重启加载新代码（最多等 15 分钟，可用 `DRAIN_MINUTES=30` 调整）。
4. 重启只需一两秒，玩家的网页会自动重新连接。

## 运营后台

浏览器打开 `http://你的地址/admin`，输入后台口令。口令在部署时自动生成，查看方法：

```bash
sudo cat /etc/crown-duel.env
```

后台功能：

- **服务器状态**：在线人数、进行中对局、房间数、版本号。
- **公告**：分为公告、更新、活动、维护四类，可以置顶，也可以设为「登录时弹出」。发布后在线玩家立即收到提醒，未读公告有小红点。
- **全服广播**：立即在所有玩家屏幕顶部显示一条消息（包括正在对局的玩家）。
- **维护 / 平滑重启**：手动开关维护模式，或者等对局结束后重启。
- **数值热更新**：修改卡牌的费用、攻击、生命、携带上限、名称、描述，保存后新开的对局立即生效，不用重启。删掉某一条覆盖就恢复原值。

公告和数值保存在 `/var/lib/crown-duel`，更新程序不会覆盖它们。

## 可调参数（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 3000 | 监听端口 |
| `HOST` | 0.0.0.0 | 监听地址（配合 Nginx 时用 127.0.0.1） |
| `TURN_SECONDS` | 75 | 联机每回合时长（秒），超时自动结束回合 |
