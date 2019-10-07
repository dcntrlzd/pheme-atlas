import Pheme from '@pheme-kit/core';
import * as ethers from 'ethers';
import * as Logger from 'bunyan';

import { AtlasConfig, AtlasIPFSEndpoints } from './types';

export function createProvider({ config }: { config: AtlasConfig }) {
  const { ethereum: ethereumConfig } = config;
  const defaultProviders = ['homestead', 'rinkeby', 'ropsten', 'kovan', 'goerli'];
  if (defaultProviders.includes(ethereumConfig.provider)) {
    return ethers.getDefaultProvider(ethereumConfig.provider);
  }
  return new ethers.providers.JsonRpcProvider(ethereumConfig.provider);
}

export default async function createPheme({
  config,
  ipfs,
  logger,
}: {
  logger: Logger;
  config: AtlasConfig;
  ipfs: AtlasIPFSEndpoints;
}): Promise<Pheme> {
  logger.info('Connecting to ethereum provider.');

  const provider = createProvider({ config });

  const pheme = Pheme.create({
    providerOrSigner: provider,
    contractAddress: config.ethereum.registryAddress,
    ipfsApiUrl: ipfs.ipfsRpcUrl,
    ipfsGatewayUrl: ipfs.ipfsGatewayUrl,
  });

  const { chainId: networkId } = await provider.getNetwork();

  logger.info('Validating configuration.');

  await pheme.registry
    .getHandleCount()
    .execute()
    .catch(() => {
      throw new Error(`Contract not found at network ${networkId}`);
    });

  logger.info('Pheme connection initialized');
  return pheme;
}
