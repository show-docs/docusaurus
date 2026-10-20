/**
「整页交给一个框」这一族层的注册表：一条层 = 一个条目，四条都在这一份里（`scalar` / `redoc`
/ `stoplight` / `iframe`）。

这里是**纯数据 + 纯函数，不引 React、不引浏览器**：配置期（各包入口经工厂）与浏览器期
（`DocItem`、框内 view）两边引同一份源码，路由名、参数名这些不再像以前那样在编译边界两侧
各写一份常量。带 `FrameMessages` 的那份缓存归 `api-frame-messages.ts` —— 这一份必须能过
node-bundle（没有 DOM）的类型检查。

判定的先后 = 这份清单的顺序，语义与原层栈一致（越靠外的层先判自己的键：scalar 最外、
stoplight 次之、redoc 再次、`iframe:` 排在三条 API 层之后）。一页同写两个键时，
排在前面的条目赢。
*/

/** 条目共有的形状；两种 `kind` 差的格见下面两个类型。 */
type ApiFrameEntryBase = {
  /** 包名，同时是三条 postMessage 的命名空间与插件名。 */
  namespace: string;
  /** md frontmatter 里那条键，值就是框要渲染的地址。 */
  frontmatterKey: string;
  /** 外层 `<iframe>` 的类名：各层自己的版式规则挂在它上面。 */
  frameClass: string;
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
  /** 外层 `<iframe>` 的 `title`。 */
  title: string;
};

/** 框里是**外部站点**（跨源）：没有那条通道，地址算法归用它的层自己管。 */
export type ApiFrameEntryExternal = ApiFrameEntryBase & {
  kind: 'external';
};

export type ApiFrameEntry = ApiFrameEntryInternal | ApiFrameEntryExternal;

/**
这一族的清单（顺序 = 判定优先级，见文件头）。

新增一条 API 层：这里加一条（route、参数名、类名），用它的包只写入口工厂那一次调用与框内
那一份渲染接线，外层不再有自己的代码。
*/
const apiFrameEntries: readonly ApiFrameEntry[] = [
  {
    kind: 'internal',
    namespace: '@show-docs/docusaurus-theme-scalar',
    frontmatterKey: 'scalar',
    route: 'scalar-view',
    pageComponent: '@theme/ScalarPage',
    specParam: 'src',
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
    frameClass: 'redoc-frame',
    title: 'API 文档',
  },
  {
    kind: 'internal',
    namespace: '@show-docs/docusaurus-theme-stoplight',
    frontmatterKey: 'oas3',
    route: 'stoplight-view',
    pageComponent: '@theme/StoplightPage',
    specParam: 'src',
    frameClass: 'stoplight-frame',
    title: 'API 文档',
  },
  {
    kind: 'external',
    namespace: '@show-docs/docusaurus-theme-iframe',
    frontmatterKey: 'iframe',
    frameClass: 'iframe',
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
