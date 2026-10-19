import './stoplight-ui.css';
import '@stoplight/elements/styles.min.css';

import { API } from '@stoplight/elements';

import useIsBrowser from '@docusaurus/useIsBrowser';

// 交给 `@stoplight/elements` 的那个地址。
type Props = { basePath?: string; url: string };

const shared = { hideExport: true, router: 'hash' } as const;

export function StoplightUI(props: Props) {
  const { basePath = '/' } = props;
  const isBrowser = useIsBrowser();

  if (!isBrowser) {
    return null;
  }

  // 只走「给地址」那一支（`apiDescriptionUrl`）。`APIProps` 本来还有「给内联文档」那支
  // （`apiDescriptionDocument`，收 `string | object`），两支同时出现谁都不落，所以入参原先按
  // 并集写、组件里按 `url` 分叉 —— 现在没有分叉：本层唯一的入参来自 `frontMatter.oas3`，
  // 那是个地址，没有把文档正文塞进 frontmatter 的入口。
  return (
    <div className="stoplight-root">
      <API apiDescriptionUrl={props.url} basePath={basePath} {...shared} />
    </div>
  );
}
