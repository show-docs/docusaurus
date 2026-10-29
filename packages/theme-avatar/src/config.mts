/**
站点写下的插件选项 → 浏览器要用的那一份配置：边校验边补缺省。

**配置期代码**：跑在 Node 里（Docusaurus 加载配置时执行），不引 React、不引 DOM。

判据只有一条路：认得的格才读，写歪的形状当场红。这一族的兄弟包都把校验写在配置期，
理由是同一件事 —— 等到浏览器里读到 `undefined` 再猜是谁写歪了，比红在配置加载那一句难查得多。
唯一的例外是 `id`：那是 Docusaurus 自己注进选项对象的那一格（插件实例的 id），站点并不会写它，
所以它算「认得」，判过形状之后不交进浏览器那一份。

有三格**没有能用的缺省值**，因为它们各指向站点自己的服务：`userApi`（用户信息接口）、
`menu.profileHref`（个人中心）、`menu.logoutHref`（退出登录）。它们的缺省是空串，而空串正好是
「关闭」：`userApi` 空 = 这一层整个不启用，两条菜单地址空 = 那一条菜单项不出。其余各格都有缺省，
站点不写也能跑。

缺省值写在下面那棵 `OPTION_SPEC` 的叶子上一格，所以「这一层认哪些格」与「不写时是什么」
只有这一处；再加一条测试（`test/avatar-config.test.mts`）钉住返回的那份形状。
*/

import type { AvatarConfig } from '../types/avatar-config.ts';

/** 本层的插件名，同时是它在站点全局数据里的那一格键名。 */
export const PLUGIN_NAME = '@show-docs/docusaurus-theme-avatar';

/** 校验与报错共用的前缀：报错点到哪儿。 */
const ROOT = 'theme-avatar 的选项';

/** 一棵树里的一格：叶子说自己收什么、缺省是什么；组说自己有哪几格。 */
type FieldSpec =
  | { kind: 'text'; default?: string; nonEmpty?: boolean; omit?: boolean }
  | { kind: 'boolean'; default?: boolean }
  | { kind: 'number'; default?: number; nonNegative?: boolean }
  | { kind: 'group'; of: Record<string, FieldSpec> };

type LeafSpec = Exclude<FieldSpec, { kind: 'group' }>;

const OPTION_SPEC: Record<string, FieldSpec> = {
  // Docusaurus 注进来的那一格（`plugins` 里那条的插件 id）。收下、不红，但不交给浏览器：
  // 主题层只有一份 `ColorModeToggle`，它读的是 `default` 那一个实例的那一格。
  id: { kind: 'text', omit: true },
  enableHostname: { kind: 'text', default: '' },
  // 空串 = 这一层不启用：站点没写它，头像就不出现。
  userApi: { kind: 'text', default: '' },
  anonymousName: { kind: 'text', default: '未命名', nonEmpty: true },
  defaultAvatar: { kind: 'text', default: '' },
  request: {
    kind: 'group',
    of: {
      debounceLeading: { kind: 'boolean', default: true },
      debounceWait: { kind: 'number', default: 300, nonNegative: true },
      throttleWait: { kind: 'number', default: 300, nonNegative: true },
      cacheKey: { kind: 'text', default: 'avatar-user', nonEmpty: true },
    },
  },
  fields: {
    kind: 'group',
    of: {
      id: { kind: 'text', default: 'id', nonEmpty: true },
      name: { kind: 'text', default: 'name', nonEmpty: true },
      displayName: { kind: 'text', default: 'displayName', nonEmpty: true },
      avatar: { kind: 'text', default: 'avatar', nonEmpty: true },
    },
  },
  menu: {
    kind: 'group',
    of: {
      profileLabelPrefix: { kind: 'text', default: '用户：' },
      // 空串 = 不出这一行。
      profileHref: { kind: 'text', default: '' },
      logoutText: { kind: 'text', default: '退出登录' },
      // 空串 = 不出这一行。
      logoutHref: { kind: 'text', default: '' },
      logoutTarget: { kind: 'text', default: '_self' },
    },
  },
};

/** 拿到的是个什么东西，只用于报错文案（`null` 与数组各有名字，别混称 object）。 */
function kindOf(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  return Array.isArray(value) ? '数组' : typeof value;
}

/** 是不是没有原型的普通对象：`Date`、类实例、数组都不算。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/** 一格里那几格的名单，用于「不认得这一格」那条报错。 */
function namesOf(spec: Record<string, FieldSpec>): string {
  return Object.keys(spec)
    .map((name) => `\`${name}\``)
    .join(' / ');
}

/** 叶子那一格判到底，顺带把值原样交回。 */
function checkLeaf(value: unknown, spec: LeafSpec, at: string): unknown {
  if (spec.kind === 'text') {
    if (typeof value !== 'string') {
      throw new TypeError(`${at} 要一个字符串，拿到的是 ${kindOf(value)}`);
    }

    if (spec.nonEmpty && value === '') {
      throw new Error(`${at} 不能是空串；要这一格不生效就别写它`);
    }

    return value;
  }

  if (spec.kind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new TypeError(`${at} 要一个布尔值，拿到的是 ${kindOf(value)}`);
    }

    return value;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${at} 要一个数字，拿到的是 ${kindOf(value)}`);
  }

  if (spec.nonNegative && value < 0) {
    throw new Error(`${at} 要一个非负的数（毫秒数），拿到的是 ${value}`);
  }

  return value;
}

/** 一组：先把写了的格逐格判过去，再给没写的补上缺省。 */
function checkGroup(
  declared: Record<string, unknown>,
  spec: Record<string, FieldSpec>,
  at: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [field, childSpec] of Object.entries(spec)) {
    const value = declared[field];
    const childAt = `${at}.${field}`;

    if (value === undefined) {
      const filled =
        childSpec.kind === 'group'
          ? checkGroup({}, childSpec.of, childAt)
          : childSpec.default;

      if (filled !== undefined) {
        result[field] = filled;
      }

      continue;
    }

    // 判过形状但不交出去的那一格（只有 Docusaurus 注入的 `id` 用这一格）。
    const validated = checkValue(value, childSpec, childAt);

    if (!(childSpec.kind === 'text' && childSpec.omit)) {
      result[field] = validated;
    }
  }

  for (const [field, declaredValue] of Object.entries(declared)) {
    if (spec[field] === undefined && declaredValue !== undefined) {
      throw new Error(
        `${at} 里没有 \`${field}\` 这一格；它只有 ${namesOf(spec)}`,
      );
    }
  }

  return result;
}

/** 一格：组就往下走，叶子就地判完。 */
function checkValue(value: unknown, spec: FieldSpec, at: string): unknown {
  if (spec.kind === 'group') {
    if (!isPlainObject(value)) {
      throw new TypeError(`${at} 要一个普通对象，拿到的是 ${kindOf(value)}`);
    }

    return checkGroup(value, spec.of, at);
  }

  return checkLeaf(value, spec, at);
}

/**
把站点的插件选项校验并归一成 `AvatarConfig`。

不写任何一格是合法的：那时交回的就是整份缺省，而缺省里没有 `userApi`，
于是这一层在浏览器里什么都不画 —— 「装上但先不配」不会把站点弄坏。
*/
export function normalizeConfig(declared: unknown): AvatarConfig {
  if (declared !== undefined && !isPlainObject(declared)) {
    throw new TypeError(`${ROOT} 要一个普通对象，拿到的是 ${kindOf(declared)}`);
  }

  return checkGroup(declared ?? {}, OPTION_SPEC, ROOT) as AvatarConfig;
}
