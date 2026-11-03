/**
「`plugins` / `themes` 里那一个槽位是不是某个包」这一条判据。

为什么住在这一包里：这条问的是**本包这件事** —— 那条别名（`@theme-prev/*`）由本包提供，所以
「它在不在站点那两份清单里」这句话只有本包自己说得住。在此之前它住在
`@show-docs/docusaurus-theme-iframe` 的 `lib/` 里，于是任何想用它的层都得先引那一族层，
连带把「装了 theme-iframe」变成自己的安装前提 —— 而真正的前提只有这一个包。

这一份是**纯函数**：不引 `node:*`、不引 React、不引 DOM，也不引 core。拿那份清单的判法因此
也归不得这一份 —— 「站点还可能在 preset 里注册插件」那句话要问官方，住在
`./registered-plugins.mts`。纯函数也让判据本身能在单测里直接钉，不必先建一个站点。
*/

/** 本包的包名 = 站点 `plugins` 里那一项的名字。 */
export const PLUGIN_NAME = '@show-docs/docusaurus-plugin-prev-layer-resolver';

/**
站点声明插件的两个入口。`themes:` 与 `plugins:` 在 Docusaurus 里是两份清单，装机判定不能只看一份
（Docusaurus 会把它们合并成真实插件表，但生成的浏览器配置里仍然分开）。
*/
export type PluginSlots = {
  plugins?: readonly unknown[] | null;
  themes?: readonly unknown[] | null;
};

/**
那一个槽位写下的包名，认不出来时是 `undefined`。

原始配置里那四种写法：字符串（裸包名或路径）、`[包名, 选项]`、`[路径, 选项]`、
`{name}` 对象（归一化形状）。名字只认字符串 —— 配置里塞了别的类型就当认不出，
而不是把一个数字一路带到 `slotIsNamespace()` 的 `replaceAll` 上。
*/
export function pluginSlotName(slot: unknown): string | undefined {
  if (typeof slot === 'string') {
    return slot;
  }

  if (Array.isArray(slot)) {
    return typeof slot[0] === 'string' ? slot[0] : undefined;
  }

  const name =
    typeof slot === 'object' && slot !== null
      ? (slot as { name?: unknown }).name
      : undefined;

  return typeof name === 'string' ? name : undefined;
}

/**
一个槽位的名格是不是这条层：裸包名相等，或**该包目录内任何入口**的绝对路径
（`docusaurus-theme-x` 与去前缀的 `theme-x` 两种目录段都认 —— 按包目录认，不钉具体
入口文件名；钉文件名会把「产物改名」变成静默失效）。本包那两句判据 —— 这一格注册了没有、
注册成了几份 —— 共用这一条。
*/
export function slotIsNamespace(name: string, namespace: string): boolean {
  if (name === namespace) {
    return true;
  }

  const pathForm = name.replaceAll('\\', '/');
  // 去掉 `@scope/` 前缀：没有斜杠时 lastIndexOf 给 -1，slice(0) 就是原样 —— 写成一条无分支的
  // 算式，因为 `split('/').pop() ?? namespace` 那个 `??` 的兜底只有类型层面存在，运行时永远
  // 走不到，是量不到的分支。
  const unscoped = namespace.slice(namespace.lastIndexOf('/') + 1);
  const shortForm = unscoped.replace(/^docusaurus-/, '');

  return (
    pathForm.includes(`/${unscoped}/`) || pathForm.includes(`/${shortForm}/`)
  );
}

/**
两份清单里每个槽位的名字，合起来按声明顺序报名字（认不出的槽位直接略过）。
前置检查与单测共用这一条，免得两边各写一套「四种写法怎么认」。
*/
export function declaredNamespaces(declared: PluginSlots): string[] {
  return [...(declared.plugins ?? []), ...(declared.themes ?? [])]
    .map((slot) => pluginSlotName(slot))
    .filter((name): name is string => name !== undefined);
}
