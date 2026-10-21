/**
核心包对外 / 对内的公共类型。单独成文件是因为层栈对象在多个模块间传递，
集中定义可避免循环依赖与重复声明。
*/

/** 主题层的来源：官方兜底 / preset 或用户 plugin / 站点 src/theme */
export type ThemeLayerKind = 'fallback' | 'plugin' | 'site';

/** 层栈里的一层（内 → 外有序） */
export interface ThemeLayer {
  /** 展示名，如 `theme-a` / `site:src/theme` / `theme-fallback` */
  name: string;
  /** 主题目录绝对路径 */
  owner: string;
  /** 目录是否存在（不存在的目录不是层） */
  exists: boolean;
  kind: ThemeLayerKind;
}

/** 站在 Docusaurus 插件实例的角度，我们只需要这几个字段 */
export interface DocusaurusPluginLike {
  /** 插件名，用于层展示名 */
  name?: string;
  /** 插件所在目录（`getThemePath()` 相对路径的基准），官方 `initPlugins` 会补 */
  path?: string;
  /**
  插件选项（含官方补的 `id`）：推导路径下由我们自己实例化插件，官方那份不会出现，
  因此对齐官方行为手动补上（补齐口径见 `plugins.mts` 的 `withOfficialFields`）。
  */
  options?: Record<string, unknown>;
  getThemePath?: () => string | undefined;
}

/**
解析请求（enhanced-resolve 的 `ResolveRequest` 里我们真正读的那几个字段）。
`context` 的形状不归我们定，所以用 `unknown` 接收、运行时判型（见 `resolveIssuer`）。
*/
export interface ResolveRequestLike {
  request?: string;
  context?: unknown;
}

/** 解析上下文：只用到 `stack`（这条路走过没有） */
export interface ResolveContextLike {
  stack?: unknown;
}

/** webpack 内联类型描述的那些值没有公共类型，形状兼容即可 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResolveAny = any;

/**
`resolve.plugins` 项面对的那个 resolver，只描述真正会用的能力。

写成形状而不引用 `enhanced-resolve` 的 `Resolver`：webpack 用的是它**内联**的快照，
结构相同却不是同一类型，版本一错位就判「不可赋值」（实测 5.26 的
`Resolver.options.packageMap` 是必填，webpack 5.111 内联的那份还没有）。
*/
export interface ResolverLike {
  /** 取（必要时创建）具名 hook，返回值可直接喂给 `doResolve` */
  ensureHook(name: string): { name?: string };
  /** 挂 `resolve` 用的那个 hook */
  getHook(name: string): {
    tapAsync(
      name: string,
      fn: (
        request: ResolveAny,
        resolveContext: ResolveAny,
        callback: ResolveAny,
      ) => void,
    ): void;
  };
  /** 从某个 hook 继续解析 */
  doResolve(
    hook: ResolveAny,
    request: ResolveAny,
    message: string,
    resolveContext: ResolveAny,
    callback: ResolveAny,
  ): void;
}

/** 解析目标的结果；返回 null 表示「不改写，交回官方解析」 */
export interface ResolvedThemeTarget {
  /** 目标组件文件的绝对路径 */
  target: string;
  /** 落点说明（层名），用于 debug label */
  via: string;
  /** 导入者所在层下标 */
  issuerIndex: number;
  /** 目标层下标；恒 `>= 0`（没有落点时返回 null 而不是这个对象） */
  targetIndex: number;
}

/** 极简 logger 接口，默认 console */
export interface LoggerLike {
  warn?: (...args: unknown[]) => void;
  log?: (...args: unknown[]) => void;
}
