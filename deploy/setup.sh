#!/usr/bin/env bash
# 皇冠对决 · 部署 / 更新脚本（Ubuntu / Debian / CentOS / Rocky / AlmaLinux）
# 首次部署和以后每次更新都执行同一条命令（在项目目录里）：
#   sudo bash deploy/setup.sh
# 可选环境变量：PORT=3000  DOMAIN=your-domain.com（填了会自动写 nginx 配置）
#               DRAIN_MINUTES=15（更新时最多等待进行中的对局多少分钟）
# 更新是平滑的：新前端立即生效（在线玩家会收到刷新提示），
# 服务器会等进行中的对局打完后再自动重启加载新代码。
set -euo pipefail

APP_DIR=/opt/crown-duel
APP_USER=crownduel
ENV_FILE=/etc/crown-duel.env
PORT="${PORT:-3000}"
DRAIN_MINUTES="${DRAIN_MINUTES:-15}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "请用 sudo 运行：sudo bash deploy/setup.sh"; exit 1; fi

echo "==> 1/6 检查 Node.js"
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  echo "    安装 Node.js…"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs npm
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nodejs npm
  else
    echo "无法自动安装 Node.js，请手动安装 Node 18+ 后重试"; exit 1
  fi
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt 18 ]; then echo "系统自带的 Node.js 版本过低（$(node -v)），请安装 Node 18+ 后重试"; exit 1; fi
fi
echo "    Node $(node -v)"

echo "==> 2/6 运行用户与配置"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
if [ ! -f "$ENV_FILE" ] || ! grep -q '^ADMIN_TOKEN=' "$ENV_FILE"; then
  echo "ADMIN_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)" >> "$ENV_FILE"
  echo "    已生成后台口令（保存在 $ENV_FILE）"
fi
chmod 600 "$ENV_FILE"

echo "==> 3/6 准备新版本（不影响正在运行的服务）"
STAGE="$APP_DIR.new"
rm -rf "$STAGE"; mkdir -p "$STAGE"
for d in server shared public; do cp -r "$SRC_DIR/$d" "$STAGE/"; done
cp "$SRC_DIR/package.json" "$SRC_DIR/package-lock.json" "$STAGE/"
(cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund)
chown -R "$APP_USER:$APP_USER" "$STAGE"

echo "==> 4/6 切换到新版本"
rm -rf "$APP_DIR.old"
[ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_DIR.old"
mv "$STAGE" "$APP_DIR"

echo "==> 5/6 systemd 服务"
UNIT=/etc/systemd/system/crown-duel.service
sed "s/^Environment=PORT=.*/Environment=PORT=$PORT/" "$SRC_DIR/deploy/crown-duel.service" > "$UNIT.tmp"
if [ -z "${DOMAIN:-}" ] && ! [ -f /etc/nginx/conf.d/crown-duel.conf ]; then
  sed -i "s/^Environment=HOST=.*/Environment=HOST=0.0.0.0/" "$UNIT.tmp"
fi
unit_changed=1
if [ -f "$UNIT" ] && cmp -s "$UNIT" "$UNIT.tmp"; then unit_changed=0; fi
mv "$UNIT.tmp" "$UNIT"
systemctl daemon-reload
systemctl enable crown-duel >/dev/null 2>&1

TOKEN="$(grep '^ADMIN_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if systemctl is-active --quiet crown-duel && [ "$unit_changed" -eq 0 ]; then
  # 平滑更新：通知服务器进入维护，等对局结束后自动重启
  if curl -fsS -X POST "http://127.0.0.1:$PORT/admin/api/maintenance" \
       -H "content-type: application/json" -H "x-admin-token: $TOKEN" \
       -d "{\"action\":\"drain\",\"minutes\":$DRAIN_MINUTES}" >/dev/null 2>&1; then
    echo "    已通知服务器平滑更新：进行中的对局打完后（最多 $DRAIN_MINUTES 分钟）自动重启"
  else
    echo "    无法联系运行中的服务（可能是旧版本），直接重启"
    systemctl restart crown-duel
  fi
else
  systemctl restart crown-duel
fi

echo "==> 6/6 Nginx（可选）"
if [ -n "${DOMAIN:-}" ]; then
  if ! command -v nginx >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then apt-get install -y nginx; else (dnf install -y nginx || yum install -y nginx); fi
    systemctl enable --now nginx
  fi
  sed -e "s/your-domain.com/$DOMAIN/" -e "s/127.0.0.1:3000/127.0.0.1:$PORT/" "$SRC_DIR/deploy/nginx.conf" > /etc/nginx/conf.d/crown-duel.conf
  nginx -t && systemctl reload nginx
  echo "    Nginx 已配置：http://$DOMAIN"
else
  echo "    未设置 DOMAIN，跳过"
fi

for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 1
done
if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  ADDR="${DOMAIN:-<服务器公网IP>:$PORT}"
  echo ""
  echo "完成！"
  echo "  游戏地址：http://$ADDR"
  echo "  运营后台：http://$ADDR/admin"
  echo "  后台口令：sudo cat $ENV_FILE"
  [ -z "${DOMAIN:-}" ] && echo "  记得在云服务器安全组 / 防火墙放行 $PORT 端口"
  echo "  查看日志：sudo journalctl -u crown-duel -f"
else
  echo "服务没有正常启动，请查看日志：sudo journalctl -u crown-duel -n 50"; exit 1
fi
