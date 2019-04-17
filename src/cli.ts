import * as fs from 'fs';
import * as path from 'path';
import * as Logger from 'bunyan';

import { run } from './lib/atlas';

const logger = Logger.createLogger({
  name: 'atlas',
  stream: process.stdout,
  level: 'info',
});

const { CONFIG, CONFIG_PATH } = process.env;
const config: any = JSON.parse(
  CONFIG || fs.readFileSync(path.resolve(__dirname, CONFIG_PATH)).toString()
);

run(logger, config).then(atlas => atlas.start());
