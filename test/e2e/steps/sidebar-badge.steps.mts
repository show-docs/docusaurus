import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Then } = createBdd();

/**
## 侧边栏徽标

「新建 / 更新」那两枚徽标画在侧边栏上：载体是官方那条 `sidebar_custom_props` 通道
（`packages/theme-git-badge` 算出种类 → 官方把它抄到侧边栏项的 `customProps` 上 →
那一层把种类写成 `data-git-badge` 属性）。画法有两种：叶子行是一个纯色点，
分类行不画点 —— 颜色染在那一行本来就有的折叠箭头上（`styles/git-badge.css`）。

叶子那一句钉的是四件事：徽标在**这一页那一格**上（不是别的格子上）、真的画出来且有面积、
底色是站点那份语义色、以及它**不带文字也不带链接** —— 那一行只多一个属性，不引入第二处
可点的东西。

分类那一句钉的是「没有点」「箭头真画出来」「箭头是站点那份语义色」与「箭头还是箭头」
（染色走遮罩，不是把整格填成实心方块）。

句子按徽标种类捕获：种类、属性上的值、底色各跟哪一个变量，三者是一件事的三个写法，
摊在一张表里，改一处就都改到。
*/

/** 桌面那份侧边栏（移动端那份在抽屉里，这个视口宽度下压根不渲染）。 */
const SIDEBAR = '.theme-doc-sidebar-container';

/**
先等水合落下来。

静态产物里的侧边栏是 SSR 的，水合会把那棵树换掉一次；换之前找到的元素随后被摘掉，
在它上面读计算样式只会得到一串空串（`content` 是 `''`、`isConnected` 是 `false`）。
`data-has-hydrated` 是 Docusaurus 在水合后写到 `<html>` 上的，等它到位再找元素就不会踩到
「拿到旧节点」这一格 —— 实测不等时四条里有一条读空。
*/
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.documentElement.dataset.hasHydrated === 'true',
  );
}

const badgeKinds = {
  新建: { kind: 'new', color: '--ifm-color-success' },
  更新: { kind: 'update', color: '--ifm-color-warning' },
} as const;

type BadgeWord = keyof typeof badgeKinds;

/** 站点那份语义色（绿=新建、橙=更新）算出来的值：探针上写 `var(--ifm-color-…)` 再读。 */
async function siteColor(entry: Locator, name: string): Promise<string> {
  return entry.evaluate((el, variable) => {
    const doc = el.ownerDocument;
    const probe = doc.createElement('div');
    probe.style.backgroundColor = `var(${variable})`;
    doc.body.append(probe);
    const value =
      doc.defaultView?.getComputedStyle(probe).backgroundColor ?? '';
    probe.remove();
    return value;
  }, name);
}

/** 叶子行那一格：`data-git-badge` 属性加 `::before` 画出来的纯色点。 */
async function expectBadge(
  entry: Locator,
  word: string,
  kind: { readonly kind: string; readonly color: string },
): Promise<void> {
  await expect(entry, `那一格没有「${word}」徽标`).toHaveAttribute(
    'data-git-badge',
    kind.kind,
  );

  // 点子是那一格 `<a>` 的 `::before`：读它的计算样式。
  const dot = await entry.evaluate((el) => {
    const style = el.ownerDocument.defaultView?.getComputedStyle(
      el,
      '::before',
    );

    return {
      content: style?.content ?? '',
      width: style?.width ?? '',
      height: style?.height ?? '',
      backgroundColor: style?.backgroundColor ?? '',
    };
  });

  // 不带文字：颜色即语义，伪元素的 content 是空串
  expect(dot.content, '徽标不是纯色点（伪元素里有文字）').toBe('""');
  // 有面积：一个 0×0 的点子等于没画
  expect(Number.parseFloat(dot.width), '徽标没有宽度').toBeGreaterThan(0);
  expect(Number.parseFloat(dot.height), '徽标没有高度').toBeGreaterThan(0);

  const expected = await siteColor(entry, kind.color);
  expect(dot.backgroundColor, '徽标没有底色').not.toBe('rgba(0, 0, 0, 0)');
  expect(dot.backgroundColor, `徽标底色不是站点那个 ${kind.color}`).toBe(
    expected,
  );

  // 徽标不是标签链接：那一行里没有多出一个 `<a>`
  expect(await entry.locator('a').count(), '徽标给那一格塞进了链接').toBe(0);
}

/**
分类那一格：不画点，颜色落在折叠箭头上。

箭头有两种画法 —— 带链接的分类行（本站 `theme-erd` 这一种）是同级那颗
`<button class="menu__caret">` 的 `::before`，不带链接的是 `<a>` 自己的 `::after`
（Infima 的 `menu__link--sublist-caret`）。两种都收。
*/
async function expectCaretBadge(
  entry: Locator,
  word: string,
  kind: { readonly kind: string; readonly color: string },
): Promise<void> {
  await expect(entry, `那一类没有「${word}」徽标`).toHaveAttribute(
    'data-git-badge',
    kind.kind,
  );

  // 分类行不该再画点：伪元素压根没有生成，计算出来的 content 是 `none`
  const dot = await entry.evaluate(
    (el) =>
      el.ownerDocument.defaultView?.getComputedStyle(el, '::before').content ??
      '',
  );
  expect(dot, '分类行不该画点').toBe('none');

  const arrow = await entry.evaluate((el) => {
    const view = el.ownerDocument.defaultView;
    const sibling = el.nextElementSibling;
    const caret = sibling?.matches('.menu__caret') ? sibling : null;
    const style = view?.getComputedStyle(
      caret ?? el,
      caret ? '::before' : '::after',
    );

    return {
      content: style?.content ?? '',
      width: style?.width ?? '',
      height: style?.height ?? '',
      backgroundColor: style?.backgroundColor ?? '',
      maskImage:
        style?.maskImage ||
        style?.getPropertyValue('-webkit-mask-image') ||
        'none',
    };
  });

  // 箭头真画出来了
  expect(arrow.content, '折叠箭头没画出来').toBe('""');
  expect(Number.parseFloat(arrow.width), '箭头没有宽度').toBeGreaterThan(0);
  expect(Number.parseFloat(arrow.height), '箭头没有高度').toBeGreaterThan(0);

  const expected = await siteColor(entry, kind.color);
  expect(arrow.backgroundColor, '箭头没有染色').not.toBe('rgba(0, 0, 0, 0)');
  expect(arrow.backgroundColor, `箭头颜色不是站点那个 ${kind.color}`).toBe(
    expected,
  );

  // 还是箭头：染色走遮罩，不是把整格填成实心方块
  expect(arrow.maskImage, '箭头被填成了实心方块').not.toBe('none');
}

Then(
  new RegExp(
    `^这一页在侧边栏里那一格有一个 "(${Object.keys(badgeKinds).join('|')})" 徽标$`,
  ),
  async ({ page }, word) => {
    const kind = badgeKinds[word as BadgeWord];

    await waitForHydration(page);

    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar, '侧边栏没渲染出来').toHaveCount(1);

    // 这一格 = 侧边栏里指向当前地址的那一条
    const { pathname } = new URL(page.url());
    const entry = sidebar.locator(`a[href="${pathname}"]`);
    await expect(entry, `侧边栏里没有指向 ${pathname} 的那一格`).toHaveCount(1);

    await expectBadge(entry, word, kind);
  },
);

/**
分类行跟着整棵子树：子页新建或更新过、分类链的那一页本身没表态时，父分类也带一枚。
`theme-erd` 那一类里有一页钉了 `git_badge: new`、它自己那一页是 update —— 这一句同时钉住
递归、`new` 压过 `update`、以及「分类行不画点，颜色落在折叠箭头上」。
*/
Then(
  new RegExp(
    `^侧边栏里「(.+)」那一类带一枚 "(${Object.keys(badgeKinds).join('|')})" 徽标$`,
  ),
  async ({ page }, name, word) => {
    const kind = badgeKinds[word as BadgeWord];

    await waitForHydration(page);

    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar, '侧边栏没渲染出来').toHaveCount(1);

    const entry = sidebar.locator(`a.menu__link--sublist[href="/${name}/"]`);
    await expect(entry, `侧边栏里没有「${name}」那一类`).toHaveCount(1);

    await expectCaretBadge(entry, word, kind);
  },
);
