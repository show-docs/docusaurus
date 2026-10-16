import { useMemo } from 'react';

import { useLocation } from '@docusaurus/router';
import useIsBrowser from '@docusaurus/useIsBrowser';

import css from '../../styles/iframe.module.css';

/* globals process */
const notDev = process.env.NODE_ENV !== 'development';

function getURL({ src, search }: { src: string; search: string }): string {
  const path = new URLSearchParams(search).get('path') || '';

  const io = src.startsWith('/')
    ? new URL(src, window.location.origin).href
    : src;

  const url = path ? new URL(path, io).href : io;

  return decodeURIComponent(url);
}

export function FramePage({ src }: { src: string }) {
  const { search } = useLocation();
  const isBrowser = useIsBrowser();

  const url = useMemo(
    () => (isBrowser ? getURL({ src, search }) : src),
    [isBrowser, search, src],
  );

  return notDev ? (
    <iframe className={css.iframe} src={url} title="其他文档" />
  ) : (
    <div className={css.center}>
      本页在开发模式不可用，目标指向：
      <a href={url} rel="noreferrer" target="_blank">
        {url}
      </a>
    </div>
  );
}
