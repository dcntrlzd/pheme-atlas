import Pheme from '@pheme-kit/core';
import PhemeRegistry from '@pheme-kit/core/lib/registry';
import PhemeStorageIPFS from '@pheme-kit/storage-ipfs';
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
}): Promise<Pheme<PhemeRegistry>> {
  logger.info('Connecting to ethereum provider.');

  const provider = createProvider({ config });

  const { ethereum: ethereumConfig } = config;
  const { chainId: networkId } = await provider.getNetwork();

  const registry = PhemeRegistry.attach(ethereumConfig.registryAddress, provider);
  logger.info('Validating registry.');

  await registry
    .getHandleCount()
    .execute()
    .catch(() => {
      throw new Error(`Contract not found at network ${networkId}`);
    });
  const ipfsStorage = new PhemeStorageIPFS(ipfs.ipfsRpcUrl, ipfs.ipfsGatewayUrl);

  logger.info('Pheme connection initialized');
  return new Pheme(registry, { ipfs: ipfsStorage });
}
