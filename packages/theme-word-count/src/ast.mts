/**
带 `children` 的语法树递归遍历，`measure.mts`（数词时逐节点走）与 `remark/word-count.mts`
（渲染时逐节点改写指令）共用这一份走法 —— 两处各写一遍「取 children、下钻」迟早会漂。

只管走树，不掺各层自己的逻辑：`visit` 拿到每个子节点、它在父里的下标与父节点本身。
- `measure` 按类型累加计数（并从没被替换的节点上读 `parent` / `index` 判「这是标题末尾那一格」）。
- remark 插件用 `(node, index, parent)` 就地把指令节点换成组件节点。

`visit` 返回 `false` 表示**不要再下钻这个节点的子树**（两处都用来「指令换出来的是空组件，
它原来的正文既不该渲染、也不该计入词数」）；返回其它值照常下钻。

`children` 允许 `readonly`（measure 的树是只读的）；插件自己那份是可写数组，赋值 `parent.children[i]`
在它的 `visit` 里做，`walkAst` 本身只读不写，所以对两种树都成立。
*/

interface HasChildren<T> {
  children?: readonly T[];
}

/**
前序遍历 `root` 的所有子孙（不含 root 自己 —— 它的类型对两处都是无意义的容器）：
对每个子节点先 `visit`，`visit` 不返回 `false` 时才下钻它的子树。
*/
export function walkAst<T extends HasChildren<T>>(
  root: T,
  visit: (node: T, index: number, parent: T) => boolean | undefined,
): void {
  root.children?.forEach((child, index) => {
    if (visit(child, index, root) === false) {
      return;
    }
    walkAst(child, visit);
  });
}
