# @show-docs/docusaurus-theme-avatar

在导航栏右侧、亮暗切换那颗按钮旁边挂一颗当前用户的头像：站点给一个用户信息接口，取到用户才画，
取不到就当没登录。下拉里那两条（个人中心、退出登录）各由一条地址决定出不出现。

## 安装

`theme/` 与 `components/` 是随包发布的未编译 TS 源码，编译它们的 babel 规则由解析器插件一处
认领，所以还得装它并**注册成插件** —— 那是本层唯一一条安装前提：这一层不向
`theme-component-page` 交规则，缺了那一格它照常工作。两个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-avatar
```

## 使用

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    [
      '@show-docs/docusaurus-theme-avatar',
      {
        userApi: '/api/user',
        menu: {
          profileHref: 'https://your-site.example/me',
          logoutHref: 'https://your-site.example/logout'
        }
      }
    ]
  ]
};
```

**`userApi` 是这一层的开关**：不写（或写成空串）就是整层不启用，头像不出现，亮暗切换照旧。
这一格没有缺省值 —— 它指向的是站点自己的服务，本包猜不出地址。同理，`menu.profileHref` 与
`menu.logoutHref` 也没有能用的缺省：哪一条不写，那一条菜单项就不出；两条都不写，头像还在但
不再有下拉，只剩一张图。

### 只对某一台机器启用

`enableHostname` 写给定时，只有地址栏里那个 hostname 与它一致才画头像。用同一份代码同时跑
内网站与公网站时，把这一格写成内网那个域名，公网那一侧就不出现头像。空串（缺省）不做限制。

## 选项

| 格                        | 缺省                                     | 说明                                                                                                                   |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`                      | `'default'`                              | 不是本层的选项，是 Docusaurus 注入的插件实例 id；主题层只有一份 `ColorModeToggle`，读的是 `default` 那一个实例的那一格 |
| `userApi`                 | 空串 = 不启用                            | 用户信息接口地址，本层用 `fetch` 取它                                                                                  |
| `enableHostname`          | `''`                                     | 只在这个 hostname 下启用                                                                                               |
| `fields`                  | `id` / `name` / `displayName` / `avatar` | 接口返回里那四样各叫什么名字                                                                                           |
| `anonymousName`           | `'未命名'`                               | 接口没给名字时菜单里用这一串                                                                                           |
| `defaultAvatar`           | `''`                                     | 接口没给头像地址时的替代图；空串时接口没头像就不画                                                                     |
| `request`                 | 300 / 300 / `true` / `'avatar-user'`     | 交给 `ahooks` 的 `useRequest`：防抖、节流、首次是否立刻发、缓存键                                                      |
| `menu.profileLabelPrefix` | `'用户：'`                               | 个人中心那一行接在名字前面的前缀                                                                                       |
| `menu.profileHref`        | 空串 = 不出这一行                        | 个人中心地址                                                                                                           |
| `menu.logoutText`         | `'退出登录'`                             | 退出登录那一行的文字                                                                                                   |
| `menu.logoutHref`         | 空串 = 不出这一行                        | 退出登录地址                                                                                                           |
| `menu.logoutTarget`       | `'_self'`                                | 退出登录那一条的开法                                                                                                   |

写了不认得的格（例如把 `userApi` 打成 `userAPI`）红在加载配置那一句，报错点名到那一格与它
能收的名单；类型写歪（`debounceWait` 给了串、`request` 给了数组）同样红在这里。

## 层栈

本层提供 `theme/ColorModeToggle/index.tsx`：拿官方那一份（`@theme-init/ColorModeToggle`；
仓库里只有本层提供这一格，没有要串的链）原样渲染，只在它后面多摆那颗头像。所以本站若自己
swizzle 了同一格，站点那一份压过本层（官方别名「全局赢家」那条规则）。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](/plugin-prev-layer-resolver/)。

## 工作方式

- 配置在**配置期**判完并补齐缺省（`src/config.mts`），交给 Docusaurus 的插件全局数据；
  浏览器侧那一层用官方的 `usePluginData(包名)` 取回它。
- 头像与菜单是 `components/avatar.tsx`：接口取回的那一份按 `fields` 那格的字段名读，
  `id` 那格有值才画（它是数字也认），名字与头像只认字符串。
- 请求走 [`ahooks`](https://ahooks.js.org/) 的 `useRequest`，节流与缓存参数由站点的 `request`
  那格给；服务端渲染那一次不发请求（那时没有 `location`，`enableHostname` 按不命中处理）。
- 样式一行都不写：用的全是 Infima 已有的类名（`avatar__photo`、`dropdown`），
  所以本层没有 `getClientModules()`，也没有自己的样式表。
- 主题层与 `components/` 是未编译的 `.tsx`，随包发布、由用它们的站点编译；
  本包只编译 `src/` 那两份（`pnpm build` → `dist/`）。

## 已知限制

- 接口必须是**同源可直接 `fetch`** 的那一种，且返回 JSON。要带自定义请求头（例如令牌）的站点
  请让 `userApi` 指向自己那层代理，本层不代它拼请求头。
- 不做登录流程：这一层只读「现在是谁」，退出登录那一条只是一个链接。
- 菜单文案与字段名有缺省，但**头像接口返回的形状**没有协商：`fields` 那格对不上时，
  结果就是取不到 `id`、头像不出现，界面上没有「接口不通」那种提示。
- 下拉是 hover 展开（`dropdown--hoverable`，Infima 的纯 CSS 行为），没有点击展开的键盘可达路径。

## 相关文档

- [`plugin-prev-layer-resolver` 的 README](/plugin-prev-layer-resolver/)：`@theme-prev/*` 的语义与层栈。
- [示例页](./docs/avatar-demo.md)：本站这一层的实际状态，以及看不到头像的三种情况。
- [`ahooks` 的 `useRequest`](https://ahooks.js.org/zh-CN/hooks/use-request/index)：`request` 那一格能写的参数。
