import path from "path";
import fs from "fs";
import dotenv from "dotenv";

/**
 * 从多处尝试加载 `.env`（`tsx`/工作目录不同会导致 `__dirname` 或 `cwd` 单独不可靠）。
 * `override: true`：覆盖已在环境中出现的变量，避免空值/本机默认值挡住仓库根目录配置。
 */
const envPaths = [
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
];

const tried = new Set<string>();
for (const p of envPaths) {
  const abs = path.resolve(p);
  if (tried.has(abs) || !fs.existsSync(abs)) {
    continue;
  }
  tried.add(abs);
  dotenv.config({ path: abs, override: true });
}
