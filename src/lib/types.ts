export interface ExternalAtlasIPFSConfig {
  rpcUrl: string;
  gatewayUrl: string;
}

export interface EmbeddedAtlasIPFSConfig {
  repositoryPath: string;
}

export interface AtlasConfig {
  ipfs: ExternalAtlasIPFSConfig | EmbeddedAtlasIPFSConfig;
  ethereum: { provider: string; registryAddress: string };
}

export interface AtlasIPFSEndpoints {
  ipfsRpcUrl: string;
  ipfsGatewayUrl: string;
  server: any;
}
