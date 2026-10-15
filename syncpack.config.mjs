// @ts-check

// 走具名导出的 `defineConfig`，不走包的 default：0.6.2 的 `index.d.mts` 把 default 声明成了
// **类型**（`export type { RcFile as default }`），运行时却是个对象 —— 于是 import 它的 default
// 会被 checkJs 判成「只指到类型」。`define.mjs` 的具名导出是真正的函数，类型没问题。
// 传 `import.meta.url` 也让它按本文件定位 package.json，而不是按 cwd。
import { defineConfig } from '@nice-move/syncpack-config/define.mjs';

export default defineConfig(import.meta.url, {});
