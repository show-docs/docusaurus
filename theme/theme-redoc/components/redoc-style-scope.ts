// Redoc 的样式是 styled-components 在**运行时**插进 `<head>` 的，构建期那一遍（PostCSS）
// 根本拿不到那份文件，所以圈定只能发生在样式生成的那一步：`StyleSheetManager` 的
// `stylisPlugins` 就是 styled-components 编译每条规则时经过的中间件链。
//
// 这里动三类会打到站点上的选择器：
//
// 1. **裸标签**（`button { … }` 这种）—— 前面加 `:where(.redoc-root)`。
//    必须用 `:where()` 而不是直接 `.redoc-root button`：后者把这条规则的优先级从 (0,0,1)
//    抬到 (0,1,1)，就会压过 Redoc 自己那些 (0,1,0) 的类名规则，等于把它的组件样式改写了
//    （实测：右栏那颗 Copy 按钮的边框会从 `solid 1px` 变成 `none`）。`:where()` 自身优先级
//    是 0，加上去只收窄范围、不动层叠关系。
// 2. **` :root` 那条规则里的真属性** —— 挪到 `.redoc-root` 上。Redoc 往 `<html>` 上写
//    背景色、文字色、字体，整站的壳都跟着变。CSS 变量**留在** `:root`：它的下拉、提示、
//    弹窗是 `createPortal(…, document.body)` 挂到 body 的，不在 `.redoc-root` 里面，
//    变量挪走它们就取不到值。
// 3. **`:root.dark` 那一整套暗色表** —— 换挂在 `:root[data-theme="dark"]` 上，也就是站点
//    自己那个亮暗开关（见下面 `DARK_PALETTE_PREFIX` 那两条常量的注释）。
//
// 故意不动的：`html` / `body` 开头的选择器（加前缀就永远匹配不到，等于静默删掉 Redoc 自己
// 那条规则）、以及 `:root * { box-sizing: border-box }`（站点自己的 `*` 规则同值，实测计算
// 样式差为 0，圈它只会让挂到 body 的浮层丢掉 border-box）。
//
// 中间件的形状按 `@types/stylis` 的 `Middleware`：`(element, index, children, callback)`。
// 能动的就三样：`element.props`（这条规则的选择器列表）、`element.children`（这条规则里的
// 声明）、以及往 `children` 这个数组里增删规则 —— stylis 的 `serialize` 每轮重读
// `children.length`，所以插进去的规则会被跟着输出。

/** 本层包着 Redoc 的那层壳的类名，圈定用的选择器由它拼出来。 */
export const REDOC_ROOT_CLASS = 'redoc-root';

/** 加在裸标签前面的范围。`:where()` 保证只收范围、不改优先级。 */
const SCOPE_PREFIX = `:where(.${REDOC_ROOT_CLASS})`;

/** 从 `:root` 挪出来的真属性挂在这一格上，优先级与 `:root` 相同（0,1,0）。 */
const SCOPE_HOST = `.${REDOC_ROOT_CLASS}`;

/**
Redoc 的暗色表（实测 `redoc@3.0.1` 有 60 来条：调色板变量、那些 `tag-*` 与 `card-*` 的
配色、滚动条滑块）一律挂在 `:root.dark` 开头。那个 `dark` 类是 Redoc 自己按**操作系统的**
偏好（`matchMedia('(prefers-color-scheme: dark)')`，另有它自己那份 localStorage）写到
`<html>` 上的 —— 站点亮着、系统暗着，这一页就会自己变暗，跟站点的开关无关。

换成站点自己那一条：Docusaurus 的亮暗模式写在 `<html data-theme="…">` 上，它自己的 CSS
也是这么用的（`html[data-theme=dark] { … }`）。属性选择器与类选择器在优先级里同档
（各算 0,1,0），换过去不动层叠关系。
*/
const DARK_PALETTE_PREFIX = ':root.dark';

/** 站点自己那一条暗色选择器：优先级与 `:root.dark` 相同（各算 0,1,0 的两格）。 */
const SITE_DARK_SELECTOR = ':root[data-theme="dark"]';

/** 开头是裸标签或 `*`：`button`、`a:hover`、`h1 button`、`*`。 */
const BARE_TAG = /^(?:\*|[a-z][a-z0-9]*(?![\w-]))/i;

type Declaration = { type: string; props?: string; value: string };

type ElementLike = {
  type: string;
  value: string;
  props?: string[];
  children?: Declaration[];
};

function isScopableTagSelector(selector: string): boolean {
  const head = selector.trimStart();
  return (
    BARE_TAG.test(head) && !/^html\b/i.test(head) && !/^body\b/i.test(head)
  );
}

function isCustomProperty(declaration: Declaration): boolean {
  return (declaration.props ?? '').startsWith('--');
}

/**
把开头那一格 `:root.dark` 换成站点自己的写法。

按前缀切一刀而不是 `replace()`：换进去的值是个变量，`String#replace()` 里那种写法
（`unicorn/no-unsafe-string-replacement`）本来也容易被读成「整串替换」。
*/
function rehangDarkPalette(trimmed: string): string | undefined {
  if (!trimmed.startsWith(DARK_PALETTE_PREFIX)) {
    return undefined;
  }
  // 下一个字符还是单词字符或 `-`，就不是 `:root.dark` 这一格（`:root.darkness` 那种要放过）。
  const next = trimmed[DARK_PALETTE_PREFIX.length];
  return next !== undefined && /[\w-]/.test(next)
    ? undefined
    : `${SITE_DARK_SELECTOR}${trimmed.slice(DARK_PALETTE_PREFIX.length)}`;
}

/**
交给 `StyleSheetManager` 的 `stylisPlugins`。只认 `rule` 这一种元素，
其余（声明、`@keyframes`、注释）原样放过。
*/
export function scopeRedocStyles(
  element: unknown,
  index: number,
  children: unknown[],
): void {
  const rule = element as ElementLike;
  if (rule.type !== 'rule' || !Array.isArray(rule.props)) {
    return;
  }

  rule.props = rule.props.map((selector) => {
    const trimmed = selector.trim();
    return (
      rehangDarkPalette(trimmed) ??
      (isScopableTagSelector(trimmed) ? `${SCOPE_PREFIX} ${trimmed}` : selector)
    );
  });

  if (rule.props.length !== 1 || rule.props[0] !== ':root') {
    return;
  }

  const declarations = rule.children ?? [];
  const moved = declarations.filter(
    (declaration) =>
      declaration.type === 'decl' && !isCustomProperty(declaration),
  );
  if (moved.length === 0) {
    return;
  }

  rule.children = declarations.filter(
    (declaration) => !moved.includes(declaration),
  );
  children.splice(index + 1, 0, {
    type: 'rule',
    value: SCOPE_HOST,
    props: [SCOPE_HOST],
    children: moved,
  } satisfies ElementLike);
}
