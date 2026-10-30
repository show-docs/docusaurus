import { packageCategories } from './sidebars-lib.mts';

/**
 `packages/` 这一棵内容根的清单：`packages/` 下每个有 `README.md` 的包占一顶层格，
 扫描逻辑与判据在 `sidebars-lib.mts`（`themes/` 那一族用的是同一份）。

 第一项是主页：内容根的 `README.md` 以 `slug: /` 落到根，所以它排在这份清单的头一格，
 主页那张卡片列表的头一张也是它本身。
*/
export default {
  docs: ['README', ...packageCategories('packages')],
};
