// 失败路径的夹具：生成器自己抛一条 `Error`。
export default function generate() {
  throw new Error('这份模型里没有 record_date');
}
