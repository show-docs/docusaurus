// `erdiagram` 没带类型声明，这里只补本仓用到的那几个成员（构造、导入模型、销毁）。
//
// 这一份**随包发出去**（`package.json` 的 `files` 里点着它），并由包的类型入口
// （`dist/index.d.mts`）用 `/// <reference path="../erdiagram.d.ts" />` 引进来 ——
// 消费方一加载本包的类型，这份环境声明就进了它的程序，
// `import { ErDiagram } from 'erdiagram'` 于是有类型可用。
// 指令是构建那一步搬进产物的（`scripts/emit-type-references.mjs`：TypeScript 只在源码
// 本身是声明文件时才把 reference 指令写进产物）。
//
// 仓库根的 `tsconfig.json` 也收得到它 —— 本仓自己那份 `components/erd-chart.tsx` 要它。
declare module 'erdiagram' {
  interface ErDiagramOptions {
    container: HTMLElement
    width?: number
    height?: number
    scaling?: { max?: number }
    virtual?: boolean
  }

  export class ErDiagram {
    constructor(options: ErDiagramOptions)
    fromJSON(data: unknown): void
    zoomToFit(options?: { padding?: number; maxScale?: number }): void
    dispose(): void
  }
}
