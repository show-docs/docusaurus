import {
  isRecent,
  repoPath,
  timesOf,
} from '@show-docs/docusaurus-plugin-frontmatter-injector';

// 文档插件扫哪些文件。放在外面是因为有两处要**同一份**：`docs` 选项（真正生效的那份）与
// frontmatter 注入插件的 `docs`（转述给它的地盘判据）。抄两遍迟早会漂，漂了就是「注入跑在
// 一批站点里不存在的页面上」或者「站点里的页面一个标签都没有」。
//
// 内容根是 `packages/`（见预设里的 `docs.path`）：每个包的 `README.md` 就是它在站点里的顶层页，
// 包内 `docs/` 是它的子页。所以这几条 glob 相对 `packages/` 写，不再带那一段前缀。
//
// `build/**` 前面那个 `**/` 不是多余的：micromatch 按「相对内容根」比，写成 `build/**` 只管得到
// 顶层那一层，`<包>/build/**` 这种产物目录仍然收得进来。
const DOCS_INCLUDE = [
  // 主页：内容根自己那份 README，`slug: /` 把它落在根
  'README.md',
  // 每个包的顶层页
  '*/README.md',
  // 包内文档与示例页
  '*/docs/**/*.{md,dbml}',
];

const DOCS_EXCLUDE = ['**/node_modules/**', '**/build/**', '**/.docusaurus/**'];

/**
页面自己钉住徽标的那把键：写 `git_badge: new` / `git_badge: update` 就由页面说了算，
不写就由 git 判。它**不是标签** —— 写它不会在正文标题下多出一颗芯片，也不进标签页。
*/
const PINNED_BADGE_KEY = 'git_badge';

/**
git 判出来的状态与徽标的对应：**只提交过一次且最近动过**是「新建」，其余**最近动过**的是
「更新」。没进这张表的两种（不是最近、压根没有历史）都不表态。

新建蕴含更新，所以「只提交过一次且最近动过」只画一个点（一格一个点）。
*/
const BADGE_BY_STATE = {
  'once/recent': 'new',
  'many/recent': 'update',
};

/**
git 判出来的那种徽标：与注入器包的 `tagsOf` 同一套判据（那边算成标签，这边算成徽标），
数据用包里那份 —— `timesOf` 给两个时刻，`isRecent` 给「最近动过没有」。

「最近」的两个口径都在包里：全仓最后 5 个提交，或最近 7 天（按此刻的墙上时钟算）。
*/
function gitBadgeKind(repo, filePath) {
  if (!repo) {
    return undefined;
  }

  const path = repoPath(repo, filePath);
  if (path === undefined) {
    return undefined;
  }

  const { created, updated } = timesOf(repo, filePath);
  if (updated === undefined) {
    return undefined;
  }

  const recent = isRecent(repo, path, updated);
  const state = `${created === updated ? 'once' : 'many'}/${
    recent ? 'recent' : 'old'
  }`;
  return BADGE_BY_STATE[state];
}

/**
侧边栏徽标：这一页是「新建」还是「更新过的」，写进官方那条 `sidebar_custom_props` 通道。

判据是 **git**，不是标签 —— 站点不再注入 git 标签了（正文那行芯片只放页面自己写的标签），
「新建 / 更新」这件事眼下只有这一枚徽标在说。徽标要是读标签，就得靠页面写
`tags: [git-new]` 才能钉死，而那会在正文里多出一颗芯片、还多一个标签页。
页面自己写了 `git_badge` 就以页面为准（那是钉子，不是判断）。

这一格不表态时返回 `undefined` —— 注入器把 `undefined` 当「不写这一格」，
那一页在侧边栏上就没有点子。

`sidebar_custom_props` 不是 `tags`，走的是注入器「只补不覆盖」那条语义：
页面自己写了 `sidebar_custom_props` 的那一页，徽标不进去（眼下没有页面这么写）。
*/
function badgeOf({ filePath, frontMatter, repo }) {
  const pinned = frontMatter[PINNED_BADGE_KEY];
  const kind =
    pinned === 'new' || pinned === 'update'
      ? pinned
      : gitBadgeKind(repo, filePath);

  return kind === undefined ? undefined : { gitBadge: kind };
}

const config = {
  title: 'Docusaurus Themes',
  tagline: '主题预览',
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  organizationName: 'show-docs',
  projectName: 'docusaurus',
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  plugins: [
    // frontmatter 注入：给每一页 md 补一格 `sidebar_custom_props` —— 这一页是「新建」还是
    // 「更新过的」，由站点自己判 git 得来（判据见上面那个 `gitBadgeKind`）。
    // 注入的是元数据，走官方 `markdown.parseFrontMatter` 那条路径，侧边栏与 MDX 产物会一起变。
    // 它**包装**站点已有的解析器而不是替换（站点自己那份可能正接在 CMS 上），且接线在
    // `loadContent()` 里（早于 docs 插件把它读走）。git 那一侧只整仓读一次，之后按文件查缓存，
    // 读不到 git 就这一格不表态。口径见包内 `docs/internals.md`。
    //
    // 徽标怎么画见 `src/components/sidebar-badge.tsx` 与 `src/theme/DocSidebarItem/`。
    //
    // `docs` 那一格是**转述**：真正生效的选项在下面 classic 预设里，插件手上拿不到，所以把
    // `path` / `include` / `exclude` 在这里再写一遍 —— 注入的地盘跟着文档插件扫出来的那批文件走。
    [
      '@show-docs/docusaurus-plugin-frontmatter-injector',
      {
        docs: {
          path: 'packages',
          include: DOCS_INCLUDE,
          exclude: DOCS_EXCLUDE,
        },
        // 规则表只有一条：注入器缺省那份（给每页补 `git-new` / `git-update`）**不在这儿** ——
        // 站点不再注入 git 标签，「新建 / 更新」由这一条自己判 git，写进官方那条
        // `sidebar_custom_props` 通道（侧边栏唯一一条 frontmatter → 侧边栏的路）。
        // `match` 覆盖 `.dbml` —— 关系图示例页也是站点里的一页。
        rules: [
          {
            name: 'sidebar-badge',
            match: /\.(mdx?|dbml)$/,
            frontMatter: { sidebar_custom_props: badgeOf },
          },
        ],
      },
    ],
    // 链式覆盖：新增 `@theme-prev/X` 系列 specifier，不改 `@theme-original` 官方语义。
    // 不需要配置清单：这个数组的顺序就是层栈顺序。语义、推导与「改完源码要 `pnpm build:core`」
    // 的编译口径，记在 `packages/plugin-prev-layer-resolver/README.md`。
    // 下面第一项不是层（没有 `getThemePath()`），是解析器；其余各项是层。
    // eslint-disable-next-line unicorn/prefer-module -- 本文件由 Docusaurus 的配置加载器执行，`require` 在那儿真实存在（`pnpm build` 绿即为证）
    require.resolve('@show-docs/docusaurus-plugin-prev-layer-resolver'),
    // 三层假主题：只用来钉「多个主题包裹同一个组件」这条链，各自不提供渲染器
    '@show-docs/theme-a',
    '@show-docs/theme-b',
    '@show-docs/theme-c',
    // 思维导图主题层：md 里 `markmap: true` 即在原文上方加导图
    '@show-docs/docusaurus-theme-markmap',
    // 关系图主题层：`.dbml` 文件在上方画关系图，正文附上各格式导出
    // `exports` 是那一串「导出模板」页签，本包不随带模板 —— 每条指向一个外接模块，
    // 这里用的是站点自己那份：相对**站点根**的路径。
    [
      '@show-docs/docusaurus-theme-erd',
      {
        exports: [
          {
            id: 'table-names',
            label: '表清单',
            lang: 'text',
            module: './erd/table-names.mjs',
          },
        ],
      },
    ],
    // 差异视图主题层：md 里 `diff: true`（或一个路径）即在正文上方渲染这份文件最近一次提交的差异
    '@show-docs/docusaurus-theme-diff',
    // iframe 主题层：它是「整页交给一个框」这一族的**唯一外层套壳** —— 那份 `DocItem` 判四把键
    // （`scalar` / `redoc` / `stoplight` / `iframe`；前三把是布尔、后一把是地址），命中就把正文区
    // 换成通用框。默认顺序与启用范围在
    // `packages/theme-iframe/lib/api-frame-registry.ts`（未安装的层不参与判定），站点可在这一项自己的
    // 插件选项里覆盖 `{ themeConfig: { apiFrame: { order: [命名空间…] } } }`：顺序即优先级、
    // 列出的即启用范围。本站不配这一格 = 走注册表默认（scalar 优先），判据在 e2e 的
    // frame-precedence 用例。口径全在 `packages/theme-iframe/docs/iframe-protocol.md`。
    '@show-docs/docusaurus-theme-iframe',
    // 下面三条 API 层各注册自己那条框内页面与渲染器差异，外层套壳与共用约定都在 theme-iframe：
    // 键分别是 `stoplight` / `redoc` / `scalar`（都写 `true`），渲染哪份文档统一读 `oas3:`，
    // 口径分别在各包自己的 README。
    '@show-docs/docusaurus-theme-stoplight',
    '@show-docs/docusaurus-theme-redoc',
    '@show-docs/docusaurus-theme-scalar',
    // 图片查看器主题层：它不看 frontmatter，判的是正文里有没有图片。这一层覆盖的是
    // `DocItem/Content`（其余各层覆盖的是 `DocItem`），放在最里面，`@theme-prev` 那一步
    // 落到官方那份实现，正文一个字都不改。
    '@show-docs/docusaurus-theme-viewer',
    // 页脚复制按钮：它覆盖的是 `Footer/Copyright`（上面几层覆盖的是 `DocItem` /
    // `DocItem/Content`），谁都不争同一格，放在层栈最外面。判据不是 frontmatter，
    // 而是站点有没有写 `themeConfig.footer.copyright`。
    '@show-docs/docusaurus-theme-copy-button',
    // 开发期 webpack 加速：非 build 的客户端编译开 `lazyCompilation`（页面与依赖按需编译，
    // 首屏更快）。`configureWebpack` 不是站点配置的合法字段（配置 schema 会直接拒收），
    // 它只能是插件生命周期方法，所以逻辑放进 `packages/plugin-lazy-compilation/` 那个子包、
    // 在这里按包名挂上。
    // 这个插件没有主题目录，不参与上面的层栈推导（见 layers.mts 的过滤口径）。
    '@show-docs/docusaurus-plugin-lazy-compilation',
  ],

  presets: [
    [
      'classic',
      /**
      @type {import('@docusaurus/preset-classic').Options}
      */
      ({
        // 站点没有单独的首页组件：`packages/README.md` 就是主页（`slug: /` 落在这里）。
        // `routeBasePath: '/'` 把 docs 的前缀挪到根，于是没有「页面层」去和主题层争同一格。
        //
        // 内容根是 `packages/`：每个包的 `README.md` 就是它在站点里的顶层页（Docusaurus 认
        // `README.md` 是所在目录的索引页，所以地址是 `/theme-scalar/`），这个包 `docs/` 目录里的
        // 那几页 —— 示例页与维护者文档 —— 是它的子页（`/theme-scalar/docs/…`）。
        // 主页占的也是这一条规则的格子：内容根自己那份 `README.md` 是索引页，被 `slug: /` 挪到了根，
        // 所以内容根那一格本身没有单独的地址。
        // include 因此按包点名，而不是 `**/*.md`：`packages/` 下那些只给仓库读者看的说明
        //（包根上的其他 md、`packages/*/build/` 里的产物）不进站点；仓库根那些说明
        //（根 README、`tools/README.md`、`src/theme/README.md`、`test/README.md`）在内容根之外。
        // 每一格对应哪个包、顺序怎么来，见 `sidebars.mts`（扫目录得到，没有手抄的清单）。
        docs: {
          routeBasePath: '/',
          path: 'packages',
          sidebarPath: './sidebars.mts',
          include: DOCS_INCLUDE,
          // 内容根挪到 `packages/` 之后要挡掉的两类东西：装出来的依赖与产物里那些 `README.md`
          // 副本（它们不是文档源，收进来只会变成一堆重名页）。
          exclude: DOCS_EXCLUDE,
        },
        blog: false,
        // 站点自己那份样式表：眼下只有主页那条四层链最外层 `[SITE]` 那道彩色虚线
        //（`src/css/custom.css` 没有自动生效的约定，必须由这里点名，路径按站点根算）。
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  // CSS 压缩器：官方默认是 cssnano 预设 + clean-css，其中 **clean-css 不认识 CSS Nesting**
  //（`&[data-v-…]` 那种）；`csso` 只是 css-minimizer-webpack-plugin 带来的备选，默认没走它。
  // `@scalar/api-reference` 那份样式表正好含嵌套，于是产物里 `@container client-libraries-list`
  // 那段被吃掉一条 `.client-libraries__select`，边界上还多出一个 `}`（括号总账 -1），
  // PostCSS 与 clean-css 各报一次，看着像「两条告警」，其实是同一个坏点。
  //
  // 换成 lightningcss：它认嵌套（不摊平时原样留着 `&`，浏览器认就直接跑），
  // 三条告警一起消失，`select` 那条规则回来。代价是产物大 9.7%（详见 issue #15 的实测表），
  // 以及这里只能是**这一格**开关 —— `faster: true` 那种简写会顺带打开 swc / rspack /
  // 持久缓存，跟压缩器无关的变量一概不要。
  //
  // theme-viewer 也靠这一格：`viewerjs` 那份样式表同样是原生嵌套，本包已删掉自己那句
  // `postcss-nesting`，宿主没开 lightningcss 时它在 `loadContent()` 里直接报错。
  //
  // 依赖关系：这一格为 true 时 `@docusaurus/bundler` 会 `import('@docusaurus/faster')`，
  // 缺包直接抛错，所以 devDependencies 里那个包不是可选项；版本要跟 `@docusaurus/core` 同轨。
  future: {
    faster: {
      lightningCssMinimizer: true,
    },
  },

  themeConfig: {
    navbar: { title: 'Theme Override Test', items: [] },
    footer: {
      style: 'dark',
      // 页脚不摆链接：示例页的入口只有主页那张卡片列表一处（清单由侧边栏自动给，
      // 见 packages/README.md），页脚再抄一份就是第二处要跟着新增页面改的地方。
      // 这一格留着 `copyright` 两件事才成立：页脚整块还在（`test/e2e` 那两条
      // 「这一页有/没有站点的页脚」判的是它收没收起），以及页脚复制按钮那层有地方挂。
      copyright:
        'Theme Override Test —— 本页脚由站点 themeConfig.footer 配置。',
    },
  },
};

export default config;
