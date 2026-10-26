import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

/**
本地主题插件 C：第三层覆盖 DocCardList，用于验证链式覆盖可任意加长
*/
export default function themeC(): Plugin {
  return {
    name: 'theme-c',
    getThemePath() {
      return path.resolve(thisDir, './theme');
    },
    // Docusaurus 的 swizzle / TS 主题支持会用到这个可选导出
    getTypeScriptThemePath() {
      return path.resolve(thisDir, './theme');
    },
    // 本层那道彩色虚线：样式表交给站点的样式表管线，只在主页那张卡片列表外面出现
    getClientModules() {
      return [path.resolve(thisDir, './styles/layer-c.css')];
    },
  };
}
