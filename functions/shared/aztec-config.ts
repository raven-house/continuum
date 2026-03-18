export const DEVNET = {
  name: 'devnet',
  environment: 'devnet',
  network: {
    nodeUrl: 'https://v4-devnet-2.aztec-labs.com',
    l1RpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    l1ChainId: 11155111,
  },
  settings: {
    skipSandbox: true,
    version: '4.0.0-devnet.2-patch.1',
  },
  timeouts: {
    deployTimeout: 1200000,
    txTimeout: 180000,
    waitTimeout: 60000,
  },
}

export const SANDBOX = {
  name: 'sandbox',
  environment: 'local',
  network: {
    nodeUrl: 'http://localhost:8080',
    l1RpcUrl: 'http://localhost:8545',
    l1ChainId: 31337,
  },
  settings: {
    skipSandbox: false,
    version: '4.0.0-devnet.2-patch.1',
  },
  timeouts: {
    deployTimeout: 120000,
    txTimeout: 60000,
    waitTimeout: 30000,
  },
}

export const TESTNET = {
  name: 'sandbox',
  environment: 'local',
  network: {
    nodeUrl: 'http://localhost:8080',
    l1RpcUrl: 'http://localhost:8545',
    l1ChainId: 31337,
  },
  settings: {
    skipSandbox: false,
    version: '4.0.0-devnet.2-patch.1',
  },
  timeouts: {
    deployTimeout: 120000,
    txTimeout: 60000,
    waitTimeout: 30000,
  },
}
