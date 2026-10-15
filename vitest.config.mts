import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 单测覆盖核心包（plugins/plugin-prev-layer-resolver）的纯逻辑 + webpack 接线，
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
      include: ['plugins/plugin-prev-layer-resolver/src/**/*.mts'],
      exclude: ['plugins/plugin-prev-layer-resolver/src/**/*.d.mts'],
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
