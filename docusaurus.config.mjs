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
    // 链式覆盖：新增 @theme-prev/X 系列 specifier，不改 @theme-original 官方语义。
    // 不需要配置清单：plugins 数组顺序就是层栈顺序。都按**包名**加载（workspace 包，
    // `require.resolve` 指的是 dist 产物，改完源码记得 `pnpm build:core`）。
    //
    // 下面第一项不是层（没有 `getThemePath()`），是解析器；其余各项是层，顺序 = 层栈。
    // eslint-disable-next-line unicorn/prefer-module -- 本文件由 Docusaurus 的配置加载器执行，`require` 在那儿真实存在（`pnpm build` 绿即为证）
    require.resolve('@show-docs/docusaurus-plugin-prev-layer-resolver'),
    '@show-docs/theme-a',
    '@show-docs/theme-b',
    '@show-docs/theme-c',
    // 思维导图主题层：md 里 `markmap: true` 即在原文上方加导图
    '@show-docs/docusaurus-theme-markmap',
    // iframe 主题层：md 里 `iframe: <URL>` 即把正文区换成那个外部页面
    '@show-docs/docusaurus-theme-iframe',
    // Stoplight 主题层：md 里 `oas3: <URL>` 即整页交给 OpenAPI 渲染器；
    // 各层的 DocItem 各判各的 frontmatter，不命中就把 props 交回 `@theme-prev/DocItem`。
    '@show-docs/docusaurus-theme-stoplight',
    // Redoc 主题层：md 里 `redoc: <URL>` 即整页换成一个 iframe，框里是本包自己那条
    // `/redoc-view` 页面，Redoc 在那份文档里渲染。它同时注册那条路由；Redoc 的 CSS 由
    // styled-components 在运行时注入，构建期圈不住，但有了文档边界就不需要圈 —— 运行期那条链上
    // 只剩「把它的暗色表改挂到本层自己那条 data-redoc-mode 上」这一件事，口径记在 `theme/theme-redoc/README.md`。
    '@show-docs/docusaurus-theme-redoc',
    // Scalar 主题层（栈在最外）：md 里 `scalar: <URL>` 即整页换成一个 iframe，框里是本包自己那条
    // `/scalar-view` 页面，Scalar 在那份文档里渲染。形状与上面两条一对一（同一份 `theme/frame-kit`
    // 约定），差的地方都在框内那一页里：Scalar 是 Vue 3 的组件，用 `createApiReference` 挂进
    // 一格 `<div>`；它的样式是发布好的静态 `style.css`，会被并进全站那一份 css、iframe 拦不住，
    // 不越界靠的是厂商每条规则自带的 `.scalar-app` 前缀（实测）；
    // 它的亮暗不挂属性而是 `<body>` 上互斥的两个类名。口径见 `theme/theme-scalar/README.md`。
    '@show-docs/docusaurus-theme-scalar',
  ],

  presets: [
    [
      'classic',
      /**
      @type {import('@docusaurus/preset-classic').Options}
      */
      ({
        // 站点没有单独的首页组件：`docs/intro.md` 就是主页（`slug: /` 落在这里）。
        // `routeBasePath: '/'` 把 docs 的路由前缀从 `/docs` 挪到根，于是 `/` 是 intro、
        // `/markmap-demo` 是示例页 —— 不再有一个「页面层」去和主题层争同一格。
        docs: { routeBasePath: '/' },
        blog: false,
      }),
    ],
  ],

  themeConfig: {
    navbar: { title: 'Theme Override Test', items: [] },
  },
};

export default config;
