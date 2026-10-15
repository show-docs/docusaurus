import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

export default function Home() {
  return (
    <Layout title="主题覆盖验证" description="Docusaurus 主题覆盖机制验证">
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1rem' }}>
        <h1>Docusaurus 主题覆盖验证</h1>
        <ul>
          <li>多主题覆盖同一组件会怎样？</li>
          <li>
            <code>@theme-original</code> 能实现链式包裹吗？
          </li>
        </ul>
        <p>
          <Link to="/docs/intro">查看结论 →</Link>
        </p>
      </main>
    </Layout>
  );
}
