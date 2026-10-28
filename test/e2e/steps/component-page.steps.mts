import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/**
## 这一层换掉的是整个 `DocItem`，不是正文那一格

清单里那一条指向站点自己的 `@theme/ComponentPageDemo`（`src/theme/` 那一份），
它把配置里的 `props`、命中的那把键写下的值、这一页的 `frontMatter` 三样都摆回页面上 ——
所以这里量的不是「页面上多了什么块」，而是**组件收到的入参对不对**：
`props` 少传、`value` 取错键、`frontMatter` 没交进去，症状都在这三句里红。

`component` 写成 `@theme/X` 而不是包里的某个组件，为的就是这一格归站点：
换掉 `src/theme/ComponentPageDemo` 不必动配置。
*/
Given('我打开组件接管示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/theme-component-page/docs/component-page-demo');
});

/** `h1` 只有组件那一句：本页 markdown 的标题随 `DocItem` 一起没了。 */
Then('这一页摆出组件从配置里拿到的标题', async ({ page }) => {
  await expect(
    page.locator('h1'),
    '配置里 `props.label` 那个标题没出现：清单里那条的 `props` 没送进组件',
  ).toHaveText('组件接管了这一页');
});

/**
组件把收到的 `value`（命中的那把键写下的值）与 `frontMatter.title` 列在一条提示里。
`frontMatter` 交没交进去、`value` 是不是命中那条的 `true`，都在这一段文本上。
*/
Then('它把命中的键值与这一页的标题都送进组件', async ({ page }) => {
  // 官方 `Admonition` 那一格的稳定类名是 `theme-admonition`（`admonition_*` 那一份是 CSS module
  // 的散列名，会随产物改名）。
  const received = page.locator('.theme-admonition');
  await expect(received, '组件没摆出它收到的入参').toHaveCount(1);
  await expect(received).toContainText('true');
  await expect(received).toContainText('组件整页示例');
});

/**
正文那一格整个没了：`DocItem` 被换成组件之后，本页 markdown 不再渲染。
这里不写「`h1` 一个都不剩」（`iframe` 那族那句就是这么判的）—— 这一层的组件自己就摆了一颗 `h1`。
*/
Then('这一页没有本页 markdown 的正文', async ({ page }) => {
  await expect(
    page.locator('.markdown'),
    '本页 markdown 的正文还在页面上',
  ).toHaveCount(0);
});

/** 另一头：没写那把键的页照常是文档页，这一层等于透明。 */
Then('这一页的文档正文外壳还在', async ({ page }) => {
  await expect(
    page.locator('article'),
    '普通文档页的正文外壳没了：这一层落空时不该动任何东西',
  ).toHaveCount(1);
});
