import { ErDiagram } from 'erdiagram';

import { useEffect, useRef } from 'react';

import type { DbmlModel } from '../src/types.mts';

import css from './erd-chart.module.css';

interface Props {
  data: DbmlModel;
}

export function ErdChart({ data }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 容器在本次渲染后才挂载，而 effect 一定跑在 DOM 落位之后 —— 断言的是这个不变量
    const erd = new ErDiagram({
      container: container.current!,
      width: container.current!.clientWidth,
      height: container.current!.clientHeight,
      scaling: { max: 3 },
      virtual: true,
    });

    erd.fromJSON(data);
    // 布局宽 2000，超出容器的节点会被虚拟渲染直接跳过；先缩到看得见全部表的大小。
    erd.zoomToFit({ padding: 24, maxScale: 1 });

    return () => {
      erd.dispose();
    };
  }, [data]);

  return <div ref={container} className={css.erd} />;
}
