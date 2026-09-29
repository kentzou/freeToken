import { defineConfig } from "vitest/config";
import path from "node:path";

// 单测跑在 node 环境：爬虫与纯函数不需要 DOM
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
