/**
Scalar 这一层自己那两把 spec 键：`oas3:` 摆 OpenAPI，`aas3:` 摆 AsyncAPI 3。

**这两把键的名字与先后只属于本层**（另两条 API 层各读同一组键、各有各的一份说法，机制层不认识
它们）：`scalar: true` 只说「这一页归 Scalar 渲染」，要渲染哪份文档由这里那组键里**第一把非空**
的决定，两把都写时 `oas3:` 赢。顺序是判定顺序，不按文档类型猜。

读法走 component-page 那份共用辅助（`writtenValues` / `firstWrittenValue`）：三条层抄同一串
`Object.hasOwn` 与「非空文本」的判据，早晚会各漂一次。地址那一条口径也共用（`httpUrlOf`）：
只认解析得成 `http:` / `https:` 的，`javascript:` 那种喂不进去；相对写法按本份文档的 origin
展开，https 页面上的 `http:` 升成 https（混合内容必被拦）。

不引 React、不引 DOM：`theme/ScalarView` 与单测引同一份。
*/

import { httpUrlOf } from '@show-docs/docusaurus-theme-component-page/lib/frame-url.ts';
import {
  firstWrittenValue,
  writtenValues,
} from '@show-docs/docusaurus-theme-component-page/lib/frontmatter-values.ts';

/** 给 spec 地址的那两把键，**按优先级排列**（`oas3` 在前、`aas3` 在后）。 */
export const SPEC_KEYS: readonly string[] = ['oas3', 'aas3'];

/** 告警里那两把键的写法：`` `oas3:` / `aas3:` ``。 */
function specKeyLabels(): string {
  return SPEC_KEYS.map((key) => `\`${key}:\``).join(' / ');
}

/**
这一页要渲染的那份文档的地址：那两把键里第一把非空的值，再按 `origin` 展开成能用的绝对地址。

没写、或写的不是地址（`javascript:` 那种）都交回 `undefined` —— 由调用方摆一条看得见的说明，
本层不把那种值交给渲染器。
*/
export function scalarSpecUrl(
  frontMatter: Record<string, unknown> | undefined,
  origin: string,
): string | undefined {
  return httpUrlOf(firstWrittenValue(frontMatter, SPEC_KEYS)?.value, origin);
}

/**
这一页两把 spec 键都写时的说明。

一把都没写那种不在这里：那是框里一条看得见的说明（`theme/ScalarView` 摆出来的），不必再往
控制台写第二遍。页面地址也不在这里说：这一份跑在框内那份文档里，读不到外层那条页面的路径，
而这句话说的就是眼前这一页。
*/
export function scalarSpecWarnings(
  frontMatter: Record<string, unknown> | undefined,
): readonly string[] {
  const written = writtenValues(frontMatter, SPEC_KEYS);

  return written.length > 1
    ? [
        `Scalar：这一页的 spec 键写了不止一把（${specKeyLabels()}），按先后只用 \`${written[0]?.key}:\` 给的地址，其余被忽略 —— 两把都写通常是手误。`,
      ]
    : [];
}
