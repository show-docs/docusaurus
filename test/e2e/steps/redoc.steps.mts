import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

/**
Redoc 的路由走 **hash**：左栏那些链接由它自己拼成 `#/orders/…`，整页地址是
`/redoc-demo#/orders/createorder`。它把 `operationId` 小写进地址（`createOrder` →
`createorder`），下面的 href 按浏览器里真的那串写。

href 不带路径前缀，是因为组件里 `basePath` 用的是默认值 `/`：hash 段自己就是一个完整的地址，
与这一页挂在站点哪一处无关（口径记在 `theme/theme-redoc/README.md`）。

每条都限定在 `.menu-content` 里：正文面板上也有指向同一个接口的锚（标签标题旁那个
「link to orders」），不限定就会命中两处，Playwright 的严格模式直接报错。
*/
const menu = (page: Page): Locator => page.locator('.redoc-root .menu-content');

const menuHref = (name: string): string => `#/orders/${name}`;

/** Redoc 渲染的容器，也是本层挂上去的那一格。 */
const root = (page: Page): Locator => page.locator('.redoc-root');

Given('我打开 redoc 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/redoc-demo');
});

/**
整页加载一条**别人转发过来的接口地址**：`#/orders/createorder` 这段是 Redoc 点进接口之后
写进地址栏的。这一条用例钉的就是它在静态产物里也打得开，而且是 **HTTP 200** ——
页面本身是 `build/redoc-demo/index.html` 那一份，hash 段不参与取文件，托管侧不用认识它。
（换成按路径的路由就是 404，取舍与理由见包 README 的「深链」一节。）
*/
Given('我直达 redoc 那条接口的地址', async ({ page }) => {
  watchPageErrors(page);
  const response = await page.goto('/redoc-demo#/orders/createorder');
  expect(response?.status(), '这条地址没被当成真页面来回').toBe(200);
});

/**
地址里那一段指哪条接口，正文区就摆哪条接口。

这一句**不复用**上面那句「详情面板换成那条接口」：那一句是「先打开这一页再点下去」的判据，
四条标题（API 标题、分组、两条接口）都在。整页直达时 Redoc 从地址指的那一格往下铺，
实测 DOM 里只有「列出订单」「新建订单」这两个 `h2`，API 标题与分组那两条不在 ——
那是它自己的路由行为，不是本层丢了内容，所以这里按直达那一份清单钉。
*/
Then('那条接口从地址里也认得出来', async ({ page }) => {
  await expect(page).toHaveURL(/\/redoc-demo#\/orders\/createorder$/);
  await expect(
    root(page).locator('h1, h2'),
    '正文区没摆出地址里那条接口',
  ).toContainText(['列出订单', '新建订单']);
});

// 取的是 `static/openapi.yaml`（产物里的 `/openapi.yaml`）：文档标题先证明它真取到了。
Then('Redoc 接管了这一页，读的是本站那份 yaml', async ({ page }) => {
  await expect(
    root(page),
    '`.redoc-root` 没出现：`redoc:` 那一步没命中或浏览器端没渲染',
  ).toBeVisible();
  await expect(root(page), '左栏没有 API 标题：spec 没取到').toContainText(
    '主题覆盖演示 API',
  );
});

// Redoc 按地址里那一段判「当前在哪一格」，认不出时就渲染**它自己那份 404**：
// 左栏、搜索框、样式全在，页面看着完全正常，中间写着 No page at this address，
// 控制台一个字都不报（地址里那一段对不上时就是这么静默，实测过）。所以这一条单独钉。
Then('Redoc 自己的 404 没有出现', async ({ page }) => {
  await expect(
    root(page).locator('.not-found-page'),
    'Redoc 没匹配到当前地址：hash 那一段没对上',
  ).toHaveCount(0);
});

// 三个接口挂在 `orders` 分组下面，分组默认折叠（折叠时接口链接不在 DOM 里），先点开。
When('我点开 Redoc 左栏的 orders 分组', async ({ page }) => {
  await menu(page).locator('a[href="#/orders"]').click();
});

Then('三个接口都在 Redoc 的左栏里', async ({ page }) => {
  for (const name of ['listorders', 'createorder', 'getorder']) {
    await expect(
      menu(page).locator(`a[href="${menuHref(name)}"]`),
      `API 导航里少了「${name}」`,
    ).toBeVisible();
  }
});

When('我点开 Redoc 左栏里新建订单那条接口', async ({ page }) => {
  await menu(page)
    .locator(`a[href="${menuHref('createorder')}"]`)
    .click();
});

// 地址换成那条接口的 hash，详情面板的标题也跟着换 —— 到这一步才算真渲染了内容。
// 这份四条清单只适用于「先打开这一页再点下去」，整页直达那条用例另有判据（见上）。
Then('详情面板换成那条接口', async ({ page }) => {
  await expect(page).toHaveURL(/\/redoc-demo#\/orders\/createorder$/);
  await expect(
    root(page).locator('h1, h2'),
    '接口详情没渲染出来',
  ).toContainText([
    '主题覆盖演示 API (1.0.0)',
    'orders',
    '列出订单',
    '新建订单',
  ]);
});

// 整页交给 Redoc 时容器不留白：`redoc-ui.css` 那条 `.container:has(.redoc-root)`。
Then('正文容器在这一页让位', async ({ page }) => {
  const container = page.locator('.container:has(.redoc-root)');
  await expect(container, 'Redoc 没落在 `.container` 里').toHaveCount(1);
  await expect(container).toHaveCSS('padding', '0px');
});

/**
这一层的样式**不做构建期圈定**：Redoc 的样式是 styled-components 在运行时插进 `<head>`
的，PostCSS 那一遍拿不到那份文件。改在运行期圈 —— `StyleSheetManager` 的 `stylisPlugins`
（`components/redoc-style-scope.ts`），口径与理由记在 `theme/theme-redoc/README.md`。

剩下的外溢不是猜的，是量的：把那张表的每条规则真的拿去问 DOM —— 命中的元素里有 **不在
`.redoc-root` 里** 的、并且改的是**真属性**（不是 `--*` 那种自定义变量），就算漏出去了。
`redoc@3.0.1` 圈完之后在这一页只剩一条：

- `:root *` —— 全局 `box-sizing: border-box`。**故意不圈**：站点自己的 `*` 规则同值
  （实测计算样式差为 0），圈它只会让 Redoc 挂到 `body` 的浮层丢掉 border-box。

原来那两条已经收进 `.redoc-root`：裸标签 `button` 变成 `:where(.redoc-root) button`；
`:root` 里那三条真属性（背景色、文字色、字体）挪到 `.redoc-root` 上，剩下的 2882 条变量
仍留在 `:root`（浮层靠继承取值，见「圈定没有把 Redoc 自己的样式压掉」那一条）。

这里钉的是**集合等于这一条**：将来 Redoc 再往全局多写一条、或者改了写法让圈定失效，用例就红，
文档得跟着改 —— 而不是让它静悄悄生效。（离开这一页之后 styled-components 会回收这些规则，
主页上的 `<html>` 与按钮实测照旧。）

DOM 元素从外面递进来（取的是 `el.ownerDocument`，不写裸的 `document`）：`evaluate` 的回调
是在浏览器里跑的独立函数，闭不到 Node 侧的名字 —— 漏了就是一处只在浏览器里炸的引用。
*/
Then('Redoc 外溢到站点元素的只剩那一条', async ({ page }) => {
  const escaping = await page.locator('html').evaluate((el) => {
    const found: string[] = [];

    // `ownerNode` 的类型上还有 `ProcessingInstruction` 那一格（XML 样式处理指令），
    // 本仓的表都是 `<style>`，按元素取属性前先收窄。
    const sheet = [...el.ownerDocument.styleSheets].find(
      (s) =>
        (s.ownerNode as Element | null)?.hasAttribute('data-styled-version') ??
        false,
    );
    if (!sheet?.cssRules) {
      return ['浏览器里没找到 styled-components 注入的那张样式表'];
    }

    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        const grouped = rule as CSSGroupingRule;
        if (grouped.cssRules && !(rule as CSSStyleRule).selectorText) {
          // `@media` 这类容器：往里走。`@keyframes` 里的 from/to 没有选择器，不参与判型。
          if ((rule as unknown as { type?: number }).type !== 7) {
            walk(grouped.cssRules);
          }
          continue;
        }

        const styleRule = rule as CSSStyleRule;
        const selector = styleRule.selectorText;
        if (!selector || !styleRule.style) {
          continue;
        }

        let matched: Element[];
        try {
          matched = [...el.ownerDocument.querySelectorAll(selector)];
        } catch {
          found.push(`读不了的 selector：${selector}`);
          continue;
        }
        if (matched.every((node) => node.closest('.redoc-root'))) {
          continue;
        }

        const written: string[] = [];
        for (let i = 0; i < styleRule.style.length; i += 1) {
          const name = styleRule.style.item(i);
          if (name && !name.startsWith('--')) {
            written.push(name);
          }
        }
        if (written.length > 0) {
          found.push(selector);
        }
      }
    };

    try {
      walk(sheet.cssRules);
    } catch {
      // 跨源样式表读不到规则（本仓没有这种表）。
      return ['读不到 styled-components 那张表的规则'];
    }

    return [...new Set(found)];
  });

  // 按**集合**比，不按顺序：这一步要钉的是「圈完之后只剩这一条」，多一条少一条都算红。
  expect(
    new Set(escaping),
    `圈定之后仍然外溢的选择器不等于记下的那一条，实际是：${escaping.join('、')}`,
  ).toEqual(new Set([':root *']));
});

/**
圈定是**双向**的判据：上一条说「打到站点上的只剩一条」，这一条说「圈定没把 Redoc 自己改坏」。
后者不是显然的 —— 给裸标签加前缀会把这条规则的优先级从 (0,0,1) 抬到 (0,1,1)，抬过去它就压过
Redoc 自己那些 (0,1,0) 的类名规则了。实测过这个错法：右栏那颗 Copy 按钮的边框从 `solid 1px`
变成 `none`。所以前缀写成 `:where(.redoc-root)`（自身优先级 0，只收范围不动层叠）。

钉三样，都是量出来的：

1. 那条裸 `button` 确实变成了带范围的写法，裸的那条不在表里了 —— 证明圈定真的跑过，
   而不是靠别的东西把效果遮掉；
2. Redoc 自己的按钮仍然带着它类名规则给的那圈实线边框；
3. `--bg-color` 仍然能在 `<html>` 上取到值 —— Redoc 的下拉、提示、弹窗是
   `createPortal(…, document.body)` 挂到 body 的，变量必须留在 `:root` 它们才继承得到。
*/
Then('圈定没有把 Redoc 自己的样式压掉', async ({ page }) => {
  const state = await page.locator('html').evaluate((el) => {
    let scopedButton = 0;
    let bareButton = 0;
    for (const sheet of el.ownerDocument.styleSheets) {
      const node = sheet.ownerNode;
      if (
        !(node instanceof HTMLElement) ||
        !Object.hasOwn(node.dataset, 'styled')
      )
        continue;
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        const selector = (rule as CSSStyleRule).selectorText;
        if (selector === ':where(.redoc-root) button') scopedButton += 1;
        else if (selector === 'button') bareButton += 1;
      }
    }

    const copy = [...document.querySelectorAll('.redoc-root button')].find(
      (b) => b.textContent?.trim() === 'Copy',
    );
    const computed = copy ? getComputedStyle(copy) : null;
    return {
      scopedButton,
      bareButton,
      copyBorderStyle: computed?.borderTopStyle ?? '页面上没有 Copy 那颗按钮',
      copyBorderWidth: computed?.borderTopWidth ?? '',
      bgColorOnHtml: getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-color')
        .trim(),
    };
  });

  expect(state.scopedButton, '裸标签那条没被改成带范围的写法').toBeGreaterThan(
    0,
  );
  expect(state.bareButton, '表里仍然留着裸的 `button` 那条').toBe(0);
  expect(
    state.copyBorderStyle,
    'Redoc 自己的按钮边框被圈定的规则压掉了（前缀要用 :where() 才不改优先级）',
  ).not.toBe('none');
  expect(state.copyBorderWidth, '同上：边框宽度归零').not.toBe('0px');
  expect(
    state.bgColorOnHtml,
    'Redoc 的 CSS 变量没留在 <html> 上，挂到 body 的浮层会取不到值',
  ).not.toBe('');
});

/**
上一条钉的是「圈定没把 Redoc 改坏」，这一条钉「站点这一侧确实不受影响」。
判据不把站点该有的值一个个抄成数字（那样换个主题就得改），而是拿同一批元素在两个页面上各算
一遍 computed style：这一页（挂着 `.redoc-root`，Redoc 的表在）与主页（没挂），必须一模一样。
量两处：navbar 上那颗 `<button class="clean-btn">`（裸标签那条打的就是它）与 `<html>` 本身
（`:root` 那三条真属性打的就是它）。

主页是**整页重新加载**去的：客户端跳过去时 styled-components 那张表还在，量到的仍是污染后的值。
*/
const toggleProps = [
  'background-color',
  'border',
  'color',
  'cursor',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'box-shadow',
] as const;

const htmlProps = ['background-color', 'color', 'font-family'] as const;

interface SiteStyles {
  toggle: Record<string, string>;
  html: Record<string, string>;
}

const siteStyles = (page: Page): Promise<SiteStyles> =>
  page.locator('html').evaluate(
    (el, props) => {
      const pick = (target: Element | null, names: readonly string[]) => {
        const out: Record<string, string> = {};
        if (!target) return out;
        const computed = getComputedStyle(target);
        for (const name of names) out[name] = computed.getPropertyValue(name);
        return out;
      };

      return {
        toggle: pick(
          el.querySelector(':scope .navbar button.clean-btn'),
          props.toggle,
        ),
        html: pick(el, props.html),
      };
    },
    { toggle: [...toggleProps], html: [...htmlProps] },
  );

Then('站点自己的那几处样式不被 Redoc 改写', async ({ page }) => {
  const onRedocPage = await siteStyles(page);

  await page.goto('/');
  const onHome = await siteStyles(page);

  expect(
    onRedocPage,
    `redoc 页上的站点样式与主页不一样：${JSON.stringify(onRedocPage)}`,
  ).toEqual(onHome);
});
