const config = {
  title: 'Theme Override Test',
  tagline: '验证多主题覆盖同一组件与主题别名语义',
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  organizationName: 'airkro',
  projectName: 'test-ci',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  plugins: [
    // 链式覆盖：新增 `@theme-prev/X` 系列 specifier，不改 `@theme-original` 官方语义。
    // 不需要配置清单：这个数组的顺序就是层栈顺序。语义、推导与「改完源码要 `pnpm build:core`」
    // 的编译口径，记在 `plugins/plugin-prev-layer-resolver/README.md`。
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
    '@show-docs/docusaurus-theme-erd',
    // iframe 主题层：它是「整页交给一个框」这一族的**唯一外层套壳** —— 那份 `DocItem` 判四把键
    // （`scalar` / `redoc` / `oas3` / `iframe`），命中就把正文区换成通用框。默认顺序与启用范围在
    // `theme/theme-iframe/lib/api-frame-registry.ts`（未安装的层不参与判定），站点可在这一项自己的
    // 插件选项里覆盖 `{ themeConfig: { apiFrame: { order: [命名空间…] } } }`：顺序即优先级、
    // 列出的即启用范围。本站不配这一格 = 走注册表默认（scalar 优先），判据在 e2e 的
    // frame-precedence 用例。口径全在 `theme/theme-iframe/docs/iframe-protocol.md`。
    '@show-docs/docusaurus-theme-iframe',
    // 下面三条 API 层各注册自己那条框内页面与渲染器差异，外层套壳与共用约定都在 theme-iframe：
    // 键分别是 `oas3` / `redoc` / `scalar`，口径分别在各包自己的 README。
    '@show-docs/docusaurus-theme-stoplight',
    '@show-docs/docusaurus-theme-redoc',
    '@show-docs/docusaurus-theme-scalar',
    // 图片查看器主题层：它不看 frontmatter，判的是正文里有没有图片。这一层覆盖的是
    // `DocItem/Content`（其余各层覆盖的是 `DocItem`），放在最里面，`@theme-prev` 那一步
    // 落到官方那份实现，正文一个字都不改。
    '@show-docs/docusaurus-theme-viewer',
  ],

  presets: [
    [
      'classic',
      /**
      @type {import('@docusaurus/preset-classic').Options}
      */
      ({
        // 站点没有单独的首页组件：`docs/intro.md` 就是主页（`slug: /` 落在这里）。
        // `routeBasePath: '/'` 把 docs 的前缀挪到根，于是没有「页面层」去和主题层争同一格。
        // docs 默认只收 `.md` / `.mdx`；`.dbml` 是 theme-erd 的文档源，得写进 include。
        docs: {
          routeBasePath: '/',
          include: ['**/*.{md,mdx,dbml}'],
        },
        blog: false,
      }),
    ],
  ],

  themeConfig: {
    navbar: { title: 'Theme Override Test', items: [] },
    footer: {
      style: 'dark',
      // 三条 API 层的示例页 + 那四条非 API 页，各占一列，用来验「整页交给框」时页脚该收掉
      links: [
        {
          title: 'API 渲染器',
          items: [
            { label: 'Scalar', to: '/scalar-demo' },
            { label: 'Redoc', to: '/redoc-demo' },
            { label: 'Stoplight', to: '/stoplight-demo' },
          ],
        },
        {
          title: '其他',
          items: [
            { label: '思维导图', to: '/markmap-demo' },
            { label: '数据库关系图', to: '/erd-demo' },
            { label: '图片查看器', to: '/viewer-demo' },
            { label: '外部页面（iframe）', to: '/iframe-demo' },
          ],
        },
      ],
      copyright:
        'Theme Override Test —— 本页脚由站点 themeConfig.footer 配置。',
    },
  },
};

export default config;
