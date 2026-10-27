import fs from 'node:fs';
import path from 'node:path';

/**
把源码入口里的 `/// <reference path="..." />` 搬进产物声明文件。

为什么要有这一步：TypeScript 只在**源码本身是声明文件**时才把 reference 指令写进产物
（`emitTripleSlashDirectivesIfNeeded` 判 `node.isDeclarationFile`）。`.mts` 源码里的
reference 只会留在 `dist/index.mjs` 的注释里，进不了 `dist/index.d.mts` ——
而消费方拿到的类型入口（`types` / `exports.types`）正是 `dist/index.d.mts`。
于是那份环境声明（`erdiagram` 自家没带类型）永远不生效：消费方那边
`import { ErDiagram } from 'erdiagram'` 报 TS7016。

指令以源码为准（`src/index.mts` 里那一行），路径按产物所在目录重算 —— `src/` 与
`dist/` 同级，指向的还是同一个文件。
*/

const pkgDir = path.resolve(import.meta.dirname, '..');
const sourceEntry = path.join(pkgDir, 'src', 'index.mts');
const declarationEntry = path.join(pkgDir, 'dist', 'index.d.mts');

/** 源码里的 reference 指令：只认行首独占一行的那种写法。 */
const REFERENCE = /^\/\/\/ <reference path="([^"]+)" \/>$/gm;

const source = fs.readFileSync(sourceEntry, 'utf8');
const references = source
  .matchAll(REFERENCE)
  .map((match) => match[1])
  .toArray();

const declaration = fs.readFileSync(declarationEntry, 'utf8');
// 摘掉产物里已有的那几行再重写：这份脚本可以反复跑（增量构建时 tsc 可能不重写产物）。
const body = declaration.replaceAll(
  /^(?:\/\/\/ <reference path="[^"]+" \/>\r?\n)+/gm,
  '',
);

const header = references
  .map((reference) => {
    const absolute = path.resolve(path.dirname(sourceEntry), reference);
    const relative = path.relative(path.dirname(declarationEntry), absolute);
    // 声明文件里的路径用正斜杠：产物在不同平台上都长一个样。
    return `/// <reference path="${relative.split(path.sep).join('/')}" />`;
  })
  .join('\n');

fs.writeFileSync(declarationEntry, header ? `${header}\n${body}` : body);
