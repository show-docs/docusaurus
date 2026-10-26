import type { NormalizedModel } from '@dbml/core';

// `@dbml/core` 的归一化模型在声明里把 `type.args` 漏了，导出的 JSON 里却一直带着
// （`varchar(64)` 的 `64`）；生成器要按类型参数落东西（长度、精度）用的就是这一格。
export interface DbmlColumnType {
  schemaName: string | null;
  type_name: string;
  args: string | null;
}

export type DbmlField = Omit<
  NonNullable<NormalizedModel['fields'][number]>,
  'type'
> & {
  type: DbmlColumnType;
};

export type DbmlModel = Omit<NormalizedModel, 'fields'> & {
  fields: { [id: number]: DbmlField };
};

export type DbmlTable = NonNullable<DbmlModel['tables'][number]>;

export type DbmlEnum = NonNullable<DbmlModel['enums'][number]>;

// `@dbml/core` 的几张表都是纯数字索引签名，`Object.values()` 认不出这形状（会走
// `any[]` 那条重载），取集合时统一用这里的别名断言一次。
export type DbmlEnumValue = NonNullable<DbmlModel['enumValues'][number]>;

/**
生成器拿到的一份输入：归一化模型，与摘掉站点 frontmatter 之后的 `.dbml` 原文。
原文这一份是给「自己再调一次 `@dbml/core` 的 exporter」那类生成器留的口子；
只用得上模型的（站点那份示例模板就是）可以忽略 `dbml`。
*/
export interface ErdGeneratorContext {
  model: DbmlModel;
  dbml: string;
}

/** 外接生成器模块的**默认导出**必须满足这个形状：返回值就是那个页签里的代码块内容。 */
export type ErdGenerator = (context: ErdGeneratorContext) => string;

/**
站点 options 里的一条页签声明（见 README 的「配置」）。

`module` 认三种写法：绝对路径、相对站点根的路径（`./x.mjs`）、包名或包的子路径
（`@foo/my-generator`）—— 判定与解析都在 `src/options.mts`。
*/
export interface ErdExport {
  /** `TabItem` 的 value；整张清单里不能重复。 */
  id: string;
  /** 页签上写的标题。 */
  label: string;
  /** 代码块的语言标记，只影响高亮。 */
  lang: string;
  /** 生成器模块。 */
  module: string;
}

/** 主题插件的选项。`exports` 缺省＝空清单，本包不随带任何导出模板。 */
export interface ErdThemeOptions {
  exports?: ErdExport[];
}

/**
交给 loader 的那一份：`module` 已经在配置期按站点根解析成绝对路径。

必须全是可 JSON 序列化的纯数据 —— webpack 会把 loader 的 options 序列化进配置，
函数与模块对象过不去。
*/
export interface ErdLoaderOptions {
  exports: ErdExport[];
}
