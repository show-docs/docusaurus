---
id: copy-button-demo
sidebar_position: 13
title: 页脚复制按钮示例
description: '页脚那一格右边有一颗按钮，点一下把当前页地址写进剪贴板。'
---

# 页脚复制按钮示例

这一层的开关不在 frontmatter，而在页脚：只要站点写了 `themeConfig.footer.copyright`，
每一页页脚那一格右边就有这颗按钮 —— 包括本页。

按钮上没有文字，只有一份纯 CSS 画出来的复制图标；鼠标指上去会半透明，按下去图标缩一下。
点一下，浏览器地址栏里此刻那份地址就写进剪贴板，右下角给一条提示：

- 成功：「已复制当前页地址」
- 失败：「复制失败」（在控制台留一条错误）

这一页复制到的地址是 `https://example.com/themes/theme-copy-button/docs/copy-button-demo`（站点的 `url` 是示例地址，
实际以地址栏为准）。地址里带编码参数时，复制出去的是解码后的那一份。

## 看不见这颗按钮的两种情况

- 站点没写 `themeConfig.footer.copyright`：页脚那一格整个不渲染，这一层也就没有被挂的地方。
- 站点用 http 打开且不是 localhost：浏览器不给页面剪贴板接口，按钮照常可点，但只会给
  「复制失败」那条提示。
