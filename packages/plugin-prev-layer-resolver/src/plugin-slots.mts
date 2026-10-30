/**
「`plugins` / `themes` 里那一个槽位是不是某个包」这一条判据，加上「解析器插件自己注册了没有」
那一条前置检查。

为什么住在这一包里：这两条问的都是**本包这件事** —— 那条别名（`@theme-prev/*`）由本包提供，
所以「它在不在站点那两份清单里」这句话只有本包自己说得住。在此之前它住在
`@show-docs/docusaurus-theme-iframe` 的 `lib/` 里，于是任何想用它的层都得先引那一族层，
连带把「装了 theme-iframe」变成自己的安装前提 —— 而真正的前提只有这一个包。

这一份是**纯函数**：不引 `node:*`、不引 React、不引 DOM，也不引 core。读者都在配置期
（Node，jiti 直接吃）：各层 `loadContent()` 里那句「前置插件在不在」。纯函数也让判据本身
能在单测里直接钉，不必先建一个站点。
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
入口文件名；钉文件名会把「产物改名」变成静默失效）。各层的前置检查共用这一条。
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

/** 那一份清单里是不是注册了本包。 */
export function resolverPluginRegistered(declared: PluginSlots): boolean {
  return declaredNamespaces(declared).some((slot) =>
    slotIsNamespace(slot, PLUGIN_NAME),
  );
}

/**
检查站点的**那一条**安装前提：本包自己注册成了插件。

各主题层都在 `loadContent()` 里调用它，缺了就当场点名 —— 正常路径上缺了它，webpack 会停在
`Module not found`，报错点离真正的原因隔着一整个构建。报错里点名的是**调用方**的包名：
「谁需要本包」要说得清，站点才知道该回去看哪一层的文档。
*/
export function assertPrevLayerResolverInstalled(
  namespace: string,
  declared: PluginSlots,
): void {
  if (resolverPluginRegistered(declared)) {
    return;
  }

  throw new Error(
    `${namespace} 需要 ${PLUGIN_NAME}：所有主题的 \`@theme-prev/*\` 都由它提供别名。` +
      `请先 \`pnpm add ${PLUGIN_NAME}\`，再把它加进 \`plugins\`（一个实例即可）。`,
  );
}
