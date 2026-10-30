---
id: scalar-no-spec
sidebar_position: 8
title: Scalar 没给文档地址
description: 'frontmatter 写 scalar: true 而不写 oas3: / aas3:，框里摆的是本层那句说明，Scalar 自己不挂。'
# 这一页是 e2e 夹具（`test/e2e/features/scalar.feature` 最后那条场景）：命中还是命中、框照样挂，
# 缺的那一格由 `theme/ScalarView` 挡住 —— 空地址交给 Scalar 就是它自己那句「取不到」。
scalar: true
---

# Scalar 没给文档地址

渲染出来的这一页里只有一个框，框里那句「这一页没给 Scalar 要渲染的文档」是本层
`theme/ScalarView` 摆的，正文一行都看不到 —— 这一段是给读仓库源文件的人看的。

- 文档地址由 spec 键给（`oas3:` 摆 OpenAPI、`aas3:` 摆 AsyncAPI 3），两把都没写就没有可渲染的文档。
- 这一格与示例页共用的还是同一个框、同一条握手：`scalar: true` 命中的是同一那一条规则，
  区别只在送进框里的 frontmatter 少了一把键。
