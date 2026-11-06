import { fileURLToPath } from 'node:url';

import { toPosix } from './resolve.mts';
import type { ThemeLayer } from './types.mts';

/**
把层目录登记成「引用了 `@theme-prev/*` 的那些模块」的上下文依赖：一条 `module.rules`
加上它指向的那份 loader（`./layer-watch-loader.cts`）。

**为什么两个 bundler 都要这一条**：`@theme-prev/X` 的落点每次都由「下面那一层的目录里有没有
这个文件」现算，而 bundler 记的是上一次的解析结果。层里新增一份组件、或把它换成另一个扩展名，
都不会让任何一个模块失效 —— 引用方直接吃缓存，链就停在旧落点上。这条规则的作用就是把「这些目录
的内容清单」变成引用方的依赖，目录一变就重解析（dev 与持久缓存两个方向都实测过，
见 docs/internals.md「层目录的上下文依赖」）。

它不改源码、不改请求，所以与编译那一条规则
（`@show-docs/docusaurus-plugin-compile-source`）互不相干：两条规则各自认领自己的那一格，
先后顺序对结果没有影响。
*/

/**
随包编译出来的那份 loader 的绝对路径（`.cts` → `.cjs`）。

bundler 是按**文件路径**加载 loader 的，不是按模块标识符，所以这里只能运行期拼；
`import.meta.url` 指产物自己，`dist/` 里两者同目录，包内移动不会失联。
*/
const loaderPath = fileURLToPath(
  new URL('./layer-watch-loader.cjs', import.meta.url),
);

/** 只有 JS / TS 系源码会参与解析，其余资源类型不必过这份 loader */
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/** `module.rules` 里我们那一条的形状（官方收的是 `RuleSetRule`，这里只声明用到的几格） */
export interface LayerWatchRule {
  test: RegExp;
  include: (resource: string) => boolean;
  use: { loader: string; options: { dirs: string[] } }[];
}

/**
交出那条规则；层栈为空时返回 null（没有目录可登记，也不该凭空挂一条命中一切的规则）。

`include` 用函数而不是目录字符串数组：两边的目录比较都是 `startsWith`，但 pnpm 布局下
「同一目录」的真实路径与写法路径分隔符不一致，判「在不在层里」这件事和 `findIssuerLayerIndex`
必须同一口径（都走 {@link toPosix}），所以自己比。

一个已知边界：站点若把 `resolve.symlinks` 关掉，交回这里的资源路径是软链路径、而 `owner` 是真实
路径，这一格就判不中 —— 表现是「层里新增文件不触发重解析」（少一次失效），不是解析到错的层。
*/
export function layerWatchRule(
  layers: readonly ThemeLayer[],
): LayerWatchRule | null {
  // `exists` 是层的一部分（`layersFromPlugins` 只收存在的目录），外部构造的层栈仍可能带 false
  const dirs = layers
    .filter((layer) => layer.exists)
    .map((layer) => layer.owner);
  if (dirs.length === 0) return null;

  // 带尾分隔符的前缀：否则 `/a/theme-outer` 会命中 `/a/theme`（层目录彼此前缀是合法布局）
  const prefixes = dirs.map((dir) => `${toPosix(dir)}/`);

  return {
    include: (resource: string) => {
      const posix = toPosix(resource);
      return prefixes.some((prefix) => posix.startsWith(prefix));
    },
    test: SOURCE_FILE,
    use: [{ loader: loaderPath, options: { dirs } }],
  };
}
