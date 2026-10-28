/**
主题默认配置。所有业务相关参数均在此声明，
用户可在 docusaurus.config.js 中通过插件 options 覆盖。

@typedef {Object} AvatarThemeConfig
@property {string} [enableHostname] 仅在该 hostname 下启用头像组件；为空字符串时不做限制（始终启用）。
@property {string} [userApi] 获取用户信息的接口地址。
@property {Object} [request] ahooks useRequest 的请求配置。
@property {Object} [fields] 用户接口返回字段到内部用途的映射。
@property {string} [anonymousName] 未获取到用户名时的占位名。
@property {string} [defaultAvatar] 未获取到头像时的默认地址。
@property {Object} [menu] 下拉菜单的配置项。
*/

export const PLUGIN_NAME = '@show-docs/docusaurus-theme-avatar';

export const DEFAULT_CONFIG = {
  // 仅在该 hostname 下启用头像组件；设为 '' 则不做限制
  enableHostname: '',
  // 获取用户信息的接口
  userApi: '/api/user',
  // ahooks useRequest 请求配置
  request: {
    debounceLeading: true,
    debounceWait: 300,
    throttleWait: 300,
    cacheKey: 'user-info',
  },
  // 用户接口返回字段映射
  fields: {
    id: 'id',
    name: 'name',
    displayName: 'displayName',
    avatar: 'avatar',
  },
  // 未命名时的占位名
  anonymousName: '未命名',
  // 默认头像地址
  defaultAvatar: '',
  // 下拉菜单配置
  menu: {
    profileLabelPrefix: '用户：',
    profileHref: 'https://example.com',
    logoutText: '退出登录',
    logoutHref: 'https://example.com/logout',
    logoutTarget: '_self',
  },
};

/**
深合并用户配置与默认配置（用户配置优先）。
@param {Object} defaults 默认配置
@param {Object} [overrides] 用户覆盖配置
@returns {Object} 合并后的配置
*/
export function mergeConfig(defaults, overrides = {}) {
  const result = Array.isArray(defaults) ? [...defaults] : { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeConfig(result[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
