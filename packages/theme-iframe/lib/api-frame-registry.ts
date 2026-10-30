/**
浏览器侧那一族层的注册表入口 —— 真正的那一份在 `../src/api-frame-registry.ts`。

为什么数据搬去了 `src/`：配置期入口（`src/index.mts` 与 `lib/api-frame-theme.mts`）要按注册表
交出各层那一页，而本包过 `tsc` 的那一份 `rootDir` 是 `src/` —— 注册表留在 `lib/` 里、由入口
相对路径引进去会让构建停在 TS6059。反过来 `lib/` 引 `src/` 没有这条限制：浏览器侧那几个文件由
站点编译（本包不编它们），相对路径指向哪一份 `.ts` 都一样。

这一份因此只做转出，形状与判定函数仍只有一份源码：配置期用的是它的产物（`dist/` 那份），
浏览器期用的是它本身（源码），两边同源、同时生成。包发布时 `src/api-frame-registry.ts` 随
`files` 一起发（`lib/`、`components/`、`theme/` 里的源码编译时要用到它）。
*/

export * from '../src/api-frame-registry.ts';
