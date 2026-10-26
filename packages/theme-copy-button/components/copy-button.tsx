import { toast } from 'sonner';

const ACCESSIBLE_NAME = '复制当前页地址';
const SUCCESS_MESSAGE = '已复制当前页地址';
const FAILURE_MESSAGE = '复制失败';

/**
把此刻地址栏里那份地址写进剪贴板，成败都给一条提示。

`navigator.clipboard` 只在这个页面是安全上下文（https，或 localhost）时才存在，
用 http 打开的站点拿到的就是 `undefined` —— 这一格要单独判，不能只靠 `catch`。
*/
async function copyPageUrl(): Promise<void> {
  if (!navigator.clipboard) {
    toast.error(FAILURE_MESSAGE);
    return;
  }
  try {
    await navigator.clipboard.writeText(
      decodeURIComponent(window.location.href),
    );
    toast.success(SUCCESS_MESSAGE);
  } catch (error) {
    toast.error(FAILURE_MESSAGE);
    console.error(error);
  }
}

/**
页脚那一格右侧的按钮：图标是 `styles/copy-button.css` 里 `.gg-copy` 画出来的那一份，
按钮自己不带文字，读屏拿到的名字是 `aria-label` 那一句。用 `<button>` 而不是一个可点的
`<span>`，键盘才按得动；图标那一格是纯装饰，标 `aria-hidden` 让读屏跳过它。
*/
export function CopyButton() {
  return (
    <button
      type="button"
      className="footer-copy-btn"
      aria-label={ACCESSIBLE_NAME}
      onClick={copyPageUrl}
    >
      <span className="gg-copy" aria-hidden="true" />
    </button>
  );
}
