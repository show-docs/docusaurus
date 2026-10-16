import './stoplight-ui.scss';
import '@stoplight/elements/styles.min.css';

import { API } from '@stoplight/elements';

import PropTypes from 'prop-types';

import useIsBrowser from '@docusaurus/useIsBrowser';

export function StoplightUI({ url, data, basePath = '/' }) {
  const isBrowser = useIsBrowser();

  return isBrowser ? (
    <div className="stoplight-root">
      <API
        apiDescriptionDocument={url ? undefined : data}
        apiDescriptionUrl={url}
        basePath={basePath}
        hideExport={true}
        router="hash"
      />
    </div>
  ) : null;
}

StoplightUI.propTypes = {
  url: PropTypes.string,
  data: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  basePath: PropTypes.string,
};
