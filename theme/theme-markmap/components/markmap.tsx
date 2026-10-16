import { Toolbar } from 'markmap-toolbar';
import * as markmap from 'markmap-view';

import { useEffect, useRef } from 'react';

import { useColorMode } from '@docusaurus/theme-common';
import Admonition from '@theme/Admonition';

import type { MarkmapData } from '../src/types.mts';

const { Markmap, loadCSS, loadJS, deriveOptions } = markmap;

interface Props {
  data: MarkmapData;
}

export function MindChart({ data }: Props) {
  const container = useRef<SVGSVGElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const { colorMode } = useColorMode();

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

    // 工具条默认带的「切换暗色」按钮改的是 `<html>` 上的 `markmap-dark` 类（全站生效，
    // 离开本页也不还原），而本组件的明暗本来就跟着站点主题走，所以这个按钮不挂出来。
    const bar = Toolbar.create(mm);
    bar.setItems(Toolbar.defaultItems.filter((item) => item !== 'dark'));

    toolbar.current!.append(bar.el);

    return () => {
      mm.destroy();
    };
  }, [data, options, root, scripts, styles]);

  return (
    // markmap 的暗色口径是「祖先带 `markmap-dark`」的一组 CSS 变量（`.markmap-dark .markmap`、
    // `.markmap-dark .mm-toolbar`），所以这里跟着站点的明暗把这个类挂在自己这一层，
    // 不外溢到 `<html>`。
    <div className={colorMode === 'dark' ? 'markmap-dark' : undefined}>
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
