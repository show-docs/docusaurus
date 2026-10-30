import { packageCategories } from './sidebars-lib.mts';

/**
 `themes/` 这一棵内容根的清单：`themes/` 下每个有 `README.md` 的包占一顶层格，
 判据与扫描逻辑与 `packages/` 那一族同一份（`sidebars-lib.mts`）。

 顶层键 `themes` 是这一份实例（插件 `id: 'themes'`）自己的侧边栏名，与 `packages/`
 那一族那份 `docs` 互不相干：docId 各自相对自己的内容根，两个命名空间不撞。

 第一项是这一族的索引页：`themes/README.md` 就是内容根自己那份 README，落在 `/themes/`。
*/
export default {
  themes: ['README', ...packageCategories('themes')],
};
