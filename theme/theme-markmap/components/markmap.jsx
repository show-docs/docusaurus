import './markmap.css';
import 'markmap-toolbar/dist/style.css';

import { Toolbar } from 'markmap-toolbar';
import * as markmap from 'markmap-view';

import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';

import Admonition from '@theme/Admonition';

const { Markmap, loadCSS, loadJS, deriveOptions } = markmap;

const empty = {};

export function MindChart({ data = empty }) {
  const container = useRef();
  const toolbar = useRef();

  const { styles, scripts, root, frontmatter: fm } = data;

  const draft = fm?.draft;
  // md 的 `markmap: true` 只是开关；写成对象时它同时是 markmap 的渲染选项
  const options =
    fm?.markmap && typeof fm.markmap === 'object' ? fm.markmap : undefined;

  useEffect(() => {
    if (styles) {
      loadCSS(styles);
    }

    if (scripts) {
      loadJS(scripts, { getMarkmap: () => markmap });
    }

    const mm = Markmap.create(
      container.current,
      options ? deriveOptions(options) : {},
      root,
    );

    const bar = Toolbar.create(mm);

    toolbar.current.append(bar.el);

    return () => {
      mm.destroy();
    };
  }, [data, options, root, scripts, styles]);

  return (
    <>
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
      <div ref={toolbar} className="toolbar-wrapper" />
    </>
  );
}

MindChart.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  data: PropTypes.objectOf(PropTypes.any),
};
