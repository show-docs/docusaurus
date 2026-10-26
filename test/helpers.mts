import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCoreModule } from '../packages/plugin-prev-layer-resolver/src/layers.mts';
import type {
  DocusaurusPluginLike,
  ThemeLayer,
} from '../packages/plugin-prev-layer-resolver/src/types.mts';

/**
类型出口：夹具文件同时是测试面取核心包类型的**唯一入口**，
各契约面文件不必再各自写一遍那个长路径 —— 路径少写一次，体积预算也少花一次。
*/
export type { DocusaurusPluginLike, ThemeLayer };

/**
一个「可被 extends」的类构造签名。`PrevLayerResolverPlugin` 的实例类型不必显式写出：
调用方传进来的 `T` 决定了返回类型。
*/
type Constructor = new (...args: never[]) => {
  findTargetLayerIndex(...args: never[]): number;
};

/**
这台机器能不能建软链：判据是真的建一次，不猜平台。
Windows 没开「开发者模式」时恒 `EPERM`（与被测逻辑无关），Linux CI 恒 `true`。
*/
export const canSymlink: boolean = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-capability-'));
  try {
    const real = path.join(dir, 'real');
    fs.mkdirSync(real);
    fs.symlinkSync(real, path.join(dir, 'link'), 'dir');
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();

export interface FixtureSite {
  root: string;
  /**
  新建一个主题层，components: { 'Logo': '文件内容' }
  */
  layer(name: string, components?: Record<string, string>): ThemeLayer;
  /**
  站点层 src/theme
  */
  siteLayer(components?: Record<string, string>): ThemeLayer;
  /**
  造一个假的 `@docusaurus/core` 安装位置（只需 `lib/webpack/aliases/index.js`
  与 `lib/client/theme-fallback` 两个路径存在），并让站点 `require` 解析到它。
  
  `resolveFallbackDir` 现在跟着 core 模块位置推 theme-fallback（不再从别名表反查），
  因此测试需要这个「假的 core」。
  
  @returns 推导出的 theme-fallback 目录绝对路径
  */
  fakeCoreFallback(): string;
  cleanup(): void;
}

/**
建一个临时目录，并**当场 realpath** 再返回。

macOS 的 `os.tmpdir()` 是 `/var/folders/…`，真实路径是 `/private/var/folders/…`
（`/var` 是指向 `/private/var` 的符号链接）。被测代码两侧都按 realpath 比路径：
`normalizeLayerPath` 归一层 owner，`findIssuerLayerIndex` 归一 issuer 与层 owner。
夹具若持有未归一的原路径，「文件存在」的 issuer（realpath 成功）与「文件不存在」的
issuer（realpath 抛错、退回 `resolve`）会落进两个命名空间，层归属判定在 macOS 上
全判错（`/var/…` 前缀永远匹配不上 `/private/var/…` 的层）。
在入口归一一次，后续所有拼接天然同口径；Linux 上 tmpdir 无符号链接，是恒等变换。

Windows 上要用 `realpathSync.native`而不是普通版：普通版不展开 8.3 短名，而 GitHub 的
windows runner 把 `%TEMP%` 就给成短名形式（`C:\Users\RUNNER~1\AppData\Local\Temp`，账户目录
`runneradmin` 有短名别名），普通 realpath 于是**保住**那个短名。git 走的是自己的那一套，
恒展开成长名（实测同一个目录：`realpathSync` 给 `PROBE-~1`、`realpathSync.native` 与
`git rev-parse --show-toplevel` 都给 `probe-83-longfoldername`）。开发机
（`C:\Users\Eric`，无空格、无短名别名）看不出差别，只有 CI 上会红 —— 而 `theme-diff` 那两组
用例把夹具路径与 git 的输出直接比，两边必须同一种写法。
*/
export function mkdtempReal(prefix: string): string {
  return fs.realpathSync.native(fs.mkdtempSync(prefix));
}

/**
造一个临时站点骨架：root 下 layers/<name>/<Component>/index.js
*/
export function makeFixtureSite(): FixtureSite {
  const root = mkdtempReal(path.join(os.tmpdir(), 'prev-layer-fixture-'));
  const writeComponents = (
    owner: string,
    components: Record<string, string>,
  ): void => {
    for (const [component, content] of Object.entries(components)) {
      const file = path.join(owner, component, 'index.js');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content ?? 'export default function C() {}\n');
    }
    fs.mkdirSync(owner, { recursive: true });
  };

  return {
    root,
    layer(name, components = {}) {
      const owner = path.join(root, 'layers', name);
      writeComponents(owner, components);
      return { name, owner, kind: 'plugin', exists: true };
    },
    siteLayer(components = {}) {
      const owner = path.join(root, 'src', 'theme');
      writeComponents(owner, components);
      return { name: 'site:src/theme', owner, kind: 'site', exists: true };
    },
    fakeCoreFallback() {
      // 与真实 core 同构：<core>/lib/webpack/aliases/index.js
      // 与 <core>/lib/client/theme-fallback/（后者由 resolveFallbackDir 推导）
      const lib = path.join(root, 'node_modules', '@docusaurus', 'core', 'lib');
      fs.mkdirSync(path.join(lib, 'webpack', 'aliases'), { recursive: true });
      fs.writeFileSync(
        path.join(lib, 'webpack', 'aliases', 'index.js'),
        '// fake core anchor\n',
      );
      const fallback = path.join(lib, 'client', 'theme-fallback');
      fs.mkdirSync(fallback, { recursive: true });
      fs.writeFileSync(
        path.join(root, 'node_modules', '@docusaurus', 'core', 'package.json'),
        JSON.stringify({
          name: '@docusaurus/core',
          version: '3.10.0',
          main: 'lib/index.js',
        }),
      );
      return fallback;
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
往站点里放一份**只有该站点看得见**的 `@docusaurus/utils`，挂在它的 core 下 ——
pnpm 下 `@docusaurus/utils` 被隔离在 `.pnpm/` 里，站点根放一份 core 是看不到的。
用它替代「改**真实** utils 的文件」（那是共享副作用，「谁先读到」会变成执行顺序）。

@param constantsSource `lib/constants.js` 的内容
*/
export function fakeUtils(siteDir: string, constantsSource: string): void {
  const pkg = path.join(
    siteDir,
    'node_modules',
    '@docusaurus',
    'core',
    'node_modules',
    '@docusaurus',
    'utils',
  );
  fs.mkdirSync(path.join(pkg, 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({ name: '@docusaurus/utils', main: 'lib/index.js' }),
  );
  fs.writeFileSync(path.join(pkg, 'lib', 'constants.js'), constantsSource);
  // 入口只转 `THEME_PATH` 一条（官方入口是一份 Object.defineProperty 表格）。
  fs.writeFileSync(
    path.join(pkg, 'lib', 'index.js'),
    `const c = require('./constants');\nexports.THEME_PATH = c.THEME_PATH;\n`,
  );
}

/**
造一个「像 plugin 实例」的对象
*/
export function fakePlugin(name: string, owner: string): DocusaurusPluginLike {
  return { name, path: path.dirname(owner), getThemePath: () => owner };
}

/**
造一个能真正跑一遍官方插件加载路径的站点：真实 config + 真实插件包，每个插件在模块顶层与
构造函数里各记一笔到 `globalThis`，于是计数是实际求值次数。必须建在**仓库树内**
（`discoverPlugins` 靠上溯找 `node_modules/@docusaurus/core`）。
*/
export interface PluginSite {
  siteDir: string;
  /**
  继续加一个插件；`ext` 决定 ESM / CJS，两者顶层求值次数口径不同
  */
  add(name: string, ext: '.mjs' | '.cjs'): PluginSite;
  /**
  加一个「自定义入口源码」的 CJS 插件（用来造构造抛错这类插件）
  */
  addRaw(name: string, body: string): PluginSite;
  /**
  计数器的 globalThis 键名
  */
  counters: { load(plugin: string): string; construct(plugin: string): string };
  cleanup(): void;
}

export function makePluginSite(name: string, ext: '.mjs' | '.cjs'): PluginSite {
  // `.temp/` 被 .gitignore 忽略，干净 checkout 里不存在；而 `mkdtempSync` 只建最后一级、
  // 不建父目录 —— 于是整个文件在 CI 上必 ENOENT（开发机有历史残留的 `.temp/`，看不出问题）。
  // 夹具站点又必须留在仓库树内（`discoverPlugins` 靠上溯找 `node_modules/@docusaurus/core`），
  // 所以用之前先把父目录建出来。
  const tempRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '.temp',
  );
  fs.mkdirSync(tempRoot, { recursive: true });
  const root = mkdtempReal(path.join(tempRoot, 'plugin-site-'));
  const siteDir = path.join(root, 'site');
  const names: string[] = [];
  const key = (plugin: string, kind: 'Load' | 'Ctor'): string =>
    `__${plugin.replaceAll(/[^a-z0-9]/gi, '_')}${kind}`;
  const site: PluginSite = {
    siteDir,
    counters: { load: (p) => key(p, 'Load'), construct: (p) => key(p, 'Ctor') },
    add(plugin, pluginExt) {
      const pkg = path.join(siteDir, 'node_modules', plugin);
      fs.mkdirSync(path.join(pkg, 'theme', 'Logo'), { recursive: true });
      const body =
        `globalThis.${key(plugin, 'Load')} = (globalThis.${key(plugin, 'Load')} || 0) + 1;\n` +
        `const factory = () => {\n  globalThis.${key(plugin, 'Ctor')} = (globalThis.${key(plugin, 'Ctor')} || 0) + 1;\n` +
        `  return { name: ${JSON.stringify(plugin)}, getThemePath: () => './theme' };\n};\n${
          pluginExt === '.mjs'
            ? 'export default factory;\n'
            : 'module.exports = factory;\n'
        }`;
      fs.writeFileSync(path.join(pkg, `index${pluginExt}`), body);
      fs.writeFileSync(
        path.join(pkg, 'theme', 'Logo', 'index.js'),
        'export default 1;\n',
      );
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          name: plugin,
          version: '1.0.0',
          main: `index${pluginExt}`,
        }),
      );
      names.push(plugin);
      fs.writeFileSync(
        path.join(siteDir, 'docusaurus.config.mjs'),
        `export default { title: 'fixture', url: 'https://example.com', baseUrl: '/', plugins: ${JSON.stringify(names)} };\n`,
      );
      return site;
    },
    addRaw(plugin, body) {
      const pkg = path.join(siteDir, 'node_modules', plugin);
      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, 'index.js'), body);
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({ name: plugin, version: '1.0.0', main: 'index.js' }),
      );
      names.push(plugin);
      fs.writeFileSync(
        path.join(siteDir, 'docusaurus.config.mjs'),
        `export default { title: 'fixture', url: 'https://example.com', baseUrl: '/', plugins: ${JSON.stringify(names)} };\n`,
      );
      return site;
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return site.add(name, ext);
}

/**
造一份假 `@docusaurus/core`：复制真实 `lib/`，只换 `server/site.js` 与
`server/plugins/configs.js` 两个入口，让站点解析到它（而不是真实 core）。

两个坑（复制而不是原地改 / 需要真实 core 当模板）见调用点注释；这里只负责造。
@returns 假 core 包目录（调用方可继续改它的 package.json）
*/
export function fakeCore(
  siteDir: string,
  entries: { site: string; configs: string },
): string {
  const realSite = resolveCoreModule(process.cwd(), 'server/site.js');
  if (!realSite) throw new Error('测试前提：必须能定位到真实 @docusaurus/core');
  const realRoot = path.resolve(realSite, '..', '..', '..');
  const target = path.join(siteDir, 'node_modules', '@docusaurus', 'core');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(path.join(realRoot, 'lib'), path.join(target, 'lib'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(target, 'package.json'),
    JSON.stringify({ name: '@docusaurus/core', version: '3.10.2' }),
  );
  const overrides: Record<string, string> = {
    'server/site.js': entries.site,
    'server/plugins/configs.js': entries.configs,
  };
  for (const [name, source] of Object.entries(overrides))
    fs.writeFileSync(path.join(target, 'lib', name), source);
  return target;
}

/**
用「构造前替换」的方式伪造 `findTargetLayerIndex` 的返回值。

实例化之后再 `vi.spyOn` / 赋值是**无效**的：`resolutionCache` 会先返回上一次的结果，
同一组 `specifier|组件|issuer` 解析过一次后那个方法就再也不会被调用（用例看着绿、
其实什么也没验证）。子类从一开始就走自己的实现，`computeTarget` 里的判据照常生效。

基类由调用方给：三个契约面文件都已经把 `PrevLayerResolverPlugin` 取了进来，
这里只要它们的**类型**，不必再 import 一次同一个模块。
*/
export function withFixedTarget<T extends Constructor>(
  Base: T,
  badTarget: number,
): T {
  return class extends (Base as Constructor) {
    override findTargetLayerIndex(): number {
      return badTarget;
    }
  } as unknown as T;
}

export const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
收集告警的 logger：用例断言 `warns`，把 `logger` 交给被测对象。

首参统一 `String()`：被测代码有的直接传串、有的把 Error / 对象拼进消息，断言只看文本。
*/
export function warnSink(): {
  warns: string[];
  logger: { warn: (...args: unknown[]) => void };
} {
  const warns: string[] = [];
  return {
    warns,
    logger: {
      warn: (...args: unknown[]) => {
        warns.push(String(args[0]));
      },
    },
  };
}
