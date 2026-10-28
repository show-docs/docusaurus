import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Then } = createBdd();

/**
## 侧边栏徽标

「新建 / 更新」那两枚徽标画在侧边栏的文档条目末尾：载体是官方那条 `sidebar_custom_props`
通道（站点配置算出种类 → 官方把它抄到侧边栏项的 `customProps` 上 → 站点层把标签文字换成
「带徽标的样子」），形状在 `src/components/sidebar-badge.tsx`。

这一句钉的是四件事：徽标在**这一页那一格**上（不是别的格子上）、看得见且有面积、
底色是站点那份语义色、以及它**不是标签链接** —— 徽标是纯 `<span>`，不带文字也不带链接，
所以「页面上每一处 `/tags/` 链接都在文章末尾那一格」那条断言不受影响。

句子按徽标种类捕获：种类、属性上的值、底色各跟哪一个变量，三者是一件事的三个写法，
摊在一张表里，改一处就都改到。
*/

/** 桌面那份侧边栏（移动端那份在抽屉里，这个视口宽度下压根不渲染）。 */
const SIDEBAR = '.theme-doc-sidebar-container';

const badgeKinds = {
  新建: { attr: 'new', color: '--ifm-color-success' },
  更新: { attr: 'update', color: '--ifm-color-warning' },
} as const;

Then(
  new RegExp(
    `^这一页在侧边栏里那一格有一个 "(${Object.keys(badgeKinds).join('|')})" 徽标$`,
  ),
  async ({ page }, word) => {
    const kind = badgeKinds[word as keyof typeof badgeKinds];

    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar, '侧边栏没渲染出来').toHaveCount(1);

    // 这一格 = 侧边栏里指向当前地址的那一条
    const { pathname } = new URL(page.url());
    const entry = sidebar.locator(`a[href="${pathname}"]`);
    await expect(entry, `侧边栏里没有指向 ${pathname} 的那一格`).toHaveCount(1);

    const badge = entry.locator(`[data-git-badge="${kind.attr}"]`);
    await expect(badge, `那一格里没有「${word}」徽标`).toHaveCount(1);
    await expect(badge, '徽标看不见').toBeVisible();

    // 有面积：一个 0×0 的点子等于没画
    const box = await badge.boundingBox();
    expect(box, '徽标没有落位').not.toBeNull();
    expect(box!.width, '徽标没有宽度').toBeGreaterThan(0);
    expect(box!.height, '徽标没有高度').toBeGreaterThan(0);

    // 底色 = 站点那份语义色（绿=新建、橙=更新）。比的是同一个变量算出来的值：
    // 探针元素上写 `var(--ifm-color-…)`，读它的计算值 —— 与徽标读的是同一条路。
    //
    // 两次读法都从徽标那颗元素出发（`el.ownerDocument`），不碰页面全局。
    const [background, expected] = await Promise.all([
      badge.evaluate((el) => {
        const view = el.ownerDocument.defaultView;
        return view?.getComputedStyle(el).backgroundColor ?? '';
      }),
      badge.evaluate((el, name) => {
        const doc = el.ownerDocument;
        const probe = doc.createElement('div');
        probe.style.backgroundColor = `var(${name})`;
        doc.body.append(probe);
        const value =
          doc.defaultView?.getComputedStyle(probe).backgroundColor ?? '';
        probe.remove();
        return value;
      }, kind.color),
    ]);

    expect(background, '徽标没有底色').not.toBe('rgba(0, 0, 0, 0)');
    expect(background, `徽标底色不是站点那个 ${kind.color}`).toBe(expected);

    // 徽标不是标签链接：它是一个纯 `<span>`
    const insideTagLink = await badge.evaluate(
      (el) => el.closest('a[href^="/tags/"]') !== null,
    );
    expect(insideTagLink, '徽标被塞进了一个标签链接里').toBe(false);
  },
);
