---
id: intro
sidebar_position: 1
title: 项目说明
---

# 项目说明

本项目用于验证 Docusaurus 主题覆盖机制，让「多个主题层层包裹同一组件」变为可行：

1. 多个主题覆盖同一个组件会发生什么？
2. `@theme-original` 是否可以实现链式包裹？
3. 如何让链式覆盖**真正成立**，同时不改动官方别名语义？

## 文档

- 链式覆盖方案（docusaurus-plugin-prev-layer-resolver）—— 落地实现：`@theme-prev/X` 系列 specifier；正文在仓库里的 `plugins/plugin-prev-layer-resolver/README.md`（站点文档源只收 `docs/`，链接出去只会是死链）。

## 命令

```bash
pnpm install
pnpm start          # 本地预览
pnpm build          # 构建
pnpm test           # 单元测试：解析语义、链式不变量、真实 resolver 端到端
pnpm verify:chain   # 读真实 build 产物，验证链式覆盖成立（先跑 pnpm build）
```
