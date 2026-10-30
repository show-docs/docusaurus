---
id: frame-precedence-redoc
sidebar_position: 8
title: 框键先后演示（不写 scalar）
description: '同一页写 redoc / stoplight / iframe 三把键，生效的是 `plugins` 里声明在最前的 redoc 那一把。'
# 这一页也是 e2e 夹具：把注册表第一把（`scalar:`）拿掉，剩下三把按顺序就该 redoc 赢 ——
# 上一份夹具只钉得住「scalar 赢」，那可能因为它是唯一被实现的判法；这一份钉「顺序真的在逐条走」。
# spec 地址仍由 spec 键给（这一页是 OpenAPI，写 `oas3:`）。
# 正文在渲染后的页面上看不到：整页已经交给框了。
redoc: true
stoplight: true
oas3: /openapi-redoc.yaml
iframe: /404
---

# 框键先后演示（不写 scalar）

这一页同样什么都不摆出来 —— 三把键里注册表排最前的 `redoc:` 生效，整页交给 redoc 那个框。
