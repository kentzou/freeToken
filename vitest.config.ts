import { defineConfig } from "vitest/config";
import path from "node:path";

// 单测跑在 node 环境：爬虫、纯函数与「组件的静态渲染事实」都不需要真 DOM。
// esbuild.jsx 覆盖是必需的：tsconfig 的 jsx 是 "preserve"（Next/SWC 构建要求留着它），
// 不覆盖的话 .tsx 用例会带着 JSX 原样进 node 而报语法错；main 侧从 .ts 用例里 import
// .tsx 组件（OpenRouterTable）走的也是这条转译，classic 运行时下组件不 import React 会
// ReferenceError。两边独立得出同一覆盖，合并时保留更严的一侧（含 jsxImportSource）。
// 实测口径见计划 5 §3 D1。
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: { environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
