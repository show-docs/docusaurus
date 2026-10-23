import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const port = 3021;

/**
浏览器侧的 e2e（只本地跑，不进 `pnpm verify`）：起真实静态服务器，逐主题看
「命中 frontmatter 之后那一页到底长什么样」。这几层（iframe、stoplight、redoc、scalar）的命中效果
在构建产物里是空的
（`lazy` + 只在浏览器渲染），所以静态回读的 `verify:chain` 覆盖不到它。

用例写成 Gherkin（`test/e2e/features/*.feature`），步骤实现写在 `test/e2e/steps/`；
`bddgen` 把两者生成到 `.features-gen/` 里的 Playwright 测试文件，`testDir` 就指那里 ——
所以那个目录是产物，不进 git，也不要手改。

前置是先 `pnpm build`：`docusaurus serve` 服务的是 `build/`，没有它起不来。
*/
export default defineConfig({
  testDir: defineBddConfig({
    featuresRoot: 'test/e2e/features',
    steps: 'test/e2e/steps/*.steps.mts',
    // 步骤里有句子却没实现 → 生成阶段就红，而不是跑到一半才发现漏了。
    missingSteps: 'fail-on-gen',
  }),
  // 十一份 feature、二十七条场景共用一个 serve 进程与同一份产物；并发只会让浏览器启动来争要 CPU 的
  // 构建，本仓单测已经栽过这个坑（见 vitest.config.mts 的 testTimeout 注释）。
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 视口宽从 `Desktop Chrome` 自带的 1280 加到 1440，只为 scalar 那一层：它的框与站点的
        // 文档侧栏并排（侧栏 300 宽），Scalar 自己那套 API 左栏要**框**宽 ≥1024 才展开（厂商表里
        // 的一条媒体查询，实测门槛 1024 CSS px），1280 视口下框只有 980，整套导航收成一颗「打开
        // 菜单」抽屉，那几句按左栏判的用例就全在量一个合上的抽屉。1440 视口下框 1140（实测），
        // Scalar 的左栏 288 与站点侧栏 300 同时在。redoc / stoplight 的左栏在 980 那一档本来就
        // 展开，加宽不动它们。高度照旧 720：几层按高度算的判据（框高 660 = 720 - navbar 60）与
        // scalar 那条「按需挂载」的实测都记在 720 这一档。
        viewport: { width: 1440, height: 720 },
      },
    },
  ],
  webServer: {
    // `--dir` 指产物、`--no-open` 不给本机弹浏览器窗口。
    command: `pnpm exec docusaurus serve --dir build --port ${port} --no-open`,
    url: `http://localhost:${port}/`,
    // 本地反复跑用例时不必每次都重起服务。代价是服务着的可能是上一次 `pnpm build` 的产物：
    // 改完站点要重跑 `pnpm build`（`pnpm test:e2e` 已经把它排在前面）。
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
