import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from '@docusaurus/types';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

/**
本地主题插件 B：同样提供 Logo 覆盖
*/
export default function themeB(): Plugin {
  return {
    name: 'theme-b',
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
