import './redoc-ui.css';

import { RedocStandalone } from 'redoc';

import useIsBrowser from '@docusaurus/useIsBrowser';

// `RedocStandalone` 那一支收「地址」或「文档本身」：`spec` 可以是解析好的对象、
// 也可以是 YAML/JSON 文本（它自己按内容判型）。
type SpecDocument = Record<string, unknown> | string;

// 与 theme-stoplight 同一个取舍：两个 prop 同时出现就不落在任何一支上，所以入参写成并集，
// 组件里按 `url` 分叉，而不是把另一支显式传 `undefined`。
type Props =
  | { basePath?: string; data?: undefined; url: string }
  | { basePath?: string; data: SpecDocument; url?: undefined };

// `disableTelemetry`：`redoc` 的依赖里挂着 `@redocly/redoc-opentelemetry`，默认会把文档标题
// 之类的用量报出去。本仓的示例页全在本地（`/openapi.yaml`），也不该往第三方发东西。
const options = { disableTelemetry: true } as const;

export function RedocUI(props: Props) {
  const { basePath = '/' } = props;
  const isBrowser = useIsBrowser();

  if (!isBrowser) {
    return null;
  }

  // 两支各自只把自己那一格交给 `RedocStandalone`（`spec` 与 `specUrl` 同时给时它按 `spec` 走，
  // 但类型上那是「两个 prop 都出现」的第三形状，不收）。判 `=== undefined` 而不是取反：
  // `url` 是 `string`，空串也算假，按真假收窄就退不回第二支。
  return (
    <div className="redoc-root">
      {props.url === undefined ? (
        <RedocStandalone
          basePath={basePath}
          options={options}
          spec={props.data}
        />
      ) : (
        <RedocStandalone
          basePath={basePath}
          options={options}
          specUrl={props.url}
        />
      )}
    </div>
  );
}
