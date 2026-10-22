import { pathToFileURL } from 'node:url';

import { exporter } from '@dbml/core';
import { markdownTable } from 'markdown-table';
import type { LoaderContext } from 'webpack';

import type {
  DbmlEnum,
  DbmlEnumValue,
  DbmlField,
  DbmlModel,
  DbmlTable,
  ErdExport,
  ErdGenerator,
  ErdGeneratorContext,
  ErdLoaderOptions,
} from '../types.mts';

interface ExportTab {
  value: string;
  label: string;
  lang: string;
  source: string;
}

// 代码块上的 `tab="X"` 元数据在 Docusaurus 3 不再生成页签，这里直接写成组件。
function createTabs(tabs: ExportTab[]): string[] {
  return [
    '<Tabs>',
    ...tabs.flatMap(({ value, label, lang, source }) => [
      `<TabItem value="${value}" label="${label}">`,
      '',
      `\`\`\`${lang}`,
      source.trim(),
      '```',
      '',
      '</TabItem>',
    ]),
    '</Tabs>',
  ];
}

function createMarkdownTables(model: DbmlModel): (string | null)[] {
  const io: (string | null)[] = [];
  const { enums, tables, enumValues, fields } = model;

  if (Object.keys(enums).length > 0) {
    io.push('## 枚举');

    for (const enum_ of Object.values(enums) as DbmlEnum[]) {
      const doc = markdownTable(
        [
          ['值', '含义'],
          ...enum_.valueIds.map((valueId) => {
            const value: DbmlEnumValue = enumValues[valueId]!;

            return [value.name, value.note];
          }),
        ],
        { align: ['l', 'l'] },
      );

      io.push(`### ${enum_.name}`, enum_.note, doc);
    }
  }

  if (Object.keys(tables).length > 0) {
    io.push('## 表');

    for (const table of Object.values(tables) as DbmlTable[]) {
      const doc = markdownTable(
        [
          ['字段', '含义', '类型', '非空', '唯一', '自增', '默认值'],
          ...table.fieldIds.map((fieldId) => {
            const field = fields[fieldId]!;

            return [
              field.pk ? `${field.name} 🔑` : field.name,
              field.note,
              enumType(field, model),
              field.not_null ? '是' : '',
              field.unique ? '是' : '',
              field.increment ? '是' : '',
              field.dbdefault?.value.toString(),
            ];
          }),
        ],
        { align: ['l', 'l', 'l', 'c', 'c', 'c', 'l'] },
      );

      io.push(`### ${table.name}`, table.note, doc);
    }
  }

  return io;
}

function enumType(field: DbmlField, { enums, enumValues }: DbmlModel): string {
  if (field.enumId === null) {
    return field.type.type_name;
  }

  const enum_ = enums[field.enumId]!;

  // 枚举值少于三个时把值直接列出来，比只写枚举名好读
  return enum_.valueIds.length < 3
    ? `${enum_.valueIds
        .map((valueId) => enumValues[valueId]!.name)
        .join('/')} [枚举]`
    : `${enum_.name} [枚举]`;
}

// 站点自己的 frontmatter（标题、说明、侧栏名）留在文件头上给 Docusaurus 读，
// DBML 解析器只收 `---` 块之后的部分。
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/**
取一句可读的消息。

`catch` 到的是 `unknown`，而这一族里确实有非 `Error` 的抛法（`@dbml/core` 语法错抛的
就是 `{ diags: [...] }`），所以两条路都要能落出一句话。
*/
function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
装载一条页签的生成器模块，并跑出一份代码。

三条失败路径都点名到具体页签：装不上、没按契约导出、跑的时候抛错 —— 少一句「哪个页签」，
站点就得自己顺着堆栈猜。
*/
async function buildTab(
  spec: ErdExport,
  context: ErdGeneratorContext,
): Promise<ExportTab> {
  const where = `页签「${spec.label}」(${spec.id}) 的生成器 ${spec.module}`;

  let generate: ErdGenerator | undefined;

  try {
    // Windows 的路径要转成 file: URL 才能进 `import()`；这里是构建期的 Node，不进浏览器包
    generate = (
      (await import(pathToFileURL(spec.module).href)) as {
        default?: ErdGenerator;
      }
    ).default;
  } catch (error) {
    throw new Error(`${where} 装不上：${reason(error)}`, { cause: error });
  }

  if (typeof generate !== 'function') {
    throw new TypeError(
      `${where} 没有默认导出一个函数（生成器契约见 README 的「配置」）`,
    );
  }

  try {
    return {
      value: spec.id,
      label: spec.label,
      lang: spec.lang,
      source: generate(context),
    };
  } catch (error) {
    throw new Error(`${where} 跑失败了：${reason(error)}`, { cause: error });
  }
}

async function createMdx(
  source: string,
  exports: ErdExport[],
): Promise<string> {
  const dbml = source.replace(FRONT_MATTER, '');
  const json = exporter.export(dbml, 'json');
  const model = JSON.parse(json) as DbmlModel;

  // 顺序即页签顺序：`@dbml/core` 那四个在前，站点配的模板页按声明顺序接在后面
  const tabs = await Promise.all(
    exports.map((spec) => buildTab(spec, { model, dbml })),
  );

  return [
    '---',
    'hide_title: true',
    '---',
    '',
    "import Tabs from '@theme/Tabs';",
    "import TabItem from '@theme/TabItem';",
    '',
    `export const dbml_json = ${json};`,
    '',
    ...createTabs([
      { value: 'dbml', label: 'DBML', lang: 'sql', source: dbml },
      {
        value: 'mysql',
        label: 'MySQL',
        lang: 'sql',
        source: exporter.export(dbml, 'mysql'),
      },
      {
        value: 'postgresql',
        label: 'PostgreSQL',
        lang: 'sql',
        source: exporter.export(dbml, 'postgres'),
      },
      { value: 'json', label: 'JSON', lang: 'json', source: json },
      ...tabs,
    ]),
    createMarkdownTables(model),
  ]
    .flat()
    .join('\n');
}

// 普通 loader：收到的是 `.dbml` 原文，产出交给官方 mdx-loader 编译成文档模块。
//
// 后面那一串模板页由配置期算好的 `exports` 决定，每一项只是一个模块路径（站点没配就是
// 空清单，本包不随带模板）；上面四个是 `@dbml/core` 自己的导出格式，不归站点配。
export default function loader(
  this: LoaderContext<ErdLoaderOptions>,
  source: string,
): void {
  this.cacheable();

  const callback = this.async();
  const { exports } = this.getOptions();

  // 外接模块改了要能让这一格的缓存失效：`cacheable()` 认的是 `.dbml` 本身，不认模块
  for (const spec of exports) {
    this.addDependency(spec.module);
  }

  createMdx(source, exports)
    .then((mdx) => callback(null, mdx))
    .catch((error: unknown) =>
      // 语法错或引用错时 `exporter.export()` 抛的**不是** `Error`，而是解析器那份
      // `{ diags: [{ message, location }] }`（行列都在里面）。这里原样交回，不拼成一句
      // 只剩 `[object Object]` 的消息；要把它收成一条 `Error` 是改行为，先看这一份形状。
      callback(error as Error),
    );
}
