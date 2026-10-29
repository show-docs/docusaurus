/**
导航栏右侧那颗头像：从站点的用户信息接口取当前用户，取到了才画。

这一份是**源码**，由用它的站点编译（理由见 `../src/index.mts` 头上那段）。入参 `config` 是
配置期校验过的那一份（`types/avatar-config.ts`），从插件全局数据里取 —— 取那一格的动作放在
`theme/ColorModeToggle/index.tsx`，这一份自己不碰全局数据，好让它能被单独拿来测。

出现的条件三条都在这儿判：站点写了 `userApi`、浏览器已经接上（服务端渲染没有 `location`，
按不命中处理）、以及接口返回里那格用户 id 有值。菜单的两条地址各为空时那一条不出，
两条都空就只剩图片、不再有下拉。
*/

import { useMemo } from 'react';
import type { ReactNode } from 'react';

import useRequest from 'ahooks/es/useRequest';

import useIsBrowser from '@docusaurus/useIsBrowser';
import NavbarItem from '@theme/NavbarItem';

import type { AvatarConfig } from '../types/avatar-config.ts';

/** 接口返回的那一份：字段名由站点的 `fields` 那格决定，所以只认得键、认不出类型。 */
type UserPayload = Record<string, unknown>;

type Props = {
  config: AvatarConfig;
};

/** 那一格是字符串才用：数字、`null`、缺字段一律当「没有」。 */
function textOf(payload: UserPayload | undefined, key: string): string {
  const value = payload?.[key];

  return typeof value === 'string' ? value : '';
}

export function Avatar({ config }: Props): ReactNode {
  const isBrowser = useIsBrowser();
  const {
    enableHostname,
    userApi,
    request,
    fields,
    anonymousName,
    defaultAvatar,
    menu,
  } = config;

  const hostnameMatches =
    !enableHostname || globalThis.location?.hostname === enableHostname;
  const enabled = isBrowser && Boolean(userApi) && hostnameMatches;

  const { data } = useRequest<UserPayload | undefined, never[]>(
    () => fetch(userApi).then((response) => response.json()),
    { ...request, ready: enabled },
  );

  const displayName =
    textOf(data, fields.displayName) ||
    textOf(data, fields.name) ||
    anonymousName;

  const items = useMemo(() => {
    const rows: ReactNode[] = [];

    if (menu.profileHref) {
      rows.push(
        <NavbarItem
          isDropdownItem={true}
          key="profile"
          label={`${menu.profileLabelPrefix}${displayName}`}
          href={menu.profileHref}
        />,
      );
    }

    if (menu.logoutHref) {
      rows.push(
        <NavbarItem
          isDropdownItem={true}
          key="logout"
          html={menu.logoutText}
          href={menu.logoutHref}
          target={menu.logoutTarget}
        />,
      );
    }

    return rows;
  }, [displayName, menu]);

  // 接口的 id 那格可以是数字（自增主键），所以这里判「有没有值」而不是「是不是串」。
  const userId = data?.[fields.id];
  const photo = textOf(data, fields.avatar) || defaultAvatar;

  if (!enabled || !userId || !photo) {
    return null;
  }

  const photoElement = (
    <img
      alt={displayName}
      className="avatar__photo avatar__photo--sm"
      src={photo}
    />
  );

  if (items.length === 0) {
    return <div className="margin-left--md">{photoElement}</div>;
  }

  return (
    <div className="dropdown dropdown--hoverable dropdown--right margin-left--md">
      {photoElement}
      <ul className="dropdown__menu">{items}</ul>
    </div>
  );
}
