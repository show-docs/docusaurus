import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // `@docusaurus/useIsBrowser` 磁盘上没有对应的那个包（它是 webpack 构建期才存在的
      // alias），换成 `test/stubs/use-is-browser.ts` 那份替身 —— 换的理由写在替身头上。
      '@docusaurus/useIsBrowser': fileURLToPath(
        new URL('./test/stubs/use-is-browser.ts', import.meta.url),
      ),
      // 同理，`@theme/*` 也是 webpack 构建期的 specifier，磁盘上没有。视图层共享外壳
      // （`packages/theme-iframe/lib/view-layer-shell.tsx`）要用官方 `Admonition` 报那一条提示，
      // 单测里换成按它形状落地的一份替身 —— 换的理由写在替身头上。
      '@theme/Admonition': fileURLToPath(
        new URL('./test/stubs/admonition.tsx', import.meta.url),
      ),
    },
  },
  test: {
    // 单测覆盖核心包（packages/plugin-prev-layer-resolver）的纯逻辑 + webpack 接线，
    // 不加载 Docusaurus 主题层；测试文件与源码同为 ESM（.mts → .mjs 编译产物）。
    include: ['test/**/*.test.mts'],
    environment: 'node',
    globals: false,
    reporters: 'default',
    // 默认 5s 在并行跑满 worker 时会被 CPU 争用打成假红（单跑 1.4s 的用例能在整轮里超 5s），
    // 而真卡死（递归推导）是分钟级 —— 30s 既能吸收争用，也拦得住真的不返回。
    // 需要更久的用例（真实站点加载）自己标 60s/120s。
    testTimeout: 30_000,
    coverage: {
      // lcov 供覆盖率报告解析与上报（CI 见 `.github/workflows/bring-it.yaml` 的 verify 作业）；
      // json-summary 便于本地直接看百分比。
      provider: 'istanbul',
      reporter: ['lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // 红线盖住**全部构建期代码**：每个包的 `src/`（配置期接线、webpack 规则、
      // loader 判据、纯逻辑），加上 `theme-iframe` 那条框的 `lib/`（配置期的注册表 /
      // 分发 / 入口工厂，浏览器侧的消息形状与两条同步 hook，以及三条视图层共用那份外壳）
      // 和 `theme-component-page` 的 `lib/`（配置期与浏览器期共用的那一条命中判据）。
      // **不在**红线里的是各包 `theme/` 与 `components/` 下那些 React 视图 ——
      // 它们由 e2e 钉住，理由见 `test/README.md`。
      // `lib/` 里浏览器那几份要 DOM，靠测试文件自己标 `@vitest-environment jsdom` 切环境，
      // 全局口径仍是 node。
      include: [
        'packages/*/src/**/*.mts',
        'packages/theme-iframe/lib/**',
        'packages/theme-component-page/lib/**',
      ],
      // 红线挂在产出它的那一步：`.github/workflows` 的 verify 作业跑 `pnpm verify`
      // （含 test:coverage），阈值就在那儿拦；本地只跑 `pnpm test` 不带覆盖率，
      // 会绿着把量掉下去。四项都已实测 100。
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
