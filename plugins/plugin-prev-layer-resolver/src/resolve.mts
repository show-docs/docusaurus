import path from 'node:path';

import { isFile } from './layers.mts';
import type { ResolveRequestLike, ThemeLayer } from './types.mts';

/**
「@theme-prev/* → 真实文件」这一步的纯逻辑：全是「层栈 + 组件名 + 导入者路径 →
目标文件」的纯函数，因此可被用例穷举（resolver 本身依赖 webpack 的 request 结构，难以单测）。
*/

/**
组件候选的 ext **优先级**：目录形式恒胜单文件，同类里 `tsx > ts > jsx > js`。

正据是**官方实现**而不是我们的排序推理：官方 `createAliasesForTheme` 枚举 js/jsx/ts/tsx
四种扩展名的组件文件且**后写覆盖**，而 fast-glob 在同一目录里先发文件、再发子目录，
赢家因此是 `X/index.tsx`。这条发射顺序是 fast-glob 的行为、**不是文档化契约**，所以由
用例把两边钉在一起（`test/resolve.test.mts` 的「官方别名赢家」），上游一漂移就报红。

不能扩张到 `mjs/cjs/mts/cts`：比官方宽一寸就会解析到官方体系里**不存在**的文件
（链看起来工作了，但那个组件拿不到 `@theme/X`）。
*/
const EXT_PRIORITY = ['tsx', 'ts', 'jsx', 'js'] as const;

/**
唯一的链式覆盖 specifier 前缀。带斜杠：只匹配完整的 specifier 前缀
（`@theme-prevX/Logo` 因此不会被认领）。
*/
const SPECIFIER_PREFIX = '@theme-prev/';

/**
组件名把候选**拼成官方会忽略的形状**时跳过该候选。

官方枚举组件文件时忽略四类（点开头的段、`__tests__/`、`*.d.ts`、`*.test.*`），而本方案的
候选名是**拼出来的**，所以拦在这里：认了它们就会出现「本插件认、官方不认」的两套可见性
（`@theme-prev/X` 解析成功，而 `@theme/X` 根本不存在这个组件）。

入参恒是 `/` 分隔（组件名已过 `isSafeComponentName`，它禁反斜杠），故不按 `path.sep` 归一。
*/
function isIgnoredComponentFile(relativePath: string): boolean {
  return (
    /(?:^|\/)\./.test(relativePath) || // fast-glob 默认 `dot:false`：任一段以 `.` 开头官方都枚举不到
    /(?:^|\/)__tests__(?:\/|$)/.test(relativePath) || // 官方剔掉整个目录
    /\.d\.ts$/.test(relativePath) || // 官方只剔 `.d.ts`（`Logo.d.tsx` 在它那边仍是组件）
    /\.test\.(?:js|jsx|ts|tsx)$/.test(relativePath) // 官方剔的正是白名单那四个后缀
  );
}

/**
组件名合法性校验：它是**被 specifier 拼出来的字符串**，不是可信输入。

`<rest>` 来自用户写的 import，会原样参与 `path.join(layer.owner, componentName)`：
`@theme-prev/../b/Logo` 就能读到别的层（层与层之间本来只靠「目录前缀」隔离）。
所以规则是「**每一段都必须是安全的路径片段**」：拒绝绝对路径与盘符（`path.join`
遇到绝对尾段会整体丢弃前缀）、`..` / `.` / 空段、`\`（在 POSIX 上是合法文件名字符，
会造成同一组件两种写法）、NUL（部分 fs 调用会截断）。嵌套组件
（`@theme-prev/DocItem/Footer`）是合法用法，所以校验的是「组件路径」而不是「文件名」。

不做「先归一再看是否越界」：归一是字符串层面的，`path.join` 之后仍有平台差异；
白名单式的片段校验对合法输入零成本。
*/
export function isSafeComponentName(componentName: string): boolean {
  // `typeof` 那半是类型契约上的防御：调用方已由 `matchSpecifier` 保证是字符串，但这是
  // 出口 API，非字符串按「不安全」处理（与 `findIssuerLayerIndex` 同一口径）。
  if (typeof componentName !== 'string' || componentName.length === 0)
    return false;
  if (
    componentName.includes('\0') ||
    componentName.includes('\\') ||
    path.isAbsolute(componentName)
  )
    return false;
  // 盘符：Windows 上 `C:Logo` 是「相对 C 盘当前目录」的路径，`path.isAbsolute` 认不出它
  // （缺分隔符）；POSIX 上它只是个合法目录名，但它不可能是组件名，拒了零成本。
  return (
    !/^[A-Z]:/i.test(componentName) &&
    componentName
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/**
在层目录里解析组件名对应的真实文件；该层没有此组件时返回 null。

候选顺序必须是「目录恒胜单文件、同类里 tsx > ts > jsx > js」：层内同名组件可以并存多种
形态，而这个答案必须与 `@theme/X` 指向的**同一个文件**，否则同一个组件在
`@theme-prev/X` 与官方别名两条路上拿到两个模块。顺序取 {@link EXT_PRIORITY}（依据是官方
实现，不是声明序）。另两条因为候选是拼出来的而必须显式处理：组件名 `index` 只有目录
形式成立（官方把 `index.tsx` 映射成裸 `@theme`）、候选拼成官方会忽略的形状时跳过。

组件名已过 `isSafeComponentName`，`path.join` 不可能越出层目录 —— 不再加 realpath 落点
校验（挡不住任何进来的输入，只多一个漂移点）。探测用 {@link isFile}：候选必须是**文件**。
*/
export function resolveComponentInLayer(
  layer: ThemeLayer | null | undefined,
  componentName?: string,
): string | null {
  if (
    !layer ||
    !layer.exists ||
    !componentName ||
    !isSafeComponentName(componentName)
  )
    return null;
  const base = path.join(layer.owner, componentName);
  // 先目录形式，再单文件形式；逐个探测而不是拼候选数组：多数请求在第一个候选就命中或
  // 整段落空，拼数组等于每次探测白分配 8 个对象。
  for (const ext of EXT_PRIORITY) {
    // 组件名能把候选拼成官方会忽略的形状（见 `isIgnoredComponentFile`）—— 跳过，不当实现
    if (isIgnoredComponentFile(`${componentName}/index.${ext}`)) continue;
    const file = path.join(base, `index.${ext}`);
    if (isFile(file)) return file;
  }
  // 单文件形态在组件名 `index` 时不成立（见函数文档）
  if (componentName === 'index') return null;
  for (const ext of EXT_PRIORITY) {
    if (isIgnoredComponentFile(`${componentName}.${ext}`)) continue;
    const file = `${base}.${ext}`;
    if (isFile(file)) return file;
  }
  return null;
}

/** 规范化路径用于前缀比较（统一分隔符）；POSIX 上 `sep` 就是 `/`，等于恒等 */
function toPosix(p: string): string {
  return p.replaceAll(path.sep, '/');
}

/**
导入者属于哪一层：取「最长路径前缀」命中的那一层（兼容主题目录嵌套），-1 表示不在任何层内。

两侧都先 `realpath` 再比前缀：换来「同一个目录不会因为 `..` / 软链被算成两层」，
代价是**软链到层外的文件不属于它物理所在的那一层**（`theme-a/logo-link -> /elsewhere`
⇒ `-1` ⇒ 退回官方解析 + 告警）。反过来只按字符串，会让「同一目录两种写法」被算成两层
—— 那是**静默的错层**，比显式的「不在层内」更糟。这条边界写在使用约束里。

`realpath` 由调用方给（每次构建一份的缓存，见 `resolver.mts` 的 `realpathOf`）。

issuer 是不可信输入，判据只能是「是不是字符串」：`!issuer` 挡不住 `{}` / `42`，
而 `path.resolve` 对非字符串直接抛 `ERR_INVALID_ARG_TYPE`（与「不认识就当不在层内」
的契约相反）；数字 `0` 又会被 `!0` 误判成「不在层内」。
*/
export function findIssuerLayerIndex(
  layers: readonly ThemeLayer[],
  issuer: string | undefined,
  realpath: (p: string) => string,
): number {
  if (typeof issuer !== 'string' || issuer.length === 0) return -1;
  // 与 `layersFromPlugins` 用同一套规范化（realpath），否则同一目录会被判成不同层
  const normalized = toPosix(realpath(issuer));
  let hit = -1;
  let hitLength = -1;
  // 先按长度筛掉再比前缀：一旦某层已命中，更短的层不可能取代它（层栈内层在前，等长时
  // 保留更内层）；而拼 `${owner}/` 再 startsWith 等于每层为每次请求多分配一个字符串。
  let i = -1;
  for (const layer of layers) {
    i += 1;
    const owner = toPosix(realpath(layer.owner));
    if (owner.length <= hitLength) continue;
    if (!(
      normalized === owner ||
      (normalized.startsWith(owner) && normalized[owner.length] === '/')
    )) {
      continue;
    }

    hit = i;
    hitLength = owner.length;
  }
  return hit;
}

/**
取「谁 import 的」，只有一种形态：webpack 把 `contextInfo`（含 `issuer`）作为
`resolver.resolve()` 的**首参**传入，上游把它原样挂成 `request.context`。enhanced-resolve
里不存在 `request.contextInfo`，而首参给成字符串时会被挪去 `path`、`context` 归一成 `{}`
（`Resolver.js` 的重载位移），所以 `request.context` 恒是对象、`request.issuer` 恒不存在。
取不到返回 ''（= 不在任何层内 → 交回官方解析）。
*/
export function resolveIssuer(request?: ResolveRequestLike): string {
  const { context } = request ?? {};
  if (!context || typeof context !== 'object') return '';
  const { issuer } = context as { issuer?: unknown };
  return typeof issuer === 'string' ? issuer : '';
}

/**
匹配 specifier 前缀；不匹配返回 null（官方别名与非字符串都不匹配）。
返回匹配到的前缀，组件名由调用方切出来。
*/
export function matchSpecifier(request?: string): string | null {
  if (typeof request !== 'string') return null;
  return request.startsWith(SPECIFIER_PREFIX) ? SPECIFIER_PREFIX : null;
}
