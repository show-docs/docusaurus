# plugins/postcss-faster-namespace

第三方 PostCSS 插件的 **vendored 副本**，不是本仓写的东西。

## 为什么在仓库里

`theme/theme-stoplight` 的 `configurePostCss()` 要用它把 `@stoplight/elements` 里
`.stoplight-root [data-theme=light|dark]` 这类「作用域在前」的选择器重排成
`[data-theme=…] .stoplight-root`（暗亮属性挂在 `<html>` 上，不重排就一条都不命中）。

上游已经没了：npm 上 `postcss-faster-namespace` 只剩一个空壳名字（`_id` / `time` 之外没有
`versions`，装任何版本都 404），`github.com/sileny/postcss-faster-namespace` 也已删除 ——
同目录那份 `此包已被npm和github删除.txt` 记的就是这件事。所以我们把 `0.0.5` 的 `index.cjs`
抄进仓库，`workspace:^` 指的就是这一份。

## 三条口径

- **保持原样**：不重排风格、不改 API、不「顺手优化」。它不参与本仓的 lint / 类型检查
  （落点见 `eslint.config.mjs` 的 `ignores` 与本目录在 `tsconfig.json` 的 `exclude`），
  理由就是保持与上游可对照。要改行为请在 `theme/theme-stoplight` 那一侧改调用参数。
- **出处**：作者 `silentsun`，MIT，npm 发布于 2022-05-17（`0.0.5`）。`package.json` 是上游原值，
  连 `homepage` / `repository` 那两条指向已删除仓库的 URL 也照抄 —— 它们记录出处，不是可点的链接。
- **调用面**：本仓只用 `getCustomClass` 这一条分支。其它分支（`prefix` / `suffix` 拼类名）
  是从上游带过来的，没有用例覆盖，别当契约用。
