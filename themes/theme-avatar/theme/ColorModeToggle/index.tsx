/**
本层覆盖的那一格：亮暗切换（`ColorModeToggle`）。它把官方那一份原样渲染，
只在它后面多摆一颗头像。

这一份是**源码**，由用它的站点编译；`PLUGIN_NAME` 那一份字符串与 `src/config.mts` 里那个是
同一格的两处写法（浏览器侧不能再引 `src/`，那里是 Node 侧的编译产物），所以
`test/package-entries.test.mts` 里配了一条读原文回对的测试：两处漂了，头像就在导航栏里静默消失。

这里用 `@theme-init`（官方别名）而不是 `@theme-prev`：仓库里只有本层提供这个组件，
没有要串的链 —— 判据与例外见仓库根 README 的「基础设施包」一节。
*/

import ColorModeToggle from '@theme-init/ColorModeToggle';

import type { ReactNode } from 'react';

import { usePluginData } from '@docusaurus/useGlobalData';

import { Avatar } from '../../components/avatar.tsx';
import type { AvatarConfig } from '../../types/avatar-config.ts';

/** 配置期那份配置在全局数据里的那一格键名，就是插件名。 */
const PLUGIN_NAME = '@show-docs/docusaurus-theme-avatar';

type Props = Record<string, unknown>;

export default function ColorModeToggleWrapper(props: Props): ReactNode {
  // 站点没把这个包装成插件时，这一格是 `undefined`：切换按钮照旧，头像不出现。
  const config = usePluginData(PLUGIN_NAME) as AvatarConfig | undefined;

  return (
    <>
      <ColorModeToggle {...props} />
      {config && <Avatar config={config} />}
    </>
  );
}
