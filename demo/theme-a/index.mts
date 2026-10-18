import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from '@docusaurus/types';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

/**
本地主题插件 A：覆盖 DocCardList，是那条链的第一层插件主题
*/
export default function themeA(): Plugin {
  return {
    name: 'theme-a',
    getThemePath() {
      return path.resolve(thisDir, './theme');
    },
    // Docusaurus 的 swizzle / TS 主题支持会用到这个可选导出
    getTypeScriptThemePath() {
      return path.resolve(thisDir, './theme');
    },
    getClientModules() {
      return [];
    },
  };
}
