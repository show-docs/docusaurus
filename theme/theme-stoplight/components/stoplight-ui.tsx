import './stoplight-ui.css';
import '@stoplight/elements/styles.min.css';

import { API } from '@stoplight/elements';

import useIsBrowser from '@docusaurus/useIsBrowser';

// 内联的 OpenAPI 文档：`API` 那一支收 `string | object`（字符串由它自己按 JSON/YAML 解析）。
type ApiDocument = string | Record<string, unknown>;

// `APIProps` 本身是「给地址」与「给内联文档」两支的并集 —— 两个 prop 同时出现就不落在
// 任何一支上，所以入参也按这两支写，组件里按 `url` 分叉，而不是把另一支显式传 `undefined`。
type Props =
  | { basePath?: string; data?: undefined; url: string }
  | { basePath?: string; data: ApiDocument; url?: undefined };

const shared = { hideExport: true, router: 'hash' } as const;

export function StoplightUI(props: Props) {
  const { basePath = '/' } = props;
  const isBrowser = useIsBrowser();

  if (!isBrowser) {
    return null;
  }

  // 两支各自只把自己那一格交给 `API`。这里判 `=== undefined` 而不是取反：`url` 是 `string`，
  // 空串也算假，按真假收窄就退不回第二支（TS 收窄并集要按字面量比）。空串本来到不了这里 ——
  // 层里那支是 `frontMatter.oas3` 取真才渲染本组件的。
  return (
    <div className="stoplight-root">
      {props.url === undefined ? (
        <API
          apiDescriptionDocument={props.data}
          basePath={basePath}
          {...shared}
        />
      ) : (
        <API apiDescriptionUrl={props.url} basePath={basePath} {...shared} />
      )}
    </div>
  );
}
