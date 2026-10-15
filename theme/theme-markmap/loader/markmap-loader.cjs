'use strict';

const { buildMarkmapData } = require('./markmap-data.cjs');

module.exports = function loader(source) {
  this.cacheable();

  const callback = this.async();

  if (!source) {
    callback(null, 'export default {};');
    return;
  }

  try {
    // 与 md 分支同一份契约：数据一律挂在 `markmap` 键下
    callback(
      null,
      `export default ${JSON.stringify({ markmap: buildMarkmapData(source) })};`,
    );
  } catch (error) {
    callback(error);
  }
};
