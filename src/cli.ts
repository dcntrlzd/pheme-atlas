import * as fs from 'fs';
import * as path from 'path';
import * as Logger from 'bunyan';

import PhemeAtlas from './lib/atlas';

const logger = Logger.createLogger({
  name: 'atlas',
  stream: process.stdout,
  level: 'info',
});

const { CONFIG, CONFIG_PATH, IPFS_REPO_FALLBACK } = process.env;
const config: any = JSON.parse(
  CONFIG || fs.readFileSync(path.resolve(__dirname, CONFIG_PATH)).toString()
);

if (IPFS_REPO_FALLBACK && (!config.ipfs || !config.ipfs.repositoryPath)) {
  if (!config.ipfs) config.ipfs = {};
  if (!config.ipfs.repositoryPath) config.ipfs.repositoryPath = IPFS_REPO_FALLBACK;
}

PhemeAtlas.create(config, logger).then(atlas => {
  atlas.start();
});
