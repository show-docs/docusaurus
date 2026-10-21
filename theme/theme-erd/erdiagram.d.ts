// `erdiagram` 没带类型声明，这里只补本仓用到的那几个成员（构造、导入模型、销毁）。
// 声明放在包根：根 `tsconfig.json` 收得到它；包自己的 `tsconfig.build.json` 只编译 `src/`，
// 而 `src/` 里没有浏览器侧的 import，用不到这一份。
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
