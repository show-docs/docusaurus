// 文档插件扫哪些文件。放在外面是因为有两处要**同一份**：`docs` 选项（真正生效的那一份）与
// 徽标那一层的 `docs`（转述给它的地盘判据）。抄两遍迟早会漂，漂了就是「徽标挂在一批站点里
// 不存在的页面上」或者「站点里的页面一个徽标都没有」。
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
    // 侧边栏徽标：给「新建」与「更新过」的页面挂一枚纯色点。判据是 **git**，载体是官方那条
    // `sidebar_custom_props` 通道，画法在那一层自己的 `theme/DocSidebarItem/` 与 `components/`。
    //
    // 这一层是**主题层**：它覆盖的那两格由官方别名「全局赢家」那条规则决定 —— 站点层若再
    // swizzle 同一格就压过它。所以这两格只由那一层管，站点层不碰。
    //
    // 判据、徽标种类、页面自己钉的那把键（`git_badge`）全在包里，站点写不出来也不必写。
    //
    // `docs` 那一格是**转述**：真正生效的选项在下面 classic 预设里，插件手上拿不到，所以把
    // `path` / `include` / `exclude` 在这里再写一遍 —— 徽标的地盘跟着文档插件扫出来的那批
    // 文件走。
    [
      '@show-docs/docusaurus-theme-git-badge',
      {
        docs: {
          path: 'packages',
          include: DOCS_INCLUDE,
          exclude: DOCS_EXCLUDE,
        },
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
    // 思维导图主题层：md 里 `markmap: true`（或一个选项对象）即在原文上方加导图。
    // 它不再提供 `DocItem`：在自己的 `loadContent()` 里把 `markmap` 那一页交给下面的
    // component-page，命中后挂上它自己的 `theme/MarkmapPage`。
    '@show-docs/docusaurus-theme-markmap',
    // 关系图主题层：`.dbml` 文件在上方画关系图，正文附上各格式导出。
    // 它不提供 `DocItem`：loader 给 `.dbml` 页写出的 `dbml_json` 那条导出，由本层在自己的
    // `loadContent()` 里交给下面的 component-page，命中后挂上本包的 `theme/ErdPage`。
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
    // 差异视图主题层：md 里 `diff: true`（或一个路径 / `{ old, new }`）即在正文上方渲染差异。
    // 它不提供 `DocItem`：`diff` 那一页在自己的 `loadContent()` 里交给 component-page，
    // 命中后挂本包的 `theme/DiffPage`（与 markmap 同一形态）。
    '@show-docs/docusaurus-theme-diff',
    // 下面三条 API 层各在自己的 `loadContent()` 里交出自己那把键（由 theme-iframe 的工厂
    // `lib/api-frame-theme.mts` 代交）：`scalar` / `redoc` / `stoplight`，都写 `true`；渲染哪份
    // 文档读 spec 键（OpenAPI 写 `oas3:`、AsyncAPI 3 写 `aas3:`），口径分别在各包自己的 README。
    // **声明顺序就是命中优先级**：component-page 把各包交来的条目按这里的顺序接起来，一页同时
    // 写中多把键时排在前面的先判。本站因此把 scalar 放最前，e2e 的 frame-precedence 用例钉着
    // 这个落点。
    '@show-docs/docusaurus-theme-scalar',
    '@show-docs/docusaurus-theme-redoc',
    '@show-docs/docusaurus-theme-stoplight',
    // iframe 主题层：「整页交给一个框」这一族的外层组件与共用约定（`theme/ApiFramePage`、
    // 消息循环、地址算法）。它只交自己那把 `iframe:`（地址值），排在三条 API 层之后 ——
    // 同一页也写了 API 键时，那三把先判。注册表 `packages/theme-iframe/src/api-frame-registry.ts`
    // 是这一族的数据来源（键名、框内路由、类名、title），不再决定判定先后。口径全在
    // `packages/theme-iframe/docs/iframe-protocol.md`。
    '@show-docs/docusaurus-theme-iframe',
    // 「整页交给一个组件」的通用套壳：清单挂在本层的插件选项上，一条 = 一把键（写在
    // frontmatter 里的，或 loader 往模块里追加的命名导出）+ 一个组件说明符，命中就把整个
    // `DocItem` 换成那个组件（本站那一条指向站点自己的
    // `src/theme/ComponentPageDemo`，示例页 `/theme-component-page/docs/component-page-demo`）。
    //
    // 仓库里只有本层提供 `DocItem`，所以落空时交回官方那一份（`@theme-init/DocItem`），
    // 没有要串的链。
    // 上面 iframe 那四条框页与 markmap / erd / diff 那三页也走这一份清单（各自在
    // `loadContent()` 里交进来，排在本站这一条后面），命中后分别由 `@theme/ApiFramePage` /
    // `@theme/MarkmapPage` / `@theme/ErdPage` / `@theme/DiffPage` 渲染 —— 这一层因此是
    // 「整页交给谁」的唯一套壳。
    // 本站的键是 `componentPage`（认真布尔 `true`），与那几把交来的键都不撞。
    [
      '@show-docs/docusaurus-theme-component-page',
      {
        pages: [
          {
            key: 'componentPage',
            component: '@theme/ComponentPageDemo',
            props: { label: '组件接管了这一页' },
          },
        ],
      },
    ],
    // 图片查看器主题层：它不看 frontmatter，判的是正文里有没有图片。这一层覆盖的是
    // `DocItem/Content`（其余各层覆盖的是 `DocItem`），拿的是官方那一份
    // （`@theme-init/DocItem/Content`），正文一个字都不改。
    '@show-docs/docusaurus-theme-viewer',
    // 导航栏那颗用户头像：它覆盖的是 `ColorModeToggle`（上面几层覆盖的是 `DocItem` /
    // `Footer/Copyright`），谁都不争同一格。
    //
    // 本站**故意不给 `userApi`**：这一层的开关就是那一格，不给时头像不出现、亮暗切换照旧，
    // 于是这一层在这里只被编译、被渲染一次「什么都没有」。真接上用户接口要写的那几格与
    // 「为什么本站看不到头像」，记在 `packages/theme-avatar/docs/avatar-demo.md`。
    '@show-docs/docusaurus-theme-avatar',
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
      swcHtmlMinimizer: true,
      swcJsMinimizer: true,
      mdxCrossCompilerCache: true,
      swcJsLoader: true,
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
