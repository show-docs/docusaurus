# src/theme

站点 swizzle（`.tsx`），用 `@theme-prev` 链在插件主题之上。

`src/theme` 是层栈最外层的**哨兵槽位**，所以这里的 `@theme-prev/Logo` = `theme-c`；
`theme-c` 里的 `@theme-prev` 又指向 `theme-b`……三层链路由此成立。

| 文件                       | 内容                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Logo/index.tsx`           | 链式覆盖：包裹 `@theme-prev/Logo`（= theme-c 的 Logo），链路由此往上包                                            |
| `DocItem/Footer/index.tsx` | **不是链**：用官方 `@theme-original/DocItem/Footer` 包住全局赢家（theme-a 的 Footer），验官方别名在最外层照常可用 |

两格各验一件事：**链式覆盖**看 `Logo`，**官方 `@theme-original` 语义零改动**看 `Footer`
（theme-a 的 Footer 不导入 `@theme-prev`，链到此为止）。站点层用官方 `@theme-original`
一样成立（它本来就只在最外层安全），但统一用 `@theme-prev` 可以让每层写法完全一致。
第 2 类事实的产地是文件自身的注释，本表只做索引。
