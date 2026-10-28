import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CONFIG, mergeConfig, PLUGIN_NAME } from './theme/config.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

export default function theme(context, options = {}) {
  const config = mergeConfig(DEFAULT_CONFIG, options);

  return {
    name: PLUGIN_NAME,
    getThemePath() {
      return resolve(currentDir, './theme');
    },
    setGlobalData() {
      return config;
    },
  };
}
