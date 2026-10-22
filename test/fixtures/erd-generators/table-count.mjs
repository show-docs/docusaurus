// 一份「外接生成器」的样子：默认导出一个函数，拿到归一化模型与 `.dbml` 原文，
// 返回一个字符串 —— 那个字符串就是页签里的代码块内容。契约见 `theme/theme-erd/README.md`。
export default function generate({ model, dbml }) {
  const tables = Object.values(model.tables);

  return [
    `# 这份 schema 里有 ${tables.length} 张表`,
    '',
    ...tables.map((table) => `- ${table.name}`),
    '',
    `// 原文 ${dbml.trim().split('\n').length} 行`,
  ].join('\n');
}
