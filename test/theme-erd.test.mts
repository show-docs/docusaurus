import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import loader from '../theme/theme-erd/src/loader/dbml-loader.mts';
import { dbml2jpa } from '../theme/theme-erd/src/loader/dbml2jpa.mts';
import { dbml2jsonSchema } from '../theme/theme-erd/src/loader/dbml2schema.mts';
import type { DbmlModel } from '../theme/theme-erd/src/types.mts';

/**
## theme-erd 的构建期判据

这一层把一份 `.dbml` 编译成「关系图 + 六种格式的导出」，编译全在 webpack 的一条 loader 里跑完：
枚举列怎么写、字段落成哪种 Java 类型、JSON Schema 里那些 `format` 从哪来。这一段没有浏览器
参与，`pnpm build` 全绿也证明不了它算得对 —— 只有单测能量；页面上那张图和六个页签对不对，
由 `test/e2e/features/erd.feature` 钉。

夹具用的是**真的 DBML 原文**，模型由本包那条 loader 现算（`export const dbml_json` 那一格），
不自己手写假模型，也不另外引 `@dbml/core`：这一层最容易坏的地方恰恰是「dbml 的哪种写法解析出
什么形状」，把解析换成别的口径等于把判据替掉。
*/

/** 站点上那份示例页，也是这一层每天真实吃进去的那一份输入。 */
const demoDbml = fs.readFileSync(
  new URL('../docs/erd-demo.dbml', import.meta.url),
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

/** 一次 loader 调用的两样产出：交回 webpack 的内容、以及 `callback` 的第一个参数。 */
interface LoaderRun {
  output: string | null;
  error: unknown;
}

/**
用一个假的 loader 上下文跑一遍本包那条 loader。

真实上下文由 webpack 逐次构造，这一层只用到 `cacheable` / `async` 两件 —— `.dbml` 原文是
webpack 读进来传下来的，loader 自己不碰磁盘。
*/
function runLoader(dbml: string): LoaderRun {
  const result: LoaderRun = { output: null, error: null };

  const context = {
    cacheable: () => undefined,
    async: () => (error: Error | null, source?: string) => {
      result.error = error ?? null;
      result.output = source ?? null;
    },
  };

  loader.call(context as never, dbml);
  return result;
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

/** 这份 dbml 经本包 loader 解析出来的模型 —— 下面两个导出函数吃的那一份。 */
function toModel(dbml: string): DbmlModel {
  return exportedJson(runLoader(dbml).output ?? '');
}

/** JSON Schema 那一路的产出：一个数组，每项是一张表。 */
interface SchemaEntry {
  $schema: string;
  type: string;
  description: string;
  properties: Record<string, { title?: string; format?: string }>;
}

function schemasOf(dbml: string): SchemaEntry[] {
  return JSON.parse(dbml2jsonSchema(toModel(dbml))) as SchemaEntry[];
}

describe('一份 .dbml 编译成 MDX', () => {
  it('示例页那份：六种格式各一个页签，头部 frontmatter 不进产物', () => {
    const run = runLoader(demoDbml);
    expect(run.error).toBeNull();
    const output = run.output ?? '';

    // 站点自己的标题、侧栏名留给 Docusaurus 读，这一层另起一段只带 `hide_title`
    expect(output.startsWith('---\nhide_title: true\n---')).toBe(true);
    expect(output).not.toContain('sidebar_position');

    for (const value of [
      'dbml',
      'mysql',
      'postgresql',
      'json',
      'json-schema',
      'jpa',
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

  it('表格里给出主键、约束与默认值', () => {
    const output = runLoader(demoDbml).output ?? '';
    expect(output).toContain('## 枚举');
    expect(output).toContain('### order_status');
    expect(output).toContain('## 表');
    expect(output).toContain('### users');
    expect(output).toContain('id 🔑');
    expect(output).toContain('pending');
  });

  it('不带头部 frontmatter 的 dbml 也照样编译', () => {
    const run = runLoader(wideDbml);
    expect(run.error).toBeNull();
    expect(run.output).toContain('### accounts');
  });

  it('只有枚举、没有表：表格那一段整个省掉', () => {
    const output = runLoader(enumOnlyDbml).output ?? '';
    expect(output).toContain('## 枚举');
    expect(output).not.toContain('## 表');
  });

  it('只有表、没有枚举：枚举那一段整个省掉', () => {
    const output = runLoader(plainDbml).output ?? '';
    expect(output).not.toContain('## 枚举');
    expect(output).toContain('## 表');
    expect(output).toContain('### plain');
  });

  it('DBML 语法错：不产出内容，把解析器那份诊断交回 webpack', () => {
    const run = runLoader('Table broken {');
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
  it('值少于三个：直接把值列出来', () => {
    expect(runLoader(wideDbml).output).toContain('male/female [枚举]');
  });

  it('值三个及以上：只写枚举名', () => {
    const output = runLoader(wideDbml).output ?? '';
    expect(output).toContain('organization_type [枚举]');
    expect(output).not.toContain('company/person/other');
  });

  it('示例页里的 order_status 走的正是「只写枚举名」那一条', () => {
    expect(runLoader(demoDbml).output).toContain('order_status [枚举]');
  });
});

describe('JSON Schema 那一路', () => {
  /** `wideDbml` 里两张表的 schema，顺序就是文件里的顺序。 */
  const [accounts, logs] = schemasOf(wideDbml) as [SchemaEntry, SchemaEntry];

  it('字段名转驼峰，`id` 与 `create_time` 不进各表自己的 schema', () => {
    expect(Object.keys(accounts.properties)).toContain('batchId');
    expect(accounts.properties.id).toBeUndefined();
    expect(logs.properties.createTime).toBeUndefined();
    expect(logs.properties.message).toBeDefined();
  });

  it('类型给的 format：date、timestamp、bool；其余类型不留', () => {
    expect(accounts.properties.born?.format).toBe('date');
    expect(accounts.properties.recordTime?.format).toBe('date-time');
    expect(accounts.properties.active?.format).toBe('boolean');
    expect(accounts.properties.wake?.format).toBeUndefined();
  });

  it('常见字段名各有自己的 format', () => {
    expect(accounts.properties.batchId?.format).toBe('batchId');
    expect(accounts.properties.serialNumber?.format).toBe('serial');
    expect(accounts.properties.userId?.format).toBe('user');
    expect(accounts.properties.orgId?.format).toBe('objectId');
    expect(accounts.properties.areaId?.format).toBe('objectId');
    expect(accounts.properties.duration?.format).toBe('duration');
  });

  it('认不出的字段名：`_id` 结尾算对象标识，`_url` 结尾算文件地址，其余不留', () => {
    expect(accounts.properties.shopId?.format).toBe('objectId');
    expect(accounts.properties.avatarUrl?.format).toBe('file-url');
    expect(accounts.properties.gender?.format).toBeUndefined();
  });

  it('有备注的字段带 title，没有的不带', () => {
    expect(accounts.properties.batchId?.title).toBe('批次');
    expect(accounts.properties.serialNumber?.title).toBeUndefined();
  });

  it('每项对应一张表，说明里带上表名', () => {
    expect(accounts.type).toBe('object');
    expect(accounts.description).toContain('accounts');
    expect(schemasOf(plainDbml)).toHaveLength(1);
  });
});

describe('Spring Data JPA 那一路', () => {
  /** 示例页那份：`record_date` 在一两张表里，另一张什么都没有。 */
  const demoModel = toModel(demoDbml);

  it('实体、repository、service、定时任务四份，包名不留旧项目的痕迹', () => {
    const output = dbml2jpa(toModel(plainDbml));
    expect(output).toContain('Plain.java');
    expect(output).toContain('PlainRepository');
    expect(output).toContain('PlainService');
    expect(output).toContain('WritePlainTask');
    expect(output).toContain('com.example.demo.model.BaseEntity');
    expect(output).not.toContain('eaphone');
  });

  it('Java 类型映射：整型、日期时间、布尔、认不出的当字符串、专有的类名保留', () => {
    const output = dbml2jpa(toModel(wideDbml));
    expect(output).toContain('private Integer duration;');
    expect(output).toContain('private Date born;');
    expect(output).toContain('private Boolean active;');
    expect(output).toContain('private String gender;');
    expect(output).toContain('private OrganizationType organizationType;');
  });

  it('列注解按 dbml 的约束给：唯一、非空、长度', () => {
    const output = dbml2jpa(demoModel);
    expect(output).toContain('name = "name", unique = true, nullable = false');
    expect(output).toContain('length = 128');
    expect(output).toContain('length = 10,2');
  });

  it('什么约束都没有时，`@Column` 只剩名字', () => {
    expect(dbml2jpa(toModel(plainDbml))).toContain('@Column(name = "memo")');
  });

  it('布尔列带上 tinyint 的转换注解，日期时间带上 @Temporal，枚举带上 @Enumerated', () => {
    const output = dbml2jpa(toModel(wideDbml));
    expect(output).toContain('columnDefinition = "TINYINT(1) UNSIGNED"');
    expect(output).toContain(
      '@Convert(converter = NumericBooleanConverter.class)',
    );
    expect(output).toContain('@Temporal(TemporalType.DATE)');
    expect(output).toContain('@Temporal(TemporalType.TIME)');
    expect(output).toContain('@Temporal(TemporalType.TIMESTAMP)');
    expect(output).toContain('@Enumerated(EnumType.STRING)');
  });

  it('BaseEntity 已有的字段不重复生成', () => {
    const output = `${dbml2jpa(toModel(wideDbml))}${dbml2jpa(demoModel)}`;
    expect(output).not.toContain('@Column(name = "id")');
    expect(output).not.toContain('@Column(name = "create_time")');
  });

  it('有 `record_date` 的表：repo / service / task 生成按天那套', () => {
    const output = dbml2jpa(demoModel);
    expect(output).toContain('long countByRecordDate(Date date);');
    expect(output).toContain('DateUtil.addDay(now, -1)');
    expect(output).not.toContain('countByRecordTimeBetween');
  });

  it('只有 `record_time` 的表：生成按时间段那套', () => {
    const output = dbml2jpa(toModel(wideDbml));
    expect(output).toContain(
      'long countByRecordTimeBetween(Date dateBegin, Date dateEnd);',
    );
    expect(output).toContain('DateUtil.today1400(now)');
    expect(output).not.toContain('long countByRecordDate(Date date);');
  });

  it('两样都没有的表：任务体留一个 TODO', () => {
    const output = dbml2jpa(toModel(plainDbml));
    expect(output).toContain('// TODO Auto-generated method stub');
    expect(output).not.toContain('countByRecord');
  });

  it('字段备注生成在字段头上', () => {
    const output = dbml2jpa(toModel(wideDbml));
    expect(output).toContain('/** 批次 */');
    expect(output).toContain('private String batchId;');
  });
});
