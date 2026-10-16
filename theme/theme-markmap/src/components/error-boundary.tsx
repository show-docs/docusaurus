import { Component } from 'react';

import type { ReactNode } from 'react';

import Admonition from '@theme/Admonition';

interface Props {
  children?: ReactNode;
}

interface State {
  failed: boolean;
}

// 思维导图整棵子树（含懒加载 chunk）的兜底：渲染失败时退回可见提示，
// 而不是让整个文档页白屏。
export class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  constructor(props: Props) {
    super(props);
    this.state = { failed: false };
  }

  override componentDidCatch(error: unknown): void {
    console.error('[theme-markmap] 思维导图渲染失败：', error);
  }

  override render(): ReactNode {
    const { failed } = this.state;
    const { children } = this.props;

    if (failed) {
      return (
        <Admonition title="思维导图渲染失败" type="danger">
          本文标记了 markmap，但导图初始化出错，请查看浏览器控制台。
        </Admonition>
      );
    }

    return children;
  }
}
