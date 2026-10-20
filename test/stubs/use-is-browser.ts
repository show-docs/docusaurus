/**
`@docusaurus/useIsBrowser` 的单测替身 —— 由 `vitest.config.mts` 的 `resolve.alias` 换上。

为什么非要一份替身：那条 import 只在 webpack 构建期存在，磁盘上没有叫
`@docusaurus/useIsBrowser` 的包（Docusaurus 把它 alias 到 `@docusaurus/core/lib/client/exports/`
里那份，而 `@docusaurus/core` 的 `lib/` 是 CommonJS 口径，vitest 直着引会先挂在解析上）。
类型那侧由官方的 `@docusaurus/module-type-aliases` 说明，不需要这份文件。

被测的那一条分支是「在浏览器之外什么都不渲染」，所以要能两边都拨得动 —— 真那份读的是
Docusaurus 的 `BrowserContext`，把它连 provider 一起搬进单测，量的就不再是这一格了。
*/

/** 测试拨动这一格的把手（改的是对象里那一格，不是模块级变量）。 */
export const stubIsBrowser = { value: true };

// eslint-disable-next-line import-x/no-default-export -- 被这一格换掉的 `@docusaurus/useIsBrowser` 就是默认导出
export default function useIsBrowser(): boolean {
  return stubIsBrowser.value;
}
