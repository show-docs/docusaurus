import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

/**
本地主题插件 BASE：那条链的**链底** —— 组件本体就在这一层。

它是链上唯一不包裹别人的那一层：`theme-a` 的 `@theme-prev/ChainDemo` 落到这里，所以链底有实现
（没有实现的链底会回落官方解析，真实的 Module not found）。这一层不套标记，也不带样式表 ——
链上看得见的四道彩色虚线是上面四层（theme-a/b/c 与站点 `src/theme`）的。
*/
export default function themeBase(): Plugin {
  return {
    name: 'theme-base',
    getThemePath() {
      return path.resolve(thisDir, './theme');
    },
  };
}
