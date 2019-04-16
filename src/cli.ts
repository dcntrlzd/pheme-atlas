import { run } from './lib/atlas';
import * as Logger from 'bunyan';

import { AtlasConfig } from './lib/types';

const logger = Logger.createLogger({
  name: 'atlas',
  stream: process.stdout,
  level: 'info',
});

const { CONFIG, CONFIG_PATH } = process.env;
const config: AtlasConfig = JSON.parse(
  CONFIG || fs.readFileSync(path.resolve(__dirname, CONFIG_PATH)).toString()
);

run(logger, config).then(atlas => atlas.start());
