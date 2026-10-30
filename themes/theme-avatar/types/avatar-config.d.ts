/**
这一层那份配置的**形状**：配置期写它（`src/config.mts` 把站点的插件选项校验成这个样子，
交给 `actions.setGlobalData()`），浏览器期读它（`theme/ColorModeToggle/index.tsx` 从全局数据里
取出这一格，`components/avatar.tsx` 按它画头像与菜单）。

形状单独占一份 `.d.ts` 的理由与本仓别的地方一样：`src/` 要过 `tsc`（`rootDir` 是 `src/`），
相对路径引到包根以外的源码会让构建停在 TS6059；而 `theme/` 与 `components/` 是不经 `tsc` 的
源码，由用它们的站点编译。`.d.ts` 不参与产出、`rootDir` 不管它，两侧于是能引同一份声明，
不必各写一遍。
*/

/** 请求那几格：原样交给 `ahooks` 的 `useRequest`（节流、防抖与缓存键）。 */
export type AvatarRequestConfig = {
  /** 防抖的第一次要不要立刻发（`ahooks` 的 `debounceLeading`）。 */
  debounceLeading: boolean
  /** 防抖等多久（毫秒）。 */
  debounceWait: number
  /** 节流等多久（毫秒）。 */
  throttleWait: number
  /** 浏览器里那份请求缓存的键。 */
  cacheKey: string
}

/** 用户接口返回里那四样东西各叫什么名字：接口换了字段名，站点改这一格即可。 */
export type AvatarFields = {
  /** 用户 id：接口没返回这一格（或值为空）就当没登录，头像不出现。 */
  id: string
  /** 备用名：`displayName` 那格空着时用它。 */
  name: string
  /** 菜单里显示的名字。 */
  displayName: string
  /** 图片地址。 */
  avatar: string
}

/** 下拉菜单那两条：地址为空串就没有那一条。 */
export type AvatarMenuConfig = {
  /** 个人中心那一行的前缀，接在名字前面。 */
  profileLabelPrefix: string
  /** 个人中心地址：空串 = 不出这一行。 */
  profileHref: string
  /** 退出登录那一行的文字。 */
  logoutText: string
  /** 退出登录地址：空串 = 不出这一行。 */
  logoutHref: string
  /** 退出登录那一条的开法（`_self` / `_blank`）。 */
  logoutTarget: string
}

/** 校验之后交给浏览器的那一份：每一格都有值，站点没写的用了缺省。 */
export type AvatarConfig = {
  /** 只在这个 hostname 下启用；空串 = 不做限制。 */
  enableHostname: string
  /** 用户信息接口地址。**空串时这一层整个不启用**（缺省就是空串）。 */
  userApi: string
  /** 接口返回里没有名字时用的占位名。 */
  anonymousName: string
  /** 接口没给头像地址时的替代图；空串 = 不给 `src`。 */
  defaultAvatar: string
  /** 请求那几格。 */
  request: AvatarRequestConfig
  /** 字段名映射。 */
  fields: AvatarFields
  /** 下拉菜单那两条。 */
  menu: AvatarMenuConfig
}

/**
站点在 `docusaurus.config.mjs` 里写下的那一格（还没校验）。

每一格都可以不写：文本、布尔、数字各按自己的缺省补上。`userApi` / `menu.profileHref` /
`menu.logoutHref` 这三格的缺省是空串，而空串在这两层语义里都是「关闭」——
所以「装了这一层但还没接自己的接口」是合法状态，那时头像不出现。
*/
export type AvatarThemeOptions = {
  enableHostname?: string
  userApi?: string
  anonymousName?: string
  defaultAvatar?: string
  request?: Partial<AvatarRequestConfig>
  fields?: Partial<AvatarFields>
  menu?: Partial<AvatarMenuConfig>
}
