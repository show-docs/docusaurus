/**
外层文档页里那一个通用框：`render: 'iframe'` 的规则命中后由 `theme/DocItem` 挂上这里。

框里是本层自己注册的那条独立文档（地址见 `../lib/frame-route.ts`），组件按送进去的**登记名**
挑选（`theme/ComponentFramePage` 那份表），所以这一格只剩三样：一个 `<iframe>`、一份要送出去的
数据、一条握手循环（`../lib/frame-sync.tsx`，那条循环与踩过的坑记在它头上和 `docs/iframe-protocol.md`）。

**这里不 import 任何业务组件**：那条规则引用的渲染器只在框内那份文档里被 `import`，父文档
下载的是这一格与它自己那半张表。

数据的形状只有一条规矩：**能写成 JSON 的才送得出去**（`../lib/frame-messages.ts` 的
`frameDataError`）。这一格在外层就挡，而不是等浏览器在 `postMessage` 那一步抛 —— 那种抛发生在
另一份文档里，报错点离真正的原因隔着一整个页面。挡下来时给一条看得见的说明，不渲染一个空框，
也不静默删掉送不出的那一格。
*/

import './component-frame.css';

import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Admonition from '@theme/Admonition';

import {
  frameDataError,
  frameInitPayload,
  type FrameColorMode,
} from '../lib/frame-messages.ts';
import { COMPONENT_FRAME_ROUTE } from '../lib/frame-route.ts';
import { useFrameHandshake } from '../lib/frame-sync.tsx';
import { frameRouteUrl } from '../lib/frame-url.ts';
import type { ComponentPageValue } from '../types/component-page.ts';

type Props = {
  /** 那条规则引用的登记名：框里那份文档按它查组件。 */
  componentId: string;
  /** 命中的那把键写下的值。 */
  value: ComponentPageValue;
  /** 这一页的 frontmatter 整份（也是框的无障碍标题的来源）。 */
  frontMatter?: Record<string, unknown>;
  /** 规则里 `props` 那一格：每一页共用的静态入参。 */
  props?: Record<string, unknown>;
};

/** 框的无障碍标题：页面自己写了 `title` 就用它，否则一个通用说法。 */
function frameTitle(frontMatter: Record<string, unknown> | undefined): string {
  const { title } = frontMatter ?? {};

  return typeof title === 'string' && title !== '' ? title : '文档';
}

/**
这一页要送进框里的那一份数据：`props` 垫底、本页那两份盖在上面，次序与 `page` 那一侧同一条
（都在 `frameInitPayload()` 里，不在这里写第二份）。

`content` 那一格不在其中：它是 React 组件，本来就送不出这份文档。
*/
export function ComponentFrame({
  componentId,
  value,
  frontMatter,
  props,
}: Props): ReactNode {
  // 三份本页事实并成的那一份要**引用稳定**：它排在握手那条 effect 的依赖里，每次渲染换新对象
  // 就等于每帧重推一轮、重装一遍监听器。`frontMatter` 与 `props` 都是模块级对象（MDX 编译产物
  // 与生成的规则表里那一格），同一次导航之间引用不变，所以排进依赖是够的；`value` 是串 / 布尔 /
  // frontmatter 里那个选项对象，同样稳定。
  const data = useMemo(
    () => frameInitPayload(value, frontMatter, props),
    [value, frontMatter, props],
  );

  const illegal = frameDataError(data);

  if (illegal !== undefined) {
    return (
      <Admonition title="这一页的数据送不进框里" type="danger">
        {`theme-component-page：${illegal}。 \`render: 'iframe'\` 只送 JSON 写得出来的东西：把那一格换成纯数据，或者让这条规则写 \`render: 'page'\`（那样它就在文档里渲染，什么都不用送）。`}
      </Admonition>
    );
  }

  return (
    <FrameElement
      componentId={componentId}
      data={data}
      title={frameTitle(frontMatter)}
    />
  );
}

/** 数据合法时才挂上去的那一格：`<iframe>` 本身与那条握手循环。 */
function FrameElement({
  componentId,
  data,
  title,
}: {
  componentId: string;
  data: Record<string, unknown>;
  title: string;
}): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const { colorMode } = useColorMode();
  const frameRef = useRef<HTMLIFrameElement>(null);

  // 地址里不写查询参数：那一份数据靠消息送，所以这个 `src` 只跟站点走，服务端与客户端算出
  // 完全一样的字符串（`frameRouteUrl` 那几条理由，含尾斜杠为什么不能省）。
  const src = frameRouteUrl({
    baseUrl: siteConfig.baseUrl,
    route: COMPONENT_FRAME_ROUTE,
    trailingSlash: siteConfig.trailingSlash,
  });

  const payload = useMemo(() => ({ componentId, data }), [componentId, data]);

  useFrameHandshake({
    colorMode: colorMode as FrameColorMode,
    frameRef,
    payload,
  });

  return (
    <iframe
      ref={frameRef}
      className="component-frame"
      src={src}
      title={title}
    />
  );
}
