import { useMemo } from 'react';

import useRequest from 'ahooks/es/useRequest';

import { useGlobalData } from '@docusaurus/useGlobalData';
import useIsBrowser from '@docusaurus/useIsBrowser';
import NavbarItem from '@theme/NavbarItem';

import { PLUGIN_NAME } from '../config.js';

function AvatarBlock({ config }) {
  const isBrowser = useIsBrowser();
  const { request, userApi, fields, anonymousName, defaultAvatar, menu } =
    config;

  const { data } = useRequest(
    () => fetch(userApi).then((resp) => resp.json()),
    {
      debounceLeading: request.debounceLeading,
      debounceWait: request.debounceWait,
      throttleWait: request.throttleWait,
      cacheKey: request.cacheKey,
      ready: isBrowser,
    },
  );

  const displayName =
    data?.[fields.displayName] || data?.[fields.name] || anonymousName;

  const items = useMemo(
    () =>
      [
        {
          label: `${menu.profileLabelPrefix}${displayName}`,
          href: menu.profileHref,
        },
        {
          html: menu.logoutText,
          href: menu.logoutHref,
          target: menu.logoutTarget,
        },
      ].map((childItemProps) => (
        <NavbarItem
          isDropdownItem={true}
          {...childItemProps}
          key={childItemProps.href}
        />
      )),
    [displayName, menu],
  );

  const userId = data?.[fields.id];
  return isBrowser && userId ? (
    <div className="dropdown dropdown--hoverable dropdown--right margin-left--md">
      <img
        alt="avatar"
        className="avatar__photo avatar__photo--sm"
        src={data?.[fields.avatar] || defaultAvatar}
      />
      <ul className="dropdown__menu">{items}</ul>
    </div>
  ) : null;
}

export function Avatar() {
  const globalData = useGlobalData();
  const config = globalData[PLUGIN_NAME];
  const shouldAuth =
    !config.enableHostname ||
    globalThis.location?.hostname === config.enableHostname;

  return shouldAuth ? <AvatarBlock config={config} /> : undefined;
}
