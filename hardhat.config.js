import { defineConfig } from 'hardhat/config';
import HardhatEthersPlugin from '@nomicfoundation/hardhat-ethers';
import HardhatNetworkHelpersPlugin from '@nomicfoundation/hardhat-network-helpers';
import HardhatNodeTestRunnerPlugin from '@nomicfoundation/hardhat-node-test-runner';

export default defineConfig({
  plugins: [HardhatEthersPlugin, HardhatNetworkHelpersPlugin, HardhatNodeTestRunnerPlugin],
  solidity: {
    version: '0.8.20',
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: 'contracts',
    tests: 'test',
  },
});
