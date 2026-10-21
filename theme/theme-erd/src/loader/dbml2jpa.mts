import lodash from 'lodash';

import type { DbmlEnum, DbmlField, DbmlModel, DbmlTable } from '../types.mts';

const { camelCase, upperFirst } = lodash;

/** 三种日期类型到 `TemporalType` 枚举值的映射。 */
const TEMPORAL_TYPES: Record<string, string> = {
  date: 'DATE',
  time: 'TIME',
  timestamp: 'TIMESTAMP',
};

function toJavaType({ type_name }: DbmlField['type']): string {
  switch (type_name) {
    case 'integer': {
      return 'Integer';
    }
    case 'date':
    case 'time':
    case 'timestamp': {
      return 'Date';
    }
    case 'bool': {
      return 'Boolean';
    }
    case 'organization_type': {
      return 'OrganizationType';
    }
    default: {
      break;
    }
  }

  return 'String';
}

// 生成的是项目模板级的代码（实体 / repository / service / task），不是通用 JPA 映射：
// 字符串拼接照搬旧主题的实现，只为在文档里给出可读的起点。
export function dbml2jpa(model: DbmlModel): string {
  const { tables, fields, enums } = model;
  const output: string[] = [];

  const enumNames = new Set(
    (Object.values(enums) as DbmlEnum[]).map(({ name }) => name),
  );

  for (const { name, note, fieldIds } of Object.values(tables) as DbmlTable[]) {
    const javaTableName = upperFirst(camelCase(name));
    const imports = [
      'import jakarta.persistence.Column;',
      'import jakarta.persistence.Entity;',
      'import jakarta.persistence.Table;',
      'import lombok.Data;',
      'import lombok.EqualsAndHashCode;',
      'import lombok.ToString;',
    ];

    let hasRecordDate = false;
    let hasRecordTime = false;

    const fieldParts: string[] = [];

    for (const id of fieldIds) {
      const {
        name: fieldName,
        type: fieldType,
        unique,
        not_null,
        note: fieldNote,
      } = fields[id]!;

      // 跳过已经在 BaseEntity 中定义的字段
      if (fieldName === 'id' || fieldName === 'create_time') {
        continue;
      }

      const javaFieldName = camelCase(fieldName);
      const javaFieldType = toJavaType(fieldType);

      if (javaFieldName === 'recordDate') {
        hasRecordDate = true;
      } else if (javaFieldName === 'recordTime') {
        hasRecordTime = true;
      }

      const columnAttrs = [
        `name = "${fieldName}"`,
        unique ? 'unique = true' : '',
        not_null ? 'nullable = false' : '',
        fieldType.args ? `length = ${fieldType.args}` : '',
      ].filter((attr) => attr.trim() !== '');

      const fieldComment = fieldNote ? `/** ${fieldNote} */` : '';

      const fieldLines = [fieldComment];

      // 对 date、time、timestamp 三种类型加入 @Temporal 的注解
      const temporal = TEMPORAL_TYPES[fieldType.type_name];

      if (temporal) {
        imports.push(
          'import jakarta.persistence.Temporal;',
          'import jakarta.persistence.TemporalType;',
        );
        fieldLines.push(`@Temporal(TemporalType.${temporal})`);
      } else if (fieldType.type_name === 'bool') {
        columnAttrs.push('columnDefinition = "TINYINT(1) UNSIGNED"');
        imports.push(
          'import jakarta.persistence.Convert;',
          'import org.hibernate.type.NumericBooleanConverter;',
        );
        fieldLines.push('@Convert(converter = NumericBooleanConverter.class)');
      } else if (enumNames.has(fieldType.type_name)) {
        // 对枚举字段加入 @Enumerated 的注解
        imports.push(
          'import jakarta.persistence.Enumerated;',
          'import jakarta.persistence.EnumType;',
        );
        fieldLines.push('@Enumerated(EnumType.STRING)');
      }

      fieldLines.push(
        `@Column(${columnAttrs.join(', ')})`,
        `private ${javaFieldType} ${javaFieldName};\n`,
      );

      fieldParts.push(
        fieldLines
          .filter((line) => line.trim() !== '')
          .map((line) => `    ${line}`)
          .join('\n'),
      );
    }

    // java 文件顶部内容
    const top = `/** ${javaTableName}.java : 含有表 ${name} 的定义 */

import java.util.Date;

import com.eaphone.smarthealth.model.BaseEntity;

${imports.toSorted((a, b) => a.localeCompare(b)).join('\n')}

/**
 * ${note}
 */
@Data
@Entity
@Table(name = "${name}")
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
public class ${javaTableName} extends BaseEntity {`;
    const tail = '}';

    // repo 文件的内容
    const repoLines = [
      `\n/** ${javaTableName}Repository.java */

import java.util.Date;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${javaTableName}Repository extends JpaRepository<${javaTableName}, Long> {`,
    ];

    if (hasRecordDate) {
      repoLines.push('    long countByRecordDate(Date date);');
    } else if (hasRecordTime) {
      repoLines.push(
        '    long countByRecordTimeBetween(Date dateBegin, Date dateEnd);',
      );
    }

    repoLines.push('}');

    // service 文件的内容
    const serviceLines = [
      `\n/** ${javaTableName}Service.java */

import java.util.Date;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.eaphone.smarthealth.service.BaseJpaService;

@Service
public class ${javaTableName}Service extends BaseJpaService<${javaTableName}> {

    @Autowired
    private ${javaTableName}Repository repo;`,
    ];

    if (hasRecordDate) {
      serviceLines.push(`
    public long countByRecordDate(Date date) {
        return repo.countByRecordDate(date);
    }`);
    } else if (hasRecordTime) {
      serviceLines.push(`
    public long countByRecordTimeBetween(Date dateBegin, Date dateEnd) {
        return repo.countByRecordTimeBetween(dateBegin, dateEnd);
    }`);
    }

    serviceLines.push('}');

    // task 文件的内容
    const serviceName = `${camelCase(name)}Service`;
    const taskLines = [
      `\n/** Write${javaTableName}Task.java */

import java.util.Date;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.eaphone.smarthealth.util.DateUtil;

@Component
public class Write${javaTableName}Task extends BaseJobTask<${javaTableName}> {

  @Autowired
  private ${javaTableName}Service ${serviceName};

  @Override
  public String getEntityName() {
    return "";
  }

  @Override
  public boolean hasAlreadyRun(Date now) {`,
    ];

    if (hasRecordDate) {
      taskLines.push(`    Date yesterday = DateUtil.addDay(now, -1);
    return ${serviceName}.countByRecordDate(yesterday) > 0;`);
    } else if (hasRecordTime) {
      taskLines.push(`    Date today14 = DateUtil.today1400(now);
    Date yesterday14 = DateUtil.addDay(today14, -1);
    return ${serviceName}.countByRecordTimeBetween(yesterday14, today14) > 0;`);
    }

    taskLines.push(`  }

  @Override
  protected long doRun(Date now) throws Exception {`);

    if (hasRecordDate) {
      taskLines.push(`    Date yesterday = DateUtil.addDay(now, -1);

    AtomicInteger counter = new AtomicInteger(0);
    // TODO
    stream(yesterday).map(o -> {
      ${javaTableName} l = new ${javaTableName}();
      // TODO: 生成数据
      return l;
    }).forEach(l -> {
      ${serviceName}.save(l);
      counter.incrementAndGet();
    });
    return counter.get();`);
    } else if (hasRecordTime) {
      taskLines.push(`    Date today14 = DateUtil.today1400(now);
    Date yesterday14 = DateUtil.addDay(today14, -1);
    AtomicInteger counter = new AtomicInteger(0);
    // TODO 按 yesterday14 到 today14 来统计
    strem(yesterday14, today14).map(o -> {
      ${javaTableName} l = new ${javaTableName}();
      // TODO: 生成数据
      return l;
    }).forEach(l -> {
      ${serviceName}.save(l);
      counter.incrementAndGet();
    });
    return counter.get();`);
    } else {
      taskLines.push(`
    // TODO Auto-generated method stub
    return 0;
    }`);
    }

    taskLines.push(`
  }
}`);

    output.push(
      top,
      ...fieldParts,
      tail,
      ...repoLines,
      ...serviceLines,
      ...taskLines,
      '',
    );
  }

  return output.join('\n');
}
