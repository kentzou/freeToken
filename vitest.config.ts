import { defineConfig } from "vitest/config";
import path from "node:path";

// 单测跑在 node 环境：爬虫、纯函数与「组件的静态渲染事实」都不需要真 DOM。
// esbuild.jsx 覆盖是必需的：tsconfig 的 jsx 是 "preserve"（Next 构建要求），
// 不覆盖的话 .tsx 用例会带着 JSX 原样进 node 而报语法错。实测口径见计划 5 §3 D1。
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: { environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
