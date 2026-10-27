/**
「整页交给一个框」这一族层的注册表：一条层 = 一个条目，四条都在这一份里（`scalar` / `redoc`
/ `stoplight` / `iframe`）。这里是层的**数据**来源（route、参数名、类名、命名空间），
纯数据 + 纯函数、不引 React 不引浏览器：配置期（各包入口经工厂）与浏览器期（`DocItem`、框内
那页）引同一份源码，那些名字不再像以前那样在编译边界两侧各写一份常量。带 `FrameMessages`
的那份缓存归 `api-frame-messages.ts` —— 这一份必须能过 node-bundle（没有 DOM）的类型检查。

判定的先后 = 这份清单的顺序（**默认值**，站点可覆盖、没装的层不判 —— 那一步在
`api-frame-entries.ts`），语义与原层栈一致：越靠外的层先判自己的键。一页同写两把键时，
排在前面那条赢。

键分两族：**四把匹配键**（`scalar` / `redoc` / `stoplight` / `iframe`；前三个是布尔，
第四个是地址）与**一把 spec 键**（`oas3:`，三条 API 层读它当渲染源，`iframe:` 不沾边）。
*/

/** 条目共有的形状；两种 `kind` 差的格见下面两个类型。 */
type ApiFrameEntryBase = {
  /** 包名，同时是三条 postMessage 的命名空间与插件名。 */
  namespace: string;
  /**
  md frontmatter 里那条键，**值的形状按 `kind` 分**：

  - `internal`（三条 API 层）：布尔 —— `scalar: true` 只表示「这一层接这一页」，
    要渲染哪份文档另由 `specFrontmatterKey` 那把键给（`oas3:`）；
  - `external`（`iframe:`）：非空字符串 —— 值就是框要渲染的那个地址。
  */
  frontmatterKey: string;
  /**
  外层 `<iframe>` 的**第二个**类名（第一个是共用的 `.api-frame`，尺寸与容器让位都在那一条上）。
  这一格现在只用来认「这一格是哪一层赢的」，挂只属于一层的规则（如 stoplight 收页脚）。
  */
  frameClass: string;
  /**
  外层 `<iframe>` 的 `title` **兜底值**：页面写了 `frontMatter.title` 时优先用页面自己的
  （`ApiFrame` 那一步），这一格是缺它时的可读名字。
  */
  title: string;
};

/** 框里是本包自己那条插件页面（同源），深链与亮暗靠 `frame-sync.ts` 那两条消息循环对齐。 */
export type ApiFrameEntryInternal = ApiFrameEntryBase & {
  kind: 'internal';
  /** 框内那条页面的路径名（不带 `baseUrl`），由本包入口经 `addRoute` 注册。 */
  route: string;
  /** `component` 写 `@theme/` 下的别名（如 `'@theme/ScalarPage'`），经 `getThemePath()` 挂层。 */
  pageComponent: string;
  /** 框内地址里带 spec 地址的那一条查询参数名。 */
  specParam: string;
  /**
  md frontmatter 里那条**给 spec 地址**的键（`oas3:`）。三条 API 层读的是同一把 ——
  「用哪一层渲染」与「渲染哪份文档」是两件事：前者由各自的布尔键（`scalar: true`……）
  决定，后者由这一把决定。

  这一格与 `iframe:` 那条毫无关系：那条嵌的是外部页面，地址自带，不读这一把。
  */
  specFrontmatterKey: string;
};

/** 框里是**外部站点**（跨源）：没有那条通道，地址算法归用它的层自己管。 */
export type ApiFrameEntryExternal = ApiFrameEntryBase & {
  kind: 'external';
};

export type ApiFrameEntry = ApiFrameEntryInternal | ApiFrameEntryExternal;

/** 这一族的清单（顺序 = 判定优先级，见文件头）。新增一条层的做法见 `docs/iframe-protocol.md`。 */
const apiFrameEntries: readonly ApiFrameEntry[] = [
  {
    kind: 'internal',
    namespace: '@show-docs/docusaurus-theme-scalar',
    frontmatterKey: 'scalar',
    route: 'scalar-view',
    pageComponent: '@theme/ScalarPage',
    specParam: 'src',
    specFrontmatterKey: 'oas3',
    frameClass: 'scalar-frame',
    title: 'API 文档',
  },
  {
    kind: 'internal',
    namespace: '@show-docs/docusaurus-theme-redoc',
    frontmatterKey: 'redoc',
    route: 'redoc-view',
    pageComponent: '@theme/RedocPage',
    specParam: 'src',
    specFrontmatterKey: 'oas3',
    frameClass: 'redoc-frame',
    title: 'API 文档',
  },
  {
    kind: 'internal',
    namespace: '@show-docs/docusaurus-theme-stoplight',
    frontmatterKey: 'stoplight',
    route: 'stoplight-view',
    pageComponent: '@theme/StoplightPage',
    specParam: 'src',
    specFrontmatterKey: 'oas3',
    frameClass: 'stoplight-frame',
    title: 'API 文档',
  },
  {
    kind: 'external',
    namespace: '@show-docs/docusaurus-theme-iframe',
    frontmatterKey: 'iframe',
    frameClass: 'iframe',
    title: '其他文档',
  },
];

/** 按注册顺序遍历全部条目（`DocItem` 判键用的就是这个顺序）。 */
export function apiFrameEntriesOrdered(): readonly ApiFrameEntry[] {
  return apiFrameEntries;
}

/** 按包名取那一条层。取不到说明注册表里没有这一族 —— 调用方（入口工厂）应当立刻失败，
而不是带着一条没人注册的路由继续跑。 */
export function apiFrameByNamespace(
  namespace: string,
): ApiFrameEntry | undefined {
  return apiFrameEntries.find((entry) => entry.namespace === namespace);
}
