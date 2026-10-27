import { exec } from 'node:child_process';
import fs from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import theme, { validateOptions } from '../packages/theme-erd/src/index.mts';
import loader from '../packages/theme-erd/src/loader/dbml-loader.mts';
import {
  normalizeExports,
  planExports,
  resolveExportModule,
} from '../packages/theme-erd/src/options.mts';
import type { DbmlModel, ErdExport } from '../packages/theme-erd/src/types.mts';

/**
## theme-erd 的构建期判据

这一层把一份 `.dbml` 编译成「关系图 + 一份份导出」：枚举列怎么写、表格那两段怎么落，以及
**模板页那一串页签到底装载谁** —— 后者完全由插件 options 的 `exports` 决定，每一项是一个
外接模块路径；本包不随带任何模板，站点不配就只有 `@dbml/core` 自己那四个格式。

这一段没有浏览器参与，`pnpm build` 全绿也证明不了它算得对 —— 只有单测能量；页面上那张图和
那串页签对不对，由 `test/e2e/features/erd.feature` 钉。

夹具用的是**真的 DBML 原文**，模型由本包那条 loader 现算（`export const dbml_json` 那一格），
不自己手写假模型，也不另外引 `@dbml/core`：这一层最容易坏的地方恰恰是「dbml 的哪种写法解析出
什么形状」，把解析换成别的口径等于把判据替掉。
*/

/** 站点上那份示例页，也是这一层每天真实吃进去的那一份输入。 */
const demoDbml = fs.readFileSync(
  new URL('../packages/theme-erd/docs/erd-demo.dbml', import.meta.url),
  'utf8',
);

/** 各种写法集中在一份里：两种枚举（两个值 / 三个值）、`record_time`、以及一张什么都没有的表。 */
const wideDbml = `
Enum gender {
  male [note: '男']
  female [note: '女']
}

Enum organization_type {
  company [note: '企业']
  person [note: '个人']
  other [note: '其他']
}

Table accounts {
  id integer [pk]
  batch_id varchar(32) [note: '批次']
  serial_number varchar(32)
  user_id integer
  org_id integer
  area_id integer
  duration integer
  shop_id integer
  avatar_url varchar(256)
  gender gender [note: '性别']
  active bool [not null]
  born date
  wake time
  record_time timestamp [note: '记录时刻']
  organization_type organization_type
}

Table logs {
  id integer [pk, increment]
  message varchar(255)
  create_time timestamp
}
`;

/** 只有表、没有枚举；`memo` 那一行什么约束都不带。 */
const plainDbml = `
Table plain {
  id integer [pk]
  name varchar(16)
  memo text
}
`;

/** 只有枚举、没有表。 */
const enumOnlyDbml = `
Enum single {
  one [note: '一']
}
`;

/** 一次 loader 调用的产出：交回 webpack 的内容、`callback` 的第一个参数、以及登记进来的缓存依赖。 */
interface LoaderRun {
  output: string | null;
  error: unknown;
  dependencies: string[];
}

/** 外接生成器夹具的绝对路径（`test/fixtures/erd-generators/`）。 */
function fixtureModule(name: string): string {
  return fileURLToPath(
    new URL(`./fixtures/erd-generators/${name}.mjs`, import.meta.url),
  );
}

/** 站点自己那一份示例模板（`erd/table-names.mjs`）的绝对路径 —— 真接线用的就是它。 */
const siteExample = fileURLToPath(
  new URL('../erd/table-names.mjs', import.meta.url),
);

function spec(
  id: string,
  label: string,
  lang: string,
  module: string,
): ErdExport {
  return { id, label, lang, module };
}

/**
用一个假的 loader 上下文跑一遍本包那条 loader。

真实上下文由 webpack 逐次构造，这一层用到 `cacheable` / `async` / `getOptions` /
`addDependency` 四件 —— `.dbml` 原文是 webpack 读进来传下来的，loader 自己不碰磁盘，
只有装载外接生成器那一步走 Node 的 `import()`。
*/
function runLoader(
  dbml: string,
  exports: ErdExport[] = [],
): Promise<LoaderRun> {
  const dependencies: string[] = [];

  return new Promise((resolve) => {
    const context = {
      cacheable: () => undefined,
      getOptions: () => ({ exports }),
      addDependency: (file: string) => {
        dependencies.push(file);
      },
      async: () => (error: Error | null, source?: string) => {
        resolve({
          output: source ?? null,
          error: error ?? null,
          dependencies,
        });
      },
    };

    loader.call(context as never, dbml);
  });
}

/**
只问产物：跑一遍 loader，交出 webpack 收到的那段 MDX。

顺带钉住「这一次调用没报错」——报错时产物是 `null`，用例就会看到一段空字符串，
不如在这里先红得明白。
*/
async function runOutput(
  dbml: string,
  exports: ErdExport[] = [],
): Promise<string> {
  const run = await runLoader(dbml, exports);
  expect(run.error).toBeNull();
  return run.output ?? '';
}

/** 解析器抛的那一份：不是 `Error`，是一串带行列的诊断。 */
interface ParseFailure {
  diags: {
    message: string;
    location: { start: { line: number; column: number } };
  }[];
}

/** 产物里那条 `export const dbml_json`：JSON 是带换行的，按首尾标志切出来。 */
function exportedJson(output: string): DbmlModel {
  const marker = 'export const dbml_json = ';
  const start = output.indexOf(marker) + marker.length;
  const end = output.indexOf('};\n', start);
  expect(end, '产物里该有一条 `export const dbml_json`').toBeGreaterThan(start);
  return JSON.parse(output.slice(start, end + 1)) as DbmlModel;
}

describe('一份 .dbml 编译成 MDX', () => {
  it('示例页那份配上站点那一条清单：四个固定格式加模板页那一格，头部 frontmatter 不进产物', async () => {
    const output = await runOutput(demoDbml, [
      spec('table-names', '表清单', 'text', siteExample),
    ]);

    // 站点自己的标题、说明、侧栏名留在文件头上给 Docusaurus 读，这一层不再往产物里写第二段
    // frontmatter —— 于是那一页的 `<h1>` 就是那份 `title:`，跟别的文档页同一个样子。
    expect(output.startsWith('---')).toBe(false);
    expect(output).not.toContain('hide_title');
    expect(output).not.toContain('sidebar_position');

    for (const value of [
      'dbml',
      'mysql',
      'postgresql',
      'json',
      'table-names',
    ]) {
      expect(output).toContain(`<TabItem value="${value}"`);
    }

    // 关系图读的就是这条导出：它必须能原样解析回一份模型
    const model = exportedJson(output);
    expect(
      (Object.values(model.tables) as { name: string }[]).map(
        ({ name }) => name,
      ),
    ).toEqual(['users', 'orders']);
  });

  it('表格里给出主键、约束与默认值', async () => {
    const output = await runOutput(demoDbml);
    expect(output).toContain('## 枚举');
    expect(output).toContain('### order_status');
    expect(output).toContain('## 表');
    expect(output).toContain('### users');
    expect(output).toContain('id 🔑');
    expect(output).toContain('pending');
  });

  it('不带头部 frontmatter 的 dbml 也照样编译', async () => {
    const run = await runLoader(wideDbml);
    expect(run.error).toBeNull();
    expect(run.output).toContain('### accounts');
  });

  it('只有枚举、没有表：表格那一段整个省掉', async () => {
    const output = await runOutput(enumOnlyDbml);
    expect(output).toContain('## 枚举');
    expect(output).not.toContain('## 表');
  });

  it('只有表、没有枚举：枚举那一段整个省掉', async () => {
    const output = await runOutput(plainDbml);
    expect(output).not.toContain('## 枚举');
    expect(output).toContain('## 表');
    expect(output).toContain('### plain');
  });

  it('DBML 语法错：不产出内容，把解析器那份诊断交回 webpack', async () => {
    const run = await runLoader('Table broken {');
    expect(run.output).toBeNull();
    // 钉住现状：`@dbml/core` 抛的**不是** `Error`，而是 `{ diags: [{ message, location }] }`。
    // 换成一条 `Error` 是改行为（构建里那句消息会跟着变），先记下这份形状。
    const failure = run.error as ParseFailure;
    expect(failure.diags).toHaveLength(1);
    expect(failure.diags[0]!.message).toContain('}');
    expect(failure.diags[0]!.location.start.line).toBeGreaterThan(0);
  });
});

describe('枚举列的写法', () => {
  it('值少于三个：直接把值列出来', async () => {
    const output = await runOutput(wideDbml);
    expect(output).toContain('male/female [枚举]');
  });

  it('值三个及以上：只写枚举名', async () => {
    const output = await runOutput(wideDbml);
    expect(output).toContain('organization_type [枚举]');
    expect(output).not.toContain('company/person/other');
  });

  it('示例页里的 order_status 走的正是「只写枚举名」那一条', async () => {
    const output = await runOutput(demoDbml);
    expect(output).toContain('order_status [枚举]');
  });
});

describe('模板页那一串由配置决定', () => {
  it('不配清单时只剩 `@dbml/core` 自己那四个格式，模板页一格都没有', async () => {
    const output = await runOutput(demoDbml);
    for (const value of ['dbml', 'mysql', 'postgresql', 'json']) {
      expect(output).toContain(`<TabItem value="${value}"`);
    }

    // 本包不随带模板：不配就是这四格，一格也不多
    expect(output.match(/<TabItem value=/g)).toHaveLength(4);
  });

  it('外接一个模块就多一个页签，排在固定四个之后', async () => {
    const output = await runOutput(wideDbml, [
      spec('table-count', '表清单', 'md', fixtureModule('table-count')),
    ]);

    expect(output).toContain('<TabItem value="table-count" label="表清单"');
    expect(output).toContain('# 这份 schema 里有 2 张表');
    expect(output.indexOf('<TabItem value="json"')).toBeLessThan(
      output.indexOf('<TabItem value="table-count"'),
    );
  });

  it('生成器同时拿到归一化模型与摘掉 frontmatter 的原文', async () => {
    const output = await runOutput(
      `---\ntitle: 站点自己的标题\n---\n\n${plainDbml}`,
      [spec('table-count', '表清单', 'md', fixtureModule('table-count'))],
    );

    // 原文那一格是行数（夹具里数了一遍），站点那段 frontmatter 不该混进来
    expect(output).toContain('// 原文 5 行');
    expect(output).not.toContain('站点自己的标题');
  });

  it('两条以上按声明顺序排，清单里写谁就出谁', async () => {
    const output = await runOutput(plainDbml, [
      spec('table-names', '表清单', 'text', siteExample),
      spec('table-count', '数一数', 'md', fixtureModule('table-count')),
    ]);

    expect(output.indexOf('<TabItem value="table-names"')).toBeLessThan(
      output.indexOf('<TabItem value="table-count"'),
    );
  });

  it('每一项生成器都登记成缓存依赖：改了外接模块，这一页要重算', async () => {
    const modules = [fixtureModule('table-count'), siteExample];
    const run = await runLoader(
      plainDbml,
      modules.map((module, index) =>
        spec(`t${index}`, `第${index}页`, 'md', module),
      ),
    );

    expect(run.dependencies).toEqual(modules);
  });

  it('模块装不上：报错点名到那个页签，这一页不出产物', async () => {
    const missing = fixtureModule('这里没有这份文件');
    const run = await runLoader(plainDbml, [
      spec('gone', '不存在的格式', 'md', missing),
    ]);

    expect(run.output).toBeNull();
    const { message } = run.error as Error;
    expect(message).toContain('装不上');
    expect(message).toContain('不存在的格式');
    expect(message).toContain('gone');
  });

  it('装上了但没按契约导出默认函数', async () => {
    const run = await runLoader(plainDbml, [
      spec('bad', '契约不对', 'md', fixtureModule('no-default')),
    ]);

    expect((run.error as Error).message).toContain('没有默认导出一个函数');
    expect((run.error as Error).message).toContain('契约不对');
  });

  it('生成器抛 Error：把那句原因挂在页签名下面', async () => {
    const run = await runLoader(plainDbml, [
      spec('boom', '会失败的格式', 'md', fixtureModule('throws-error')),
    ]);

    const { message } = run.error as Error;
    expect(message).toContain('跑失败了');
    expect(message).toContain('会失败的格式');
    expect(message).toContain('这份模型里没有 record_date');
  });

  it('生成器抛的不是 Error：也落出一句可读的消息，不是 [object Object]', async () => {
    const run = await runLoader(plainDbml, [
      spec('plain', '抛字符串', 'md', fixtureModule('throws-plain')),
    ]);

    const { message } = run.error as Error;
    expect(message).toContain('跑失败了：这份模型里没有我要的字段');
    expect(message).not.toContain('[object Object]');
  });

  it('站点自己那一份示例模板：拿到的就是归一化模型，落一张表一行', async () => {
    const output = await runOutput(demoDbml, [
      spec('table-names', '表清单', 'text', siteExample),
    ]);

    expect(output).toContain('users：4 列');
    expect(output).toContain('orders：6 列');
  });
});

describe('配置清单的判据', () => {
  const good = spec('x', 'X', 'md', './x.mjs');

  it('整条接过来，四件都在', () => {
    expect(normalizeExports([good])).toEqual([good]);
  });

  it('不是数组：当场红，不等构建期', () => {
    expect(() => normalizeExports('./x.mjs')).toThrow(/exports 要一个数组/);
  });

  it('条目不是对象', () => {
    expect(() => normalizeExports([3])).toThrow(/exports\[0\] 要一个对象/);
    expect(() => normalizeExports([null])).toThrow(/拿到的是 null/);
  });

  it('四件里少任何一件、或写成非字符串', () => {
    for (const field of ['id', 'label', 'lang', 'module'] as const) {
      expect(() => normalizeExports([{ ...good, [field]: undefined }])).toThrow(
        new RegExp(String.raw`exports\[0]\.${field} 要一个字符串`),
      );
    }

    expect(() => normalizeExports([{ ...good, id: 7 }])).toThrow(
      /exports\[0\]\.id 要一个字符串，拿到的是 number/,
    );
  });

  it('空串也算没写', () => {
    expect(() => normalizeExports([{ ...good, label: '' }])).toThrow(
      /exports\[0\]\.label 不能是空串/,
    );
  });

  it('id 撞车：页签 value 必须唯一', () => {
    expect(() => normalizeExports([good, good])).toThrow(
      /id「x」和前面某一条撞了/,
    );
  });
});

describe('module 的三种写法', () => {
  const siteDir = fileURLToPath(new URL('..', import.meta.url));
  const erdPackageDir = fileURLToPath(
    new URL('../packages/theme-erd/', import.meta.url),
  );

  it('绝对路径原样用', () => {
    expect(resolveExportModule(fixtureModule('table-count'), siteDir)).toBe(
      fixtureModule('table-count'),
    );
  });

  it('`./` 开头相对**站点根**，不是相对本包', () => {
    expect(resolveExportModule('./x/y.mjs', siteDir)).toBe(
      resolve(siteDir, './x/y.mjs'),
    );
  });

  it('包名按引用方的视野解析：不是字符串拼接，是 Node 的解析', () => {
    // 从本包目录问，命中的是它自己那份依赖
    expect(resolveExportModule('markdown-table', erdPackageDir)).toContain(
      'markdown-table',
    );
  });

  it('解析不出来的包名在配置期就红', () => {
    expect(() =>
      resolveExportModule('@show-docs/这个包不存在', siteDir),
    ).toThrow();
  });
});

describe('不配清单就是空的：本包不随带模板', () => {
  const siteDir = fileURLToPath(new URL('..', import.meta.url));

  it('站点没写 `exports`：清单是空的，loader 那一步不会装载任何模块', () => {
    expect(planExports({}, { siteDir })).toEqual([]);
  });

  it('写了就整条接过来，路径按站点根解析', () => {
    const replaced = planExports(
      { exports: [spec('count', '表清单', 'md', './erd/table-names.mjs')] },
      { siteDir },
    );

    expect(replaced).toHaveLength(1);
    expect(replaced[0]!.module).toBe(resolve(siteDir, './erd/table-names.mjs'));
  });

  it('入口那份 validateOptions：没写给空对象，写了就把形状过一遍', () => {
    expect(validateOptions({ options: undefined })).toEqual({});
    expect(
      validateOptions({
        options: { exports: [spec('x', 'X', 'md', './x.mjs')] },
      }).exports,
    ).toHaveLength(1);
    expect(() => validateOptions({ options: { exports: [3] } })).toThrow();
  });
});

describe('随包发出去的那一份', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const erdPkgDir = fileURLToPath(
    new URL('../packages/theme-erd/', import.meta.url),
  );

  const execAsync = promisify(exec);

  /**
  真的问一次打包器：发出去的清单是什么。不自己复刻一遍 glob 语义 —— 那一版
  复刻出来的判据与真打包器不同源，漏一条就是白绿。
  */
  async function publishedFiles(): Promise<string[]> {
    // Windows 上 `pnpm` 是 `.cmd`，`execFile` 不拼 `PATHEXT`、spawn 不了它 —— 走 shell。
    // 参数是写死的常量，命令串里没有别的东西进去。
    const { stdout } = await execAsync('pnpm pack --dry-run --json', {
      cwd: erdPkgDir,
      maxBuffer: 10 * 1024 * 1024,
    });
    const raw = stdout.trim();
    const json = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'));

    return (JSON.parse(json) as { files: { path: string }[] }).files.map(
      (file) => file.path,
    );
  }

  /**
  造一个消费方：把「发出去的那一份」原样摆进它的 `node_modules`，
  再让 TypeScript 真编译一段消费方的代码。

  摆在仓库树内（`.temp/`）：消费方的类型入口要引 `@docusaurus/types`（peer 依赖），
  从仓库根那份 `node_modules` 上溯才拿得到。
  */
  function makeConsumer(
    files: string[],
    omit: string[] = [],
  ): { main: string; cleanup: () => void } {
    const tempRoot = path.join(repoRoot, '.temp');
    fs.mkdirSync(tempRoot, { recursive: true });
    const root = fs.mkdtempSync(path.join(tempRoot, 'erd-consumer-'));

    const installed = path.join(
      root,
      'node_modules',
      '@show-docs',
      'docusaurus-theme-erd',
    );
    for (const file of files) {
      if (omit.includes(file)) continue;
      const target = path.join(installed, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(erdPkgDir, file), target);
    }

    // 那个包**装上了**（它在本包的依赖里），但自家没带类型声明 ——
    // 消费方那边本该撞「隐式 any」那一条，靠本包替它写的那份声明兜住。
    fs.symlinkSync(
      path.join(erdPkgDir, 'node_modules', 'erdiagram'),
      path.join(root, 'node_modules', 'erdiagram'),
      'junction',
    );

    const main = path.join(root, 'main.mts');
    fs.writeFileSync(
      main,
      [
        "import { ErDiagram } from 'erdiagram';",
        "import theme from '@show-docs/docusaurus-theme-erd';",
        '',
        'const diagram = new ErDiagram({ container: document.body });',
        'void diagram;',
        'void theme;',
        '',
      ].join('\n'),
    );

    return {
      main,
      cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
  }

  /** 让 TypeScript 真编译一遍：交回诊断（只留错误）。 */
  function compile(main: string): string[] {
    const program = ts.createProgram([main], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    });

    return ts
      .getPreEmitDiagnostics(program)
      .filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      )
      .map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          ' ',
        );
        const where = diagnostic.file
          ? `${path.basename(diagnostic.file.fileName)}: ${message}`
          : message;
        return `TS${diagnostic.code} ${where}`;
      });
  }

  it('那份 `erdiagram` 的环境声明随包发出去，且消费方拿到就能用', async () => {
    const files = await publishedFiles();

    // 一、随包发：那份声明在清单里（`erdiagram` 自家没带类型，本包替它写的那份是唯一的来源）
    expect(files).toContain('erdiagram.d.ts');

    // 二、类型入口指到的那几份文件都得在清单里：缺一份，消费方那边就是一条「文件找不到」
    const declaration = fs.readFileSync(
      path.join(erdPkgDir, 'dist', 'index.d.mts'),
      'utf8',
    );
    const references = declaration
      .matchAll(/^\/\/\/ <reference path="([^"]+)" \/>$/gm)
      .map((match) => match[1]!)
      .toArray();
    expect(references.length, '类型入口应当指到那份环境声明').toBeGreaterThan(
      0,
    );
    for (const reference of references) {
      // 指令里的路径相对类型入口所在目录（`dist/`），对回包根才是清单里的那条
      const shipped = path.posix.normalize(path.posix.join('dist', reference));
      expect(files, `类型入口引的 ${shipped} 得随包发出去`).toContain(shipped);
    }

    // 三、真的生效：消费方那段代码编译得过（`import { ErDiagram } from 'erdiagram'` 有类型）
    const consumer = makeConsumer(files);
    try {
      expect(compile(consumer.main)).toEqual([]);
    } finally {
      consumer.cleanup();
    }
  });

  it('那份声明没发出去：消费方那边就红（这一格证明上面那格不是白绿）', async () => {
    const files = await publishedFiles();
    const consumer = makeConsumer(files, ['erdiagram.d.ts']);
    try {
      const errors = compile(consumer.main);
      expect(errors.join('\n')).toContain('erdiagram');
    } finally {
      consumer.cleanup();
    }
  });
});

describe('configureWebpack：把 `.dbml` 接进 MDX 那条链', () => {
  type ErdPlugin = ReturnType<typeof theme>;
  type WebpackConfig = Parameters<
    NonNullable<ErdPlugin['configureWebpack']>
  >[0];
  type WebpackUtils = Parameters<NonNullable<ErdPlugin['configureWebpack']>>[2];

  const siteDir = fileURLToPath(new URL('..', import.meta.url));

  const createPlugin = (): ErdPlugin =>
    theme({ siteDir } as Parameters<typeof theme>[0], {});

  const createUtils = () => {
    const getJSLoader = vi.fn(() => 'site-js-loader');
    return {
      getJSLoader,
      utils: { getJSLoader } as unknown as WebpackUtils,
    };
  };

  it('只改正则文本里写着 mdx 的那条；能匹配 `.mdx` 的兜底规则原样不动', () => {
    // 官方那条（`@docusaurus/bundler` 里 mdx 规则的形状）
    const mdxRule = { test: /\.mdx?$/ };
    // 能匹配 `.mdx`、但跟 mdx 没关系：只按「能否匹配」判就会把 `.dbml` 塞进它的 loader 链
    const catchAll = { test: /./ };
    const plainString = { test: 'not-a-regexp' };
    const rules: unknown[] = [
      mdxRule,
      catchAll,
      null,
      plainString,
      { noTest: true },
    ];
    const config = { module: { rules } } as unknown as WebpackConfig;

    const { utils } = createUtils();
    createPlugin().configureWebpack?.(config, false, utils, {} as never);

    expect(mdxRule.test.test('.mdx')).toBe(true);
    expect(mdxRule.test.test('.md')).toBe(true);
    expect(mdxRule.test.test('.dbml')).toBe(true);
    expect(mdxRule.test.test('.mjs')).toBe(false);
    expect(mdxRule.test.flags).toBe('i');
    expect(mdxRule.test.source).toBe(String.raw`(\.mdx?|\.dbml)$`);

    expect(catchAll.test.source).toBe('.');
    expect(plainString.test).toBe('not-a-regexp');
  });

  it('`.dbml` 那条规则排在最前，后面回来的两条各就各位', () => {
    const rules: unknown[] = [];
    const config = { module: { rules } } as unknown as WebpackConfig;
    const { getJSLoader, utils } = createUtils();

    const appended = createPlugin().configureWebpack?.(
      config,
      true,
      utils,
      {} as never,
    );

    // 直接改传进来的 config：loader 链从右往左跑，`.dbml` 必须先见到原文
    const dbmlRule = rules[0] as { test: RegExp; use: unknown[] };
    expect(dbmlRule.test.test('.dbml')).toBe(true);
    expect(dbmlRule.test.test('.mdx')).toBe(false);
    expect(dbmlRule.use).toEqual(['site-js-loader']);
    expect(getJSLoader).toHaveBeenCalledWith({ isServer: true });

    const returned = appended?.module?.rules as Array<{
      test: RegExp;
      loader?: string;
      resolve?: { fullySpecified: boolean };
      use?: unknown[];
      options?: unknown;
      include?: (file: string) => boolean;
    }>;
    // 本包只交自己的两条差异规则：编译未编译 TS 源码那条归
    // `@show-docs/docusaurus-plugin-prev-layer-resolver` 一处管（不再各包各补一份）。
    expect(returned).toHaveLength(2);
    expect(returned[0]?.test.test('.mjs')).toBe(true);
    expect(returned[0]?.resolve).toEqual({ fullySpecified: false });
    // 这一格写的是**产物名**（`thisDir` 是包出口所在的那一层），不是源码名
    expect(returned[1]?.test.test('.dbml')).toBe(true);
    expect(returned[1]?.loader).toMatch(/[/\\]loader[/\\]dbml-loader\.mjs$/);
    expect(returned[1]?.options).toEqual({ exports: [] });
  });
});
