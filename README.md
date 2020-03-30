# Pheme Atlas

Atlas is an application for keeping a copy of https://github.com/dcntrlzd/pheme-kit installations in an IPFS server.

A docker image for it can be found at https://hub.docker.com/repository/docker/dcntrlzd/pheme-atlas

## How to run with Docker
1. Fill the `CONFIG` environment variable based on your setup, following the example below.
```
{
  "ipfs": {
    "rpcUrl":"YOUR_IPFS_RPC_URL", "gatewayUrl":"YOUR_IPFS_GATEWAY_URL"
  },
  "ethereum": {
    "provider":"YOUR_ETHEREUM_RPC_URL","registryAddress":"PHEME_KIT_REGISTRY_CONTRACT_ADDRESS"
  }
}'
```
2. Then run the docker container.


