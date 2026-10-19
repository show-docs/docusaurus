import './redoc-ui.css';

import { RedocStandalone } from 'redoc';
import { HashRouter } from 'react-router';
import { StyleSheetManager } from 'styled-components';

import useIsBrowser from '@docusaurus/useIsBrowser';

import { REDOC_ROOT_CLASS, scopeRedocStyles } from './redoc-style-scope.ts';

// `RedocStandalone` 那一支收「地址」或「文档本身」：`spec` 可以是解析好的对象、
// 也可以是 YAML/JSON 文本（它自己按内容判型）。
type SpecDocument = Record<string, unknown> | string;

// 与 theme-stoplight 同一个取舍：两个 prop 同时出现就不落在任何一支上，所以入参写成并集，
// 组件里按 `url` 分叉，而不是把另一支显式传 `undefined`。
type Props =
  { data?: undefined; url: string } | { data: SpecDocument; url?: undefined };

// `disableTelemetry`：`redoc` 的依赖里挂着 `@redocly/redoc-opentelemetry`，默认会把文档标题
// 之类的用量报出去。本仓的示例页全在本地（`/openapi.yaml`），也不该往第三方发东西。
const options = { disableTelemetry: true } as const;

// 数组写成模块级的常量：`StyleSheetManager` 按 props 认这张样式表，每次渲染换一个新数组就
// 等于换一张表，Redoc 的规则会被重新插一遍。
const stylisPlugins = [scopeRedocStyles];

export function RedocUI(props: Props) {
  const isBrowser = useIsBrowser();

  if (!isBrowser) {
    return null;
  }

  // 两支各自只把自己那一格交给 `RedocStandalone`（`spec` 与 `specUrl` 同时给时它按 `spec` 走，
  // 但类型上那是「两个 prop 都出现」的第三形状，不收）。判 `=== undefined` 而不是取反：
  // `url` 是 `string`，空串也算假，按真假收窄就退不回第二支。
  //
  // 外面这一层 `HashRouter` 是本层的路由口径，理由见包 README 的「深链」一节：
  // `RedocStandalone` 自己不带 `router` 选项，它只在**没有外层路由**时补一个按路径的
  // `BrowserRouter`。地址改成 `#/…` 之后，那条接口的地址在静态产物里就是真的
  // （页面本身是 `build/redoc-demo/index.html`，hash 不参与取文件），不用再靠 404 页接。
  // `basePath` 也不用传了：hash 里只剩 `/orders/…`，`RedocStandalone` 默认的 `/` 就对。
  //
  // `react-router` 必须与 `redoc` 内部用的是**同一个模块实例**，否则它那句
  // `useInRouterContext()` 读不到这里的 context，还是会自己造一个按路径的路由。
  //
  // `StyleSheetManager` 同一个道理：它靠 React context 把中间件递给 styled-components，
  // 只有和 `redoc` 用**同一份** styled-components 才接得上（`package.json` 里那份
  // `styled-components` 与 `redoc` 自己声明的是同一条版本线）。圈定规则本身写在
  // `redoc-style-scope.ts`，口径与实测数据记在包 README 的「样式：运行期圈定」一节。
  return (
    <div className={REDOC_ROOT_CLASS}>
      <HashRouter>
        <StyleSheetManager stylisPlugins={stylisPlugins}>
          {props.url === undefined ? (
            <RedocStandalone options={options} spec={props.data} />
          ) : (
            <RedocStandalone options={options} specUrl={props.url} />
          )}
        </StyleSheetManager>
      </HashRouter>
    </div>
  );
}
