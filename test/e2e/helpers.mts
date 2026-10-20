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
## 框内那一份文档：三层共用的量法

`theme-redoc`、`theme-stoplight` 与 `theme-scalar` 各在命中页放一个 iframe，渲染器整个跑在框内
那份文档里。一条判据都得先指名站在哪一份文档上量：外层用 `page.locator(...)`，框内用
`themeFrameDoc(page)`。`contentFrame()` 交回的是 `FrameLocator` —— 只给 `locator()`，不给
`evaluate()`，所以要跑脚本就从它下面取 `html` 那一颗，回调里再拿 `el.ownerDocument`。同源，
两边都能直接读 DOM 与 CSSOM。

`theme-iframe` 那一层放的也是 iframe，但那是别人站点的地址，没有本仓这套消息通道，所以这里
按这三个层各自声明的类名认，不复用裸 `iframe`。
*/
export const themeFrame = (page: Page): Locator =>
  page.locator(
    'iframe.redoc-frame, iframe.stoplight-frame, iframe.scalar-frame',
  );

export const themeFrameDoc = (page: Page): FrameLocator =>
  themeFrame(page).contentFrame();

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
*/
export const frameModeSignal = async (page: Page): Promise<string> => {
  const scalarMode = await themeFrameDoc(page)
    .locator('body.dark-mode, body.light-mode')
    .count();
  return themeFrameDoc(page)
    .locator(scalarMode > 0 ? 'body' : 'html')
    .evaluate((el) => {
      const computed = getComputedStyle(el);
      return `${computed.backgroundColor}|${computed.getPropertyValue('--canvas-l').trim()}|${computed.getPropertyValue('--scalar-background-1').trim()}`;
    });
};

/** 框内那份文档的起始时刻：每加载一份新文档就是一个新的数。 */
export const frameTimeOrigin = (page: Page): Promise<number> =>
  themeFrameDoc(page)
    .locator('body')
    .evaluate(() => performance.timeOrigin);

/** 「做个记号」存下来的两样：切暗色**之前**那份文档的配色读数，与它自己的起始时刻。 */
export interface FrameMark {
  signal: string;
  timeOrigin: number;
}

/** 按 page 存，Node 侧的一份；判「有没有重新加载」用不到往框里的 DOM 上写东西。 */
export const frameMarks = new WeakMap<Page, FrameMark>();
