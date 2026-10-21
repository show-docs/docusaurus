import {
  DiffFile,
  DiffModeEnum,
  DiffView,
  setEnableFastDiffTemplate,
} from '@git-diff-view/react';

import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { useColorMode } from '@docusaurus/theme-common';

import type { DiffData } from '../src/types.mts';

/**
语法高亮按文件后缀取。没有后缀（`LICENSE` 这类）时按纯文本，未知后缀交给高亮器自己兜底。
*/
function fileLang(fileName: string): string {
  const dot = fileName.lastIndexOf('.');

  return dot === -1 ? 'plaintext' : fileName.slice(dot + 1).toLowerCase();
}

const captionStyle: CSSProperties = {
  marginBottom: '1em',
};

const viewStyle: CSSProperties = {
  height: '100%',
};

export function GitDiffView({ data }: { data: DiffData }): ReactNode {
  const { colorMode } = useColorMode();

  // `git diff` 原文连同改动之前的那份内容一起交给 `DiffFile`：解析与展开都在实例里做，
  // 换一份数据就重建，不做增量。
  const diffFile = useMemo(() => {
    // 逐字符的模板只在这颗开关打开时才算，且要在下面解析 diff 之前设好；它是全局设置，重建实例前再设一遍没有代价。
    setEnableFastDiffTemplate(true);

    const instance = DiffFile.createInstance({
      oldFile: {
        fileName: data.fileName,
        fileLang: fileLang(data.fileName),
        content: data.old,
      },
      hunks: [data.diff],
    });

    instance.initRaw();
    instance.onAllExpand('split');

    return instance;
  }, [data]);

  return (
    <div data-diff-view="true">
      <p style={captionStyle}>
        <code>{data.fileName}</code>{' '}
        最近一次提交的改动；未提交的改动与更早的历史请看代码仓库。
      </p>
      <DiffView
        diffFile={diffFile}
        diffViewHighlight
        diffViewMode={DiffModeEnum.SplitGitHub}
        diffViewTheme={colorMode}
        diffViewWrap
        style={viewStyle}
      />
    </div>
  );
}
