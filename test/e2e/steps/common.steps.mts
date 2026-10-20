import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import {
  frameMarks,
  frameModeSignal,
  frameTimeOrigin,
  themeFrame,
  watchPageErrors,
} from '../helpers.mts';

const { Then, When } = createBdd();

/**
每条用例的最后一句：这一路点下来，浏览器一个字都不该报。

监听器在「打开页面」那一步就装上了（见 ../helpers.mts），这里只是回收那份记录 ——
同一个 page 拿到的是同一只数组。
*/
Then('浏览器里没有运行期错误', async ({ page }) => {
  const errors = watchPageErrors(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

/**
整页替换那一族（`theme-iframe` 的 `DocItem` 按 `lib/api-frame-registry.ts` 的顺序判四把键：
`scalar:`、`redoc:`、`oas3:`、`iframe:`）命中时**不包**下层 `DocItem`，
所以那一页连文档正文外壳都没有。四把键判的是同一件事，句子就一份。
*/
Then('这一页没有文档正文外壳', async ({ page }) => {
  await expect(page.locator('article'), '整页没交给外部渲染器').toHaveCount(0);
});

/**
「框的无障碍标题用的是页面自己的标题」：整页交给框以后，`<iframe>` 的 `title` 是这一页在
辅助技术里唯一的名字 —— 页面写了 `frontMatter.title` 时用它，注册表那条兜底值（`API 文档`）
只在缺它时出现。三层形状一样，句子写一份，标题当参数传（各页不同）。

正则步骤：playwright-bdd 的 Cucumber 表达式里中文引号串不好当参数解析，捕获组最稳。
*/
Then(
  /^框的无障碍标题用的是页面自己的标题 "([^"]+)"$/,
  async ({ page }, title) => {
    await expect(
      themeFrame(page).first(),
      `title 应取页面自己的「${title}」，而不是注册表兜底`,
    ).toHaveAttribute('title', title);
  },
);

/**
## 「亮暗跟站点走」那三步，三层共用

`theme-redoc`、`theme-stoplight` 与 `theme-scalar` 各钉一条同形状的场景：站点自己的开关是
唯一的驱动，操作系统的偏好不算数，而且换配色不该把框内那份文档重新加载。这三步量的都是
**跨 iframe 边界**那一条消息通道（实现见 `theme/theme-iframe/lib/`），两边读同一处信号 —— 它在框内
那份文档的 `<html>`（redoc、stoplight）或 `<body>`（scalar）上，三处读数各自的含义见
`../helpers.mts` 里 `frameModeSignal` 那一段。

各层**自己**怎么落这个值（redoc 换挂 `data-redoc-mode`、stoplight 用 Elements 自己的
`data-theme`、scalar 换 `<body>` 上那两个类名）另有各层自己的句子，这里不掺和。
*/
When('我把站点切成暗色', async ({ page }) => {
  // navbar 上只有这一颗 `.clean-btn`（移动端那颗在这个视口宽度下不渲染）。
  await page.locator('.navbar button.clean-btn').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

// 「做个记号」= 把切暗色**之前**的两样先存下来。判「有没有重新加载」用的是那份文档自己的
// 起始时刻（`performance.timeOrigin`）：每加载一份新文档就是另一个数，而换配色只是往 `<html>`
// 上改一个属性，那个数不动。
//
// 另外三个写法各避开一格：往 DOM 上写 `data-*` 就是往 `evaluate` 传进来的那个元素写属性，
// `no-param-reassign` 拦它，而 `eslint --fix` 又把 `setAttribute('data-…')` 自动改回
// `el.dataset.…`，两头来回改个没完；往 `window` 上挂一个全局，被
// `unicorn/no-global-object-property-assignment` 拦；`window.name` 更是**跨重新加载保留**，
// 用它等于什么都没钉。
When('我在框里那份文档上做个记号', async ({ page }) => {
  frameMarks.set(page, {
    signal: await frameModeSignal(page),
    timeOrigin: await frameTimeOrigin(page),
  });
});

Then('框里的配色跟着站点翻过去，那份文档没有重新加载', async ({ page }) => {
  const mark = frameMarks.get(page);
  expect(
    mark,
    '上一步没记号，这两句都比不了（应先走「我在框里那份文档上做个记号」）',
  ).not.toBeUndefined();

  const onDarkSite = await frameModeSignal(page);
  expect(
    onDarkSite,
    `站点换了模式，框里那一页的配色没跟着换（两边都是 ${mark?.signal}）`,
  ).not.toBe(mark?.signal);
  expect(
    await frameTimeOrigin(page),
    '框里那份文档被重新加载了：配色确实翻了，但起始时刻换了另一个数 —— ' +
      '渲染器的展开状态与滚动位置一起被冲掉',
  ).toBe(mark?.timeOrigin);
});

Then('站点的亮暗模式不受操作系统影响', async ({ page }) => {
  // 本站 `themeConfig.colorMode` 没开 `respectPrefersColorScheme`，所以系统深色时站点仍是亮色。
  // 框里那一格收到的是什么值，各层自己的句子负责（redoc 看 `data-redoc-mode`、
  // stoplight 看 Elements 自己那个 `data-theme`、scalar 看 `<body>` 上那两个类名）。
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

// 框内那条地址不给站点的外壳：没有 navbar、没有 footer，整屏都是渲染器的
// （iframe 里再套一层 navbar 既占高度又是重复的壳）。
Then('这一页没有站点的 navbar', async ({ page }) => {
  await expect(page.locator('.navbar')).toHaveCount(0);
});

/**
整页交给这个框时容器不留白：那条 `.container:has(iframe)` 在 theme-iframe 那份共用的
`components/api-frame.css` 里，四条层都吃它。这里是**主题那三个框**（`themeFrame`）所在的
`.container` —— 判据故意不认裸 `iframe`：夹具正文里手写的 `<iframe>` 也会命中全局那一条，
那一句会假绿。
*/
Then('正文容器在这一页让位', async ({ page }) => {
  const container = page
    .locator('.container')
    .filter({ has: themeFrame(page) });
  await expect(container, 'iframe 没落在 `.container` 里').toHaveCount(1);
  await expect(container).toHaveCSS('padding', '0px');
});

/**
外层这一格：iframe 的上沿贴着 navbar 的下沿、下沿贴着视口的下沿，两边各留 1px 容差。
theme-iframe 那份共用版式（`components/api-frame.css` 的 `.api-frame`）里那条
`height: calc(100vh - var(--ifm-navbar-height))` 就是这个数。
*/
Then('框占满 navbar 以下那一屏', async ({ page }) => {
  const box = await themeFrame(page).evaluate((el) => {
    const { innerHeight } = el.ownerDocument.defaultView ?? { innerHeight: 0 };
    const rect = el.getBoundingClientRect();
    return {
      gapToNavbar: Math.round(
        rect.top -
          (el.ownerDocument.querySelector('.navbar')?.getBoundingClientRect()
            .bottom ?? 0),
      ),
      gapToViewport: Math.round(innerHeight - rect.bottom),
    };
  });

  expect(
    Math.abs(box.gapToNavbar),
    `框的上沿没贴住 navbar：差 ${box.gapToNavbar}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(box.gapToViewport),
    `框的下沿没贴住视口：差 ${box.gapToViewport}px`,
  ).toBeLessThanOrEqual(1);
});
