import type { PrevLayerResolverPlugin } from './resolver.mts';

/**
rspack 那一支的接线：把同一份改写判据挂到**模块工厂的解析前**那一格。

为什么这一支不能用 `resolve.plugins`：rspack 的 `ResolveOptions` 没有 `plugins` 这一格，
塞进去的那把 resolver 的 `apply()` 一次都不会被调用（实测：配置归一化之后那个键还在，
只是没人消费）。于是 webpack 一支照旧走 enhanced-resolve，这一支改走
`compiler.hooks.normalModuleFactory` → `nmf.hooks.beforeResolve`，把 `resolveData.request`
就地换成落点文件 —— 判据仍是 `PrevLayerResolverPlugin.resolveTarget`，两支共用一份。

两处差异要记住（都在「交回来的那个字符串长什么样」，不在判据）：这一格拿到的是**解析前**的原始
request，所以带 `?query` 的写法、以及行内 loader 的 `!!<loader>!@theme-prev/Logo` 整串都会进来；
webpack 那一支由 enhanced-resolve 先把前缀切掉再交给 resolver。`resolveTarget` 只认裸串，
所以切开再判、改完拼回是这一支自己的活（见下面的 `rewrite`）。完整推演与取舍见仓库根
`proposal-prev-layer-rspack.md`。

两个 bundler 其实都收这条 hook；webpack 一支不走它，是为了保住 `resolve.plugins` 那套
已验证的接线与它的能力自检（`./resolver.mts` 的 `apply()`），不是因为它在 webpack 上不行。
*/

/** tapable hook 里我们用到的那一格（`AsyncSeriesBailHook`；不收官方类型，理由同 `./types.mts` 的 `ResolverLike`） */
interface TapHookLike {
  tap?(name: string, fn: (arg: never) => void): void;
}

/** 模块工厂：只用 `hooks.beforeResolve` */
interface NormalModuleFactoryLike {
  hooks?: { beforeResolve?: TapHookLike };
}

/** compiler：只用 `hooks.normalModuleFactory` */
interface CompilerLike {
  hooks?: { normalModuleFactory?: TapHookLike };
}

/** `beforeResolve` 交回来的那份数据里我们读与写的两格（`contextInfo.issuer` = 发起这次导入的文件） */
interface ResolveDataLike {
  request?: string;
  contextInfo?: { issuer?: string };
}

/** 挂在 hook 上的名字（告警与 devtool 里的 tap 名都取它） */
const TAP_NAME = 'PrevLayerResolveTapPlugin';

/** 「这一格的 hook 不在」的告警文案：两支同形，只在括号里点名是哪一格 */
const hookMissing = (where: string): string =>
  `[plugin-prev-layer-resolver] ${where} 上没有 \`beforeResolve\` hook，` +
  '`@theme-prev/*` 已整体禁用（保持官方解析，表现为真实的 Module not found）。' +
  '这通常意味着 rspack / webpack 版本变了，请升级 plugin-prev-layer-resolver。';

export class PrevLayerResolveTapPlugin {
  /** 与 webpack 一支同一个实例：解析判据、缓存与告警去重都挂在这份上，两支不该各建一份 */
  resolver: PrevLayerResolverPlugin;

  constructor(resolver: PrevLayerResolverPlugin) {
    this.resolver = resolver;
  }

  /**
   挂 hook。每一格都先判再说：拿不到就**响一次并整体禁用** —— 这次的根因正是
   「我们 tap 的东西在这个 bundler 里不存在，而全程没人说话」，静默不生效是这个包最坏的错误形状。
  */
  apply(compiler: CompilerLike): void {
    const normalModuleFactory = compiler?.hooks?.normalModuleFactory;
    if (typeof normalModuleFactory?.tap !== 'function') {
      this.resolver.warn(hookMissing('compiler.hooks'));
      return;
    }

    normalModuleFactory.tap(TAP_NAME, (factory) => {
      const beforeResolve = (factory as NormalModuleFactoryLike | undefined)
        ?.hooks?.beforeResolve;
      if (typeof beforeResolve?.tap !== 'function') {
        this.resolver.warn(hookMissing('normalModuleFactory.hooks'));
        return;
      }
      beforeResolve.tap(TAP_NAME, (resolveData) => {
        this.rewrite(resolveData as ResolveDataLike | undefined);
      });
    });
  }

  /**
   改写一次请求；不是 `@theme-prev/*`（或判据交回 null）时**一个字段都不动**。

   返回恒为 `undefined`：`beforeResolve` 是 bail hook，交回真值会让 bundler 认为「这次解析
   已经被处理过」而跳过后续 —— 要的是就地改 `request`，不是接管它。
  */
  rewrite(resolveData: ResolveDataLike | undefined): void {
    const request = resolveData?.request;
    if (!resolveData || typeof request !== 'string') return;

    // 行内 loader 的写法（`!!<loader>!@theme-prev/Logo`）在这一支是**整串**交回来的：
    // webpack 那一支的 resolver 收到的是已经切掉前缀的那一段（实测，见 docs/internals.md
    // 「两支交回的 request 不是同一个字符串」），判据只认裸串，所以这里先按上游同一个口径切开 ——
    // 最后一个 `!` 之后才是模块请求。前缀必须原样拼回：整串替换会把用户点名的那份 loader 弄丢。
    // 切不开（`!` 出现在路径里）也只是「这一段不是我们的 specifier」，交回官方解析。
    const cut = request.lastIndexOf('!') + 1;
    const prefix = request.slice(0, cut);
    const moduleRequest = request.slice(cut);

    try {
      const target = this.resolver.resolveTarget({
        request: moduleRequest,
        issuer: resolveData.contextInfo?.issuer,
      });
      if (!target) return;
      // rspack 的 `beforeResolve` 只认这一种出口：就地换掉 `resolveData.request`
      // eslint-disable-next-line no-param-reassign
      resolveData.request = prefix + target.target;
    } catch (error) {
      // 与 webpack 一支同口径：改写自己抛了不能静默，交回官方解析并响
      this.resolver.warn(
        `[plugin-prev-layer-resolver] 改写 ${request} 时抛错，已交回官方解析：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
