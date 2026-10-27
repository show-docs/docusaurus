// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { CopyButton } from '../packages/theme-copy-button/components/copy-button.tsx';

/**
`theme-copy-button` 那颗按钮的行为（`@vitest-environment jsdom`）：剪贴板在不在、写进去的是
什么、成败各给哪条提示。

提示条那两格走 `sonner`，这里只认「调了哪一个方法」；`sonner` 自己的界面归它那个包。
`navigator.clipboard` 在 jsdom 里默认没有，正好也是 http 站点那一格的现场。
*/

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

// eslint-disable-next-line unicorn/no-global-object-property-assignment -- React act 的环境标记只认 globalThis
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => void> = [];

function renderButton(): HTMLButtonElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(CopyButton));
  });
  mounted.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const button = container.querySelector('button');
  if (!button) {
    throw new Error('CopyButton 没有渲染出 button');
  }
  return button;
}

/** 放干当前这一轮微任务与宏任务队列（点击后 `copyPageUrl` 还在 await）。 */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** 装上/卸下 `navigator.clipboard`：jsdom 默认没有它，而它正是这条用例要摆的两种现场。 */
function withClipboard<T>(clipboard: Clipboard | undefined, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });
  try {
    return run();
  } finally {
    if (descriptor === undefined) {
      delete (navigator as { clipboard?: Clipboard }).clipboard;
    } else {
      Object.defineProperty(navigator, 'clipboard', descriptor);
    }
  }
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount();
  }
  mocks.error.mockReset();
  mocks.success.mockReset();
});

describe('CopyButton：页脚那一格右侧的按钮', () => {
  it('读屏拿到的是一个有名字的按钮，图标本身不进无障碍树', () => {
    const button = renderButton();

    expect(button.getAttribute('aria-label')).toBe('复制当前页地址');
    expect(button.querySelector('.gg-copy')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('点一下把当前页地址原样写进剪贴板，并给成功提示', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>();
    writeText.mockResolvedValue();

    withClipboard({ writeText } as unknown as Clipboard, () => {
      renderButton().click();
    });
    await flush();

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(mocks.success).toHaveBeenCalledWith('已复制当前页地址');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('地址里带百分号编码时照原样复制：不解码，也不因此报错', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>();
    writeText.mockResolvedValue();

    // `%2F` 解码后是 `/`，地址就变了；末尾一个裸 `%` 解码时还会抛 `URIError`
    window.history.replaceState({}, '', '/a%2Fb?q=100%');

    try {
      withClipboard({ writeText } as unknown as Clipboard, () => {
        renderButton().click();
      });
      await flush();

      expect(writeText).toHaveBeenCalledWith(window.location.href);
      expect(window.location.href).toContain('%2F');
      expect(window.location.href).toContain('100%');
      expect(mocks.success).toHaveBeenCalledWith('已复制当前页地址');
      expect(mocks.error).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('没有剪贴板（http 打开的站点）时直接报失败，不去碰它', async () => {
    withClipboard(undefined, () => {
      renderButton().click();
    });
    await flush();

    expect(mocks.error).toHaveBeenCalledWith('复制失败');
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('写入被拒时也报失败，并把原因留在控制台', async () => {
    const failure = new Error('没有权限');
    const writeText = vi.fn<(text: string) => Promise<void>>();
    writeText.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, 'error').mockReturnValue();

    withClipboard({ writeText } as unknown as Clipboard, () => {
      renderButton().click();
    });
    await flush();

    expect(mocks.error).toHaveBeenCalledWith('复制失败');
    expect(consoleError).toHaveBeenCalledWith(failure);
    consoleError.mockRestore();
  });
});
