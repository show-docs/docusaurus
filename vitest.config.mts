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
      // 红线盖住四处：核心解析器的纯逻辑、frontmatter 注入那份单文件（规则表 / 包装层 / 接线）、theme-iframe 那条框的 `lib/`（配置期的注册表 /
      // 分发 / 入口工厂，浏览器侧的消息形状与两条同步 hook），与两条**构建期判据**
      //（`theme-diff`：frontmatter 那把键与 git 里那一次改动；`theme-erd`：一份 `.dbml`
      // 落成各格式导出，加上配置期那份 `exports` 清单判据）。
      // 哪个 theme 包不在红线里、为什么，见 `test/README.md`。
      // `lib/` 里浏览器那几份要 DOM，靠测试文件自己标 `@vitest-environment jsdom` 切环境，
      // 全局口径仍是 node。
      include: [
        'packages/plugin-frontmatter-injector/src/**/*.mts',
        'packages/plugin-prev-layer-resolver/src/**/*.mts',
        'packages/theme-iframe/lib/**',
        'packages/theme-diff/src/loader/**/*.mts',
        'packages/theme-erd/src/loader/**/*.mts',
        'packages/theme-erd/src/options.mts',
      ],
      exclude: [
        'packages/plugin-frontmatter-injector/src/**/*.d.mts',
        'packages/plugin-prev-layer-resolver/src/**/*.d.mts',
        'packages/theme-iframe/lib/**/*.d.ts',
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
