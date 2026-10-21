import lodash from 'lodash';

import type { DbmlField, DbmlModel, DbmlTable } from '../types.mts';

const { camelCase } = lodash;

interface FormatProps {
  format?: string;
}

interface PropertyProps extends FormatProps {
  title?: string;
}

function getFormatProps(
  fieldName: string,
  { type_name }: DbmlField['type'],
): FormatProps {
  const props: FormatProps = {};

  switch (type_name) {
    case 'date': {
      props.format = 'date';
      break;
    }
    case 'timestamp': {
      props.format = 'date-time';
      break;
    }
    case 'bool': {
      props.format = 'boolean';
      break;
    }
    default: {
      break;
    }
  }

  // 下面是对常见字段名的处理
  switch (fieldName) {
    case 'batch_id': {
      props.format = 'batchId';
      break;
    }
    case 'serial_number': {
      props.format = 'serial';
      break;
    }
    case 'user_id': {
      props.format = 'user';
      break;
    }
    case 'org_id': {
      props.format = 'objectId';
      break;
    }
    case 'area_id': {
      props.format = 'objectId';
      break;
    }
    case 'duration': {
      props.format = 'duration';
      break;
    }
    default: {
      break;
    }
  }

  if (!props.format) {
    if (fieldName.endsWith('_id')) {
      props.format = 'objectId';
    } else if (fieldName.endsWith('_url')) {
      props.format = 'file-url';
    }
  }

  return props;
}

function dbmlTable2jsonSchema(
  { fields }: DbmlModel,
  { name, note, fieldIds }: DbmlTable,
) {
  const properties: Record<string, PropertyProps> = {};

  for (const fieldId of fieldIds) {
    const { name: fieldName, type, note: fieldNote } = fields[fieldId]!;

    // `id` 与 `create_time` 由所有表共有的基类提供，不进各表自己的 schema
    if (fieldName === 'id' || fieldName === 'create_time') {
      continue;
    }

    properties[camelCase(fieldName)] = {
      ...(fieldNote && { title: fieldNote }),
      ...getFormatProps(fieldName, type),
    };
  }

  return {
    $schema:
      'https://admin.test.xinxiangsui.com.cn/data-grid.table.schema.json',
    type: 'object',
    description: `对应 ${name}: ${note}`,
    properties,
  };
}

export function dbml2jsonSchema(model: DbmlModel): string {
  return JSON.stringify(
    (Object.values(model.tables) as DbmlTable[]).map((table) =>
      dbmlTable2jsonSchema(model, table),
    ),
    null,
    2,
  );
}
