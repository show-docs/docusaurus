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
Redoc 的左栏是一条 `height: calc(100dvh - var(--navbar-stack-height))` 的 sticky，而
`--navbar-stack-height` 由它自己在渲染时按 `scrollYOffset` 那个函数算出来、写进容器
（口径记在包 README 的「高度」一节）。这一条钉算出来的那一格正好是 navbar 以下的一屏：
上沿贴着 navbar 的下沿、下沿贴着视口的下沿，两边各留 1px 的容差。

`scrollTop` 那一句钉的是另一半：这一层不给容器定高，容器就不该变成滚动容器。曾经
「定高 + `overflow: hidden`」的那一版里，点接口（以及整页直达那条深链）滚走的是这一格而不是
文档 —— 实测 `scrollTop` 停在 502，左栏整条往上跑出可视区，navbar 以下只剩一片底色。
*/
Then('左栏占满 navbar 以下那一屏', async ({ page }) => {
  const box = await menu(page).evaluate((el) => {
    const { innerHeight } = el.ownerDocument.defaultView ?? { innerHeight: 0 };
    const rect = el.getBoundingClientRect();
    return {
      gapToNavbar: Math.round(
        rect.top -
          (el.ownerDocument.querySelector('.navbar')?.getBoundingClientRect()
            .bottom ?? 0),
      ),
      gapToViewport: Math.round(innerHeight - rect.bottom),
      rootScrollTop: el.closest('.redoc-root')?.scrollTop ?? -1,
    };
  });

  expect(
    Math.abs(box.gapToNavbar),
    `左栏的上沿没贴住 navbar：差 ${box.gapToNavbar}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(box.gapToViewport),
    `左栏的下沿没贴住视口：差 ${box.gapToViewport}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    box.rootScrollTop,
    'Redoc 那一格自己成了滚动容器（它不该有固定高度）',
  ).toBe(0);
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

这一句是在**站点亮色**下量的：判据问的是「这条规则现在打到哪些元素」，而改挂到
`:root[data-theme="dark"]` 的那套暗色表在亮色下匹配不到任何东西，所以不进这个集合。
站点一进暗色，它命中的就是 `<html>` 本身，里面除变量外还有一条真属性 `color-scheme`；
这一格的后果另有判据 ——「站点自己的那几处样式在暗色下也不被 Redoc 改写」那条量的是值，
站点自己写的也是 `dark`，同值。

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
（`:root` 那三条真属性打的就是它，另有暗色表往 `<html>` 上写的那条 `color-scheme`）。

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

const htmlProps = [
  'background-color',
  'color',
  'font-family',
  'color-scheme',
] as const;

interface SiteStyles {
  toggle: Record<string, string>;
  html: Record<string, string>;
}

/**
这颗按钮的悬停底色是带过渡的（站点自己的 `.toggleButton:hover { background: var(--ifm-color-emphasis-200) }`，
时长走 `--ifm-transition-fast`），所以指针刚从它上面挪开的那一刻量到的是**半路中的值**
（实测读到过 `rgba(130, 134, 140, 0.004)`，而落点是 `rgba(0, 0, 0, 0)`）。
这里不写死等待时长，而是逐帧问一次：值连着两帧不变就算落定了。
*/
const settleHover = (page: Page): Promise<void> =>
  page
    .locator('.navbar button.clean-btn')
    .first()
    .evaluate(async (el) => {
      const frame = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      let last = getComputedStyle(el).backgroundColor;
      for (let i = 0; i < 20; i += 1) {
        await frame();
        const now = getComputedStyle(el).backgroundColor;
        if (now === last) return;
        last = now;
      }
    });

/**
同一批属性在**当前这一页**上算一遍。先把鼠标挪开再量：点完 navbar 那颗按钮之后指针正好停在
它上面，不挪开就量到「悬停的那一颗」，跟另一个页面上没悬停的那一颗比，差的是指针位置而不是样式外溢。
*/
const siteStyles = async (page: Page): Promise<SiteStyles> => {
  await page.mouse.move(0, 0);
  await settleHover(page);
  return page.locator('html').evaluate(
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
};

Then('站点自己的那几处样式不被 Redoc 改写', async ({ page }) => {
  const onRedocPage = await siteStyles(page);

  await page.goto('/');
  const onHome = await siteStyles(page);

  expect(
    onRedocPage,
    `redoc 页上的站点样式与主页不一样：${JSON.stringify(onRedocPage)}`,
  ).toEqual(onHome);
});

/**
Redoc 左栏底部那一排图标里有一颗它自己的亮暗切换按钮。本层把暗色表改挂在站点的
`data-theme` 上之后，点它只会改 `<html>` 的类名、页面上没有任何反应 —— 一颗按了没反应的按钮，
还跟 navbar 上那颗重复，所以 `redoc-ui.css` 把它收掉了。这一条钉它确实看不见
（元素还在 DOM 里，是 `display: none`，所以判据用可见性而不是数量）。
*/
Then('Redoc 自己那颗亮暗切换按钮不出现', async ({ page }) => {
  await expect(
    root(page).locator('[data-testid="color-mode-switcher"]'),
    'Redoc 自己那颗亮暗切换按钮还看得见',
  ).toBeHidden();
});

/**
左栏底部那一格（`.menu-content` 最后那个 `div`）里并排两样东西：指向 redocly.com 的那条署名，
和「收起侧栏」那颗按钮（`[data-component-name="Sidebar/SidebarActions"]` 那一格）。
`redoc-ui.css` 收的是署名的那个 `span`，不是整格 —— 整格一起收会把收起侧栏那颗带走。
两句钉的是这一刀切得准不准：署名看不见，同一格里那颗按钮还在。
*/
Then('Redocly 的署名不出现，同一格里的收起侧栏还在', async ({ page }) => {
  await expect(
    menu(page).locator('span:has(a[href^="https://redocly.com/"])'),
    '「API docs by Redocly」那条署名还看得见',
  ).toBeHidden();

  await expect(
    menu(page).locator('[data-component-name="Sidebar/SidebarActions"]'),
    '收署名时把同一格里的「收起侧栏」一起收掉了',
  ).toBeVisible();
});

/**
Redoc 在每个章节标题右边摆一整格操作按钮：「Copy」（把这一节的文档复制成 YAML 给大模型的那一颗）
加一个「More actions」下拉（Open in Claude / ChatGPT 两项在里面）。本层整格收掉 ——
代码块里那几颗「复制到剪贴板」不在这格里面，碰不到（口径与理由见包 README
的「收掉的三处 Redoc 自己的东西」一节）。
这一格是 `display: none` 收的，元素仍在 DOM 里，所以判据走可见性；先钉「DOM 里认得出这一格」
再钉「一格都不显眼」，免得选择器哪天匹配不上就静默通过。
*/
Then('章节标题旁那一整格操作按钮不出现', async ({ page }) => {
  const pageActions = root(page).locator('[data-testid="page-actions"]');

  expect(
    await pageActions.count(),
    '这一页上没有章节标题那一格操作按钮，选择器先失效了',
  ).toBeGreaterThan(0);
  await expect(
    root(page).locator('[data-testid="page-actions"]:visible'),
    '章节标题旁那一整格操作按钮还看得见',
  ).toHaveCount(0);
});

/**
与上一条配对的一句：代码块里那些复制按钮**不该**被一起收掉，所以这里钉它们还在。
认的是 Redoc 给那几颗自己的 `data-testid="copy-button"`（标题那颗没有这个标识）。
*/
Then('代码块里的复制按钮还在', async ({ page }) => {
  const visibleCopies = root(page).locator(
    'button[data-testid="copy-button"]:visible',
  );

  expect(
    await visibleCopies.count(),
    '代码块里那几颗复制按钮不见了',
  ).toBeGreaterThan(0);
  await expect(visibleCopies.first()).toBeVisible();
});

/**
## 亮暗模式跟站点走，不跟操作系统走

Redoc 自带一套亮暗模式，判据是**操作系统**的偏好（`matchMedia('(prefers-color-scheme: dark)')`
加它自己那份 localStorage），然后把 `light` / `dark` 写进 `<html>` 的类名 —— 它那 60 来条暗色
规则全挂在 `:root.dark` 开头。站点自己另有一个开关（`<html data-theme>`），两处各切各的就会
打架：实测「站点亮色 + 操作系统深色」时这一页自己变暗，跟站点的开关无关。

本层在运行期把 `:root.dark` 改挂到 `:root[data-theme="dark"]`（`redoc-style-scope.ts`），
于是站点那个开关成为唯一的驱动。下面这几步钉的是这个关系的两头，都不抄具体色值：

- 操作系统换偏好，这一页的底色**不变**；
- 站点换模式，这一页的底色**跟着变**；
- 第二头是在「`<html>` 的类名没跟着变」的状态下量的（切站点模式不会动 Redoc 写的那个类名），
  所以它同时也证明驱动配色的不是类名；
- 改挂之后站点一进暗色就会激活 Redoc 那套暗色表，所以站点自己的那几处样式在**暗色下**也要
  再量一遍（见最后那一步）。
*/
const redocBackground = (page: Page): Promise<string> =>
  root(page).evaluate((el) => getComputedStyle(el).backgroundColor);

Given('我按操作系统的深色偏好打开 redoc 示例页', async ({ page }) => {
  watchPageErrors(page);
  // 要在加载前定下来：Redoc 是在渲染时读 `matchMedia` 的，加载完再改就只是改个媒体查询。
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/redoc-demo');
});

Then('站点的亮暗模式不受操作系统影响', async ({ page }) => {
  // 本站 `themeConfig.colorMode` 没开 `respectPrefersColorScheme`，所以系统深色时站点仍是亮色。
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Redoc 自己那份按操作系统的判定确实跑过了：`<html>` 上带着它写的 `dark` 类。
  // 这一句是给下一条当前提 —— 类名在、配色却是亮的，才说明驱动配色的不是这个类名。
  // （哪天 Redoc 不再往 `<html>` 上写类名了，这一句会红，删掉即可。）
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

Then('Redoc 的配色不跟操作系统走', async ({ page }) => {
  const onDarkSystem = await redocBackground(page);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  const onLightSystem = await redocBackground(page);

  expect(
    onLightSystem,
    `操作系统的偏好换了，这一页的底色跟着换了（${onDarkSystem} → ${onLightSystem}）：` +
      '暗色表还挂在 Redoc 自己那个类名上',
  ).toBe(onDarkSystem);
});

When('我把站点切成暗色', async ({ page }) => {
  // navbar 上只有这一颗 `.clean-btn`（移动端那颗在这个视口宽度下不渲染）。
  await page.locator('.navbar button.clean-btn').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

Then('Redoc 的配色跟着站点翻过去', async ({ page }) => {
  const onDarkSite = await redocBackground(page);

  await page.locator('.navbar button.clean-btn').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const onLightSite = await redocBackground(page);

  expect(
    onDarkSite,
    `站点换了模式，这一页的底色没跟着换（两边都是 ${onLightSite}）`,
  ).not.toBe(onLightSite);
});

/**
「站点这一侧不受影响」那一条是在亮色下量的，而改挂之后多出一格亮色碰不到的：站点一进暗色，
Redoc 那 330 条暗色变量连同一条 `color-scheme` 就一起落在 `<html>` 上。同一批属性（含
`color-scheme`）在两个页面上各算一遍比相等 —— 实测这一页暗色的 `<html>` 是
`background-color: rgb(27, 27, 29)`、`color: rgb(227, 227, 227)`、`color-scheme: dark`，
主页暗色一字不差。
*/
Then('站点自己的那几处样式在暗色下也不被 Redoc 改写', async ({ page }) => {
  const onRedocPage = await siteStyles(page);

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(
    await siteStyles(page),
    `暗色下这一页的站点壳与主页不一样：${JSON.stringify(onRedocPage)}`,
  ).toEqual(onRedocPage);
});
