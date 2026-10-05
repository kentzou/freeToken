import { defineConfig } from "vitest/config";
import path from "node:path";

// 单测跑在 node 环境：爬虫与纯函数不需要 DOM
export default defineConfig({
  esbuild: {
    // tsconfig 的 jsx:preserve 留给 Next/SWC；vitest 侧用 esbuild 转译 .tsx，
    // 必须走 automatic 运行时（组件不 import React，classic 转会 ReferenceError）
    jsx: "automatic",
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
