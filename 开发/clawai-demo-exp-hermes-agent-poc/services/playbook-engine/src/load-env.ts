import path from "path";
import fs from "fs";
import dotenv from "dotenv";

/**
 * 与 `apps/bff` 一致：从 monorepo 根目录加载 `.env`，避免在 `services/*` 下启动时落到默认 127.0.0.1:3306。
 */
const envPaths = [
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
  path.resolve(process.cwd(), "..", "..", "..", ".env"),
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
