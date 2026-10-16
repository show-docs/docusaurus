import type { Page } from '@playwright/test';

/**
收未捕获的页面异常。这一格要拦的就是「构建期一个字都不报、只有开页面才炸」的那类
—— 实测过的例子是浏览器 bundle 里没有 `process` 这个全局
（`@stoplight/json-schema-ref-parser` 裸取 `process.browser`），
`pnpm build` 全绿，页面一打开就 `ReferenceError: process is not defined`。

React 的**可恢复**错误（`onRecoverableError`）走 `console.error`，不在这里 —— 那一条对本仓是
预期行为：命中主题那几层的组件在 SSG 阶段返回 `null`，客户端再补渲染。
*/
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });
  return errors;
}
