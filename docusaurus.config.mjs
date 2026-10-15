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
    // 下面第一项不是层（没有 `getThemePath()`），是解析器；后三项是层，顺序 = 层栈。
    // eslint-disable-next-line unicorn/prefer-module -- 本文件由 Docusaurus 的配置加载器执行，`require` 在那儿真实存在（`pnpm build` 绿即为证）
    require.resolve('@show-docs/docusaurus-plugin-prev-layer-resolver'),
    '@show-docs/theme-a',
    '@show-docs/theme-b',
    '@show-docs/theme-c',
    // 思维导图主题层：栈在最外，DocItem 覆盖生效；md 里 `markmap: true` 即整页导图
    '@show-docs/docusaurus-theme-markmap',
  ],

  presets: [
    [
      'classic',
      /**
      @type {import('@docusaurus/preset-classic').Options}
      */
      ({
        docs: {},
        blog: false,
      }),
    ],
  ],

  themeConfig: {
    navbar: { title: 'Theme Override Test', items: [] },
  },
};

export default config;
