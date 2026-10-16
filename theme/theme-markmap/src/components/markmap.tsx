import { Toolbar } from 'markmap-toolbar';
import * as markmap from 'markmap-view';

import { useEffect, useRef } from 'react';

import Admonition from '@theme/Admonition';

import type { MarkmapData } from '../types.mts';

const { Markmap, loadCSS, loadJS, deriveOptions } = markmap;

interface Props {
  data: MarkmapData;
}

export function MindChart({ data }: Props) {
  const container = useRef<SVGSVGElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);

  const { styles, scripts, root, frontmatter: fm } = data;

  const draft = fm?.draft;
  // md 的 `markmap: true` 只是开关；写成对象时它同时是 markmap 的渲染选项
  const options =
    fm?.markmap && typeof fm.markmap === 'object' ? fm.markmap : undefined;

  useEffect(() => {
    // 这两处只加载 markmap 转换出来的额外资源（公式、代码高亮之类）。工具条样式与本页
    // 布局样式不在其中：它们由入口的 `getClientModules()` 一起交给站点，样式文件
    // 因此不用跟着 `tsc` 的产物搬一遍。
    if (styles) {
      loadCSS(styles);
    }

    if (scripts) {
      loadJS(scripts, { getMarkmap: () => markmap });
    }

    // 两个 ref 在本组件返回后才挂载，而 effect 一定跑在 DOM 落位之后 —— 断言的是这个不变量
    const mm = Markmap.create(
      container.current!,
      options ? deriveOptions(options) : {},
      root,
    );

    const bar = Toolbar.create(mm);

    toolbar.current!.append(bar.el);

    return () => {
      mm.destroy();
    };
  }, [data, options, root, scripts, styles]);

  return (
    <div>
      {draft ? (
        <Admonition
          className="markmap-admonition"
          title="此文档属于草稿/草案"
          type="note"
        >
          将活跃变更，不会对外展示
        </Admonition>
      ) : undefined}
      <svg className="markmap" ref={container} />
      <div className="toolbar-wrapper" ref={toolbar} />
    </div>
  );
}
