---
id: frame-precedence-scalar
sidebar_position: 7
title: 框键先后演示（四把都写）
description: '同一页写满 scalar / redoc / stoplight / iframe 四把键，生效的是 theme-iframe 注册表里排第一的那一把。'
# 这一页是 e2e 的夹具（`test/e2e/features/frame-precedence.feature`）：四把键同时写在
# frontmatter 里，判的是 theme-iframe 在自己 `loadContent()` 里交给 theme-component-page 的那份清单按
# `src/api-frame-registry.ts` 的顺序逐条判、第一个命中就换框 —— 这一页应该摆 scalar 那个框，
# 另外三把一概轮不到。
# 三条 API 层是布尔键（`scalar: true`），spec 地址由 `oas3:` / `aas3:` 给（与 `iframe:` 无关）。
# 正文在渲染后的页面上看不到：整页已经交给框了。
scalar: true
redoc: true
stoplight: true
oas3: /openapi-scalar.yaml
iframe: /404
---

# 框键先后演示（四把都写）

这一页什么都不摆出来 —— 四把键里注册表排第一的 `scalar:` 生效，整页交给 scalar 那个框。
