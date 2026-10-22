---
id: diff-pair-demo
sidebar_position: 12
title: 两份文件对照示例
description: 'frontmatter 写 diff: [旧, 新]，正文最上方渲染这两份文件的差异视图，不读 git 历史。'
diff: [../static/openapi-redoc.yaml, ../static/openapi-scalar.yaml]
---

# 两份文件对照示例

这一页的 frontmatter 写的是

```yaml
diff: [../static/openapi-redoc.yaml, ../static/openapi-scalar.yaml]
```

所以上方那块视图比的是**磁盘上的这两份文件**：左边是方括号里的第一份，右边是第二份。用的还是
`git diff` 那套差别算法，但**不读 git 历史** —— 既不要求这两份在仓库里，也跟它们各自上一次被
提交是什么时候无关。地址相对这份 md 所在的目录算，`../static/` 就是站点根下那份静态资源。

站点里那三层 API 主题各读一份 OpenAPI（`static/openapi-redoc.yaml`、
`static/openapi-scalar.yaml`、`static/openapi-stoplight.yaml`），三份的形状一样、只差标题与
说明那几行，所以拿来对照正好能看清「换个渲染器时我给它的到底是哪一份」。

取不到差异的几种情况都让这一页照常渲染正文，只在构建日志里留一句告警：方括号里的项数不是两份、
那两份里有一份在磁盘上不存在、两份内容一模一样。判据记在 `theme/theme-diff/README.md`。

想看「一份文件最近一次提交的差异」，是另一页：`diff: intro.md`，见
[差异视图示例](./diff-demo.md)。
