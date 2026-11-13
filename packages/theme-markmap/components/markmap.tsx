import { createToolbar } from '@markmap/toolbar';
import { Markmap, resolveViewOptions } from '@markmap/view';

import { useEffect, useRef } from 'react';

import { useColorMode } from '@docusaurus/theme-common';
import Admonition from '@theme/Admonition';

import type { MarkmapData } from '../src/types.mts';

interface Props {
  data: MarkmapData;
}

export function MindChart({ data }: Props) {
  const container = useRef<SVGSVGElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const chart = useRef<Markmap | null>(null);
  const { colorMode } = useColorMode();
  // 创建那一遍要读到「此刻」的模式，但切换模式不该重建实例（会丢折叠状态）：
  // 用 ref 把最新值递进去，创建 effect 的依赖里因此没有 colorMode。
  const mode = useRef(colorMode);

  const { root, frontmatter: fm } = data;

  const { draft, markmap: rawOptions } = fm;
  // `markmap: true` 只是开关；写成对象时它同时是视图选项。合法性与警告在构建期看过一遍，
  // 这里按 frontmatter 原文再解析一次，拿到的 theme / layout 才是可用的对象。

  // 先同步 ref 再创建实例：同一笔提交里模式与数据一起换时，创建那一遍读到的是新值。
  useEffect(() => {
    mode.current = colorMode;
  }, [colorMode]);

  useEffect(() => {
    const { options } = resolveViewOptions({}, rawOptions);

    options.colorScheme = mode.current;

    const mm = Markmap.create(container.current!, root, options);
    chart.current = mm;

    // 工具条的颜色读 `--mm-*`，这些令牌挂在 `mm.themeClass` 上（同一个 scope 类）；
    // 把类补到工具条上，它才跟导图用同一套配色。
    const bar = createToolbar(mm);
    bar.element.classList.add(mm.themeClass);
    toolbar.current!.append(bar.element);

    return () => {
      chart.current = null;
      // 成对回收：工具条与实例是两棵树，`mm.destroy()` 管不到挂在外面的工具条。
      bar.destroy();
      mm.destroy();
    };
  }, [root, rawOptions]);

  useEffect(() => {
    const mm = chart.current;

    // 创建那一遍已经带着当时的模式；这里只处理「切成另一格」。
    if (mm && mm.options.colorScheme !== colorMode) {
      mm.setOptions({ ...mm.options, colorScheme: colorMode });
    }
  }, [colorMode]);

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
