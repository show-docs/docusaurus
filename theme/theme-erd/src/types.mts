import type { NormalizedModel } from '@dbml/core';

// `@dbml/core` 的归一化模型在声明里把 `type.args` 漏了，导出的 JSON 里却一直带着
// （`varchar(64)` 的 `64`）；`dbml2jpa` 要用它生成 `@Column(length = …)`。
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
