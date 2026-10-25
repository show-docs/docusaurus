import config from '@nice-move/all-in-react/eslint';
import { createNodeResolver } from 'eslint-plugin-import-x';

// 生成物不参与 lint：`build/`、`coverage/`、编译产物 `dist/`、Docusaurus 缓存、
// `bddgen` 从 `.feature` 生成的 Playwright 文件、Playwright 跑失败的现场（`test-results/` 里那些
// `error-context.md` 是 DOM 快照，含被截断的标签，lint 会把它当源码解析），
// 以及测试夹具站点（用例超时时会泄漏在仓库根）。
// 本脚本带 `--fix`，少挡一条就等于让 lint 去改写产物。
const ignores = [
  'build/**',
  'coverage/**',
  'dist/**',
  'plugins/*/dist/**',
  'theme/*/dist/**',
  '.docusaurus/**',
  '.features-gen/**',
  '.temp/**',
  'test-results/**',
  'playwright-report/**',
];

// Docusaurus 的虚拟模块 + 我们的 `@theme-prev*` specifier 族（口径产地见
// `plugins/plugin-prev-layer-resolver/types/`）：别名在构建期才存在，磁盘上恒无文件，
// `import-x` 的 node resolver 只会判它们「解析不到」。其余原样交回它 —— 拼错的路径照旧会红。
const VIRTUAL =
  /^@(?:theme(?:-(?:original|init|prev(?:-init|-root)?))?|generated|docusaurus)\//;

const nodeResolver = createNodeResolver();

const resolver = {
  interfaceVersion: 3,
  name: 'test-ci-import-resolver',
  resolve(specifier, importer) {
    return VIRTUAL.test(specifier)
      ? { found: true, path: null }
      : nodeResolver.resolve(specifier, importer);
  },
};

export default [
  { ignores },
  ...config,
  {
    settings: { 'import-x/resolver-next': [resolver] },
  },
  {
    // preset 给 markdown 单独建的配置对象里**没有** unicorn 插件，把下面的豁免写成全局
    // 会让 `**/*.md` 直接判成配置错误（配置层的问题，不是代码问题）。本仓不需要在示例片段里
    // 调风格规则，示例的正确性由 `docs/` 里那些片段的真实出处保证。
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,tsx}'],
    // `pnpm lint:eslint` 用 `--max-warnings=0` 拦，所以这里**没有「报了但不拦」这一档**：
    // 关掉一条 = 本仓永久不跟它，因此每条都要有理由，理由只在这里留一份
    // （判缺陷的规则一律留着；只判读感的已撤回并改代码，例如 await 取值、for…of 头部写法）。
    // - `single-line-block-comment-style`：把单行块注释拆成多行就是强制加字节；一行的
    //   `/** 判据 */` 本来就一行一义。
    // - `no-continue` / `no-break-in-nested-loop`：候选循环里「这条跳过」写成 `continue` 是直读，
    //   换成嵌套 `if` 是拿 3 层换 5 层。
    // - `no-use-before-define`：先写入口再写实现是本仓的组织法；函数声明提升是语言保证，
    //   `let` / `const` 的 TDZ 照旧报。
    // - `no-non-null-assertion`：覆盖率红线是**分支 100%**，多余的守卫分支要么带不出用例（红），
    //   要么为它造一条假用例刷绿；可证的不变量因此走「断言 + 就地说明」（见各处的 `!` 上方注释）。
    // - `consistent-boolean-name`：谓词按语义命名（`provides` / `existsSync` / `skipFallback`），
    //   `isProvides` 是把它改坏。
    // - `prefer-simple-condition-first`：条件顺序跟着短路语义写，不跟着操作数「简单与否」。
    // - `prefer-number-coercion`：本仓要的就是 `parseInt` / `parseFloat` 的「取前缀」形状
    //   （版本号段 `10-beta`、体积串 `12 kB`）；换成 `Number()` 它们全变 NaN。
    rules: {
      'no-continue': 0,
      'no-use-before-define': ['error', { classes: false, functions: false }],
      '@typescript-eslint/no-non-null-assertion': 0,
      'unicorn/consistent-boolean-name': 0,
      'unicorn/prefer-number-coercion': 0,
      // 类成员顺序按本仓口径：公开面是读这个类的入口，私有实现跟在后面（与
      // 「先写入口再写实现」的组织法一致）。
      'unicorn/consistent-class-member-order': [
        'error',
        {
          order: [
            'static-field',
            'static-block',
            'static-method',
            'public-field',
            'private-field',
            'constructor',
            'public-method',
            'private-method',
          ],
        },
      ],
      'unicorn/no-break-in-nested-loop': 0,
      'unicorn/prefer-simple-condition-first': 0,
      'unicorn/single-line-block-comment-style': 0,
    },
  },
  {
    // 夹具与仓库脚本里的内联函数就是用来捕获参数的，提到外层反而要把参数改成一串传递。
    files: ['test/**/*.mts', 'scripts/**/*.mjs'],
    rules: { 'unicorn/consistent-function-scoping': 0 },
  },
  {
    // 用例里 `const siteDir = site(...)` 遮蔽 describe 级同名夹具是刻意的：每条用例的站点就是
    // 那个概念本身，强行改别名反而要给同一个东西起两个名字。
    // `max-nested-calls` 则被断言 DSL 绑死（`expect(...).not.toThrow()` 再套一层就是第 4 层）。
    files: ['test/**/*.mts'],
    rules: { 'no-shadow': 0, 'unicorn/max-nested-calls': 0 },
  },
  {
    // 主题组件的目录名**就是**组件名（`@theme/Logo` 靠它拼出来），官方口径是 PascalCase；
    // 改成 kebab-case 等于改掉别名语义。
    files: ['src/theme/**', 'demo/*/theme/**', 'theme/*/theme/**'],
    rules: { 'unicorn/filename-case': 0 },
  },
  {
    // 配置期的共享帮手（`lib/api-frame-theme.mts`、`lib/api-frame-source-js-rule.ts`）跑在 Node 里，
    // 引 `node:path` 是它们的职责；浏览器那一份（`lib/index.ts`）不在这一条里。
    files: ['theme/*/lib/api-frame-*.{mts,ts}'],
    rules: { 'import-x/no-nodejs-modules': 0 },
  },
  {
    // webpack loader 的上下文（`this.async()` / `this.resourcePath` / `this.cacheable()`）
    // 就是由 Webpack 绑在 `this` 上的，官方签名不给参数对象 —— 改成别的写法就不再是 loader。
    files: ['theme/*/src/loader/**'],
    rules: { 'unicorn/no-this-outside-of-class': 0 },
  },
  {
    // Docusaurus 的入口**按契约**只读 default 导出：主题组件、插件入口、页面、
    // 配置文件。改成命名导出不会报错，只会静默不生效 —— 这条在这里不是风格问题。
    // webpack loader 同理：Webpack 取的就是模块导出的那一个函数。
    // 站点侧的导出模板（`erd/*.mjs`）也一样：装载它的 loader 取的是那份 module 的
    // `default`，改成命名导出会在构建期才报「没有默认导出一个函数」。
    // Playwright 的配置也是同一类：加载器只认 default 导出的那个配置对象。
    // `sidebars.mts` 同理 —— 它由 `sidebarPath` 交给同一套配置加载器，只认那份默认导出。
    files: [
      'src/**',
      '*.config.mjs',
      'playwright.config.mts',
      'sidebars.mts',
      'plugins/*/src/index.mts',
      'demo/*/index.mts',
      'demo/*/theme/**',
      'theme/*/src/index.mts',
      'theme/*/src/loader/**',
      'theme/*/theme/**',
      'erd/*.mjs',
    ],
    rules: { 'import-x/no-default-export': 0 },
  },
  {
    // 夹具里的 default 导出就是被测的那份契约（外接生成器模块要求默认导出一个函数），
    // 换成命名导出会让用例测的东西不再是站点真正写进配置的那一种。
    files: ['test/fixtures/**'],
    rules: { 'import-x/no-default-export': 0 },
  },
  {
    // 仓库级脚本：`process.exit` 是 CLI 的退出方式；依赖允许来自 devDependencies
    // （这类工具本来就不该进运行时依赖）。
    files: ['scripts/**', 'demo/scripts/**'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        { devDependencies: true },
      ],
      'n/no-process-exit': 0,
      'unicorn/no-process-exit': 0,
    },
  },
];
