/**
只登记上下文依赖、源码原样返回的那份 loader（接线见 `./layer-watch.mts`）。

为什么需要它：`@theme-prev/X` 的落点由「下面那一层的目录里**现在**有没有这个文件」决定，
而 bundler 的缓存与 watch 记的是上一次的解析结果 —— 层里新增一份组件时，没有任何一条依赖会把
引用它的那个模块判旧，于是解析那一步整段被跳过（实测：rspack dev 下改外层主题文件不触发重建、
持久缓存命中后永远拿旧落点；见 docs/internals.md「rspack 那一支」一节）。把全部层目录登记成
上下文依赖之后，「目录里多了个文件」就成了让引用方重新解析的理由。

必须是 CommonJS：两个 bundler 的 loader 运行器都收 CJS（本包其余源码是 ESM，`type: module`
下 tsc 把这份 `.cts` 单独编成 `.cjs`）。它不改内容，所以与 swc / babel 那几条规则的先后无关。
*/

/**
loader 上下文里本文件用到的那两格（不引 webpack / rspack 的类型，理由同 `./types.mts` 的 `ResolverLike`）
*/
interface LoaderContextLike {
  addContextDependency?(context: string): void;
  getOptions?(): { dirs?: unknown };
}

function layerWatchLoader(this: LoaderContextLike, source: string): string {
  // `getOptions` 缺失时按「没有目录要登记」处理：这只是一条失效保险，源码恒原样返回
  const dirs = this.getOptions ? this.getOptions().dirs : undefined;
  if (Array.isArray(dirs)) {
    for (const dir of dirs) {
      if (typeof dir === 'string') this.addContextDependency?.(dir);
    }
  }
  return source;
}

/**
交回给 bundler 的 loader 函数。

用 `module.exports` 而不是 `export =`：本包的 `erasableSyntaxOnly` 禁后一种语法，
而这份文件恒是 CommonJS（`.cts` → `.cjs`），直接赋值就是它要的形状。
*/
module.exports = layerWatchLoader;
