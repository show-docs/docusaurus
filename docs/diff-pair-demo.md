---
id: diff-pair-demo
sidebar_position: 12
title: 两份文件对照示例
description: 'frontmatter 写 diff: {old: 旧, new: 新}，正文最上方渲染这两份文件的差异视图，不读 git 历史。'
diff: { old: ../static/openapi-redoc.yaml, new: ../static/openapi-scalar.yaml }
---

# 两份文件对照示例

这一页的 frontmatter 写的是

```yaml
diff: { old: ../static/openapi-redoc.yaml, new: ../static/openapi-scalar.yaml }
```

所以上方那块视图比的是**磁盘上的这两份文件**：`old` 那一份在左边（改动之前），`new` 那一份在右边
（改动之后）。**角色是这两个键名定的，跟谁写在前头没关系**，两条调换着写，出来的还是同一张图。
用的还是 `git diff` 那套差别算法，但**不读 git 历史** —— 既不要求这两份在仓库里，也跟它们各自
上一次被提交是什么时候无关。地址相对这份 md 所在的目录算，`../static/` 就是站点根下那份静态资源。

站点里那三层 API 主题各读一份 OpenAPI（`static/openapi-redoc.yaml`、
`static/openapi-scalar.yaml`、`static/openapi-stoplight.yaml`），三份的形状一样、只差标题与
说明那几行，所以拿来对照正好能看清「换个渲染器时我给它的到底是哪一份」。

取不到差异的几种情况都让这一页照常渲染正文，只在构建日志里留一句告警：`old` 与 `new` 两个键凑不
齐、那两份里有一份在磁盘上不存在、两份内容一模一样。判据记在 `theme/theme-diff/README.md`。

想看「一份文件的上一个版本与此刻这一份」，是另一页：`diff: intro.md`，见
[差异视图示例](./diff-demo.md)。
