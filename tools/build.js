#!/usr/bin/env node
/* 构建：src 下的 TypeScript → 类型检查 + 编译 → 复制到运行目录
     src/shared/*.ts → shared/*.js       （浏览器与服务器共用的 UMD 模块）
     src/ui/*.ts     → public/js/*.js    （浏览器脚本）
   产物提交进仓库，所以 `npm start` 不需要先构建；只有改了 src/ 才需要 `npm run build`。 */
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const tmp = path.join(root, ".build");
const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
const check = process.argv.includes("--check");

fs.rmSync(tmp, { recursive: true, force: true });
try {
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.ui.json", ...(check ? ["--noEmit"] : [])], { cwd: root, stdio: "inherit" });
} catch (e) { process.exit(1); }
if (check) { console.log("typecheck ok"); process.exit(0); }

const BANNER = (src) => `/* 生成文件：由 ${src} 编译而来，请改 TypeScript 源码后运行 npm run build，不要直接编辑本文件。 */\n`;
function copy(fromDir, toDir, srcDir) {
  if (!fs.existsSync(fromDir)) return;
  for (const f of fs.readdirSync(fromDir)) {
    if (!f.endsWith(".js")) continue;
    const body = fs.readFileSync(path.join(fromDir, f), "utf8").replace(/^"use strict";\n/, "");
    fs.writeFileSync(path.join(toDir, f), BANNER(`${srcDir}/${f.replace(/\.js$/, ".ts")}`) + body);
    console.log("  →", path.relative(root, path.join(toDir, f)));
  }
}
copy(path.join(tmp, "shared"), path.join(root, "shared"), "src/shared");
copy(path.join(tmp, "ui"), path.join(root, "public", "js"), "src/ui");
fs.rmSync(tmp, { recursive: true, force: true });
