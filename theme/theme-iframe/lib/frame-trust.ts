/**
这条消息是不是从 `expectedSource` 那个窗口、同一个源发来的。

两个方向都过这一格：外层只收自己那个 iframe 的，框内只收装载它的父窗口的。别人手工拼进
地址栏的那一条、以及页面上任何第三方脚本发的消息，都进不到这条路里。

这一格单独成一份文件：它引浏览器的 `MessageEvent` / `Window`，而 `frame-messages.ts` 与
注册表那条链要**配置期也能类型检查**（三条 API 层的入口在 node-bundle 的 `lib` 下编译，
那里没有 DOM）—— 形状的产地仍记在 `docs/iframe-protocol.md`，只是这一条校验按环境分了家。
*/

export function isTrustedMessage(
  event: MessageEvent,
  expectedSource: Window | null,
  origin: string,
): boolean {
  return event.source === expectedSource && event.origin === origin;
}
