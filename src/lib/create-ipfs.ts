import IPFSFactory from 'ipfsd-ctl';
import * as path from 'path';
import * as fs from 'fs';
import * as Logger from 'bunyan';

import {
  ExternalAtlasIPFSConfig,
  EmbeddedAtlasIPFSConfig,
  AtlasConfig,
  AtlasIPFSEndpoints,
} from './types';

export function createIPFSServer(options: {
  repositoryPath: string;
  logger: Logger;
  apiPort?: number;
  gatewayPort?: number;
}): Promise<any> {
  const { repositoryPath, logger, apiPort = 5001, gatewayPort = 8080 } = options;
  return new Promise(async (resolve, reject) => {
    const repoPath = path.resolve(process.cwd(), repositoryPath);
    const factory = IPFSFactory.create({ type: 'go' });

    factory.spawn(
      {
        disposable: false,
        repoPath,
        config: {
          Addresses: {
            API: `/ip4/0.0.0.0/tcp/${apiPort}`,
            Announce: null,
            Gateway: `/ip4/0.0.0.0/tcp/${gatewayPort}`,
            NoAnnounce: null,
            Swarm: ['/ip4/0.0.0.0/tcp/4001', '/ip6/::/tcp/4001'],
          },
        },
      },
      async (error, daemon) => {
        if (!fs.existsSync(repoPath)) {
          // TODO: remove custom version when this PR is released https://github.com/ipfs/js-ipfsd-ctl/pull/308
          logger.info('IPFS repo directory not found. Initializing new repo.');
          await new Promise((initResolve, initReject) =>
            daemon.init(
              {
                directory: repoPath,
              },
              err => {
                return err ? initReject(err) : initResolve();
              }
            )
          );
        } else {
          logger.info('IPFS repo directory found. Cleaning lock files.');
          // TODO: try to improve this logic https://github.com/ipfs/js-ipfsd-ctl/issues/226
          [path.resolve(repoPath, './api'), path.resolve(repoPath, './repo.lock')].forEach(file => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
          });
        }

        await new Promise((startResolve, startReject) =>
          daemon.start(['--migrate'], err => {
            return err ? startReject(err) : startResolve();
          })
        );

        if (error) {
          reject(error);
          return;
        }

        const ipfsdLogger = logger.child({ process: 'go-ipfs' });
        daemon.subprocess.stdout.on('data', data => ipfsdLogger.info(data.toString()));
        daemon.subprocess.stderr.on('data', data => ipfsdLogger.error(data.toString()));

        resolve(daemon);
      }
    );
  });
}

export default async function createIPFS({
  config,
  logger,
}: {
  config: AtlasConfig;
  logger: Logger;
}): Promise<AtlasIPFSEndpoints> {
  const { ipfs: ipfsConfig } = config;
  const shouldUseExternalIPFS = !!(ipfsConfig as ExternalAtlasIPFSConfig).rpcUrl;

  if (shouldUseExternalIPFS) {
    const { rpcUrl, gatewayUrl } = ipfsConfig as ExternalAtlasIPFSConfig;
    logger.info(`Will use provided IPFS: ${rpcUrl}, ${gatewayUrl}`);

    return { ipfsRpcUrl: rpcUrl, ipfsGatewayUrl: gatewayUrl, server: undefined };
  }
  const { repositoryPath } = ipfsConfig as EmbeddedAtlasIPFSConfig;
  logger.info(`Will use embedded IPFS at: ${repositoryPath}`);
  const server = await createIPFSServer({ repositoryPath, logger });

  const ipfsRpcUrl = `http://127.0.0.1:${server.api.apiPort}`;
  const ipfsGatewayUrl = `http://127.0.0.1:${server.api.gatewayPort}`;

  return { ipfsRpcUrl, ipfsGatewayUrl, server };
}
