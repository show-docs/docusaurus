// 站点自己的一份导出模板：把每张表的名字与列数列出来，够用来说明「外接生成器」这件事。
//
// 契约只有一条：默认导出一个函数，拿到 `{ model, dbml }`，返回一个字符串 —— 返回的那段
// 文本就是这一格页签里的代码块。`model` 是 `@dbml/core` 的归一化模型（页面上那条
// `dbml_json` 就是它），`dbml` 是摘掉文件头 frontmatter 之后的原文。
//
// 只在构建期跑，不进浏览器包；改了这份文件，用到它的那一页会重算（loader 把它登记成了
// 缓存依赖）。
export default function generate({ model }) {
  return Object.values(model.tables)
    .map((table) => `${table.name}：${table.fieldIds.length} 列`)
    .join('\n');
}
