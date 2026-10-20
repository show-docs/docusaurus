/**
注册表那条层的消息约定，带缓存：`createFrameMessages` 每个命名空间只造一次，
反复取是同一个引用（`useOuterFrameSync` / `useInnerFrameSync` 把它放在 effect 依赖里，
引用换了就多一轮拆装监听器）。

薄薄一层为什么单独成文件：`api-frame-registry.ts` 保持**纯数据**，配置期（node-bundle，
没有 DOM）能类型检查；这一份引 `frame-messages.ts` 的形状，只给浏览器侧用。
*/

import type { FrameMessages } from './frame-messages.ts';
import { createFrameMessages } from './frame-messages.ts';

const frameMessagesCache = new Map<string, FrameMessages>();

export function apiFrameMessages(namespace: string): FrameMessages {
  const cached = frameMessagesCache.get(namespace);
  if (cached) {
    return cached;
  }
  const created = createFrameMessages(namespace);
  frameMessagesCache.set(namespace, created);
  return created;
}
