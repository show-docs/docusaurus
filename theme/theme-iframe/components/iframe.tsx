import { useMemo } from 'react';

import { useLocation } from '@docusaurus/router';
import useIsBrowser from '@docusaurus/useIsBrowser';

import './iframe.css';

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

  return <iframe className={'iframe'} src={url} title="其他文档" />;
}
