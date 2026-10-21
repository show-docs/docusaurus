import { exporter } from '@dbml/core';
import { markdownTable } from 'markdown-table';
import type { LoaderContext } from 'webpack';

import type {
  DbmlEnum,
  DbmlEnumValue,
  DbmlField,
  DbmlModel,
  DbmlTable,
} from '../types.mts';

import { dbml2jpa } from './dbml2jpa.mts';
import { dbml2jsonSchema } from './dbml2schema.mts';

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

function createMdx(source: string): string {
  const dbml = source.replace(FRONT_MATTER, '');
  const json = exporter.export(dbml, 'json');
  const model = JSON.parse(json) as DbmlModel;

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
      {
        value: 'json-schema',
        label: 'JSON Schema',
        lang: 'json',
        source: dbml2jsonSchema(model),
      },
      {
        value: 'jpa',
        label: 'Spring Data JPA',
        lang: 'java',
        source: dbml2jpa(model),
      },
    ]),
    createMarkdownTables(model),
  ]
    .flat()
    .join('\n');
}

// 普通 loader：收到的是 `.dbml` 原文，产出交给官方 mdx-loader 编译成文档模块。
export default function loader(
  this: LoaderContext<unknown>,
  source: string,
): void {
  this.cacheable();

  const callback = this.async();

  try {
    callback(null, createMdx(source));
  } catch (error) {
    // 语法错或引用错时 `exporter.export()` 抛的**不是** `Error`，而是解析器那份
    // `{ diags: [{ message, location }] }`（行列都在里面）。这里原样交回，不拼成一句
    // 只剩 `[object Object]` 的消息；要把它收成一条 `Error` 是改行为，先看这一份形状。
    callback(error as Error);
  }
}
