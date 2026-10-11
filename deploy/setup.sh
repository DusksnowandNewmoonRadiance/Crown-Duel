#!/usr/bin/env bash
# 皇冠对决 · 一键部署脚本（Ubuntu / Debian / CentOS / Rocky / AlmaLinux）
# 用法：把整个 crown-duel 目录上传到服务器后，在该目录里执行：
#   sudo bash deploy/setup.sh
# 可选环境变量：PORT=3000  DOMAIN=your-domain.com（填了会自动写 nginx 配置）
set -euo pipefail

APP_DIR=/opt/crown-duel
APP_USER=crownduel
PORT="${PORT:-3000}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "请用 sudo 运行：sudo bash deploy/setup.sh"; exit 1; fi

echo "==> 1/5 检查 Node.js"
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  echo "    安装 Node.js 20 LTS…"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  else
    echo "无法自动安装 Node.js，请手动安装 Node 18+ 后重试"; exit 1
  fi
fi
echo "    Node $(node -v)"

echo "==> 2/5 创建运行用户 $APP_USER（无登录权限的系统用户）"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

echo "==> 3/5 复制程序到 $APP_DIR"
mkdir -p "$APP_DIR"
for d in server shared public; do rm -rf "${APP_DIR:?}/$d"; cp -r "$SRC_DIR/$d" "$APP_DIR/"; done
cp "$SRC_DIR/package.json" "$SRC_DIR/package-lock.json" "$APP_DIR/"
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> 4/5 安装 systemd 服务"
sed "s/^Environment=PORT=.*/Environment=PORT=$PORT/" "$SRC_DIR/deploy/crown-duel.service" > /etc/systemd/system/crown-duel.service
if [ -z "${DOMAIN:-}" ]; then
  # 没有 nginx 时直接对外监听
  sed -i "s/^Environment=HOST=.*/Environment=HOST=0.0.0.0/" /etc/systemd/system/crown-duel.service
fi
systemctl daemon-reload
systemctl enable --now crown-duel
systemctl restart crown-duel

echo "==> 5/5 Nginx（可选）"
if [ -n "${DOMAIN:-}" ]; then
  if ! command -v nginx >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then apt-get install -y nginx; else (dnf install -y nginx || yum install -y nginx); fi
    systemctl enable --now nginx
  fi
  sed -e "s/your-domain.com/$DOMAIN/" -e "s/127.0.0.1:3000/127.0.0.1:$PORT/" "$SRC_DIR/deploy/nginx.conf" > /etc/nginx/conf.d/crown-duel.conf
  nginx -t && systemctl reload nginx
  echo "    Nginx 已配置：http://$DOMAIN"
else
  echo "    未设置 DOMAIN，跳过。游戏直接监听端口 $PORT"
fi

sleep 1
if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null; then
  echo ""
  echo "部署完成！"
  [ -n "${DOMAIN:-}" ] && echo "访问：http://$DOMAIN" || echo "访问：http://<服务器公网IP>:$PORT   （记得在防火墙/安全组放行 $PORT 端口）"
  echo "查看日志：sudo journalctl -u crown-duel -f"
else
  echo "服务没有正常启动，请查看日志：sudo journalctl -u crown-duel -n 50"; exit 1
fi
