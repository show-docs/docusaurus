// 失败路径的夹具：生成器抛的**不是** `Error`（这一族里 `@dbml/core` 就常这么抛）。
const failure = '这份模型里没有我要的字段';

export default function generate() {
  throw failure;
}
