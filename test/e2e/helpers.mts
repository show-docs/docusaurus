import { expect } from '@playwright/test';
import type { FrameLocator, Locator, Page } from '@playwright/test';

/** 每个 page 一只记录：BDD 把「打开页面」和「没有运行期错误」拆成两个步骤，两头要拿到同一份。 */
const errorsByPage = new WeakMap<Page, string[]>();

/**
收未捕获的页面异常。这一格要拦的就是「构建期一个字都不报、只有开页面才炸」的那类
—— 实测过的例子是浏览器 bundle 里没有 `process` 这个全局
（`@stoplight/json-schema-ref-parser` 裸取 `process.browser`），
`pnpm build` 全绿，页面一打开就 `ReferenceError: process is not defined`。

React 的**可恢复**错误（`onRecoverableError`）走 `console.error`，不在这里 —— 那一条对本仓是
预期行为：命中主题那几层的组件在 SSG 阶段返回 `null`，客户端再补渲染。

同一个 page 重复调用只装一次监听器，返回的还是那只数组。
*/
export function watchPageErrors(page: Page): string[] {
  const existing = errorsByPage.get(page);
  if (existing) {
    return existing;
  }

  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });
  errorsByPage.set(page, errors);
  return errors;
}

/** 站点壳上要比的那批属性：navbar 那颗亮暗按钮，与 `<html>` 本身。 */
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
同一批属性在**外层这一份文档**上算一遍，给「主题层没改到站点的壳」那类判据当前提。
三个用得上它的层（`theme-redoc`、`theme-stoplight`、`theme-scalar`）各在自己的 steps 里比值，这里不抄站点
该有的值，哪天有人在站点这一侧重新引一份第三方样式，它会红。

先把鼠标挪开再量：点完 navbar 那颗按钮之后指针正好停在它上面，不挪开就量到「悬停的那一颗」，
跟另一个页面上没悬停的那一颗比，差的是指针位置而不是样式外溢。

这颗按钮的悬停底色是带过渡的（站点自己的 `.toggleButton:hover { background: var(--ifm-color-emphasis-200) }`，
时长走 `--ifm-transition-fast`，实测 `transition: background / 0.2s`），所以指针刚从它上面
挪开的那一刻量到的是**半路中的值**（实测淡出曲线 `rgba(68, 73, 80, 0.282)` → `0.125` →
`0.043` → `0.008` → `rgba(0, 0, 0, 0)`，落点与主页一致）。

这里不写死等待时长，也不再看「连续两帧值相同」：解除 `:hover` 要等一次样式刷新，淡出是**从
那一刻才开始**的，于是开头那一两帧读到的还是悬停色、值当然相同 —— 判据当场成立，紧跟着的
那次读就落在曲线中段。慢机器上（跑 e2e 开着 trace，实测 10 次红 3 次）就是这么红的。
改成问过渡自己的状态：确认真离开了悬停，把这两个元素上还在跑的过渡 `finished` 掉，
再把同一批属性连读两遍、直到两遍一致。
*/
export async function siteStyles(page: Page): Promise<SiteStyles> {
  await page.mouse.move(0, 0);
  return page.locator('html').evaluate(
    async (el, props) => {
      const frame = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      const equal = (a: SiteStyles, b: SiteStyles): boolean =>
        JSON.stringify(a) === JSON.stringify(b);
      const toggle = el.querySelector(':scope .navbar button.clean-btn');
      const pick = (target: Element | null, names: readonly string[]) => {
        const out: Record<string, string> = {};
        if (!target) return out;
        const computed = getComputedStyle(target);
        for (const name of names) out[name] = computed.getPropertyValue(name);
        return out;
      };
      const snapshot = (): SiteStyles => ({
        toggle: pick(toggle, props.toggle),
        html: pick(el, props.html),
      });
      /** 这两个元素上还在跑的过渡（悬停淡出、换主题的变色都算）跑完为止。 */
      const waitTransitions = async (): Promise<void> => {
        const running = [
          ...el.getAnimations(),
          ...(toggle?.getAnimations() ?? []),
        ];
        await Promise.all(
          running.map((animation) => animation.finished.catch(() => undefined)),
        );
      };

      let previous = snapshot();
      for (let i = 0; i < 120; i += 1) {
        // 指针还没挪开就先只等这一格，别把悬停态读成落定值
        if (toggle?.matches(':hover')) {
          await frame();
          continue;
        }
        await waitTransitions();
        const next = snapshot();
        if (equal(previous, next)) {
          return next;
        }
        previous = next;
        await frame();
      }
      return previous;
    },
    { toggle: [...toggleProps], html: [...htmlProps] },
  );
}

/**
## 框内那一份文档：三条 API 层共用的量法

`theme-redoc`、`theme-stoplight` 与 `theme-scalar` 各在命中页放一个 iframe，渲染器整个跑在框内
那份文档里。一条判据都得先指名站在哪一份文档上量：外层用 `page.locator(...)`，框内用
`componentFrameDoc(page)`。`contentFrame()` 交回的是 `FrameLocator` —— 只给 `locator()`，不给
`evaluate()`，所以要跑脚本就从它下面取 `html` 那一颗，回调里再拿 `el.ownerDocument`。同源，
两边都能直接读 DOM 与 CSSOM。

三条层的框都是 `theme-component-page` 那一格（类名 `component-frame`，框内那份文档是本层注册的
一条通用路由），所以这里**没有按层名分的类名**可比 —— 旧版那种 `iframe.redoc-frame` 随各包自带的
框页一起删了。这一页归了哪一层由**框里渲染的是谁**判（下面那份 `layerRoot`），三层的根各是自己
那层 CSS 的作用范围，本仓自己写的那两格是 `redoc-ui.tsx` / `stoplight-ui.tsx` 里那两个类名常量。

`theme-iframe` 那一层放的也是 iframe，但那是别人站点的地址，没有本仓这套握手，所以这里不把它
算进 `componentFrame`（它自己的用例按 `.external-frame` 认）。

## 层名：这一族 e2e 只认这一个词

句子按它捕获（`我打开 redoc 示例页`），示例页地址与框里那个渲染根也由它算。新增一条层在这里
加一个词，各处不用再各抄一份字面量。
*/
export const themeLayers = ['redoc', 'scalar', 'stoplight'] as const;

export type ThemeLayer = (typeof themeLayers)[number];

/**
命中页上那一个框：三条层共用 component-page 那一格，类名与框内那份文档都由它给。

`src` 里**没有**任何本页的信息（那份数据由握手送进来，见 component-page 的
`docs/iframe-protocol.md`），所以这一格在所有命中页上都是同一个字符串。
*/
export const componentFrame = (page: Page): Locator =>
  page.locator('iframe.component-frame');

export const componentFrameDoc = (page: Page): FrameLocator =>
  componentFrame(page).contentFrame();

/** 三层在框内那份文档里的渲染根：这一页交给谁，就由框里长出来的是谁认。 */
const layerRootSelectors: Record<ThemeLayer, string> = {
  redoc: '.redoc-root',
  // Scalar 那份文档里裸 `.scalar-app` 有多格（弹窗与提示各占一格），带 `scalar-api-reference`
  // 的那一颗才是布局根 —— 口径见 `steps/scalar.steps.mts`。
  scalar: '.scalar-app.scalar-api-reference',
  stoplight: '.stoplight-root',
};

/** 某一层那个渲染器在框内那份文档里的根格。 */
export const layerRoot = (page: Page, layer: ThemeLayer): Locator =>
  componentFrameDoc(page).locator(layerRootSelectors[layer]);

/** 某一层的示例页（本包 `docs/` 下的那一页）：整页交给框的那一条文档页。 */
export const layerDemoUrl = (layer: ThemeLayer): string =>
  `/theme-${layer}/docs/${layer}-demo`;

/**
某一层「键写了、文档地址没给」那一格的夹具页（同一目录里的另一页）。

旧版这一格是「把框内那条地址上的 `?src=` 去掉」—— 现在那一份数据由握手送，地址里本来就没有
它，所以缺输入只能由**文档页这一头**造成：`redoc: true` 而不写 `oas3:` / `aas3:`。
*/
export const layerNoSpecDemoUrl = (layer: ThemeLayer): string =>
  `/theme-${layer}/docs/${layer}-no-spec`;

/**
component-page 那条通用框内路由在站点里的地址（`trailingSlash` 没配 → 产物是
`__component-frame/index.html`，地址带尾斜杠，见 `packages/theme-component-page/lib/frame-url.ts`）。

直接打开它只能看到**还没拿到数据**那一格：那一份数据靠外层与框内握手送，独立打开时没有外层，
所以这一条钉的就是那个占位状态，不是某个渲染器。
*/
export const componentFrameUrl = '/__component-frame/';

/**
## 四条视图层：句子里的词与示例页地址

`theme-markmap`、`theme-erd`、`theme-diff`、`theme-viewer` 这四层各把一块视图挂在正文上方，
用例的第一步都是「打开这一层的示例页」，实现只差一个地址。这一张表把句子与地址对上：
新增一层只在这里加一行，不用再写一条 `Given`。

地址分属**两棵内容根**：前三层的包在 `packages/`，挂在 `routeBasePath: '/'` 那一份 docs 实例上；
`theme-viewer` 搬到了 `themes/`，那一族的地址多一段 `/themes`。表里写的就是最终地址，所以加一行时
顺手按包所在的根写。

句子按 feature 里的**原文**整句写死，不在这里拼 —— 层名是拉丁字母时前后有空格
（「我打开 markmap 示例页」），是中文时不带（「我打开差异视图示例页」），拼出来的正则会把
后两句匹配成别的句子。
*/
export const viewLayers = [
  {
    step: '我打开 markmap 示例页',
    demo: '/theme-markmap/docs/markmap-demo',
  },
  { step: '我打开 ERD 示例页', demo: '/theme-erd/docs/erd-demo' },
  { step: '我打开差异视图示例页', demo: '/theme-diff/docs/diff-demo' },
  {
    step: '我打开图片查看器示例页',
    demo: '/themes/theme-viewer/docs/viewer-demo',
  },
] as const;

/**
「站点这一头的配色落到框里了没有」那一句的读法：把框内那份文档上的两处读数拼成一串。

- `background-color`：`theme-redoc` 那一层看的是它 —— Redoc 那条 `:root { background-color: var(--bg-color) }`
  原样落在框内那份文档的 `<html>` 上，它那份暗色表换掉的正是 `--bg-color`。
- `--canvas-l`：`theme-stoplight` 那一层看的是它 —— Elements（`@stoplight/mosaic`）调色板里的变量，
  站点那份 css 里没有这个名字，它随 `[data-theme=dark]` 那一格从 `100%` 翻到 `8%`（实测）。
  这一层的 `<html>` 底色是站点自己那条规则给的，证不了 Elements 的表跟没跟。
- `--scalar-background-1`：`theme-scalar` 那一层看的也是它 —— Scalar 那套 Tailwind 调色板里的
  变量，随 `<body>` 上互斥的两个类名（`dark-mode` / `light-mode`）从 `#fff` 翻到 `#0f0f0f`。
*这一层的类名与变量都长在 `<body>` 上**（redoc、stoplight 那两层在 `<html>` 上），所以求值对象
  先按这两个类名在不在、再分支：在就在 `<body>` 上算，不在就在 `<html>` 上算 ——
  `--scalar-background-1` 在 scalar 帧的 `<html>` 上算出来是空串，判据就永远不翻。

三个名字各读各的：redoc 那一层拿到的 `--canvas-l` 与 `--scalar-background-1` 都是空串，
stoplight 那一层两处都跟着翻。都不抄具体色值 —— 判据只问「换了没有、跟另一个页面比是不是一样」。

**读数之前先等这一帧挂齐**（`waitFrameSettled`）：那几个变量都随渲染器自己那份样式表落地，落在
「还没挂上」那一刻的读数就是空串，两次读数一比，差出来的是加载快慢，不是操作系统的偏好。
*/

/**
框里那份文档「挂齐」没有：三层里任意一颗渲染根落了地，且每条 `<link>` 的样式表都加载完了。

样式表按 `link.sheet` 在不在认 —— `<link>` 一挂上就有 `sheet` 对象，那份表**还没下载完**时它同样
在，所以这一格量的是「表已经能参与层叠」，不是「有个同名链接」。
*/
const frameIsSettled = (page: Page): Promise<boolean> =>
  componentFrameDoc(page)
    .locator('html')
    .evaluate((_el, roots: string) => {
      const links = [
        ...document.querySelectorAll('link[rel=stylesheet]'),
      ] as HTMLLinkElement[];
      return (
        document.readyState === 'complete' &&
        document.querySelector(roots) !== null &&
        links.every((link) => link.sheet !== null) &&
        // 已加载的那几份表都真的解析出了规则：空表也算 sheet 在，层叠里等于没挂。
        // 本帧与站点同源，读不到 cssRules 的那一类在这里不会出现，真出现就当没挂。
        [...document.styleSheets].every((sheet) => {
          try {
            return sheet.cssRules.length > 0;
          } catch {
            return false;
          }
        })
      );
    }, Object.values(layerRootSelectors).join(', '));

/** 等它挂齐；到超时还没挂齐就报「框里那份文档没挂齐」，而不是让配色读数各读到一个时刻。 */
const waitFrameSettled = async (page: Page): Promise<void> => {
  await expect
    .poll(() => frameIsSettled(page), {
      timeout: 20_000,
      message: '框里那份文档到超时都没挂齐：渲染根没落地，或样式表没加载完',
    })
    .toBe(true);
};

export const frameModeSignal = async (page: Page): Promise<string> => {
  await waitFrameSettled(page);
  const scalarMode = await componentFrameDoc(page)
    .locator('body.dark-mode, body.light-mode')
    .count();
  return componentFrameDoc(page)
    .locator(scalarMode > 0 ? 'body' : 'html')
    .evaluate((el) => {
      const computed = getComputedStyle(el);
      return `${computed.backgroundColor}|${computed.getPropertyValue('--canvas-l').trim()}|${computed.getPropertyValue('--scalar-background-1').trim()}`;
    });
};

/** 框内那份文档的起始时刻：每加载一份新文档就是一个新的数。 */
export const frameTimeOrigin = (page: Page): Promise<number> =>
  componentFrameDoc(page)
    .locator('body')
    .evaluate(() => performance.timeOrigin);

/** 「做个记号」存下来的两样：切暗色**之前**那份文档的配色读数，与它自己的起始时刻。 */
export interface FrameMark {
  signal: string;
  timeOrigin: number;
}

/** 按 page 存，Node 侧的一份；判「有没有重新加载」用不到往框里的 DOM 上写东西。 */
export const frameMarks = new WeakMap<Page, FrameMark>();
