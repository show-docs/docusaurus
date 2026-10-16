'use strict';

const SPACE = ' ';

const index_ = (options) => {
  return {
    postcssPlugin: 'postcss-faster-namespace',
    Rule: (rule) => {
      const {
        prefix,
        suffix,
        separator = '--',
        getCustomClass,
      } = options || {};

      if (!rule.selectors) {
        return rule;
      }

      // skip `keyframes`
      const { parent } = rule;

      if (
        parent &&
        parent.type === 'atrule' &&
        parent.name.includes('keyframes')
      ) {
        return;
      }

      rule.selectors = rule.selectors.map((selector) => {
        return selector
          .split(/,/g)
          .map((sv) => {
            if (typeof getCustomClass === 'function') {
              return getCustomClass({
                prefix,
                suffix,
                selector,
              });
            }

            let result = '';

            const index = sv.indexOf(':');

            // pseudo classes、pseudo elements
            if (index === -1) {
              // nested selectors
              result = sv
                .split(SPACE)
                .map((v) => {
                  const local = suffix ? `${separator}${suffix}` : '';

                  return `${v}${local}`;
                })
                .join(SPACE);
            } else {
              const local = suffix ? `${separator}${suffix}` : '';
              result = `${sv.slice(0, Math.max(0, index))}${local}${sv.slice(index)}`;
            }

            return `${prefix} ${result}`;
          })
          .join('');
      });

      return rule;
    },
  };
};

module.exports = index_;

module.exports.postcss = true;
